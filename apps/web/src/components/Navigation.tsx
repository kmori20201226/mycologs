'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  getStoredUser, clearAuth, type AuthUser,
  getStoredClubs, setStoredClubs,
  getSelectedClubId, setSelectedClubId,
  getToken,
  type ClubMembership
} from '@/lib/auth'
import { menuItems, type MenuVisibility } from '@/config/menu'
import { apiClient } from '@/lib/api'

function isVisible(
  visibleTo: MenuVisibility[],
  user: AuthUser | null,
  clubs: ClubMembership[],
  selectedClubId: number | null
): boolean {
  if (visibleTo.includes('public')) return true
  if (!user) return false
  if (visibleTo.includes('authenticated')) return true
  if (user.role && visibleTo.includes(user.role)) return true
  // Fall back to the role the user holds in the currently selected club
  const clubRole = clubs.find((c) => c.id === selectedClubId)?.role
  return clubRole ? visibleTo.includes(clubRole as MenuVisibility) : false
}

export default function Navigation() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [clubs, setClubs] = useState<ClubMembership[]>([])
  const [selectedClubId, _setSelectedClubId] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)

  useEffect(() => {
    const u = getStoredUser()
    setUser(u)
    if (!u) return

    // Load clubs from cache first, then refresh from API
    const cached = getStoredClubs()
    setClubs(cached)
    if (cached.length > 0) {
      const saved = getSelectedClubId()
      _setSelectedClubId(saved ?? cached[0].id)
    }

    const token = getToken()
    if (!token) return

    function onResolved() {
      setPendingRequestCount((n) => Math.max(0, n - 1))
    }
    function onCreated() {
      setPendingRequestCount((n) => n + 1)
    }
    function onClubChanged(e: Event) {
      const { clubId: newId } = (e as CustomEvent).detail
      _setSelectedClubId(newId)
      setSelectedClubId(newId)
      fetchPendingCount(newId, getStoredClubs())
    }
    window.addEventListener('pendingRequestResolved', onResolved)
    window.addEventListener('pendingRequestCreated', onCreated)
    window.addEventListener('clubChanged', onClubChanged)

    apiClient.request<ClubMembership[]>('/me/clubs', {
      headers: { Authorization: `Bearer ${token}` }
    }).then((fresh) => {
      setStoredClubs(fresh)
      setClubs(fresh)
      const saved = getSelectedClubId()
      const validId = fresh.find((c) => c.id === saved)?.id ?? fresh[0]?.id ?? null
      _setSelectedClubId(validId)
      setSelectedClubId(validId)
      if (validId) fetchPendingCount(validId, fresh)
    }).catch((err) => { console.error('Failed to fetch clubs:', err) })

    return () => {
      window.removeEventListener('pendingRequestResolved', onResolved)
      window.removeEventListener('pendingRequestCreated', onCreated)
      window.removeEventListener('clubChanged', onClubChanged)
    }
  }, [])

  function fetchPendingCount(_id: number, clubList: ClubMembership[]) {
    const managedClubs = clubList.filter((c) => c.role === 'CLUBMANAGER')
    if (managedClubs.length === 0) { setPendingRequestCount(0); return }
    Promise.all(
      managedClubs.map((c) =>
        apiClient.request<{ id: number }[]>(`/user-requests?clubId=${c.id}&pending=true`)
          .then((items) => items.length)
          .catch(() => 0)
      )
    ).then((counts) => setPendingRequestCount(counts.reduce((a, b) => a + b, 0)))
  }

  function handleClubChange(id: number) {
    window.dispatchEvent(new CustomEvent('clubChanged', { detail: { clubId: id } }))
  }

  function handleLogout() {
    clearAuth()
    window.location.href = '/'
  }

  const visibleItems = menuItems.filter((item) => isVisible(item.visibleTo, user, clubs, selectedClubId))
  const selectedClub = clubs.find((c) => c.id === selectedClubId)

  return (
    <nav className="bg-white shadow-sm border-b relative">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">

          {/* Left: hamburger + logo */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="relative text-gray-700 hover:text-emerald-600 transition-colors p-1"
              aria-label="Toggle menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              {pendingRequestCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
                </span>
              )}
            </button>

            <Link href="/" className="text-2xl font-bold text-emerald-600">
              🍄 Mycologs
            </Link>
          </div>

          {/* Centre: club selector */}
          {user && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">Club:</span>
              {clubs.length === 0 && (
                <span className="text-gray-400 italic">—</span>
              )}
              {clubs.length === 1 && (
                <span className="font-medium text-gray-700">{clubs[0].name}</span>
              )}
              {clubs.length > 1 && (
                <select
                  value={selectedClubId ?? ''}
                  onChange={(e) => handleClubChange(Number(e.target.value))}
                  className="border rounded-lg px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              {clubs.length === 1 && selectedClub && (
                <span className="text-xs text-gray-400">({selectedClub.role})</span>
              )}
            </div>
          )}

          {/* Right: auth */}
          {user ? (
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Hi, {user.name}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-700 hover:text-red-600 font-medium transition-colors"
              >
                Log out
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-4">
              <Link href="/login" className="text-gray-700 hover:text-emerald-600 font-medium transition-colors">
                Log in
              </Link>
              <Link
                href="/register"
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <div className="absolute top-16 left-0 w-56 bg-white border shadow-lg z-50">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 font-medium transition-colors"
            >
              {item.label}
              {item.href === '/admin/requests' && pendingRequestCount > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
                  {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}
