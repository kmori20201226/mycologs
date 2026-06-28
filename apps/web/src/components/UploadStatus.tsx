'use client'

import { useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import {
  subscribeUploads,
  getUploadSnapshot,
  getServerUploadSnapshot,
  retryJob,
  dismissFailed,
} from '@/lib/uploadManager'

export default function UploadStatus() {
  const snapshot = useSyncExternalStore(subscribeUploads, getUploadSnapshot, getServerUploadSnapshot)

  // Warn before leaving while uploads are still in flight (this queue lives only
  // in the page; a reload/close would lose pending uploads).
  useEffect(() => {
    if (snapshot.pendingCount === 0) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [snapshot.pendingCount])

  if (snapshot.jobs.length === 0) return null

  // Aggregate every post's progress into a single bar — multiple concurrent
  // posts share one widget instead of stacking a bar each.
  const total = snapshot.jobs.reduce((n, j) => n + j.total, 0)
  const done = snapshot.jobs.reduce((n, j) => n + j.done, 0)
  const inFlight = snapshot.pendingCount > 0
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  // Posts that have settled with at least one failed image still need per-post
  // retry / give-up, because dismissFailed reconciles a specific post.
  const failedJobs = snapshot.jobs.filter(
    (j) => j.failed > 0 && !j.items.some((i) => i.status === 'pending' || i.status === 'uploading'),
  )

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 space-y-2">
      {snapshot.authExpired ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm shadow-lg">
          <p className="font-medium text-red-800">セッションの有効期限が切れました</p>
          <p className="mt-1 text-xs text-red-700">
            アップロードを続けるには、もう一度ログインしてください。残りの写真はログイン後に自動で再開されます。
          </p>
          <Link
            href="/login"
            className="mt-2 inline-block rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
          >
            ログインする
          </Link>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          {snapshot.offline && snapshot.pendingCount > 0 && (
            <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
              オフラインです。接続が回復すると自動的に再開します。
            </p>
          )}
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-gray-800">
              {inFlight ? '写真をアップロード中…' : 'アップロード完了'}
            </span>
            <span className="shrink-0 text-gray-500">{done}/{total}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full transition-all ${failedJobs.length > 0 && !inFlight ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {failedJobs.length > 0 && (
            <div className="mt-2 space-y-2">
              {failedJobs.map((job) => (
                <div key={job.postId} className="border-t border-gray-100 pt-2">
                  <p className="truncate text-xs text-amber-700" title={job.label}>
                    「{job.label}」の{job.failed}件をアップロードできませんでした。
                  </p>
                  <div className="mt-1.5 flex gap-2">
                    <button
                      onClick={() => retryJob(job.postId)}
                      className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      再試行
                    </button>
                    <button
                      onClick={() => dismissFailed(job.postId)}
                      className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
                    >
                      あきらめる
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
