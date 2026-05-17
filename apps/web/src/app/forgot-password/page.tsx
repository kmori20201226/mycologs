'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { apiClient } from '@/lib/api'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await apiClient.forgotPassword({ email })
      router.push(`/reset-password?email=${encodeURIComponent(email)}`)
    } catch {
      setError('送信に失敗しました。もう一度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔑</div>
          <h1 className="text-2xl font-bold text-gray-900">パスワードのリセット</h1>
          <p className="text-sm text-gray-500 mt-2">
            登録済みのメールアドレスを入力してください。<br />
            確認コードをお送りします。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
              disabled={loading}
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg font-semibold transition-colors"
          >
            {loading ? '送信中…' : '確認コードを送信'}
          </button>
        </form>

        <p className="mt-6 text-sm text-gray-500 text-center">
          <Link href="/login" className="text-emerald-600 hover:underline">
            ログインに戻る
          </Link>
        </p>
      </div>
    </div>
  )
}
