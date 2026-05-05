'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, type UserRequestItem } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'
import AdminThreadsPanel from './AdminThreadsPanel'
import AnnouncementPanel from './AnnouncementPanel'

interface RequestRow extends UserRequestItem {
  replyDraft: string
  resolving: boolean
}

function StatusBadge({ accepted }: { accepted: boolean | null }) {
  if (accepted === null) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">審査中</span>
  if (accepted) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">承認済み</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">否認</span>
}

type Tab = 'requests' | 'threads' | 'announcement'

export default function ClubRequestsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('requests')
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showResolved, setShowResolved] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const user = getStoredUser()
    if (!user) { router.replace('/login'); return }

    const adminRoles = ['ADMIN', 'DEVELOPER', 'MODERATOR']
    if (!adminRoles.includes(user.role ?? '')) { router.replace('/'); return }

    apiClient.getUserRequests({ requestType: 'StartClub' })
      .then((items) => {
        setRows(items.map((r) => ({ ...r, replyDraft: '', resolving: false })))
        setPendingCount(items.filter((r) => r.accepted === null).length)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    apiClient.getAdminThreads().then((threads) => {
      const ADMIN_ROLES = ['ADMIN', 'DEVELOPER', 'MODERATOR']
      const total = threads.reduce((sum, t) =>
        sum + t.messages.filter(m => m.readAt === null && !ADMIN_ROLES.includes(m.sender.role ?? '')).length
      , 0)
      setUnreadCount(total)
    }).catch(() => {})
  }, [router])

  function updateRow(id: number, patch: Partial<RequestRow>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r))
  }

  async function handleAccept(row: RequestRow) {
    const user = getStoredUser()
    if (!user) return
    updateRow(row.id, { resolving: true })
    try {
      const updated = await apiClient.acceptUserRequest(row.id, {
        replierId: user.id,
        reply: row.replyDraft.trim() ? { message: row.replyDraft.trim() } : null,
      })
      updateRow(row.id, { ...updated, replyDraft: '', resolving: false })
      setPendingCount((n) => Math.max(0, n - 1))
      window.dispatchEvent(new CustomEvent('pendingRequestResolved'))
    } catch {
      updateRow(row.id, { resolving: false })
    }
  }

  async function handleDecline(row: RequestRow) {
    const user = getStoredUser()
    if (!user) return
    updateRow(row.id, { resolving: true })
    try {
      const updated = await apiClient.declineUserRequest(row.id, {
        replierId: user.id,
        reply: row.replyDraft.trim() ? { message: row.replyDraft.trim() } : null,
      })
      updateRow(row.id, { ...updated, replyDraft: '', resolving: false })
      setPendingCount((n) => Math.max(0, n - 1))
      window.dispatchEvent(new CustomEvent('pendingRequestResolved'))
    } catch {
      updateRow(row.id, { resolving: false })
    }
  }

  const pending  = rows.filter((r) => r.accepted === null)
  const resolved = rows.filter((r) => r.accepted !== null)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-3xl">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">サイト管理</h1>
        </div>

        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {([['requests', 'クラブ申請', pendingCount], ['threads', 'お問い合わせ', unreadCount], ['announcement', 'お知らせ', 0]] as [Tab, string, number][]).map(([key, label, badge]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-emerald-600 text-emerald-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
              {badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'threads' && (
          <AdminThreadsPanel
            onRead={(delta) => setUnreadCount((n) => Math.max(0, n - delta))}
            onUnreadCountChange={setUnreadCount}
          />
        )}

        {tab === 'announcement' && <AnnouncementPanel />}

        {tab === 'requests' && loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : tab === 'requests' && (
          <>
            {pending.length === 0 && (
              <p className="text-sm text-gray-400 mb-8">保留中の申請はありません。</p>
            )}

            {pending.length > 0 && (
              <ul className="space-y-4 mb-8">
                {pending.map((row) => (
                  <li key={row.id} className="bg-white rounded-xl shadow p-5 border-l-4 border-purple-400">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-sm font-bold shrink-0">
                        {row.requester.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{row.requester.name}</p>
                        <p className="text-xs text-gray-400">{row.requester.email}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {new Date(row.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                      </div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">クラブ立ち上げ</span>
                    </div>

                    {row.club && (
                      <div className="mb-3 bg-purple-50 rounded-lg px-4 py-3 text-sm border border-purple-100 space-y-1">
                        <p className="font-semibold text-gray-800">{row.club.name}</p>
                        {row.club.introduction && <p className="text-gray-600 text-xs whitespace-pre-wrap">{row.club.introduction}</p>}
                        {row.club.policy && (
                          <details className="text-xs text-gray-500">
                            <summary className="cursor-pointer text-purple-600 font-medium">ポリシーを見る</summary>
                            <p className="mt-1 whitespace-pre-wrap">{row.club.policy}</p>
                          </details>
                        )}
                      </div>
                    )}

                    {row.request?.message && (
                      <div className="mb-3 bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap border border-gray-100">
                        {row.request.message}
                      </div>
                    )}

                    <div className="mb-3">
                      <textarea
                        value={row.replyDraft}
                        onChange={(e) => updateRow(row.id, { replyDraft: e.target.value })}
                        placeholder="申請者へのメッセージ（任意）"
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleAccept(row)}
                        disabled={row.resolving}
                        className="flex items-center gap-1.5 px-4 py-1.5 disabled:opacity-50 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        承認・公開
                      </button>
                      <button
                        onClick={() => handleDecline(row)}
                        disabled={row.resolving}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-white border border-red-400 hover:bg-red-50 disabled:opacity-50 text-red-500 text-sm font-semibold rounded-lg transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                        却下
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {resolved.length > 0 && (
              <div>
                <button
                  onClick={() => setShowResolved((v) => !v)}
                  className="flex items-center gap-1 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 hover:text-gray-700 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className={`w-4 h-4 transition-transform ${showResolved ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  処理済み（{resolved.length}件）
                </button>
                {showResolved && (
                  <ul className="space-y-3">
                    {resolved.map((row) => (
                      <li key={row.id} className="bg-white rounded-xl shadow p-4 opacity-80">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-sm font-bold shrink-0">
                            {row.requester.name[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800">{row.club?.name ?? '—'}</p>
                            <p className="text-xs text-gray-400">{row.requester.name} · {row.requester.email}</p>
                          </div>
                          <StatusBadge accepted={row.accepted} />
                        </div>
                        {(row.reply as any)?.message && (
                          <p className="mt-1 text-xs text-gray-400 italic pl-11">返信: {(row.reply as any).message}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
