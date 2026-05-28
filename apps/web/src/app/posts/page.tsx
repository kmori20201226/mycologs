'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api'

interface Post {
  id: number
  contents: string
  createdAt: string
  visibility: string
  user: { id: number; name: string; handleName: string | null }
}

export default function PostsPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiClient.getPosts()
      .then((data) => setPosts(data as Post[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

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
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg shadow-md p-6 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-1/3 mb-3" />
                <div className="h-4 bg-gray-200 rounded w-full mb-2" />
                <div className="h-4 bg-gray-200 rounded w-5/6" />
              </div>
            ))}
          </div>
        ) : posts.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow block"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-600 text-sm">
                    {post.user.handleName ?? post.user.name} · {new Date(post.createdAt).toLocaleDateString('ja-JP')}
                  </p>
                  {post.visibility !== 'PUBLIC' && (
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${post.visibility === 'PRIVATE' ? 'bg-yellow-50 text-yellow-700' : 'bg-blue-50 text-blue-600'}`}>
                      {post.visibility === 'PRIVATE' ? '自分のみ' : 'クラブのみ'}
                    </span>
                  )}
                </div>
                <p className={`line-clamp-3 ${post.contents ? 'text-gray-900' : 'text-gray-400 italic'}`}>
                  {post.contents || new Date(post.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-emerald-600 font-medium text-sm mt-4">詳細を見る →</p>
              </Link>
            ))}
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
        )}
      </div>
    </div>
  )
}
