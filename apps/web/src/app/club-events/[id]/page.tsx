'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type Event } from '@/lib/api'
import { getStoredUser, getStoredClubs, getSelectedClubId } from '@/lib/auth'

interface Post {
  id: number
  contents: string
  createdAt: string
  user: { id: number; name: string; email: string }
  event: { id: number; name: string } | null
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ClubEventDetailPage() {
  const params = useParams()
  const eventId = Number(params.id)

  const [event, setEvent] = useState<Event | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [isManager, setIsManager] = useState(false)

  // Retrospective edit state
  const [retroEditing, setRetroEditing] = useState(false)
  const [retroText, setRetroText] = useState('')
  const [retroSaving, setRetroSaving] = useState(false)

  // Banner state
  const [bannerUploading, setBannerUploading] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function load() {
      try {
        const [ev, ps] = await Promise.all([
          apiClient.request<Event>(`/events/${eventId}`),
          apiClient.getPosts({ eventId }),
        ])
        setEvent(ev)
        setRetroText(ev.retrospective ?? '')
        setPosts(ps as Post[])

        const user = getStoredUser()
        if (user) {
          const clubs = getStoredClubs()
          const selectedId = getSelectedClubId()
          const clubId = ev.clubId ?? selectedId
          const membership = clubs.find((c) => c.id === clubId)
          const manager = membership?.role === 'CLUBMANAGER'
          if (user.role === 'ADMIN' || user.role === 'DEVELOPER' || manager) setCanEdit(true)
          if (manager) setIsManager(true)
        }
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [eventId])

  async function handleRetroSave() {
    if (!event) return
    setRetroSaving(true)
    try {
      const updated = await apiClient.updateEvent(eventId, {
        retrospective: retroText.trim() || null,
      })
      setEvent((prev) => prev ? { ...prev, retrospective: updated.retrospective } : prev)
      setRetroEditing(false)
    } finally {
      setRetroSaving(false)
    }
  }

  function handleRetroCancel() {
    setRetroText(event?.retrospective ?? '')
    setRetroEditing(false)
  }

  async function handleBannerSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBannerUploading(true)
    try {
      const result = await apiClient.uploadEventBanner(eventId, file)
      setEvent((prev) => prev ? { ...prev, bannerImage: result.bannerImage } : prev)
    } finally {
      setBannerUploading(false)
      if (bannerInputRef.current) bannerInputRef.current.value = ''
    }
  }

  async function handleBannerDelete() {
    if (!confirm('バナー画像を削除しますか？')) return
    setBannerUploading(true)
    try {
      await apiClient.deleteEventBanner(eventId)
      setEvent((prev) => prev ? { ...prev, bannerImage: null } : prev)
    } finally {
      setBannerUploading(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">イベントが見つかりません。</p>
          <Link href="/club-events" className="text-emerald-600 hover:underline">
            クラブイベントへ戻る
          </Link>
        </div>
      </div>
    )
  }

  const now = new Date()
  const start = event?.startAt ? new Date(event.startAt) : null
  const end = event?.endAt ? new Date(event.endAt) : null
  const isOngoing = start && start <= now && (!end || end >= now)
  const isPast = start && start < now && end && end < now

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-3xl">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
          <Link href="/club-events" className="flex items-center gap-1 hover:text-emerald-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            クラブイベント
          </Link>
          <span>/</span>
          <span className="text-gray-800 font-medium">{event?.name ?? '…'}</span>
        </div>

        {/* Event info card */}
        {loading ? (
          <div className="bg-white rounded-xl shadow mb-8 animate-pulse">
            <div className="h-48 bg-gray-200 rounded-t-xl" />
            <div className="p-6 space-y-3">
              <div className="h-6 bg-gray-200 rounded w-1/2" />
              <div className="h-4 bg-gray-200 rounded w-1/3" />
            </div>
          </div>
        ) : event && (
          <div className="bg-white rounded-xl shadow mb-8">
            {/* Banner image */}
            {event.bannerImage ? (
              <div className="relative">
                <img
                  src={event.bannerImage}
                  alt={event.name}
                  className="w-full rounded-t-xl object-cover max-h-56"
                />
                {isManager && (
                  <div className="absolute bottom-2 right-2 flex gap-1.5">
                    <button
                      onClick={() => bannerInputRef.current?.click()}
                      disabled={bannerUploading}
                      className="text-xs bg-white/90 hover:bg-white text-gray-700 px-2.5 py-1 rounded-lg shadow font-medium transition-colors disabled:opacity-50"
                    >
                      {bannerUploading ? '…' : '差し替え'}
                    </button>
                    <button
                      onClick={handleBannerDelete}
                      disabled={bannerUploading}
                      className="text-xs bg-white/90 hover:bg-white text-red-500 px-2.5 py-1 rounded-lg shadow font-medium transition-colors disabled:opacity-50"
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            ) : isManager && (
              <button
                onClick={() => bannerInputRef.current?.click()}
                disabled={bannerUploading}
                className="w-full border-b border-dashed border-gray-200 hover:border-emerald-400 rounded-t-xl py-8 text-sm text-gray-400 hover:text-emerald-600 transition-colors disabled:opacity-50"
              >
                {bannerUploading ? 'アップロード中…' : 'クリックしてバナー画像を設定'}
              </button>
            )}

            <input
              ref={bannerInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleBannerSelect}
            />

            <div className="p-6">
              <div className="flex items-start gap-3 mb-3">
                <h1 className="text-2xl font-bold text-gray-900 flex-1">{event.name}</h1>
                {isOngoing && (
                  <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                    開催中
                  </span>
                )}
                {isPast && (
                  <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
                    終了
                  </span>
                )}
              </div>

              {event.description && (
                <p className="text-gray-600 text-sm mb-4 whitespace-pre-wrap">{event.description}</p>
              )}

              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
                {event.startAt && (
                  <span>開始: <span className="text-gray-700">{formatDate(event.startAt)}</span></span>
                )}
                {event.endAt && (
                  <span>終了: <span className="text-gray-700">{formatDate(event.endAt)}</span></span>
                )}
                {event.place && (
                  <span>📍 <span className="text-gray-700">{event.place}</span></span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Retrospective */}
        {!loading && (event?.retrospective || canEdit) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-amber-800 uppercase tracking-wide">振り返り</h2>
              {canEdit && !retroEditing && (
                <button
                  onClick={() => setRetroEditing(true)}
                  className="text-xs text-amber-700 hover:text-amber-900 font-medium transition-colors"
                >
                  {event?.retrospective ? '編集' : '追加'}
                </button>
              )}
            </div>

            {retroEditing ? (
              <div className="space-y-2">
                <textarea
                  value={retroText}
                  onChange={(e) => setRetroText(e.target.value)}
                  rows={4}
                  autoFocus
                  placeholder="イベントの振り返りを入力してください…"
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleRetroSave}
                    disabled={retroSaving}
                    className="text-sm bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    {retroSaving ? '保存中…' : '保存'}
                  </button>
                  <button
                    onClick={handleRetroCancel}
                    disabled={retroSaving}
                    className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            ) : event?.retrospective ? (
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{event.retrospective}</p>
            ) : (
              <p className="text-sm text-amber-600 italic">振り返りはまだ追加されていません。</p>
            )}
          </div>
        )}

        {/* Posts */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">
            関連投稿
            {!loading && (
              <span className="ml-2 text-sm font-normal text-gray-400">{posts.length}件</span>
            )}
          </h2>
          <Link
            href={`/posts/new?eventId=${eventId}`}
            className="text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg font-semibold transition-colors"
          >
            投稿する
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl shadow p-5 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-3" />
                <div className="h-3 bg-gray-200 rounded w-full mb-2" />
                <div className="h-3 bg-gray-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-5xl mb-4">🍄</div>
            <p className="text-gray-500 mb-2">このイベントにはまだ投稿がありません。</p>
            <p className="text-sm text-gray-400">最初の発見を投稿してみましょう！</p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="block bg-white rounded-xl shadow p-5 hover:shadow-md transition-shadow"
              >
                <p className="text-xs text-gray-400 mb-2">
                  {post.user.name} • {new Date(post.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' })}
                </p>
                <p className="text-gray-900 line-clamp-3 text-sm">{post.contents}</p>
                <p className="text-emerald-600 text-xs font-medium mt-3">詳細を見る →</p>
              </Link>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
