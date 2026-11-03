/**
 * Firebaseの設定
 *
 * Firebaseコンソール →「プロジェクトの設定」→「マイアプリ」のウェブアプリにある
 * firebaseConfig の中身を、下の YOUR_... の部分に貼り付けてください。
 * （この値はブラウザから見えても問題ない値です。守りはセキュリティルールで行います）
 */
export const firebaseConfig = {
    apiKey: 'YOUR_API_KEY',
    authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
    projectId: 'YOUR_PROJECT_ID',
    storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
    messagingSenderId: 'YOUR_SENDER_ID',
    appId: 'YOUR_APP_ID'
};

/**
 * 本番ドメインでは、ログイン処理を自分のドメイン経由にする。
 * iPhoneのSafariやホーム画面版PWAでログインできない問題を避けるため。
 * （functions/__/[[path]].js のプロキシとセットで動きます）
 */
const PRODUCTION_HOST = 'reminder-8b5.pages.dev';
if (location.hostname === PRODUCTION_HOST) {
    firebaseConfig.authDomain = PRODUCTION_HOST;
}

/** 設定が貼り付け済みかどうか */
export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith('YOUR_');
