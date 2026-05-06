'use client'

import React, { useEffect, useState } from 'react'
import { apiClient, type Plan } from '@/lib/api'

type SyncStatus = 'ok' | 'error' | null
type EditRow = Plan & { dirty: boolean; saving: boolean; originalId: string; syncStatus: SyncStatus; syncError: string }

export default function PlanPanel() {
  const [plans, setPlans] = useState<EditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [newPlan, setNewPlan] = useState<Omit<Plan, 'createdAt' | 'updatedAt'>>({
    id: '', name: '', maxMembers: 30, priceYen: 0, creditsPerPeriod: 0, active: true, sortOrder: 0
  })
  const [toast, setToast] = useState('')

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  useEffect(() => {
    apiClient.getPlans()
      .then((data) => setPlans(data.map((p) => ({ ...p, dirty: false, saving: false, originalId: p.id, syncStatus: null, syncError: '' }))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  function patch(originalId: string, field: keyof Plan, value: string | number | boolean) {
    setPlans((prev) => prev.map((p) => p.originalId === originalId ? { ...p, [field]: value, dirty: true } : p))
  }

  async function handleSave(plan: EditRow) {
    setPlans((prev) => prev.map((p) => p.originalId === plan.originalId ? { ...p, saving: true } : p))
    try {
      const updated = await apiClient.updatePlan(plan.originalId, {
        id: plan.id, name: plan.name, maxMembers: plan.maxMembers,
        priceYen: plan.priceYen, creditsPerPeriod: plan.creditsPerPeriod,
        active: plan.active, sortOrder: plan.sortOrder
      })
      setPlans((prev) => {
        const rows: EditRow[] = prev.map((p) => {
          if (p.originalId !== plan.originalId) return p
          return { ...p, ...updated, dirty: false, saving: false, originalId: updated.id }
        }) as EditRow[]
        return rows
      })
      flash('保存しました')
    } catch {
      setPlans((prev) => prev.map((p) => p.originalId === plan.originalId ? { ...p, saving: false } : p))
      flash('保存に失敗しました')
    }
  }

  async function handleDelete(plan: EditRow) {
    if (!confirm(`プラン "${plan.originalId}" を削除しますか？`)) return
    try {
      await apiClient.deletePlan(plan.originalId)
      setPlans((prev) => prev.filter((p) => p.originalId !== plan.originalId))
      flash('削除しました')
    } catch {
      flash('削除に失敗しました')
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      const created = await apiClient.createPlan(newPlan)
      setPlans((prev) => [...prev, { ...created, dirty: false, saving: false, originalId: created.id, syncStatus: null, syncError: '' }])
      setNewPlan({ id: '', name: '', maxMembers: 30, priceYen: 0, creditsPerPeriod: 0, active: true, sortOrder: 0 })
      flash('作成しました')
    } catch {
      flash('作成に失敗しました')
    } finally {
      setCreating(false)
    }
  }

  async function handleSyncAll() {
    setSyncing(true)
    setPlans((prev) => prev.map((p) => ({ ...p, syncStatus: null, syncError: '' })))
    let ok = 0
    try {
      await Promise.all(plans.map(async (plan) => {
        try {
          const { name, priceYen } = await apiClient.syncPlanFromStripe(plan.id)
          const updated = await apiClient.updatePlan(plan.originalId, { name, priceYen })
          setPlans((prev) => prev.map((p) => {
            if (p.originalId !== plan.originalId) return p
            return { ...p, ...updated, dirty: false, saving: false, originalId: updated.id, syncStatus: 'ok', syncError: '' }
          }))
          ok++
        } catch (err: any) {
          const msg = err?.apiMessage ?? err?.message ?? 'エラー'
          setPlans((prev) => prev.map((p) =>
            p.originalId === plan.originalId ? { ...p, syncStatus: 'error', syncError: msg } : p
          ))
        }
      }))
      flash(`Stripe同期完了（${ok}/${plans.length} 件成功）`)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}</div>

  return (
    <div className="space-y-6">
      {toast && (
        <p className="text-sm text-emerald-600">{toast}</p>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <span className="text-xs text-gray-500">プラン名・月額は Stripe から同期されます</span>
          <button
            onClick={handleSyncAll}
            disabled={syncing}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg transition-colors"
          >
            {syncing ? '同期中…' : 'Stripe同期'}
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">ID（Stripe Price ID）</th>
              <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">プラン名</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">上限人数</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">月額（円）</th>
              <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500">クレジット/月</th>
              <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">順序</th>
              <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">有効</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {plans.map((p) => (
              <React.Fragment key={p.originalId}>
              <tr className={p.dirty ? 'bg-yellow-50' : ''}>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {p.syncStatus === 'ok' && (
                      <span className="shrink-0 text-emerald-500" title="Stripe確認済み">✓</span>
                    )}
                    {p.syncStatus === 'error' && (
                      <span className="shrink-0 text-red-500">✕</span>
                    )}
                    <input
                      value={p.id}
                      onChange={(e) => patch(p.originalId, 'id', e.target.value)}
                      className="w-full border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-400"
                      placeholder="price_xxxxxxxx"
                    />
                  </div>
                </td>
                <td className="px-4 py-2 text-sm text-gray-700">{p.name || <span className="text-gray-300">—</span>}</td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={p.maxMembers}
                    onChange={(e) => patch(p.originalId, 'maxMembers', Number(e.target.value))}
                    title="-1 = 無制限"
                    className="w-20 border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </td>
                <td className="px-4 py-2 text-sm text-right text-gray-700">
                  {p.priceYen > 0 ? `¥${p.priceYen.toLocaleString()}` : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2">
                  <input
                    type="number"
                    value={p.creditsPerPeriod}
                    onChange={(e) => patch(p.originalId, 'creditsPerPeriod', Number(e.target.value))}
                    className="w-24 border rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="number"
                    value={p.sortOrder}
                    onChange={(e) => patch(p.originalId, 'sortOrder', Number(e.target.value))}
                    className="w-14 border rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={p.active}
                    onChange={(e) => patch(p.originalId, 'active', e.target.checked)}
                    className="accent-emerald-600"
                  />
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap space-x-2">
                  {p.dirty && (
                    <button
                      onClick={() => handleSave(p)}
                      disabled={p.saving}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-3 py-1 rounded-lg transition-colors"
                    >
                      {p.saving ? '…' : '保存'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(p)}
                    className="text-xs text-red-500 hover:text-red-700 transition-colors"
                  >
                    削除
                  </button>
                </td>
              </tr>
              {p.syncStatus === 'error' && (
                <tr>
                  <td colSpan={8} className="px-4 py-1.5 bg-red-50 text-xs text-red-600 border-t border-red-100">
                    {p.syncError}
                  </td>
                </tr>
              )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow p-5">
        <h3 className="font-semibold text-gray-800 mb-3 text-sm">新しいプランを追加</h3>
        <p className="text-xs text-gray-400 mb-3">ID には Stripe の Price ID を設定してください。フリープランは "free" を使用します。上限人数 -1 は無制限です。プラン名・月額は Stripe同期 で取得されます。</p>
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">ID</label>
            <input value={newPlan.id} onChange={(e) => setNewPlan((p) => ({ ...p, id: e.target.value }))}
              placeholder="price_xxxxxxxx" required
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">上限人数（-1=無制限）</label>
            <input type="number" value={newPlan.maxMembers} onChange={(e) => setNewPlan((p) => ({ ...p, maxMembers: Number(e.target.value) }))}
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">表示順</label>
            <input type="number" value={newPlan.sortOrder} onChange={(e) => setNewPlan((p) => ({ ...p, sortOrder: Number(e.target.value) }))}
              className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
          </div>
          <div className="flex items-end sm:col-start-3">
            <button type="submit" disabled={creating}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors">
              {creating ? '作成中…' : '追加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
