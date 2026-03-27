'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getStoredUser, clearAuth, type AuthUser } from '@/lib/auth'
import { menuItems, type MenuVisibility } from '@/config/menu'

function isVisible(visibleTo: MenuVisibility[], user: AuthUser | null): boolean {
  if (visibleTo.includes('public')) return true
  if (!user) return false
  if (visibleTo.includes('authenticated')) return true
  return (user.roles ?? []).some((role) => visibleTo.includes(role))
}

export default function Navigation() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setUser(getStoredUser())
  }, [])

  function handleLogout() {
    clearAuth()
    window.location.href = '/'
  }

  const visibleItems = menuItems.filter((item) => isVisible(item.visibleTo, user))

  return (
    <nav className="bg-white shadow-sm border-b relative">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">

          {/* Left side: hamburger + logo */}
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="text-gray-700 hover:text-emerald-600 transition-colors p-1"
              aria-label="Toggle menu"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <Link href="/" className="text-2xl font-bold text-emerald-600">
              🍄 Mycologs
            </Link>
          </div>

          {/* Right side: auth */}
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
              className="block px-4 py-3 text-gray-700 hover:bg-emerald-50 hover:text-emerald-600 font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </nav>
  )
}
