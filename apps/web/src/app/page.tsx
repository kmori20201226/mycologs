import Link from "next/link";
import ClubEventsButton from "@/components/ClubEventsButton";
import MyEventsButton from "@/components/MyEventsButton";
import AnnouncementBanner from "@/components/AnnouncementBanner";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="container mx-auto px-4 py-16">
        <AnnouncementBanner />
        <div className="text-center mb-16">
          <h1 className="text-6xl font-bold text-gray-900 mb-6">
            🍄 Mycologs
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            きのこ同定と菌類探索のための究極のプラットフォーム。
            採集仲間とつながり、発見をシェアして、コミュニティから学びましょう。
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/posts"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              投稿を見る
            </Link>
            <Link
              href="/identify"
              className="bg-white hover:bg-gray-50 text-emerald-600 border-2 border-emerald-600 px-8 py-3 rounded-lg font-semibold transition-colors"
            >
              きのこを同定する
            </Link>
            <MyEventsButton />
            <ClubEventsButton />
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="bg-white p-8 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-3">AIによる同定</h3>
            <p className="text-gray-600">
              最新のAI技術がきのこの写真を解析し、種の同定候補を素早く提案します。
              撮影した写真をアップロードするだけで、手軽に同定結果を得られます。
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">🌲</div>
            <h3 className="text-xl font-semibold mb-3">フィールドガイド</h3>
            <p className="text-gray-600">
              形状・科・属・種で整理された、きのこの種データベースを閲覧できます。
              簡単なナビゲーションで目的の種を見つけられます。
            </p>
          </div>

          <div className="bg-white p-8 rounded-xl shadow-lg">
            <div className="text-4xl mb-4">👥</div>
            <h3 className="text-xl font-semibold mb-3">コミュニティ主導</h3>
            <p className="text-gray-600">
              クラブに参加し、議論に加わり、投票やピアレビューを通じて
              菌類学の知識を広めましょう。
            </p>
          </div>
        </div>

        <div className="text-center mt-16">
          <div className="bg-white p-8 rounded-xl shadow-lg max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-6">使い方</h2>
            <div className="grid md:grid-cols-4 gap-6 text-center">
              <div>
                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📸</span>
                </div>
                <h4 className="font-semibold mb-2">写真を撮る</h4>
                <p className="text-sm text-gray-600">見つけたきのこの写真を鮮明に撮影する</p>
              </div>
              <div>
                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">📝</span>
                </div>
                <h4 className="font-semibold mb-2">投稿する</h4>
                <p className="text-sm text-gray-600">発見をコミュニティにシェアする</p>
              </div>
              <div>
                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🧠</span>
                </div>
                <h4 className="font-semibold mb-2">同定する</h4>
                <p className="text-sm text-gray-600">AIが種の同定候補を提案する</p>
              </div>
              <div>
                <div className="bg-emerald-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">✅</span>
                </div>
                <h4 className="font-semibold mb-2">学ぶ</h4>
                <p className="text-sm text-gray-600">菌類学の知識を深める</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
