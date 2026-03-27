import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-gray-900 mb-6">
            🍄 Mycologs
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            The ultimate platform for mushroom identification and mycological discovery.
            Connect with fellow foragers, share your finds, and learn from the community.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/posts"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Explore Posts
            </Link>
            <Link
              href="/identify"
              className="bg-white hover:bg-gray-50 text-emerald-600 border-2 border-emerald-600 px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              Identify Mushroom
            </Link>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="bg-white p-8 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold mb-3">Expert Identification</h3>
            <p className="text-gray-600">
              Get help identifying mushrooms from our community of experienced mycologists.
              Share photos and get accurate species identification.
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">🌲</div>
            <h3 className="text-xl font-semibold mb-3">Field Guide</h3>
            <p className="text-gray-600">
              Browse our comprehensive database of mushroom species, organized by
              shape, family, genus, and species for easy navigation.
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-xl font-semibold mb-3">Community Driven</h3>
            <p className="text-gray-600">
              Join clubs, participate in discussions, and contribute to the collective
              knowledge of mycology through voting and peer review.
            </p>
          </div>
        </div>

        <div className="text-center mt-16">
          <div className="bg-white p-8 rounded-xl shadow-lg max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">How It Works</h2>
            <div className="grid md:grid-cols-4 gap-6 text-center">
              <div>
                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📸</span>
                </div>
                <h4 className="font-semibold mb-2">Take Photo</h4>
                <p className="text-sm text-gray-600">Capture clear photos of your mushroom find</p>
              </div>
              <div>
                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📝</span>
                </div>
                <h4 className="font-semibold mb-2">Create Post</h4>
                <p className="text-sm text-gray-600">Share your discovery with the community</p>
              </div>
              <div>
                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🧠</span>
                </div>
                <h4 className="font-semibold mb-2">Get Help</h4>
                <p className="text-sm text-gray-600">Receive identification suggestions</p>
              </div>
              <div>
                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">✅</span>
                </div>
                <h4 className="font-semibold mb-2">Learn</h4>
                <p className="text-sm text-gray-600">Build your mycological knowledge</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
