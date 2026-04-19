'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type Event } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

export default function UserEventListPage() {
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [newName, setNewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [userId, setUserId] = useState<number | null>(null)
  const [userName, setUserName] = useState<string>('')

  useEffect(() => {
    const user = getStoredUser()
    if (!user) {
      router.push('/login')
      return
    }
    setUserId(user.id)
    setUserName(user.name)
    loadEvents(user.id)
  }, [])

  async function loadEvents(uid?: number) {
    const id = uid ?? userId
    if (!id) return
    const data = await apiClient.getEvents({ userId: id })
    setEvents(data)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!userId) return
    await apiClient.createEvent({ name: newName, userId })
    setNewName('')
    loadEvents()
  }

  async function handleDelete(id: number) {
    await apiClient.deleteEvent(id)
    setConfirmDeleteId(null)
    loadEvents()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">マイイベント</h1>
          {userName && (
            <p className="text-sm text-gray-500 mt-1">{userName}</p>
          )}
        </div>

        {/* Create form */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">新規イベント</h2>
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="イベント名"
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              追加
            </button>
          </form>
        </div>

        {/* Event table */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {events.length === 0 ? (
            <p className="px-6 py-10 text-sm text-gray-400 text-center">まだイベントがありません。</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 w-28">日付</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">名前・説明</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 text-sm text-gray-500 whitespace-nowrap align-top">{formatDate(ev.startAt)}</td>
                    <td className="px-4 py-4 align-top">
                      <p className="font-medium text-gray-800 text-sm">{ev.startAt ? `${formatDateOnly(ev.startAt)} ${ev.name}` : ev.name}</p>
                      {ev.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{ev.description}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-4">
                        <Link
                          href={`/club-events/${ev.id}`}
                          className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg font-semibold transition-colors"
                        >
                          投稿
                        </Link>
                        <button
                          onClick={() => router.push(`/events/${ev.id}`)}
                          className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                        >
                          編集
                        </button>

                        {confirmDeleteId === ev.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">本当に？</span>
                            <button
                              onClick={() => handleDelete(ev.id)}
                              className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded font-semibold transition-colors"
                            >
                              はい
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              いいえ
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(ev.id)}
                            className="text-red-400 hover:text-red-600 font-medium transition-colors"
                          >
                            削除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
