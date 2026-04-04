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
    label: 'Field Guide',
    href: '/taxonomy',
    visibleTo: ['public'],
  },
  {
    label: 'Club Events',
    href: '/admin/events',
    visibleTo: ['ADMIN', 'DEVELOPER', 'CLUBMANAGER'],
  },
  {
    label: 'User Events',
    href: '/events',
    visibleTo: ['authenticated'],
  },
  {
    label: 'Clubs',
    href: '/admin/clubs',
    visibleTo: ['ADMIN', 'DEVELOPER', 'CLUBMANAGER'],
  },
  {
    label: 'Taxonomy',
    href: '/admin/taxonomy',
    visibleTo: ['ADMIN', 'DEVELOPER'],
  },
]
