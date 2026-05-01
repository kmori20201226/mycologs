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
import { menuEntries, type MenuVisibility } from '@/config/menu'
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
      fetchPendingCount(validId ?? 0, fresh)
    }).catch((err) => { console.error('Failed to fetch clubs:', err) })

    return () => {
      window.removeEventListener('pendingRequestResolved', onResolved)
      window.removeEventListener('pendingRequestCreated', onCreated)
      window.removeEventListener('clubChanged', onClubChanged)
    }
  }, [])

  function fetchPendingCount(_id: number, clubList: ClubMembership[]) {
    const u = getStoredUser()
    const isAdminLevel = ['ADMIN', 'DEVELOPER', 'MODERATOR'].includes(u?.role ?? '')
    const managedClubs = clubList.filter((c) => c.role === 'CLUBMANAGER')

    const fetches: Promise<number>[] = managedClubs.map((c) =>
      apiClient.request<{ id: number }[]>(`/user-requests?clubId=${c.id}&pending=true`)
        .then((items) => items.length)
        .catch(() => 0)
    )

    if (isAdminLevel) {
      fetches.push(
        apiClient.request<{ id: number }[]>(`/user-requests?requestType=StartClub&pending=true`)
          .then((items) => items.length)
          .catch(() => 0)
      )
    }

    if (fetches.length === 0) { setPendingRequestCount(0); return }
    Promise.all(fetches).then((counts) => setPendingRequestCount(counts.reduce((a, b) => a + b, 0)))
  }

  function handleClubChange(id: number) {
    window.dispatchEvent(new CustomEvent('clubChanged', { detail: { clubId: id } }))
  }

  function handleLogout() {
    clearAuth()
    window.location.href = '/'
  }

  const visibleEntries = menuEntries.filter((entry) => isVisible(entry.visibleTo, user, clubs, selectedClubId))
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
              aria-label="メニューを開閉"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              {pendingRequestCount > 0 && (
                clubs.some((c) => c.role === 'CLUBMANAGER') ||
                ['ADMIN', 'DEVELOPER', 'MODERATOR'].includes(user?.role ?? '')
              ) && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {pendingRequestCount > 9 ? '9+' : pendingRequestCount}
                </span>
              )}
            </button>

            <Link href="/" className="text-2xl font-bold text-emerald-600">
              🍄 <span className="hidden sm:inline">Mycologs</span>
            </Link>
          </div>

          {/* Centre: club selector */}
          {user && (
            <div className="flex items-center gap-2 text-sm">
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
            </div>
          )}

          {/* Right: auth */}
          {user ? (
            <div className="flex items-center space-x-4">
              <button
                onClick={handleLogout}
                className="text-sm font-medium text-gray-700 bg-gray-100 hover:bg-red-50 hover:text-red-600 px-3 py-1.5 rounded-lg transition-colors"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-4">
              <Link href="/login" className="text-gray-700 hover:text-emerald-600 font-medium transition-colors">
                ログイン
              </Link>
              <Link
                href="/register"
                className="hidden sm:inline-flex bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                新規登録
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Dropdown menu */}
      {menuOpen && (
        <div className="absolute top-16 left-0 w-56 bg-white border shadow-lg z-50 py-1">
          {visibleEntries.map((entry) => {
            if (entry.type === 'item') {
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-between px-4 py-2.5 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 font-medium transition-colors"
                >
                  {entry.label}
                </Link>
              )
            }
            // Group
            const visibleChildren = entry.children.filter((c) =>
              isVisible(c.visibleTo, user, clubs, selectedClubId)
            )
            if (visibleChildren.length === 0) return null
            return (
              <div key={entry.label}>
                <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  {entry.label}
                </p>
                {visibleChildren.map((child) => (
                  <Link
                    key={child.href}
                    href={child.href}
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center justify-between pl-7 pr-4 py-2 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  >
                    {child.label}
                    {(child.href === '/admin/requests' || child.href === '/club-manage') && pendingRequestCount > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
                        {pendingRequestCount > 99 ? '99+' : pendingRequestCount}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </nav>
  )
}
