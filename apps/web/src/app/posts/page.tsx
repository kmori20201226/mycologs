import { apiClient } from '@/lib/api';
import Link from 'next/link';

interface Post {
  id: number;
  contents: string;
  createdAt: string;
  user: { id: number; name: string; handleName: string | null };
}

async function getPosts(): Promise<Post[]> {
  try {
    return await apiClient.getPosts() as Post[];
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
          <h1 className="text-3xl font-bold text-gray-900">きのこ投稿</h1>
          <Link
            href="/posts/new"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
          >
            新規投稿
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/posts/${post.id}`}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow block"
            >
              <p className="text-gray-600 text-sm mb-2">
                {post.user.handleName ?? post.user.name} •{new Date(post.createdAt).toLocaleDateString('ja-JP')}
              </p>
              <p className="text-gray-900 line-clamp-3">{post.contents}</p>
              <p className="text-emerald-600 font-medium text-sm mt-4">詳細を見る →</p>
            </Link>
          ))}
        </div>

        {posts.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🍄</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">まだ投稿がありません</h3>
            <p className="text-gray-600 mb-6">最初のきのこ発見を投稿してみましょう！</p>
            <Link
              href="/posts/new"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              最初の投稿を作成
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
