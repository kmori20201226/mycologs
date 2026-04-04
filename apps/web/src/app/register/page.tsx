'use client'

import { useState } from 'react'
import Link from 'next/link'
import { apiClient } from '@/lib/api'
import { setToken, setStoredUser } from '@/lib/auth'

export default function RegisterPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirm) {
      setError('パスワードが一致しません。')
      return
    }

    setLoading(true)

    try {
      const { token, user } = await apiClient.register({ name, email, password })
      setToken(token)
      setStoredUser(user)
      window.location.href = '/'
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('409')) {
        setError('このメールアドレスはすでに登録されています。')
      } else {
        setError('エラーが発生しました。もう一度お試しください。')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">新規登録</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              名前
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

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
              パスワード <span className="text-gray-400 font-normal">（8文字以上）</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              パスワード（確認）
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              className={`w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                confirm && confirm !== password ? 'border-red-400' : ''
              }`}
              required
            />
            {confirm && confirm !== password && (
              <p className="text-red-500 text-xs mt-1">パスワードが一致しません。</p>
            )}
          </div>

          {error && (
            <p className="text-red-600 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg font-semibold transition-colors"
          >
            {loading ? '登録中…' : 'アカウントを作成'}
          </button>
        </form>

        <p className="mt-4 text-sm text-gray-600 text-center">
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-emerald-600 hover:underline font-medium">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  )
}
