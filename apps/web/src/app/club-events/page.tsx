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

function EventCard({ ev }: { ev: EventWithPostCount }) {
  const now = new Date()
  const start = ev.startAt ? new Date(ev.startAt) : null
  const end = ev.endAt ? new Date(ev.endAt) : null
  const isOngoing = start && start <= now && (!end || end >= now)

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-semibold text-gray-900">{ev.name}</p>
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

        <Link
          href={`/club-events/${ev.id}`}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-colors"
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
      </div>
    </div>
  )
}

export default function ClubEventsPage() {
  const router = useRouter()
  const [group, setGroup] = useState<ClubGroup | null>(null)
  const [loading, setLoading] = useState(true)

  const loadForClub = useCallback(async (clubId: number, allClubs: ClubMembership[]) => {
    const club = allClubs.find((c) => c.id === clubId)
    if (!club) return
    setLoading(true)
    try {
      const events = await apiClient.getEvents({ clubId })

      // Sort by startAt ascending; null startAt goes last
      const sorted = [...events].sort((a, b) => {
        if (!a.startAt && !b.startAt) return 0
        if (!a.startAt) return 1
        if (!b.startAt) return -1
        return new Date(a.startAt).getTime() - new Date(b.startAt).getTime()
      })

      // Fetch post count for each event in parallel
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

      // Sort clubs by creation date ascending
      const sorted = [...clubs].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )

      // Use the header-selected club if the user belongs to it, otherwise the first
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
            <h2 className="text-lg font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">
              {group.club.name}
            </h2>

            {group.upcoming.length === 0 && group.past.length === 0 && (
              <p className="text-sm text-gray-400">このクラブにはまだイベントがありません。</p>
            )}

            {group.upcoming.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-semibold text-emerald-600 uppercase tracking-widest mb-3">
                  予定・開催中
                </h3>
                <div className="space-y-3">
                  {group.upcoming.map((ev) => <EventCard key={ev.id} ev={ev} />)}
                </div>
              </div>
            )}

            {group.past.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  過去のイベント
                </h3>
                <div className="space-y-3 opacity-70">
                  {group.past.map((ev) => <EventCard key={ev.id} ev={ev} />)}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
