'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type MediaItem } from '@/lib/api'

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
  species: { id: number; name: string }
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
            <button
              onClick={() => setErrorDismissed(true)}
              className="text-yellow-600 hover:text-yellow-800 shrink-0"
              aria-label="Dismiss"
            >
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
                <Link
                  href={`/posts/${postId}/identify`}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  Help Identify
                </Link>
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
            <div className="bg-white rounded-xl shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Identifications
                  {identifications.length > 0 && (
                    <span className="ml-2 text-emerald-600">{identifications.length}</span>
                  )}
                </h2>
              </div>

              {identifications.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm mb-3">No identifications yet.</p>
                  <Link
                    href={`/posts/${postId}/identify`}
                    className="text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                  >
                    Be the first to identify this mushroom →
                  </Link>
                </div>
              ) : (
                <ul className="space-y-3">
                  {identifications.map((id) => (
                    <li key={id.id} className="flex items-center gap-4 p-3 rounded-lg border bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">{id.species.name}</p>
                        <p className="text-xs text-gray-500">
                          Proposed by {id.user.name} · {new Date(id.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <ConfidenceBadge confidence={id.confidence} />
                    </li>
                  ))}
                </ul>
              )}
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
