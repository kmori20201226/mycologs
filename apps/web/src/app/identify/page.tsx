import Link from 'next/link';
import IdentifyButton from '@/components/IdentifyButton';

export default function IdentifyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">

          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-gray-900 mb-3">🍄 きのこを同定する</h1>
            <p className="text-lg text-gray-600">
              写真と詳細な情報をAIに提供することで、より正確な同定結果が得られます。
            </p>
          </div>

          {/* How to use */}
          <div className="bg-white rounded-xl shadow p-6 mb-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-5">使い方</h2>
            <div className="grid sm:grid-cols-3 gap-5">
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-bold text-lg flex items-center justify-center shrink-0">1</div>
                <p className="font-medium text-gray-800 text-sm">写真を投稿する</p>
                <p className="text-xs text-gray-500">きのこを複数の角度から撮影してアップロードします。傘・ひだ・軸・生育環境が写っているとより正確です。</p>
              </div>
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-bold text-lg flex items-center justify-center shrink-0">2</div>
                <p className="font-medium text-gray-800 text-sm">特徴をテキストで補足する</p>
                <p className="text-xs text-gray-500">においや触感・発見場所・近くの樹木など、写真では伝わりにくい情報を文章で書き添えるとAIの判断精度が上がります。</p>
              </div>
              <div className="flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 font-bold text-lg flex items-center justify-center shrink-0">3</div>
                <p className="font-medium text-gray-800 text-sm">AIが同定候補を提案する</p>
                <p className="text-xs text-gray-500">AIが写真とテキストを総合的に解析し、可能性の高い種を提案します。投稿後すぐに結果を確認できます。</p>
              </div>
            </div>
          </div>

          {/* Photo tips */}
          <div className="bg-white rounded-xl shadow p-6 mb-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <span>📸</span> 写真のポイント
            </h2>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>傘の上面・裏面（ひだ）・軸をそれぞれ別の写真で撮る</li>
              <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>軸の根元（地面との接合部）もできる限り写す</li>
              <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>コインや定規など大きさの目安になるものを一緒に写す</li>
              <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>生えている場所（土・倒木・樹木の根元など）を写す</li>
              <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>複数本生えている場合は群生の全体像も撮る</li>
            </ul>
          </div>

          {/* Text info tips */}
          <div className="bg-white rounded-xl shadow p-6 mb-5">
            <h2 className="text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
              <span>📝</span> テキスト情報で同定精度が上がります
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              写真だけでは判断しにくい特徴も、文章で補足することでAIがより正確に判断できます。
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">発見状況</p>
                <ul className="space-y-1.5 text-sm text-gray-600">
                  <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>発見場所（都道府県・山名・標高など）</li>
                  <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>発見日時・天候・気温</li>
                  <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>近くに生えていた樹木の種類</li>
                  <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>基質（土・腐朽木・生木・落ち葉など）</li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">きのこの特徴</p>
                <ul className="space-y-1.5 text-sm text-gray-600">
                  <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>においの特徴（土くさい・甘い・不快など）</li>
                  <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>傘や軸を割ったときの断面の色・変色</li>
                  <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>ひだの密度・色・軸への付き方</li>
                  <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>傘・軸の触感（ぬめり・乾燥・ビロードなど）</li>
                  <li className="flex gap-2"><span className="text-emerald-500 shrink-0">✓</span>おおよそのサイズ（傘の直径・軸の高さ）</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Retry tip */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-5 flex gap-3">
            <span className="text-xl shrink-0">💡</span>
            <div>
              <p className="font-semibold text-blue-800 mb-1">結果がおかしいと感じたら</p>
              <p className="text-sm text-blue-700">
                AIの同定結果が明らかに違うと思われる場合、テキストで補足情報を追記することで結果が改善することがあります。
                投稿のメモ欄に情報を加えて再度同定を実行することができます。
              </p>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8 flex gap-3">
            <span className="text-xl shrink-0">⚠️</span>
            <div>
              <p className="font-semibold text-amber-800 mb-1">安全第一</p>
              <p className="text-sm text-amber-700">
                AIによる同定は参考情報です。致命的な毒を持つ種もあるため、専門家による確認なしに野生のきのこを食べないでください。
              </p>
            </div>
          </div>

          <div className="text-center">
            <IdentifyButton
              href="/posts/new"
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-lg font-semibold text-lg transition-colors inline-block"
            >
              同定投稿を作成する
            </IdentifyButton>
          </div>

          <div className="mt-10 text-center">
            <Link href="/posts" className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
              みんなの投稿を見る →
            </Link>
          </div>

        </div>
      </div>
    </div>
  )
}
