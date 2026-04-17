'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type MediaItem, type AiIdentification } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

interface Post {
  id: number
  contents: string
  createdAt: string
  user: { id: number; name: string; handleName: string | null }
  event: { id: number; name: string } | null
}

interface Identification {
  id: number
  createdAt: string
  confidence: number | null
  description: AiIdentification | null
  accepted: boolean
  user: { id: number; name: string; handleName: string | null }
  species: { id: number; scientificName: string } | null
}

interface Followup {
  id: number
  contents: string
  createdAt: string
  user: { id: number; name: string; handleName: string | null } | null
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
  const [acceptedId, setAcceptedId] = useState<number | null>(null)
  const [aiAccepted, setAiAccepted] = useState(false)
  const [followups, setFollowups] = useState<Followup[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)

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
      .then((ids) => {
        const list = ids as Identification[]
        setIdentifications(list)
        const accepted = list.find((i) => i.accepted)
        if (accepted) setAcceptedId(accepted.id)
      })
      .catch(() => {})

    apiClient.getPostFollowups(postId)
      .then((f) => setFollowups(f as Followup[]))
      .catch(() => {})
  }, [postId])

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }

  async function handleAccept(id: number) {
    setAcceptedId(id)
    setAiAccepted(false)
    await apiClient.acceptIdentification(id)
    setIdentifications((prev) => prev.map((i) => ({ ...i, accepted: i.id === id })))
  }

  async function handleAcceptAi() {
    if (!aiResult) return
    const user = getStoredUser()
    if (!user) return
    // Persist the AI result as an Identification record, then accept it
    const created = await apiClient.createIdentification({
      postId,
      userId: user.id,
      description: aiResult as unknown as Record<string, unknown>
    })
    await apiClient.acceptIdentification(created.id)
    const newIdent: Identification = { ...(created as any), accepted: true, description: aiResult }
    setIdentifications((prev) => [...prev.map((i) => ({ ...i, accepted: false })), newIdent])
    setAcceptedId(created.id)
    setAiAccepted(false)
    setAiResult(null)
  }

  function handleDeclineAi() {
    setAiResult(null)
    setAiAccepted(false)
  }

  async function handleDecline(id: number) {
    await apiClient.deleteIdentification(id)
    setIdentifications((prev) => prev.filter((i) => i.id !== id))
    if (acceptedId === id) setAcceptedId(null)
  }

  async function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault()
    const user = getStoredUser()
    if (!user || !commentText.trim()) return
    setCommentSubmitting(true)
    try {
      const created = await apiClient.createFollowup({ postId, userId: user.id, contents: commentText.trim() })
      setFollowups((prev) => [...prev, created as Followup])
      setCommentText('')
    } finally {
      setCommentSubmitting(false)
    }
  }

  async function handleAiIdentify() {
    const images = media.filter((m) => m.type === 'IMAGE')
    if (images.length === 0) {
      showToast('きのこを同定するには写真が必要です')
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
      setAiError('同定に失敗しました。もう一度お試しください。')
    } finally {
      setAiLoading(false)
    }
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">投稿が見つかりません。</p>
          <Link href="/posts" className="text-emerald-600 hover:underline">投稿一覧へ戻る</Link>
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
            戻る
          </Link>
          <div className="text-sm text-gray-500">
            <Link href="/posts" className="hover:text-emerald-600 transition-colors">投稿一覧</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-800 font-medium">投稿 #{postId}</span>
          </div>
        </div>

        {uploadErrors > 0 && !errorDismissed && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm px-4 py-3 rounded-lg">
            <span>
              {uploadErrors === 1
                ? '1件のファイルのアップロードに失敗しました。'
                : `${uploadErrors}件のファイルのアップロードに失敗しました。`}
              {' '}投稿は正常に作成されました。
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
                  <span className="font-medium text-gray-700">{post.user.handleName ?? post.user.name}</span>
                  <span className="mx-2">·</span>
                  <span>{new Date(post.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                </div>
                {!acceptedId && !aiAccepted && <button
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
                      同定中…
                    </>
                  ) : (
                    '同定を依頼'
                  )}
                </button>}
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
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">写真</h2>
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

            {/* Accepted identification */}
            {(acceptedId !== null || aiAccepted) && (() => {
              const acceptedDbIdent = identifications.find((i) => i.id === acceptedId)
              const details: AiIdentification | null =
                acceptedDbIdent?.description ?? (aiAccepted ? aiResult : null)
              const name = acceptedDbIdent?.species?.scientificName ?? acceptedDbIdent?.description?.scientific_name as string ?? aiResult?.scientific_name ?? ''
              const japaneseName = aiResult?.japanese_name ?? null
              return (
                <div className="bg-emerald-50 border-2 border-emerald-400 rounded-xl shadow p-5 mb-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">確定済み同定</span>
                    {aiAccepted && (
                      <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">AI</span>
                    )}
                  </div>

                  <div>
                    <p className="text-xl font-bold text-gray-900 italic">{name}</p>
                    {japaneseName && <p className="text-base text-gray-700">{japaneseName}</p>}
                    {acceptedDbIdent && (
                      <p className="text-sm text-gray-500 mt-1">
                        {acceptedDbIdent.user.handleName ?? acceptedDbIdent.user.name} が提案 · {new Date(acceptedDbIdent.createdAt).toLocaleDateString('ja-JP')}
                      </p>
                    )}
                  </div>

                  {details && (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <AiConfidenceBadge confidence={details.confidence} />
                        <EdibilityBadge edibility={details.edibility} />
                      </div>

                      {details.shape && (
                        <p className="text-xs text-gray-500">形状: <span className="text-gray-700 font-medium">{details.shape}</span></p>
                      )}

                      {details.key_features?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">特徴</p>
                          <ul className="space-y-1">
                            {details.key_features.map((f, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                <span className="text-emerald-500 mt-0.5 shrink-0">•</span>
                                {typeof f === 'string' ? f : Object.values(f).join(' ')}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {details.similar_species?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">類似種</p>
                          <ul className="space-y-1">
                            {details.similar_species.map((s, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                <span className="text-yellow-500 mt-0.5 shrink-0">△</span>
                                {typeof s === 'string' ? s : [s.name, s.difference].filter(Boolean).join(' — ')}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {details.disclaimer && (
                        <p className="text-xs text-gray-500 border-t border-emerald-200 pt-3 leading-relaxed">
                          ⚠️ {details.disclaimer}
                        </p>
                      )}
                    </>
                  )}

                  {!details && acceptedDbIdent && (
                    <ConfidenceBadge confidence={acceptedDbIdent.confidence} />
                  )}
                </div>
              )
            })()}

            {otherMedia.length > 0 && (
              <div className="bg-white rounded-xl shadow p-6 mb-6">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">添付ファイル</h2>
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
            {!acceptedId && !aiAccepted && <div ref={identSectionRef} className="bg-white rounded-xl shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  同定
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
                  Claude AIで{images.length}枚の写真を分析中…
                </div>
              )}

              {aiError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
                  {aiError}
                </div>
              )}

              {aiResult && !aiAccepted && (
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

                  {/* Accept / Decline */}
                  <div className="flex items-center gap-2 pt-3 border-t border-emerald-200">
                    <button
                      onClick={handleAcceptAi}
                      className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                        aiAccepted
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-white border border-emerald-500 text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {aiAccepted ? '確定済み' : '確定する'}
                    </button>
                    <button
                      onClick={handleDeclineAi}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-red-400 text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      却下
                    </button>
                  </div>
                </div>
              )}

              {/* Human identifications */}
              {identifications.length === 0 && !aiResult ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm mb-3">まだ同定がありません。</p>
                  <p className="text-gray-400 text-sm"><strong>同定を依頼</strong>をクリックしてAIを使うか、自分で提案してください。</p>
                </div>
              ) : identifications.length > 0 ? (
                <ul className="space-y-3">
                  {identifications.filter((i) => i.id !== acceptedId).map((ident) => {
                    const isAccepted = acceptedId === ident.id
                    return (
                      <li
                        key={ident.id}
                        className={`p-3 rounded-lg border transition-colors ${
                          isAccepted ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-4 mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm italic text-gray-900">
                              {ident.species?.scientificName ?? (ident.description as any)?.scientific_name ?? '—'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {ident.user.handleName ?? ident.user.name} が提案 · {new Date(ident.createdAt).toLocaleDateString('ja-JP')}
                            </p>
                          </div>
                          <ConfidenceBadge confidence={ident.confidence} />
                        </div>
                        <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                          <button
                            onClick={() => handleAccept(ident.id)}
                            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                              isAccepted
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-white border border-emerald-500 text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            {isAccepted ? '確定済み' : '確定する'}
                          </button>
                          <button
                            onClick={() => handleDecline(ident.id)}
                            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-red-400 text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            却下
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>}

            {/* Comments */}
            {(() => {
              const user = getStoredUser()
              return (
                <div className="bg-white rounded-xl shadow p-6">
                  <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
                    コメント
                    {followups.length > 0 && (
                      <span className="ml-2 text-emerald-600">{followups.length}</span>
                    )}
                  </h2>

                  {followups.length === 0 && (
                    <p className="text-sm text-gray-400 mb-4">まだコメントがありません。</p>
                  )}

                  {followups.length > 0 && (
                    <ul className="space-y-4 mb-6">
                      {followups.map((f) => (
                        <li key={f.id} className="flex gap-3">
                          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                            {(f.user?.handleName ?? f.user?.name ?? '?')[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-sm font-medium text-gray-800">{f.user?.handleName ?? f.user?.name ?? 'Unknown'}</span>
                              <span className="text-xs text-gray-400">{new Date(f.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{f.contents}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  {user ? (
                    <form onSubmit={handleCommentSubmit} className="flex flex-col gap-2">
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="コメントを追加…"
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      />
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={commentSubmitting || !commentText.trim()}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          {commentSubmitting ? '投稿中…' : 'コメントを投稿'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <p className="text-sm text-gray-400">
                      <Link href="/login" className="text-emerald-600 hover:underline">サインイン</Link>してコメントを投稿。
                    </p>
                  )}
                </div>
              )
            })()}
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
