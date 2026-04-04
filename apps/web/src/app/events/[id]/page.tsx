'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type Event } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

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
  const [longitude, setLongitude] = useState('')
  const [latitude, setLatitude] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [saved, setSaved] = useState(false)

  const [geocoding, setGeocoding] = useState(false)
  const [candidates, setCandidates] = useState<GeoCandidate[]>([])
  const [toast, setToast] = useState('')

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
        setLongitude(ev.longitude != null ? String(ev.longitude) : '')
        setLatitude(ev.latitude != null ? String(ev.latitude) : '')
        setStartAt(toInputValue(ev.startAt))
        setEndAt(toInputValue(ev.endAt))
      })
      .catch(() => setNotFound(true))
  }, [eventId])

  const dateError = startAt && endAt && endAt < startAt
    ? 'End date must be after start date.'
    : ''

  const isDirty = original !== null && (
    name !== original.name ||
    description !== (original.description ?? '') ||
    place !== (original.place ?? '') ||
    longitude !== (original.longitude != null ? String(original.longitude) : '') ||
    latitude !== (original.latitude != null ? String(original.latitude) : '') ||
    startAt !== toInputValue(original.startAt) ||
    endAt !== toInputValue(original.endAt)
  )

  const canGuess = place.trim() !== '' && longitude === '' && latitude === ''

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function handleGuessCoords() {
    setGeocoding(true)
    setCandidates([])
    try {
      const result = await apiClient.geocodePlace(place.trim())
      if (result.candidates.length === 0) {
        showToast('No location found for this place name.')
      } else if (result.candidates.length === 1) {
        setLongitude(String(result.candidates[0].longitude))
        setLatitude(String(result.candidates[0].latitude))
      } else {
        setCandidates(result.candidates)
      }
    } catch {
      showToast('Failed to guess coordinates.')
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
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Event not found.</p>
          <Link href="/events" className="text-emerald-600 hover:underline">Back to my events</Link>
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
            Back
          </Link>
          <div className="text-sm text-gray-500">
            <Link href="/events" className="hover:text-emerald-600 transition-colors">My Events</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-800 font-medium">{original?.name ?? '…'}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Place</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={place}
                  onChange={(e) => { setPlace(e.target.value); setCandidates([]) }}
                  placeholder="e.g. Shinjuku Gyoen, Tokyo"
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {canGuess && (
                  <button
                    type="button"
                    onClick={handleGuessCoords}
                    disabled={geocoding}
                    className="shrink-0 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    {geocoding ? 'Guessing…' : 'Guess coords'}
                  </button>
                )}
              </div>
            </div>

            {candidates.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select location</label>
                <select
                  defaultValue="-1"
                  onChange={handleCandidateSelect}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="-1" disabled>— choose a candidate —</option>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="e.g. 139.7101"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="e.g. 35.6851"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
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

            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={!isDirty || !!dateError}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Save
              </button>
              {saved && <span className="text-emerald-600 text-sm">Saved!</span>}
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
