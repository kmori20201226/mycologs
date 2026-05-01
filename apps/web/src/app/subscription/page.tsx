'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

interface Plan {
  id: string
  name: string
  price: string
  description: string
  features: string[]
}

const FREE_CREDITS     = Number(process.env.NEXT_PUBLIC_FREE_TIER_CREDITS       ?? 50)
const PERSONAL_CREDITS = Number(process.env.NEXT_PUBLIC_PERSONAL_PLAN_CREDITS   ?? 1000)
const CLUB_CREDITS     = Number(process.env.NEXT_PUBLIC_CLUB_PLAN_CREDITS        ?? 20000)
const AI_COST          = Number(process.env.NEXT_PUBLIC_AI_IDENTIFICATION_COST   ?? 10)

const PERSONAL_PLAN: Plan = {
  id: process.env.NEXT_PUBLIC_STRIPE_PRICE_PERSONAL ?? '',
  name: 'パーソナルプラン',
  price: '¥500 / 月',
  description: '個人でのきのこ探索を支援するプラン',
  features: [
    `毎月 ${PERSONAL_CREDITS} クレジット付与`,
    `AI同定 1回 ${AI_COST} クレジット消費`,
    '優先サポート',
  ],
}

export default function SubscriptionPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(true)

  useEffect(() => {
    const user = getStoredUser()
    if (!user) { router.replace('/login'); return }

    apiClient.getActiveSubscription(user.id)
      .then(res => setIsActive(res.active))
      .catch(() => {})
      .finally(() => setCheckingStatus(false))
  }, [router])

  async function handleSubscribe(planId: string) {
    const user = getStoredUser()
    if (!user) return

    if (!planId) {
      setError('このプランはまだ設定されていません。')
      return
    }

    setLoading(planId)
    setError('')
    try {
      const { url } = await apiClient.createCheckoutSession({ planId, userId: user.id })
      if (url) window.location.href = url
    } catch {
      setError('チェックアウトの開始に失敗しました。もう一度お試しください。')
    } finally {
      setLoading(null)
    }
  }

  async function handleManage() {
    const user = getStoredUser()
    if (!user) return

    setLoading('portal')
    setError('')
    try {
      const { url } = await apiClient.openBillingPortal({ userId: user.id })
      if (url) window.location.href = url
    } catch {
      setError('ポータルの開始に失敗しました。もう一度お試しください。')
    } finally {
      setLoading(null)
    }
  }

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">サブスクリプション</h1>
          <p className="mt-2 text-gray-600">マイコログスの全機能をご利用いただけます</p>
        </div>

        {isActive && (
          <div className="mb-8 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
            <p className="text-green-800 font-medium">サブスクリプションは有効です</p>
            <button
              onClick={handleManage}
              disabled={loading === 'portal'}
              className="mt-3 px-4 py-2 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 text-sm"
            >
              {loading === 'portal' ? '移動中...' : 'サブスクリプションを管理する'}
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm text-center">
            {error}
          </div>
        )}

        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col">
            <h2 className="text-xl font-bold text-gray-900">{PERSONAL_PLAN.name}</h2>
            <p className="mt-1 text-gray-500 text-sm">{PERSONAL_PLAN.description}</p>
            <p className="mt-4 text-3xl font-bold text-gray-900">{PERSONAL_PLAN.price}</p>

            <ul className="mt-6 space-y-3 flex-1">
              {PERSONAL_PLAN.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-green-500 mt-0.5">✓</span>
                  {f}
                </li>
              ))}
            </ul>

            <button
              onClick={() => handleSubscribe(PERSONAL_PLAN.id)}
              disabled={loading === PERSONAL_PLAN.id || isActive}
              className="mt-8 w-full py-3 rounded-xl bg-green-700 text-white font-medium hover:bg-green-800 disabled:opacity-50 transition-colors"
            >
              {loading === PERSONAL_PLAN.id ? '処理中...' : isActive ? '登録済み' : '申し込む'}
            </button>
          </div>
        </div>

        {/* Club plan info */}
        <div className="mt-8 bg-emerald-50 border border-emerald-200 rounded-2xl p-6 max-w-md mx-auto">
          <h2 className="text-lg font-bold text-emerald-800 mb-2">🍄 クラブプランについて</h2>
          <p className="text-sm text-emerald-900 mb-3">
            クラブ向けのクレジットプランも提供しています。クラブプランでは年間 {CLUB_CREDITS.toLocaleString()} クレジット（AI同定 {Math.floor(CLUB_CREDITS / AI_COST).toLocaleString()} 回分）がクラブ全体で共有されます。
          </p>
          <p className="text-sm text-emerald-900 mb-4">
            クラブのマネージャーがクラブ管理ページからクレジットを購入できます。クラブへの参加や新しいクラブの立ち上げは<Link href="/club-request" className="font-semibold underline hover:text-emerald-700">クラブメンバーシップ</Link>ページから申請できます。
          </p>
        </div>

        <div className="mt-6 p-4 bg-gray-100 rounded-xl text-center text-sm text-gray-600">
          無料アカウントには {FREE_CREDITS} クレジットが付与されます（AI同定 {Math.floor(FREE_CREDITS / AI_COST)} 回分）
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          お支払いは Stripe によって安全に処理されます。いつでもキャンセル可能です。
        </p>
      </div>
    </div>
  )
}
