'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type Event } from '@/lib/api'
import { getStoredUser, getStoredClubs, setStoredClubs, getSelectedClubId, type ClubMembership } from '@/lib/auth'

interface EventWithPostCount extends Event {
  postCount: number
}

interface ClubGroup {
  club: ClubMembership
  upcoming: EventWithPostCount[]
  past: EventWithPostCount[]
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatDateOnly(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  return iso.slice(0, 16)
}

// ── EventCard ──────────────────────────────────────────────────────────────────

interface EventCardProps {
  ev: EventWithPostCount
  canManage: boolean
  onEdited: (updated: Event) => void
  onDeleted: (id: number) => void
}

function EventCard({ ev, canManage, onEdited, onDeleted }: EventCardProps) {
  const now = new Date()
  const start = ev.startAt ? new Date(ev.startAt) : null
  const end = ev.endAt ? new Date(ev.endAt) : null
  const isOngoing = start && start <= now && (!end || end >= now)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: ev.name,
    description: ev.description ?? '',
    place: ev.place ?? '',
    startAt: toDatetimeLocal(ev.startAt),
    endAt: toDatetimeLocal(ev.endAt),
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function resetForm() {
    setForm({
      name: ev.name,
      description: ev.description ?? '',
      place: ev.place ?? '',
      startAt: toDatetimeLocal(ev.startAt),
      endAt: toDatetimeLocal(ev.endAt),
    })
  }

  async function handleSave() {
    setSaving(true)
    try {
      const updated = await apiClient.updateEvent(ev.id, {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        place: form.place.trim() || null,
        startAt: form.startAt || null,
        endAt: form.endAt || null,
      })
      onEdited(updated)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`「${ev.name}」を削除しますか？`)) return
    setDeleting(true)
    try {
      await apiClient.deleteEvent(ev.id)
      onDeleted(ev.id)
    } finally {
      setDeleting(false)
    }
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-emerald-200 px-5 py-4 space-y-3">
        <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">イベントを編集</p>
        <input
          autoFocus
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="イベント名 *"
        />
        <textarea
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
          rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="説明"
        />
        <input
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          value={form.place}
          onChange={(e) => setForm({ ...form, place: e.target.value })}
          placeholder="場所"
        />
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-0.5 block">開始</label>
            <input
              type="datetime-local"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              value={form.startAt}
              onChange={(e) => setForm({ ...form, startAt: e.target.value })}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-0.5 block">終了</label>
            <input
              type="datetime-local"
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              value={form.endAt}
              onChange={(e) => setForm({ ...form, endAt: e.target.value })}
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving || !form.name.trim()}
            className="text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg font-medium transition-colors"
          >
            {saving ? '保存中…' : '保存'}
          </button>
          <button
            onClick={() => { setEditing(false); resetForm() }}
            disabled={saving}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            キャンセル
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-semibold text-gray-900">{ev.startAt ? `${formatDateOnly(ev.startAt)} ${ev.name}` : ev.name}</p>
            {isOngoing && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                開催中
              </span>
            )}
          </div>
          {ev.description && (
            <p className="text-sm text-gray-500 mb-2">{ev.description}</p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            {ev.startAt && <span>開始: {formatDate(ev.startAt)}</span>}
            {ev.endAt && <span>終了: {formatDate(ev.endAt)}</span>}
            {ev.place && <span>📍 {ev.place}</span>}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-2">
          <Link
            href={`/club-events/${ev.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            投稿
            {ev.postCount > 0 && (
              <span className="bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0.5 rounded-full font-semibold">
                {ev.postCount}
              </span>
            )}
          </Link>

          {canManage && (
            <div className="flex gap-1">
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-gray-500 hover:text-emerald-700 px-2 py-1 rounded border border-gray-200 hover:border-emerald-300 transition-colors"
              >
                編集
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded border border-gray-200 hover:border-red-300 transition-colors disabled:opacity-50"
              >
                {deleting ? '…' : '削除'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── AddEventForm ───────────────────────────────────────────────────────────────

interface AddEventFormProps {
  clubId: number
  userId: number
  onAdded: (ev: EventWithPostCount) => void
  onCancel: () => void
}

function AddEventForm({ clubId, userId, onAdded, onCancel }: AddEventFormProps) {
  const [form, setForm] = useState({ name: '', description: '', startAt: '', endAt: '' })
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const created = await apiClient.createEvent({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        startAt: form.startAt || undefined,
        endAt: form.endAt || undefined,
        clubId,
        userId,
      })
      onAdded({ ...created, postCount: 0 })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-emerald-200 px-5 py-4 mb-4 space-y-3">
      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">新しいイベントを追加</p>
      <input
        autoFocus
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        placeholder="イベント名 *"
      />
      <textarea
        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
        rows={2}
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
        placeholder="説明"
      />
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="text-xs text-gray-400 mb-0.5 block">開始</label>
          <input
            type="datetime-local"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            value={form.startAt}
            onChange={(e) => setForm({ ...form, startAt: e.target.value })}
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-400 mb-0.5 block">終了</label>
          <input
            type="datetime-local"
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            value={form.endAt}
            onChange={(e) => setForm({ ...form, endAt: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSubmit}
          disabled={saving || !form.name.trim()}
          className="text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg font-medium transition-colors"
        >
          {saving ? '追加中…' : '追加'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ClubEventsPage() {
  const router = useRouter()
  const [group, setGroup] = useState<ClubGroup | null>(null)
  const [canManage, setCanManage] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadForClub = useCallback(async (clubId: number, allClubs: ClubMembership[]) => {
    const club = allClubs.find((c) => c.id === clubId)
    if (!club) return
    setLoading(true)
    setShowAddForm(false)
    try {
      const events = await apiClient.getEvents({ clubId })

      const sorted = [...events].sort((a, b) => {
        if (!a.startAt && !b.startAt) return 0
        if (!a.startAt) return 1
        if (!b.startAt) return -1
        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      })

      const eventsWithCount: EventWithPostCount[] = await Promise.all(
        sorted.map(async (ev) => {
          const posts = await apiClient.getPosts({ eventId: ev.id })
          return { ...ev, postCount: posts.length }
        })
      )

      const now = new Date()
      const upcoming = eventsWithCount.filter(
        (e) => !e.startAt || new Date(e.startAt) >= now || (e.endAt && new Date(e.endAt) >= now)
      )
      const past = eventsWithCount.filter(
        (e) => e.startAt && new Date(e.startAt) < now && (!e.endAt || new Date(e.endAt) < now)
      )

      setGroup({ club, upcoming, past })

      const user = getStoredUser()
      const manage =
        user?.role === 'ADMIN' ||
        user?.role === 'DEVELOPER' ||
        club.role === 'CLUBMANAGER'
      setCanManage(manage)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const user = getStoredUser()
    if (!user) { router.replace('/login'); return }

    async function init() {
      const clubs = await apiClient.request<ClubMembership[]>('/me/clubs')
      setStoredClubs(clubs)
      if (clubs.length === 0) { setLoading(false); return }

      const sorted = [...clubs].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )

      const headerId = getSelectedClubId()
      const active = sorted.find((c) => c.id === headerId) ?? sorted[0]
      await loadForClub(active.id, sorted)
    }

    init()

    function onClubChanged(e: CustomEvent<{ clubId: number }>) {
      const { clubId: newId } = e.detail
      loadForClub(newId, getStoredClubs())
    }

    window.addEventListener('clubChanged', onClubChanged as EventListener)
    return () => window.removeEventListener('clubChanged', onClubChanged as EventListener)
  }, [router, loadForClub])

  function handleEdited(updated: Event) {
    setGroup((prev) => {
      if (!prev) return prev
      const replace = (list: EventWithPostCount[]) =>
        list.map((e) => e.id === updated.id ? { ...e, ...updated } : e)
      return { ...prev, upcoming: replace(prev.upcoming), past: replace(prev.past) }
    })
  }

  function handleDeleted(id: number) {
    setGroup((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        upcoming: prev.upcoming.filter((e) => e.id !== id),
        past: prev.past.filter((e) => e.id !== id),
      }
    })
  }

  function handleAdded(ev: EventWithPostCount) {
    setShowAddForm(false)
    // Insert into upcoming (newly created events are always upcoming)
    setGroup((prev) => {
      if (!prev) return prev
      const upcoming = [...prev.upcoming, ev].sort((a, b) => {
        if (!a.startAt && !b.startAt) return 0
        if (!a.startAt) return 1
        if (!b.startAt) return -1
        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      })
      return { ...prev, upcoming }
    })
  }

  const currentUserId = getStoredUser()?.id ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-3xl">

        <h1 className="text-2xl font-bold text-gray-900 mb-8">クラブイベント</h1>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-white rounded-xl shadow-sm animate-pulse" />
            ))}
          </div>
        ) : !group ? (
          <p className="text-sm text-gray-400">所属するクラブがありません。</p>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-800">{group.club.name}</h2>
              {canManage && !showAddForm && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  追加
                </button>
              )}
            </div>

            {canManage && showAddForm && (
              <AddEventForm
                clubId={group.club.id}
                userId={currentUserId}
                onAdded={handleAdded}
                onCancel={() => setShowAddForm(false)}
              />
            )}

            {group.upcoming.length === 0 && group.past.length === 0 && !showAddForm && (
              <p className="text-sm text-gray-400">このクラブにはまだイベントがありません。</p>
            )}

            {group.upcoming.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-3">
                  予定・開催中
                </h3>
                <div className="space-y-3">
                  {group.upcoming.map((ev) => (
                    <EventCard
                      key={ev.id}
                      ev={ev}
                      canManage={canManage}
                      onEdited={handleEdited}
                      onDeleted={handleDeleted}
                    />
                  ))}
                </div>
              </div>
            )}

            {group.past.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  過去のイベント
                </h3>
                <div className="space-y-3 opacity-70">
                  {group.past.map((ev) => (
                    <EventCard
                      key={ev.id}
                      ev={ev}
                      canManage={canManage}
                      onEdited={handleEdited}
                      onDeleted={handleDeleted}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
