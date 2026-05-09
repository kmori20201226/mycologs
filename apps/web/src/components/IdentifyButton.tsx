'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getStoredUser } from '@/lib/auth'

interface Props {
  className?: string
  children?: React.ReactNode
  href: string
}

export default function IdentifyButton({ className, children, href }: Props) {
  const router = useRouter()
  const [loggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    setLoggedIn(!!getStoredUser())
  }, [])

  if (!loggedIn) {
    return (
      <button
        onClick={() => router.push(`/login`)}
        className={className}
        title="ログインが必要です"
      >
        {children}
      </button>
    )
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}
