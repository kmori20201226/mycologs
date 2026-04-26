'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api'
import { getStoredUser, getStoredClubs, getSelectedClubId } from '@/lib/auth'

interface UserSummary {
  id: number
  name: string
  email: string
}

interface ClubMember {
  id: number
  clubId: number
  userId: number
  roleId: number
  createdAt: string
  club: Record<string, unknown>
  role: { id: number; name: string }
}

interface UserDetail extends Record<string, unknown> {
  clubUsers: ClubMember[]
}

interface SubscriptionRecord extends Record<string, unknown> {
  id: string
}

interface PaymentRecord extends Record<string, unknown> {
  id: string
}

const HIDDEN_USER_FIELDS = new Set(['clubUsers'])

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

export default function DebugPage() {
  const router = useRouter()

  useEffect(() => {
    const user = getStoredUser()
    const clubs = getStoredClubs()
    const selectedClubId = getSelectedClubId()
    const clubRole = clubs.find((c) => c.id === selectedClubId)?.role
    const hasDev = user?.role === 'DEVELOPER' || clubRole === 'DEVELOPER'
    if (!hasDev) router.replace('/')
  }, [router])

  const [users, setUsers] = useState<UserSummary[]>([])
  const [selectedId, setSelectedId] = useState<number | ''>('')
  const [detail, setDetail] = useState<UserDetail | null>(null)
  const [subscriptions, setSubscriptions] = useState<SubscriptionRecord[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick] = useState(0)

  const [userCreditInput, setUserCreditInput] = useState('')
  const [clubCreditInputs, setClubCreditInputs] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)

  const refresh = () => setTick((t) => t + 1)

  useEffect(() => {
    apiClient.request<UserSummary[]>('/debug/users').then(setUsers).catch(() => {})
  }, [tick])

  useEffect(() => {
    if (selectedId === '') { setDetail(null); setSubscriptions([]); setPayments([]); return }
    setLoading(true)
    Promise.all([
      apiClient.request<UserDetail>(`/debug/users/${selectedId}`),
      apiClient.request<SubscriptionRecord[]>(`/users/${selectedId}/subscriptions`),
      apiClient.request<PaymentRecord[]>(`/users/${selectedId}/payments`),
    ])
      .then(([u, subs, pays]) => { setDetail(u); setSubscriptions(subs); setPayments(pays) })
      .catch(() => { setDetail(null); setSubscriptions([]); setPayments([]) })
      .finally(() => setLoading(false))
  }, [selectedId, tick])

  useEffect(() => {
    if (!detail) return
    setUserCreditInput(String(detail.credit ?? 0))
    const map: Record<number, string> = {}
    detail.clubUsers.forEach((cu) => {
      map[cu.clubId] = String((cu.club as Record<string, unknown>).credit ?? 0)
    })
    setClubCreditInputs(map)
  }, [detail])

  async function submitUserCredit() {
    if (!detail || selectedId === '') return
    const newCredit = parseInt(userCreditInput, 10)
    if (isNaN(newCredit)) return
    const delta = newCredit - Number(detail.credit ?? 0)
    setSubmitting(true)
    await apiClient.request(`/users/${selectedId}/credit/adjust`, {
      method: 'POST',
      body: JSON.stringify({ delta }),
    }).catch(() => {})
    setSubmitting(false)
    refresh()
  }

  async function submitClubCredit(clubId: number) {
    const cu = detail?.clubUsers.find((c) => c.clubId === clubId)
    if (!cu) return
    const newCredit = parseInt(clubCreditInputs[clubId] ?? '0', 10)
    if (isNaN(newCredit)) return
    const currentCredit = Number((cu.club as Record<string, unknown>).credit ?? 0)
    const delta = newCredit - currentCredit
    setSubmitting(true)
    await apiClient.request(`/clubs/${clubId}/credit/adjust`, {
      method: 'POST',
      body: JSON.stringify({ delta }),
    }).catch(() => {})
    setSubmitting(false)
    refresh()
  }

  const userFields = detail
    ? Object.fromEntries(Object.entries(detail).filter(([k]) => !HIDDEN_USER_FIELDS.has(k)))
    : null

  const creditInput = (value: string, onChange: (v: string) => void) => (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-32 border border-emerald-300 rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
    />
  )

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800 font-mono">Debug: User / Club</h1>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs font-mono px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
          >
            {loading ? '読み込み中…' : '↻ 更新'}
          </button>
        </div>

        {/* User selector */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            ユーザーを選択
          </label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
          >
            <option value="">— 選択してください —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                [{u.id}] {u.name} &lt;{u.email}&gt;
              </option>
            ))}
          </select>
        </div>

        {loading && (
          <p className="text-sm text-gray-400 font-mono">読み込み中...</p>
        )}

        {/* User fields */}
        {userFields && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              users — id: {detail?.id as number}
            </h2>
            <FieldTable
              data={userFields as Record<string, unknown>}
              editableFields={{
                credit: creditInput(userCreditInput, setUserCreditInput),
              }}
            />
            <div className="mt-3 flex justify-end">
              <button
                onClick={submitUserCredit}
                disabled={submitting}
                className="text-xs font-mono px-4 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors"
              >
                {submitting ? '更新中…' : 'User credit を更新'}
              </button>
            </div>
          </div>
        )}

        {/* Club memberships */}
        {detail && detail.clubUsers.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              club_users ({detail.clubUsers.length} 件)
            </h2>
            {detail.clubUsers.map((cu) => (
              <div key={cu.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-400 font-mono">
                    club_users.id = {cu.id} → clubs.id = {cu.clubId} / role: {cu.role.name}
                  </p>
                  <Link
                    href={`/debug/club/${cu.clubId}`}
                    className="text-xs font-mono px-3 py-1 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    クラブへ →
                  </Link>
                </div>
                <FieldTable
                  data={cu.club as Record<string, unknown>}
                  editableFields={{
                    credit: creditInput(
                      clubCreditInputs[cu.clubId] ?? '',
                      (v) => setClubCreditInputs((prev) => ({ ...prev, [cu.clubId]: v })),
                    ),
                  }}
                />
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => submitClubCredit(cu.clubId)}
                    disabled={submitting}
                    className="text-xs font-mono px-4 py-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-colors"
                  >
                    {submitting ? '更新中…' : 'Club credit を更新'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {detail && detail.clubUsers.length === 0 && (
          <p className="text-sm text-gray-400 font-mono">このユーザーはどのクラブにも所属していません。</p>
        )}

        {/* Subscriptions */}
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

        {/* Payments */}
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
