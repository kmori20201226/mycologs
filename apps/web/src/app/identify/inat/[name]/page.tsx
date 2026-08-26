'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'

interface InatPhoto {
  id: number
  url: string
  attribution: string
  license_code: string
  observationId: number
  observedOn: string
  placeGuess: string
}

interface InatTaxon {
  id: number
  name: string
  preferred_common_name: string | null
  default_photo: { medium_url: string } | null
  observations_count: number
}

const INAT_API = 'https://api.inaturalist.org/v1'

function sizedUrl(squareUrl: string, size: 'small' | 'medium' | 'large'): string {
  return squareUrl.replace('/square.', `/${size}.`)
}

function InatSamplesPageInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const scientificName = decodeURIComponent(params.name as string)
  const japaneseName = searchParams.get('ja') ?? null

  const [taxon, setTaxon] = useState<InatTaxon | null>(null)
  const [photos, setPhotos] = useState<InatPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError('')
      try {
        // 1. Resolve taxon by scientific name.
        // `q` is a relevance-ranked fuzzy search, so results[0] is often a
        // *different* popular species (or a genus-level near-match) when the
        // name is slightly off or absent from iNaturalist. Taking it blindly
        // produced confidently-wrong links, so require an exact name match and
        // otherwise report "not found" rather than pointing at the wrong taxon.
        const wanted = scientificName.trim().toLowerCase()
        let found: InatTaxon | undefined

        // First try active taxa only
        const taxaRes = await fetch(
          `${INAT_API}/taxa?q=${encodeURIComponent(scientificName)}&rank=species&is_active=true&per_page=10`,
          { cache: 'no-store' }
        )
        const taxaData = await taxaRes.json()
        found = (taxaData.results as InatTaxon[] | undefined)
          ?.find((t) => t.name?.toLowerCase() === wanted)

        // Fall back to including inactive/synonymized taxa
        if (!found) {
          const inactiveRes = await fetch(
            `${INAT_API}/taxa?q=${encodeURIComponent(scientificName)}&rank=species&per_page=10`,
            { cache: 'no-store' }
          )
          const inactiveData = await inactiveRes.json()
          found = (inactiveData.results as InatTaxon[] | undefined)
            ?.find((t) => t.name?.toLowerCase() === wanted)
        }

        if (!found) {
          setError('iNaturalist でこの種が見つかりませんでした。')
          return
        }
        setTaxon(found)

        // 2. Fetch observations with commercially-usable photos
        const obsRes = await fetch(
          `${INAT_API}/observations?taxon_id=${found.id}&photo_license=cc0,cc-by,cc-by-sa,cc-by-nd&per_page=24&order_by=votes&place_id=6737`,
          { cache: 'no-store' }
        )
        const obsData = await obsRes.json()

        const collected: InatPhoto[] = []
        const seenIds = new Set<number>()
        for (const obs of obsData.results ?? []) {
          for (const photo of obs.photos ?? []) {
            if (seenIds.has(photo.id)) continue
            seenIds.add(photo.id)
            if (!photo.url) continue
            collected.push({
              id: photo.id,
              url: sizedUrl(photo.url, 'small'),
              attribution: photo.attribution ?? '',
              license_code: photo.license_code ?? '',
              observationId: obs.id,
              observedOn: obs.observed_on ?? '',
              placeGuess: obs.place_guess ?? '',
            })
          }
        }

        // If Japan returned few results, supplement with global
        if (collected.length < 12) {
          const globalRes = await fetch(
            `${INAT_API}/observations?taxon_id=${found.id}&photo_license=cc0,cc-by,cc-by-sa,cc-by-nd&per_page=24&order_by=votes`,
            { cache: 'no-store' }
          )
          const globalData = await globalRes.json()
          for (const obs of globalData.results ?? []) {
            for (const photo of obs.photos ?? []) {
              if (seenIds.has(photo.id)) continue
              seenIds.add(photo.id)
              if (!photo.url) continue
              collected.push({
                id: photo.id,
                url: sizedUrl(photo.url, 'small'),
                attribution: photo.attribution ?? '',
                license_code: photo.license_code ?? '',
                observationId: obs.id,
                observedOn: obs.observed_on ?? '',
                placeGuess: obs.place_guess ?? '',
              })
            }
          }
        }

        setPhotos(collected.slice(0, 24))
      } catch {
        setError('iNaturalist からのデータ取得に失敗しました。')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [scientificName])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-sm text-gray-500 hover:text-emerald-600 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            戻る
          </button>
        </div>

        <div className="bg-white rounded-xl shadow p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">iNaturalist サンプル画像</p>
              <h1 className="text-2xl font-bold text-gray-900 italic">{scientificName}</h1>
              {japaneseName && <p className="text-base text-gray-700 mt-0.5">{japaneseName}</p>}
              {!japaneseName && taxon?.preferred_common_name && (
                <p className="text-base text-gray-600 mt-0.5">{taxon.preferred_common_name}</p>
              )}
            </div>
            {taxon && (
              <a
                href={`https://www.inaturalist.org/taxa/${taxon.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                iNaturalist で見る
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="aspect-square bg-gray-200 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6 text-sm text-center space-y-3">
            <p>{error}</p>
            <a
              href={`https://www.inaturalist.org/taxa/search?q=${encodeURIComponent(scientificName)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-emerald-700 underline hover:text-emerald-900"
            >
              iNaturalist で手動検索する
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        )}

        {!loading && !error && photos.length === 0 && (
          <div className="bg-white rounded-xl shadow p-6 text-center text-gray-400 text-sm">
            利用可能な写真が見つかりませんでした。
          </div>
        )}

        {photos.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {photos.map((photo) => (
                <a
                  key={photo.id}
                  href={`https://www.inaturalist.org/observations/${photo.observationId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity"
                >
                  <img
                    src={photo.url}
                    alt={scientificName}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {(photo.placeGuess || photo.observedOn) && (
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity truncate">
                      {[photo.observedOn, photo.placeGuess].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </a>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4 text-center">
              画像は iNaturalist より取得 (CC ライセンス)。各画像をクリックすると観察記録を表示します。
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function InatSamplesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <InatSamplesPageInner />
    </Suspense>
  )
}
