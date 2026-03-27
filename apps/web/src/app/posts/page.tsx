import { apiClient } from '@/lib/api';
import Link from 'next/link';

interface Post {
  id: number;
  contents: string;
  createdAt: string;
  user: {
    id: number;
    name: string;
  };
}

async function getPosts(): Promise<Post[]> {
  try {
    return await apiClient.getPosts();
  } catch (error) {
    console.error('Failed to fetch posts:', error);
    return [];
  }
}

export default async function PostsPage() {
  const posts = await getPosts();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Mushroom Posts</h1>
          <Link
            href="/posts/new"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
          >
            New Post
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <div key={post.id} className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <p className="text-gray-600 text-sm mb-2">
                    By {post.user.name} • {new Date(post.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-gray-900 line-clamp-3">{post.contents}</p>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                <Link
                  href={`/posts/${post.id}`}
                  className="text-emerald-600 hover:text-emerald-700 font-medium text-sm"
                >
                  View Details →
                </Link>
                <Link
                  href={`/posts/${post.id}/identify`}
                  className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                >
                  Help Identify →
                </Link>
              </div>
            </div>
          ))}
        </div>

        {posts.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🍄</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No posts yet</h3>
            <p className="text-gray-600 mb-6">Be the first to share your mushroom discovery!</p>
            <Link
              href="/posts/new"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              Create First Post
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}