'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient, type Event } from '@/lib/api'
import { getSelectedClubId, getStoredClubs } from '@/lib/auth'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
}

export default function EventListPage() {
  const router = useRouter()
  const [events, setEvents] = useState<Event[]>([])
  const [newName, setNewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [clubId, setClubId] = useState<number | null>(null)
  const [clubName, setClubName] = useState<string>('')

  useEffect(() => {
    const id = getSelectedClubId()
    setClubId(id)
    if (id) {
      const clubs = getStoredClubs()
      const club = clubs.find((c) => c.id === id)
      setClubName(club?.name ?? '')
    }
    loadEvents(id)
  }, [])

  async function loadEvents(id?: number | null) {
    const cid = id !== undefined ? id : clubId
    const data = await apiClient.getEvents(cid ?? undefined)
    setEvents(data)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    await apiClient.createEvent({ name: newName, clubId: clubId ?? undefined })
    setNewName('')
    loadEvents()
  }

  async function handleDelete(id: number) {
    await apiClient.deleteEvent(id)
    setConfirmDeleteId(null)
    loadEvents()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Events</h1>
          {clubName && (
            <p className="text-sm text-gray-500 mt-1">Club: <span className="font-medium text-gray-700">{clubName}</span></p>
          )}
        </div>

        {/* Create form */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">New Event</h2>
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Event name"
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
            <button
              type="submit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              Add
            </button>
          </form>
        </div>

        {/* Event table */}
        <div className="bg-white rounded-xl shadow overflow-hidden">
          {events.length === 0 ? (
            <p className="px-6 py-10 text-sm text-gray-400 text-center">No events yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-6 py-3 font-semibold text-gray-600">Name</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-600">Start</th>
                  <th className="text-left px-6 py-3 font-semibold text-gray-600">End</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-800">{ev.name}</td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(ev.startAt)}</td>
                    <td className="px-6 py-4 text-gray-500">{formatDate(ev.endAt)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-4">
                        <button
                          onClick={() => router.push(`/admin/events/${ev.id}`)}
                          className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                        >
                          Edit
                        </button>

                        {confirmDeleteId === ev.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">Sure?</span>
                            <button
                              onClick={() => handleDelete(ev.id)}
                              className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-1 rounded font-semibold transition-colors"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(ev.id)}
                            className="text-red-400 hover:text-red-600 font-medium transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
