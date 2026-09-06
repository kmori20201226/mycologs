'use client'

import { apiClient } from '@/lib/api'
import PrecipWindow from './PrecipWindow'

/**
 * Two fortnights of rainfall for an event's location.
 *
 *   1. the fortnight ending when the event ended — the weather that led up to
 *      it. Only shown for events lasting two days or less: for a month-long
 *      event "the two weeks before it ended" describes the middle of the event
 *      rather than the run-up to it, which would be misleading rather than
 *      merely useless.
 *   2. the fortnight ending now — current conditions, always shown.
 *
 * Everything about fetching and drawing lives in PrecipWindow. This file only
 * decides which instants an event is worth pointing it at.
 */

const SHORT_EVENT_MS = 2 * 86_400_000

interface Props {
    eventId: number
    startAt: string | null
    endAt: string | null
    hasLocation: boolean
}

export default function EventPrecipPanel({ eventId, startAt, endAt, hasLocation }: Props) {
    if (!hasLocation) {
        return (
            <p className="text-sm text-gray-500">
                位置情報を設定すると、この場所の降水量を表示できます。
            </p>
        )
    }

    const durationMs = startAt && endAt ? new Date(endAt).getTime() - new Date(startAt).getTime() : null
    const isShortEvent = durationMs !== null && durationMs >= 0 && durationMs <= SHORT_EVENT_MS

    const eventEnd = isShortEvent && endAt ? new Date(endAt) : null
    // Rounded down to the hour so the value is stable across renders — the
    // archive is hourly anyway, so a finer instant would buy nothing.
    const now = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000)

    const fetcher = (from: Date, to: Date) => apiClient.getEventPrecipitation(eventId, from, to)

    return (
        <div className="space-y-4">
            <PrecipWindow title="行事終了までの2週間" to={eventEnd} fetcher={fetcher} />
            {!eventEnd && startAt && endAt && (
                <p className="text-xs text-gray-500">
                    2日を超える行事のため、行事前の降水グラフは表示していません。
                </p>
            )}
            <PrecipWindow title="直近2週間" to={now} fetcher={fetcher} />
        </div>
    )
}
