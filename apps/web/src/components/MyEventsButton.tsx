'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getStoredUser, getSelectedClubId, getStoredClubs } from '@/lib/auth'
import { apiClient } from '@/lib/api'

export default function MyEventsButton() {
  const [show, setShow] = useState(false)
  const [active, setActive] = useState(true)

  useEffect(() => {
    const user = getStoredUser()
    if (!user) return
    const clubId = getSelectedClubId() ?? getStoredClubs()[0]?.id
    if (!clubId) return

    apiClient.getEvents({ clubId })
      .then((evs) => { if (evs.length > 0) setShow(true) })
      .catch(() => {})

    apiClient.getActiveSubscription(user.id)
      .then((res) => setActive(res.active))
      .catch(() => {})
  }, [])

  if (!show) return null

  if (!active) {
    return (
      <span
        title="サブスクリプションが失効しています"
        className="bg-gray-100 text-gray-400 border-2 border-gray-200 px-8 py-3 rounded-lg font-semibold cursor-not-allowed"
      >
        マイイベント
      </span>
    )
  }

  return (
    <Link
      href="/events"
      className="bg-white hover:bg-gray-50 text-emerald-600 border-2 border-emerald-600 px-8 py-3 rounded-lg font-semibold transition-colors"
    >
      マイイベント
    </Link>
  )
}
