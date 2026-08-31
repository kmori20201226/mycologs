'use client'

import type { EventPrecipitation, PrecipDay } from '@/lib/api'

/**
 * Daily rainfall bars for an event location.
 *
 * Hand-drawn SVG rather than a charting library, for a specific reason: every
 * value here is an interval, not a number. The radar encodes bands — yellow is
 * 15-20 mm/h, and there is no "15" hidden in the image to recover — so a day is
 * "between 45 and 66 mm", never "55 mm". Chart libraries want a scalar per bar,
 * and feeding one a midpoint would invent a precision the data does not have.
 *
 * Each bar therefore draws twice: a solid portion up to lowerMm, and a pale
 * portion continuing to upperMm. The pale part IS the uncertainty; it is meant
 * to be visible.
 */

const W = 720
const H = 200
const PAD_L = 42
const PAD_R = 8
const PAD_T = 12
const PAD_B = 34

function niceCeil(v: number): number {
    if (v <= 0) return 10
    const mag = 10 ** Math.floor(Math.log10(v))
    for (const step of [1, 2, 2.5, 5, 10]) {
        if (v <= step * mag) return step * mag
    }
    return 10 * mag
}

function dayLabel(date: string): string {
    // "2026-08-10" -> "8/10"
    const [, m, d] = date.split('-')
    return `${Number(m)}/${Number(d)}`
}

function tooltip(d: PrecipDay): string {
    const parts = [`${d.date}`, `${d.lowerMm}–${d.upperMm} mm`, `${d.wetHours}時間 降水`]
    if (d.maskedHours) parts.push(`${d.maskedHours}時間 観測不能`)
    if (d.hours < 24) parts.push(`${24 - d.hours}時間 データなし`)
    return parts.join(' / ')
}

export function PrecipChart({ data }: { data: EventPrecipitation }) {
    const days = data.daily
    if (days.length === 0) {
        return <p className="text-sm text-gray-500">この期間の降水データがありません。</p>
    }

    const maxMm = niceCeil(Math.max(...days.map(d => d.upperMm), 1))
    const plotW = W - PAD_L - PAD_R
    const plotH = H - PAD_T - PAD_B
    const slot = plotW / days.length
    const barW = Math.max(3, Math.min(28, slot * 0.62))

    const y = (mm: number) => PAD_T + plotH - (mm / maxMm) * plotH
    const ticks = [0, maxMm / 2, maxMm]

    return (
        <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img"
                 aria-label={`日別降水量 ${data.from.slice(0, 10)} から ${data.to.slice(0, 10)}`}>
                {ticks.map(t => (
                    <g key={t}>
                        <line x1={PAD_L} x2={W - PAD_R} y1={y(t)} y2={y(t)}
                              stroke="currentColor" className="text-gray-200" strokeWidth={1} />
                        <text x={PAD_L - 6} y={y(t) + 4} textAnchor="end"
                              className="fill-gray-500 text-[10px]">{Math.round(t)}</text>
                    </g>
                ))}
                <text x={PAD_L - 6} y={PAD_T - 2} textAnchor="end" className="fill-gray-400 text-[9px]">mm</text>

                {days.map((d, n) => {
                    const cx = PAD_L + slot * n + slot / 2
                    const x = cx - barW / 2
                    const yLower = y(d.lowerMm)
                    const yUpper = y(d.upperMm)
                    const noData = d.hours === 0 || d.maskedHours === d.hours
                    return (
                        <g key={d.date}>
                            <title>{tooltip(d)}</title>
                            {/* uncertainty: lower..upper */}
                            <rect x={x} y={yUpper} width={barW} height={Math.max(0, yLower - yUpper)}
                                  className="fill-sky-200" />
                            {/* the part we can assert */}
                            <rect x={x} y={yLower} width={barW} height={Math.max(0, PAD_T + plotH - yLower)}
                                  className="fill-sky-500" />
                            {/* a day the radar could not see is not a dry day */}
                            {noData && (
                                <text x={cx} y={PAD_T + plotH - 3} textAnchor="middle"
                                      className="fill-gray-400 text-[9px]">?</text>
                            )}
                            {(d.maskedHours > 0 || d.hours < 24) && !noData && (
                                <circle cx={cx} cy={PAD_T + plotH + 6} r={1.6} className="fill-amber-500" />
                            )}
                            {(days.length <= 16 || n % 2 === 0) && (
                                <text x={cx} y={H - PAD_B + 18} textAnchor="middle"
                                      className="fill-gray-500 text-[9px]">{dayLabel(d.date)}</text>
                            )}
                        </g>
                    )
                })}
                <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH} y2={PAD_T + plotH}
                      stroke="currentColor" className="text-gray-300" />
            </svg>

            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-3 rounded-sm bg-sky-500" />最低
                </span>
                <span className="flex items-center gap-1">
                    <span className="inline-block h-2 w-3 rounded-sm bg-sky-200" />最大（幅は不確かさ）
                </span>
                {(data.maskedHours > 0 || data.hoursMissing > 0) && (
                    <span className="flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                        欠測あり
                    </span>
                )}
            </div>
        </div>
    )
}

/** One-line summary of what the chart is showing, including its caveats. */
export function PrecipSummary({ data }: { data: EventPrecipitation }) {
    const gaps: string[] = []
    if (data.hoursMissing > 0) gaps.push(`${data.hoursMissing}時間 データなし`)
    if (data.maskedHours > 0) gaps.push(`${data.maskedHours}時間 観測不能`)
    return (
        <p className="text-xs text-gray-600">
            合計 <strong>{data.totalLowerMm}–{data.totalUpperMm} mm</strong>
            <span className="text-gray-400">（{data.wetHours}時間 降水 / {data.hoursPresent}時間 観測）</span>
            {gaps.length > 0 && <span className="ml-1 text-amber-600">・{gaps.join('・')}</span>}
        </p>
    )
}
