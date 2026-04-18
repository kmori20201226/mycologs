'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'

interface UserSummary {
  id: number
  name: string
  email: string
}

interface UserLog {
  id: number
  userId: number
  postId: number | null
  followupId: number | null
  point: number
  transactionType: 'POST' | 'RESET'
  rejectionCategory: 'OFFENSIVE_SEXUAL' | 'POTENTIALLY_OFFENSIVE' | 'OFF_TOPIC_IMAGE' | 'NONE' | null
  userPost: string
  comment: string
  createdBy: number
  createdAt: string
  creator: { id: number; name: string }
}

const CATEGORY_LABEL: Record<string, string> = {
  OFFENSIVE_SEXUAL:      '性的・攻撃的',
  POTENTIALLY_OFFENSIVE: '不快の可能性',
  OFF_TOPIC_IMAGE:       '無関係な内容',
  NONE:                  'なし',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('ja-JP', { dateStyle: 'short', timeStyle: 'short' })
}

export default function UserLogsPage() {
  const [users, setUsers] = useState<UserSummary[]>([])
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('')
  const [logs, setLogs] = useState<UserLog[]>([])
  const [loading, setLoading] = useState(false)
  const [totalPoints, setTotalPoints] = useState(0)

  useEffect(() => {
    apiClient.request<UserSummary[]>('/users').then(setUsers).catch(() => {})
  }, [])

  async function loadLogs(uid: number) {
    setLoading(true)
    try {
      const data = await apiClient.request<UserLog[]>(`/users/${uid}/logs`)
      setLogs(data)
      setTotalPoints(data.reduce((sum, l) => sum + l.point, 0))
    } finally {
      setLoading(false)
    }
  }

  function handleUserChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    if (!val) { setSelectedUserId(''); setLogs([]); return }
    const uid = Number(val)
    setSelectedUserId(uid)
    loadLogs(uid)
  }

  const selectedUser = users.find((u) => u.id === selectedUserId)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">

        <h1 className="text-3xl font-bold text-gray-900 mb-8">ユーザーログ</h1>

        {/* User selector */}
        <div className="bg-white rounded-xl shadow p-5 mb-6 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-48">
            <label className="block text-sm font-medium text-gray-700 mb-1">ユーザーを選択</label>
            <select
              value={selectedUserId}
              onChange={handleUserChange}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">— ユーザーを選択 —</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
          {selectedUser && logs.length > 0 && (
            <div className="text-sm text-gray-600">
              合計ポイント:{' '}
              <span className={`font-bold text-base ${totalPoints < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {totalPoints > 0 ? `+${totalPoints}` : totalPoints}
              </span>
              <span className="ml-3 text-gray-400">{logs.length}件</span>
            </div>
          )}
        </div>

        {/* Log table */}
        {!selectedUserId ? (
          <p className="text-center text-sm text-gray-400 py-16">ユーザーを選択してください。</p>
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow p-4 animate-pulse space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/4" />
                <div className="h-3 bg-gray-200 rounded w-full" />
              </div>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">ログがありません。</p>
        ) : (
          <div className="bg-white rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 w-36">日時</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 w-32">カテゴリ</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-600 w-16">点数</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-600">投稿・コメント</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors align-top">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      {log.transactionType === 'RESET' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                          リセット
                        </span>
                      ) : log.rejectionCategory ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          log.rejectionCategory === 'OFFENSIVE_SEXUAL'
                            ? 'bg-red-100 text-red-700'
                            : log.rejectionCategory === 'POTENTIALLY_OFFENSIVE'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {CATEGORY_LABEL[log.rejectionCategory] ?? log.rejectionCategory}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${log.point < 0 ? 'text-red-600' : log.point > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                      {log.point > 0 ? `+${log.point}` : log.point}
                    </td>
                    <td className="px-4 py-3 space-y-1">
                      {log.userPost && (
                        <p className="text-gray-800 line-clamp-2">{log.userPost}</p>
                      )}
                      {log.comment && (
                        <p className="text-xs text-gray-400 line-clamp-2">{log.comment}</p>
                      )}
                      <div className="flex gap-3 text-xs text-gray-400">
                        {log.postId && (
                          <a href={`/posts/${log.postId}`} className="text-emerald-600 hover:underline">
                            投稿を見る
                          </a>
                        )}
                        <span>記録者: {log.creator.name}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  )
}
