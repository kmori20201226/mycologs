'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api'

const PAGE_SIZE = Number(process.env.NEXT_PUBLIC_POSTS_PAGE_SIZE ?? '12')

// Browsing UI state (filters, how many are shown, scroll position) is persisted
// here so returning from an individual post lands back where you left off
// instead of scrolled to the top of a reset list.
const STORAGE_KEY = 'posts-browse-state'

interface Post {
  id: number
  contents: string
  createdAt: string
  takenAt: string | null
  visibility: string
  thumbnail: string | null
  user: { id: number; name: string; handleName: string | null }
  event: { id: number; name: string; publicPlace: string | null } | null
}

type Filters = { visibility: string; eventId: string; takenFrom: string; takenTo: string }
const EMPTY_FILTERS: Filters = { visibility: '', eventId: '', takenFrom: '', takenTo: '' }

const VISIBILITY_LABELS: Record<string, string> = {
  PUBLIC: '公開',
  CLUBMEMBERONLY: 'クラブのみ',
  PRIVATE: '自分のみ',
}

// Map UI filter state to the API query (dropping empty fields). Date bounds are
// sent as yyyy-mm-dd and interpreted server-side in JST.
function toQuery(f: Filters) {
  return {
    eventId: f.eventId ? Number(f.eventId) : undefined,
    visibility: f.visibility || undefined,
    takenFrom: f.takenFrom || undefined,
    takenTo: f.takenTo || undefined,
  }
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [events, setEvents] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  // Gates fetching/persisting until the persisted state has been restored, so we
  // fetch once with the restored filters rather than fetching defaults first.
  const [ready, setReady] = useState(false)

  // Latest scroll offset, tracked live so we can persist it when leaving.
  const scrollY = useRef(0)
  // Scroll offset to restore once posts have loaded (set during mount restore).
  const restoreScroll = useRef<number | null>(null)

  // Restore persisted browse state on mount (post-hydration to avoid mismatch).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { filters?: Filters; visibleCount?: number; scrollY?: number }
        if (saved.filters) setFilters({ ...EMPTY_FILTERS, ...saved.filters })
        if (saved.visibleCount) setVisibleCount(saved.visibleCount)
        if (typeof saved.scrollY === 'number') restoreScroll.current = saved.scrollY
      }
    } catch {}
    setReady(true)
  }, [])

  // Event options for the dropdown (independent of the active filters).
  useEffect(() => {
    apiClient.getPostFilterEvents().then(setEvents).catch(() => {})
  }, [])

  // Fetch the (server-filtered) list whenever the filters change.
  useEffect(() => {
    if (!ready) return
    setLoading(true)
    apiClient.getPosts(toQuery(filters))
      .then((data) => setPosts(data as Post[]))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }, [ready, filters])

  // Track scroll position without re-rendering.
  useEffect(() => {
    const onScroll = () => { scrollY.current = window.scrollY }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Persist state whenever it changes and when navigating away (unmount/pagehide).
  useEffect(() => {
    if (!ready) return
    const save = () => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          filters, visibleCount, scrollY: scrollY.current,
        }))
      } catch {}
    }
    save()
    window.addEventListener('pagehide', save)
    return () => { save(); window.removeEventListener('pagehide', save) }
  }, [ready, filters, visibleCount])

  // Once posts are loaded and laid out, jump back to the saved scroll offset.
  useEffect(() => {
    if (loading || restoreScroll.current == null) return
    const y = restoreScroll.current
    restoreScroll.current = null
    requestAnimationFrame(() => window.scrollTo(0, y))
  }, [loading])

  const visiblePosts = posts.slice(0, visibleCount)
  const hasMore = visibleCount < posts.length
  const anyFilter = filters.visibility || filters.eventId || filters.takenFrom || filters.takenTo

  // Changing a filter resets pagination so "load more" applies to the new set.
  function updateFilter(patch: Partial<Filters>) {
    setFilters((f) => ({ ...f, ...patch }))
    setVisibleCount(PAGE_SIZE)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">きのこ投稿</h1>
          <Link
            href="/posts/new"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
          >
            新規投稿
          </Link>
        </div>

        {/* Filters */}
        <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              公開範囲
              <select
                value={filters.visibility}
                onChange={(e) => updateFilter({ visibility: e.target.value })}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-emerald-500 focus:outline-none"
              >
                <option value="">すべて</option>
                <option value="PUBLIC">公開</option>
                <option value="CLUBMEMBERONLY">クラブのみ</option>
                <option value="PRIVATE">自分のみ</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              イベント
              <select
                value={filters.eventId}
                onChange={(e) => updateFilter({ eventId: e.target.value })}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-emerald-500 focus:outline-none max-w-[14rem]"
              >
                <option value="">すべて</option>
                {events.map((ev) => (
                  <option key={ev.id} value={String(ev.id)}>{ev.name}</option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              撮影日（から）
              <input
                type="date"
                value={filters.takenFrom}
                max={filters.takenTo || undefined}
                onChange={(e) => updateFilter({ takenFrom: e.target.value })}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-emerald-500 focus:outline-none"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              撮影日（まで）
              <input
                type="date"
                value={filters.takenTo}
                min={filters.takenFrom || undefined}
                onChange={(e) => updateFilter({ takenTo: e.target.value })}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-emerald-500 focus:outline-none"
              />
            </label>

            {anyFilter && (
              <button
                onClick={() => updateFilter(EMPTY_FILTERS)}
                className="text-sm text-gray-500 hover:text-emerald-600 underline underline-offset-2 pb-1.5"
              >
                クリア
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
            {[...Array(PAGE_SIZE)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-md overflow-hidden animate-pulse">
                <div className="aspect-square bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-2/3" />
                  <div className="h-3 bg-gray-200 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          anyFilter ? (
            <div className="text-center py-12">
              <div className="text-5xl mb-4">🔍</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">条件に合う投稿がありません</h3>
              <button
                onClick={() => updateFilter(EMPTY_FILTERS)}
                className="text-sm text-emerald-600 hover:text-emerald-700 underline underline-offset-2"
              >
                フィルターをクリア
              </button>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🍄</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">まだ投稿がありません</h3>
              <p className="text-gray-600 mb-6">最初のきのこ発見を投稿してみましょう！</p>
              <Link
                href="/posts/new"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
              >
                最初の投稿を作成
              </Link>
            </div>
          )
        ) : (
          <>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
              {visiblePosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/posts/${post.id}`}
                  className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow block"
                >
                  {post.thumbnail ? (
                    <div className="aspect-square overflow-hidden bg-gray-100">
                      <img
                        src={post.thumbnail}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                  ) : (
                    <div className="aspect-square bg-gray-100 flex items-center justify-center text-4xl">
                      🍄
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-gray-500 text-xs mb-1">
                      {post.user.handleName ?? post.user.name} · {new Date(post.createdAt).toLocaleDateString('ja-JP')}
                      {post.visibility !== 'PUBLIC' && (
                        <span className={`ml-2 px-1.5 py-0.5 rounded-full text-xs font-medium ${post.visibility === 'PRIVATE' ? 'bg-yellow-50 text-yellow-700' : 'bg-blue-50 text-blue-600'}`}>
                          {VISIBILITY_LABELS[post.visibility] ?? post.visibility}
                        </span>
                      )}
                    </p>
                    <p className={`text-sm line-clamp-2 ${post.contents ? 'text-gray-800' : 'text-gray-400 italic'}`}>
                      {post.contents || '(キャプションなし)'}
                    </p>
                    {post.event?.publicPlace && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-500">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="truncate">{post.event.publicPlace}</span>
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                  className="px-8 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold rounded-lg shadow-sm transition-colors"
                >
                  もっと見る ({posts.length - visibleCount} 件)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
