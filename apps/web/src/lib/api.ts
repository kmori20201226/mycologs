import { User, Post, Identification, Vote, Species, Family, Genus, Shape } from '../../../packages/types/src';

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

export interface AiIdentification {
  scientific_name: string
  japanese_name: string
  confidence: 'high' | 'medium' | 'low'
  shape: string
  edibility: string
  key_features: (string | Record<string, string>)[]
  similar_species: (string | Record<string, string>)[]
  disclaimer: string
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
  name: string
  description: string | null
  startAt: string | null
  endAt: string | null
  createdAt: string
}

export interface AuthResponse {
  token: string;
  user: { id: number; name: string; email: string; role: import('@/lib/auth').UserLevelRole | null };
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

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
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...authHeader,
        ...options.headers,
      },
      ...options,
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${url} => ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Auth
  async register(data: { name: string; email: string; password: string }): Promise<AuthResponse> {
    return this.request('/auth/register', {
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

  // Users
  async getUsers(): Promise<User[]> {
    return this.request('/users');
  }

  async getUser(id: number): Promise<User> {
    return this.request(`/users/${id}`);
  }

  async createUser(data: { name: string; email: string }): Promise<User> {
    return this.request('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Posts
  async getPosts(): Promise<Post[]> {
    return this.request('/posts');
  }

  async getPost(id: number): Promise<Post> {
    return this.request(`/posts/${id}`);
  }

  async createPost(data: { userId: number; contents: string }): Promise<Post> {
    return this.request('/posts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Events
  async getEvents(clubId?: number): Promise<Event[]> {
    const qs = clubId ? `?clubId=${clubId}` : ''
    return this.request(`/events${qs}`)
  }

  async createEvent(data: { name: string; clubId?: number; description?: string; startAt?: string; endAt?: string }): Promise<Event> {
    return this.request('/events', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateEvent(id: number, data: { name?: string; description?: string; startAt?: string | null; endAt?: string | null }): Promise<Event> {
    return this.request(`/events/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
  }

  async deleteEvent(id: number): Promise<void> {
    return this.request(`/events/${id}`, { method: 'DELETE' })
  }

  // Clubs
  async getClubs(): Promise<{ id: number; name: string; createdAt: string }[]> {
    return this.request('/clubs')
  }

  async createClub(data: { name: string }): Promise<{ id: number; name: string }> {
    return this.request('/clubs', { method: 'POST', body: JSON.stringify(data) })
  }

  async updateClub(id: number, data: { name: string }): Promise<{ id: number; name: string }> {
    return this.request(`/clubs/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
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
  async aiIdentify(postId: number): Promise<AiIdentification> {
    return this.request(`/posts/${postId}/ai-identify`, { method: 'POST' })
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
      throw new Error(`Upload failed: ${file.name} => ${response.status} ${response.statusText}`)
    }
    return response.json()
  }

  // Identifications
  async getIdentifications(): Promise<Identification[]> {
    return this.request('/identifications');
  }

  async getPostIdentifications(postId: number): Promise<Identification[]> {
    return this.request(`/posts/${postId}/identifications`);
  }

  async createIdentification(data: {
    postId: number;
    userId: number;
    specieId: number;
  }): Promise<Identification> {
    return this.request('/identifications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Votes
  async getVotes(): Promise<Vote[]> {
    return this.request('/votes');
  }

  async getPostVotes(postId: number): Promise<Vote[]> {
    return this.request(`/posts/${postId}/votes`);
  }

  async createVote(data: {
    postId: number;
    userId: number;
    identificationId: number;
    probability: number;
  }): Promise<Vote> {
    return this.request('/votes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient();