'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getStoredUser, getToken } from '@/lib/auth'

// Surfaces a silently-expired session. The auth token cookie has a 7-day max-age
// (lib/auth setToken) while the cached `user` in localStorage never expires and
// the JWT itself carries no exp. So once the cookie lapses the UI still looks
// logged in, yet every request goes out anonymous — PRIVATE/club posts drop out
// of lists and writes 401, with no feedback. "Was logged in (user still cached)
// but the token is gone" is therefore an exact signal that the session expired.
export default function SessionExpiryBanner() {
  const [expired, setExpired] = useState(false)

  useEffect(() => {
    const check = () => setExpired(!!getStoredUser() && !getToken())
    check()
    // A tab left open past the 7-day mark won't re-run mount effects, so re-check
    // whenever the user returns to it.
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  if (!expired) return null

  return (
    <div className="bg-amber-50 border-b border-amber-200" role="alert">
      <div className="container mx-auto px-4 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-amber-500">⚠️</span>
        <span className="font-medium text-amber-900">セッションの有効期限が切れました。</span>
        <span className="text-amber-800">投稿の表示や作成には、もう一度ログインしてください。</span>
        <Link
          href="/login"
          className="ml-auto shrink-0 rounded-lg bg-amber-600 px-3 py-1 font-semibold text-white transition-colors hover:bg-amber-700"
        >
          再ログイン
        </Link>
      </div>
    </div>
  )
}
