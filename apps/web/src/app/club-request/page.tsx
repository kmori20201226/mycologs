'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, type UserRequestItem } from '@/lib/api'
import { getStoredUser, getStoredClubs } from '@/lib/auth'

interface Club {
  id: number
  name: string
}

function StatusBadge({ accepted }: { accepted: boolean | null }) {
  if (accepted === null) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
  if (accepted) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Accepted</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Declined</span>
}

function RequestTypeBadge({ requestType }: { requestType: string | undefined }) {
  if (requestType === 'LeaveFromMember') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Leave</span>
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Join</span>
}

export default function ClubRequestPage() {
  const router = useRouter()
  const [clubs, setClubs] = useState<Club[]>([])
  const [memberClubIds, setMemberClubIds] = useState<Set<number>>(new Set())
  const [requests, setRequests] = useState<UserRequestItem[]>([])
  const [selectedClubId, setSelectedClubId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const user = getStoredUser()
    if (!user) { router.replace('/login'); return }

    // Build set of clubs the user currently belongs to
    const myClubs = getStoredClubs()
    setMemberClubIds(new Set(myClubs.map((c) => c.id)))

    apiClient.getClubs().then(setClubs).catch(() => {})
    apiClient.getUserRequests({ requesterId: user.id })
      .then(setRequests)
      .catch(() => {})
  }, [router])

  const isLeave = selectedClubId ? memberClubIds.has(Number(selectedClubId)) : false

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')
    const user = getStoredUser()
    if (!user) return
    if (!selectedClubId) { setError('Please select a club.'); return }

    const requestType = isLeave ? 'LeaveFromMember' : 'JoinToMember'
    setSubmitting(true)
    try {
      const created = await apiClient.createUserRequest({
        requesterId: user.id,
        clubId: Number(selectedClubId),
        request: { requestType, message: message.trim() },
      })
      setRequests((prev) => [created, ...prev])
      setSelectedClubId('')
      setMessage('')
      window.dispatchEvent(new CustomEvent('pendingRequestCreated'))
      setSuccess(isLeave
        ? 'Your leave request has been sent to the club manager.'
        : 'Your join request has been sent to the club manager.')
    } catch (err: any) {
      const msg = err?.message ?? ''
      if (msg.includes('409')) {
        setError('You already have a pending request for this club.')
      } else {
        setError('Failed to send request. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancel(id: number) {
    await apiClient.deleteUserRequest(id)
    setRequests((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <h1 className="text-2xl font-bold text-gray-900 mb-6">Club Membership</h1>

        {/* Request form */}
        <div className="bg-white rounded-xl shadow p-6 mb-8">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Club</label>
              <select
                value={selectedClubId}
                onChange={(e) => { setSelectedClubId(e.target.value); setError(''); setSuccess('') }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              >
                <option value="">— Select a club —</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {selectedClubId && (
                <p className="mt-1 text-xs text-gray-400">
                  {isLeave ? 'You are currently a member of this club.' : 'You are not a member of this club.'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Message to the club manager
                <span className="text-gray-400 font-normal ml-1">(optional)</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={isLeave ? 'Reason for leaving…' : 'Introduce yourself or explain why you want to join…'}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}
            {success && (
              <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{success}</p>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={submitting || !selectedClubId}
                className={`px-5 py-2 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors ${
                  isLeave
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {submitting ? 'Sending…' : isLeave ? 'Leave' : 'Join'}
              </button>
            </div>
          </form>
        </div>

        {/* Past requests */}
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Your Requests
          {requests.length > 0 && <span className="ml-2 text-emerald-600">{requests.length}</span>}
        </h2>

        {requests.length === 0 ? (
          <p className="text-sm text-gray-400">No requests yet.</p>
        ) : (
          <ul className="space-y-3">
            {requests.map((req) => (
              <li key={req.id} className="bg-white rounded-xl shadow p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-medium text-gray-900 text-sm">{req.club?.name ?? '—'}</span>
                      <RequestTypeBadge requestType={req.request?.requestType} />
                      <StatusBadge accepted={req.accepted} />
                    </div>
                    <p className="text-xs text-gray-400">
                      Submitted {new Date(req.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                    </p>
                    {req.request?.message && (
                      <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                        {req.request.message}
                      </p>
                    )}
                    {req.reply && Object.keys(req.reply).length > 0 && (
                      <div className={`mt-2 text-sm rounded-lg px-3 py-2 ${req.accepted ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                        <p className="text-xs font-semibold mb-0.5">
                          Reply from {req.replier?.name ?? 'manager'}
                          {req.repliedAt && <span className="font-normal text-gray-400 ml-1">· {new Date(req.repliedAt).toLocaleDateString()}</span>}
                        </p>
                        <p className="whitespace-pre-wrap">{(req.reply as any).message ?? JSON.stringify(req.reply)}</p>
                      </div>
                    )}
                  </div>

                  {req.accepted === null && (
                    <button
                      onClick={() => handleCancel(req.id)}
                      className="shrink-0 text-xs text-gray-400 hover:text-red-500 transition-colors"
                      title="Cancel request"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

      </div>
    </div>
  )
}
