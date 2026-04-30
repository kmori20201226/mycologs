'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiClient } from '@/lib/api'
import { setToken, setStoredUser } from '@/lib/auth'

function VerifyEmailInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const email = searchParams.get('email') ?? ''

  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendMessage, setResendMessage] = useState('')
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!email) router.replace('/register')
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
    setLoading(true)
    setError('')
    try {
      const { token, user } = await apiClient.verifyEmail({ email, code })
      setToken(token)
      setStoredUser(user)
      window.location.href = '/'
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg.includes('{') ? JSON.parse(msg.match(/\{.*\}/)?.[0] ?? '{}').message ?? '確認に失敗しました。' : '確認に失敗しました。もう一度お試しください。')
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
      await apiClient.resendVerification({ email })
      setResendCooldown(60)
      setResendMessage('確認コードを再送信しました。')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      setError(msg || '再送信に失敗しました。')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">📧</div>
          <h1 className="text-2xl font-bold text-gray-900">メールアドレスの確認</h1>
          <p className="text-sm text-gray-500 mt-2">
            <span className="font-medium text-gray-700">{email}</span> に送信された<br />
            6桁の確認コードを入力してください。
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
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
              />
            ))}
          </div>

          {error && <p className="text-red-600 text-sm text-center">{error}</p>}
          {resendMessage && <p className="text-emerald-600 text-sm text-center">{resendMessage}</p>}

          <button
            type="submit"
            disabled={loading || digits.join('').length < 6}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg font-semibold transition-colors"
          >
            {loading ? '確認中…' : '確認する'}
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

        <p className="mt-4 text-xs text-gray-400 text-center">
          コードの有効期限は15分です。
        </p>
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  )
}
