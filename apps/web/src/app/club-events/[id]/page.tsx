'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type Event } from '@/lib/api'

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

  useEffect(() => {
    async function load() {
      try {
        const [ev, ps] = await Promise.all([
          apiClient.request<Event>(`/events/${eventId}`),
          apiClient.getPosts({ eventId }),
        ])
        setEvent(ev)
        setPosts(ps as Post[])
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [eventId])

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
          <div className="bg-white rounded-xl shadow p-6 mb-8 animate-pulse space-y-3">
            <div className="h-6 bg-gray-200 rounded w-1/2" />
            <div className="h-4 bg-gray-200 rounded w-1/3" />
          </div>
        ) : event && (
          <div className="bg-white rounded-xl shadow p-6 mb-8">
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
            href="/posts/new"
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
