'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api'

interface Member {
  id: number
  user: { id: number; name: string; email: string }
  role: { id: number; name: string }
}

interface User {
  id: number
  name: string
  email: string
}

export default function ClubEditPage() {
  const params = useParams()
  const clubId = Number(params.id)

  const [clubName, setClubName] = useState('')
  const [editName, setEditName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [notFound, setNotFound] = useState(false)

  // Which panel is being dragged over
  const [dragOverPanel, setDragOverPanel] = useState<'users' | 'members' | null>(null)

  // ID being dragged, and which list it came from
  const dragging = useRef<{ userId: number; from: 'users' | 'members' } | null>(null)

  useEffect(() => {
    loadClub()
    loadUsers()
    loadMembers()
  }, [clubId])

  async function loadClub() {
    try {
      const club = await apiClient.request<{ id: number; name: string }>(`/clubs/${clubId}`)
      setClubName(club.name)
      setEditName(club.name)
    } catch {
      setNotFound(true)
    }
  }

  async function loadMembers() {
    const data = await apiClient.getClubMembers(clubId)
    setMembers(data)
  }

  async function loadUsers() {
    const data = await apiClient.getUsers()
    setUsers(data as User[])
  }

  async function handleRename(e: React.FormEvent) {
    e.preventDefault()
    await apiClient.updateClub(clubId, { name: editName })
    setClubName(editName)
  }

  // --- Drag and drop handlers ---

  function onDragStart(userId: number, from: 'users' | 'members') {
    dragging.current = { userId, from }
  }

  async function onDropToMembers() {
    setDragOverPanel(null)
    const d = dragging.current
    if (!d || d.from !== 'users') return
    await apiClient.addClubMember(clubId, { userId: d.userId, roleName: 'CLUBMEMBER' })
    loadMembers()
  }

  async function onDropToUsers() {
    setDragOverPanel(null)
    const d = dragging.current
    if (!d || d.from !== 'members') return
    await apiClient.removeClubMember(clubId, d.userId)
    loadMembers()
  }

  async function handleManagerToggle(userId: number, isManager: boolean) {
    const roleName = isManager ? 'CLUBMANAGER' : 'CLUBMEMBER'
    await apiClient.updateClubMemberRole(clubId, userId, roleName)
    setMembers((prev) =>
      prev.map((m) =>
        m.user.id === userId ? { ...m, role: { ...m.role, name: roleName } } : m
      )
    )
  }

  const memberUserIds = new Set(members.map((m) => m.user.id))
  const nonMembers = users.filter((u) => !memberUserIds.has(u.id))

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Club not found.</p>
          <Link href="/admin/clubs" className="text-emerald-600 hover:underline">Back to clubs</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">

        {/* Breadcrumb */}
        <div className="mb-6 text-sm text-gray-500">
          <Link href="/admin/clubs" className="hover:text-emerald-600 transition-colors">Clubs</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-800 font-medium">{clubName}</span>
        </div>

        {/* Rename */}
        <div className="bg-white rounded-xl shadow p-5 mb-6 max-w-lg">
          <h2 className="font-semibold text-gray-700 mb-3">Club Name</h2>
          <form onSubmit={handleRename} className="flex gap-2">
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
            <button
              type="submit"
              disabled={editName === clubName}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              Save
            </button>
          </form>
        </div>

        {/* Drag & drop panels */}
        <div className="grid grid-cols-2 gap-6">

          {/* Left — available users */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOverPanel('users') }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverPanel(null) }}
            onDrop={onDropToUsers}
            className={`bg-white rounded-xl shadow p-5 min-h-64 transition-colors ${
              dragOverPanel === 'users' ? 'ring-2 ring-emerald-400 bg-emerald-50' : ''
            }`}
          >
            <h2 className="font-semibold text-gray-700 mb-1">All Users</h2>
            <p className="text-xs text-gray-400 mb-4">Drag a user to the right panel to add them.</p>

            {nonMembers.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">All users are already members.</p>
            ) : (
              <ul className="space-y-2">
                {nonMembers.map((u) => (
                  <li
                    key={u.id}
                    draggable
                    onDragStart={() => onDragStart(u.id, 'users')}
                    className="flex items-center gap-3 px-3 py-2 border rounded-lg cursor-grab active:cursor-grabbing hover:border-emerald-400 hover:bg-emerald-50 transition-colors select-none"
                  >
                    <span className="text-gray-400">⠿</span>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{u.name}</p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Right — members */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOverPanel('members') }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverPanel(null) }}
            onDrop={onDropToMembers}
            className={`bg-white rounded-xl shadow p-5 min-h-64 transition-colors ${
              dragOverPanel === 'members' ? 'ring-2 ring-emerald-400 bg-emerald-50' : ''
            }`}
          >
            <h2 className="font-semibold text-gray-700 mb-1">Members</h2>
            <p className="text-xs text-gray-400 mb-4">Drag a member back to remove. Check box = Club Manager.</p>

            {members.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Drop users here to add them.</p>
            ) : (
              <ul className="space-y-2">
                {members.map((m) => {
                  const isManager = m.role.name === 'CLUBMANAGER'
                  return (
                    <li
                      key={m.id}
                      draggable
                      onDragStart={() => onDragStart(m.user.id, 'members')}
                      className="flex items-center gap-3 px-3 py-2 border rounded-lg cursor-grab active:cursor-grabbing hover:border-red-300 hover:bg-red-50 transition-colors select-none"
                    >
                      <span className="text-gray-400">⠿</span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{m.user.name}</p>
                        <p className="text-xs text-gray-400">{m.user.email}</p>
                      </div>
                      <label
                        className="flex items-center gap-1.5 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isManager}
                          onChange={(e) => handleManagerToggle(m.user.id, e.target.checked)}
                          className="w-4 h-4 accent-emerald-600"
                        />
                        <span className="text-xs text-gray-500 whitespace-nowrap">Manager</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

        </div>

      </div>
    </div>
  )
}
