'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, type Event } from '@/lib/api'
import { getStoredUser, getSelectedClubId, getStoredClubs } from '@/lib/auth'

interface ClubDetail {
  id: number
  name: string
  introduction: string | null
  policy: string | null
  credit: number
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function ClubManagePage() {
  const router = useRouter()

  const [club, setClub] = useState<ClubDetail | null>(null)
  const [introduction, setIntroduction] = useState('')
  const [policy, setPolicy] = useState('')
  const [infoSaving, setInfoSaving] = useState(false)
  const [infoSaved, setInfoSaved] = useState(false)

  const [events, setEvents] = useState<Event[]>([])
  const [newEventName, setNewEventName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)

  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }

  async function loadClub(id: number) {
    const [clubData, creditData] = await Promise.all([
      apiClient.request<{ id: number; name: string; introduction: string | null; policy: string | null }>(`/clubs/${id}`),
      apiClient.getClubCredit(id),
    ])
    setClub({ ...clubData, credit: creditData.credit })
    setIntroduction(clubData.introduction ?? '')
    setPolicy(clubData.policy ?? '')
  }

  async function loadEvents(id: number) {
    setEventsLoading(true)
    try {
      const data = await apiClient.getEvents({ clubId: id })
      setEvents(data)
    } finally {
      setEventsLoading(false)
    }
  }

  useEffect(() => {
    const user = getStoredUser()
    if (!user) { router.replace('/login'); return }

    const id = getSelectedClubId()
    if (id) { loadClub(id); loadEvents(id) }

    function onClubChanged(e: globalThis.Event) {
      const { clubId: newId } = (e as CustomEvent).detail
      loadClub(newId)
      loadEvents(newId)
    }
    window.addEventListener('clubChanged', onClubChanged)
    return () => window.removeEventListener('clubChanged', onClubChanged)
  }, [router])

  async function handleInfoSave(e: React.FormEvent) {
    e.preventDefault()
    if (!club) return
    setInfoSaving(true)
    setInfoSaved(false)
    try {
      await apiClient.updateClub(club.id, {
        introduction: introduction.trim() || null,
        policy: policy.trim() || null,
      })
      setInfoSaved(true)
      setTimeout(() => setInfoSaved(false), 2000)
    } catch {
      showToast('保存に失敗しました。')
    } finally {
      setInfoSaving(false)
    }
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!club) return
    try {
      await apiClient.createEvent({ name: newEventName.trim(), clubId: club.id })
      setNewEventName('')
      loadEvents(club.id)
    } catch {
      showToast('イベントの作成に失敗しました。')
    }
  }

  async function handleDeleteEvent(id: number) {
    try {
      await apiClient.deleteEvent(id)
      setConfirmDeleteId(null)
      setEvents((prev) => prev.filter((ev) => ev.id !== id))
    } catch {
      showToast('削除に失敗しました。')
    }
  }

  async function handleCheckout() {
    if (!club) return
    const planId = process.env.NEXT_PUBLIC_STRIPE_PRICE_CLUB
    if (!planId) { setCheckoutError('プランIDが設定されていません。'); return }
    setCheckoutLoading(true)
    setCheckoutError('')
    try {
      const { url } = await apiClient.createCheckoutSession({ planId, clubId: club.id })
      window.location.href = url
    } catch {
      setCheckoutError('決済ページへの移動に失敗しました。')
      setCheckoutLoading(false)
    }
  }

  if (!club) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-400">クラブを選択してください。</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">

        <div>
          <h1 className="text-2xl font-bold text-gray-900">{club.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">クラブ管理</p>
        </div>

        {/* ── Club info ─────────────────────────────────────────── */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold text-gray-800 mb-4">クラブ情報</h2>
          <form onSubmit={handleInfoSave} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">紹介文</label>
              <textarea
                value={introduction}
                onChange={(e) => setIntroduction(e.target.value)}
                rows={3}
                placeholder="クラブの紹介文を入力…"
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">クラブポリシー</label>
              <textarea
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
                rows={5}
                placeholder="クラブのポリシーや規則を入力…"
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={infoSaving}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                {infoSaving ? '保存中…' : '保存'}
              </button>
              {infoSaved && <span className="text-sm text-emerald-600">保存しました</span>}
            </div>
          </form>
        </section>

        {/* ── Credits ───────────────────────────────────────────── */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold text-gray-800 mb-4">クレジット</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-bold text-emerald-600 tabular-nums">
                {club.credit.toLocaleString()}
                <span className="text-base font-normal text-gray-400 ml-1">cr</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">現在の残高</p>
            </div>
            <div className="text-right space-y-2">
              <button
                onClick={handleCheckout}
                disabled={checkoutLoading}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                {checkoutLoading ? '移動中…' : 'クレジットを購入'}
              </button>
              {checkoutError && <p className="text-xs text-red-500">{checkoutError}</p>}
            </div>
          </div>
        </section>

        {/* ── Events ────────────────────────────────────────────── */}
        <section className="bg-white rounded-xl shadow p-6">
          <h2 className="font-semibold text-gray-800 mb-4">イベント管理</h2>

          {/* Create form */}
          <form onSubmit={handleCreateEvent} className="flex gap-2 mb-6">
            <input
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              placeholder="イベント名"
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              required
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap"
            >
              追加
            </button>
          </form>

          {/* Event list */}
          {eventsLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">まだイベントがありません。</p>
          ) : (
            <div className="divide-y border rounded-lg overflow-hidden">
              {events.map((ev) => (
                <div key={ev.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="text-xs text-gray-400 w-24 shrink-0">{formatDate(ev.startAt)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{ev.name}</p>
                    {ev.description && (
                      <p className="text-xs text-gray-400 truncate">{ev.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      onClick={() => router.push(`/admin/events/${ev.id}`)}
                      className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                    >
                      編集
                    </button>
                    {confirmDeleteId === ev.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">本当に？</span>
                        <button
                          onClick={() => handleDeleteEvent(ev.id)}
                          className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded font-semibold"
                        >
                          はい
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          いいえ
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(ev.id)}
                        className="text-sm text-red-400 hover:text-red-600 font-medium transition-colors"
                      >
                        削除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
