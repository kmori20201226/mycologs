'use client'

import { useEffect, useState } from 'react'
import { apiClient, type Announcement } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

export default function AnnouncementPanel() {
  const [current, setCurrent] = useState<Announcement | null>(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  useEffect(() => {
    apiClient.getAnnouncements({ site: true }).then((list) => {
      const ann = list[0] ?? null
      setCurrent(ann)
      setBody(ann?.body ?? '')
    }).catch(() => {})
  }, [])

  function flash(text: string, ok: boolean) {
    setMessage({ text, ok })
    setTimeout(() => setMessage(null), 3000)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    const user = getStoredUser()
    if (!user) return
    setSaving(true)
    try {
      if (current) {
        const updated = await apiClient.updateAnnouncement(current.id, { body: body.trim(), active: true })
        setCurrent(updated)
      } else {
        const created = await apiClient.createAnnouncement({ body: body.trim(), clubId: null })
        setCurrent(created)
      }
      flash('公開しました', true)
    } catch {
      flash('保存に失敗しました', false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!current) return
    setDeleting(true)
    try {
      await apiClient.deleteAnnouncement(current.id)
      setCurrent(null)
      setBody('')
      flash('削除しました', true)
    } catch {
      flash('削除に失敗しました', false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {message && (
        <p className={`text-sm ${message.ok ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
      )}

      <div className="bg-white rounded-xl shadow p-5">
        <h2 className="font-semibold text-gray-800 mb-1">サイトお知らせ</h2>
        <p className="text-xs text-gray-400 mb-4">ホーム画面に全ユーザー向けのお知らせを表示します。</p>

        {current && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-900 whitespace-pre-wrap">
            {current.body}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            placeholder="お知らせの内容を入力…"
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            required
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={saving || !body.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              {saving ? '保存中…' : current ? '更新・公開' : '公開する'}
            </button>
            {current && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="bg-white border border-red-400 hover:bg-red-50 disabled:opacity-40 text-red-500 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
              >
                {deleting ? '削除中…' : '削除'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
