/**
 * Service Worker - オフライン対応
 */

const CACHE_NAME = 'deadline-app-v6';
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/holidays.js',
    '/sync.js',
    '/firebase-config.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                // 即座にアクティブ化
                return self.skipWaiting();
            })
    );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                );
            })
            .then(() => {
                // 全クライアントを即座に制御
                return self.clients.claim();
            })
    );
});

/**
 * キャッシュしてよいリクエストか
 * - 自分のサイトのファイル（ただしログイン用の /__/ 以下は除く）
 * - Firebase SDK本体（バージョン付きURLなので中身が変わらない）
 * Firestoreやログインの通信はキャッシュしない
 */
function isCacheable(request) {
    if (request.method !== 'GET') return false;
    const url = new URL(request.url);
    if (url.origin === self.location.origin) {
        return !url.pathname.startsWith('/__/');
    }
    return url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
}

// フェッチ時にキャッシュファーストで返す
self.addEventListener('fetch', (event) => {
    // 対象外の通信はService Workerを通さず、そのままブラウザに任せる
    if (!isCacheable(event.request)) return;

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }

                return fetch(event.request)
                    .then((response) => {
                        // 有効なレスポンスのみキャッシュ
                        if (!response || response.status !== 200 ||
                            (response.type !== 'basic' && response.type !== 'cors')) {
                            return response;
                        }

                        const responseToCache = response.clone();

                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });

                        return response;
                    })
                    .catch(() => {
                        // オフライン時のフォールバック
                        if (event.request.destination === 'document') {
                            return caches.match('/index.html');
                        }
                    });
            })
    );
});
