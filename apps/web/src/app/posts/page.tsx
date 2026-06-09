'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api'

const PAGE_SIZE = Number(process.env.NEXT_PUBLIC_POSTS_PAGE_SIZE ?? '9')

interface Post {
  id: number
  contents: string
  createdAt: string
  visibility: string
  thumbnail: string | null
  user: { id: number; name: string; handleName: string | null }
  event: { id: number; name: string; publicPlace: string | null } | null
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  useEffect(() => {
    apiClient.getPosts()
      .then((data) => setPosts(data as Post[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const visiblePosts = posts.slice(0, visibleCount)
  const hasMore = visibleCount < posts.length

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
        ) : posts.length > 0 ? (
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
                          {post.visibility === 'PRIVATE' ? '自分のみ' : 'クラブのみ'}
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
        )}
      </div>
    </div>
  )
}
