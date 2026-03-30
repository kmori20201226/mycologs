'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiClient, type TaxShape, type TaxFamily, type TaxGenus, type TaxSpecies } from '@/lib/api'

export default function TaxonomyPage() {
  const [shapes, setShapes] = useState<TaxShape[]>([])
  const [families, setFamilies] = useState<TaxFamily[]>([])
  const [genera, setGenera] = useState<TaxGenus[]>([])
  const [species, setSpecies] = useState<TaxSpecies[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedShape, setSelectedShape] = useState<TaxShape | null>(null)
  const [selectedFamily, setSelectedFamily] = useState<TaxFamily | null>(null)
  const [selectedGenus, setSelectedGenus] = useState<TaxGenus | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    Promise.all([
      apiClient.getShapes(),
      apiClient.getFamilies(),
      apiClient.getGenera(),
      apiClient.getSpecies(),
    ]).then(([s, f, g, sp]) => {
      setShapes(s)
      setFamilies(f)
      setGenera(g)
      setSpecies(sp.filter((x) => !x.deletedAt))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  function selectShape(shape: TaxShape | null) {
    setSelectedShape(shape)
    setSelectedFamily(null)
    setSelectedGenus(null)
    setSearch('')
  }
  function selectFamily(family: TaxFamily | null) {
    setSelectedFamily(family)
    setSelectedGenus(null)
    setSearch('')
  }
  function selectGenus(genus: TaxGenus | null) {
    setSelectedGenus(genus)
    setSearch('')
  }

  const visibleFamilies = useMemo(
    () => selectedShape ? families.filter((f) => f.shapeId === selectedShape.id) : families,
    [families, selectedShape]
  )
  const visibleGenera = useMemo(
    () => selectedFamily
      ? genera.filter((g) => g.familyId === selectedFamily.id)
      : selectedShape
        ? genera.filter((g) => visibleFamilies.some((f) => f.id === g.familyId))
        : genera,
    [genera, selectedFamily, selectedShape, visibleFamilies]
  )
  const visibleSpecies = useMemo(() => {
    let list = selectedGenus
      ? species.filter((s) => s.genusId === selectedGenus.id)
      : selectedFamily
        ? species.filter((s) => visibleGenera.some((g) => g.id === s.genusId))
        : selectedShape
          ? species.filter((s) => visibleGenera.some((g) => g.id === s.genusId))
          : species
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((s) =>
        s.scientificName.toLowerCase().includes(q) ||
        (s.japaneseName ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [species, selectedGenus, selectedFamily, selectedShape, visibleGenera, search])

  const isFiltered = selectedShape || selectedFamily || selectedGenus || search.trim()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-5xl">

        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Field Guide</h1>
            <p className="text-gray-500">Browse taxonomy: Shape → Family → Genus → Species</p>
          </div>
        </div>

        {/* Breadcrumb filter trail */}
        {isFiltered && (
          <div className="flex flex-wrap items-center gap-2 mb-6 text-sm">
            <button onClick={() => selectShape(null)} className="text-emerald-600 hover:underline font-medium">
              All Shapes
            </button>
            {selectedShape && (
              <>
                <span className="text-gray-400">/</span>
                <button
                  onClick={() => { selectShape(selectedShape); setSelectedFamily(null); setSelectedGenus(null) }}
                  className={`font-medium ${selectedFamily ? 'text-emerald-600 hover:underline' : 'text-gray-800'}`}
                >
                  {selectedShape.name}
                </button>
              </>
            )}
            {selectedFamily && (
              <>
                <span className="text-gray-400">/</span>
                <button
                  onClick={() => { selectFamily(selectedFamily); setSelectedGenus(null) }}
                  className={`font-medium ${selectedGenus ? 'text-emerald-600 hover:underline' : 'text-gray-800'}`}
                >
                  {selectedFamily.scientificName}
                  {selectedFamily.japaneseName && <span className="ml-1 not-italic text-gray-500 text-xs">{selectedFamily.japaneseName}</span>}
                </button>
              </>
            )}
            {selectedGenus && (
              <>
                <span className="text-gray-400">/</span>
                <span className="font-medium text-gray-800 italic">{selectedGenus.scientificName}</span>
                {selectedGenus.japaneseName && <span className="text-gray-500 text-xs">{selectedGenus.japaneseName}</span>}
              </>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 bg-white rounded-xl shadow animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-8">

            {/* Shapes — shown when nothing is selected */}
            {!selectedShape && (
              <section>
                <SectionHeading>Shapes</SectionHeading>
                {shapes.length === 0 ? <EmptyState label="No shapes yet." /> : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {shapes.map((shape) => {
                      const famCount = families.filter((f) => f.shapeId === shape.id).length
                      return (
                        <DrillButton key={shape.id} onClick={() => selectShape(shape)}>
                          <p className="font-semibold text-gray-900">{shape.name}</p>
                          {shape.japaneseName && <p className="text-xs text-gray-500">{shape.japaneseName}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">{famCount} {famCount === 1 ? 'family' : 'families'}</p>
                        </DrillButton>
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Families — shown when a shape is selected but no family yet */}
            {selectedShape && !selectedFamily && (
              <section>
                <SectionHeading>
                  Families in <em className="text-emerald-600 not-italic">{selectedShape.name}</em>
                </SectionHeading>
                {visibleFamilies.length === 0 ? <EmptyState label="No families in this shape." /> : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {visibleFamilies.map((family) => {
                      const genCount = genera.filter((g) => g.familyId === family.id).length
                      return (
                        <DrillButton key={family.id} onClick={() => selectFamily(family)}>
                          <p className="font-semibold text-gray-900">{family.scientificName}</p>
                          {family.japaneseName && <p className="text-xs text-gray-500">{family.japaneseName}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">{genCount} {genCount === 1 ? 'genus' : 'genera'}</p>
                        </DrillButton>
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Genera — shown when a family is selected but no genus yet */}
            {selectedFamily && !selectedGenus && (
              <section>
                <SectionHeading>
                  Genera in <em className="text-emerald-600 not-italic">{selectedFamily.scientificName}</em>
                </SectionHeading>
                {visibleGenera.length === 0 ? <EmptyState label="No genera in this family." /> : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {visibleGenera.map((genus) => {
                      const spCount = species.filter((s) => s.genusId === genus.id).length
                      return (
                        <DrillButton key={genus.id} onClick={() => selectGenus(genus)}>
                          <p className="font-semibold text-gray-900 italic">{genus.scientificName}</p>
                          {genus.japaneseName && <p className="text-xs text-gray-500 not-italic">{genus.japaneseName}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">{spCount} {spCount === 1 ? 'species' : 'species'}</p>
                        </DrillButton>
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Species — shown when a genus is selected OR a search is active */}
            {(selectedGenus || search.trim()) && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <SectionHeading className="mb-0">
                    {selectedGenus
                      ? <>Species in <em className="text-emerald-600 not-italic">{selectedGenus.scientificName}</em></>
                      : 'Search results'}
                  </SectionHeading>
                  <span className="text-xs text-gray-400">{visibleSpecies.length} found</span>
                </div>
                {visibleSpecies.length === 0 ? <EmptyState label="No species found." /> : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {visibleSpecies.map((sp) => {
                      const genus = genera.find((g) => g.id === sp.genusId)
                      const family = genus ? families.find((f) => f.id === genus.familyId) : null
                      const shape = family ? shapes.find((s) => s.id === family.shapeId) : null
                      return (
                        <div key={sp.id} className="bg-white rounded-xl shadow px-4 py-3">
                          <p className="font-semibold text-gray-900 italic">{sp.scientificName}</p>
                          {sp.japaneseName && <p className="text-sm text-gray-700 not-italic">{sp.japaneseName}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">
                            {[genus?.scientificName, family?.scientificName, shape?.name].filter(Boolean).join(' · ')}
                          </p>
                          {sp.edibility && (
                            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${edibilityStyle(sp.edibility)}`}>
                              {sp.edibility}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Species search — always shown */}
            <section>
              <SectionHeading>Search species</SectionHeading>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Scientific or Japanese name…"
                className="w-full max-w-sm border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </section>

          </div>
        )}
      </div>
    </div>
  )
}

function edibilityStyle(e: string) {
  switch (e) {
    case 'EDIBLE':   return 'bg-green-100 text-green-700'
    case 'INEDIBLE': return 'bg-gray-100 text-gray-600'
    case 'TOXIC':    return 'bg-orange-100 text-orange-700'
    case 'DEADLY':   return 'bg-red-100 text-red-700'
    default:         return 'bg-gray-100 text-gray-500'
  }
}

function SectionHeading({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 ${className}`}>
      {children}
    </h2>
  )
}

function DrillButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl shadow p-4 hover:shadow-md hover:border-emerald-400 border border-transparent transition-all w-full"
    >
      {children}
    </button>
  )
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-gray-400 text-sm py-2">{label}</p>
}
