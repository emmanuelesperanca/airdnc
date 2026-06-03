// ═══════════════════════════════════════════════════════
//  LOGIN  –  Magic Link via Teams + Power Automate
//
//  Fluxo:
//  1. Usuário digita e-mail → front-end POST para PA (HTTP Trigger)
//  2. PA valida no O365, chama api.py /api/auth/callback
//  3. api.py gera JWT e devolve magic_link para PA
//  4. PA envia Adaptive Card no Teams com o link
//  5. Usuário clica → página abre com ?token=JWT
//  6. Front-end valida token em api.py /api/auth/validate
//  7. Login completo
//
//  URLs carregadas de config.js (não commitado).
//  Copie config.example.js → config.js e preencha.
// ═══════════════════════════════════════════════════════

// Falls back to '' if config.js was not loaded
const PA_LOGIN_URL  = (window.PA_LOGIN_URL  !== undefined) ? window.PA_LOGIN_URL  : '';
const PA_AUDIT_URL  = (window.PA_AUDIT_URL  !== undefined) ? window.PA_AUDIT_URL  : '';
const API_BASE_URL  = (window.API_BASE_URL  !== undefined) ? window.API_BASE_URL  : 'http://localhost:5000';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

// ── 1. Verifica token JWT na URL (pouso do magic link) ──────────────────────
async function checkMagicToken() {
  const params = new URLSearchParams(window.location.search);
  const token  = params.get('token');
  if (!token) return false;

  // Limpa o token da barra de endereço sem recarregar a página
  const cleanUrl = window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);

  setLoginLoading(true);
  showLoginMessage('Validando seu link seguro...', '');
  showLoginScreen();

  try {
    const resp = await fetch(`${API_BASE_URL}/api/auth/validate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token })
    });

    const data = await resp.json();

    if (!resp.ok) {
      const msgs = {
        link_expired:  'Este link expirou. Solicite um novo acesso digitando seu e-mail.',
        invalid_token: 'Link inválido ou já utilizado. Solicite um novo acesso.'
      };
      throw new Error(msgs[data.error] || 'Erro ao validar o link. Tente novamente.');
    }

    completeLogin({
      email:   data.email,
      name:    data.name,
      dept:    data.dept     || '',
      location:data.location || '',
      isAdmin: !!data.isAdmin
    });
    sendAuditEvent({ type: 'login', email: data.email, status: 'success', user_name: data.name });
    return true;

  } catch (err) {
    showLoginMessage(err.message, 'error');
    setLoginLoading(false);
    return false;
  }
}

// ── 2. Verifica se a sessão local ainda é válida ────────────────────────────
function checkLoginSession() {
  const session = state.loginSession;
  if (!session || !session.loginAt) return false;
  return (Date.now() - new Date(session.loginAt).getTime()) < SESSION_TTL_MS;
}

function showLoginScreen() {
  document.getElementById('login-overlay').style.display = 'flex';
}

function hideLoginScreen() {
  document.getElementById('login-overlay').style.display = 'none';
}

// ── 3. Chamado pelo botão "Entrar via Teams" ─────────────────────────────────
async function doLogin() {
  const emailInput = document.getElementById('login-email');
  const email = emailInput.value.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showLoginMessage('Informe um e-mail corporativo válido.', 'error');
    emailInput.focus();
    return;
  }

  // ── Modo dev: sem URLs configuradas → login automático ──
  if (!PA_LOGIN_URL && !API_BASE_URL.includes('localhost') === false) {
    setLoginLoading(true);
    await new Promise(r => setTimeout(r, 600));
    const rawName = email.split('@')[0].replace(/[._-]/g, ' ');
    const devName = rawName.replace(/\b\w/g, c => c.toUpperCase());
    completeLogin({ email, name: devName, dept: 'Desenvolvimento (Dev)', isAdmin: false });
    setLoginLoading(false);
    return;
  }

  // ── Fluxo real: dispara para o Power Automate ──
  setLoginLoading(true, 'sending');

  try {
    const resp = await fetch(PA_LOGIN_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email })
    });

    if (resp.status === 401 || resp.status === 403) {
      throw new Error('E-mail não encontrado ou não autorizado no diretório corporativo.');
    }
    if (!resp.ok) throw new Error(`Erro no servidor (${resp.status}). Tente novamente.`);

    // Sucesso: PA recebeu a solicitação e vai enviar o card no Teams
    setLoginWaiting(email);

  } catch (err) {
    showLoginMessage(err.message, 'error');
    setLoginLoading(false);
    sendAuditEvent({ type: 'login_fail', email, status: 'fail', error_msg: err.message });
  }
}

// ── 4. Finaliza login e atualiza estado ─────────────────────────────────────
function completeLogin(session) {
  state.loginSession = { ...session, loginAt: new Date().toISOString() };
  state.user = {
    name:     session.name,
    dept:     session.dept     || '',
    location: session.location || '',
    email:    session.email,
    isAdmin:  !!session.isAdmin,
    myDesk:   (state.user && state.user.myDesk) ? state.user.myDesk : ''
  };
  saveState();
  hideLoginScreen();
  updateSidebarUser();
  renderDesks();
  if (typeof refreshDashboard === 'function') refreshDashboard();
  showToast(`Bem-vindo(a), ${session.name.split(' ')[0]}! 🎉`);
}

// ── 5. Logout ────────────────────────────────────────────────────────────────
function doLogout() {
  if (!confirm('Sair da sessão atual?')) return;
  sendAuditEvent({
    type:      'logout',
    email:     (state.loginSession || {}).email,
    user_name: (state.user || {}).name
  });
  state.loginSession = null;
  saveState();
  // Reseta UI do overlay
  document.getElementById('login-email').value = '';
  document.getElementById('login-btn').textContent = 'Entrar via Teams';
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-spinner').style.display = 'none';
  document.getElementById('login-waiting').style.display = 'none';
  showLoginMessage('', '');
  showLoginScreen();
  updateSidebarUser();
  renderDesks();
}

// ── Helpers de UI ────────────────────────────────────────────────────────────
function setLoginLoading(on, phase) {
  const btn     = document.getElementById('login-btn');
  const spinner = document.getElementById('login-spinner');
  const waiting = document.getElementById('login-waiting');
  btn.disabled          = on;
  btn.textContent       = on ? 'Enviando...' : 'Entrar via Teams';
  spinner.style.display = on ? 'flex' : 'none';
  waiting.style.display = 'none';
  if (!on) document.getElementById('login-message').style.display = 'none';
}

function setLoginWaiting(email) {
  const btn     = document.getElementById('login-btn');
  const spinner = document.getElementById('login-spinner');
  const waiting = document.getElementById('login-waiting');
  btn.disabled          = true;
  btn.textContent       = 'Link enviado';
  spinner.style.display = 'none';
  waiting.style.display = 'flex';
  document.getElementById('login-waiting-email').textContent = email;
  document.getElementById('login-message').style.display = 'none';
}

function showLoginMessage(msg, type) {
  const el = document.getElementById('login-message');
  el.textContent = msg;
  el.className = 'login-message ' + (type || '');
  el.style.display = msg ? 'block' : 'none';
}

// ── Envio de auditoria (non-blocking) ───────────────────────────────────────
async function sendAuditEvent(payload) {
  const url = PA_AUDIT_URL || (API_BASE_URL ? `${API_BASE_URL}/api/audit` : '');
  if (!url) return;
  try {
    await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        ...payload,
        app:        'airdnc',
        user_agent: navigator.userAgent,
        timestamp:  new Date().toISOString()
      })
    });
  } catch { /* falhas de auditoria não bloqueiam o app */ }
}
