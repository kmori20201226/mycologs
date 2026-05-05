'use client'

import { useEffect, useState } from 'react'
import { apiClient, AdminThread } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

type View = 'list' | 'new' | 'thread'

export default function ContactSection() {
  const user = getStoredUser()
  const [view, setView] = useState<View>('list')
  const [threads, setThreads] = useState<AdminThread[]>([])
  const [selected, setSelected] = useState<AdminThread | null>(null)
  const [loading, setLoading] = useState(false)
  const [replyBody, setReplyBody] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    apiClient.getAdminThreads().then(setThreads).catch(() => {})
  }, [user?.id])

  if (!user) {
    return (
      <div className="border-t pt-6 text-center text-sm text-gray-500">
        <p>管理者へのお問い合わせはログイン後にご利用いただけます。</p>
      </div>
    )
  }

  async function handleNew(e: React.FormEvent) {
    e.preventDefault()
    if (!newSubject.trim() || !newBody.trim()) return
    setLoading(true)
    setError(null)
    try {
      const thread = await apiClient.createAdminThread({ subject: newSubject.trim(), body: newBody.trim() })
      setThreads(prev => [thread, ...prev])
      setSelected(thread)
      setView('thread')
      setNewSubject('')
      setNewBody('')
    } catch {
      setError('送信に失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !replyBody.trim()) return
    setLoading(true)
    setError(null)
    try {
      const updated = await apiClient.replyAdminThread(selected.id, replyBody.trim())
      setSelected(updated)
      setThreads(prev => prev.map(t => t.id === updated.id ? updated : t))
      setReplyBody('')
    } catch {
      setError('送信に失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  async function openThread(thread: AdminThread) {
    try {
      const full = await apiClient.getAdminThread(thread.id)
      setSelected(full)
      setThreads(prev => prev.map(t => t.id === full.id ? full : t))
      setView('thread')
    } catch {
      setError('スレッドの取得に失敗しました。')
    }
  }

  return (
    <div className="border-t pt-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">管理者へのお問い合わせ</h2>
        {view !== 'new' && (
          <button
            onClick={() => { setView('new'); setError(null) }}
            className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            新規お問い合わせ
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {view === 'new' && (
        <form onSubmit={handleNew} className="space-y-3">
          <input
            type="text"
            placeholder="件名"
            value={newSubject}
            onChange={e => setNewSubject(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            required
          />
          <textarea
            placeholder="内容"
            value={newBody}
            onChange={e => setNewBody(e.target.value)}
            rows={4}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
            required
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => { setView('list'); setError(null) }}
              className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg transition-colors"
            >
              {loading ? '送信中…' : '送信'}
            </button>
          </div>
        </form>
      )}

      {view === 'thread' && selected && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <button onClick={() => setView('list')} className="text-sm text-emerald-600 hover:underline">← 一覧に戻る</button>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${selected.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {selected.status === 'OPEN' ? '対応中' : 'クローズ'}
            </span>
          </div>
          <p className="font-medium text-sm text-gray-800">{selected.subject}</p>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {selected.messages.map(msg => {
              const isMe = msg.senderId === user.id
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${isMe ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                    {!isMe && <p className="text-xs font-medium mb-0.5 opacity-70">{msg.sender.name}</p>}
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p className={`text-xs mt-1 ${isMe ? 'text-emerald-200' : 'text-gray-400'}`}>
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
                disabled={loading}
                className="self-end text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors"
              >
                {loading ? '…' : '送信'}
              </button>
            </form>
          )}
        </div>
      )}

      {view === 'list' && (
        threads.length === 0
          ? <p className="text-sm text-gray-400">お問い合わせ履歴はありません。</p>
          : <ul className="space-y-2">
              {threads.map(t => (
                <li key={t.id}>
                  <button
                    onClick={() => openThread(t)}
                    className="w-full text-left border rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-800 truncate">{t.subject}</span>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${t.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {t.status === 'OPEN' ? '対応中' : 'クローズ'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(t.updatedAt).toLocaleDateString('ja-JP')} · {t.messages.length}件
                    </p>
                  </button>
                </li>
              ))}
            </ul>
      )}
    </div>
  )
}
