import { User, Post, Identification, Vote, Species, Family, Genus, Shape } from '../../../packages/types/src';

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
  user: { id: number; name: string; email: string };
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

  // Taxonomy
  async getShapes(): Promise<Shape[]> {
    return this.request('/shapes');
  }

  async getFamilies(): Promise<Family[]> {
    return this.request('/families');
  }

  async getGenera(): Promise<Genus[]> {
    return this.request('/genera');
  }

  async getSpecies(): Promise<Species[]> {
    return this.request('/species');
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