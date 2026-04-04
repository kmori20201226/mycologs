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
    label: 'ホーム',
    href: '/',
    visibleTo: ['public'],
  },
  {
    label: 'フィールドガイド',
    href: '/taxonomy',
    visibleTo: ['public'],
  },
  {
    label: 'クラブイベント',
    href: '/admin/events',
    visibleTo: ['ADMIN', 'DEVELOPER', 'CLUBMANAGER'],
  },
  {
    label: 'メンバー申請',
    href: '/admin/requests',
    visibleTo: ['ADMIN', 'DEVELOPER', 'CLUBMANAGER'],
  },
  {
    label: 'マイイベント',
    href: '/events',
    visibleTo: ['authenticated'],
  },
  {
    label: 'クラブに参加',
    href: '/club-request',
    visibleTo: ['authenticated'],
  },
  {
    label: 'プロフィール',
    href: '/profile',
    visibleTo: ['authenticated'],
  },
  {
    label: 'クラブ',
    href: '/admin/clubs',
    visibleTo: ['ADMIN', 'DEVELOPER', 'CLUBMANAGER'],
  },
  {
    label: '分類管理',
    href: '/admin/taxonomy',
    visibleTo: ['ADMIN', 'DEVELOPER'],
  },
]
