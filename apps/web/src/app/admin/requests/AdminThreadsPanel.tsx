'use client'

import { useEffect, useState } from 'react'
import { apiClient, AdminThread } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

const ADMIN_ROLES = ['ADMIN', 'DEVELOPER', 'MODERATOR']

export default function AdminThreadsPanel({ onRead, onUnreadCountChange }: {
  onRead?: (delta: number) => void
  onUnreadCountChange?: (count: number) => void
}) {
  const [threads, setThreads] = useState<AdminThread[]>([])
  const [selected, setSelected] = useState<AdminThread | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiClient.getAdminThreads()
      .then((data) => {
        setThreads(data)
        const total = data.reduce((sum, t) =>
          sum + t.messages.filter(m => m.readAt === null && !ADMIN_ROLES.includes(m.sender.role ?? '')).length
        , 0)
        onUnreadCountChange?.(total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function openThread(thread: AdminThread) {
    const unreadBefore = thread.messages.filter(m =>
      m.readAt === null && !ADMIN_ROLES.includes(m.sender.role ?? '')
    ).length
    try {
      const full = await apiClient.getAdminThread(thread.id)
      setSelected(full)
      setThreads(prev => prev.map(t => t.id === full.id ? full : t))
      setReplyBody('')
      setError(null)
      if (unreadBefore > 0) onRead?.(unreadBefore)
    } catch {
      setError('スレッドの取得に失敗しました。')
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !replyBody.trim()) return
    setSending(true)
    setError(null)
    try {
      const updated = await apiClient.replyAdminThread(selected.id, replyBody.trim())
      setSelected(updated)
      setThreads(prev => prev.map(t => t.id === updated.id ? updated : t))
      setReplyBody('')
    } catch {
      setError('送信に失敗しました。')
    } finally {
      setSending(false)
    }
  }

  async function handleToggleStatus() {
    if (!selected) return
    setSending(true)
    try {
      const updated = selected.status === 'OPEN'
        ? await apiClient.closeAdminThread(selected.id)
        : await apiClient.openAdminThread(selected.id)
      setSelected(updated)
      setThreads(prev => prev.map(t => t.id === updated.id ? updated : t))
      setError(null)
    } catch {
      setError('ステータスの変更に失敗しました。')
    } finally {
      setSending(false)
    }
  }

  const user = getStoredUser()

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="bg-white rounded-xl shadow p-5 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {selected ? (
        <div className="bg-white rounded-xl shadow p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setSelected(null)}
              className="text-sm text-emerald-600 hover:underline"
            >
              ← 一覧に戻る
            </button>
            <button
              onClick={handleToggleStatus}
              disabled={sending}
              className={`text-xs px-3 py-1 rounded-full font-medium transition-colors disabled:opacity-50 ${
                selected.status === 'OPEN'
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              }`}
            >
              {selected.status === 'OPEN' ? 'クローズする' : '再オープンする'}
            </button>
          </div>

          <div>
            <p className="font-semibold text-gray-900">{selected.subject}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {selected.user.name} · {new Date(selected.createdAt).toLocaleDateString('ja-JP')}
            </p>
          </div>

          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {selected.messages.map(msg => {
              const isAdmin = msg.sender.role === 'ADMIN' || msg.sender.role === 'DEVELOPER' || msg.sender.role === 'MODERATOR'
              return (
                <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${isAdmin ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                    <p className={`text-xs font-medium mb-0.5 ${isAdmin ? 'text-emerald-200' : 'text-gray-500'}`}>
                      {msg.sender.name}{isAdmin ? '（管理者）' : ''}
                    </p>
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p className={`text-xs mt-1 ${isAdmin ? 'text-emerald-200' : 'text-gray-400'}`}>
                      {new Date(msg.createdAt).toLocaleString('ja-JP')}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          {selected.status === 'OPEN' && (
            <form onSubmit={handleReply} className="flex gap-2">
              <textarea
                placeholder="返信を入力…"
                value={replyBody}
                onChange={e => setReplyBody(e.target.value)}
                rows={2}
                className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                required
              />
              <button
                type="submit"
                disabled={sending}
                className="self-end text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {sending ? '…' : '送信'}
              </button>
            </form>
          )}
        </div>
      ) : (
        threads.length === 0 ? (
          <p className="text-sm text-gray-400">お問い合わせはありません。</p>
        ) : (
          <ul className="space-y-3">
            {threads.map(t => {
              const unread = t.messages.filter(m =>
                m.readAt === null && !ADMIN_ROLES.includes(m.sender.role ?? '')
              ).length
              return (
                <li key={t.id}>
                  <button
                    onClick={() => openThread(t)}
                    className="w-full text-left bg-white rounded-xl shadow px-4 py-3 hover:shadow-md transition-shadow border-l-4 border-blue-300"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-gray-900 truncate">{t.subject}</span>
                        {unread > 0 && (
                          <span className="shrink-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                            {unread}
                          </span>
                        )}
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${t.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {t.status === 'OPEN' ? '対応中' : 'クローズ'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.user.name} · {new Date(t.updatedAt).toLocaleDateString('ja-JP')} · {t.messages.length}件
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        )
      )}
    </div>
  )
}
