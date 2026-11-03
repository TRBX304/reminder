/**
 * Cloudflare Pages Function
 * /__/auth/... と /__/firebase/... へのアクセスを Firebase にそのまま中継する。
 *
 * これがあると、ログイン画面が自分のドメイン（reminder-8b5.pages.dev）上で動くので、
 * iPhoneのSafariやホーム画面版PWAでもGoogleログインが通るようになる。
 * 参考: https://firebase.google.com/docs/auth/web/redirect-best-practices （Option 3）
 */

// ↓ 自分のFirebaseプロジェクトIDに書き換える
const FIREBASE_AUTH_ORIGIN = 'https://YOUR_PROJECT_ID.firebaseapp.com';

export async function onRequest({ request }) {
    const url = new URL(request.url);
    const target = FIREBASE_AUTH_ORIGIN + url.pathname + url.search;

    // メソッド・ヘッダー・ボディをそのまま転送（POSTのボディも落とさない）
    const proxied = new Request(target, request);
    const response = await fetch(proxied, { redirect: 'manual' });

    // キャッシュさせない
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
    });
}
