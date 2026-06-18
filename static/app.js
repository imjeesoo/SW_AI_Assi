'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN_KEY = 'siwoo_token';
const API_BASE  = '/api';

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────────────────────
function getToken()    { return localStorage.getItem(TOKEN_KEY); }
function setToken(t)   { localStorage.setItem(TOKEN_KEY, t); }
function clearToken()  { localStorage.removeItem(TOKEN_KEY); }

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

        if (res.status === 401) {
            clearToken();
            navigate('/login');
            showToast('세션이 만료되었습니다. 다시 로그인해주세요.');
            return null;
        }
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
        if (res.status === 401) {
            clearToken();
            navigate('/login');
            showToast('세션이 만료되었습니다. 다시 로그인해주세요.');
            return null;
        }
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

    // Auth guard
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
function buildNav(activePath) {
    const tabs = [
        { label: '채팅',  path: '/'         },
        { label: '메모리', path: '/memory'   },
        { label: '설정',  path: '/settings' },
    ];
    const tabsHtml = tabs.map(t => {
        const cls = activePath === t.path ? 'nav-tab active' : 'nav-tab';
        return `<button class="${cls}" onclick="navigate('${t.path}')">${t.label}</button>`;
    }).join('');

    return `
    <nav class="topnav">
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
    $input.addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SCR-02: Chat (Phase 2/3 stub)
// ─────────────────────────────────────────────────────────────────────────────
function renderChat($app) {
    $app.innerHTML = buildNav('/') + `
    <div class="placeholder-view">
        <div class="placeholder-card">
            <p class="placeholder-phase">채팅 화면</p>
            <p class="muted" style="font-size:13px;line-height:1.6">
                Phase 2(백엔드)와 Phase 3(프론트엔드) 완료 후 사용 가능합니다.<br>
                로그인이 정상적으로 완료되었습니다.
            </p>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCR-04: Memory Viewer (Phase 5 stub)
// ─────────────────────────────────────────────────────────────────────────────
function renderMemory($app) {
    $app.innerHTML = buildNav('/memory') + `
    <div class="placeholder-view">
        <div class="placeholder-card">
            <p class="placeholder-phase">메모리 뷰어</p>
            <p class="muted" style="font-size:13px;line-height:1.6">
                Phase 4(메모리 시스템)와 Phase 5(뷰어 UI) 완료 후 사용 가능합니다.
            </p>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCR-05: Settings (Phase 5 stub)
// ─────────────────────────────────────────────────────────────────────────────
function renderSettings($app) {
    $app.innerHTML = buildNav('/settings') + `
    <div class="placeholder-view">
        <div class="placeholder-card">
            <p class="placeholder-phase">설정</p>
            <p class="muted" style="font-size:13px;line-height:1.6">
                Phase 5(설정 화면) 완료 후 사용 가능합니다.
            </p>
        </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────────────────
route();
