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

export type UserRole = 'ADMIN' | 'DEVELOPER' | 'MODERATOR' | 'CLUBMEMBER'

export interface AuthUser {
  id: number
  name: string
  email: string
  roles: UserRole[]
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
}
