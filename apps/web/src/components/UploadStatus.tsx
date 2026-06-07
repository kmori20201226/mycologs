'use client'

import { useEffect, useSyncExternalStore } from 'react'
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

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 space-y-2">
      {snapshot.offline && snapshot.pendingCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 shadow-lg">
          オフラインです。接続が回復すると自動的に再開します。
        </div>
      )}
      {snapshot.jobs.map((job) => {
        const inFlight = job.items.some((i) => i.status === 'pending' || i.status === 'uploading')
        const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0
        return (
          <div key={job.postId} className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="truncate font-medium text-gray-800" title={job.label}>{job.label}</span>
              <span className="shrink-0 text-gray-500">{job.done}/{job.total}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full transition-all ${job.failed > 0 && !inFlight ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            {inFlight && (
              <p className="mt-1.5 text-xs text-gray-500">写真をアップロード中…</p>
            )}
            {!inFlight && job.failed > 0 && (
              <div className="mt-2">
                <p className="text-xs text-amber-700">{job.failed}件の写真をアップロードできませんでした。</p>
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
            )}
          </div>
        )
      })}
    </div>
  )
}
