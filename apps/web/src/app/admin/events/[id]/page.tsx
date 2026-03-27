'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type Event } from '@/lib/api'
import { getStoredClubs } from '@/lib/auth'

// Convert ISO string to value accepted by datetime-local input
function toInputValue(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}

export default function EventEditPage() {
  const params = useParams()
  const eventId = Number(params.id)

  const [original, setOriginal] = useState<Event | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [clubName, setClubName] = useState<string>('')
  const [notFound, setNotFound] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    apiClient.request<Event>(`/events/${eventId}`)
      .then((ev) => {
        setOriginal(ev)
        setName(ev.name)
        setDescription(ev.description ?? '')
        setStartAt(toInputValue(ev.startAt))
        setEndAt(toInputValue(ev.endAt))
        if (ev.clubId) {
          const clubs = getStoredClubs()
          const club = clubs.find((c) => c.id === ev.clubId)
          setClubName(club?.name ?? `Club #${ev.clubId}`)
        }
      })
      .catch(() => setNotFound(true))
  }, [eventId])

  const dateError = startAt && endAt && endAt < startAt
    ? 'End date must be after start date.'
    : ''

  const isDirty = original !== null && (
    name !== original.name ||
    description !== (original.description ?? '') ||
    startAt !== toInputValue(original.startAt) ||
    endAt !== toInputValue(original.endAt)
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (dateError) return

    await apiClient.updateEvent(eventId, {
      name,
      description: description || undefined,
      startAt: startAt ? new Date(startAt).toISOString() : null,
      endAt: endAt ? new Date(endAt).toISOString() : null,
    })

    setOriginal((prev) => prev ? { ...prev, name, description: description || null, startAt: startAt ? new Date(startAt).toISOString() : null, endAt: endAt ? new Date(endAt).toISOString() : null } : prev)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Event not found.</p>
          <Link href="/admin/events" className="text-emerald-600 hover:underline">Back to events</Link>
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
            Back
          </Link>
          <div className="text-sm text-gray-500">
            <Link href="/admin/events" className="hover:text-emerald-600 transition-colors">Events</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-800 font-medium">{original?.name ?? '…'}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          {clubName && (
            <p className="text-sm text-gray-500 mb-5">Club: <span className="font-medium text-gray-700">{clubName}</span></p>
          )}
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
    </div>
  )
}
