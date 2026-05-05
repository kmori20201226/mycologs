'use client'

import { useEffect, useState } from 'react'
import { apiClient, type Announcement } from '@/lib/api'
import { getStoredClubs, getSelectedClubId } from '@/lib/auth'

export default function AnnouncementBanner() {
  const [siteAnn, setSiteAnn] = useState<Announcement | null>(null)
  const [clubAnn, setClubAnn] = useState<Announcement | null>(null)
  const [clubName, setClubName] = useState<string>('')

  useEffect(() => {
    apiClient.getAnnouncements({ site: true })
      .then((list) => setSiteAnn(list[0] ?? null))
      .catch(() => {})

    const clubs = getStoredClubs()
    const selectedId = getSelectedClubId()
    const club = clubs.find((c) => c.id === selectedId) ?? clubs[0]
    if (club) {
      setClubName(club.name)
      apiClient.getAnnouncements({ clubId: club.id })
        .then((list) => setClubAnn(list[0] ?? null))
        .catch(() => {})
    }
  }, [])

  if (!siteAnn && !clubAnn) return null

  return (
    <div className="space-y-2 mb-8">
      {siteAnn && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-3 flex gap-3 items-start">
          <span className="text-blue-500 text-lg mt-0.5">📢</span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-blue-600 mb-0.5">サイトからのお知らせ</p>
            <p className="text-sm text-blue-900 whitespace-pre-wrap">{siteAnn.body}</p>
          </div>
        </div>
      )}
      {clubAnn && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-3 flex gap-3 items-start">
          <span className="text-emerald-500 text-lg mt-0.5">📣</span>
          <div className="flex-1">
            <p className="text-xs font-semibold text-emerald-600 mb-0.5">{clubName} からのお知らせ</p>
            <p className="text-sm text-emerald-900 whitespace-pre-wrap">{clubAnn.body}</p>
          </div>
        </div>
      )}
    </div>
  )
}
