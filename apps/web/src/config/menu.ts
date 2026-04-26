import { UserRole } from '@/lib/auth'

export type MenuVisibility = 'public' | 'authenticated' | UserRole

export interface MenuLeaf {
  type: 'item'
  label: string
  href: string
  visibleTo: MenuVisibility[]
}

export interface MenuGroup {
  type: 'group'
  label: string
  visibleTo: MenuVisibility[]
  children: MenuLeaf[]
}

export type MenuEntry = MenuLeaf | MenuGroup

export const menuEntries: MenuEntry[] = [
  {
    type: 'item',
    label: 'ホーム',
    href: '/',
    visibleTo: ['public'],
  },
  {
    type: 'item',
    label: 'マイイベント',
    href: '/events',
    visibleTo: ['authenticated'],
  },
  {
    type: 'item',
    label: 'プロフィール',
    href: '/profile',
    visibleTo: ['authenticated'],
  },
  {
    type: 'item',
    label: 'クラブに参加',
    href: '/club-request',
    visibleTo: ['authenticated'],
  },
  {
    type: 'item',
    label: 'サブスクリプション',
    href: '/subscription',
    visibleTo: ['authenticated'],
  },
  {
    type: 'group',
    label: 'クラブマネージャ',
    visibleTo: ['ADMIN', 'DEVELOPER', 'CLUBMANAGER'],
    children: [
      {
        type: 'item',
        label: 'クラブイベント',
        href: '/admin/events',
        visibleTo: ['ADMIN', 'DEVELOPER', 'CLUBMANAGER'],
      },
      {
        type: 'item',
        label: 'メンバー申請処理',
        href: '/admin/requests',
        visibleTo: ['ADMIN', 'DEVELOPER', 'CLUBMANAGER'],
      },
    ],
  },
  {
    type: 'group',
    label: 'デバッグ',
    visibleTo: ['DEVELOPER'],
    children: [
      {
        type: 'item',
        label: 'ユーザー / クラブ',
        href: '/debug/user',
        visibleTo: ['DEVELOPER'],
      },
    ],
  },
  {
    type: 'group',
    label: 'サイトマネージャ',
    visibleTo: ['ADMIN', 'DEVELOPER'],
    children: [
      {
        type: 'item',
        label: 'クラブ管理',
        href: '/admin/clubs',
        visibleTo: ['ADMIN', 'DEVELOPER'],
      },
      {
        type: 'item',
        label: '分類管理',
        href: '/admin/taxonomy',
        visibleTo: ['ADMIN', 'DEVELOPER'],
      },
      {
        type: 'item',
        label: 'ユーザーログ',
        href: '/admin/user-logs',
        visibleTo: ['ADMIN', 'DEVELOPER'],
      },
    ],
  },
]

// Legacy flat list kept for any consumers that still import menuItems
export type MenuItem = MenuLeaf
export const menuItems: MenuItem[] = menuEntries.flatMap((e) =>
  e.type === 'item' ? [e] : e.children
)
