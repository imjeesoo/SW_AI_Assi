'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN_KEY = 'siwoo_token';
const API_BASE  = '/api';

// ─────────────────────────────────────────────────────────────────────────────
// Chat module state (persists across route changes)
// ─────────────────────────────────────────────────────────────────────────────
const _chat = {
    sessionId:   null,
    sessions:    [],
    controller:  null,
    streaming:   false,
    memoryCount: 0,   // loaded memories count — used for chip display
};

// ─────────────────────────────────────────────────────────────────────────────
// marked.js + highlight.js setup (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────
(function setupMarked() {
    if (typeof marked === 'undefined' || typeof hljs === 'undefined') return;
    marked.use({
        renderer: {
            code({ text, lang }) {
                let hl;
                if (lang && hljs.getLanguage(lang)) {
                    hl = hljs.highlight(text, { language: lang }).value;
                } else {
                    hl = hljs.highlightAuto(text).value;
                }
                const cls = lang ? ` language-${lang}` : '';
                return `<pre><code class="hljs${cls}">${hl}</code></pre>`;
            },
        },
    });
})();

function _renderMarkdown(text) {
    if (typeof marked === 'undefined') return _escHtml(text);
    const raw = marked.parse(String(text));
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify.sanitize(raw, { ADD_ATTR: ['class'] });
    }
    return raw;
}

function _escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────────────────────
function getToken()   { return localStorage.getItem(TOKEN_KEY); }
function setToken(t)  { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

// ─────────────────────────────────────────────────────────────────────────────
// Navigation (SPA pushState routing)
// ─────────────────────────────────────────────────────────────────────────────
function navigate(path) {
    window.history.pushState(null, '', path);
    route();
}
window.addEventListener('popstate', route);

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────
function _handleUnauth() {
    clearToken(); navigate('/login');
    showToast('세션이 만료되었습니다. 다시 로그인해주세요.');
}

async function apiPost(path, data, authenticated = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (authenticated) {
        const t = getToken();
        if (!t) { navigate('/login'); return null; }
        headers['Authorization'] = `Bearer ${t}`;
    }
    try {
        const res = await fetch(API_BASE + path, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        });
        if (res.status === 401) { _handleUnauth(); return null; }
        return res;
    } catch (err) {
        console.error('API error:', err);
        return null;
    }
}

async function apiGet(path) {
    const t = getToken();
    if (!t) { navigate('/login'); return null; }
    try {
        const res = await fetch(API_BASE + path, {
            headers: { 'Authorization': `Bearer ${t}` },
        });
        if (res.status === 401) { _handleUnauth(); return null; }
        return res;
    } catch (err) {
        console.error('API error:', err);
        return null;
    }
}

async function apiPut(path, data) {
    const t = getToken();
    if (!t) { navigate('/login'); return null; }
    try {
        const res = await fetch(API_BASE + path, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${t}`,
            },
            body: JSON.stringify(data),
        });
        if (res.status === 401) { _handleUnauth(); return null; }
        return res;
    } catch (err) {
        console.error('API error:', err);
        return null;
    }
}

async function apiDelete(path) {
    const t = getToken();
    if (!t) { navigate('/login'); return null; }
    try {
        const res = await fetch(API_BASE + path, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${t}` },
        });
        if (res.status === 401) { _handleUnauth(); return null; }
        return res;
    } catch (err) {
        console.error('API error:', err);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Toast notifications
// ─────────────────────────────────────────────────────────────────────────────
function showToast(msg, durationMs = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, durationMs);
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────
function logout() {
    clearToken();
    navigate('/login');
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────
function route() {
    const path  = window.location.pathname;
    const token = getToken();
    const $app  = document.getElementById('app');

    if (!token && path !== '/login') { navigate('/login'); return; }
    if (token  && path === '/login') { navigate('/');      return; }

    switch (path) {
        case '/login':    renderLogin($app);    break;
        case '/':         renderChat($app);     break;
        case '/memory':   renderMemory($app);   break;
        case '/settings': renderSettings($app); break;
        default:          navigate('/');
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared: Top Navigation
// ─────────────────────────────────────────────────────────────────────────────
function buildNav(activePath, opts = {}) {
    const tabs = [
        { label: '채팅',  path: '/'         },
        { label: '메모리', path: '/memory'   },
        { label: '설정',  path: '/settings' },
    ];
    const tabsHtml = tabs.map(t => {
        const cls = activePath === t.path ? 'nav-tab active' : 'nav-tab';
        return `<button class="${cls}" onclick="navigate('${t.path}')">${t.label}</button>`;
    }).join('');

    const hamburger = opts.sidebar
        ? `<button class="hamburger" id="hamburger-btn" title="메뉴">☰</button>`
        : '';

    return `
    <nav class="topnav">
        ${hamburger}
        <div class="nav-brand">
            <div class="brand-badge">아</div>
            <span class="brand-name">SIWOO AI</span>
        </div>
        <div class="nav-tabs">${tabsHtml}</div>
        <div class="nav-right">
            <span class="status-chip">● 로컬</span>
            <button class="btn-ghost" onclick="logout()">로그아웃</button>
        </div>
    </nav>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCR-01: Login
// ─────────────────────────────────────────────────────────────────────────────
function renderLogin($app) {
    $app.innerHTML = `
    <div class="login-screen">
        <div class="login-brand">
            <div class="brand-badge">아</div>
            <span class="brand-name">SIWOO AI</span>
        </div>
        <div class="login-card">
            <div class="form-label-row">
                <span class="form-label-ko">접속 비밀번호</span>
                <span class="form-label-en mono">PASSWORD</span>
            </div>
            <input
                type="password"
                id="pw-input"
                class="form-input"
                autocomplete="current-password"
                autofocus
            />
            <div id="login-error" class="error-msg" style="display:none">
                비밀번호가 올바르지 않습니다.
            </div>
            <button id="login-btn" class="btn-primary w-full" style="margin-top:12px">
                접속
            </button>
        </div>
        <p class="footer-note">로컬 저장 · 같은 WiFi에서만 접속 가능</p>
    </div>`;

    const $input = document.getElementById('pw-input');
    const $btn   = document.getElementById('login-btn');
    const $err   = document.getElementById('login-error');

    async function doLogin() {
        const password = $input.value.trim();
        if (!password) return;

        $btn.disabled    = true;
        $btn.textContent = '접속 중…';
        $err.style.display = 'none';

        const res = await apiPost('/login', { password }, false);

        if (!res) {
            $btn.disabled    = false;
            $btn.textContent = '접속';
            return;
        }

        if (res.ok) {
            const data = await res.json();
            setToken(data.access_token);
            navigate('/');
        } else {
            $input.classList.add('shake');
            $err.style.display = 'block';
            $input.value = '';
            $input.focus();
            setTimeout(() => $input.classList.remove('shake'), 500);
        }

        $btn.disabled    = false;
        $btn.textContent = '접속';
    }

    $btn.addEventListener('click', doLogin);
    $input.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

// ─────────────────────────────────────────────────────────────────────────────
// SCR-02: Chat — entry point
// ─────────────────────────────────────────────────────────────────────────────
async function renderChat($app) {
    // Abort any ongoing stream if navigating back
    if (_chat.controller) {
        _chat.controller.abort();
        _chat.controller = null;
        _chat.streaming  = false;
    }

    $app.innerHTML = buildNav('/', { sidebar: true }) + `
    <div class="chat-layout">
        <aside class="sidebar" id="sidebar">
            <div class="sidebar-header">
                <button class="btn-new-chat" id="btn-new-chat">+ 새 대화</button>
            </div>
            <div class="sidebar-section-label">SESSIONS</div>
            <div class="session-list" id="session-list"></div>
        </aside>

        <div class="drawer-scrim" id="drawer-scrim"></div>

        <main class="chat-area">
            <div class="messages" id="messages">
                <div class="muted" style="text-align:center;padding:24px;font-size:13px">불러오는 중…</div>
            </div>
            <div class="input-bar">
                <textarea
                    class="chat-textarea"
                    id="chat-input"
                    placeholder="메시지 보내기…"
                    rows="1"
                    autocomplete="off"
                ></textarea>
                <button class="btn-end-session" id="btn-end" title="세션 종료">종료</button>
                <button class="btn-send" id="btn-send" title="전송 (Enter)">▶</button>
            </div>
        </main>
    </div>`;

    // Wire up controls
    document.getElementById('hamburger-btn')?.addEventListener('click', _toggleSidebar);
    document.getElementById('drawer-scrim').addEventListener('click', _closeSidebar);
    document.getElementById('btn-new-chat').addEventListener('click', _newChat);
    document.getElementById('btn-end').addEventListener('click', _handleEndSession);

    const $input = document.getElementById('chat-input');
    const $send  = document.getElementById('btn-send');

    $input.addEventListener('input', _autoResize);
    $input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            _sendMessage();
        }
    });
    $send.addEventListener('click', () => {
        if ($send.classList.contains('stop-mode')) _stopStream();
        else _sendMessage();
    });

    // Load and display sessions
    await _loadSessions();

    if (_chat.sessions.length === 0) {
        await _createSession();
    } else {
        const keepId = _chat.sessionId && _chat.sessions.find(s => s.id === _chat.sessionId);
        await _switchSession(keepId ? _chat.sessionId : _chat.sessions[0].id);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sidebar helpers
// ─────────────────────────────────────────────────────────────────────────────
function _toggleSidebar() {
    document.getElementById('sidebar')?.classList.toggle('open');
    document.getElementById('drawer-scrim')?.classList.toggle('open');
}
function _closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('drawer-scrim')?.classList.remove('open');
}

// ─────────────────────────────────────────────────────────────────────────────
// Session list
// ─────────────────────────────────────────────────────────────────────────────
async function _loadSessions() {
    const res = await apiGet('/sessions');
    if (!res || !res.ok) { _chat.sessions = []; return; }
    _chat.sessions = await res.json();
    _renderSessionList();
}

function _renderSessionList() {
    const $list = document.getElementById('session-list');
    if (!$list) return;

    if (_chat.sessions.length === 0) {
        $list.innerHTML = `<p class="muted" style="padding:10px 8px;font-size:12px">대화 없음</p>`;
        return;
    }

    $list.innerHTML = _chat.sessions.map(s => {
        const active = s.id === _chat.sessionId ? ' active' : '';
        const title  = s.title || '새 대화';
        return `
        <div class="session-item${active}" data-id="${_escHtml(s.id)}">
            <div class="session-item-title">${_escHtml(title)}</div>
            <div class="session-item-date">${_escHtml(_fmtDate(s.created_at))}</div>
        </div>`;
    }).join('');

    $list.querySelectorAll('.session-item').forEach(el => {
        el.addEventListener('click', () => {
            if (_chat.streaming) { showToast('응답이 완료된 후 전환할 수 있습니다.'); return; }
            _switchSession(el.dataset.id);
            _closeSidebar();
        });
    });
}

function _fmtDate(isoStr) {
    const d    = new Date(isoStr);
    const now  = new Date();
    const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterday = today - 86400000;
    const day       = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const t  = `${hh}:${mm}`;
    if (day === today)     return t;
    if (day === yesterday) return `어제 ${t}`;
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session switching and creation
// ─────────────────────────────────────────────────────────────────────────────
async function _switchSession(sessionId) {
    _chat.sessionId = sessionId;
    _renderSessionList();

    const $msgs = document.getElementById('messages');
    if (!$msgs) return;
    $msgs.innerHTML = `<div class="muted" style="text-align:center;padding:24px;font-size:13px">불러오는 중…</div>`;

    const res = await apiGet(`/sessions/${sessionId}`);
    if (!res || !res.ok) {
        $msgs.innerHTML = `<div class="message-row ai"><div class="msg-avatar">아</div><div class="bubble bubble-error">세션을 불러올 수 없습니다.</div></div>`;
        return;
    }
    const session = await res.json();
    _renderMessages(session.messages);
}

async function _createSession() {
    const res = await apiPost('/sessions', {});
    if (!res || !res.ok) { showToast('새 대화를 만들 수 없습니다.'); return; }
    const sess = await res.json();
    // Update memory count if server reported it
    if (typeof sess.memory_count === 'number') {
        _chat.memoryCount = sess.memory_count;
    }
    _chat.sessions.unshift(sess);
    _chat.sessionId = sess.id;
    _renderSessionList();
    _renderMessages([], { memoryCount: _chat.memoryCount });
}

async function _newChat() {
    if (_chat.streaming) { showToast('응답이 진행 중입니다.'); return; }
    await _createSession();
    _closeSidebar();
}

function _handleEndSession() {
    if (_chat.streaming) { showToast('응답이 진행 중입니다.'); return; }
    if (!_chat.sessionId) return;
    _showEndDialog();
}

// ─── SCR-03: Session End Dialog ───────────────────────────────────────────────
function _showEndDialog() {
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.innerHTML = `
    <div class="dialog-card">
        <div class="dialog-icon">◼</div>
        <div class="dialog-title">세션 종료</div>
        <div class="dialog-desc">
            이 대화를 종료하고 요약을 메모리에 저장할까요?<br>
            요약 생성에 수 초가 소요됩니다.
        </div>
        <div class="dialog-actions">
            <button class="btn-dialog-primary" id="dlg-btn-save">저장 후 종료</button>
            <button class="btn-dialog-secondary" id="dlg-btn-nosave">저장 안 하고 종료</button>
        </div>
    </div>`;

    document.body.appendChild(backdrop);

    function closeDialog() {
        backdrop.remove();
        document.removeEventListener('keydown', onEscape);
    }
    function onEscape(e) { if (e.key === 'Escape') closeDialog(); }
    document.addEventListener('keydown', onEscape);

    // Dismiss on backdrop click (not on card)
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeDialog(); });

    document.getElementById('dlg-btn-save').addEventListener('click', () =>
        _endSession(true, closeDialog));
    document.getElementById('dlg-btn-nosave').addEventListener('click', () =>
        _endSession(false, closeDialog));
}

async function _endSession(saveSummary, closeDialog) {
    const $btnSave   = document.getElementById('dlg-btn-save');
    const $btnNoSave = document.getElementById('dlg-btn-nosave');

    if ($btnSave)   $btnSave.disabled   = true;
    if ($btnNoSave) $btnNoSave.disabled = true;
    if ($btnSave)   $btnSave.textContent = saveSummary ? '요약 생성 중…' : '처리 중…';

    const res = await apiPost(`/sessions/${_chat.sessionId}/end`, { save_summary: saveSummary });

    if (!res || !res.ok) {
        showToast('세션 종료에 실패했습니다.');
        if ($btnSave)   { $btnSave.disabled = false; $btnSave.textContent = '저장 후 종료'; }
        if ($btnNoSave) $btnNoSave.disabled = false;
        return;
    }

    const data = await res.json();
    closeDialog();

    if (saveSummary && data.status === 'summarized') {
        if (typeof data.memory_count === 'number') _chat.memoryCount = data.memory_count;
        showToast('메모리에 저장되었습니다.');
    }

    // Start a fresh session
    await _createSession();
    _closeSidebar();
}

// ─────────────────────────────────────────────────────────────────────────────
// Message rendering
// ─────────────────────────────────────────────────────────────────────────────
function _renderMessages(messages, opts = {}) {
    const { memoryCount = 0 } = opts;
    const $msgs = document.getElementById('messages');
    if (!$msgs) return;

    const chipHtml = memoryCount > 0
        ? `<div class="memory-chip-row"><div class="memory-chip-badge">이전 대화 기억을 불러왔어요 · ${memoryCount}개 세션</div></div>`
        : '';

    if (!messages || messages.length === 0) {
        $msgs.innerHTML = chipHtml + `
        <div class="empty-state">
            <div class="empty-greeting">
                <div class="empty-greeting-name">아리 · SIWOO AI</div>
                <div class="empty-greeting-msg">안녕하세요, 시우씨!</div>
                <div class="empty-greeting-sub">무엇이든 물어보세요.</div>
            </div>
            <div class="suggestion-list">
                <button class="suggestion-chip" data-prompt="오늘 할 일 목록 정리를 도와줘">오늘 할 일 목록 정리를 도와줘</button>
                <button class="suggestion-chip" data-prompt="파이썬 코드 작성 도움을 요청할게">파이썬 코드 작성 도움을 요청할게</button>
                <button class="suggestion-chip" data-prompt="최근 고민이 있는데 함께 생각해줄 수 있어?">최근 고민이 있는데 함께 생각해줄 수 있어?</button>
            </div>
        </div>`;

        $msgs.querySelectorAll('.suggestion-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const $input = document.getElementById('chat-input');
                if (!$input) return;
                $input.value = btn.dataset.prompt;
                $input.dispatchEvent(new Event('input'));
                $input.focus();
            });
        });
        return;
    }

    $msgs.innerHTML = chipHtml;
    for (const msg of messages) {
        _appendBubble(msg.role, msg.content);
    }
    _scrollBottom($msgs);
}

// Append a bubble row. Returns the bubble element.
function _appendBubble(role, content, opts = {}) {
    const $msgs = document.getElementById('messages');
    if (!$msgs) return null;

    // Remove empty state when first message appears
    $msgs.querySelector('.empty-state')?.remove();

    const isAi = role === 'assistant';
    const row   = document.createElement('div');
    row.className = `message-row ${isAi ? 'ai' : 'user'}`;

    if (isAi) {
        const av = document.createElement('div');
        av.className = 'msg-avatar';
        av.textContent = '아';
        row.appendChild(av);
    }

    const bubble = document.createElement('div');

    if (opts.error) {
        bubble.className = 'bubble bubble-error';
        bubble.textContent = content;
    } else if (isAi) {
        bubble.className = 'bubble bubble-ai';
        if (opts.streaming) {
            // Start empty — cursor only
            const cursor = document.createElement('span');
            cursor.className = 'cursor';
            cursor.textContent = '▌';
            bubble.appendChild(cursor);
        } else {
            bubble.innerHTML = _renderMarkdown(content);
        }
    } else {
        bubble.className = 'bubble bubble-user';
        bubble.textContent = content; // pre-wrap via CSS
    }

    row.appendChild(bubble);
    $msgs.appendChild(row);
    _scrollBottom($msgs);
    return bubble;
}

function _scrollBottom(el) {
    if (el) el.scrollTop = el.scrollHeight;
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE Streaming
// ─────────────────────────────────────────────────────────────────────────────
async function _sendMessage() {
    if (_chat.streaming) return;

    const $input = document.getElementById('chat-input');
    const $send  = document.getElementById('btn-send');
    if (!$input || !$send) return;

    const text = $input.value.trim();
    if (!text) return;
    if (!_chat.sessionId) { showToast('세션이 없습니다.'); return; }

    // Clear input
    $input.value = '';
    $input.style.height = 'auto';

    // Render bubbles
    _appendBubble('user', text);
    const $aiBubble = _appendBubble('assistant', '', { streaming: true });

    // UI: streaming mode
    _setStreamingMode(true);

    const token = getToken();
    if (!token) { navigate('/login'); return; }

    _chat.controller = new AbortController();
    _chat.streaming  = true;

    let accumulated = '';
    let finalText   = '';

    try {
        const res = await fetch(API_BASE + '/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ session_id: _chat.sessionId, message: text }),
            signal: _chat.controller.signal,
        });

        if (res.status === 401) {
            clearToken();
            navigate('/login');
            showToast('세션이 만료되었습니다.');
            return;
        }
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.detail || `HTTP ${res.status}`);
        }

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer    = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep possibly incomplete last line

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                let payload;
                try { payload = JSON.parse(line.slice(6)); } catch { continue; }

                if (payload.delta && $aiBubble) {
                    accumulated += payload.delta;
                    // Streaming: show plain escaped text + cursor
                    $aiBubble.innerHTML =
                        _escHtml(accumulated).replace(/\n/g, '<br>') +
                        '<span class="cursor">▌</span>';
                    _scrollBottom(document.getElementById('messages'));
                }

                if (payload.done && $aiBubble) {
                    finalText = payload.full_text || accumulated;
                    $aiBubble.innerHTML = _renderMarkdown(finalText);
                    _scrollBottom(document.getElementById('messages'));
                }

                if (payload.error && $aiBubble) {
                    $aiBubble.className = 'bubble bubble-error';
                    $aiBubble.textContent = payload.error;
                }
            }
        }

    } catch (err) {
        if (err.name === 'AbortError') {
            // Stream was aborted by user
            if ($aiBubble) {
                if (accumulated) {
                    $aiBubble.innerHTML =
                        _renderMarkdown(accumulated) +
                        '<span style="color:#9b9ba2;font-size:12px;margin-left:4px">(중단됨)</span>';
                } else {
                    $aiBubble.className = 'bubble bubble-error';
                    $aiBubble.textContent = '(중단됨)';
                }
            }
        } else {
            if ($aiBubble) {
                $aiBubble.className = 'bubble bubble-error';
                $aiBubble.textContent = `오류: ${err.message}`;
            }
            showToast('메시지 전송에 실패했습니다.');
        }
    } finally {
        _chat.streaming  = false;
        _chat.controller = null;
        _setStreamingMode(false);
        // Refresh session list (title may have been set by server)
        await _loadSessions();
    }
}

function _stopStream() {
    _chat.controller?.abort();
}

function _setStreamingMode(on) {
    const $input = document.getElementById('chat-input');
    const $send  = document.getElementById('btn-send');
    if (!$input || !$send) return;

    $input.disabled = on;
    if (on) {
        $send.classList.add('stop-mode');
        $send.textContent = '■';
        $send.title = '중단';
    } else {
        $send.classList.remove('stop-mode');
        $send.textContent = '▶';
        $send.title = '전송 (Enter)';
        $input.focus();
    }
}

// Auto-resize textarea up to max-height
function _autoResize() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 160) + 'px';
}

// ─────────────────────────────────────────────────────────────────────────────
// SCR-04: Memory Viewer
// ─────────────────────────────────────────────────────────────────────────────
async function renderMemory($app) {
    $app.innerHTML = buildNav('/memory') + `
    <div class="memory-page">
        <div class="memory-body">
            <div class="section-label mono">ACCUMULATED MEMORY</div>
            <div class="memory-header-row">
                <div>
                    <div class="section-title">누적 메모리</div>
                    <div id="memory-count-label" class="section-sub muted"></div>
                </div>
                <button class="btn-danger" id="btn-clear-all">전체 초기화</button>
            </div>
            <div id="memory-list">
                <div class="muted" style="text-align:center;padding:32px;font-size:13px">불러오는 중…</div>
            </div>
        </div>
    </div>`;

    document.getElementById('btn-clear-all').addEventListener('click', _showClearMemoryDialog);
    await _loadMemoryList();
}

async function _loadMemoryList() {
    const res = await apiGet('/memory');
    if (!res || !res.ok) {
        const $list = document.getElementById('memory-list');
        if ($list) $list.innerHTML =
            `<div class="bubble-error" style="max-width:400px">메모리를 불러올 수 없습니다.</div>`;
        return;
    }
    const data = await res.json();
    _renderMemoryList(data);
}

function _renderMemoryList(data) {
    const $list = document.getElementById('memory-list');
    const $cnt  = document.getElementById('memory-count-label');
    if (!$list) return;

    const summaries = data.summaries || [];
    const total     = data.total    || 0;

    if ($cnt) $cnt.textContent = `총 ${total}개 세션`;

    if (summaries.length === 0 && !data.compressed_summary) {
        $list.innerHTML = `
        <div class="empty-memory-card">
            <div class="empty-memory-text">아직 저장된 메모리가 없어요</div>
        </div>`;
        return;
    }

    let html = '';

    // Show compressed summary card if it exists
    if (data.compressed_summary) {
        const bullets = data.compressed_summary.split('\n').filter(l => l.trim());
        const bulletHtml = bullets.map(b =>
            `<div class="bullet-item"><span class="bullet-dot"></span><span>${_escHtml(b.replace(/^[•\-]\s*/, ''))}</span></div>`
        ).join('');
        html += `
        <div class="memory-card memory-card-compressed">
            <div class="memory-card-header">
                <div class="memory-card-meta">
                    <span class="memory-id-chip mono">압축</span>
                    <span class="memory-date mono muted">이전 대화 통합 요약</span>
                </div>
            </div>
            <div class="memory-card-body">${bulletHtml}</div>
        </div>`;
    }

    // Individual summaries (already sorted date desc by server)
    for (const s of summaries) {
        const idNum     = s.id ? s.id.split('_')[1] || '??' : '??';
        const bullets   = (s.content || '').split('\n').filter(l => l.trim());
        const bulletHtml = bullets.map(b =>
            `<div class="bullet-item"><span class="bullet-dot"></span><span>${_escHtml(b.replace(/^[•\-]\s*/, ''))}</span></div>`
        ).join('');
        html += `
        <div class="memory-card" data-id="${_escHtml(s.id)}">
            <div class="memory-card-header">
                <div class="memory-card-meta">
                    <span class="memory-id-chip mono">#${_escHtml(idNum)}</span>
                    <span class="memory-date mono">${_escHtml(s.date || '')}</span>
                </div>
                <button class="btn-mem-delete" data-id="${_escHtml(s.id)}" title="삭제">×</button>
            </div>
            <div class="memory-card-body">${bulletHtml || '<span class="muted" style="font-size:12px">(내용 없음)</span>'}</div>
        </div>`;
    }

    $list.innerHTML = html;

    $list.querySelectorAll('.btn-mem-delete').forEach(btn => {
        btn.addEventListener('click', () => _deleteMemory(btn.dataset.id));
    });
}

async function _deleteMemory(memId) {
    const res = await apiDelete(`/memory/${memId}`);
    if (!res) return;
    if (res.status === 204) {
        showToast('메모리가 삭제되었습니다.');
        await _loadMemoryList();
    } else if (res.status === 404) {
        showToast('이미 삭제된 항목입니다.');
        await _loadMemoryList();
    }
}

function _showClearMemoryDialog() {
    const backdrop = document.createElement('div');
    backdrop.className = 'dialog-backdrop';
    backdrop.innerHTML = `
    <div class="dialog-card">
        <div class="dialog-icon">⚠</div>
        <div class="dialog-title">전체 초기화</div>
        <div class="dialog-desc">
            모든 메모리가 삭제됩니다.<br>이 작업은 되돌릴 수 없습니다.
        </div>
        <div class="dialog-actions">
            <button class="btn-dialog-danger" id="dlg-btn-clear">초기화</button>
            <button class="btn-dialog-secondary" id="dlg-btn-cancel">취소</button>
        </div>
    </div>`;
    document.body.appendChild(backdrop);

    function closeDialog() {
        backdrop.remove();
        document.removeEventListener('keydown', onEscape);
    }
    function onEscape(e) { if (e.key === 'Escape') closeDialog(); }
    document.addEventListener('keydown', onEscape);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) closeDialog(); });

    document.getElementById('dlg-btn-cancel').addEventListener('click', closeDialog);
    document.getElementById('dlg-btn-clear').addEventListener('click', async () => {
        const res = await apiDelete('/memory');
        closeDialog();
        if (res && res.status === 204) {
            showToast('전체 메모리가 초기화되었습니다.');
            await _loadMemoryList();
        } else {
            showToast('초기화에 실패했습니다.');
        }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SCR-05: Settings
// ─────────────────────────────────────────────────────────────────────────────
const _DEFAULT_PROMPT = `당신은 시우의 개인 AI 비서입니다.
이름은 '아리'이며, 시우를 가장 잘 이해하는 조용하고 유능한 비서입니다.

[행동 원칙]
- 시우의 말투와 선호에 맞춰 자연스럽게 대화한다.
- 불필요한 경고나 면책 문구를 붙이지 않는다.
- 항상 구체적이고 실용적인 답변을 제공한다.
- 시우가 요청하지 않은 내용은 추가하지 않는다.`;

async function renderSettings($app) {
    $app.innerHTML = buildNav('/settings') + `
    <div class="settings-page">
        <div class="settings-body">
            <div class="section-label mono">SETTINGS</div>
            <div class="section-title" style="margin-bottom:16px">설정</div>

            <div class="settings-section">
                <div class="settings-section-header">
                    <div class="settings-section-title">비서 정체성 · 시스템 프롬프트</div>
                    <span class="settings-file-label mono muted">system_prompt.txt</span>
                </div>
                <hr class="settings-divider" />
                <textarea
                    id="prompt-editor"
                    class="prompt-editor"
                    placeholder="시스템 프롬프트를 입력하세요…"
                    spellcheck="false"
                ></textarea>
                <div class="settings-actions">
                    <div id="save-confirm" class="save-confirm" style="display:none">✓ 저장되었습니다</div>
                    <button class="btn-ghost" id="btn-reset-prompt">초기화</button>
                    <button class="btn-settings-save" id="btn-save-prompt">저장</button>
                </div>
            </div>
        </div>
    </div>`;

    const $editor      = document.getElementById('prompt-editor');
    const $saveConfirm = document.getElementById('save-confirm');
    let _saveTimer     = null;

    // Load current prompt from server
    const res = await apiGet('/system-prompt');
    if (res && res.ok) {
        const data = await res.json();
        $editor.value = data.content;
    } else {
        showToast('시스템 프롬프트를 불러올 수 없습니다.');
        $editor.value = _DEFAULT_PROMPT;
    }

    // Hide confirmation when user starts editing
    $editor.addEventListener('input', () => {
        $saveConfirm.style.display = 'none';
        if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    });

    // Save
    document.getElementById('btn-save-prompt').addEventListener('click', async () => {
        const content = $editor.value;
        const $btn = document.getElementById('btn-save-prompt');
        $btn.disabled = true;
        $btn.textContent = '저장 중…';

        const res = await apiPut('/system-prompt', { content });
        $btn.disabled = false;
        $btn.textContent = '저장';

        if (res && res.ok) {
            $saveConfirm.style.display = 'block';
            if (_saveTimer) clearTimeout(_saveTimer);
            _saveTimer = setTimeout(() => {
                $saveConfirm.style.display = 'none';
                _saveTimer = null;
            }, 3000);
        } else {
            showToast('저장에 실패했습니다.');
        }
    });

    // Reset to default (no auto-save — user must click 저장)
    document.getElementById('btn-reset-prompt').addEventListener('click', () => {
        $editor.value = _DEFAULT_PROMPT;
        $saveConfirm.style.display = 'none';
        if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────
route();
