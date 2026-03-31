'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type MediaItem, type AiIdentification } from '@/lib/api'

interface Post {
  id: number
  contents: string
  createdAt: string
  user: { id: number; name: string }
  event: { id: number; name: string } | null
}

interface Identification {
  id: number
  createdAt: string
  confidence: number | null
  user: { id: number; name: string }
  species: { id: number; scientificName: string }
}

export default function PostPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const postId = Number(params.id)
  const uploadErrors = Number(searchParams.get('uploadErrors') ?? 0)

  const [post, setPost] = useState<Post | null>(null)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [identifications, setIdentifications] = useState<Identification[]>([])
  const [notFound, setNotFound] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [errorDismissed, setErrorDismissed] = useState(false)

  // AI identification state
  const [aiResult, setAiResult] = useState<AiIdentification | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const identSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiClient.request<Post>(`/posts/${postId}`)
      .then((p) => setPost(p))
      .catch(() => setNotFound(true))

    apiClient.getPostMedia(postId)
      .then(setMedia)
      .catch(() => {})

    apiClient.getPostIdentifications(postId)
      .then((ids) => setIdentifications(ids as Identification[]))
      .catch(() => {})
  }, [postId])

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }

  async function handleAiIdentify() {
    const images = media.filter((m) => m.type === 'IMAGE')
    if (images.length === 0) {
      showToast('Need some pictures to identify mushroom')
      return
    }
    setAiLoading(true)
    setAiError('')
    setAiResult(null)
    try {
      const result = await apiClient.aiIdentify(postId)
      setAiResult(result)
      // Scroll to identification section
      setTimeout(() => identSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch {
      setAiError('Identification failed. Please try again.')
    } finally {
      setAiLoading(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Post not found.</p>
          <Link href="/posts" className="text-emerald-600 hover:underline">Back to posts</Link>
        </div>
      </div>
    )
  }

  const images = media.filter((m) => m.type === 'IMAGE')
  const otherMedia = media.filter((m) => m.type !== 'IMAGE')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-3xl">

        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-4">
          <Link
            href="/posts"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-emerald-600 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div className="text-sm text-gray-500">
            <Link href="/posts" className="hover:text-emerald-600 transition-colors">Posts</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-800 font-medium">Post #{postId}</span>
          </div>
        </div>

        {uploadErrors > 0 && !errorDismissed && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-3 rounded-lg">
            <span>
              {uploadErrors === 1
                ? '1 file failed to upload.'
                : `${uploadErrors} files failed to upload.`}
              {' '}The post was created successfully.
            </span>
            <button onClick={() => setErrorDismissed(true)} className="text-yellow-600 hover:text-yellow-800 shrink-0" aria-label="Dismiss">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {post ? (
          <>
            {/* Post header */}
            <div className="bg-white rounded-xl shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-gray-500">
                  <span className="font-medium text-gray-700">{post.user.name}</span>
                  <span className="mx-2">·</span>
                  <span>{new Date(post.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
                <button
                  onClick={handleAiIdentify}
                  disabled={aiLoading}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {aiLoading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Identifying…
                    </>
                  ) : (
                    'Help Identify'
                  )}
                </button>
              </div>

              {post.event && (
                <div className="mb-4 inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium px-3 py-1 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {post.event.name}
                </div>
              )}

              <p className="text-gray-800 whitespace-pre-wrap">{post.contents}</p>
            </div>

            {/* Media gallery */}
            {images.length > 0 && (
              <div className="bg-white rounded-xl shadow p-6 mb-6">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Photos</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {images.map((img) => (
                    <button
                      key={img.id}
                      onClick={() => setSelectedMedia(img)}
                      className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <img
                        src={img.thumbnailUrl ?? img.url}
                        alt={img.description ?? img.originalName}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {otherMedia.length > 0 && (
              <div className="bg-white rounded-xl shadow p-6 mb-6">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Attachments</h2>
                <ul className="space-y-2">
                  {otherMedia.map((m) => (
                    <li key={m.id}>
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg border hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
                      >
                        <MediaTypeIcon type={m.type} />
                        <span className="text-sm text-gray-700 truncate flex-1">{m.originalName}</span>
                        <span className="text-xs text-gray-400">{formatBytes(m.size)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Identifications */}
            <div ref={identSectionRef} className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Identifications
                  {identifications.length > 0 && (
                    <span className="ml-2 text-emerald-600">{identifications.length}</span>
                  )}
                </h2>
              </div>

              {/* AI identification result */}
              {aiLoading && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3 text-emerald-700 text-sm">
                  <svg className="animate-spin w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Analysing {images.length} photo{images.length > 1 ? 's' : ''} with Claude AI…
                </div>
              )}

              {aiError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
                  {aiError}
                </div>
              )}

              {aiResult && (
                <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-5 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13 7H7v6h6V7z" />
                            <path fillRule="evenodd" d="M7 2a1 1 0 012 0v1h2V2a1 1 0 112 0v1h2a2 2 0 012 2v2h1a1 1 0 110 2h-1v2h1a1 1 0 110 2h-1v2a2 2 0 01-2 2h-2v1a1 1 0 11-2 0v-1H9v1a1 1 0 11-2 0v-1H5a2 2 0 01-2-2v-2H2a1 1 0 110-2h1V9H2a1 1 0 010-2h1V5a2 2 0 012-2h2V2zM5 5h10v10H5V5z" clipRule="evenodd" />
                          </svg>
                          AI識別
                        </span>
                        <AiConfidenceBadge confidence={aiResult.confidence} />
                        <EdibilityBadge edibility={aiResult.edibility} />
                      </div>
                      {aiResult.scientific_name ? (
                        <>
                          <p className="mt-2 text-lg font-bold text-gray-900 italic">{aiResult.scientific_name}</p>
                          {aiResult.japanese_name && (
                            <p className="text-base text-gray-700 not-italic">{aiResult.japanese_name}</p>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-gray-500 italic">キノコが特定できませんでした</p>
                      )}
                    </div>
                    <button
                      onClick={() => setAiResult(null)}
                      className="text-gray-400 hover:text-gray-600 shrink-0 mt-1"
                      aria-label="Dismiss"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Shape */}
                  {aiResult.shape && (
                    <p className="text-xs text-gray-500">形状: <span className="text-gray-700 font-medium">{aiResult.shape}</span></p>
                  )}

                  {/* Key features */}
                  {aiResult.key_features?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">特徴</p>
                      <ul className="space-y-1">
                        {aiResult.key_features.map((f, i) => {
                          const label = typeof f === 'string'
                            ? f
                            : Object.values(f).join(' ')
                          return (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                              {label}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Similar species */}
                  {aiResult.similar_species?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">類似種</p>
                      <ul className="space-y-1">
                        {aiResult.similar_species.map((s, i) => {
                          const label = typeof s === 'string'
                            ? s
                            : [s.name, s.difference].filter(Boolean).join(' — ')
                          return (
                            <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                              <span className="text-yellow-500 mt-0.5 shrink-0">△</span>
                              {label}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Disclaimer */}
                  {aiResult.disclaimer && (
                    <p className="text-xs text-gray-500 border-t border-emerald-200 pt-3 leading-relaxed">
                      ⚠️ {aiResult.disclaimer}
                    </p>
                  )}
                </div>
              )}

              {/* Human identifications */}
              {identifications.length === 0 && !aiResult ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm mb-3">No identifications yet.</p>
                  <p className="text-gray-400 text-sm">Click <strong>Help Identify</strong> to use AI, or propose your own.</p>
                </div>
              ) : identifications.length > 0 ? (
                <ul className="space-y-3">
                  {identifications.map((id) => (
                    <li key={id.id} className="flex items-center gap-4 p-3 rounded-lg border bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm italic">{id.species.scientificName}</p>
                        <p className="text-xs text-gray-500">
                          Proposed by {id.user.name} · {new Date(id.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <ConfidenceBadge confidence={id.confidence} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </>
        ) : (
          !notFound && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
                <div className="h-4 bg-gray-200 rounded w-full mb-2" />
                <div className="h-4 bg-gray-200 rounded w-5/6" />
              </div>
            </div>
          )
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-5 py-3 rounded-full shadow-lg z-50 animate-fade-in">
          {toast}
        </div>
      )}

      {/* Lightbox */}
      {selectedMedia && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedMedia(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setSelectedMedia(null)}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={selectedMedia.url}
            alt={selectedMedia.description ?? selectedMedia.originalName}
            className="max-h-[90vh] max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          {selectedMedia.description && (
            <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/40 px-4 py-1.5 rounded-full">
              {selectedMedia.description}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function AiConfidenceBadge({ confidence }: { confidence: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    high:   { label: '確信度: 高', cls: 'bg-green-100 text-green-700' },
    medium: { label: '確信度: 中', cls: 'bg-yellow-100 text-yellow-700' },
    low:    { label: '確信度: 低', cls: 'bg-red-100 text-red-700' },
  }
  const { label, cls } = map[confidence] ?? { label: confidence, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

function EdibilityBadge({ edibility }: { edibility: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    edible:   { label: '食用可', cls: 'bg-green-100 text-green-700' },
    inedible: { label: '食用不可', cls: 'bg-gray-100 text-gray-600' },
    toxic:    { label: '毒', cls: 'bg-orange-100 text-orange-700' },
    unknown:  { label: '不明', cls: 'bg-gray-100 text-gray-500' },
  }
  const { label, cls } = map[edibility?.toLowerCase()] ?? { label: edibility, cls: 'bg-gray-100 text-gray-500' }
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
}

function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) {
    return <span className="text-xs text-gray-400 whitespace-nowrap">No votes</span>
  }
  const pct = Math.round(confidence * 100)
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-gray-600 w-8 text-right">{pct}%</span>
    </div>
  )
}

function MediaTypeIcon({ type }: { type: string }) {
  if (type === 'VIDEO') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.847v6.306a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    )
  }
  if (type === 'AUDIO') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
      </svg>
    )
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
