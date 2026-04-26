'use client'

import Link from 'next/link'

export default function SubscriptionSuccessPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold text-gray-900">ありがとうございます！</h1>
        <p className="mt-3 text-gray-600">
          サブスクリプションのお申し込みが完了しました。
          マイコログスのすべての機能をご利用いただけます。
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/"
            className="block w-full py-3 rounded-xl bg-green-700 text-white font-medium hover:bg-green-800 transition-colors"
          >
            ホームへ
          </Link>
          <Link
            href="/profile"
            className="block w-full py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
          >
            プロフィールを見る
          </Link>
        </div>
      </div>
    </div>
  )
}
