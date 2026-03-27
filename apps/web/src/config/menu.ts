import { UserRole } from '@/lib/auth'

// Who can see a menu item:
//   'public'        — everyone, including guests
//   'authenticated' — any logged-in user
//   UserRole        — only users that have that specific role
export type MenuVisibility = 'public' | 'authenticated' | UserRole

export interface MenuItem {
  label: string
  href: string
  visibleTo: MenuVisibility[]
}

export const menuItems: MenuItem[] = [
  {
    label: 'Home',
    href: '/',
    visibleTo: ['public'],
  },
  {
    label: 'Posts',
    href: '/posts',
    visibleTo: ['public'],
  },
  {
    label: 'Identify',
    href: '/identify',
    visibleTo: ['authenticated'],
  },
  {
    label: 'Field Guide',
    href: '/taxonomy',
    visibleTo: ['public'],
  },
  {
    label: 'Events',
    href: '/admin/events',
    visibleTo: ['ADMIN', 'DEVELOPER', 'CLUBMANAGER'],
  },
  {
    label: 'Clubs',
    href: '/admin/clubs',
    visibleTo: ['ADMIN', 'DEVELOPER'],
  },
]
