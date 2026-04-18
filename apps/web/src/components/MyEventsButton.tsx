'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getStoredUser, getSelectedClubId, getStoredClubs } from '@/lib/auth'
import { apiClient } from '@/lib/api'

export default function MyEventsButton() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const user = getStoredUser()
    if (!user) return
    const clubId = getSelectedClubId() ?? getStoredClubs()[0]?.id
    if (!clubId) return
    apiClient.getEvents({ clubId })
      .then((evs) => { if (evs.length > 0) setShow(true) })
      .catch(() => {})
  }, [])

  if (!show) return null

  return (
    <Link
      href="/events"
      className="bg-white hover:bg-gray-50 text-emerald-600 border-2 border-emerald-600 px-8 py-3 rounded-lg font-semibold transition-colors"
    >
      マイイベント
    </Link>
  )
}
