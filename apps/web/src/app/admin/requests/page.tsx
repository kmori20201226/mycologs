'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, type UserRequestItem } from '@/lib/api'
import { getStoredUser, getSelectedClubId, getStoredClubs } from '@/lib/auth'

interface RequestRow extends UserRequestItem {
  replyDraft: string
  resolving: boolean
}

function StatusBadge({ accepted }: { accepted: boolean | null }) {
  if (accepted === null) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
  if (accepted) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Accepted</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Declined</span>
}

export default function ManagerRequestsPage() {
  const router = useRouter()
  const [clubName, setClubName] = useState<string>('')
  const [rows, setRows] = useState<RequestRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showResolved, setShowResolved] = useState(false)

  function loadForClub(clubId: number) {
    const clubs = getStoredClubs()
    setClubName(clubs.find((c) => c.id === clubId)?.name ?? '')
    setLoading(true)
    apiClient.getUserRequests({ clubId })
      .then((items) => setRows(items.map((r) => ({ ...r, replyDraft: '', resolving: false }))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const user = getStoredUser()
    if (!user) { router.replace('/login'); return }

    const clubs = getStoredClubs()
    const managedClubs = clubs.filter((c) => c.role === 'CLUBMANAGER')
    if (managedClubs.length === 0) return

    // Use selected club only if user manages it, otherwise fall back to first managed club
    const selectedId = getSelectedClubId()
    const clubId = managedClubs.find((c) => c.id === selectedId)?.id ?? managedClubs[0].id
    loadForClub(clubId)

    function onClubChanged(e: Event) {
      const { clubId: newId } = (e as CustomEvent).detail
      const managed = getStoredClubs().filter((c) => c.role === 'CLUBMANAGER')
      const target = managed.find((c) => c.id === newId)?.id ?? managed[0]?.id
      if (target) loadForClub(target)
    }
    window.addEventListener('clubChanged', onClubChanged)
    return () => window.removeEventListener('clubChanged', onClubChanged)
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
      window.dispatchEvent(new CustomEvent('pendingRequestResolved'))
    } catch {
      updateRow(row.id, { resolving: false })
    }
  }

  const pending = rows.filter((r) => r.accepted === null)
  const resolved = rows.filter((r) => r.accepted !== null)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-3xl">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Member Requests</h1>
          {clubName && <p className="text-sm text-gray-500 mt-1">{clubName}</p>}
        </div>

        {/* Pending requests */}
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Pending
          {pending.length > 0 && <span className="ml-2 text-yellow-600">{pending.length}</span>}
        </h2>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : pending.length === 0 ? (
          <p className="text-sm text-gray-400 mb-8">No pending requests.</p>
        ) : (
          <ul className="space-y-4 mb-8">
            {pending.map((row) => (
              <li key={row.id} className="bg-white rounded-xl shadow p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold shrink-0">
                    {row.requester.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">{row.requester.name}</p>
                    <p className="text-xs text-gray-400">{row.requester.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Requested {new Date(row.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <StatusBadge accepted={row.accepted} />
                </div>

                {row.request?.message && (
                  <div className="mb-4 bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap border border-gray-100">
                    {row.request.message}
                  </div>
                )}

                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Reply message <span className="font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={row.replyDraft}
                    onChange={(e) => updateRow(row.id, { replyDraft: e.target.value })}
                    placeholder="Write a message to the requester…"
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleAccept(row)}
                    disabled={row.resolving}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Accept
                  </button>
                  <button
                    onClick={() => handleDecline(row)}
                    disabled={row.resolving}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-white border border-red-400 hover:bg-red-50 disabled:opacity-50 text-red-500 text-sm font-semibold rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Resolved requests (collapsible) */}
        {resolved.length > 0 && (
          <div>
            <button
              onClick={() => setShowResolved((v) => !v)}
              className="flex items-center gap-1 text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 hover:text-gray-700 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`w-4 h-4 transition-transform ${showResolved ? 'rotate-90' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Resolved ({resolved.length})
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
                        <p className="text-sm font-medium text-gray-800">{row.requester.name}</p>
                        <p className="text-xs text-gray-400">{row.requester.email}</p>
                      </div>
                      <StatusBadge accepted={row.accepted} />
                    </div>
                    {row.request?.message && (
                      <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 whitespace-pre-wrap">{row.request.message}</p>
                    )}
                    {(row.reply as any)?.message && (
                      <p className="mt-1 text-xs text-gray-400 italic">Reply: {(row.reply as any).message}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
