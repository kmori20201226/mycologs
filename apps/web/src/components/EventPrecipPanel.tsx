'use client'

import { useEffect, useState } from 'react'
import { apiClient, type EventPrecipitation } from '@/lib/api'
import { PrecipChart, PrecipSummary } from './PrecipChart'

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
 * Fetched with useEffect + apiClient to match every other page here. The Next 16
 * docs prefer the `use` API or SWR for client components, but the parent is
 * already 'use client', and pulling in SWR for one experimental panel is not
 * worth the divergence.
 */

const FORTNIGHT_MS = 14 * 86_400_000
const SHORT_EVENT_MS = 2 * 86_400_000

interface Props {
    eventId: number
    startAt: string | null
    endAt: string | null
    hasLocation: boolean
}

type Load =
    | { state: 'loading' }
    | { state: 'ok'; data: EventPrecipitation }
    | { state: 'error'; message: string }

function useWindow(eventId: number, to: Date | null): Load {
    const [load, setLoad] = useState<Load>({ state: 'loading' })
    const key = to ? to.toISOString() : null

    useEffect(() => {
        if (!key) return
        let cancelled = false
        setLoad({ state: 'loading' })
        const toDate = new Date(key)
        apiClient
            .getEventPrecipitation(eventId, new Date(toDate.getTime() - FORTNIGHT_MS), toDate)
            .then(data => { if (!cancelled) setLoad({ state: 'ok', data }) })
            .catch((err: unknown) => {
                if (cancelled) return
                const m = (err as { apiMessage?: string })?.apiMessage
                setLoad({ state: 'error', message: m ?? '降水データを取得できませんでした。' })
            })
        return () => { cancelled = true }
    }, [eventId, key])

    return load
}

function Panel({ title, note, load }: { title: string; note: string; load: Load }) {
    return (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="mt-0.5 text-[11px] text-gray-500">{note}</p>
            <div className="mt-3">
                {load.state === 'loading' && <p className="text-sm text-gray-400">読み込み中…</p>}
                {load.state === 'error' && <p className="text-sm text-amber-700">{load.message}</p>}
                {load.state === 'ok' && (
                    <>
                        <PrecipChart data={load.data} />
                        <div className="mt-2"><PrecipSummary data={load.data} /></div>
                    </>
                )}
            </div>
        </section>
    )
}

export default function EventPrecipPanel({ eventId, startAt, endAt, hasLocation }: Props) {
    // Both hooks must run unconditionally; `null` simply means "do not fetch".
    const durationMs = startAt && endAt ? new Date(endAt).getTime() - new Date(startAt).getTime() : null
    const isShortEvent = durationMs !== null && durationMs >= 0 && durationMs <= SHORT_EVENT_MS

    const eventEnd = hasLocation && isShortEvent && endAt ? new Date(endAt) : null
    const now = hasLocation ? new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000) : null

    const aroundEvent = useWindow(eventId, eventEnd)
    const recent = useWindow(eventId, now)

    if (!hasLocation) {
        return (
            <p className="text-sm text-gray-500">
                位置情報を設定すると、この場所の降水量を表示できます。
            </p>
        )
    }

    return (
        <div className="space-y-4">
            {eventEnd && (
                <Panel
                    title="行事終了までの2週間"
                    note={`${new Date(eventEnd.getTime() - FORTNIGHT_MS).toLocaleDateString('ja-JP')} 〜 ${eventEnd.toLocaleDateString('ja-JP')}`}
                    load={aroundEvent}
                />
            )}
            {!eventEnd && isShortEvent === false && startAt && endAt && (
                <p className="text-xs text-gray-500">
                    2日を超える行事のため、行事前の降水グラフは表示していません。
                </p>
            )}
            <Panel
                title="直近2週間"
                note={`${new Date(Date.now() - FORTNIGHT_MS).toLocaleDateString('ja-JP')} 〜 ${new Date().toLocaleDateString('ja-JP')}`}
                load={recent}
            />
        </div>
    )
}
