'use client'

import { apiClient } from '@/lib/api'
import PrecipWindow, { FORTNIGHT_MS } from './PrecipWindow'

/**
 * The fortnight of rainfall leading up to the photo.
 *
 * The window ends at takenAt — the EXIF capture time — because that is when the
 * mushroom was standing there. A post's createdAt is when somebody got round to
 * uploading it, which can be weeks later and says nothing about the weather the
 * fungus grew in.
 *
 * When a photo carries no capture time we fall back to createdAt and say so on
 * screen, rather than showing nothing: an upload is usually close enough behind
 * the walk to be worth reading, but only if the reader knows that is what they
 * are looking at.
 *
 * Renders nothing at all for a post with no coordinates — unlike an event,
 * where the location is a field the owner can go and fill in, a post's location
 * comes from the photo and is not something the reader can act on.
 *
 * Fetching and drawing live in PrecipWindow, shared with the event page.
 */

interface Props {
    postId: number
    longitude: number | null
    latitude: number | null
    takenAt: string | null
    createdAt: string
}

export default function PostPrecipPanel({ postId, longitude, latitude, takenAt, createdAt }: Props) {
    if (longitude == null || latitude == null) return null

    const to = new Date(takenAt ?? createdAt)
    if (Number.isNaN(to.getTime())) return null

    const range = `${new Date(to.getTime() - FORTNIGHT_MS).toLocaleDateString('ja-JP')} 〜 ${to.toLocaleDateString('ja-JP')}`

    return (
        <div className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">降水量</h2>
            <PrecipWindow
                title="撮影までの2週間"
                to={to}
                note={takenAt ? range : `撮影日時が不明なため投稿日時まで・${range}`}
                fetcher={(from, until) => apiClient.getPostPrecipitation(postId, from, until)}
            />
        </div>
    )
}
