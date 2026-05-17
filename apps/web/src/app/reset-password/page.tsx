'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api'

function ResetPasswordInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''

  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendMessage, setResendMessage] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!email) router.replace('/forgot-password')
  }, [email, router])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  function handleDigitChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[index] = digit
    setDigits(next)
    setError('')
    if (digit && index < 5) inputRefs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) {
      setDigits(text.split(''))
      inputRefs.current[5]?.focus()
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const code = digits.join('')
    if (code.length < 6) { setError('6桁のコードを入力してください。'); return }
    if (newPassword !== confirmPassword) { setError('パスワードが一致しません。'); return }
    if (newPassword.length < 8) { setError('パスワードは8文字以上で入力してください。'); return }

    setLoading(true)
    setError('')
    try {
      await apiClient.resetPassword({ email, code, newPassword })
      router.push('/login?reset=1')
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : ''
      const parsed = raw.match(/\{.*\}/)
      const msg = parsed ? (JSON.parse(parsed[0]).message ?? 'リセットに失敗しました。') : 'リセットに失敗しました。もう一度お試しください。'
      setError(msg)
      setDigits(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    if (resendCooldown > 0) return
    setResendMessage('')
    setError('')
    try {
      await apiClient.forgotPassword({ email })
      setResendCooldown(60)
      setResendMessage('確認コードを再送信しました。')
    } catch {
      setError('再送信に失敗しました。')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🔑</div>
          <h1 className="text-2xl font-bold text-gray-900">新しいパスワードを設定</h1>
          <p className="text-sm text-gray-500 mt-2">
            <span className="font-medium text-gray-700">{email}</span> に送信された<br />
            6桁の確認コードを入力してください。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">確認コード</label>
            <div className="flex justify-center gap-2" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => { inputRefs.current[i] = el }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className="w-12 h-14 text-center text-2xl font-bold border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 border-gray-200"
                  disabled={loading}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">新しいパスワード</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="8文字以上"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワードの確認</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="もう一度入力"
              required
              disabled={loading}
            />
          </div>

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          {resendMessage && <p className="text-emerald-600 text-sm text-center">{resendMessage}</p>}

          <button
            type="submit"
            disabled={loading || digits.join('').length < 6 || !newPassword || !confirmPassword}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg font-semibold transition-colors"
          >
            {loading ? '変更中…' : 'パスワードを変更する'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500 mb-2">コードが届きませんでしたか？</p>
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-sm text-emerald-600 hover:underline disabled:text-gray-400 disabled:no-underline font-medium"
          >
            {resendCooldown > 0 ? `再送信（${resendCooldown}秒後）` : 'コードを再送信する'}
          </button>
        </div>

        <p className="mt-4 text-xs text-gray-400 text-center">コードの有効期限は15分です。</p>

        <p className="mt-4 text-sm text-gray-500 text-center">
          <Link href="/login" className="text-emerald-600 hover:underline">ログインに戻る</Link>
        </p>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <ResetPasswordInner />
    </Suspense>
  )
}
