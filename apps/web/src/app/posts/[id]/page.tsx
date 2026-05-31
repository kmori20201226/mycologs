'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type MediaItem, type AiIdentification } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'

type PostVisibility = 'PUBLIC' | 'CLUBMEMBERONLY' | 'PRIVATE'

interface Post {
  id: number
  contents: string
  createdAt: string
  visibility: PostVisibility
  clubIds: number[]
  user: { id: number; name: string; handleName: string | null }
  event: { id: number; name: string; startAt: string | null } | null
}

interface Identification {
  id: number
  createdAt: string
  confidence: number | null
  description: AiIdentification | null
  accepted: boolean
  identificationHint: string | null
  user: { id: number; name: string; handleName: string | null }
  species: { id: number; scientificName: string } | null
}

interface Followup {
  id: number
  contents: string
  createdAt: string
  user: { id: number; name: string; handleName: string | null }
}

function PostPageInner() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const postId = Number(params.id)
  const uploadErrors = Number(searchParams.get('uploadErrors') ?? 0)

  const [post, setPost] = useState<Post | null>(null)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [identifications, setIdentifications] = useState<Identification[]>([])
  const [notFound, setNotFound] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [errorDismissed, setErrorDismissed] = useState(false)
  const [acceptedIds, setAcceptedIds] = useState<number[]>([])
  const [aiAccepted, setAiAccepted] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [confirmDeletePost, setConfirmDeletePost] = useState(false)
  const [pendingDeleteFollowupId, setPendingDeleteFollowupId] = useState<number | null>(null)
  const [followups, setFollowups] = useState<Followup[]>([])
  const [commentText, setCommentText] = useState('')
  const [commentSubmitting, setCommentSubmitting] = useState(false)

  const [currentUser] = useState(() => getStoredUser())

  const [mediaLoaded, setMediaLoaded] = useState(false)
  const [editingCaption, setEditingCaption] = useState(false)
  const [pendingCaption, setPendingCaption] = useState('')
  const [captionSaving, setCaptionSaving] = useState(false)
  const [captionWarning, setCaptionWarning] = useState<{ category: string; comment: string } | null>(null)

  const [editingVisibility, setEditingVisibility] = useState(false)
  const [pendingVisibility, setPendingVisibility] = useState<PostVisibility>('PUBLIC')
  const [pendingClubIds, setPendingClubIds] = useState<number[]>([])
  const [myClubs, setMyClubs] = useState<{ id: number; name: string }[]>([])
  const [hasSubscription, setHasSubscription] = useState(false)
  const [visibilityUpdating, setVisibilityUpdating] = useState(false)

  // Identification hint (local only — stored on Identification when accepted)
  const [hint, setHint] = useState('')
  const [committedHint, setCommittedHint] = useState<string | null>(null)

  // AI identification state
  const [aiResult, setAiResult] = useState<AiIdentification | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const identSectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    apiClient.request<Post>(`/posts/${postId}`)
      .then((p) => {
        setPost(p)
        const user = getStoredUser()
        if (user && user.id === p.user.id) {
          apiClient.request<{ id: number; name: string }[]>('/me/clubs')
            .then((clubs) => setMyClubs(clubs ?? []))
            .catch(() => {})
          apiClient.request<{ status: string; planId: string }[]>(`/users/${user.id}/subscriptions`)
            .then((subs) => {
              const active = (subs ?? []).some((s) => ['active', 'trialing'].includes(s.status) && s.planId !== 'free')
              setHasSubscription(active)
            })
            .catch(() => {})
        }
      })
      .catch(() => setNotFound(true))

    apiClient.getPostMedia(postId)
      .then((m) => { setMedia(m); setMediaLoaded(true) })
      .catch(() => { setMediaLoaded(true) })

    apiClient.getPostIdentifications(postId)
      .then((ids) => {
        const list = ids as Identification[]
        setIdentifications(list)
        const acceptedList = list.filter((i) => i.accepted).map((i) => i.id)
        setAcceptedIds(acceptedList)
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
    await apiClient.acceptIdentification(id)
    setIdentifications((prev) => prev.map((i) => i.id === id ? { ...i, accepted: !i.accepted } : i))
    setAcceptedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  async function handleAcceptAi() {
    if (!aiResult) return
    const user = getStoredUser()
    if (!user) return
    // Persist the AI result as an Identification record, then accept it
    const created = await apiClient.createIdentification({
      postId,
      userId: user.id,
      identificationHint: hint || null,
      score: aiResult.score ?? null,
      description: aiResult as unknown as Record<string, unknown>
    })
    const createdIdent = created as { id: number }
    await apiClient.acceptIdentification(createdIdent.id)
    const newIdent: Identification = { ...(created as any), accepted: true, description: aiResult }
    setIdentifications((prev) => [...prev, newIdent])
    setAcceptedIds((prev) => [...prev, createdIdent.id])
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
    setAcceptedIds((prev) => prev.filter((x) => x !== id))
  }

  async function handleCommentSubmit(e: React.FormEvent) {
    e.preventDefault()
    const user = getStoredUser()
    if (!user || !commentText.trim()) return
    setCommentSubmitting(true)
    try {
      const created = await apiClient.createFollowup({ parentPostId: postId, userId: user.id, contents: commentText.trim() })
      setFollowups((prev) => [...prev, created as Followup])
      setCommentText('')
    } finally {
      setCommentSubmitting(false)
    }
  }

  async function handleDeletePost() {
    await apiClient.deletePost(postId)
    router.push('/posts')
  }

  async function handleDeleteFollowup(id: number) {
    await apiClient.deleteFollowup(id)
    setFollowups((prev) => prev.filter((f) => f.id !== id))
  }

  function startEditingVisibility() {
    if (!post) return
    setPendingVisibility(post.visibility)
    setPendingClubIds(post.clubIds ?? [])
    setEditingVisibility(true)
  }

  async function saveVisibility() {
    const user = getStoredUser()
    if (!user || !post) return
    setVisibilityUpdating(true)
    try {
      await apiClient.updatePost(post.id, {
        userId: user.id,
        visibility: pendingVisibility,
        clubIds: pendingVisibility === 'CLUBMEMBERONLY' ? pendingClubIds : undefined,
      })
      setPost((prev) => prev ? { ...prev, visibility: pendingVisibility, clubIds: pendingVisibility === 'CLUBMEMBERONLY' ? pendingClubIds : [] } : prev)
      setEditingVisibility(false)
    } catch {
      showToast('公開範囲の変更に失敗しました')
    } finally {
      setVisibilityUpdating(false)
    }
  }

  async function handleAiIdentify() {
    const images = media.filter((m) => m.type === 'IMAGE')
    if (images.length === 0) {
      showToast('きのこを同定するには写真が必要です')
      return
    }
    const currentUser = getStoredUser()
    setAiLoading(true)
    setAiError('')
    setAiResult(null)
    setCommittedHint(hint)
    try {
      const result = await apiClient.aiIdentify(postId, hint || undefined, currentUser?.id)
      setAiResult(result)
      setTimeout(() => identSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (err: any) {
      if (err?.status === 402) {
        const isClub = err?.apiMessage?.includes('クラブ')
        setAiError(isClub ? 'insufficient_credit_club' : 'insufficient_credit_user')
      } else {
        setAiError('同定に失敗しました。もう一度お試しください。')
      }
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
                <div className="flex items-center gap-2">
                {/* Visibility badge */}
                <VisibilityBadge visibility={post.visibility} />
                {(() => { const user = getStoredUser(); return user && user.id === post.user.id ? (
                  <>
                  <button
                    onClick={startEditingVisibility}
                    className="text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    公開設定
                  </button>
                  <button
                    onClick={() => setConfirmDeletePost(true)}
                    className="text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    削除
                  </button>
                  </>
                ) : null })()}
                {(aiLoading || committedHint === null || hint !== committedHint) && <button
                  onClick={handleAiIdentify}
                  disabled={aiLoading || !currentUser || (mediaLoaded && images.length === 0)}
                  title={(mediaLoaded && images.length === 0) ? '写真を添付してから同定を依頼してください' : !currentUser ? 'ログインが必要です' : undefined}
                  className={`inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${aiLoading ? 'cursor-wait' : ''}`}
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
              </div>

              {post.event && (
                <div className="mb-4 inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium px-3 py-1 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {post.event.startAt ? `${new Date(post.event.startAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} ${post.event.name}` : post.event.name}
                </div>
              )}

              {(() => {
                const isOwner = currentUser && currentUser.id === post.user.id
                if (editingCaption) {
                  return (
                    <div className="space-y-2">
                      <textarea
                        value={pendingCaption}
                        onChange={(e) => setPendingCaption(e.target.value)}
                        rows={5}
                        autoFocus
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                        disabled={captionSaving}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            const user = getStoredUser()
                            if (!user || !post) return
                            setCaptionSaving(true)
                            try {
                              const result = await apiClient.updatePost(post.id, { userId: user.id, contents: pendingCaption })
                              if (!result.ok) {
                                if (result.status === 'rejected') {
                                  showToast(`この内容は保存できません。${result.comment ? result.comment : ''}`)
                                  return
                                }
                                if (result.status === 'warning') {
                                  setCaptionWarning({ category: result.category, comment: result.comment })
                                  return
                                }
                              }
                              setPost((prev) => prev ? { ...prev, contents: pendingCaption } : prev)
                              setEditingCaption(false)
                            } catch {
                              showToast('キャプションの保存に失敗しました')
                            } finally {
                              setCaptionSaving(false)
                            }
                          }}
                          disabled={captionSaving}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                        >
                          {captionSaving ? '保存中…' : '保存'}
                        </button>
                        <button
                          onClick={() => setEditingCaption(false)}
                          disabled={captionSaving}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold rounded-lg transition-colors"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  )
                }
                return (
                  <div>
                    {post.contents ? (
                      <div className="flex items-start gap-2">
                        <p className="flex-1 whitespace-pre-wrap text-gray-800">{post.contents}</p>
                        {isOwner && (
                          <button
                            onClick={() => { setPendingCaption(post.contents ?? ''); setEditingCaption(true) }}
                            className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
                            aria-label="キャプションを編集"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="text-gray-400 italic">
                          {new Date(post.createdAt).toLocaleString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        {isOwner && (
                          <button
                            onClick={() => { setPendingCaption(''); setEditingCaption(true) }}
                            className="mt-1 text-sm text-emerald-600 hover:text-emerald-700 hover:underline transition-colors"
                          >
                            キャプションを追加
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Identification hint */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  同定ヒント
                </label>
                <textarea
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  rows={3}
                  placeholder="色、臭い、採取場所の環境、季節など、同定に役立つ情報を自由に記入してください…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
                <p className="text-xs text-gray-400 mt-1">同定を依頼するときにAIへ送信されます</p>
              </div>
            </div>

            {/* Media gallery */}
            {mediaLoaded && images.length === 0 && media.length === 0 && (
              <div className="bg-white rounded-xl shadow p-6 mb-6 text-center text-sm text-gray-400">
                写真が添付されていません
              </div>
            )}
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

            {/* Accepted identifications */}
            {acceptedIds.length > 0 && (
              <div className="mb-6 space-y-4">
                <div className="flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-semibold text-emerald-700 uppercase tracking-wide">確定済み同定</span>
                </div>
                {acceptedIds.map((aid) => {
                  const ident = identifications.find((i) => i.id === aid)
                  if (!ident) return null
                  const details = ident.description
                  const name = ident.species?.scientificName ?? (details as any)?.scientific_name ?? '—'
                  const japaneseName = details?.japanese_name ?? null
                  return (
                    <div key={aid} className="bg-emerald-50 border-2 border-emerald-400 rounded-xl shadow p-5 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                        <p className="text-xl font-bold text-gray-900 italic">{name}</p>
                        {japaneseName && <p className="text-base text-gray-700">{japaneseName}</p>}
                        {(details?.dialect_names?.length ?? 0) > 0 && (
                          <p className="text-sm text-gray-500">方言名: {details!.dialect_names.join('、')}</p>
                        )}
                        <p className="text-sm text-gray-500 mt-1">
                          {ident.user.handleName ?? ident.user.name} が提案 · {new Date(ident.createdAt).toLocaleDateString('ja-JP')}
                        </p>
                        </div>
                        <button
                          onClick={() => setPendingDeleteId(aid)}
                          className="shrink-0 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          削除
                        </button>
                      </div>

                      {details ? (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <AiConfidenceBadge confidence={details.confidence} />
                            <EdibilityBadge edibility={details.edibility} />
                            {details.score != null && (
                              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                                スコア: {Math.round(details.score * 100)}%
                              </span>
                            )}
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
                              <ul className="space-y-2">
                                {details.similar_species.map((s, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                                    <span className="text-yellow-500 mt-0.5 shrink-0">△</span>
                                    <span>
                                      <span className="font-medium">{s.japanese_name}</span>
                                      <span className="text-gray-400 ml-1 text-xs">({s.scientific_name})</span>
                                      {s.how_to_distinguish && (
                                        <span className="block text-gray-500 text-xs mt-0.5">{s.how_to_distinguish}</span>
                                      )}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {ident.identificationHint && (
                            <div className="border-t border-emerald-200 pt-3">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">同定時に使用した同定ヒント</p>
                              <p className="text-sm text-gray-600 whitespace-pre-wrap">{ident.identificationHint}</p>
                            </div>
                          )}

                          {details.missing_info && details.missing_info.length > 0 && (
                            <div className="border-t border-emerald-200 pt-3">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">同定精度向上のために必要な情報</p>
                              <ul className="space-y-1">
                                {details.missing_info.map((m, i) => (
                                  <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                                    <span className="shrink-0 mt-0.5">?</span>
                                    {m}
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
                      ) : (
                        <>
                          {ident.identificationHint && (
                            <div className="mt-2">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">同定時に使用した同定ヒント</p>
                              <p className="text-sm text-gray-600 whitespace-pre-wrap">{ident.identificationHint}</p>
                            </div>
                          )}
                          <ConfidenceBadge confidence={ident.confidence} />
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

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

            {/* AI identification result */}
            <div ref={identSectionRef}>
              {aiLoading && (
                <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3 text-emerald-700 text-sm">
                  <svg className="animate-spin w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Claude AIで{images.length}枚の写真を分析中…
                </div>
              )}

              {aiError && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 text-sm">
                  {aiError === 'insufficient_credit_user' ? (
                    <>
                      個人クレジットが不足しています。
                      <Link href="/subscription" className="underline hover:text-red-900">
                        サブスクリプションを購入
                      </Link>
                      するとクレジットが追加されます。
                    </>
                  ) : aiError === 'insufficient_credit_club' ? (
                    <>
                      クラブのクレジットが不足しています。
                      <Link href="/subscription" className="underline hover:text-red-900">
                        クラブのサブスクリプションを更新
                      </Link>
                      するとクレジットが追加されます。
                    </>
                  ) : aiError}
                </div>
              )}

              {aiResult && !aiAccepted && (
                <div className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 p-5 space-y-3">
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
                        {aiResult.score != null && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">
                            スコア: {Math.round(aiResult.score * 100)}%
                          </span>
                        )}
                      </div>
                      {aiResult.scientific_name ? (
                        <>
                          <p className="mt-2 text-lg font-bold text-gray-900 italic">{aiResult.scientific_name}</p>
                          {aiResult.japanese_name && (
                            <p className="text-base text-gray-700 not-italic">{aiResult.japanese_name}</p>
                          )}
                          {aiResult.dialect_names?.length > 0 && (
                            <p className="text-sm text-gray-500">方言名: {aiResult.dialect_names.join('、')}</p>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-gray-500 italic">キノコが特定できませんでした</p>
                      )}
                    </div>
                  </div>

                  {aiResult.shape && (
                    <p className="text-xs text-gray-500">形状: <span className="text-gray-700 font-medium">{aiResult.shape}</span></p>
                  )}

                  {aiResult.key_features?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">特徴</p>
                      <ul className="space-y-1">
                        {aiResult.key_features.map((f, i) => {
                          const label = typeof f === 'string' ? f : Object.values(f).join(' ')
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

                  {aiResult.similar_species?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">類似種</p>
                      <ul className="space-y-2">
                        {aiResult.similar_species.map((s, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                            <span className="text-yellow-500 mt-0.5 shrink-0">△</span>
                            <span>
                              <span className="font-medium">{s.japanese_name}</span>
                              <span className="text-gray-400 ml-1 text-xs">({s.scientific_name})</span>
                              {s.how_to_distinguish && (
                                <span className="block text-gray-500 text-xs mt-0.5">{s.how_to_distinguish}</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiResult.missing_info && aiResult.missing_info.length > 0 && (
                    <div className="border-t border-emerald-200 pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">同定精度向上のために必要な情報</p>
                      <ul className="space-y-1">
                        {aiResult.missing_info.map((m, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-gray-500">
                            <span className="shrink-0 mt-0.5">?</span>
                            {m}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiResult.disclaimer && (
                    <p className="text-xs text-gray-500 border-t border-emerald-200 pt-3 leading-relaxed">
                      ⚠️ {aiResult.disclaimer}
                    </p>
                  )}

                  <div className="flex items-center gap-2 pt-3 border-t border-emerald-200">
                    <button
                      onClick={handleAcceptAi}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-emerald-500 text-emerald-600 hover:bg-emerald-50 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      確定する
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
            </div>

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
                            {(f.user.handleName ?? f.user.name)[0].toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <div className="flex items-baseline gap-2">
                                <span className="text-sm font-medium text-gray-800">{f.user.handleName ?? f.user.name}</span>
                                <span className="text-xs text-gray-400">{new Date(f.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                              </div>
                              {user && user.id === f.user.id && (
                                <button
                                  onClick={() => setPendingDeleteFollowupId(f.id)}
                                  className="shrink-0 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  削除
                                </button>
                              )}
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

      {/* Delete confirmation dialog */}
      {pendingDeleteId !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <p className="text-gray-800 font-medium">この同定を削除しますか？</p>
            <p className="text-sm text-gray-500">削除すると元に戻せません。</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setPendingDeleteId(null)}
                className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={async () => {
                  const id = pendingDeleteId
                  setPendingDeleteId(null)
                  await handleDecline(id)
                }}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete post confirmation */}
      {confirmDeletePost && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <p className="text-gray-800 font-medium">この投稿を削除しますか？</p>
            <p className="text-sm text-gray-500">投稿・写真・同定など関連データがすべて削除されます。元に戻せません。</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDeletePost(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">キャンセル</button>
              <button onClick={async () => { setConfirmDeletePost(false); await handleDeletePost() }} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">削除する</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete followup confirmation */}
      {pendingDeleteFollowupId !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <p className="text-gray-800 font-medium">このコメントを削除しますか？</p>
            <p className="text-sm text-gray-500">削除すると元に戻せません。</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setPendingDeleteFollowupId(null)} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">キャンセル</button>
              <button onClick={async () => { const id = pendingDeleteFollowupId; setPendingDeleteFollowupId(null); await handleDeleteFollowup(id) }} className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">削除する</button>
            </div>
          </div>
        </div>
      )}

      {/* Visibility edit dialog */}
      {editingVisibility && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full space-y-4">
            <h2 className="text-base font-semibold text-gray-900">公開範囲を変更</h2>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="edit-visibility" value="PUBLIC" checked={pendingVisibility === 'PUBLIC'} onChange={() => setPendingVisibility('PUBLIC')} className="accent-emerald-600" />
                <span className="text-sm text-gray-700">公開 — 誰でも見られる</span>
              </label>
              {myClubs.length > 0 && (
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="radio" name="edit-visibility" value="CLUBMEMBERONLY" checked={pendingVisibility === 'CLUBMEMBERONLY'} onChange={() => setPendingVisibility('CLUBMEMBERONLY')} className="accent-emerald-600 mt-0.5" />
                  <div className="flex-1">
                    <span className="text-sm text-gray-700">クラブメンバーのみ</span>
                    {pendingVisibility === 'CLUBMEMBERONLY' && (
                      <div className="mt-2 space-y-1.5">
                        {myClubs.map((club) => (
                          <label key={club.id} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={pendingClubIds.includes(club.id)}
                              onChange={(e) => {
                                if (e.target.checked) setPendingClubIds((prev) => [...prev, club.id])
                                else setPendingClubIds((prev) => prev.filter((id) => id !== club.id))
                              }}
                              className="accent-emerald-600"
                            />
                            <span className="text-sm text-gray-600">{club.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </label>
              )}
              <label className={`flex items-center gap-3 ${hasSubscription ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                <input type="radio" name="edit-visibility" value="PRIVATE" checked={pendingVisibility === 'PRIVATE'} onChange={() => hasSubscription && setPendingVisibility('PRIVATE')} disabled={!hasSubscription} className="accent-emerald-600" />
                <span className="text-sm text-gray-700">
                  自分のみ
                  {!hasSubscription && <span className="ml-1 text-xs text-gray-400">（サブスクリプション必要）</span>}
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setEditingVisibility(false)} disabled={visibilityUpdating} className="px-4 py-2 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">キャンセル</button>
              <button onClick={saveVisibility} disabled={visibilityUpdating} className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg transition-colors">
                {visibilityUpdating ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {captionWarning && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-yellow-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <div>
                <h2 className="text-base font-semibold text-gray-900">投稿内容の注意</h2>
                <p className="text-xs text-yellow-700 font-medium mt-0.5">
                  {{ POTENTIALLY_OFFENSIVE: '不適切な可能性', OFF_TOPIC_IMAGE: 'きのこと無関係な可能性', OFFENSIVE_SEXUAL: '不適切なコンテンツ' }[captionWarning.category] ?? captionWarning.category}
                </p>
              </div>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{captionWarning.comment}</p>
            <p className="text-xs text-gray-500">このまま保存すると、内容が記録されます。修正することをお勧めします。</p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={async () => {
                  const w = captionWarning
                  setCaptionWarning(null)
                  const user = getStoredUser()
                  if (!user || !post) return
                  setCaptionSaving(true)
                  try {
                    await apiClient.updatePost(post.id, { userId: user.id, contents: pendingCaption, confirmedModeration: w })
                    setPost((prev) => prev ? { ...prev, contents: pendingCaption } : prev)
                    setEditingCaption(false)
                  } catch {
                    showToast('キャプションの保存に失敗しました')
                  } finally {
                    setCaptionSaving(false)
                  }
                }}
                className="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                このまま保存する
              </button>
              <button
                onClick={() => setCaptionWarning(null)}
                className="flex-1 px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-lg transition-colors"
              >
                修正する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PostPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <PostPageInner />
    </Suspense>
  )
}

function VisibilityBadge({ visibility }: { visibility: PostVisibility }) {
  const map: Record<PostVisibility, { label: string; cls: string }> = {
    PUBLIC:          { label: '公開',             cls: 'bg-gray-100 text-gray-500' },
    CLUBMEMBERONLY:  { label: 'クラブのみ',       cls: 'bg-blue-50 text-blue-600' },
    PRIVATE:         { label: '自分のみ',         cls: 'bg-yellow-50 text-yellow-700' },
  }
  const { label, cls } = map[visibility] ?? map.PUBLIC
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
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
