export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="bg-white rounded-2xl shadow p-8 space-y-8">

          <div>
            <h1 className="text-2xl font-bold text-gray-900">プライバシーポリシー</h1>
            <p className="text-sm text-gray-400 mt-1">最終更新日：2026年5月10日</p>
          </div>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-800">1. 収集する情報</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              Mycologs（以下「本サービス」）は、アカウント登録時にお名前・メールアドレス・パスワードを収集します。LINE ログインをご利用の場合は、LINE プラットフォームから提供されるユーザー識別情報・表示名を取得します。また、投稿された写真・位置情報・同定情報など、ユーザーが本サービスに入力したコンテンツを保存します。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-800">2. 利用目的</h2>
            <p className="text-sm text-gray-600 leading-relaxed">収集した情報は以下の目的で利用します。</p>
            <ul className="text-sm text-gray-600 space-y-1 pl-4">
              <li>• アカウントの作成・認証・管理</li>
              <li>• きのこ同定・投稿・コメント機能の提供</li>
              <li>• クラブ・イベント機能の提供</li>
              <li>• サブスクリプション決済の処理</li>
              <li>• サービスの改善・不正利用の防止</li>
              <li>• 重要なお知らせのメール送信</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-800">3. 第三者への提供</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              本サービスは、以下の場合を除き、収集した個人情報を第三者に提供しません。
            </p>
            <ul className="text-sm text-gray-600 space-y-1 pl-4">
              <li>• ユーザー本人の同意がある場合</li>
              <li>• 法令に基づく開示が必要な場合</li>
              <li>• 決済処理のため Stripe Inc. にサブスクリプション情報を提供する場合</li>
              <li>• メール送信のため Resend にメールアドレスを提供する場合</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-800">4. 情報の管理</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              収集した情報は適切なセキュリティ対策を講じたサーバーで管理します。パスワードはハッシュ化して保存し、平文では保持しません。アカウントを削除した場合、個人を特定できる情報は速やかに削除します。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-800">5. Cookie・ローカルストレージ</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              本サービスはログイン状態の維持のためにブラウザのローカルストレージに認証情報を保存します。これはサービスの基本機能に必要なものであり、広告目的には使用しません。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-800">6. ポリシーの変更</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              本ポリシーは必要に応じて改定することがあります。重要な変更がある場合はサービス内でお知らせします。変更後も本サービスをご利用いただいた場合、改定後のポリシーに同意いただいたものとみなします。
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-gray-800">7. お問い合わせ</h2>
            <p className="text-sm text-gray-600 leading-relaxed">
              個人情報の取り扱いに関するご質問・ご要望は、アバウトページのお問い合わせフォームよりご連絡ください。
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
