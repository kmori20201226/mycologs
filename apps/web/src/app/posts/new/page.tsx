'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type Event } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

interface FileEntry {
  id: string        // local key
  file: File
  preview: string | null  // object URL for images
}

type SubmitPhase = 'idle' | 'moderating' | 'creating' | 'uploading' | 'done'

interface ModerationWarning {
  category: string
  comment: string
}

function fileIcon(type: string) {
  if (type.startsWith('video/')) return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.847v6.306a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  )
  if (type.startsWith('audio/')) return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
    </svg>
  )
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function NewPostPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const [contents, setContents] = useState('')
  const [eventId, setEventId] = useState<number | ''>('')
  const [events, setEvents] = useState<Event[]>([])
  const [clubEventIds, setClubEventIds] = useState<Set<number>>(new Set())
  const [myEventIds, setMyEventIds] = useState<Set<number>>(new Set())
  const [files, setFiles] = useState<FileEntry[]>([])
  const [phase, setPhase] = useState<SubmitPhase>('idle')
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')
  const [uploadFailCount, setUploadFailCount] = useState(0)
  const [notAuthed, setNotAuthed] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [warning, setWarning] = useState<ModerationWarning | null>(null)
  const [noMediaWarning, setNoMediaWarning] = useState(false)

  useEffect(() => {
    const user = getStoredUser()
    if (!user) { setNotAuthed(true); return }
    const presetEventId = searchParams.get('eventId');

    (async () => {
    const now = new Date()
    const memberClubs = await apiClient.request<{ id: number }[]>('/me/clubs').catch(() => [] as { id: number }[])
    const clubFetches = memberClubs.map((c) => apiClient.getEvents({ clubId: c.id }).catch(() => [] as Event[]))
    const myFetch = apiClient.getEvents({ userId: user.id }).catch(() => [] as Event[])

    Promise.all([Promise.all(clubFetches), myFetch]).then(([clubResults, myEvs]) => {
      const clubEvs = clubResults.flat()
      const clubIds = new Set(clubEvs.map((e) => e.id))
      const myIds = new Set(myEvs.map((e) => e.id))

      const seen = new Set<number>()
      const merged: Event[] = []
      for (const ev of [...clubEvs, ...myEvs]) {
        if (!seen.has(ev.id)) { seen.add(ev.id); merged.push(ev) }
      }

      const past = merged
        .filter((ev) => !ev.startAt || new Date(ev.startAt) <= now)
        .sort((a, b) => {
          const ta = a.startAt ? new Date(a.startAt).getTime() : 0
          const tb = b.startAt ? new Date(b.startAt).getTime() : 0
          return tb - ta
        })

      setClubEventIds(clubIds)
      setMyEventIds(myIds)
      setEvents(past)
      if (presetEventId) {
        const id = Number(presetEventId)
        if (past.some((e) => e.id === id)) setEventId(id)
      }
    })
    })()
  }, [])

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => { files.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview) }) }
  }, [files])

  function addFiles(incoming: FileList | File[]) {
    const entries: FileEntry[] = Array.from(incoming).map((file) => ({
      id: crypto.randomUUID(),
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
    }))
    setFiles((prev) => [...prev, ...entries])
  }

  function removeFile(id: string) {
    setFiles((prev) => {
      const entry = prev.find((f) => f.id === id)
      if (entry?.preview) URL.revokeObjectURL(entry.preview)
      return prev.filter((f) => f.id !== id)
    })
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addFiles(e.target.files)
    e.target.value = ''
  }

  function onDragOver(e: React.DragEvent) { e.preventDefault(); setDragging(true) }
  function onDragLeave() { setDragging(false) }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  async function doCreatePost(confirmedModeration?: ModerationWarning) {
    const user = getStoredUser()
    if (!user) { setNotAuthed(true); return }

    setPhase('creating')
    let postId: number
    const result = await apiClient.createPost({
      userId: user.id,
      contents,
      ...(eventId !== '' ? { eventId: eventId as number } : {}),
      ...(confirmedModeration ? { confirmedModeration } : {}),
    })

    if (!result.ok) {
      if (result.status === 'rejected') {
        setError(`この投稿は公開できません。\n${result.comment}`)
        setPhase('idle')
        return
      }
      if (result.status === 'warning') {
        setWarning({ category: result.category, comment: result.comment })
        setPhase('idle')
        return
      }
    }

    postId = (result as { ok: true; id: number }).id

    // Upload media in parallel
    if (files.length > 0) {
      setPhase('uploading')
      setUploadProgress({ done: 0, total: files.length })

      let failCount = 0
      await Promise.all(
        files.map(async ({ file }) => {
          try {
            await apiClient.uploadPostMedia(postId, file)
          } catch {
            failCount++
          } finally {
            setUploadProgress((prev) => ({ ...prev, done: prev.done + 1 }))
          }
        })
      )
      setUploadFailCount(failCount)
    }

    setPhase('done')
    const qs = uploadFailCount > 0 ? `?uploadErrors=${uploadFailCount}` : ''
    router.push(`/posts/${postId}${qs}`)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const user = getStoredUser()
    if (!user) { setNotAuthed(true); return }
    if (files.length === 0) { setNoMediaWarning(true); return }
    setError('')
    setWarning(null)
    setUploadFailCount(0)
    setPhase('moderating')
    try {
      await doCreatePost()
    } catch {
      setError('投稿の作成に失敗しました。もう一度お試しください。')
      setPhase('idle')
    }
  }

  async function handleConfirmWarning() {
    if (!warning) return
    const w = warning
    setWarning(null)
    setError('')
    setPhase('moderating')
    try {
      await doCreatePost(w)
    } catch {
      setError('投稿の作成に失敗しました。もう一度お試しください。')
      setPhase('idle')
    }
  }

  const submitting = phase !== 'idle'

  const submitLabel = () => {
    if (phase === 'moderating') return '確認中…'
    if (phase === 'creating') return '投稿作成中…'
    if (phase === 'uploading') return `アップロード中 ${uploadProgress.done}/${uploadProgress.total}…`
    return '投稿'
  }

  const warningCategoryLabel: Record<string, string> = {
    POTENTIALLY_OFFENSIVE: '不快な表現の可能性',
    OFF_TOPIC_IMAGE:        'キノコと無関係な内容',
  }

  if (notAuthed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">投稿するにはログインが必要です。</p>
          <Link href="/login" className="text-emerald-600 hover:underline">ログイン</Link>
        </div>
      </div>
    )
  }

  const imageFiles = files.filter((f) => f.file.type.startsWith('image/'))
  const otherFiles = files.filter((f) => !f.file.type.startsWith('image/'))

  return (
    <>
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-xl">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/posts"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            戻る
          </Link>
          <div className="text-sm text-gray-500">
            <Link href="/posts" className="hover:text-emerald-600 transition-colors">投稿一覧</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-800 font-medium">新規投稿</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h1 className="text-lg font-semibold text-gray-900 mb-5">新規投稿</h1>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Contents */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                何を見つけましたか？
              </label>
              <textarea
                value={contents}
                onChange={(e) => setContents(e.target.value)}
                rows={5}
                placeholder="きのこの特徴、見つけた場所、気になる点などを記述してください…"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                required
                disabled={submitting}
              />
            </div>

            {/* Event selector */}
            {events.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  イベント <span className="text-gray-400 font-normal">（任意）</span>
                </label>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  disabled={submitting}
                >
                  <option value="">イベントなし</option>
                  {events.map((ev) => {
                    const isClub = clubEventIds.has(ev.id)
                    const isMine = myEventIds.has(ev.id)
                    const prefix = isClub ? '👨‍👩‍👧‍👧 ' : '😊 '
                    const date = ev.startAt ? `${new Date(ev.startAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} ` : ''
                    return <option key={ev.id} value={ev.id}>{prefix}{date}{ev.name}</option>
                  })}
                </select>
              </div>
            )}

            {/* Drop zone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                写真・ファイル <span className="text-gray-400 font-normal">（任意）</span>
              </label>

              <div
                ref={dropZoneRef}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => !submitting && fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-lg px-4 py-6 text-center cursor-pointer transition-colors
                  ${dragging ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-emerald-300 hover:bg-gray-50'}
                  ${submitting ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-sm text-gray-500">
                  ファイルをドロップ、または<span className="text-emerald-600 font-medium">選択</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">画像、動画、音声、ドキュメント — 各50MBまで</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={onFileInputChange}
                  disabled={submitting}
                />
              </div>

              {/* Image previews */}
              {imageFiles.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {imageFiles.map(({ id, file, preview }) => (
                    <div key={id} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 group">
                      <img src={preview!} alt={file.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                      <button
                        type="button"
                        onClick={() => removeFile(id)}
                        disabled={submitting}
                        className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                        aria-label={`Remove ${file.name}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                      <p className="absolute bottom-0 inset-x-0 bg-black/40 text-white text-xs truncate px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {file.name}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Non-image file list */}
              {otherFiles.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {otherFiles.map(({ id, file }) => (
                    <li key={id} className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-gray-50">
                      {fileIcon(file.type)}
                      <span className="flex-1 text-sm text-gray-700 truncate">{file.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">{formatBytes(file.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(id)}
                        disabled={submitting}
                        className="text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors ml-1"
                        aria-label={`Remove ${file.name}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error && (
              <p className="text-red-500 text-sm whitespace-pre-line">{error}</p>
            )}

            {/* Upload progress bar */}
            {phase === 'uploading' && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>アップロード中…</span>
                  <span>{uploadProgress.done}/{uploadProgress.total}</span>
                </div>
                <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress.total > 0 ? (uploadProgress.done / uploadProgress.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={submitting || contents.trim() === ''}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                {submitLabel()}
              </button>
              {!submitting && (
                <Link href="/posts" className="text-sm text-gray-500 hover:text-gray-700">
                  キャンセル
                </Link>
              )}
            </div>

          </form>
        </div>

      </div>
    </div>

    {/* No media warning dialog */}
    {noMediaWarning && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-yellow-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <h2 className="text-base font-semibold text-gray-900">写真が添付されていません</h2>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">
            きのこの同定には写真が必要です。写真を追加すると、AIや他のユーザーによる同定が可能になります。
          </p>
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => {
                setNoMediaWarning(false)
                setError('')
                setWarning(null)
                setUploadFailCount(0)
                setPhase('moderating')
                doCreatePost().catch(() => { setError('投稿の作成に失敗しました。もう一度お試しください。'); setPhase('idle') })
              }}
              className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              このまま投稿する
            </button>
            <button
              onClick={() => setNoMediaWarning(false)}
              className="flex-1 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg transition-colors"
            >
              写真を追加する
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Moderation warning dialog */}

    {warning && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-yellow-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <div>
              <h2 className="text-base font-semibold text-gray-900">投稿内容の注意</h2>
              <p className="text-xs text-yellow-700 font-medium mt-0.5">
                {warningCategoryLabel[warning.category] ?? warning.category}
              </p>
            </div>
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{warning.comment}</p>
          <p className="text-xs text-gray-500">このまま投稿すると、内容が記録されます。修正することをお勧めします。</p>
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleConfirmWarning}
              className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              このまま投稿する
            </button>
            <button
              onClick={() => setWarning(null)}
              className="flex-1 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg transition-colors"
            >
              修正する
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

export default function NewPostPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <NewPostPageInner />
    </Suspense>
  )
}
