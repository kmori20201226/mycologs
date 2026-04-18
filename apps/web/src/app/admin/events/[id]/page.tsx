'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type Event } from '@/lib/api'
import { getStoredClubs } from '@/lib/auth'

// Convert ISO string to value accepted by datetime-local input
function toInputValue(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}

interface GeoCandidate {
  name: string
  longitude: number
  latitude: number
}

export default function EventEditPage() {
  const params = useParams()
  const eventId = Number(params.id)

  const [original, setOriginal] = useState<Event | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [place, setPlace] = useState('')
  const [longitude, setLongitude] = useState('')
  const [latitude, setLatitude] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [clubName, setClubName] = useState<string>('')
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Banner state
  const [savedBanner, setSavedBanner] = useState<string | null>(null)  // URL from server
  const [bannerFile, setBannerFile] = useState<File | null>(null)       // pending upload
  const [bannerPreview, setBannerPreview] = useState<string | null>(null) // object URL
  const [bannerDeleted, setBannerDeleted] = useState(false)              // pending delete
  const bannerInputRef = useRef<HTMLInputElement>(null)

  const [geocoding, setGeocoding] = useState(false)
  const [candidates, setCandidates] = useState<GeoCandidate[]>([])
  const [toast, setToast] = useState('')

  // Revoke object URL when replaced or unmounted
  useEffect(() => {
    return () => { if (bannerPreview) URL.revokeObjectURL(bannerPreview) }
  }, [bannerPreview])

  useEffect(() => {
    apiClient.request<Event>(`/events/${eventId}`)
      .then((ev) => {
        setOriginal(ev)
        setName(ev.name)
        setDescription(ev.description ?? '')
        setPlace(ev.place ?? '')
        setLongitude(ev.longitude != null ? String(ev.longitude) : '')
        setLatitude(ev.latitude != null ? String(ev.latitude) : '')
        setStartAt(toInputValue(ev.startAt))
        setEndAt(toInputValue(ev.endAt))
        setSavedBanner(ev.bannerImage)
        if (ev.clubId) {
          const clubs = getStoredClubs()
          const club = clubs.find((c) => c.id === ev.clubId)
          setClubName(club?.name ?? `Club #${ev.clubId}`)
        }
      })
      .catch(() => setNotFound(true))
  }, [eventId])

  const dateError = startAt && endAt && endAt < startAt
    ? '終了日時は開始日時より後にしてください。'
    : ''

  const isDirty = original !== null && (
    name !== original.name ||
    description !== (original.description ?? '') ||
    place !== (original.place ?? '') ||
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
        showToast('この地名では場所が見つかりませんでした。')
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
      // Handle banner changes
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

  // The image to display: preview takes priority, then saved banner, then nothing
  const displayBanner = bannerPreview ?? (bannerDeleted ? null : savedBanner)

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">イベントが見つかりません。</p>
          <Link href="/admin/events" className="text-emerald-600 hover:underline">イベント一覧へ戻る</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-xl">

        {/* Breadcrumb + Back */}
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/admin/events"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            戻る
          </Link>
          <div className="text-sm text-gray-500">
            <Link href="/admin/events" className="hover:text-emerald-600 transition-colors">イベント</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-800 font-medium">{original?.name ?? '…'}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          {clubName && (
            <p className="text-sm text-gray-500 mb-5">クラブ: <span className="font-medium text-gray-700">{clubName}</span></p>
          )}
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

            {/* Place */}
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

            {/* Candidate list box */}
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

            {/* Longitude / Latitude */}
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
                      className="text-sm text-red-400 hover:text-red-600 font-medium transition-colors"
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}
