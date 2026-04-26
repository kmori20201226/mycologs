'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { getStoredUser, getStoredClubs, getSelectedClubId } from '@/lib/auth'

interface ClubDetail extends Record<string, unknown> {
  id: number
  credit: number
}

interface SubscriptionRecord extends Record<string, unknown> {
  id: string
}

interface PaymentRecord extends Record<string, unknown> {
  id: string
}

function FieldTable({
  data,
  editableFields,
}: {
  data: Record<string, unknown>
  editableFields?: Record<string, React.ReactNode>
}) {
  return (
    <table className="w-full text-sm border-collapse">
      <tbody>
        {Object.entries(data).map(([key, val]) => (
          <tr key={key} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-1.5 pr-4 font-mono text-xs text-gray-500 whitespace-nowrap w-48 align-top">{key}</td>
            <td className="py-1.5 font-mono text-xs text-gray-800 break-all">
              {editableFields?.[key] ?? (
                val === null || val === undefined
                  ? <span className="text-gray-300">null</span>
                  : typeof val === 'object'
                  ? <span className="text-blue-600">{JSON.stringify(val)}</span>
                  : <span>{String(val)}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function DebugClubPage() {
  const router = useRouter()
  const params = useParams()
  const clubId = Number(params.id)

  useEffect(() => {
    const user = getStoredUser()
    const clubs = getStoredClubs()
    const selectedClubId = getSelectedClubId()
    const clubRole = clubs.find((c) => c.id === selectedClubId)?.role
    const hasDev = user?.role === 'DEVELOPER' || clubRole === 'DEVELOPER'
    if (!hasDev) router.replace('/')
  }, [router])

  const [detail, setDetail] = useState<ClubDetail | null>(null)
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)
  const [creditInput, setCreditInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const refresh = () => setTick((t) => t + 1)

  useEffect(() => {
    if (!clubId) return
    setLoading(true)
    Promise.all([
      apiClient.request<ClubDetail>(`/debug/clubs/${clubId}`),
      apiClient.request<SubscriptionRecord[]>(`/clubs/${clubId}/subscriptions`),
      apiClient.request<PaymentRecord[]>(`/clubs/${clubId}/payments`),
    ])
      .then(([club, subs, pays]) => {
        setDetail(club)
        setSubscriptions(subs)
        setPayments(pays)
        setCreditInput(String(club.credit ?? 0))
      })
      .catch(() => { setDetail(null); setSubscriptions([]); setPayments([]) })
      .finally(() => setLoading(false))
  }, [clubId, tick])

  async function submitCredit() {
    if (!detail) return
    const newCredit = parseInt(creditInput, 10)
    if (isNaN(newCredit)) return
    const delta = newCredit - Number(detail.credit ?? 0)
    setSubmitting(true)
    await apiClient.request(`/clubs/${clubId}/credit/adjust`, {
      method: 'POST',
      body: JSON.stringify({ delta }),
    }).catch(() => {})
    setSubmitting(false)
    refresh()
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800 font-mono">Debug: Club #{clubId}</h1>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs font-mono px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {loading ? '読み込み中…' : '↻ 更新'}
          </button>
        </div>

        {loading && <p className="text-sm text-gray-400 font-mono">読み込み中...</p>}

        {detail && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              clubs — id: {detail.id}
            </h2>
            <FieldTable
              data={detail}
              editableFields={{
                credit: (
                  <input
                    type="number"
                    value={creditInput}
                    onChange={(e) => setCreditInput(e.target.value)}
                    className="w-32 border border-emerald-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                ),
              }}
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={submitCredit}
                disabled={submitting}
                className="text-xs font-mono px-4 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors"
              >
                {submitting ? '更新中…' : 'Club credit を更新'}
              </button>
            </div>
          </div>
        )}

        {detail && (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              subscriptions ({subscriptions.length} 件)
            </h2>
            {subscriptions.length === 0
              ? <p className="text-sm text-gray-400 font-mono">サブスクリプションなし</p>
              : subscriptions.map((sub) => (
                <div key={sub.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-400 mb-3 font-mono">id: {sub.id}</p>
                  <FieldTable data={sub} />
                </div>
              ))
            }
          </div>
        )}

        {detail && (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              payments ({payments.length} 件)
            </h2>
            {payments.length === 0
              ? <p className="text-sm text-gray-400 font-mono">支払い履歴なし</p>
              : payments.map((pay) => (
                <div key={pay.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <p className="text-xs font-semibold text-gray-400 mb-3 font-mono">id: {pay.id}</p>
                  <FieldTable data={pay} />
                </div>
              ))
            }
          </div>
        )}

      </div>
    </div>
  )
}
