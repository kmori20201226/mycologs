'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getStoredUser, getStoredClubs } from '@/lib/auth'

export default function ClubEventsButton() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const user = getStoredUser()
    if (!user) return
    const clubs = getStoredClubs()
    if (clubs.length > 0) setShow(true)
  }, [])

  if (!show) return null

  return (
    <Link
      href="/club-events"
      className="bg-white hover:bg-gray-50 text-emerald-600 border-2 border-emerald-600 px-8 py-3 rounded-lg font-semibold transition-colors"
    >
      クラブイベント
    </Link>
  )
}
