/**
 * 締め切り管理アプリ - メインスクリプト
 * 
 * 構成:
 * 1. 初期化・グローバル変数
 * 2. ストレージ管理
 * 3. UIユーティリティ
 * 4. ダッシュボード機能
 * 5. カレンダー機能
 * 6. ルーティーン機能
 * 7. モーダル管理
 * 8. イベントリスナー
 */

// ========================================
// 1. 初期化・グローバル変数
// ========================================

// データ保存用キー
const STORAGE_KEYS = {
    SCHEDULES: 'deadline_schedules',
    ROUTINES: 'deadline_routines',
    TODOS: 'deadline_todos',
    MEMOS: 'deadline_memos',
    ROUTINE_CHECKS: 'deadline_routine_checks'
};

// 現在表示中のカレンダー月
let currentCalendarDate = new Date();

// 選択中の日付
let selectedDate = null;

// 削除対象のID
let deleteTarget = null;

// ========================================
// 2. ストレージ管理
// ========================================

/**
 * localStorageからデータを取得
 * @param {string} key - ストレージキー
 * @returns {Array} データ配列
 */
function loadFromStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        console.error('Storage load error:', e);
        return [];
    }
}

/**
 * localStorageにデータを保存
 * @param {string} key - ストレージキー
 * @param {Array} data - 保存するデータ
 */
function saveToStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.error('Storage save error:', e);
    }
}

/**
 * 予定データを取得
 * @returns {Array} 予定配列
 */
function getSchedules() {
    return loadFromStorage(STORAGE_KEYS.SCHEDULES);
}

/**
 * 予定データを保存
 * @param {Array} schedules - 予定配列
 */
function saveSchedules(schedules) {
    saveToStorage(STORAGE_KEYS.SCHEDULES, schedules);
}

/**
 * ルーティーンデータを取得
 * @returns {Array} ルーティーン配列
 */
function getRoutines() {
    return loadFromStorage(STORAGE_KEYS.ROUTINES);
}

/**
 * ルーティーンデータを保存
 * @param {Array} routines - ルーティーン配列
 */
function saveRoutines(routines) {
    saveToStorage(STORAGE_KEYS.ROUTINES, routines);
}

/**
 * TODOデータを取得
 * @returns {Array} TODO配列
 */
function getTodos() {
    return loadFromStorage(STORAGE_KEYS.TODOS);
}

/**
 * TODOデータを保存
 * @param {Array} todos - TODO配列
 */
function saveTodos(todos) {
    saveToStorage(STORAGE_KEYS.TODOS, todos);
}

/**
 * メモデータを取得
 * @returns {Array} メモ配列
 */
function getMemos() {
    return loadFromStorage(STORAGE_KEYS.MEMOS);
}

/**
 * メモデータを保存
 * @param {Array} memos - メモ配列
 */
function saveMemos(memos) {
    saveToStorage(STORAGE_KEYS.MEMOS, memos);
}

/**
 * ルーティーン完了状態を取得（今日の日付キー）
 * @returns {Array} 完了したルーティーンIDの配列
 */
function getRoutineChecks() {
    const todayKey = getTodayString();
    try {
        const data = localStorage.getItem(STORAGE_KEYS.ROUTINE_CHECKS);
        const checks = data ? JSON.parse(data) : {};
        return checks[todayKey] || [];
    } catch (e) {
        return [];
    }
}

/**
 * ルーティーン完了状態を保存
 * @param {Array} checkedIds - 完了したルーティーンIDの配列
 */
function saveRoutineChecks(checkedIds) {
    const todayKey = getTodayString();
    try {
        const data = localStorage.getItem(STORAGE_KEYS.ROUTINE_CHECKS);
        const checks = data ? JSON.parse(data) : {};
        // 古いデータを削除（7日以上前）
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        Object.keys(checks).forEach(key => {
            if (new Date(key) < weekAgo) {
                delete checks[key];
            }
        });
        checks[todayKey] = checkedIds;
        localStorage.setItem(STORAGE_KEYS.ROUTINE_CHECKS, JSON.stringify(checks));
    } catch (e) {
        console.error('Routine checks save error:', e);
    }
}


// ========================================
// 3. UIユーティリティ
// ========================================

/**
 * 日付を表示用にフォーマット
 * @param {string} dateStr - YYYY-MM-DD形式の日付
 * @returns {string} フォーマット済み文字列
 */
function formatDateForDisplay(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[date.getDay()];
    return `${month}/${day}(${weekday})`;
}

/**
 * 残り日数を計算
 * @param {string} dateStr - YYYY-MM-DD形式の日付
 * @returns {number} 残り日数（負の値は期限切れ）
 */
function getDaysRemaining(dateStr) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + 'T00:00:00');
    const diff = target - today;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * 残り日数を表示用テキストに変換
 * @param {number} days - 残り日数
 * @returns {object} { text: string, class: string }
 */
function getCountdownDisplay(days) {
    if (days < 0) {
        return { text: '期限切れ', class: 'countdown-overdue' };
    } else if (days === 0) {
        return { text: '今日', class: 'countdown-today' };
    } else if (days <= 3) {
        return { text: `あと${days}日`, class: 'countdown-urgent' };
    } else {
        return { text: `あと${days}日`, class: 'countdown-normal' };
    }
}

/**
 * 一意のIDを生成
 * @returns {string} UUID形式のID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 今日の日付をYYYY-MM-DD形式で取得
 * @returns {string}
 */
function getTodayString() {
    return formatDateToString(new Date());
}

// ========================================
// 4. ダッシュボード機能
// ========================================

/**
 * ダッシュボードを更新
 */
function updateDashboard() {
    const schedules = getSchedules();
    const routines = getRoutines();
    const todayStr = getTodayString();
    const today = new Date();
    const dayOfWeek = today.getDay();
    
    // 今日のルーティーンを予定として追加
    const todayRoutines = routines
        .filter(r => r.enabled)
        .filter(r => {
            if (r.frequency === 'daily') return true;
            if (r.frequency === 'weekly' && r.weekdays.includes(dayOfWeek)) return true;
            return false;
        })
        .map(r => ({
            id: `routine_${r.id}`,
            title: r.title,
            type: 'routine',
            date: todayStr,
            isRoutine: true
        }));
    
    // 統計用：2週間以内の期限切れのみカウント
    const recentSchedules = schedules.filter(s => getDaysRemaining(s.date) >= -14);
    updateStats(recentSchedules);
    
    // リスト表示：期限切れ2週間以内は表示、2週間超過は非表示
    const validSchedules = schedules.filter(s => getDaysRemaining(s.date) >= -14);
    
    // 全予定を結合（ルーティーンは今日のみ表示）
    const allItems = [...validSchedules, ...todayRoutines];
    
    // 締め切り順にソート
    const sortedItems = allItems.sort((a, b) => {
        const daysA = getDaysRemaining(a.date);
        const daysB = getDaysRemaining(b.date);
        return daysA - daysB;
    });
    
    // リストを更新
    renderScheduleList(sortedItems);
}

/**
 * 統計バーを更新
 * @param {Array} schedules - 予定配列（2週間超過除外済み）
 */
function updateStats(schedules) {
    const totalCount = schedules.length;
    const urgentCount = schedules.filter(item => {
        const days = getDaysRemaining(item.date);
        return days >= 0 && days <= 3;
    }).length;
    // 2週間以内の期限切れのみカウント（-14〜-1日）
    const overdueCount = schedules.filter(item => {
        const days = getDaysRemaining(item.date);
        return days < 0 && days >= -14;
    }).length;
    
    document.getElementById('totalCount').textContent = totalCount;
    document.getElementById('urgentCount').textContent = urgentCount;
    document.getElementById('overdueCount').textContent = overdueCount;
}

/**
 * 予定リストを描画
 * @param {Array} items - 予定配列
 */
function renderScheduleList(items) {
    const listEl = document.getElementById('scheduleList');
    const emptyEl = document.getElementById('emptyState');
    
    if (items.length === 0) {
        listEl.style.display = 'none';
        emptyEl.style.display = 'block';
    } else {
        listEl.style.display = 'flex';
        emptyEl.style.display = 'none';
        
        listEl.innerHTML = items.map(item => {
            const days = getDaysRemaining(item.date);
            const countdown = getCountdownDisplayNew(days);
            
            let cardClass = 'schedule-card';
            if (days < 0) cardClass += ' overdue';
            else if (days === 0) cardClass += ' today';
            else if (days <= 3) cardClass += ' urgent';
            
            const memoHtml = item.memo 
                ? `<div class="schedule-memo">${escapeHtml(item.memo)}</div>` 
                : '';
            
            const routineBadge = item.isRoutine ? '<span class="schedule-badge routine">ルーティーン</span>' : '';
            
            return `
                <div class="${cardClass}">
                    <div class="schedule-countdown-box ${countdown.class}">
                        <span class="countdown-number">${countdown.number}</span>
                        <span class="countdown-label">${countdown.label}</span>
                    </div>
                    <div class="schedule-content">
                        <div class="schedule-title">${escapeHtml(item.title)}</div>
                        <div class="schedule-date">${formatDateForDisplay(item.date)}</div>
                        ${memoHtml}
                    </div>
                    ${routineBadge}
                </div>
            `;
        }).join('');
    }
    
    // ダッシュボードのTODOセクションも更新
    renderDashboardTodos();
}

/**
 * カウントダウン表示（新デザイン用）
 * @param {number} days - 残り日数
 * @returns {object} { number, label, class }
 */
function getCountdownDisplayNew(days) {
    if (days < 0) {
        return { number: Math.abs(days), label: '日超過', class: 'countdown-overdue' };
    } else if (days === 0) {
        return { number: '!', label: '今日', class: 'countdown-today' };
    } else if (days <= 3) {
        return { number: days, label: '日後', class: 'countdown-urgent' };
    } else {
        return { number: days, label: '日後', class: 'countdown-normal' };
    }
}

/**
 * ダッシュボードのTODOを描画
 */
function renderDashboardTodos() {
    const todos = getTodos();
    const sectionEl = document.getElementById('dashboardTodoSection');
    const listEl = document.getElementById('dashboardTodoList');
    
    // 未完了のTODOのみ表示（最大10件）
    const incompleteTodos = todos.filter(t => !t.completed).slice(0, 10);
    
    if (incompleteTodos.length === 0 && todos.length === 0) {
        sectionEl.style.display = 'none';
        return;
    }
    
    sectionEl.style.display = 'block';
    
    if (incompleteTodos.length === 0) {
        listEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 8px;">すべて完了！</p>';
        return;
    }
    
    listEl.innerHTML = incompleteTodos.map(todo => `
        <div class="dashboard-todo-item ${todo.completed ? 'completed' : ''}">
            <div class="todo-checkbox ${todo.completed ? 'checked' : ''}" 
                 onclick="toggleTodo('${todo.id}')"></div>
            <span class="dashboard-todo-text">${escapeHtml(todo.text)}</span>
        </div>
    `).join('');
}

/**
 * HTMLエスケープ
 * @param {string} str - エスケープする文字列
 * @returns {string} エスケープ済み文字列
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ========================================
// 5. カレンダー機能
// ========================================

/**
 * カレンダーを描画
 */
function renderCalendar() {
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    // ヘッダー更新
    document.getElementById('calMonthYear').textContent = `${year}年${month + 1}月`;
    
    // 月の最初と最後の日を取得
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const daysEl = document.getElementById('calendarDays');
    daysEl.innerHTML = '';
    
    // 予定データを取得
    const schedules = getSchedules();
    
    // 空白日を追加（月初の曜日まで）
    for (let i = 0; i < firstDay.getDay(); i++) {
        const emptyDay = document.createElement('div');
        emptyDay.className = 'cal-day empty';
        daysEl.appendChild(emptyDay);
    }
    
    // 日付を追加
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        const dateStr = formatDateToString(date);
        const dayOfWeek = date.getDay();
        
        const dayEl = document.createElement('div');
        dayEl.className = 'cal-day';
        dayEl.dataset.date = dateStr;
        
        // 曜日クラス
        if (dayOfWeek === 0) dayEl.classList.add('sunday');
        if (dayOfWeek === 6) dayEl.classList.add('saturday');
        
        // 今日かどうか
        if (date.getTime() === today.getTime()) {
            dayEl.classList.add('today');
        }
        
        // 選択中かどうか
        if (selectedDate === dateStr) {
            dayEl.classList.add('selected');
        }
        
        // 祝日チェック
        const holiday = getHoliday(date);
        if (holiday) {
            dayEl.classList.add('holiday');
        }
        
        // 日付テキスト
        dayEl.textContent = day;
        
        // 予定があるかチェック
        const hasSchedule = schedules.some(s => s.date === dateStr);
        if (hasSchedule) {
            const dot = document.createElement('span');
            dot.className = 'has-schedule';
            dayEl.appendChild(dot);
        }
        
        // クリックイベント
        dayEl.addEventListener('click', () => selectDate(dateStr));
        
        daysEl.appendChild(dayEl);
    }
}

/**
 * 日付を選択
 * @param {string} dateStr - YYYY-MM-DD形式の日付
 */
function selectDate(dateStr) {
    selectedDate = dateStr;
    
    // 選択状態を更新
    document.querySelectorAll('.cal-day').forEach(el => {
        el.classList.toggle('selected', el.dataset.date === dateStr);
    });
    
    // 選択日の情報を表示
    updateSelectedDateInfo(dateStr);
}

/**
 * 選択日の情報を更新
 * @param {string} dateStr - YYYY-MM-DD形式の日付
 */
function updateSelectedDateInfo(dateStr) {
    const titleEl = document.getElementById('selectedDateTitle');
    const schedulesEl = document.getElementById('dateSchedules');
    
    titleEl.textContent = formatDateForDisplay(dateStr);
    
    // 祝日を表示
    const date = new Date(dateStr + 'T00:00:00');
    const holiday = getHoliday(date);
    if (holiday) {
        titleEl.textContent += ` - ${holiday}`;
    }
    
    // その日の予定を表示
    const schedules = getSchedules().filter(s => s.date === dateStr);
    
    if (schedules.length === 0) {
        schedulesEl.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 16px;">予定なし</p>';
    } else {
        schedulesEl.innerHTML = schedules.map(s => `
            <div class="date-schedule-item">
                <span>${escapeHtml(s.title)}</span>
                <button class="action-btn delete small" onclick="deleteScheduleConfirm('${s.id}')">削除</button>
            </div>
        `).join('');
    }
}

/**
 * 前月に移動
 */
function goToPrevMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendar();
}

/**
 * 次月に移動
 */
function goToNextMonth() {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendar();
}

// ========================================
// 6. ルーティーン機能
// ========================================

/**
 * ルーティーン一覧を描画
 */
function renderRoutineList() {
    const routines = getRoutines();
    const listEl = document.getElementById('routineList');
    const emptyEl = document.getElementById('routineEmptyState');
    
    // 今日のルーティーンを描画
    renderTodayRoutines();
    
    if (routines.length === 0) {
        listEl.style.display = 'none';
        emptyEl.style.display = 'block';
        document.getElementById('todayRoutines').style.display = 'none';
        return;
    }
    
    listEl.style.display = 'flex';
    emptyEl.style.display = 'none';
    
    const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
    
    listEl.innerHTML = '<h3 style="margin: 16px 0 12px; font-size: 1rem; color: var(--text-secondary);">登録済みルーティーン</h3>' + routines.map(routine => {
        let frequencyText = '';
        if (routine.frequency === 'daily') {
            frequencyText = '毎日';
        } else if (routine.frequency === 'weekly') {
            const days = routine.weekdays.map(d => weekdayNames[d]).join(', ');
            frequencyText = `毎週 ${days}`;
        }
        
        return `
            <div class="routine-card ${routine.enabled ? '' : 'disabled'}">
                <div class="routine-top">
                    <span class="routine-title">${escapeHtml(routine.title)}</span>
                    <button class="routine-toggle ${routine.enabled ? 'active' : ''}" 
                            onclick="toggleRoutine('${routine.id}')" 
                            aria-label="ルーティーンの有効/無効を切り替え"></button>
                </div>
                <div class="routine-info">${frequencyText}</div>
                <div class="routine-actions">
                    <button class="action-btn edit" onclick="editRoutine('${routine.id}')">編集</button>
                    <button class="action-btn delete" onclick="deleteRoutineConfirm('${routine.id}')">削除</button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * 今日のルーティーンを描画
 */
function renderTodayRoutines() {
    const routines = getRoutines();
    const today = new Date();
    const dayOfWeek = today.getDay();
    const checks = getRoutineChecks();
    
    // 今日実行すべきルーティーンをフィルタ
    const todayRoutines = routines
        .filter(r => r.enabled)
        .filter(r => {
            if (r.frequency === 'daily') return true;
            if (r.frequency === 'weekly' && r.weekdays.includes(dayOfWeek)) return true;
            return false;
        });
    
    const containerEl = document.getElementById('todayRoutines');
    const listEl = document.getElementById('todayRoutineList');
    
    if (todayRoutines.length === 0) {
        containerEl.style.display = 'none';
        return;
    }
    
    containerEl.style.display = 'block';
    
    listEl.innerHTML = todayRoutines.map(routine => {
        const isChecked = checks.includes(routine.id);
        return `
            <div class="today-routine-item ${isChecked ? 'completed' : ''}">
                <div class="routine-checkbox ${isChecked ? 'checked' : ''}" 
                     onclick="toggleRoutineCheck('${routine.id}')"></div>
                <span class="routine-check-title">${escapeHtml(routine.title)}</span>
            </div>
        `;
    }).join('');
}

/**
 * ルーティーンの完了状態を切り替え
 * @param {string} id - ルーティーンID
 */
function toggleRoutineCheck(id) {
    const checks = getRoutineChecks();
    const index = checks.indexOf(id);
    
    if (index === -1) {
        checks.push(id);
    } else {
        checks.splice(index, 1);
    }
    
    saveRoutineChecks(checks);
    renderTodayRoutines();
    updateDashboard();
}

/**
 * ルーティーンの有効/無効を切り替え
 * @param {string} id - ルーティーンID
 */
function toggleRoutine(id) {
    const routines = getRoutines();
    const index = routines.findIndex(r => r.id === id);
    if (index !== -1) {
        routines[index].enabled = !routines[index].enabled;
        saveRoutines(routines);
        renderRoutineList();
        updateDashboard();
    }
}

// ========================================
// 6.5 TODO機能
// ========================================

/**
 * TODOリストを描画
 */
function renderTodoList() {
    const todos = getTodos();
    const listEl = document.getElementById('todoList');
    const emptyEl = document.getElementById('todoEmptyState');
    
    if (todos.length === 0) {
        listEl.style.display = 'none';
        emptyEl.style.display = 'block';
        return;
    }
    
    listEl.style.display = 'flex';
    emptyEl.style.display = 'none';
    
    // 未完了を先に、完了を後に
    const sortedTodos = [...todos].sort((a, b) => {
        if (a.completed === b.completed) return 0;
        return a.completed ? 1 : -1;
    });
    
    listEl.innerHTML = sortedTodos.map(todo => `
        <div class="todo-item ${todo.completed ? 'completed' : ''}">
            <div class="todo-checkbox ${todo.completed ? 'checked' : ''}" 
                 onclick="toggleTodo('${todo.id}')"></div>
            <span class="todo-text">${escapeHtml(todo.text)}</span>
            <button class="todo-delete" onclick="deleteTodo('${todo.id}')">削除</button>
        </div>
    `).join('');
}

/**
 * TODOを追加
 */
function addTodo() {
    const input = document.getElementById('todoInput');
    const text = input.value.trim();
    
    if (!text) return;
    
    const todos = getTodos();
    todos.push({
        id: generateId(),
        text,
        completed: false,
        createdAt: new Date().toISOString()
    });
    
    saveTodos(todos);
    input.value = '';
    renderTodoList();
}

/**
 * TODOの完了状態を切り替え
 * @param {string} id - TODO ID
 */
function toggleTodo(id) {
    const todos = getTodos();
    const index = todos.findIndex(t => t.id === id);
    
    if (index !== -1) {
        todos[index].completed = !todos[index].completed;
        saveTodos(todos);
        renderTodoList();
        renderDashboardTodos();
    }
}

/**
 * TODOを削除
 * @param {string} id - TODO ID
 */
function deleteTodo(id) {
    const todos = getTodos().filter(t => t.id !== id);
    saveTodos(todos);
    renderTodoList();
    renderDashboardTodos();
}

// ========================================
// 6.6 メモ機能
// ========================================

/**
 * メモリストを描画
 */
function renderMemoList() {
    const memos = getMemos();
    const listEl = document.getElementById('memoList');
    const emptyEl = document.getElementById('memoEmptyState');
    
    if (memos.length === 0) {
        listEl.style.display = 'none';
        emptyEl.style.display = 'block';
        return;
    }
    
    listEl.style.display = 'flex';
    emptyEl.style.display = 'none';
    
    // 更新日順（新しい順）
    const sortedMemos = [...memos].sort((a, b) => 
        new Date(b.updatedAt) - new Date(a.updatedAt)
    );
    
    listEl.innerHTML = sortedMemos.map(memo => {
        const date = new Date(memo.updatedAt);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        const preview = memo.content ? memo.content.substring(0, 100) : '（内容なし）';
        
        return `
            <div class="memo-card" onclick="openMemoModal('${memo.id}')">
                <div class="memo-card-title">${escapeHtml(memo.title)}</div>
                <div class="memo-card-preview">${escapeHtml(preview)}</div>
                <div class="memo-card-date">${dateStr}</div>
                <div class="memo-card-actions" onclick="event.stopPropagation()">
                    <button class="action-btn edit" onclick="openMemoModal('${memo.id}')">編集</button>
                    <button class="action-btn delete" onclick="deleteMemoConfirm('${memo.id}')">削除</button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * メモモーダルを開く
 */
function openMemoModal(editId = null) {
    const modal = document.getElementById('memoModal');
    const form = document.getElementById('memoForm');
    const title = document.getElementById('memoModalTitle');
    
    form.reset();
    document.getElementById('memoId').value = '';
    
    if (editId) {
        title.textContent = 'メモを編集';
        const memos = getMemos();
        const memo = memos.find(m => m.id === editId);
        if (memo) {
            document.getElementById('memoId').value = memo.id;
            document.getElementById('memoTitle').value = memo.title;
            document.getElementById('memoContent').value = memo.content || '';
        }
    } else {
        title.textContent = '新規メモ';
    }
    
    modal.classList.add('active');
}

/**
 * メモモーダルを閉じる
 */
function closeMemoModal() {
    document.getElementById('memoModal').classList.remove('active');
}

/**
 * メモを保存
 */
function saveMemoForm(e) {
    e.preventDefault();
    
    const id = document.getElementById('memoId').value;
    const title = document.getElementById('memoTitle').value.trim();
    const content = document.getElementById('memoContent').value;
    
    if (!title) return;
    
    const memos = getMemos();
    const now = new Date().toISOString();
    
    if (id) {
        const index = memos.findIndex(m => m.id === id);
        if (index !== -1) {
            memos[index] = { ...memos[index], title, content, updatedAt: now };
        }
    } else {
        memos.push({
            id: generateId(),
            title,
            content,
            createdAt: now,
            updatedAt: now
        });
    }
    
    saveMemos(memos);
    closeMemoModal();
    renderMemoList();
}

/**
 * メモ削除確認
 */
function deleteMemoConfirm(id) {
    deleteTarget = { type: 'memo', id };
    document.getElementById('deleteModal').classList.add('active');
}

// ========================================
// 7. モーダル管理
// ========================================

/**
 * 予定追加モーダルを開く
 */
function openScheduleModal(editId = null) {
    const modal = document.getElementById('scheduleModal');
    const form = document.getElementById('scheduleForm');
    const title = document.getElementById('modalTitle');
    
    form.reset();
    document.getElementById('scheduleId').value = '';
    
    if (editId) {
        // 編集モード
        title.textContent = '予定を編集';
        const schedules = getSchedules();
        const schedule = schedules.find(s => s.id === editId);
        if (schedule) {
            document.getElementById('scheduleId').value = schedule.id;
            document.getElementById('scheduleTitle').value = schedule.title;
            document.getElementById('scheduleDate').value = schedule.date;
            document.getElementById('scheduleMemo').value = schedule.memo || '';
        }
    } else {
        // 新規追加モード
        title.textContent = '予定を追加';
        // 選択中の日付があればセット
        if (selectedDate) {
            document.getElementById('scheduleDate').value = selectedDate;
        } else {
            document.getElementById('scheduleDate').value = getTodayString();
        }
    }
    
    modal.classList.add('active');
}

/**
 * 予定モーダルを閉じる
 */
function closeScheduleModal() {
    document.getElementById('scheduleModal').classList.remove('active');
}

/**
 * 予定を保存
 * @param {Event} e - フォームイベント
 */
function saveSchedule(e) {
    e.preventDefault();
    
    const id = document.getElementById('scheduleId').value;
    const title = document.getElementById('scheduleTitle').value.trim();
    const date = document.getElementById('scheduleDate').value;
    const memo = document.getElementById('scheduleMemo').value.trim();
    
    if (!title || !date) return;
    
    const schedules = getSchedules();
    
    if (id) {
        // 更新
        const index = schedules.findIndex(s => s.id === id);
        if (index !== -1) {
            schedules[index] = { ...schedules[index], title, date, memo };
        }
    } else {
        // 新規追加
        schedules.push({
            id: generateId(),
            title,
            date,
            memo
        });
    }
    
    saveSchedules(schedules);
    closeScheduleModal();
    updateDashboard();
    renderCalendar();
    
    if (selectedDate) {
        updateSelectedDateInfo(selectedDate);
    }
}

/**
 * 予定を編集
 * @param {string} id - 予定ID
 */
function editSchedule(id) {
    openScheduleModal(id);
}

/**
 * 予定削除確認
 * @param {string} id - 予定ID
 */
function deleteScheduleConfirm(id) {
    deleteTarget = { type: 'schedule', id };
    document.getElementById('deleteModal').classList.add('active');
}

/**
 * ルーティーン追加モーダルを開く
 */
function openRoutineModal(editId = null) {
    const modal = document.getElementById('routineModal');
    const form = document.getElementById('routineForm');
    const title = document.getElementById('routineModalTitle');
    
    form.reset();
    document.getElementById('routineId').value = '';
    document.getElementById('weekdayGroup').style.display = 'none';
    
    // チェックボックスをリセット
    document.querySelectorAll('#weekdayGroup input[type="checkbox"]').forEach(cb => {
        cb.checked = false;
    });
    
    if (editId) {
        // 編集モード
        title.textContent = 'ルーティーンを編集';
        const routines = getRoutines();
        const routine = routines.find(r => r.id === editId);
        if (routine) {
            document.getElementById('routineId').value = routine.id;
            document.getElementById('routineTitle').value = routine.title;
            document.getElementById('routineFrequency').value = routine.frequency;
            
            if (routine.frequency === 'weekly') {
                document.getElementById('weekdayGroup').style.display = 'block';
                routine.weekdays.forEach(day => {
                    const cb = document.querySelector(`#weekdayGroup input[value="${day}"]`);
                    if (cb) cb.checked = true;
                });
            }
        }
    } else {
        title.textContent = 'ルーティーンを追加';
    }
    
    modal.classList.add('active');
}

/**
 * ルーティーンモーダルを閉じる
 */
function closeRoutineModal() {
    document.getElementById('routineModal').classList.remove('active');
}

/**
 * ルーティーンを保存
 * @param {Event} e - フォームイベント
 */
function saveRoutine(e) {
    e.preventDefault();
    
    const id = document.getElementById('routineId').value;
    const title = document.getElementById('routineTitle').value.trim();
    const frequency = document.getElementById('routineFrequency').value;
    
    if (!title || !frequency) return;
    
    let weekdays = [];
    if (frequency === 'weekly') {
        document.querySelectorAll('#weekdayGroup input[type="checkbox"]:checked').forEach(cb => {
            weekdays.push(parseInt(cb.value));
        });
        
        if (weekdays.length === 0) {
            alert('曜日を1つ以上選択してください');
            return;
        }
    }
    
    const routines = getRoutines();
    
    if (id) {
        // 更新
        const index = routines.findIndex(r => r.id === id);
        if (index !== -1) {
            routines[index] = { 
                ...routines[index], 
                title, 
                frequency, 
                weekdays 
            };
        }
    } else {
        // 新規追加
        routines.push({
            id: generateId(),
            title,
            frequency,
            weekdays,
            enabled: true
        });
    }
    
    saveRoutines(routines);
    closeRoutineModal();
    renderRoutineList();
    updateDashboard();
}

/**
 * ルーティーンを編集
 * @param {string} id - ルーティーンID
 */
function editRoutine(id) {
    openRoutineModal(id);
}

/**
 * ルーティーン削除確認
 * @param {string} id - ルーティーンID
 */
function deleteRoutineConfirm(id) {
    deleteTarget = { type: 'routine', id };
    document.getElementById('deleteModal').classList.add('active');
}

/**
 * 削除を実行
 */
function confirmDelete() {
    if (!deleteTarget) return;
    
    if (deleteTarget.type === 'schedule') {
        const schedules = getSchedules().filter(s => s.id !== deleteTarget.id);
        saveSchedules(schedules);
        updateDashboard();
        renderCalendar();
        if (selectedDate) {
            updateSelectedDateInfo(selectedDate);
        }
    } else if (deleteTarget.type === 'routine') {
        const routines = getRoutines().filter(r => r.id !== deleteTarget.id);
        saveRoutines(routines);
        renderRoutineList();
        updateDashboard();
    } else if (deleteTarget.type === 'memo') {
        const memos = getMemos().filter(m => m.id !== deleteTarget.id);
        saveMemos(memos);
        renderMemoList();
    }
    
    closeDeleteModal();
}

/**
 * 削除モーダルを閉じる
 */
function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('active');
    deleteTarget = null;
}

// ========================================
// 8. イベントリスナー
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // Service Worker登録
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered'))
            .catch(err => console.error('Service Worker registration failed:', err));
    }
    
    // 初期表示
    updateDashboard();
    renderCalendar();
    renderRoutineList();
    renderTodoList();
    renderMemoList();
    
    // サイドバートグル
    const menuBtn = document.getElementById('menuBtn');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const closeSidebar = document.getElementById('closeSidebar');
    
    menuBtn.addEventListener('click', () => {
        sidebar.classList.add('open');
        overlay.classList.add('active');
    });
    
    const closeSidebarFn = () => {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    };
    
    closeSidebar.addEventListener('click', closeSidebarFn);
    overlay.addEventListener('click', closeSidebarFn);
    
    // ナビゲーション
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const view = item.dataset.view;
            
            // アクティブ状態を更新
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            // ビューを切り替え
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(`${view}View`).classList.add('active');
            
            // ヘッダータイトルを更新
            const titles = {
                dashboard: 'ダッシュボード',
                calendar: 'カレンダー',
                todo: 'TODOリスト',
                routine: 'ルーティーン管理',
                memo: 'メモ帳'
            };
            document.getElementById('headerTitle').textContent = titles[view];
            
            closeSidebarFn();
        });
    });
    
    // カレンダーナビゲーション
    document.getElementById('prevMonth').addEventListener('click', goToPrevMonth);
    document.getElementById('nextMonth').addEventListener('click', goToNextMonth);
    
    // 予定追加ボタン
    document.getElementById('addScheduleBtn').addEventListener('click', () => {
        openScheduleModal();
    });
    
    // TODO追加
    document.getElementById('addTodoBtn').addEventListener('click', addTodo);
    document.getElementById('todoInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addTodo();
        }
    });
    
    // 予定モーダル
    document.getElementById('closeScheduleModal').addEventListener('click', closeScheduleModal);
    document.getElementById('cancelSchedule').addEventListener('click', closeScheduleModal);
    document.getElementById('scheduleForm').addEventListener('submit', saveSchedule);
    
    // ルーティーン追加ボタン
    document.getElementById('addRoutineBtn').addEventListener('click', () => {
        openRoutineModal();
    });
    
    // ルーティーンモーダル
    document.getElementById('closeRoutineModal').addEventListener('click', closeRoutineModal);
    document.getElementById('cancelRoutine').addEventListener('click', closeRoutineModal);
    document.getElementById('routineForm').addEventListener('submit', saveRoutine);
    
    // 繰り返し選択で曜日表示切替
    document.getElementById('routineFrequency').addEventListener('change', (e) => {
        document.getElementById('weekdayGroup').style.display = 
            e.target.value === 'weekly' ? 'block' : 'none';
    });
    
    // メモ追加ボタン
    document.getElementById('addMemoBtn').addEventListener('click', () => {
        openMemoModal();
    });
    
    // メモモーダル
    document.getElementById('closeMemoModal').addEventListener('click', closeMemoModal);
    document.getElementById('cancelMemo').addEventListener('click', closeMemoModal);
    document.getElementById('memoForm').addEventListener('submit', saveMemoForm);
    
    // 削除モーダル
    document.getElementById('cancelDelete').addEventListener('click', closeDeleteModal);
    document.getElementById('confirmDelete').addEventListener('click', confirmDelete);
});
