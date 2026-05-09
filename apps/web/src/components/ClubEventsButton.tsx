'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getStoredUser, getStoredClubs } from '@/lib/auth'
import { apiClient } from '@/lib/api'

export default function ClubEventsButton() {
  const [show, setShow] = useState(false)
  const [active, setActive] = useState(true)

  useEffect(() => {
    const user = getStoredUser()
    if (!user) return
    const clubs = getStoredClubs()
    if (clubs.length === 0) return
    setShow(true)

    const clubId = clubs[0].id
    apiClient.getClubActiveSubscription(clubId)
      .then((res) => setActive(res.active))
      .catch(() => {})
  }, [])

  if (!show) return null

  if (!active) {
    return (
      <span
        title="クラブのサブスクリプションが失効しています"
        className="bg-gray-100 text-gray-400 border-2 border-gray-200 px-8 py-3 rounded-lg font-semibold cursor-not-allowed"
      >
        クラブイベント
      </span>
    )
  }

  return (
    <Link
      href="/club-events"
      className="bg-white hover:bg-gray-50 text-emerald-600 border-2 border-emerald-600 px-8 py-3 rounded-lg font-semibold transition-colors"
    >
      クラブイベント
    </Link>
  )
}
