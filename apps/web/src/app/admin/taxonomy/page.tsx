'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiClient, type TaxShape, type TaxFamily, type TaxGenus, type TaxSpecies, type Edibility } from '@/lib/api'

type Tab = 'shapes' | 'families' | 'genera' | 'species'

const EDIBILITY_OPTIONS: Edibility[] = ['EDIBLE', 'INEDIBLE', 'TOXIC', 'DEADLY', 'UNKNOWN']

export default function AdminTaxonomyPage() {
  const [tab, setTab] = useState<Tab>('shapes')

  const [shapes, setShapes] = useState<TaxShape[]>([])
  const [families, setFamilies] = useState<TaxFamily[]>([])
  const [genera, setGenera] = useState<TaxGenus[]>([])
  const [species, setSpecies] = useState<TaxSpecies[]>([])

  async function reload() {
    const [s, f, g, sp] = await Promise.all([
      apiClient.getShapes(),
      apiClient.getFamilies(),
      apiClient.getGenera(),
      apiClient.getSpecies(),
    ])
    setShapes(s)
    setFamilies(f)
    setGenera(g)
    setSpecies(sp)
  }

  useEffect(() => { reload() }, [])

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'shapes', label: '形状', count: shapes.length },
    { key: 'families', label: '科', count: families.length },
    { key: 'genera', label: '属', count: genera.length },
    { key: 'species', label: '種', count: species.filter((s) => !s.deletedAt).length },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            戻る
          </Link>
          <span className="text-sm font-semibold text-gray-800">分類管理</span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-white rounded-xl shadow p-1 w-fit">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-emerald-600 text-white'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
              <span className={`ml-1.5 text-xs ${tab === key ? 'text-emerald-100' : 'text-gray-400'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          {tab === 'shapes' && (
            <ShapesTab shapes={shapes} reload={reload} />
          )}
          {tab === 'families' && (
            <FamiliesTab families={families} shapes={shapes} reload={reload} />
          )}
          {tab === 'genera' && (
            <GeneraTab genera={genera} families={families} reload={reload} />
          )}
          {tab === 'species' && (
            <SpeciesTab species={species} genera={genera} reload={reload} />
          )}
        </div>

      </div>
    </div>
  )
}

// ─── Shapes ──────────────────────────────────────────────────────────────────

function ShapesTab({ shapes, reload }: { shapes: TaxShape[]; reload: () => void }) {
  const [newName, setNewName] = useState('')
  const [newJa, setNewJa] = useState('')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editJa, setEditJa] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setBusy(true); setError('')
    try {
      await apiClient.createShape({ name: newName.trim(), japaneseName: newJa.trim() || null })
      setNewName(''); setNewJa('')
      await reload()
    }
    catch { setError('形状の作成に失敗しました。') }
    finally { setBusy(false) }
  }

  async function save(id: number) {
    if (!editName.trim()) return
    setBusy(true); setError('')
    try {
      await apiClient.updateShape(id, { name: editName.trim(), japaneseName: editJa.trim() || null })
      setEditId(null)
      await reload()
    }
    catch { setError('形状の更新に失敗しました。') }
    finally { setBusy(false) }
  }

  async function remove(id: number) {
    if (!confirm('この形状を削除しますか？配下の科・属・種もすべて削除されます。')) return
    setBusy(true); setError('')
    try { await apiClient.deleteShape(id); await reload() }
    catch { setError('形状の削除に失敗しました。') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex gap-2 flex-wrap">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="名称（例: キャップ）"
          className="flex-1 min-w-36 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        />
        <input
          value={newJa}
          onChange={(e) => setNewJa(e.target.value)}
          placeholder="日本語名"
          className="flex-1 min-w-32 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          追加
        </button>
      </form>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <ul className="divide-y">
        {shapes.map((shape) => (
          <li key={shape.id} className="flex items-center gap-3 py-2.5">
            {editId === shape.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                  autoFocus
                />
                <input
                  value={editJa}
                  onChange={(e) => setEditJa(e.target.value)}
                  placeholder="日本語名"
                  className="w-32 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                />
                <button onClick={() => save(shape.id)} disabled={busy} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">保存</button>
                <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600 text-sm">キャンセル</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-gray-800">{shape.name}</span>
                {shape.japaneseName && <span className="text-xs text-gray-500">{shape.japaneseName}</span>}
                <button onClick={() => { setEditId(shape.id); setEditName(shape.name); setEditJa(shape.japaneseName ?? '') }} className="text-gray-400 hover:text-emerald-600 transition-colors">
                  <PencilIcon />
                </button>
                <button onClick={() => remove(shape.id)} disabled={busy} className="text-gray-400 hover:text-red-500 transition-colors">
                  <TrashIcon />
                </button>
              </>
            )}
          </li>
        ))}
        {shapes.length === 0 && <li className="text-gray-400 text-sm py-4">まだ形状がありません。</li>}
      </ul>
    </div>
  )
}

// ─── Families ────────────────────────────────────────────────────────────────

function FamiliesTab({ families, shapes, reload }: { families: TaxFamily[]; shapes: TaxShape[]; reload: () => void }) {
  const [newSci, setNewSci] = useState('')
  const [newJa, setNewJa] = useState('')
  const [newShapeId, setNewShapeId] = useState<number | ''>(shapes[0]?.id ?? '')
  const [editId, setEditId] = useState<number | null>(null)
  const [editSci, setEditSci] = useState('')
  const [editJa, setEditJa] = useState('')
  const [editShapeId, setEditShapeId] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filterShapeId, setFilterShapeId] = useState<number | ''>('')

  useEffect(() => { if (newShapeId === '' && shapes.length > 0) setNewShapeId(shapes[0].id) }, [shapes])

  const visible = filterShapeId ? families.filter((f) => f.shapeId === filterShapeId) : families

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!newSci.trim() || newShapeId === '') return
    setBusy(true); setError('')
    try {
      await apiClient.createFamily({ scientificName: newSci.trim(), japaneseName: newJa.trim() || null, shapeId: Number(newShapeId) })
      setNewSci(''); setNewJa('')
      await reload()
    }
    catch { setError('科の作成に失敗しました。') }
    finally { setBusy(false) }
  }

  async function save(id: number) {
    setBusy(true); setError('')
    try {
      await apiClient.updateFamily(id, { scientificName: editSci.trim(), japaneseName: editJa.trim() || null, shapeId: editShapeId })
      setEditId(null)
      await reload()
    }
    catch { setError('科の更新に失敗しました。') }
    finally { setBusy(false) }
  }

  async function remove(id: number) {
    if (!confirm('この科を削除しますか？配下の属・種もすべて削除されます。')) return
    setBusy(true); setError('')
    try { await apiClient.deleteFamily(id); await reload() }
    catch { setError('科の削除に失敗しました。') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex gap-2 flex-wrap">
        <input
          value={newSci}
          onChange={(e) => setNewSci(e.target.value)}
          placeholder="学名（例: Amanitaceae）"
          className="flex-1 min-w-40 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        />
        <input
          value={newJa}
          onChange={(e) => setNewJa(e.target.value)}
          placeholder="日本語名"
          className="w-36 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        />
        <select
          value={newShapeId}
          onChange={(e) => setNewShapeId(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        >
          {shapes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button
          type="submit"
          disabled={busy || !newSci.trim() || newShapeId === ''}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          追加
        </button>
      </form>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">形状で絞り込み:</label>
        <select
          value={filterShapeId}
          onChange={(e) => setFilterShapeId(e.target.value === '' ? '' : Number(e.target.value))}
          className="border rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">すべて</option>
          {shapes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <ul className="divide-y">
        {visible.map((family) => (
          <li key={family.id} className="flex items-center gap-3 py-2.5">
            {editId === family.id ? (
              <>
                <input
                  value={editSci}
                  onChange={(e) => setEditSci(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                  autoFocus
                />
                <input
                  value={editJa}
                  onChange={(e) => setEditJa(e.target.value)}
                  placeholder="日本語名"
                  className="w-32 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                />
                <select
                  value={editShapeId}
                  onChange={(e) => setEditShapeId(Number(e.target.value))}
                  className="border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                >
                  {shapes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button onClick={() => save(family.id)} disabled={busy} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">保存</button>
                <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600 text-sm">キャンセル</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-gray-800">{family.scientificName}</span>
                {family.japaneseName && <span className="text-xs text-gray-500">{family.japaneseName}</span>}
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {shapes.find((s) => s.id === family.shapeId)?.name ?? '—'}
                </span>
                <button onClick={() => { setEditId(family.id); setEditSci(family.scientificName); setEditJa(family.japaneseName ?? ''); setEditShapeId(family.shapeId) }} className="text-gray-400 hover:text-emerald-600 transition-colors">
                  <PencilIcon />
                </button>
                <button onClick={() => remove(family.id)} disabled={busy} className="text-gray-400 hover:text-red-500 transition-colors">
                  <TrashIcon />
                </button>
              </>
            )}
          </li>
        ))}
        {visible.length === 0 && <li className="text-gray-400 text-sm py-4">まだ科がありません。</li>}
      </ul>
    </div>
  )
}

// ─── Genera ───────────────────────────────────────────────────────────────────

function GeneraTab({ genera, families, reload }: { genera: TaxGenus[]; families: TaxFamily[]; reload: () => void }) {
  const [newSci, setNewSci] = useState('')
  const [newJa, setNewJa] = useState('')
  const [newFamilyId, setNewFamilyId] = useState<number | ''>(families[0]?.id ?? '')
  const [editId, setEditId] = useState<number | null>(null)
  const [editSci, setEditSci] = useState('')
  const [editJa, setEditJa] = useState('')
  const [editFamilyId, setEditFamilyId] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filterFamilyId, setFilterFamilyId] = useState<number | ''>('')

  useEffect(() => { if (newFamilyId === '' && families.length > 0) setNewFamilyId(families[0].id) }, [families])

  const visible = filterFamilyId ? genera.filter((g) => g.familyId === filterFamilyId) : genera

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!newSci.trim() || newFamilyId === '') return
    setBusy(true); setError('')
    try {
      await apiClient.createGenus({ scientificName: newSci.trim(), japaneseName: newJa.trim() || null, familyId: Number(newFamilyId) })
      setNewSci(''); setNewJa('')
      await reload()
    }
    catch { setError('属の作成に失敗しました。') }
    finally { setBusy(false) }
  }

  async function save(id: number) {
    setBusy(true); setError('')
    try {
      await apiClient.updateGenus(id, { scientificName: editSci.trim(), japaneseName: editJa.trim() || null, familyId: editFamilyId })
      setEditId(null)
      await reload()
    }
    catch { setError('属の更新に失敗しました。') }
    finally { setBusy(false) }
  }

  async function remove(id: number) {
    if (!confirm('この属を削除しますか？配下の種もすべて削除されます。')) return
    setBusy(true); setError('')
    try { await apiClient.deleteGenus(id); await reload() }
    catch { setError('属の削除に失敗しました。') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex gap-2 flex-wrap">
        <input
          value={newSci}
          onChange={(e) => setNewSci(e.target.value)}
          placeholder="学名（例: Amanita）"
          className="flex-1 min-w-40 border rounded-lg px-3 py-2 text-sm italic focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        />
        <input
          value={newJa}
          onChange={(e) => setNewJa(e.target.value)}
          placeholder="日本語名"
          className="w-36 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        />
        <select
          value={newFamilyId}
          onChange={(e) => setNewFamilyId(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        >
          {families.map((f) => <option key={f.id} value={f.id}>{f.scientificName}</option>)}
        </select>
        <button
          type="submit"
          disabled={busy || !newSci.trim() || newFamilyId === ''}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          追加
        </button>
      </form>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">科で絞り込み:</label>
        <select
          value={filterFamilyId}
          onChange={(e) => setFilterFamilyId(e.target.value === '' ? '' : Number(e.target.value))}
          className="border rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">すべて</option>
          {families.map((f) => <option key={f.id} value={f.id}>{f.scientificName}</option>)}
        </select>
      </div>
      <ul className="divide-y">
        {visible.map((genus) => (
          <li key={genus.id} className="flex items-center gap-3 py-2.5">
            {editId === genus.id ? (
              <>
                <input
                  value={editSci}
                  onChange={(e) => setEditSci(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm italic focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                  autoFocus
                />
                <input
                  value={editJa}
                  onChange={(e) => setEditJa(e.target.value)}
                  placeholder="日本語名"
                  className="w-32 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                />
                <select
                  value={editFamilyId}
                  onChange={(e) => setEditFamilyId(Number(e.target.value))}
                  className="border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                >
                  {families.map((f) => <option key={f.id} value={f.id}>{f.scientificName}</option>)}
                </select>
                <button onClick={() => save(genus.id)} disabled={busy} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">保存</button>
                <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600 text-sm">キャンセル</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-gray-800 italic">{genus.scientificName}</span>
                {genus.japaneseName && <span className="text-xs text-gray-500 not-italic">{genus.japaneseName}</span>}
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {families.find((f) => f.id === genus.familyId)?.scientificName ?? '—'}
                </span>
                <button onClick={() => { setEditId(genus.id); setEditSci(genus.scientificName); setEditJa(genus.japaneseName ?? ''); setEditFamilyId(genus.familyId) }} className="text-gray-400 hover:text-emerald-600 transition-colors">
                  <PencilIcon />
                </button>
                <button onClick={() => remove(genus.id)} disabled={busy} className="text-gray-400 hover:text-red-500 transition-colors">
                  <TrashIcon />
                </button>
              </>
            )}
          </li>
        ))}
        {visible.length === 0 && <li className="text-gray-400 text-sm py-4">まだ属がありません。</li>}
      </ul>
    </div>
  )
}

// ─── Species ─────────────────────────────────────────────────────────────────

function SpeciesTab({ species, genera, reload }: { species: TaxSpecies[]; genera: TaxGenus[]; reload: () => void }) {
  const [newSci, setNewSci] = useState('')
  const [newJa, setNewJa] = useState('')
  const [newEdibility, setNewEdibility] = useState<Edibility | ''>('')
  const [newGenusId, setNewGenusId] = useState<number | ''>(genera[0]?.id ?? '')
  const [editId, setEditId] = useState<number | null>(null)
  const [editSci, setEditSci] = useState('')
  const [editJa, setEditJa] = useState('')
  const [editEdibility, setEditEdibility] = useState<Edibility | ''>('')
  const [editGenusId, setEditGenusId] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filterGenusId, setFilterGenusId] = useState<number | ''>('')
  const [showDeleted, setShowDeleted] = useState(false)

  useEffect(() => { if (newGenusId === '' && genera.length > 0) setNewGenusId(genera[0].id) }, [genera])

  const visible = species
    .filter((s) => showDeleted ? true : !s.deletedAt)
    .filter((s) => filterGenusId ? s.genusId === filterGenusId : true)

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!newSci.trim() || newGenusId === '') return
    setBusy(true); setError('')
    try {
      await apiClient.createSpecies({
        scientificName: newSci.trim(),
        japaneseName: newJa.trim() || null,
        edibility: newEdibility || null,
        genusId: Number(newGenusId),
      })
      setNewSci(''); setNewJa(''); setNewEdibility('')
      await reload()
    }
    catch { setError('種の作成に失敗しました。') }
    finally { setBusy(false) }
  }

  async function save(id: number) {
    setBusy(true); setError('')
    try {
      await apiClient.updateSpecies(id, {
        scientificName: editSci.trim(),
        japaneseName: editJa.trim() || null,
        edibility: editEdibility || null,
        genusId: editGenusId,
      })
      setEditId(null)
      await reload()
    }
    catch { setError('種の更新に失敗しました。') }
    finally { setBusy(false) }
  }

  async function remove(id: number) {
    if (!confirm('この種を削除しますか？（論理削除されます）')) return
    setBusy(true); setError('')
    try { await apiClient.deleteSpecies(id); await reload() }
    catch { setError('種の削除に失敗しました。') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex gap-2 flex-wrap">
        <input
          value={newSci}
          onChange={(e) => setNewSci(e.target.value)}
          placeholder="学名"
          className="flex-1 min-w-40 border rounded-lg px-3 py-2 text-sm italic focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        />
        <input
          value={newJa}
          onChange={(e) => setNewJa(e.target.value)}
          placeholder="日本語名"
          className="w-36 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        />
        <select
          value={newEdibility}
          onChange={(e) => setNewEdibility(e.target.value as Edibility | '')}
          className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        >
          <option value="">食用区分</option>
          {EDIBILITY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
        <select
          value={newGenusId}
          onChange={(e) => setNewGenusId(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        >
          {genera.map((g) => <option key={g.id} value={g.id}>{g.scientificName}</option>)}
        </select>
        <button
          type="submit"
          disabled={busy || !newSci.trim() || newGenusId === ''}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          追加
        </button>
      </form>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">属で絞り込み:</label>
          <select
            value={filterGenusId}
            onChange={(e) => setFilterGenusId(e.target.value === '' ? '' : Number(e.target.value))}
            className="border rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">すべて</option>
            {genera.map((g) => <option key={g.id} value={g.id}>{g.scientificName}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          削除済みを表示
        </label>
      </div>
      <ul className="divide-y">
        {visible.map((sp) => (
          <li key={sp.id} className={`flex items-center gap-3 py-2.5 ${sp.deletedAt ? 'opacity-40' : ''}`}>
            {editId === sp.id ? (
              <>
                <input
                  value={editSci}
                  onChange={(e) => setEditSci(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm italic focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                  autoFocus
                />
                <input
                  value={editJa}
                  onChange={(e) => setEditJa(e.target.value)}
                  placeholder="日本語名"
                  className="w-28 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                />
                <select
                  value={editEdibility}
                  onChange={(e) => setEditEdibility(e.target.value as Edibility | '')}
                  className="border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                >
                  <option value="">—</option>
                  {EDIBILITY_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
                <select
                  value={editGenusId}
                  onChange={(e) => setEditGenusId(Number(e.target.value))}
                  className="border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                >
                  {genera.map((g) => <option key={g.id} value={g.id}>{g.scientificName}</option>)}
                </select>
                <button onClick={() => save(sp.id)} disabled={busy} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">保存</button>
                <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600 text-sm">キャンセル</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-gray-800 italic">{sp.scientificName}</span>
                {sp.japaneseName && <span className="text-xs text-gray-600 not-italic">{sp.japaneseName}</span>}
                {sp.edibility && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{sp.edibility}</span>
                )}
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {genera.find((g) => g.id === sp.genusId)?.scientificName ?? '—'}
                </span>
                {sp.deletedAt && (
                  <span className="text-xs text-red-400 bg-red-50 px-2 py-0.5 rounded-full">削除済み</span>
                )}
                {!sp.deletedAt && (
                  <>
                    <button onClick={() => { setEditId(sp.id); setEditSci(sp.scientificName); setEditJa(sp.japaneseName ?? ''); setEditEdibility(sp.edibility ?? ''); setEditGenusId(sp.genusId) }} className="text-gray-400 hover:text-emerald-600 transition-colors">
                      <PencilIcon />
                    </button>
                    <button onClick={() => remove(sp.id)} disabled={busy} className="text-gray-400 hover:text-red-500 transition-colors">
                      <TrashIcon />
                    </button>
                  </>
                )}
              </>
            )}
          </li>
        ))}
        {visible.length === 0 && <li className="text-gray-400 text-sm py-4">まだ種がありません。</li>}
      </ul>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3a2 2 0 01.586-1.414z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0a1 1 0 001-1h4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}
