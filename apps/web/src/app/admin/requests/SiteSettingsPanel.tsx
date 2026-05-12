'use client'

import { useEffect, useState } from 'react'
import { apiClient } from '@/lib/api'

export default function SiteSettingsPanel() {
  const [maintenance, setMaintenance] = useState(false)
  const [adminEmails, setAdminEmails] = useState(['', '', ''])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [emailSaving, setEmailSaving] = useState(false)
  const [toast, setToast] = useState('')

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  useEffect(() => {
    apiClient.getSiteSettings()
      .then((s) => {
        setMaintenance(s.maintenanceMode)
        setAdminEmails([s.adminEmail1 ?? '', s.adminEmail2 ?? '', s.adminEmail3 ?? ''])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function toggle() {
    setSaving(true)
    try {
      const result = await apiClient.updateSiteSettings({ maintenanceMode: !maintenance })
      setMaintenance(result.maintenanceMode)
      flash(result.maintenanceMode ? 'メンテナンスモードを有効にしました。' : 'メンテナンスモードを解除しました。')
    } catch {
      flash('保存に失敗しました。')
    } finally {
      setSaving(false)
    }
  }

  async function saveEmails(e: React.FormEvent) {
    e.preventDefault()
    setEmailSaving(true)
    try {
      await apiClient.updateSiteSettings({
        adminEmail1: adminEmails[0],
        adminEmail2: adminEmails[1],
        adminEmail3: adminEmails[2],
      })
      flash('管理者メールアドレスを保存しました。')
    } catch {
      flash('保存に失敗しました。')
    } finally {
      setEmailSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-10 bg-gray-200 rounded w-1/2" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 bg-gray-800 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}

      {/* Admin notification emails */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">管理者通知メールアドレス</h2>
        <p className="text-sm text-gray-500 mb-4">
          クラブ立ち上げ申請・退会申請があった際に通知を送る宛先です。最大3件設定できます。
        </p>
        <form onSubmit={saveEmails} className="space-y-2">
          {adminEmails.map((email, i) => (
            <input
              key={i}
              type="email"
              value={email}
              onChange={(e) => {
                const next = [...adminEmails]
                next[i] = e.target.value
                setAdminEmails(next)
              }}
              placeholder={`宛先${i + 1}（例: admin@example.com）`}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          ))}
          <div className="pt-1">
            <button
              type="submit"
              disabled={emailSaving}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {emailSaving ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      </div>

      {/* Maintenance mode */}
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">メンテナンスモード</h2>
        <p className="text-sm text-gray-500 mb-4">
          有効にすると、管理者以外のユーザーはログインできなくなります。
        </p>

        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
            maintenance ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {maintenance ? 'メンテナンス中' : '通常営業中'}
          </span>

          <button
            onClick={toggle}
            disabled={saving}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 ${
              maintenance
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            {saving ? '保存中…' : maintenance ? 'メンテナンスを解除する' : 'メンテナンスモードにする'}
          </button>
        </div>
      </div>
    </div>
  )
}
