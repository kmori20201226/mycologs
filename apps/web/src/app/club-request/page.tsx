'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, type UserRequestItem } from '@/lib/api'
import { getStoredUser, getStoredClubs } from '@/lib/auth'

const NEW_CLUB_SENTINEL = '__new__'

interface Club {
  id: number
  name: string
  introduction: string | null
  policy: string | null
}

function StatusBadge({ accepted }: { accepted: boolean | null }) {
  if (accepted === null) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">審査中</span>
  if (accepted) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">承認済み</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">否認</span>
}

function RequestTypeBadge({ requestType }: { requestType: string | undefined }) {
  if (requestType === 'LeaveFromMember') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">退会</span>
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">参加</span>
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
  const [policyClub, setPolicyClub] = useState<Club | null>(null)

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

  const isNewClub = selectedClubId === NEW_CLUB_SENTINEL
  const isLeave = !isNewClub && selectedClubId ? memberClubIds.has(Number(selectedClubId)) : false

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isNewClub) { router.push('/club-start'); return }
    setError('')
    setSuccess('')
    const user = getStoredUser()
    if (!user) return
    if (!selectedClubId) { setError('クラブを選択してください。'); return }

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
        ? '退会申請がクラブ管理者に送信されました。'
        : '参加申請がクラブ管理者に送信されました。')
    } catch (err: any) {
      const msg = err?.message ?? ''
      if (msg.includes('409')) {
        setError('このクラブへの申請が既に存在します。')
      } else {
        setError('申請の送信に失敗しました。もう一度お試しください。')
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

        <h1 className="text-2xl font-bold text-gray-900 mb-6">クラブメンバーシップ</h1>

        {/* Request form */}
        <div className="bg-white rounded-xl shadow p-6 mb-8">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">クラブ</label>
              <select
                value={selectedClubId}
                onChange={(e) => { setSelectedClubId(e.target.value); setError(''); setSuccess('') }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              >
                <option value="">— クラブを選択 —</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value={NEW_CLUB_SENTINEL}>＋ 自分でクラブを立ち上げる</option>
              </select>
              {(() => {
                const club = clubs.find((c) => String(c.id) === selectedClubId)
                if (!club) return null
                return (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs text-gray-400">
                      {isLeave ? '現在このクラブのメンバーです。' : 'このクラブのメンバーではありません。'}
                    </p>
                    {club.introduction && (
                      <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                        {club.introduction}
                      </p>
                    )}
                    {club.policy && (
                      <button
                        type="button"
                        onClick={() => setPolicyClub(club)}
                        className="text-xs text-emerald-600 hover:underline font-medium"
                      >
                        クラブの詳細情報 →
                      </button>
                    )}
                  </div>
                )
              })()}
            </div>

            {!isNewClub && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  クラブ管理者へのメッセージ
                  <span className="text-gray-400 font-normal ml-1">（任意）</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={isLeave ? '退会理由を入力…' : '自己紹介や参加を希望する理由を入力…'}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
            )}
            {isNewClub && (
              <p className="text-sm text-gray-500 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                クラブ名、紹介文、ポリシーを入力して申請します。管理者の承認後に公開されます。
              </p>
            )}

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
                  isNewClub
                    ? 'bg-emerald-700 hover:bg-emerald-800'
                    : isLeave
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {submitting ? '送信中…' : isNewClub ? 'クラブ立ち上げ →' : isLeave ? '退会する' : '参加申請'}
              </button>
            </div>
          </form>
        </div>

        {/* Past requests */}
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          申請履歴
          {requests.length > 0 && <span className="ml-2 text-emerald-600">{requests.length}</span>}
        </h2>

        {requests.length === 0 ? (
          <p className="text-sm text-gray-400">まだ申請がありません。</p>
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
                      {new Date(req.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}に申請
                    </p>
                    {req.request?.message && (
                      <p className="mt-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 whitespace-pre-wrap">
                        {req.request.message}
                      </p>
                    )}
                    {req.reply && Object.keys(req.reply).length > 0 && (
                      <div className={`mt-2 text-sm rounded-lg px-3 py-2 ${req.accepted ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                        <p className="text-xs font-semibold mb-0.5">
                          {req.replier?.name ?? '管理者'}からの返信
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

      {/* Policy modal */}
      {policyClub && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setPolicyClub(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{policyClub.name} — クラブの詳細情報</h2>
              <button
                onClick={() => setPolicyClub(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{policyClub.policy}</p>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
