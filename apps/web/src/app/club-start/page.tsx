'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

export default function ClubStartPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [introduction, setIntroduction] = useState('')
  const [policy, setPolicy] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const user = getStoredUser()
    if (!user) { router.replace('/login'); return }
    setError('')
    setSubmitting(true)
    try {
      await apiClient.requestStartClub({ name: name.trim(), introduction, policy, message })
      setDone(true)
    } catch {
      setError('申請の送信に失敗しました。もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md text-center">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">申請を送信しました</h1>
          <p className="text-sm text-gray-500 mb-6">
            管理者が確認後、承認されるとクラブが公開されます。申請状況は「クラブメンバーシップ」の申請履歴からご確認いただけます。
          </p>
          <Link
            href="/club-request"
            className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors"
          >
            申請履歴を確認
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-xl">

        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/club-request"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            戻る
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">クラブを立ち上げる</h1>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <p className="text-sm text-gray-500 mb-5">
            申請内容を管理者が確認し、承認されるとクラブが公開されます。
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                クラブ名 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 東京きのこの会"
                required
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                クラブ紹介文
                <span className="text-gray-400 font-normal ml-1">（任意）</span>
              </label>
              <textarea
                value={introduction}
                onChange={(e) => setIntroduction(e.target.value)}
                placeholder="クラブの目的や活動内容を紹介してください…"
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                クラブポリシー
                <span className="text-gray-400 font-normal ml-1">（任意）</span>
              </label>
              <textarea
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
                placeholder="参加条件、ルール、注意事項など…"
                rows={4}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                管理者へのメッセージ
                <span className="text-gray-400 font-normal ml-1">（任意）</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="立ち上げの目的や背景など、管理者に伝えたいことを入力してください…"
                rows={3}
                className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {submitting ? '送信中…' : '申請する'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}
