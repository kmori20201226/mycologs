'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiClient, type TaxShape, type TaxFamily, type TaxGenus, type TaxSpecies } from '@/lib/api'

type Tab = 'shapes' | 'families' | 'genera' | 'species'

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
    { key: 'shapes', label: 'Shapes', count: shapes.length },
    { key: 'families', label: 'Families', count: families.length },
    { key: 'genera', label: 'Genera', count: genera.length },
    { key: 'species', label: 'Species', count: species.filter((s) => !s.deletedAt).length },
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
            Back
          </Link>
          <span className="text-sm font-semibold text-gray-800">Manage Taxonomy</span>
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
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setBusy(true); setError('')
    try { await apiClient.createShape(newName.trim()); setNewName(''); await reload() }
    catch { setError('Failed to create shape.') }
    finally { setBusy(false) }
  }

  async function save(id: number) {
    if (!editName.trim()) return
    setBusy(true); setError('')
    try { await apiClient.updateShape(id, editName.trim()); setEditId(null); await reload() }
    catch { setError('Failed to update shape.') }
    finally { setBusy(false) }
  }

  async function remove(id: number) {
    if (!confirm('Delete this shape? All families, genera, and species beneath it will also be deleted.')) return
    setBusy(true); setError('')
    try { await apiClient.deleteShape(id); await reload() }
    catch { setError('Failed to delete shape.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New shape name"
          className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        />
        <button
          type="submit"
          disabled={busy || !newName.trim()}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          Add
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
                <button onClick={() => save(shape.id)} disabled={busy} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Save</button>
                <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-gray-800">{shape.name}</span>
                <button onClick={() => { setEditId(shape.id); setEditName(shape.name) }} className="text-gray-400 hover:text-emerald-600 transition-colors">
                  <PencilIcon />
                </button>
                <button onClick={() => remove(shape.id)} disabled={busy} className="text-gray-400 hover:text-red-500 transition-colors">
                  <TrashIcon />
                </button>
              </>
            )}
          </li>
        ))}
        {shapes.length === 0 && <li className="text-gray-400 text-sm py-4">No shapes yet.</li>}
      </ul>
    </div>
  )
}

// ─── Families ────────────────────────────────────────────────────────────────

function FamiliesTab({ families, shapes, reload }: { families: TaxFamily[]; shapes: TaxShape[]; reload: () => void }) {
  const [newName, setNewName] = useState('')
  const [newShapeId, setNewShapeId] = useState<number | ''>(shapes[0]?.id ?? '')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editShapeId, setEditShapeId] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filterShapeId, setFilterShapeId] = useState<number | ''>('')

  useEffect(() => { if (newShapeId === '' && shapes.length > 0) setNewShapeId(shapes[0].id) }, [shapes])

  const visible = filterShapeId ? families.filter((f) => f.shapeId === filterShapeId) : families

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || newShapeId === '') return
    setBusy(true); setError('')
    try { await apiClient.createFamily(newName.trim(), Number(newShapeId)); setNewName(''); await reload() }
    catch { setError('Failed to create family.') }
    finally { setBusy(false) }
  }

  async function save(id: number) {
    setBusy(true); setError('')
    try { await apiClient.updateFamily(id, { name: editName.trim(), shapeId: editShapeId }); setEditId(null); await reload() }
    catch { setError('Failed to update family.') }
    finally { setBusy(false) }
  }

  async function remove(id: number) {
    if (!confirm('Delete this family? All genera and species beneath it will also be deleted.')) return
    setBusy(true); setError('')
    try { await apiClient.deleteFamily(id); await reload() }
    catch { setError('Failed to delete family.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex gap-2 flex-wrap">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New family name"
          className="flex-1 min-w-40 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
          disabled={busy || !newName.trim() || newShapeId === ''}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          Add
        </button>
      </form>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Filter by shape:</label>
        <select
          value={filterShapeId}
          onChange={(e) => setFilterShapeId(e.target.value === '' ? '' : Number(e.target.value))}
          className="border rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All</option>
          {shapes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <ul className="divide-y">
        {visible.map((family) => (
          <li key={family.id} className="flex items-center gap-3 py-2.5">
            {editId === family.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                  autoFocus
                />
                <select
                  value={editShapeId}
                  onChange={(e) => setEditShapeId(Number(e.target.value))}
                  className="border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                >
                  {shapes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button onClick={() => save(family.id)} disabled={busy} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Save</button>
                <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-gray-800">{family.name}</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {shapes.find((s) => s.id === family.shapeId)?.name ?? '—'}
                </span>
                <button onClick={() => { setEditId(family.id); setEditName(family.name); setEditShapeId(family.shapeId) }} className="text-gray-400 hover:text-emerald-600 transition-colors">
                  <PencilIcon />
                </button>
                <button onClick={() => remove(family.id)} disabled={busy} className="text-gray-400 hover:text-red-500 transition-colors">
                  <TrashIcon />
                </button>
              </>
            )}
          </li>
        ))}
        {visible.length === 0 && <li className="text-gray-400 text-sm py-4">No families yet.</li>}
      </ul>
    </div>
  )
}

// ─── Genera ───────────────────────────────────────────────────────────────────

function GeneraTab({ genera, families, reload }: { genera: TaxGenus[]; families: TaxFamily[]; reload: () => void }) {
  const [newName, setNewName] = useState('')
  const [newFamilyId, setNewFamilyId] = useState<number | ''>(families[0]?.id ?? '')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editFamilyId, setEditFamilyId] = useState<number>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filterFamilyId, setFilterFamilyId] = useState<number | ''>('')

  useEffect(() => { if (newFamilyId === '' && families.length > 0) setNewFamilyId(families[0].id) }, [families])

  const visible = filterFamilyId ? genera.filter((g) => g.familyId === filterFamilyId) : genera

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim() || newFamilyId === '') return
    setBusy(true); setError('')
    try { await apiClient.createGenus(newName.trim(), Number(newFamilyId)); setNewName(''); await reload() }
    catch { setError('Failed to create genus.') }
    finally { setBusy(false) }
  }

  async function save(id: number) {
    setBusy(true); setError('')
    try { await apiClient.updateGenus(id, { name: editName.trim(), familyId: editFamilyId }); setEditId(null); await reload() }
    catch { setError('Failed to update genus.') }
    finally { setBusy(false) }
  }

  async function remove(id: number) {
    if (!confirm('Delete this genus? All species beneath it will also be deleted.')) return
    setBusy(true); setError('')
    try { await apiClient.deleteGenus(id); await reload() }
    catch { setError('Failed to delete genus.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex gap-2 flex-wrap">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New genus name"
          className="flex-1 min-w-40 border rounded-lg px-3 py-2 text-sm italic focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        />
        <select
          value={newFamilyId}
          onChange={(e) => setNewFamilyId(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        >
          {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button
          type="submit"
          disabled={busy || !newName.trim() || newFamilyId === ''}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          Add
        </button>
      </form>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Filter by family:</label>
        <select
          value={filterFamilyId}
          onChange={(e) => setFilterFamilyId(e.target.value === '' ? '' : Number(e.target.value))}
          className="border rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">All</option>
          {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <ul className="divide-y">
        {visible.map((genus) => (
          <li key={genus.id} className="flex items-center gap-3 py-2.5">
            {editId === genus.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm italic focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                  autoFocus
                />
                <select
                  value={editFamilyId}
                  onChange={(e) => setEditFamilyId(Number(e.target.value))}
                  className="border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                >
                  {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <button onClick={() => save(genus.id)} disabled={busy} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Save</button>
                <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-gray-800 italic">{genus.name}</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {families.find((f) => f.id === genus.familyId)?.name ?? '—'}
                </span>
                <button onClick={() => { setEditId(genus.id); setEditName(genus.name); setEditFamilyId(genus.familyId) }} className="text-gray-400 hover:text-emerald-600 transition-colors">
                  <PencilIcon />
                </button>
                <button onClick={() => remove(genus.id)} disabled={busy} className="text-gray-400 hover:text-red-500 transition-colors">
                  <TrashIcon />
                </button>
              </>
            )}
          </li>
        ))}
        {visible.length === 0 && <li className="text-gray-400 text-sm py-4">No genera yet.</li>}
      </ul>
    </div>
  )
}

// ─── Species ─────────────────────────────────────────────────────────────────

function SpeciesTab({ species, genera, reload }: { species: TaxSpecies[]; genera: TaxGenus[]; reload: () => void }) {
  const [newName, setNewName] = useState('')
  const [newGenusId, setNewGenusId] = useState<number | ''>(genera[0]?.id ?? '')
  const [editId, setEditId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
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
    if (!newName.trim() || newGenusId === '') return
    setBusy(true); setError('')
    try { await apiClient.createSpecies(newName.trim(), Number(newGenusId)); setNewName(''); await reload() }
    catch { setError('Failed to create species.') }
    finally { setBusy(false) }
  }

  async function save(id: number) {
    setBusy(true); setError('')
    try { await apiClient.updateSpecies(id, { name: editName.trim(), genusId: editGenusId }); setEditId(null); await reload() }
    catch { setError('Failed to update species.') }
    finally { setBusy(false) }
  }

  async function remove(id: number) {
    if (!confirm('Delete this species? This will soft-delete it.')) return
    setBusy(true); setError('')
    try { await apiClient.deleteSpecies(id); await reload() }
    catch { setError('Failed to delete species.') }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex gap-2 flex-wrap">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New species name"
          className="flex-1 min-w-40 border rounded-lg px-3 py-2 text-sm italic focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        />
        <select
          value={newGenusId}
          onChange={(e) => setNewGenusId(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          disabled={busy}
        >
          {genera.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button
          type="submit"
          disabled={busy || !newName.trim() || newGenusId === ''}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
        >
          Add
        </button>
      </form>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Filter by genus:</label>
          <select
            value={filterGenusId}
            onChange={(e) => setFilterGenusId(e.target.value === '' ? '' : Number(e.target.value))}
            className="border rounded-lg px-2 py-1 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">All</option>
            {genera.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={showDeleted} onChange={(e) => setShowDeleted(e.target.checked)} />
          Show deleted
        </label>
      </div>
      <ul className="divide-y">
        {visible.map((sp) => (
          <li key={sp.id} className={`flex items-center gap-3 py-2.5 ${sp.deletedAt ? 'opacity-40' : ''}`}>
            {editId === sp.id ? (
              <>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 border rounded-lg px-3 py-1.5 text-sm italic focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                  autoFocus
                />
                <select
                  value={editGenusId}
                  onChange={(e) => setEditGenusId(Number(e.target.value))}
                  className="border rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  disabled={busy}
                >
                  {genera.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <button onClick={() => save(sp.id)} disabled={busy} className="text-emerald-600 hover:text-emerald-700 text-sm font-medium">Save</button>
                <button onClick={() => setEditId(null)} className="text-gray-400 hover:text-gray-600 text-sm">Cancel</button>
              </>
            ) : (
              <>
                <span className="flex-1 text-gray-800 italic">{sp.name}</span>
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {genera.find((g) => g.id === sp.genusId)?.name ?? '—'}
                </span>
                {sp.deletedAt && (
                  <span className="text-xs text-red-400 bg-red-50 px-2 py-0.5 rounded-full">deleted</span>
                )}
                {!sp.deletedAt && (
                  <>
                    <button onClick={() => { setEditId(sp.id); setEditName(sp.name); setEditGenusId(sp.genusId) }} className="text-gray-400 hover:text-emerald-600 transition-colors">
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
        {visible.length === 0 && <li className="text-gray-400 text-sm py-4">No species yet.</li>}
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
