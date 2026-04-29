'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

interface ProfileData {
  id: number
  name: string
  handleName: string | null
  email: string
  createdAt: string
  postCount: number
  identificationCount: number
  replyCount: number
  recentPosts: {
    id: number
    contents: string
    createdAt: string
    event: { id: number; name: string } | null
    _count: { media: number; identifications: number }
  }[]
}

export default function ProfilePage() {
  const router = useRouter()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [handleInput, setHandleInput] = useState('')
  const [handleSaving, setHandleSaving] = useState(false)
  const [handleError, setHandleError] = useState('')
  const [handleSuccess, setHandleSuccess] = useState(false)
  const [credit, setCredit] = useState<number | null>(null)
  const [subActive, setSubActive] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  useEffect(() => {
    const user = getStoredUser()
    if (!user) {
      router.replace('/login')
      return
    }
    apiClient.getUserProfile(user.id)
      .then((p) => { setProfile(p); setHandleInput(p.handleName ?? '') })
      .catch(() => setNotFound(true))
    apiClient.request<{ userId: number; credit: number }>(`/users/${user.id}/credit`)
      .then((r) => setCredit(r.credit))
      .catch(() => {})
    apiClient.getActiveSubscription(user.id)
      .then((r) => setSubActive(r.active))
      .catch(() => {})
  }, [router])

  async function handleManageSubscription() {
    const user = getStoredUser()
    if (!user) return
    setPortalLoading(true)
    try {
      const { url } = await apiClient.openBillingPortal({ userId: user.id })
      if (url) window.location.href = url
    } catch { /* ignore */ }
    finally { setPortalLoading(false) }
  }

  async function handleSaveHandleName(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return
    setHandleError('')
    setHandleSuccess(false)
    if (handleInput.trim().length === 0) {
      setHandleError('空白以外の文字を含めてください。')
      return
    }
    setHandleSaving(true)
    try {
      const updated = await apiClient.updateUserHandleName(profile.id, handleInput)
      setProfile((p) => p ? { ...p, handleName: updated.handleName } : p)
      setHandleInput(updated.handleName ?? '')
      setHandleSuccess(true)
      setTimeout(() => setHandleSuccess(false), 3000)
    } catch (err: any) {
      const msg = err?.message ?? ''
      if (msg.includes('409') || msg.includes('使用されています')) {
        setHandleError('このハンドルネームはすでに使用されています。')
      } else {
        setHandleError('保存に失敗しました。もう一度お試しください。')
      }
    } finally {
      setHandleSaving(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">プロフィールが見つかりません。</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-8 max-w-2xl space-y-4">
          <div className="bg-white rounded-xl shadow p-6 animate-pulse">
            <div className="h-5 bg-gray-200 rounded w-1/3 mb-3" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        {/* Header */}
        <div className="bg-white rounded-xl shadow p-6 mb-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-2xl font-bold shrink-0">
            {profile.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900">{profile.name}</h1>
            {profile.handleName && (
              <p className="text-sm text-emerald-600 font-medium">@{profile.handleName}</p>
            )}
            <p className="text-sm text-gray-500 truncate">{profile.email}</p>
            <p className="text-xs text-gray-400 mt-1">
              {new Date(profile.createdAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long' })}から参加
            </p>
          </div>
        </div>

        {/* Handle name edit */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">ハンドルネーム</h2>
          <p className="text-xs text-gray-500 mb-3">
            投稿・同定・コメントで表示される名前です。他のユーザーと重複できません。
          </p>
          <form onSubmit={handleSaveHandleName} className="flex flex-col gap-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={handleInput}
                onChange={(e) => { setHandleInput(e.target.value); setHandleError(''); setHandleSuccess(false) }}
                placeholder="例: kinoko_taro"
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <button
                type="submit"
                disabled={handleSaving}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shrink-0"
              >
                {handleSaving ? '保存中…' : '保存'}
              </button>
            </div>
            {handleError && (
              <p className="text-xs text-red-600">{handleError}</p>
            )}
            {handleSuccess && (
              <p className="text-xs text-emerald-600">ハンドルネームを保存しました。</p>
            )}
          </form>
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-xl shadow p-4 mb-6 flex flex-wrap gap-3">
          <Link
            href="/club-request"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            クラブへの参加申請
          </Link>
        </div>

        {/* Credit & subscription */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">クレジット・サブスクリプション</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-emerald-600">
                {credit !== null ? credit.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">残クレジット</p>
            </div>
            <div className="text-right">
              {subActive ? (
                <div className="flex flex-col items-end gap-2">
                  <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">有効</span>
                  <button
                    onClick={handleManageSubscription}
                    disabled={portalLoading}
                    className="text-xs text-emerald-600 hover:underline disabled:opacity-50"
                  >
                    {portalLoading ? '移動中...' : 'サブスクリプションを管理'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-end gap-2">
                  <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">未加入</span>
                  <Link href="/subscription" className="text-xs text-emerald-600 hover:underline">
                    プランを見る
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <StatCard label="投稿" value={profile.postCount} />
          <StatCard label="同定" value={profile.identificationCount} />
          <StatCard label="コメント" value={profile.replyCount} />
        </div>

        {/* Recent posts */}
        <div className="bg-white rounded-xl shadow p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            最近の投稿
          </h2>

          {profile.recentPosts.length === 0 ? (
            <p className="text-sm text-gray-400">まだ投稿がありません。</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {profile.recentPosts.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/posts/${post.id}`}
                    className="flex items-start gap-3 py-3 hover:bg-gray-50 -mx-3 px-3 rounded-lg transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 line-clamp-2">{post.contents}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span>{new Date(post.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                        {post.event && (
                          <span className="text-emerald-600">{post.event.name}</span>
                        )}
                        {post._count.media > 0 && (
                          <span className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {post._count.media}
                          </span>
                        )}
                        {post._count.identifications > 0 && (
                          <span className="flex items-center gap-1">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {post._count.identifications}
                          </span>
                        )}
                      </div>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-300 shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {profile.postCount > profile.recentPosts.length && (
            <Link
              href="/posts"
              className="mt-4 block text-center text-sm text-emerald-600 hover:underline"
            >
              すべての投稿を見る →
            </Link>
          )}
        </div>

      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl shadow p-4 text-center">
      <p className="text-2xl font-bold text-emerald-600">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  )
}
