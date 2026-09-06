'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type Event } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'
import EventPrecipPanel from '@/components/EventPrecipPanel'

function toInputValue(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}

interface GeoCandidate {
  name: string
  longitude: number
  latitude: number
}

export default function UserEventEditPage() {
  const params = useParams()
  const eventId = Number(params.id)

  const [original, setOriginal] = useState<Event | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [place, setPlace] = useState('')
  const [publicPlace, setPublicPlace] = useState('')
  const [longitude, setLongitude] = useState('')
  const [latitude, setLatitude] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Banner state
  const [savedBanner, setSavedBanner] = useState<string | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const [bannerDeleted, setBannerDeleted] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)

  const [geocoding, setGeocoding] = useState(false)
  const [candidates, setCandidates] = useState<GeoCandidate[]>([])
  const [toast, setToast] = useState('')
  const [pasteCoords, setPasteCoords] = useState('')
  const [coordsError, setCoordsError] = useState('')

  function parseDMSCoords(raw: string): { lat: number; lng: number } | null {
    const s = raw.trim()
    // DMS: 33°38'40.9"N 130°42'56.2"E
    const dms = s.match(
      /(\d+)[°＊]\s*(\d+)['\u2019]\s*([\d.]+)["\u2033\u201D]?\s*([NS])[,\s]+(\d+)[°＊]\s*(\d+)['\u2019]\s*([\d.]+)["\u2033\u201D]?\s*([EW])/i
    )
    if (dms) {
      const lat = (Number(dms[1]) + Number(dms[2]) / 60 + Number(dms[3]) / 3600) * (dms[4].toUpperCase() === 'S' ? -1 : 1)
      const lng = (Number(dms[5]) + Number(dms[6]) / 60 + Number(dms[7]) / 3600) * (dms[8].toUpperCase() === 'W' ? -1 : 1)
      return { lat, lng }
    }
    // Decimal: 33.32527, 130.92961
    const dec = s.match(/^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/)
    if (dec) {
      return { lat: Number(dec[1]), lng: Number(dec[2]) }
    }
    return null
  }

  function handlePasteCoords() {
    const result = parseDMSCoords(pasteCoords)
    if (!result) {
      setCoordsError('形式が認識できません。例: 33°38\'40.9"N 130°42\'56.2"E')
      return
    }
    setCoordsError('')
    setLatitude(result.lat.toFixed(6))
    setLongitude(result.lng.toFixed(6))
    setPasteCoords('')
  }

  useEffect(() => {
    return () => { if (bannerPreview) URL.revokeObjectURL(bannerPreview) }
  }, [bannerPreview])

  useEffect(() => {
    const user = getStoredUser()
    apiClient.request<Event>(`/events/${eventId}`)
      .then((ev) => {
        // Guard: only allow editing own events
        if (user && ev.userId !== user.id) {
          setNotFound(true)
          return
        }
        setOriginal(ev)
        setName(ev.name)
        setDescription(ev.description ?? '')
        setPlace(ev.place ?? '')
        setPublicPlace(ev.publicPlace ?? '')
        setLongitude(ev.longitude != null ? String(ev.longitude) : '')
        setLatitude(ev.latitude != null ? String(ev.latitude) : '')
        setStartAt(toInputValue(ev.startAt))
        setEndAt(toInputValue(ev.endAt))
        setSavedBanner(ev.bannerImage)
      })
      .catch(() => setNotFound(true))
  }, [eventId])

  const dateError = startAt && endAt && endAt < startAt
    ? '終了日は開始日より後にしてください。'
    : ''

  const isDirty = original !== null && (
    name !== original.name ||
    description !== (original.description ?? '') ||
    place !== (original.place ?? '') ||
    publicPlace !== (original.publicPlace ?? '') ||
    longitude !== (original.longitude != null ? String(original.longitude) : '') ||
    latitude !== (original.latitude != null ? String(original.latitude) : '') ||
    startAt !== toInputValue(original.startAt) ||
    endAt !== toInputValue(original.endAt) ||
    bannerFile !== null ||
    bannerDeleted
  )

  const canGuess = place.trim() !== '' && longitude === '' && latitude === ''

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  function handleBannerSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (bannerPreview) URL.revokeObjectURL(bannerPreview)
    setBannerFile(file)
    setBannerPreview(URL.createObjectURL(file))
    setBannerDeleted(false)
  }

  function handleBannerRemove() {
    if (bannerPreview) URL.revokeObjectURL(bannerPreview)
    setBannerFile(null)
    setBannerPreview(null)
    if (savedBanner) setBannerDeleted(true)
    if (bannerInputRef.current) bannerInputRef.current.value = ''
  }

  async function handleGuessCoords() {
    setGeocoding(true)
    setCandidates([])
    try {
      const result = await apiClient.geocodePlace(place.trim())
      if (result.candidates.length === 0) {
        showToast('この場所名の位置情報が見つかりませんでした。')
      } else if (result.candidates.length === 1) {
        setLongitude(String(result.candidates[0].longitude))
        setLatitude(String(result.candidates[0].latitude))
      } else {
        setCandidates(result.candidates)
      }
    } catch {
      showToast('座標の取得に失敗しました。')
    } finally {
      setGeocoding(false)
    }
  }

  function handleCandidateSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const idx = Number(e.target.value)
    if (idx < 0) return
    const c = candidates[idx]
    setLongitude(String(c.longitude))
    setLatitude(String(c.latitude))
    setCandidates([])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (dateError) return
    setSaving(true)
    try {
      if (bannerFile) {
        const result = await apiClient.uploadEventBanner(eventId, bannerFile)
        setSavedBanner(result.bannerImage)
        if (bannerPreview) URL.revokeObjectURL(bannerPreview)
        setBannerFile(null)
        setBannerPreview(null)
      } else if (bannerDeleted && savedBanner) {
        await apiClient.deleteEventBanner(eventId)
        setSavedBanner(null)
        setBannerDeleted(false)
      }

      await apiClient.updateEvent(eventId, {
        name,
        description: description || undefined,
        place: place || null,
        publicPlace: publicPlace || null,
        longitude: longitude !== '' ? Number(longitude) : null,
        latitude: latitude !== '' ? Number(latitude) : null,
        startAt: startAt ? new Date(startAt).toISOString() : null,
        endAt: endAt ? new Date(endAt).toISOString() : null,
      })

      setOriginal((prev) => prev ? {
        ...prev,
        name,
        description: description || null,
        place: place || null,
        publicPlace: publicPlace || null,
        longitude: longitude !== '' ? Number(longitude) : null,
        latitude: latitude !== '' ? Number(latitude) : null,
        startAt: startAt ? new Date(startAt).toISOString() : null,
        endAt: endAt ? new Date(endAt).toISOString() : null,
      } : prev)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {
      showToast('保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  const displayBanner = bannerPreview ?? (bannerDeleted ? null : savedBanner)

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">イベントが見つかりません。</p>
          <Link href="/events" className="text-emerald-600 hover:underline">マイイベントへ戻る</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-xl">

        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/events"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            戻る
          </Link>
          <div className="text-sm text-gray-500">
            <Link href="/events" className="hover:text-emerald-600 transition-colors">マイイベント</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-800 font-medium">{original?.name ?? '…'}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名前</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">場所</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={place}
                  onChange={(e) => { setPlace(e.target.value); setCandidates([]) }}
                  placeholder="例: 新宿御苑、東京"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {canGuess && (
                  <button
                    type="button"
                    onClick={handleGuessCoords}
                    disabled={geocoding}
                    className="shrink-0 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {geocoding ? '取得中…' : '座標を取得'}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">公開用の場所名</label>
              <input
                type="text"
                value={publicPlace}
                onChange={(e) => setPublicPlace(e.target.value)}
                placeholder="例: 高尾山周辺"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <p className="text-xs text-gray-400 mt-1">設定すると、このイベントに紐づく投稿に公開表示されます。正確な場所（上）は公開されません。</p>
            </div>

            {candidates.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">場所を選択</label>
                <select
                  defaultValue="-1"
                  onChange={handleCandidateSelect}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="-1" disabled>— 候補を選択 —</option>
                  {candidates.map((c, i) => (
                    <option key={i} value={i}>
                      {c.name} ({c.latitude.toFixed(4)}, {c.longitude.toFixed(4)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">経度</label>
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="例: 139.7101"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">緯度</label>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="例: 35.6851"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            {latitude && longitude && (
              <div>
                <a
                  href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  Google マップで開く
                </a>
              </div>
            )}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">Google マップの座標を貼り付け</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pasteCoords}
                  onChange={(e) => { setPasteCoords(e.target.value); setCoordsError('') }}
                  placeholder='例: 33°38′40.9″N 130°42′56.2″E'
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={handlePasteCoords}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  変換
                </button>
              </div>
              {coordsError && <p className="text-red-600 text-xs">{coordsError}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開始</label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">終了</label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${dateError ? 'border-red-400' : ''}`}
                />
              </div>
            </div>

            {dateError && (
              <p className="text-red-500 text-xs">{dateError}</p>
            )}

            {/* Rainfall at this location. Reads saved values, not the unsaved
                form state — the graph must describe the event as stored, not a
                place the user is halfway through typing. */}
            {original && (
              <div className="pt-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">降水量</label>
                <EventPrecipPanel
                  eventId={original.id}
                  startAt={original.startAt}
                  endAt={original.endAt}
                  hasLocation={original.longitude != null && original.latitude != null}
                />
              </div>
            )}

            {/* Banner image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">バナー画像</label>
              {displayBanner ? (
                <div className="space-y-2">
                  <img src={displayBanner} alt="バナープレビュー" className="w-full rounded-lg object-cover max-h-48" />
                  {bannerFile && (
                    <p className="text-xs text-sky-600">選択中: {bannerFile.name}（未保存）</p>
                  )}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => bannerInputRef.current?.click()}
                      className="text-sm text-sky-600 hover:text-sky-700 font-medium transition-colors"
                    >
                      差し替え
                    </button>
                    <button
                      type="button"
                      onClick={handleBannerRemove}
                      className="text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      削除
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-gray-200 hover:border-emerald-400 rounded-lg py-6 text-sm text-gray-400 hover:text-emerald-600 transition-colors"
                >
                  クリックして画像を選択
                </button>
              )}
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBannerSelect}
              />
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={!isDirty || !!dateError || saving}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                {saving ? '保存中…' : '保存'}
              </button>
              {saved && <span className="text-emerald-600 text-sm">保存しました！</span>}
            </div>

          </form>
        </div>

      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
