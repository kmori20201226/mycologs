import Link from 'next/link';

export default function IdentifyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              🍄 Identify Your Mushroom
            </h1>
            <p className="text-xl text-gray-600">
              Get help identifying mushrooms from our community of mycologists
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-semibold mb-6">How to Get Started</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold mb-4 text-emerald-700">📸 Step 1: Take Good Photos</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Include multiple angles (top, bottom, stem)</li>
                  <li>• Show the cap, gills, and stem clearly</li>
                  <li>• Include size reference (coin, ruler)</li>
                  <li>• Note the habitat and substrate</li>
                  <li>• Take close-up photos of key features</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 text-emerald-700">📝 Step 2: Create a Post</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• Describe where you found it</li>
                  <li>• Note the date and time</li>
                  <li>• Mention weather conditions</li>
                  <li>• Describe any notable features</li>
                  <li>• Ask specific identification questions</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 mb-8">
            <div className="flex items-start">
              <div className="text-2xl mr-4">⚠️</div>
              <div>
                <h3 className="font-semibold text-emerald-800 mb-2">Safety First!</h3>
                <p className="text-emerald-700">
                  Never consume wild mushrooms without expert verification. Some species can be deadly poisonous.
                  Always consult with experienced mycologists and use multiple reliable sources for identification.
                </p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/posts/new"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors inline-block"
            >
              Create Identification Post
            </Link>
          </div>

          <div className="mt-12 bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-semibold mb-6">Browse Existing Posts</h2>
            <p className="text-gray-600 mb-6">
              Help others identify their mushrooms or learn from community identifications.
            </p>
            <Link
              href="/posts"
              className="text-emerald-600 hover:text-emerald-700 font-semibold"
            >
              View All Posts →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}