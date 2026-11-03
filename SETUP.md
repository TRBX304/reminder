# Firebase同期のセットアップ手順

`YOUR_PROJECT_ID` などは自分のプロジェクトの値に置き換えてください。

## 1. Firebaseプロジェクトを作る
1. https://console.firebase.google.com/ で「プロジェクトを作成」（Googleアナリティクスはオフでよい）
2. プランは **Spark（無料）のまま**。クレジットカード登録は不要

## 2. ウェブアプリを登録して設定値をコピー
1. プロジェクトの概要 → 「</>」（ウェブ）→ アプリ名を入れて登録（Firebase Hostingのチェックは不要）
2. 表示された `firebaseConfig` の値を **firebase-config.js** の `YOUR_...` に貼り付け
3. **functions/__/[[path]].js** の `YOUR_PROJECT_ID` も同じプロジェクトIDに書き換え

## 3. Googleログインを有効にする
1. Authentication → Sign-in method → 「Google」を有効にする
2. Authentication → 設定 → 承認済みドメイン に `reminder-8b5.pages.dev` を追加

## 4. Firestoreを作る
1. Firestore Database → データベースを作成
   - ロケーション: `asia-northeast1`（東京）
   - **本番環境モード**で開始（テストモードは誰でも読み書きできてしまうので使わない）
2. 「ルール」タブに **firestore.rules** の中身を貼り付けて「公開」

## 5. ログイン後の戻り先を登録する（スマホ用）
1. https://console.cloud.google.com/ で同じプロジェクトを選ぶ
2. APIとサービス → 認証情報 → OAuth 2.0 クライアントID の
   「Web client (auto created by Google Service)」を開く
3. 承認済みのリダイレクトURI に次を追加して保存
   `https://reminder-8b5.pages.dev/__/auth/handler`
   （反映まで数分かかることがあります）

## 6. デプロイ
- `functions/` フォルダも一緒にデプロイする
- **注意:** Cloudflare Pagesのダッシュボードにドラッグ＆ドロップでアップロードする方法では、Functionsはデプロイされません。
  GitHub連携でデプロイするか、`npx wrangler pages deploy .` を使ってください
- デプロイ後、`https://reminder-8b5.pages.dev/__/auth/handler` を開いて、
  リマインダーの画面ではなくFirebaseのページ（エラー表示でもOK）が出れば、中継（プロキシ）は動いています

## 7. 確認
1. PCで設定 → 「Googleでログインして同期」→ 「同期済み」と出る
2. Firebaseコンソールの Firestore → `users/{あなたのuid}/schedules` にデータが入っている
3. スマホのPWAでもログイン → PCで追加した予定が出てくる

## ファイルの対応
| ファイル | 役割 |
|---|---|
| sync.js | 同期処理の本体 |
| firebase-config.js | Firebaseの設定値 |
| functions/__/[[path]].js | スマホでのログイン用の中継（Cloudflare Pages Function） |
| firestore.rules | 本人しか読み書きできないようにするルール |
