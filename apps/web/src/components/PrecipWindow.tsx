'use client'

import { useEffect, useState } from 'react'
import type { PrecipSeries } from '@/lib/api'
import { PrecipChart, PrecipSummary } from './PrecipChart'

/**
 * One window of rainfall — a titled panel showing the fortnight (or whatever
 * span) ending at a given instant, for whatever subject the caller can fetch.
 *
 * This is the single place a rainfall window is fetched and drawn. Event pages
 * and post pages differ only in which instant they point it at and what they
 * call it; neither knows how the request is made or how the graph is built.
 * Improvements to the graph — a different span, hourly detail, a comparison
 * against the seasonal norm — belong here and in PrecipChart, and every page
 * showing rainfall gets them at once.
 *
 * Fetched with useEffect + apiClient to match every other page here. The Next 16
 * docs prefer the `use` API or SWR for client components, but the callers are
 * already 'use client', and pulling in SWR for these panels is not worth the
 * divergence.
 */

export const FORTNIGHT_MS = 14 * 86_400_000

/**
 * Fetches the series for a span. Given as a prop rather than chosen here so
 * that this component never learns what subjects exist — a new one needs no
 * change to this file.
 */
export type PrecipFetcher = (from: Date, to: Date) => Promise<PrecipSeries>

interface Props {
    title: string
    /** End of the window. `null` means "nothing to show" — no request is made. */
    to: Date | null
    fetcher: PrecipFetcher
    /** How far back the window reaches. */
    spanMs?: number
    /** Optional line under the title, in place of the derived date range. */
    note?: string
}

type Load =
    | { state: 'idle' }
    | { state: 'loading' }
    | { state: 'ok'; data: PrecipSeries }
    | { state: 'error'; message: string }

function formatRange(from: Date, to: Date): string {
    return `${from.toLocaleDateString('ja-JP')} 〜 ${to.toLocaleDateString('ja-JP')}`
}

export default function PrecipWindow({ title, to, fetcher, spanMs = FORTNIGHT_MS, note }: Props) {
    const [load, setLoad] = useState<Load>({ state: 'idle' })

    // An instant, not a Date object: a caller building `new Date()` inline
    // would otherwise produce a new identity every render and re-fetch forever.
    const toMs = to ? to.getTime() : null

    useEffect(() => {
        if (toMs === null) return
        let cancelled = false
        setLoad({ state: 'loading' })
        const toAt = new Date(toMs)
        fetcher(new Date(toMs - spanMs), toAt)
            .then(data => { if (!cancelled) setLoad({ state: 'ok', data }) })
            .catch((err: unknown) => {
                if (cancelled) return
                const m = (err as { apiMessage?: string })?.apiMessage
                setLoad({ state: 'error', message: m ?? '降水データを取得できませんでした。' })
            })
        return () => { cancelled = true }
        // `fetcher` is intentionally not a dependency: callers pass an inline
        // closure, which would change identity every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [toMs, spanMs])

    if (toMs === null) return null

    return (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
            <p className="mt-0.5 text-[11px] text-gray-500">
                {note ?? formatRange(new Date(toMs - spanMs), new Date(toMs))}
            </p>
            <div className="mt-3">
                {(load.state === 'loading' || load.state === 'idle') && (
                    <p className="text-sm text-gray-400">読み込み中…</p>
                )}
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
