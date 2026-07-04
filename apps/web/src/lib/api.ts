export interface TaxShape {
  id: number
  name: string
  japaneseName: string | null
  createdAt: string
  updatedAt: string
}

export interface TaxFamily {
  id: number
  scientificName: string
  japaneseName: string | null
  shapeId: number
  shape?: { id: number; name: string; japaneseName: string | null }
  createdAt: string
  updatedAt: string
}

export interface TaxGenus {
  id: number
  scientificName: string
  japaneseName: string | null
  familyId: number
  family?: { id: number; scientificName: string; japaneseName: string | null }
  createdAt: string
  updatedAt: string
}

export type Edibility = 'EDIBLE' | 'INEDIBLE' | 'TOXIC' | 'DEADLY' | 'UNKNOWN'

export interface TaxSpecies {
  id: number
  scientificName: string
  japaneseName: string | null
  gbifTaxonKey: number | null
  edibility: Edibility | null
  genusId: number
  genus?: { id: number; scientificName: string; japaneseName: string | null }
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SimilarSpecies {
  japanese_name: string
  scientific_name: string
  how_to_distinguish: string
}

export interface CandidateEvaluation {
  japanese_name: string
  scientific_name: string
  matches: boolean
  confidence: 'high' | 'medium' | 'low'
  score: number
  reason?: string
}

export interface AiIdentification {
  scientific_name: string
  japanese_name: string
  dialect_names: string[]
  confidence: 'high' | 'medium' | 'low'
  score: number
  shape: string
  edibility: string
  key_features: string[]
  similar_species: SimilarSpecies[]
  missing_info?: string[]
  candidate_evaluations?: CandidateEvaluation[]
  disclaimer: string
  agent_version?: string
  hint?: string | null
}

export interface MediaItem {
  id: string
  url: string
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT'
  mimeType: string
  originalName: string
  description: string | null
  thumbnailUrl: string | null
  width: number | null
  height: number | null
  size: number
  tags: string[]
  createdAt: string
}

export interface Event {
  id: number
  clubId: number | null
  userId: number | null
  name: string
  description: string | null
  place: string | null
  publicPlace: string | null
  longitude: number | null
  latitude: number | null
  startAt: string | null
  endAt: string | null
  bannerImage: string | null
  retrospective: string | null
  createdAt: string
}

export interface UserRequestItem {
  id: number
  requesterId: number
  clubId: number | null
  request: { requestType: string; message: string } | null
  reply: Record<string, unknown> | null
  replierId: number | null
  accepted: boolean | null
  createdAt: string
  repliedAt: string | null
  requester: { id: number; name: string; email: string }
  club: { id: number; name: string; introduction: string | null; policy: string | null } | null
  replier: { id: number; name: string } | null
}

export interface AuthResponse {
  token: string;
  user: { id: number; name: string; email: string; role: import('@/lib/auth').UserLevelRole | null };
}

const API_BASE_URL = (typeof window === 'undefined'
  ? process.env.INTERNAL_API_URL
  : process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:3000';

class ApiClient {
  private baseURL: string;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
  }

  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;

    // Auto-attach JWT from cookie if present
    let authHeader: Record<string, string> = {}
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|; )token=([^;]*)/)
      if (match) authHeader = { Authorization: `Bearer ${decodeURIComponent(match[1])}` }
    }

    const response = await fetch(url, {
      cache: 'no-store',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeader,
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      let apiMessage: string | undefined
      try { apiMessage = (await response.json()).message } catch { /* ignore */ }
      const err: any = new Error(apiMessage ?? `API request failed: ${url} => ${response.status} ${response.statusText}`)
      err.status = response.status
      err.apiMessage = apiMessage
      throw err
    }

    return response.json();
  }

  // Auth
  async register(data: { name: string; email: string; password: string }): Promise<{ message: string; email: string }> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async verifyEmail(data: { email: string; code: string }): Promise<AuthResponse> {
    return this.request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async resendVerification(data: { email: string }): Promise<{ message: string }> {
    return this.request('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async forgotPassword(data: { email: string }): Promise<{ message: string }> {
    return this.request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async resetPassword(data: { email: string; code: string; newPassword: string }): Promise<{ message: string }> {
    return this.request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async login(data: { email: string; password: string }): Promise<AuthResponse> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async changePassword(data: { currentPassword: string; newPassword: string }): Promise<{ message: string }> {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Users
  async getUsers(): Promise<unknown[]> {
    return this.request('/users');
  }

  async getUser(id: number): Promise<unknown> {
    return this.request(`/users/${id}`);
  }

  async createUser(data: { name: string; email: string }): Promise<unknown> {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getUserProfile(id: number): Promise<{
    id: number; name: string; handleName: string | null; email: string; createdAt: string;
    postCount: number; identificationCount: number; replyCount: number;
    recentPosts: { id: number; contents: string; createdAt: string; event: { id: number; name: string } | null; _count: { media: number; identifications: number } }[]
  }> {
    return this.request(`/users/${id}/profile`)
  }

  async updateUserHandleName(id: number, handleName: string): Promise<{ id: number; handleName: string | null }> {
    return this.request(`/users/${id}/handle-name`, {
      method: 'PATCH',
      body: JSON.stringify({ handleName }),
    })
  }

  async submitWithdrawRequest(requesterId: number): Promise<UserRequestItem> {
    return this.request('/user-requests', {
      method: 'POST',
      body: JSON.stringify({ requesterId, request: { requestType: 'Withdraw', message: '' } }),
    })
  }

  async processWithdrawal(userId: number): Promise<{ id: number; deletedAt: string }> {
    return this.request(`/admin/users/${userId}/withdraw`, { method: 'POST' })
  }

  // Posts
  async getPosts(filter?: {
    eventId?: number
    visibility?: string
    takenFrom?: string
    takenTo?: string
  }): Promise<unknown[]> {
    const params = new URLSearchParams()
    if (filter?.eventId) params.set('eventId', String(filter.eventId))
    if (filter?.visibility) params.set('visibility', filter.visibility)
    if (filter?.takenFrom) params.set('takenFrom', filter.takenFrom)
    if (filter?.takenTo) params.set('takenTo', filter.takenTo)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return this.request(`/posts${qs}`)
  }

  // Events that have posts the viewer can see — populates the browse filter.
  async getPostFilterEvents(): Promise<{ id: number; name: string }[]> {
    return this.request('/posts/filter-events') as Promise<{ id: number; name: string }[]>
  }

  async getPost(id: number): Promise<unknown> {
    return this.request(`/posts/${id}`);
  }

  async createPost(data: {
    userId: number
    contents: string
    eventId?: number
    visibility?: 'PUBLIC' | 'CLUBMEMBERONLY' | 'PRIVATE'
    clubIds?: number[]
    expectedMediaCount?: number
    longitude?: number | null
    latitude?: number | null
    takenAt?: string | null
    confirmedModeration?: { category: string; comment: string }
  }): Promise<
    | { ok: true; id: number }
    | { ok: false; status: 'rejected'; comment: string }
    | { ok: false; status: 'warning'; category: string; comment: string }
    | { ok: false; status: 'unavailable'; message: string }
  > {
    const url = `${this.baseURL}/posts`
    let authHeader: Record<string, string> = {}
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|; )token=([^;]*)/)
      if (match) authHeader = { Authorization: `Bearer ${decodeURIComponent(match[1])}` }
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(data),
    })
    if (response.status === 422) {
      const body = await response.json()
      return { ok: false, ...body }
    }
    if (response.status === 503) {
      const body = await response.json()
      return { ok: false, status: 'unavailable', message: body.message }
    }
    if (!response.ok) {
      throw new Error(`API request failed: ${url} => ${response.status} ${response.statusText}`)
    }
    const post = await response.json()
    return { ok: true, id: post.id }
  }

  async updatePost(id: number, data: {
    userId: number
    contents?: string
    eventId?: number | null
    visibility?: 'PUBLIC' | 'CLUBMEMBERONLY' | 'PRIVATE'
    clubIds?: number[]
    expectedMediaCount?: number
    confirmedModeration?: { category: string; comment: string }
  }): Promise<
    | { ok: true }
    | { ok: false; status: 'rejected'; comment: string }
    | { ok: false; status: 'warning'; category: string; comment: string }
    | { ok: false; status: 'unavailable'; message: string }
  > {
    const url = `${this.baseURL}/posts/${id}`
    let authHeader: Record<string, string> = {}
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|; )token=([^;]*)/)
      if (match) authHeader = { Authorization: `Bearer ${decodeURIComponent(match[1])}` }
    }
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(data),
    })
    if (response.status === 422) {
      const body = await response.json()
      return { ok: false, ...body }
    }
    if (response.status === 503) {
      const body = await response.json()
      return { ok: false, status: 'unavailable', message: body.message }
    }
    if (!response.ok) {
      throw new Error(`API request failed: ${url} => ${response.status} ${response.statusText}`)
    }
    return { ok: true }
  }

  async deletePost(id: number): Promise<void> {
    return this.request(`/posts/${id}`, { method: 'DELETE' })
  }

  // Events
  async getEvents(filter?: { clubId?: number; userId?: number }): Promise<Event[]> {
    const params = new URLSearchParams()
    if (filter?.clubId) params.set('clubId', String(filter.clubId))
    if (filter?.userId) params.set('userId', String(filter.userId))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return this.request(`/events${qs}`)
  }

  async createEvent(data: { name: string; clubId?: number; userId?: number; description?: string; startAt?: string; endAt?: string }): Promise<Event> {
    return this.request('/events', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateEvent(id: number, data: { name?: string; description?: string; place?: string | null; publicPlace?: string | null; longitude?: number | null; latitude?: number | null; startAt?: string | null; endAt?: string | null; retrospective?: string | null }): Promise<Event> {
    return this.request(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async geocodePlace(place: string): Promise<{ candidates: Array<{ name: string; longitude: number; latitude: number }> }> {
    return this.request('/ai/geocode', { method: 'POST', body: JSON.stringify({ place }) })
  }

  async deleteEvent(id: number): Promise<void> {
    return this.request(`/events/${id}`, { method: 'DELETE' })
  }

  async uploadEventBanner(id: number, file: File): Promise<{ bannerImage: string | null }> {
    const url = `${this.baseURL}/events/${id}/banner`
    let authHeader: Record<string, string> = {}
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|; )token=([^;]*)/)
      if (match) authHeader = { Authorization: `Bearer ${decodeURIComponent(match[1])}` }
    }
    const form = new FormData()
    form.append('file', file)
    const response = await fetch(url, { method: 'POST', headers: authHeader, body: form })
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
    return response.json()
  }

  async deleteEventBanner(id: number): Promise<void> {
    return this.request(`/events/${id}/banner`, { method: 'DELETE' })
  }

  // Clubs
  async getClubs(filter?: { managerId?: number }): Promise<{ id: number; name: string; introduction: string | null; policy: string | null; createdAt: string }[]> {
    const params = new URLSearchParams()
    if (filter?.managerId) params.set('managerId', String(filter.managerId))
    const qs = params.toString() ? `?${params.toString()}` : ''
    return this.request(`/clubs${qs}`)
  }

  async createClub(data: { name: string }): Promise<{ id: number; name: string }> {
    return this.request('/clubs', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateClub(id: number, data: { name?: string; introduction?: string | null; policy?: string | null }): Promise<{ id: number; name: string }> {
    return this.request(`/clubs/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async getClubCredit(id: number): Promise<{ clubId: number; credit: number }> {
    return this.request(`/clubs/${id}/credit`)
  }

  async deleteClub(id: number): Promise<void> {
    return this.request(`/clubs/${id}`, { method: 'DELETE' })
  }

  async getClubMembers(clubId: number): Promise<{ id: number; user: { id: number; name: string; email: string }; role: { id: number; name: string } }[]> {
    return this.request(`/clubs/${clubId}/members`)
  }

  async addClubMember(clubId: number, data: { userId: number; roleName: string }): Promise<void> {
    return this.request(`/clubs/${clubId}/members`, { method: 'POST', body: JSON.stringify(data) })
  }

  async removeClubMember(clubId: number, userId: number): Promise<void> {
    return this.request(`/clubs/${clubId}/members/${userId}`, { method: 'DELETE' })
  }

  async updateClubMemberRole(clubId: number, userId: number, roleName: string): Promise<void> {
    return this.request(`/clubs/${clubId}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ roleName }),
    })
  }

  // Taxonomy — read
  async getShapes(): Promise<TaxShape[]> { return this.request('/shapes') }
  async getFamilies(): Promise<TaxFamily[]> { return this.request('/families') }
  async getGenera(): Promise<TaxGenus[]> { return this.request('/genera') }
  async getSpecies(): Promise<TaxSpecies[]> { return this.request('/species') }

  // Taxonomy — write
  async createShape(data: { name: string; japaneseName?: string | null }): Promise<TaxShape> {
    return this.request('/shapes', { method: 'POST', body: JSON.stringify(data) })
  }
  async updateShape(id: number, data: { name?: string; japaneseName?: string | null }): Promise<TaxShape> {
    return this.request(`/shapes/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  async deleteShape(id: number): Promise<void> {
    return this.request(`/shapes/${id}`, { method: 'DELETE' })
  }

  async createFamily(data: { scientificName: string; japaneseName?: string | null; shapeId: number }): Promise<TaxFamily> {
    return this.request('/families', { method: 'POST', body: JSON.stringify(data) })
  }
  async updateFamily(id: number, data: { scientificName?: string; japaneseName?: string | null; shapeId?: number }): Promise<TaxFamily> {
    return this.request(`/families/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  async deleteFamily(id: number): Promise<void> {
    return this.request(`/families/${id}`, { method: 'DELETE' })
  }

  async createGenus(data: { scientificName: string; japaneseName?: string | null; familyId: number }): Promise<TaxGenus> {
    return this.request('/genera', { method: 'POST', body: JSON.stringify(data) })
  }
  async updateGenus(id: number, data: { scientificName?: string; japaneseName?: string | null; familyId?: number }): Promise<TaxGenus> {
    return this.request(`/genera/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  async deleteGenus(id: number): Promise<void> {
    return this.request(`/genera/${id}`, { method: 'DELETE' })
  }

  async createSpecies(data: { scientificName: string; japaneseName?: string | null; gbifTaxonKey?: number | null; edibility?: Edibility | null; genusId: number }): Promise<TaxSpecies> {
    return this.request('/species', { method: 'POST', body: JSON.stringify(data) })
  }
  async updateSpecies(id: number, data: { scientificName?: string; japaneseName?: string | null; gbifTaxonKey?: number | null; edibility?: Edibility | null; genusId?: number; deletedAt?: string | null }): Promise<TaxSpecies> {
    return this.request(`/species/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }
  async deleteSpecies(id: number): Promise<void> {
    return this.request(`/species/${id}`, { method: 'DELETE' })
  }

  // AI identification
  async aiIdentify(
    postId: number,
    hint?: string,
    userId?: number,
    candidates?: { japanese_name: string; scientific_name: string }[],
  ): Promise<AiIdentification> {
    const body: Record<string, unknown> = {}
    if (hint)   body.hint   = hint
    if (userId) body.userId = userId
    if (candidates && candidates.length) body.candidates = candidates
    return this.request(`/posts/${postId}/ai-identify`, {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  // Media
  async getPostMedia(postId: number): Promise<MediaItem[]> {
    return this.request(`/posts/${postId}/media`)
  }

  async uploadPostMedia(postId: number, file: File): Promise<MediaItem> {
    const url = `${this.baseURL}/posts/${postId}/media/upload`
    let authHeader: Record<string, string> = {}
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|; )token=([^;]*)/)
      if (match) authHeader = { Authorization: `Bearer ${decodeURIComponent(match[1])}` }
    }
    const body = new FormData()
    body.append('file', file)
    const response = await fetch(url, { method: 'POST', headers: authHeader, body })
    if (!response.ok) {
      const err: any = new Error(`Upload failed: ${file.name} => ${response.status}`)
      err.status = response.status
      throw err
    }
    return response.json()
  }

  async deleteMedia(id: string): Promise<void> {
    await this.request(`/media/${id}`, { method: 'DELETE' })
  }

  async rotateMedia(id: string, direction: 'cw' | 'ccw'): Promise<MediaItem> {
    return this.request(`/media/${id}/rotate`, { method: 'POST', body: JSON.stringify({ direction }) })
  }

  async moveMedia(id: string, direction: 'prev' | 'next'): Promise<{ postId: number }> {
    return this.request(`/media/${id}/move`, { method: 'POST', body: JSON.stringify({ direction }) })
  }

  async getPhotoNeighbors(postId: number): Promise<{ prev: number | null; next: number | null }> {
    return this.request(`/posts/${postId}/photo-neighbors`)
  }

  // Identifications
  async getIdentifications(): Promise<unknown[]> {
    return this.request('/identifications');
  }

  async getPostIdentifications(postId: number): Promise<unknown[]> {
    return this.request(`/posts/${postId}/identifications`);
  }

  async createIdentification(data: {
    postId: number;
    userId: number;
    specieId?: number;
    identificationHint?: string | null;
    score?: number | null;
    description?: Record<string, unknown>;
  }): Promise<unknown> {
    return this.request('/identifications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async acceptIdentification(id: number): Promise<void> {
    return this.request(`/identifications/${id}/accept`, { method: 'POST' })
  }

  async deleteIdentification(id: number): Promise<void> {
    return this.request(`/identifications/${id}`, { method: 'DELETE' })
  }

  // Votes
  async getVotes(): Promise<unknown[]> {
    return this.request('/votes');
  }

  async getPostVotes(postId: number): Promise<unknown[]> {
    return this.request(`/posts/${postId}/votes`);
  }

  async createVote(data: {
    postId: number;
    userId: number;
    identificationId: number;
    probability: number;
  }): Promise<unknown> {
    return this.request('/votes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // User Requests
  async getUserRequests(filter?: { requesterId?: number; clubId?: number; pending?: boolean; requestType?: string }): Promise<UserRequestItem[]> {
    const params = new URLSearchParams()
    if (filter?.requesterId) params.set('requesterId', String(filter.requesterId))
    if (filter?.clubId) params.set('clubId', String(filter.clubId))
    if (filter?.pending) params.set('pending', 'true')
    if (filter?.requestType) params.set('requestType', filter.requestType)
    const qs = params.toString() ? `?${params.toString()}` : ''
    return this.request(`/user-requests${qs}`)
  }

  async requestStartClub(data: { name: string; introduction?: string; policy?: string; message?: string }): Promise<UserRequestItem> {
    return this.request('/clubs/request-start', { method: 'POST', body: JSON.stringify(data) })
  }

  async createUserRequest(data: { requesterId: number; clubId: number; request: Record<string, unknown> }): Promise<UserRequestItem> {
    return this.request('/user-requests', { method: 'POST', body: JSON.stringify(data) })
  }

  async acceptUserRequest(id: number, data: { replierId: number; reply?: Record<string, unknown> | null }): Promise<UserRequestItem> {
    return this.request(`/user-requests/${id}/accept`, { method: 'POST', body: JSON.stringify(data) })
  }

  async declineUserRequest(id: number, data: { replierId: number; reply?: Record<string, unknown> | null }): Promise<UserRequestItem> {
    return this.request(`/user-requests/${id}/decline`, { method: 'POST', body: JSON.stringify(data) })
  }

  async deleteUserRequest(id: number): Promise<void> {
    return this.request(`/user-requests/${id}`, { method: 'DELETE' })
  }

  // Followups (comments)
  async getPostFollowups(postId: number): Promise<{ id: number; contents: string; createdAt: string; user: { id: number; name: string; handleName: string | null } }[]> {
    return this.request(`/posts/${postId}/followups`)
  }

  async createFollowup(data: { parentPostId: number; userId: number; contents: string }): Promise<{ id: number; contents: string; createdAt: string; user: { id: number; name: string; handleName: string | null } }> {
    return this.request('/followups', { method: 'POST', body: JSON.stringify(data) })
  }

  async deleteFollowup(id: number): Promise<void> {
    return this.request(`/followups/${id}`, { method: 'DELETE' })
  }

  async createCheckoutSession(data: { planId: string; userId?: number; clubId?: number }): Promise<{ url: string }> {
    return this.request('/subscriptions/checkout', { method: 'POST', body: JSON.stringify(data) })
  }

  async openBillingPortal(data: { userId?: number; clubId?: number }): Promise<{ url: string }> {
    return this.request('/subscriptions/portal', { method: 'POST', body: JSON.stringify(data) })
  }

  async getActiveSubscription(userId: number): Promise<{ active: boolean }> {
    return this.request(`/users/${userId}/subscription/active`)
  }

  async getClubActiveSubscription(clubId: number): Promise<{ active: boolean }> {
    return this.request(`/clubs/${clubId}/subscription/active`)
  }

  // Admin threads
  async getAdminThreads(): Promise<AdminThread[]> {
    return this.request('/admin-threads')
  }

  async getAdminThread(id: number): Promise<AdminThread> {
    return this.request(`/admin-threads/${id}`)
  }

  async createAdminThread(data: { subject: string; body: string }): Promise<AdminThread> {
    return this.request('/admin-threads', { method: 'POST', body: JSON.stringify(data) })
  }

  async replyAdminThread(id: number, body: string): Promise<AdminThread> {
    return this.request(`/admin-threads/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) })
  }

  async closeAdminThread(id: number): Promise<AdminThread> {
    return this.request(`/admin-threads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'CLOSED' }) })
  }

  async openAdminThread(id: number): Promise<AdminThread> {
    return this.request(`/admin-threads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'OPEN' }) })
  }

  async getAdminUnreadCount(): Promise<number> {
    const res = await this.request<{ count: number }>('/admin-threads/unread-count')
    return res.count
  }

  async getMyUnreadThreadCount(): Promise<number> {
    const res = await this.request<{ count: number }>('/admin-threads/my-unread-count')
    return res.count
  }

  async getAnnouncements(params?: { site?: boolean; clubId?: number }): Promise<Announcement[]> {
    const q = new URLSearchParams()
    if (params?.site)             q.set('site', 'true')
    if (params?.clubId != null)   q.set('clubId', String(params.clubId))
    const qs = q.toString() ? `?${q}` : ''
    return this.request(`/announcements${qs}`)
  }

  async createAnnouncement(data: { body: string; clubId?: number | null }): Promise<Announcement> {
    return this.request('/announcements', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateAnnouncement(id: number, data: { body?: string; active?: boolean }): Promise<Announcement> {
    return this.request(`/announcements/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async deleteAnnouncement(id: number): Promise<void> {
    await this.request(`/announcements/${id}`, { method: 'DELETE' })
  }

  async getPlans(): Promise<Plan[]> {
    return this.request('/plans')
  }

  async getClubMemberLimit(clubId: number): Promise<{ planId: string; planName: string; maxMembers: number }> {
    return this.request(`/clubs/${clubId}/member-limit`)
  }

  async createPlan(data: Omit<Plan, 'createdAt' | 'updatedAt'>): Promise<Plan> {
    return this.request('/plans', { method: 'POST', body: JSON.stringify(data) })
  }

  async updatePlan(id: string, data: Partial<Omit<Plan, 'createdAt' | 'updatedAt'>>): Promise<Plan> {
    return this.request(`/plans/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async deletePlan(id: string): Promise<void> {
    await this.request(`/plans/${id}`, { method: 'DELETE' })
  }

  async syncPlanFromStripe(id: string): Promise<{ name: string; priceYen: number }> {
    return this.request(`/plans/${encodeURIComponent(id)}/stripe-sync`)
  }

  async getSiteSettings(): Promise<{ maintenanceMode: boolean; adminEmail1: string; adminEmail2: string; adminEmail3: string }> {
    return this.request('/settings/site')
  }

  async updateSiteSettings(data: { maintenanceMode?: boolean; adminEmail1?: string; adminEmail2?: string; adminEmail3?: string }): Promise<{ maintenanceMode: boolean; adminEmail1: string; adminEmail2: string; adminEmail3: string }> {
    return this.request('/settings/site', { method: 'PUT', body: JSON.stringify(data) })
  }
}

export interface Plan {
  id: string
  name: string
  maxMembers: number
  priceYen: number
  creditsPerPeriod: number
  active: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Announcement {
  id: number
  body: string
  authorId: number
  clubId: number | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface AdminMessage {
  id: number
  threadId: number
  senderId: number
  body: string
  readAt: string | null
  createdAt: string
  sender: { id: number; name: string; role: string | null }
}

export interface AdminThread {
  id: number
  userId: number
  subject: string
  status: 'OPEN' | 'CLOSED'
  createdAt: string
  updatedAt: string
  user: { id: number; name: string }
  messages: AdminMessage[]
}

export const apiClient = new ApiClient();