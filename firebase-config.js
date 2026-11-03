/**
 * Firebaseの設定
 *
 * Firebaseコンソール →「プロジェクトの設定」→「マイアプリ」のウェブアプリにある
 * firebaseConfig の中身を、下の YOUR_... の部分に貼り付けてください。
 * （この値はブラウザから見えても問題ない値です。守りはセキュリティルールで行います）
 */

export const firebaseConfig = {
    apiKey: 'AIzaSyBPG651Im_c71hfd0y246eWF8QsbBdyzkQ',
    authDomain: 'reminder-8b5.firebaseapp.com',
    projectId: 'reminder-8b5',
    storageBucket: 'reminder-8b5.firebasestorage.app',
    messagingSenderId: '1521587119',
    appId: '1:1521587119:web:1a0ddddded30626519155a'
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
