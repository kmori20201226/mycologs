'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiClient, type MediaItem, type AiIdentification, type CandidateEvaluation, type Event } from '@/lib/api'
import { getStoredUser } from '@/lib/auth'
import EventCombobox from '@/components/EventCombobox'

type PostVisibility = 'PUBLIC' | 'CLUBMEMBERONLY' | 'PRIVATE'

interface Post {
  id: number
  contents: string
  createdAt: string
  visibility: PostVisibility
  clubIds: number[]
  expectedMediaCount?: number
  mentionedSpecies?: { id: number; scientificName: string; japaneseName: string }[]
  user: { id: number; name: string; handleName: string | null }
  event: { id: number; name: string; startAt: string | null; publicPlace: string | null } | null
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
  // Neighbour posts a picture can move into, and the id of a picture currently
  // being rotated/moved (to disable its controls while the request is in flight).
  const [photoNeighbors, setPhotoNeighbors] = useState<{ prev: number | null; next: number | null }>({ prev: null, next: null })
  const [mediaBusy, setMediaBusy] = useState<string | null>(null)
  const [editingCaption, setEditingCaption] = useState(false)
  const [pendingCaption, setPendingCaption] = useState('')
  const [captionSaving, setCaptionSaving] = useState(false)
  const [captionWarning, setCaptionWarning] = useState<{ category: string; comment: string } | null>(null)

  // Event options for the caption editor's combobox (the owner's club + private events).
  const [eventOptions, setEventOptions] = useState<Event[]>([])
  const [clubEventIds, setClubEventIds] = useState<Set<number>>(new Set())
  const [pendingEventId, setPendingEventId] = useState<number | ''>('')

  const [editingVisibility, setEditingVisibility] = useState(false)
  const [pendingVisibility, setPendingVisibility] = useState<PostVisibility>('PUBLIC')
  const [pendingClubIds, setPendingClubIds] = useState<number[]>([])
  const [myClubs, setMyClubs] = useState<{ id: number; name: string }[]>([])
  const [hasSubscription, setHasSubscription] = useState(false)
  const [visibilityUpdating, setVisibilityUpdating] = useState(false)

  // A post that uses a paid feature — PRIVATE visibility or a personal (non-club)
  // event — is read-only for its owner once their subscription access lapses. The
  // server enforces this (PATCH returns 403); here we hide every edit affordance so
  // it's clear up front rather than failing on save. Deletion stays allowed.
  const editFrozen = !!(
    currentUser && post && currentUser.id === post.user.id && !hasSubscription &&
    (post.visibility === 'PRIVATE' || (post.event != null && !clubEventIds.has(post.event.id)))
  )

  // Identification hint (local only — stored on Identification when accepted)
  const [hint, setHint] = useState('')
  const [committedHint, setCommittedHint] = useState<string | null>(null)

  // AI identification state — persisted in sessionStorage so back-navigation doesn't lose it
  const sessionKey = `aiResult:${postId}`
  const [aiResult, setAiResultState] = useState<AiIdentification | null>(() => {
    try {
      const saved = sessionStorage.getItem(`aiResult:${postId}`)
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  function setAiResult(result: AiIdentification | null) {
    setAiResultState(result)
    try {
      if (result) sessionStorage.setItem(sessionKey, JSON.stringify(result))
      else sessionStorage.removeItem(sessionKey)
    } catch { /* ignore */ }
  }
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [toast, setToast] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
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
          // Honors access_until, so a lapsed subscription (status still "active"
          // but access expired) correctly reads as inactive — PRIVATE visibility
          // and personal events are subscriber-only.
          apiClient.request<{ active: boolean }>(`/users/${user.id}/subscription/active`)
            .then((res) => setHasSubscription(res.active))
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

  // Load the owner's club + private events for the caption editor's event
  // combobox. Only the post owner can re-link, so skip the fetch otherwise.
  useEffect(() => {
    const user = getStoredUser()
    if (!post || !user || user.id !== post.user.id) return
    let cancelled = false
    ;(async () => {
      const memberClubs = await apiClient.request<{ id: number; name: string }[]>('/me/clubs').catch(() => [] as { id: number; name: string }[])
      const clubFetches = memberClubs.map((c) => apiClient.getEvents({ clubId: c.id }).catch(() => [] as Event[]))
      const myFetch = apiClient.getEvents({ userId: user.id }).catch(() => [] as Event[])
      const [clubResults, myEvs] = await Promise.all([Promise.all(clubFetches), myFetch])
      if (cancelled) return

      const clubEvs = clubResults.flat()
      const clubIds = new Set(clubEvs.map((e) => e.id))
      const seen = new Set<number>()
      const merged: Event[] = []
      for (const ev of [...clubEvs, ...myEvs]) {
        if (!seen.has(ev.id)) { seen.add(ev.id); merged.push(ev) }
      }
      // Keep the currently-linked event selectable even if it isn't in the
      // owner's club/private lists (e.g. an event from a club they since left).
      if (post.event && !seen.has(post.event.id)) {
        merged.push({
          id: post.event.id, name: post.event.name, startAt: post.event.startAt,
          clubId: null, userId: null, description: null, place: null,
          publicPlace: post.event.publicPlace,
          longitude: null, latitude: null, endAt: null, bannerImage: null,
          retrospective: null, createdAt: '',
        })
      }
      merged.sort((a, b) => {
        const ta = a.startAt ? new Date(a.startAt).getTime() : 0
        const tb = b.startAt ? new Date(b.startAt).getTime() : 0
        return tb - ta
      })

      setEventOptions(merged)
      setClubEventIds(clubIds)
    })()
    return () => { cancelled = true }
  }, [post?.user.id, post?.event?.id])

  // While this post's images are still uploading (in this or another session),
  // poll so they appear and the Identify button unlocks once complete. Also
  // refresh the post so a reconciled expectedMediaCount (user gave up on a
  // failed image) stops the poll instead of looping forever.
  useEffect(() => {
    const expected = post?.expectedMediaCount ?? 0
    if (!mediaLoaded || expected === 0) return
    if (media.filter((m) => m.type === 'IMAGE').length >= expected) return
    const t = setInterval(async () => {
      try {
        const [m, p] = await Promise.all([
          apiClient.getPostMedia(postId),
          apiClient.request<Post>(`/posts/${postId}`),
        ])
        setMedia(m)
        setPost(p)
      } catch { /* keep polling */ }
    }, 3000)
    return () => clearInterval(t)
  }, [postId, post?.expectedMediaCount, mediaLoaded, media])

  // Which neighbouring posts pictures could move into (owner only). Depends on
  // the post's takenAt, which is fixed once loaded, so fetch once per post.
  useEffect(() => {
    if (!post || !currentUser || currentUser.id !== post.user.id) return
    apiClient.getPhotoNeighbors(postId)
      .then(setPhotoNeighbors)
      .catch(() => {})
  }, [post, currentUser, postId])

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 3500)
  }

  // Re-fetch the post so server-derived fields (e.g. mentionedSpecies, which is
  // extracted from the caption on GET) reflect an edit. Falls back silently.
  async function refreshPost() {
    try {
      setPost(await apiClient.request<Post>(`/posts/${postId}`))
    } catch { /* keep current state */ }
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

  // Save one candidate evaluation as an identification proposal — authored by
  // the current user, left unaccepted, deduped by species.
  async function handleSaveCandidate(c: CandidateEvaluation) {
    const user = getStoredUser()
    if (!user) return
    const exists = identifications.some(
      (i) => i.species?.scientificName === c.scientific_name || i.description?.scientific_name === c.scientific_name,
    )
    if (exists) { showToast('この種は既に登録されています'); return }
    const created = await apiClient.createIdentification({
      postId,
      userId: user.id,
      identificationHint: hint || null,
      score: c.score ?? null,
      description: c as unknown as Record<string, unknown>,
    })
    const newIdent: Identification = { ...(created as any), accepted: false, description: c as unknown as AiIdentification }
    setIdentifications((prev) => [...prev, newIdent])
    showToast(`${c.japanese_name} を候補として登録しました`)
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

  async function uploadPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    for (const file of files) {
      try {
        const uploaded = await apiClient.uploadPostMedia(postId, file)
        setMedia((prev) => [...prev, uploaded])
      } catch (err) {
        if ((err as { status?: number })?.status === 401) {
          // Session cookie expired (7-day lifetime). A generic "failed" toast
          // leaves the user stuck; show a persistent re-login prompt instead and
          // stop trying the remaining files.
          setSessionExpired(true)
          break
        }
        showToast(`${file.name} のアップロードに失敗しました`)
      }
    }
  }

  // Rotate a picture 90° and swap in the returned (freshly-named) media so the
  // browser loads the rotated file instead of a cached copy.
  async function rotatePhoto(img: MediaItem, direction: 'cw' | 'ccw') {
    setMediaBusy(img.id)
    try {
      const updated = await apiClient.rotateMedia(img.id, direction)
      setMedia((prev) => prev.map((m) => (m.id === img.id ? updated : m)))
      setSelectedMedia((sel) => (sel && sel.id === img.id ? updated : sel))
    } catch {
      showToast('写真の回転に失敗しました')
    } finally {
      setMediaBusy(null)
    }
  }

  // Move a picture to the previous/next post (by taken time, within 1h). It
  // leaves the current post, so drop it from the gallery on success.
  async function movePhoto(img: MediaItem, direction: 'prev' | 'next') {
    setMediaBusy(img.id)
    try {
      await apiClient.moveMedia(img.id, direction)
      setMedia((prev) => prev.filter((m) => m.id !== img.id))
      showToast(direction === 'prev' ? '前の投稿に移動しました' : '次の投稿に移動しました')
    } catch (err) {
      showToast((err as { apiMessage?: string })?.apiMessage ?? '写真の移動に失敗しました')
    } finally {
      setMediaBusy(null)
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
      // Auto-include up to 3 mentioned species (Phase 1) as candidates for the
      // AI to compare against the images.
      const candidates = (post?.mentionedSpecies ?? [])
        .slice(0, 3)
        .map((s) => ({ japanese_name: s.japaneseName, scientific_name: s.scientificName }))
      const result = await apiClient.aiIdentify(postId, hint || undefined, currentUser?.id, candidates.length ? candidates : undefined)
      setAiResult(result)
      setTimeout(() => identSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (err: any) {
      if (err?.status === 402) {
        const isClub = err?.apiMessage?.includes('クラブ')
        setAiError(isClub ? 'insufficient_credit_club' : 'insufficient_credit_user')
      } else if (err?.status === 503) {
        // Anthropic account credit exhausted — temporary outage on our side.
        setAiError('ai_service_unavailable')
      } else if (err?.status === 409) {
        // Images still uploading in the background — no credit charged.
        setAiError(err?.apiMessage ?? '画像のアップロードが完了してから同定をご依頼ください。')
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
  // The post's images may still be uploading in the background; block Identify
  // until they're all in (it needs the full set, and the API refuses + refunds
  // an incomplete identification anyway).
  const mediaIncomplete = mediaLoaded && images.length < (post?.expectedMediaCount ?? 0)
  // Species already proposed on this post — used to dedupe the candidate "save" action.
  const identifiedSciNames = new Set(
    identifications.flatMap((i) => [i.species?.scientificName, i.description?.scientific_name].filter(Boolean) as string[]),
  )

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

        {sessionExpired && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm">
            <p className="font-medium text-red-800">セッションの有効期限が切れました</p>
            <p className="mt-1 text-xs text-red-700">
              写真をアップロードするには、もう一度ログインしてください。
            </p>
            <Link
              href="/login"
              className="mt-2 inline-block rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              ログインする
            </Link>
          </div>
        )}

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
                  {editFrozen ? (
                    <span className="text-xs text-gray-400" title="サブスクリプションが必要なため、この投稿は編集できません">読み取り専用</span>
                  ) : (
                  <button
                    onClick={startEditingVisibility}
                    className="text-xs font-medium text-gray-500 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition-colors"
                  >
                    公開設定
                  </button>
                  )}
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
                  disabled={aiLoading || !currentUser || (mediaLoaded && images.length === 0) || mediaIncomplete}
                  title={mediaIncomplete ? '写真のアップロードが完了するまでお待ちください' : (mediaLoaded && images.length === 0) ? '写真を添付してから同定を依頼してください' : !currentUser ? 'ログインが必要です' : undefined}
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

              {currentUser && post.event?.publicPlace && (
                <div className="mb-4 ml-2 inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-xs font-medium px-3 py-1 rounded-full">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {post.event.publicPlace}
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
                      <p className="text-xs text-gray-400">本文に書いたきのこの名前は、AI同定の候補として使われます。</p>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                          イベント <span className="text-gray-400 font-normal normal-case">（任意）</span>
                        </label>
                        <EventCombobox
                          events={hasSubscription ? eventOptions : eventOptions.filter((e) => e.clubId !== null || e.id === pendingEventId)}
                          value={pendingEventId}
                          onChange={setPendingEventId}
                          clubEventIds={clubEventIds}
                          disabled={captionSaving}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            const user = getStoredUser()
                            if (!user || !post) return
                            setCaptionSaving(true)
                            try {
                              const result = await apiClient.updatePost(post.id, { userId: user.id, contents: pendingCaption, eventId: pendingEventId === '' ? null : pendingEventId })
                              if (!result.ok) {
                                if (result.status === 'rejected') {
                                  showToast(`この内容は保存できません。${result.comment ? result.comment : ''}`)
                                  return
                                }
                                if (result.status === 'warning') {
                                  setCaptionWarning({ category: result.category, comment: result.comment })
                                  return
                                }
                                if (result.status === 'unavailable') {
                                  showToast(result.message)
                                  return
                                }
                              }
                              await refreshPost()
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
                        {isOwner && !editFrozen && (
                          <button
                            onClick={() => { setPendingCaption(post.contents ?? ''); setPendingEventId(post.event?.id ?? ''); setEditingCaption(true) }}
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
                        {isOwner && !editFrozen && (
                          <button
                            onClick={() => { setPendingCaption(''); setPendingEventId(post.event?.id ?? ''); setEditingCaption(true) }}
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
              {currentUser && (
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
              )}

              {/* Mushrooms mentioned in the post text (deterministic match against
                  known species names) — quick iNaturalist reference links. */}
              {post.mentionedSpecies && post.mentionedSpecies.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    投稿で言及されたきのこ
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {post.mentionedSpecies.map((s) => (
                      <Link
                        key={s.id}
                        href={`/identify/inat/${encodeURIComponent(s.scientificName)}?ja=${encodeURIComponent(s.japaneseName)}`}
                        className="inline-flex items-center bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm px-2.5 py-1 rounded-full transition-colors"
                      >
                        {s.japaneseName}
                      </Link>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">名前をタップするとiNaturalistの参考写真を表示します</p>
                </div>
              )}
            </div>

            {/* Media gallery */}
            {(() => {
              const _u = getStoredUser()
              const isOwner = _u && post && _u.id === post.user.id
              return (
                <div className="bg-white rounded-xl shadow p-6 mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">写真</h2>
                    {isOwner && (
                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          写真を追加
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={uploadPhotos}
                          />
                        </label>
                        {/* Touch-only: capture forces the camera, so it's shown
                            only on touch devices (hidden on desktop via .touch-only). */}
                        <label className="touch-only cursor-pointer items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
                          </svg>
                          撮影
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={uploadPhotos}
                          />
                        </label>
                      </div>
                    )}
                  </div>
                  {mediaLoaded && images.length === 0 && !mediaIncomplete && (
                    <p className="text-sm text-gray-400 text-center py-4">写真が添付されていません</p>
                  )}
                  {mediaIncomplete && (
                    <p className="text-sm text-amber-600 text-center py-2">
                      写真をアップロード中…（{images.length}/{post?.expectedMediaCount}）
                    </p>
                  )}
                  {images.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {images.map((img) => (
                        <div key={img.id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
                          <button
                            onClick={() => setSelectedMedia(img)}
                            className="w-full h-full focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            <img
                              src={img.thumbnailUrl ?? img.url}
                              alt={img.description ?? img.originalName}
                              className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                            />
                          </button>
                          {isOwner && (
                            <button
                              onClick={async () => {
                                try {
                                  await apiClient.deleteMedia(img.id)
                                  setMedia((prev) => prev.filter((m) => m.id !== img.id))
                                } catch {
                                  showToast('写真の削除に失敗しました')
                                }
                              }}
                              className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label="削除"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                          {isOwner && (
                            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-black/50 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => movePhoto(img, 'prev')}
                                disabled={mediaBusy === img.id || photoNeighbors.prev == null}
                                className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed"
                                title="前の投稿へ移動"
                                aria-label="前の投稿へ移動"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 12H5" />
                                </svg>
                              </button>
                              <button
                                onClick={() => rotatePhoto(img, 'ccw')}
                                disabled={mediaBusy === img.id}
                                className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed"
                                title="左に90°回転"
                                aria-label="左に90°回転"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h9a9 9 0 019 9" />
                                </svg>
                              </button>
                              <button
                                onClick={() => rotatePhoto(img, 'cw')}
                                disabled={mediaBusy === img.id}
                                className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed"
                                title="右に90°回転"
                                aria-label="右に90°回転"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6h-9a9 9 0 00-9 9" />
                                </svg>
                              </button>
                              <button
                                onClick={() => movePhoto(img, 'next')}
                                disabled={mediaBusy === img.id || photoNeighbors.next == null}
                                className="flex items-center justify-center w-7 h-7 rounded text-white hover:bg-white/20 disabled:opacity-25 disabled:cursor-not-allowed"
                                title="次の投稿へ移動"
                                aria-label="次の投稿へ移動"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 12h14" />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

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
                        {name !== '—' && (
                          <Link
                            href={`/identify/inat/${encodeURIComponent(name)}${japaneseName ? `?ja=${encodeURIComponent(japaneseName)}` : ''}`}
                            className="inline-block mt-1 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded transition-colors"
                          >
                            同種のサンプル表示
                          </Link>
                        )}
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
                                      <Link
                                        href={`/identify/inat/${encodeURIComponent(s.scientific_name)}?ja=${encodeURIComponent(s.japanese_name)}`}
                                        className="ml-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded transition-colors"
                                      >
                                        同種のサンプル表示
                                      </Link>
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

                          {details.agent_version && (
                            <p className="text-xs text-sky-400 text-right pt-1">
                              {details.agent_version}
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

              {aiError === 'ai_service_unavailable' ? (
                <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800 text-sm">
                  現在、AI同定機能を一時的にご利用いただけません。管理者へ通知しましたので、復旧までしばらくお待ちください。
                  <span className="block mt-1 text-amber-700">（クレジットは消費されていません）</span>
                </div>
              ) : aiError && (
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
                          <Link
                            href={`/identify/inat/${encodeURIComponent(aiResult.scientific_name)}${aiResult.japanese_name ? `?ja=${encodeURIComponent(aiResult.japanese_name)}` : ''}`}
                            className="inline-block mt-1 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded transition-colors"
                          >
                            同種のサンプル表示
                          </Link>
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

                  {aiResult.hint && (
                    <p className="text-xs text-gray-500">同定ヒント: <span className="text-gray-700 font-medium">{aiResult.hint}</span></p>
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
                              <Link
                                href={`/identify/inat/${encodeURIComponent(s.scientific_name)}?ja=${encodeURIComponent(s.japanese_name)}`}
                                className="ml-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded transition-colors"
                              >
                                同種のサンプル表示
                              </Link>
                              {s.how_to_distinguish && (
                                <span className="block text-gray-500 text-xs mt-0.5">{s.how_to_distinguish}</span>
                              )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {aiResult.candidate_evaluations && aiResult.candidate_evaluations.length > 0 && (
                    <div className="border-t border-emerald-200 pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">投稿で挙げた候補との照合</p>
                      <ul className="space-y-2">
                        {aiResult.candidate_evaluations.map((c, i) => {
                          const alreadySaved = identifiedSciNames.has(c.scientific_name)
                          return (
                            <li key={i} className="rounded-lg bg-white border border-emerald-100 p-2.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={c.matches ? 'text-emerald-600' : 'text-gray-400'}>{c.matches ? '◯' : '✕'}</span>
                                <span className="font-medium text-gray-800">{c.japanese_name}</span>
                                <span className="text-gray-400 text-xs">({c.scientific_name})</span>
                                <AiConfidenceBadge confidence={c.confidence} />
                                {c.score != null && (
                                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">スコア: {Math.round(c.score * 100)}%</span>
                                )}
                                <Link
                                  href={`/identify/inat/${encodeURIComponent(c.scientific_name)}?ja=${encodeURIComponent(c.japanese_name)}`}
                                  className="text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-1.5 py-0.5 rounded transition-colors"
                                >
                                  同種のサンプル表示
                                </Link>
                              </div>
                              {c.reason && <p className="text-xs text-gray-500 mt-1">{c.reason}</p>}
                              <div className="mt-1.5">
                                {alreadySaved ? (
                                  <span className="text-xs text-gray-400">登録済み</span>
                                ) : currentUser ? (
                                  <button
                                    onClick={() => handleSaveCandidate(c)}
                                    className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-white border border-emerald-500 text-emerald-600 hover:bg-emerald-50 transition-colors"
                                  >
                                    候補として保存
                                  </button>
                                ) : null}
                              </div>
                            </li>
                          )
                        })}
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

                  {aiResult.agent_version && (
                    <p className="text-xs text-sky-400 text-right pt-1">
                      {aiResult.agent_version}
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
                    await apiClient.updatePost(post.id, { userId: user.id, contents: pendingCaption, eventId: pendingEventId === '' ? null : pendingEventId, confirmedModeration: w })
                    await refreshPost()
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
