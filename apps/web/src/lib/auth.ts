// Cookie-based token storage so both client and server can access it

export function getToken(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|; )token=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

export function setToken(token: string) {
  const maxAge = 60 * 60 * 24 * 7 // 7 days
  document.cookie = `token=${encodeURIComponent(token)}; path=/; max-age=${maxAge}`
}

export function removeToken() {
  document.cookie = 'token=; path=/; max-age=0'
}

// Roles that can be assigned to a user at the system level.
// CLUBMEMBER and CLUBMANAGER are intentionally excluded — those are
// club-membership roles expressed via ClubUser, not on the user directly.
export type UserLevelRole = 'ADMIN' | 'DEVELOPER' | 'MODERATOR'

// Full role union used for menu visibility checks (includes club roles).
export type UserRole = UserLevelRole | 'CLUBMEMBER' | 'CLUBMANAGER'

export interface ClubMembership {
  id: number
  name: string
  createdAt: string
  credit: number
  role: string
}

export interface AuthUser {
  id: number
  name: string
  email: string
  role: UserLevelRole | null
}

export function getStoredUser(): AuthUser | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem('user')
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch {
    return null
  }
}

export function setStoredUser(user: AuthUser) {
  localStorage.setItem('user', JSON.stringify(user))
}

export function clearAuth() {
  removeToken()
  localStorage.removeItem('user')
  localStorage.removeItem('selectedClubId')
  localStorage.removeItem('clubs')
}

// Club selection — persisted in localStorage

export function getStoredClubs(): ClubMembership[] {
  if (typeof localStorage === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem('clubs') ?? '[]') as ClubMembership[]
  } catch {
    return []
  }
}

export function setStoredClubs(clubs: ClubMembership[]) {
  localStorage.setItem('clubs', JSON.stringify(clubs))
}

export function getSelectedClubId(): number | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem('selectedClubId')
  return raw ? Number(raw) : null
}

export function setSelectedClubId(id: number | null) {
  if (id === null) {
    localStorage.removeItem('selectedClubId')
  } else {
    localStorage.setItem('selectedClubId', String(id))
  }
}
