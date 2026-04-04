import Link from 'next/link';

export default function IdentifyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              🍄 きのこを同定する
            </h1>
            <p className="text-xl text-gray-600">
              きのこ愛好家のコミュニティに同定を依頼しましょう
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8 mb-8">
            <h2 className="text-2xl font-semibold mb-6">はじめ方</h2>

            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold mb-4 text-emerald-700">📸 ステップ1: 良い写真を撮る</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• 複数の角度から撮影する（上面・裏面・軸）</li>
                  <li>• 傘・ひだ・軸をはっきり写す</li>
                  <li>• サイズの目安を入れる（コイン・定規）</li>
                  <li>• 生育環境や基質を記録する</li>
                  <li>• 重要な特徴のアップ写真を撮る</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-4 text-emerald-700">📝 ステップ2: 投稿を作成する</h3>
                <ul className="space-y-2 text-gray-600">
                  <li>• 見つけた場所を記述する</li>
                  <li>• 日時を記録する</li>
                  <li>• 天候を記載する</li>
                  <li>• 気になる特徴を説明する</li>
                  <li>• 具体的な同定の質問を書く</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-6 mb-8">
            <div className="flex items-start">
              <div className="text-2xl mr-4">⚠️</div>
              <div>
                <h3 className="font-semibold text-emerald-800 mb-2">安全第一！</h3>
                <p className="text-emerald-700">
                  専門家による確認なしに野生のきのこを食べないでください。致命的な毒を持つ種もあります。
                  同定には必ず経験豊富な菌類学者に相談し、複数の信頼できる情報源を参照してください。
                </p>
              </div>
            </div>
          </div>

          <div className="text-center">
            <Link
              href="/posts/new"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-colors inline-block"
            >
              同定投稿を作成
            </Link>
          </div>

          <div className="mt-12 bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-semibold mb-6">既存の投稿を見る</h2>
            <p className="text-gray-600 mb-6">
              他の人のきのこ同定を手伝ったり、コミュニティの同定から学びましょう。
            </p>
            <Link
              href="/posts"
              className="text-emerald-600 hover:text-emerald-700 font-semibold"
            >
              すべての投稿を見る →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
