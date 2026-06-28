// Background upload queue. Images are uploaded with limited concurrency +
// compression + retry. The post becomes "media-complete" once its uploaded
// image count reaches expectedMediaCount; the Identify button keys off that.
//
// Durability:
//  - The queue is persisted to IndexedDB (#1), so uploads survive a reload,
//    tab close, or mobile app-switch and resume on the next page load.
//  - Connectivity is tracked (#2): while offline the pump pauses and failures
//    don't burn the retry budget; it auto-resumes when back online.
//
// Multi-tab caveat: IndexedDB is shared across tabs, so two open tabs could each
// rehydrate and re-upload the same pending items (duplicate media). Acceptable
// for now given how rarely the app is used in multiple tabs mid-upload.

import { apiClient } from './api'
import { compressImage } from './compressImage'

const CONCURRENCY = 3
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = 1500
const DONE_LINGER_MS = 4000 // keep a fully-succeeded job visible briefly

export type UploadItemStatus = 'pending' | 'uploading' | 'done' | 'error'

export interface PublicUploadItem {
    id: string
    name: string
    status: UploadItemStatus
}

export interface PublicUploadJob {
    postId: number
    label: string
    total: number
    done: number
    failed: number
    items: PublicUploadItem[]
}

export interface UploadSnapshot {
    jobs: PublicUploadJob[]
    pendingCount: number // pending + uploading, across all jobs
    offline: boolean
    authExpired: boolean // session cookie expired (got a 401); uploads paused until re-login
}

interface InternalItem {
    id: string
    file: File
    name: string
    status: UploadItemStatus
    retries: number
}

interface InternalJob {
    postId: number
    userId: number
    label: string
    items: InternalItem[]
}

// ── IndexedDB persistence (#1) ───────────────────────────────────────────────
const DB_NAME = 'mycologs-uploads'
const STORE = 'items'

interface PersistedRecord {
    id: string
    postId: number
    userId: number
    label: string
    name: string
    file: Blob
    status: UploadItemStatus
    retries: number
}

function openDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null)
    return new Promise((resolve) => {
        const req = indexedDB.open(DB_NAME, 1)
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(STORE)) {
                req.result.createObjectStore(STORE, { keyPath: 'id' })
            }
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
    })
}

function toRecord(job: InternalJob, item: InternalItem): PersistedRecord {
    return {
        id: item.id, postId: job.postId, userId: job.userId, label: job.label,
        name: item.name, file: item.file, status: item.status, retries: item.retries,
    }
}

async function idbPut(rec: PersistedRecord): Promise<void> {
    const db = await openDb()
    if (!db) return
    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(rec)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
    })
}

async function idbDelete(id: string): Promise<void> {
    const db = await openDb()
    if (!db) return
    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
    })
}

async function idbGetAll(): Promise<PersistedRecord[]> {
    const db = await openDb()
    if (!db) return []
    return new Promise((resolve) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
        req.onsuccess = () => resolve((req.result as PersistedRecord[]) ?? [])
        req.onerror = () => resolve([])
    })
}

// Fire-and-forget persistence helpers (never block the upload path).
function persist(job: InternalJob, item: InternalItem) { void idbPut(toRecord(job, item)) }
function unpersist(id: string) { void idbDelete(id) }

// ── State ────────────────────────────────────────────────────────────────────
let jobs: InternalJob[] = []
let active = 0
let online = typeof navigator !== 'undefined' ? navigator.onLine : true
// Set when an upload gets a 401 (the 7-day session cookie expired). Retrying is
// pointless until the user logs in again, so the pump pauses and the widget
// prompts for re-login. A successful login does a full reload, which resets this
// and lets the rehydrated queue resume.
let authExpired = false

const EMPTY_SNAPSHOT: UploadSnapshot = { jobs: [], pendingCount: 0, offline: false, authExpired: false }
let snapshot: UploadSnapshot = EMPTY_SNAPSHOT
const listeners = new Set<() => void>()

function publish() {
    const pubJobs: PublicUploadJob[] = jobs.map((j) => ({
        postId: j.postId,
        label: j.label,
        total: j.items.length,
        done: j.items.filter((i) => i.status === 'done').length,
        failed: j.items.filter((i) => i.status === 'error').length,
        items: j.items.map((i) => ({ id: i.id, name: i.name, status: i.status })),
    }))
    const pendingCount = jobs.reduce(
        (n, j) => n + j.items.filter((i) => i.status === 'pending' || i.status === 'uploading').length,
        0,
    )
    snapshot = pubJobs.length === 0 ? EMPTY_SNAPSHOT : { jobs: pubJobs, pendingCount, offline: !online, authExpired }
    listeners.forEach((l) => l())
}

// ── React store interface (useSyncExternalStore) ─────────────────────────────
export function subscribeUploads(listener: () => void): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
}
export function getUploadSnapshot(): UploadSnapshot { return snapshot }
export function getServerUploadSnapshot(): UploadSnapshot { return EMPTY_SNAPSHOT }

export function enqueueUploads(postId: number, userId: number, label: string, files: File[]): void {
    if (files.length === 0) return
    const job: InternalJob = { postId, userId, label, items: [] }
    job.items = files.map((file, idx) => ({
        id: `${postId}-${idx}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        name: file.name,
        status: 'pending',
        retries: 0,
    }))
    jobs = [...jobs, job]
    job.items.forEach((item) => persist(job, item))
    publish()
    pump()
}

function nextPending(): { job: InternalJob; item: InternalItem } | null {
    for (const job of jobs) {
        for (const item of job.items) {
            if (item.status === 'pending') return { job, item }
        }
    }
    return null
}

function pump() {
    if (!online || authExpired) return
    while (active < CONCURRENCY) {
        const next = nextPending()
        if (!next) break
        active++
        next.item.status = 'uploading'
        publish()
        void runItem(next.job, next.item)
    }
}

async function runItem(job: InternalJob, item: InternalItem) {
    try {
        const compressed = await compressImage(item.file)
        await apiClient.uploadPostMedia(job.postId, compressed)
        item.status = 'done'
        active--
        unpersist(item.id)
        publish()
        scheduleCleanup(job.postId)
        pump()
    } catch (err) {
        active--
        if ((err as { status?: number })?.status === 401) {
            // Session expired. Don't burn a retry or mark the item failed — keep it
            // pending and persisted so it resumes automatically after the user logs
            // back in (login does a full reload that rehydrates this queue).
            authExpired = true
            item.status = 'pending'
            persist(job, item)
            publish()
            return
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            // Offline: requeue without spending a retry; the 'online' handler resumes.
            item.status = 'pending'
            persist(job, item)
            publish()
        } else if (item.retries < MAX_RETRIES) {
            item.retries++
            item.status = 'pending'
            persist(job, item)
            publish()
            setTimeout(pump, RETRY_BACKOFF_MS * item.retries)
        } else {
            item.status = 'error'
            persist(job, item)
            publish()
            pump()
        }
    }
}

// Once a job has no pending/uploading items: if it fully succeeded, drop it after
// a short linger; if some failed, leave it so the widget can offer retry/give-up.
function scheduleCleanup(postId: number) {
    const job = jobs.find((j) => j.postId === postId)
    if (!job) return
    const settled = job.items.every((i) => i.status === 'done' || i.status === 'error')
    if (!settled) return
    if (job.items.some((i) => i.status === 'error')) return
    setTimeout(() => {
        jobs = jobs.filter((j) => j !== job)
        publish()
    }, DONE_LINGER_MS)
}

export function retryJob(postId: number) {
    const job = jobs.find((j) => j.postId === postId)
    if (!job) return
    for (const item of job.items) {
        if (item.status === 'error') { item.status = 'pending'; item.retries = 0; persist(job, item) }
    }
    publish()
    pump()
}

// User gives up on the failed images: reconcile the post's expectedMediaCount
// down to what actually uploaded, so the post becomes media-complete (and the
// Identify button unlocks), then clear the job and its persisted records.
export async function dismissFailed(postId: number) {
    const job = jobs.find((j) => j.postId === postId)
    if (!job) return
    const doneCount = job.items.filter((i) => i.status === 'done').length
    try {
        await apiClient.updatePost(postId, { userId: job.userId, expectedMediaCount: doneCount })
    } catch {
        /* best-effort; the post simply stays incomplete if this fails */
    }
    job.items.forEach((i) => unpersist(i.id))
    jobs = jobs.filter((j) => j !== job)
    publish()
}

// ── Connectivity (#2) ────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => { online = true; publish(); pump() })
    window.addEventListener('offline', () => { online = false; publish() })
}

// ── Rehydrate persisted queue on load (#1) ───────────────────────────────────
if (typeof window !== 'undefined') {
    void idbGetAll().then((recs) => {
        if (recs.length === 0) return
        const byPost = new Map<number, InternalJob>()
        for (const r of recs) {
            // A 'done' record means a prior unpersist didn't land — drop it so it
            // isn't re-uploaded and doesn't create a job that never settles.
            if (r.status === 'done') { unpersist(r.id); continue }
            let job = byPost.get(r.postId)
            if (!job) { job = { postId: r.postId, userId: r.userId, label: r.label, items: [] }; byPost.set(r.postId, job) }
            // Reconstruct a named File so the upload's filename/extension is correct.
            const file = r.file instanceof File ? r.file : new File([r.file], r.name, { type: r.file.type })
            // An upload interrupted mid-flight was left 'uploading' — restart it.
            const status: UploadItemStatus = r.status === 'uploading' ? 'pending' : r.status
            job.items.push({ id: r.id, file, name: r.name, status, retries: r.retries ?? 0 })
        }
        jobs = [...jobs, ...byPost.values()]
        publish()
        pump()
    })
}
