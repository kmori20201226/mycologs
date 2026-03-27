'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'

interface Club {
  id: number
  name: string
  createdAt: string
}

export default function ClubListPage() {
  const router = useRouter()
  const [clubs, setClubs] = useState<Club[]>([])
  const [newName, setNewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)

  useEffect(() => {
    loadClubs()
  }, [])

  async function loadClubs() {
    const data = await apiClient.getClubs()
    setClubs(data)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    await apiClient.createClub({ name: newName })
    setNewName('')
    loadClubs()
  }

  async function handleDelete(id: number) {
    await apiClient.deleteClub(id)
    setConfirmDeleteId(null)
    loadClubs()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Clubs</h1>

        {/* Create form */}
        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">New Club</h2>
          <form onSubmit={handleCreate} className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Club name"
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

        {/* Club list */}
        <div className="bg-white rounded-xl shadow divide-y">
          {clubs.length === 0 && (
            <p className="px-4 py-8 text-sm text-gray-400 text-center">No clubs yet.</p>
          )}
          {clubs.map((club) => (
            <div key={club.id} className="flex items-center justify-between px-4 py-3">
              <span className="font-medium text-gray-800">{club.name}</span>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push(`/admin/clubs/${club.id}`)}
                  className="text-sm text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                >
                  Edit
                </button>

                {confirmDeleteId === club.id ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">Sure?</span>
                    <button
                      onClick={() => handleDelete(club.id)}
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
                    onClick={() => setConfirmDeleteId(club.id)}
                    className="text-sm text-red-400 hover:text-red-600 font-medium transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
