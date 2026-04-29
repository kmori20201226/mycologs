'use client'

import { Suspense } from 'react'
import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { setToken, setStoredUser, type UserLevelRole } from '@/lib/auth'

function LineCompleteInner() {
  const searchParams = useSearchParams()

  useEffect(() => {
    const token = searchParams.get('token')
    const id    = searchParams.get('id')
    const name  = searchParams.get('name')
    const email = searchParams.get('email')
    const role  = searchParams.get('role')

    if (token && id && name && email) {
      setToken(token)
      setStoredUser({ id: Number(id), name, email, role: (role as UserLevelRole) ?? null })
      window.location.replace('/')
    } else {
      window.location.replace('/login?error=line_failed')
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500 text-sm">LINEログイン処理中…</p>
    </div>
  )
}

export default function LineCompletePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 text-sm">LINEログイン処理中…</p>
      </div>
    }>
      <LineCompleteInner />
    </Suspense>
  )
}
