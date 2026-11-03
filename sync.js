/**
 * Googleアカウントでのクラウド同期（Firebase）
 *
 * 方針:
 * - localStorage が常にメイン。ログインしなければ今までどおり端末内だけで動く
 * - ログイン中は、端末での変更をFirestoreへ送り、他の端末での変更を受け取る
 * - Firestoreの保存先: users/{uid}/{schedules|routines|todos|memos}/{id}
 *                      users/{uid}/meta/settings
 * - 削除は「deleted: true」の印を残して他の端末に伝える
 * - 前回同期した時点の状態（ハッシュ）を端末に覚えておき、差分だけを送受信する
 *
 * app.js とのつながり:
 * - app.js が保存するたびに 'localdatachange' イベントを出す → ここで差分を送信
 * - 受け取った変更は localStorage に直接書き、window.refreshAllViews() で画面を更新
 */

import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

const SDK_VERSION = '13.2.0';
const SDK_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;

// localStorageのキー → Firestoreのコレクション名
const COLLECTIONS = {
    deadline_schedules: 'schedules',
    deadline_routines: 'routines',
    deadline_todos: 'todos',
    deadline_memos: 'memos'
};
const SETTINGS_KEY = 'deadline_settings';
const STATE_KEY = 'deadline_sync_state';
const BACKUP_KEY = 'deadline_presync_backup';
const BATCH_LIMIT = 450; // Firestoreの1バッチ上限は500

// Firebase SDK（動的に読み込む）
let fb = null;
let auth = null;
let db = null;

// 同期の状態
let currentUser = null;
let ready = false;          // 初回の突き合わせが終わったか
let state = null;           // 端末に保存する同期状態
let unsubscribers = [];
let pendingWrites = 0;
let startingFor = null;     // 二重起動防止

// ========================================
// 小さな道具
// ========================================

/** 文字列の短いハッシュ（cyrb53） */
function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** キーの並び順に左右されないJSON文字列（ハッシュ比較用） */
function stableStringify(v) {
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    if (v && typeof v === 'object') {
        return '{' + Object.keys(v).sort()
            .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
    }
    return JSON.stringify(v === undefined ? null : v);
}

/** データ1件（または設定）のハッシュ */
function hashOf(value) {
    return hash(stableStringify(value));
}

function readLocalArray(key) {
    try {
        const v = JSON.parse(localStorage.getItem(key));
        return Array.isArray(v) ? v : [];
    } catch (e) {
        return [];
    }
}

/** sync.js からの書き込み（イベントを出さない＝送り返さない） */
function writeLocalArray(key, arr) {
    localStorage.setItem(key, JSON.stringify(arr));
}

function readLocalSettings() {
    try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY));
    } catch (e) {
        return null;
    }
}

function hashMapOf(arr) {
    const map = {};
    for (const item of arr) {
        if (item && item.id) map[item.id] = hashOf(item);
    }
    return map;
}

function loadState() {
    try {
        return JSON.parse(localStorage.getItem(STATE_KEY)) || null;
    } catch (e) {
        return null;
    }
}

function saveState() {
    try {
        localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error('Sync state save error:', e);
    }
}

function refreshViews() {
    if (typeof window.refreshAllViews === 'function') {
        window.refreshAllViews();
    }
}

// ========================================
// 画面（設定の「アカウント同期」欄）
// ========================================

const ui = {
    section: () => document.getElementById('syncSection'),
    status: () => document.getElementById('syncStatus'),
    loginBtn: () => document.getElementById('syncLoginBtn'),
    logoutBtn: () => document.getElementById('syncLogoutBtn')
};

function setStatus(text, kind = '') {
    const el = ui.status();
    if (!el) return;
    el.textContent = text;
    el.className = 'sync-status' + (kind ? ` ${kind}` : '');
}

function renderAccountUI() {
    const loginBtn = ui.loginBtn();
    const logoutBtn = ui.logoutBtn();
    if (!loginBtn || !logoutBtn) return;

    if (currentUser) {
        loginBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
    } else {
        loginBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
        setStatus('ログインしていません（データはこの端末だけに保存されています）');
    }
}

function updateSyncedStatus() {
    if (!currentUser) return;
    const who = currentUser.email || 'Googleアカウント';
    if (!navigator.onLine) {
        setStatus(`${who} でログイン中\nオフライン：つながったら自動で同期します`, 'warn');
    } else if (pendingWrites > 0) {
        setStatus(`${who} でログイン中\n同期中…`);
    } else if (ready) {
        const t = new Date();
        const hm = `${t.getHours()}:${String(t.getMinutes()).padStart(2, '0')}`;
        setStatus(`${who} でログイン中\n同期済み（${hm}）`, 'ok');
    }
}

// ========================================
// Firestoreへの書き込み
// ========================================

function itemRef(name, id) {
    return fb.doc(db, 'users', currentUser.uid, name, id);
}

function settingsRef() {
    return fb.doc(db, 'users', currentUser.uid, 'meta', 'settings');
}

/**
 * 書き込みをまとめて送る
 * @param {Array<{ref, data}>} ops
 */
function commitOps(ops) {
    if (ops.length === 0) return;

    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const batch = fb.writeBatch(db);
        for (const op of ops.slice(i, i + BATCH_LIMIT)) {
            batch.set(op.ref, op.data);
        }
        pendingWrites++;
        updateSyncedStatus();
        // オフラインでもFirestoreが端末内に覚えておき、つながったときに送ってくれる
        batch.commit()
            .catch((e) => {
                console.error('Sync write error:', e);
                setStatus('同期に失敗しました：' + (e.code || e.message), 'error');
            })
            .finally(() => {
                pendingWrites--;
                updateSyncedStatus();
            });
    }
}

function upsertOp(name, item) {
    return {
        ref: itemRef(name, item.id),
        data: { data: item, deleted: false, updatedAt: fb.serverTimestamp() }
    };
}

function deleteOp(name, id) {
    return {
        ref: itemRef(name, id),
        data: { data: null, deleted: true, updatedAt: fb.serverTimestamp() }
    };
}

/**
 * 端末のデータと「前回同期した状態」を比べて、変わった分だけ送る
 */
function pushLocalDiff(key) {
    const name = COLLECTIONS[key];
    const arr = readLocalArray(key);
    const prev = state.synced[key] || {};
    const next = {};
    const ops = [];

    for (const item of arr) {
        if (!item || !item.id) continue;
        const h = hashOf(item);
        next[item.id] = h;
        if (prev[item.id] !== h) ops.push(upsertOp(name, item));
    }
    for (const id of Object.keys(prev)) {
        if (!(id in next)) ops.push(deleteOp(name, id));
    }

    state.synced[key] = next;
    saveState();
    commitOps(ops);
}

function pushSettingsDiff() {
    const settings = readLocalSettings();
    if (!settings) return;
    const h = hashOf(settings);
    if (state.settingsHash === h) return;
    state.settingsHash = h;
    saveState();
    commitOps([{
        ref: settingsRef(),
        data: { data: settings, updatedAt: fb.serverTimestamp() }
    }]);
}

/** app.js からの「保存したよ」通知 */
function onLocalChange(e) {
    if (!currentUser || !ready) return;
    const key = e.detail && e.detail.key;
    if (key === SETTINGS_KEY) {
        pushSettingsDiff();
    } else if (key in COLLECTIONS) {
        pushLocalDiff(key);
    }
}

// ========================================
// Firestoreからの受信
// ========================================

/**
 * 他の端末での変更を端末に反映
 */
function applyRemoteChanges(key, name, snap) {
    const arr = readLocalArray(key);
    const index = new Map(arr.map((item, i) => [item.id, i]));
    let result = arr.slice();
    let changed = false;
    let maxTs = state.lastSync[name] || 0;
    const synced = state.synced[key] || {};

    for (const change of snap.docChanges()) {
        const docSnap = change.doc;
        // 自分が送ったばかりでまだ届いていない書き込みは無視（手元はもう最新）
        if (docSnap.metadata.hasPendingWrites) continue;
        if (change.type === 'removed') continue;

        const remote = docSnap.data();
        const id = docSnap.id;
        const ts = remote.updatedAt ? remote.updatedAt.toMillis() : 0;
        if (ts > maxTs) maxTs = ts;

        if (remote.deleted) {
            if (index.has(id)) {
                result[index.get(id)] = null;
                changed = true;
            }
            delete synced[id];
        } else if (remote.data) {
            const h = hashOf(remote.data);
            synced[id] = h;
            if (index.has(id)) {
                const i = index.get(id);
                if (result[i] && hashOf(result[i]) !== h) {
                    result[i] = remote.data;
                    changed = true;
                }
            } else {
                index.set(id, result.length);
                result.push(remote.data);
                changed = true;
            }
        }
    }

    state.synced[key] = synced;
    state.lastSync[name] = maxTs;
    saveState();

    if (changed) {
        result = result.filter(Boolean);
        writeLocalArray(key, result);
        refreshViews();
    }
    updateSyncedStatus();
}

function applyRemoteSettings(snap) {
    if (snap.metadata.hasPendingWrites || !snap.exists()) return;
    const remote = snap.data().data;
    if (!remote) return;
    const h = hashOf(remote);
    if (h === state.settingsHash) return;
    state.settingsHash = h;
    saveState();
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(remote));
    refreshViews();
}

function startListeners() {
    stopListeners();
    const uid = currentUser.uid;

    for (const [key, name] of Object.entries(COLLECTIONS)) {
        // 前回同期したとき以降に変わったものだけ受け取る（読み取り回数の節約）
        const since = fb.Timestamp.fromMillis(state.lastSync[name] || 0);
        const q = fb.query(
            fb.collection(db, 'users', uid, name),
            fb.where('updatedAt', '>', since)
        );
        unsubscribers.push(fb.onSnapshot(
            q,
            (snap) => applyRemoteChanges(key, name, snap),
            (e) => {
                console.error('Sync listen error:', e);
                setStatus('同期に失敗しました：' + (e.code || e.message), 'error');
            }
        ));
    }

    unsubscribers.push(fb.onSnapshot(
        settingsRef(),
        applyRemoteSettings,
        (e) => console.error('Settings listen error:', e)
    ));
}

function stopListeners() {
    unsubscribers.forEach((fn) => fn());
    unsubscribers = [];
}

// ========================================
// ログイン直後の処理
// ========================================

/**
 * この端末でこのアカウントに初めてログインしたとき：
 * クラウドと端末のデータを合体させる。
 * - 同じIDの予定などはクラウド側を優先（他の端末の新しいデータを古い端末で上書きしないため）
 * - 端末にしかないデータはクラウドへアップロード
 */
async function firstMerge() {
    // 念のため、合体前の端末データを残しておく
    try {
        const backup = {};
        for (const key of [...Object.keys(COLLECTIONS), SETTINGS_KEY]) {
            backup[key] = localStorage.getItem(key);
        }
        backup.savedAt = new Date().toISOString();
        localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    } catch (e) {
        console.warn('Pre-sync backup skipped (storage full?):', e);
    }

    const newState = { uid: currentUser.uid, lastSync: {}, synced: {}, settingsHash: null };
    const ops = [];

    for (const [key, name] of Object.entries(COLLECTIONS)) {
        const snap = await fb.getDocs(fb.collection(db, 'users', currentUser.uid, name));
        const remote = new Map();
        let maxTs = 0;
        snap.forEach((d) => {
            const r = d.data();
            remote.set(d.id, r);
            const ts = r.updatedAt ? r.updatedAt.toMillis() : 0;
            if (ts > maxTs) maxTs = ts;
        });

        const merged = [];
        const seen = new Set();
        for (const item of readLocalArray(key)) {
            if (!item || !item.id) continue;
            seen.add(item.id);
            const r = remote.get(item.id);
            if (!r) {
                merged.push(item);                // 端末にしかない → アップロード
                ops.push(upsertOp(name, item));
            } else if (!r.deleted && r.data) {
                merged.push(r.data);              // 両方にある → クラウド優先
            }
            // クラウドで削除済み → 端末からも消す
        }
        for (const [id, r] of remote) {
            if (!seen.has(id) && !r.deleted && r.data) merged.push(r.data); // クラウドにしかない
        }

        writeLocalArray(key, merged);
        newState.synced[key] = hashMapOf(merged);
        newState.lastSync[name] = maxTs;
    }

    // 設定
    const settingsSnap = await fb.getDoc(settingsRef());
    if (settingsSnap.exists() && settingsSnap.data().data) {
        const remote = settingsSnap.data().data;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(remote));
        newState.settingsHash = hashOf(remote);
    } else {
        const local = readLocalSettings();
        if (local) {
            ops.push({ ref: settingsRef(), data: { data: local, updatedAt: fb.serverTimestamp() } });
            newState.settingsHash = hashOf(local);
        }
    }

    state = newState;
    saveState();
    commitOps(ops);
    refreshViews();
}

async function startSync(user) {
    if (startingFor === user.uid) return;
    startingFor = user.uid;
    ready = false;
    renderAccountUI();
    setStatus(`${user.email || 'Googleアカウント'} でログイン中\n同期の準備中…`);

    try {
        const saved = loadState();
        if (!saved || saved.uid !== user.uid) {
            await firstMerge();
        } else {
            // 前回から、この端末で変わった分（オフライン中やログアウト中の編集）を送る
            state = saved;
            state.lastSync = state.lastSync || {};
            state.synced = state.synced || {};
            for (const key of Object.keys(COLLECTIONS)) pushLocalDiff(key);
            pushSettingsDiff();
        }
        ready = true;
        startListeners();
        updateSyncedStatus();
    } catch (e) {
        console.error('Sync start error:', e);
        startingFor = null;
        if (!navigator.onLine) {
            setStatus('初回の同期にはインターネット接続が必要です。つながったら自動で再開します', 'warn');
        } else {
            setStatus('同期を開始できませんでした：' + (e.code || e.message), 'error');
        }
    }
}

function stopSync() {
    stopListeners();
    ready = false;
    startingFor = null;
    // state（前回同期した状態）は残す。
    // 同じアカウントで再ログインしたとき、ログアウト中の編集を差分として送れるようにするため。
}

// ========================================
// ログイン・ログアウト
// ========================================

function isStandaloneOrMobile() {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    return standalone || mobile;
}

async function login() {
    const provider = new fb.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        if (isStandaloneOrMobile()) {
            // スマホ・ホーム画面版はページ遷移でログイン
            await fb.signInWithRedirect(auth, provider);
        } else {
            await fb.signInWithPopup(auth, provider);
        }
    } catch (e) {
        if (e.code === 'auth/popup-blocked') {
            await fb.signInWithRedirect(auth, provider);
            return;
        }
        if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
        console.error('Login error:', e);
        setStatus('ログインできませんでした：' + (e.code || e.message), 'error');
    }
}

async function logout() {
    if (!confirm('ログアウトしますか？\nこの端末のデータはそのまま残ります。')) return;
    await fb.signOut(auth);
}

// ========================================
// 起動
// ========================================

async function init() {
    const section = ui.section();
    if (!isFirebaseConfigured) {
        // Firebaseを設定していない間は、同期の欄ごと隠す
        if (section) section.style.display = 'none';
        return;
    }

    setStatus('同期機能を読み込み中…');

    try {
        const [appMod, authMod, fsMod] = await Promise.all([
            import(`${SDK_BASE}/firebase-app.js`),
            import(`${SDK_BASE}/firebase-auth.js`),
            import(`${SDK_BASE}/firebase-firestore.js`)
        ]);
        fb = { ...appMod, ...authMod, ...fsMod };
    } catch (e) {
        console.error('Firebase SDK load error:', e);
        setStatus('同期機能を読み込めませんでした（オフラインの可能性があります）。データはこの端末に保存されています', 'warn');
        return;
    }

    const app = fb.initializeApp(firebaseConfig);
    auth = fb.getAuth(app);
    try {
        // オフライン中の書き込みも端末内（IndexedDB）に保持して、あとで送る
        db = fb.initializeFirestore(app, {
            localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() })
        });
    } catch (e) {
        console.warn('Persistent cache unavailable, using memory cache:', e);
        db = fb.getFirestore(app);
    }

    ui.loginBtn()?.addEventListener('click', login);
    ui.logoutBtn()?.addEventListener('click', logout);
    window.addEventListener('localdatachange', onLocalChange);
    window.addEventListener('online', () => {
        if (currentUser && !ready) startSync(currentUser);
        updateSyncedStatus();
    });
    window.addEventListener('offline', updateSyncedStatus);

    // スマホでのログインから戻ってきたときの結果を受け取る
    fb.getRedirectResult(auth).catch((e) => {
        console.error('Redirect login error:', e);
        setStatus('ログインできませんでした：' + (e.code || e.message), 'error');
    });

    fb.onAuthStateChanged(auth, (user) => {
        currentUser = user;
        if (user) {
            startSync(user);
        } else {
            stopSync();
        }
        renderAccountUI();
    });
}

init();
