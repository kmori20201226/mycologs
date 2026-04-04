'use client'

import { useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api'
import { setToken, setStoredUser } from '@/lib/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { token, user } = await apiClient.login({ email, password })
      setToken(token)
      setStoredUser(user)
      window.location.href = '/'
    } catch {
      setError('メールアドレスまたはパスワードが正しくありません。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">ログイン</h1>

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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg font-semibold transition-colors"
          >
            {loading ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>

        <p className="mt-4 text-sm text-gray-600 text-center">
          アカウントをお持ちでない方は{' '}
          <Link href="/register" className="text-emerald-600 hover:underline font-medium">
            新規登録
          </Link>
        </p>
      </div>
    </div>
  )
}
