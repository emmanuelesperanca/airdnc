// ═══════════════════════════════════════════════════════
//  LOGIN  –  Power Automate / Teams validation
//
//  URLs são carregadas de config.js (não commitado no git).
//  Copie config.example.js → config.js e preencha as URLs.
// ═══════════════════════════════════════════════════════

// Falls back to '' if config.js was not loaded
const PA_LOGIN_URL = (window.PA_LOGIN_URL !== undefined) ? window.PA_LOGIN_URL : '';
const PA_AUDIT_URL = (window.PA_AUDIT_URL !== undefined) ? window.PA_AUDIT_URL : '';

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

// ── Verifica se a sessão atual ainda é válida ──
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

// ── Chamado pelo botão "Entrar" ──
async function doLogin() {
  const emailInput = document.getElementById('login-email');
  const email = emailInput.value.trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showLoginMessage('Informe um e-mail corporativo válido.', 'error');
    emailInput.focus();
    return;
  }

  setLoginLoading(true);

  // Sem URL configurada → modo dev: login automático com o prefixo do e-mail
  if (!PA_LOGIN_URL) {
    await new Promise(r => setTimeout(r, 500));
    const rawName = email.split('@')[0].replace(/[._]/g, ' ');
    const devName = rawName.replace(/\b\w/g, c => c.toUpperCase());
    completeLogin({ email, name: devName, dept: 'Desenvolvimento', isAdmin: false });
    setLoginLoading(false);
    return;
  }

  try {
    const resp = await fetch(PA_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        action: 'validate_user',
        app: 'airdnc',
        timestamp: new Date().toISOString()
      })
    });

    if (resp.status === 401 || resp.status === 403) {
      throw new Error('E-mail não autorizado. Verifique se você faz parte do grupo AirDnC no Teams.');
    }
    if (!resp.ok) throw new Error(`Erro ao validar (${resp.status}). Tente novamente.`);

    const data = await resp.json();
    completeLogin({
      email,
      name:    data.displayName || data.name,
      dept:    data.department  || data.dept || '',
      isAdmin: !!data.isAdmin
    });
    sendAuditEvent({ type: 'login', email, status: 'success', user_name: data.displayName || data.name });

  } catch (err) {
    showLoginMessage(err.message, 'error');
    sendAuditEvent({ type: 'login_fail', email, status: 'fail', error_msg: err.message });
  } finally {
    setLoginLoading(false);
  }
}

// ── Finaliza login e atualiza estado ──
function completeLogin(session) {
  state.loginSession = { ...session, loginAt: new Date().toISOString() };
  state.user = {
    name:    session.name,
    dept:    session.dept,
    email:   session.email,
    isAdmin: !!session.isAdmin,
    myDesk:  (state.user && state.user.myDesk) ? state.user.myDesk : ''
  };
  saveState();
  hideLoginScreen();
  updateSidebarUser();
  renderDesks();
  if (typeof refreshDashboard === 'function') refreshDashboard();
  showToast(`Bem-vindo(a), ${session.name.split(' ')[0]}!`);
}

// ── Logout ──
function doLogout() {
  if (!confirm('Sair da sessão atual?')) return;
  sendAuditEvent({
    type:      'logout',
    email:     (state.loginSession || {}).email,
    user_name: (state.user || {}).name
  });
  state.loginSession = null;
  saveState();
  document.getElementById('login-email').value = '';
  showLoginMessage('', '');
  showLoginScreen();
  updateSidebarUser();
  renderDesks();
}

// ── Helpers de UI ──
function setLoginLoading(on) {
  const btn     = document.getElementById('login-btn');
  const spinner = document.getElementById('login-spinner');
  btn.disabled        = on;
  btn.textContent     = on ? 'Validando...' : 'Entrar';
  spinner.style.display = on ? 'flex' : 'none';
  if (!on) document.getElementById('login-message').style.display = 'none';
}

function showLoginMessage(msg, type) {
  const el = document.getElementById('login-message');
  el.textContent = msg;
  el.className = 'login-message ' + (type || '');
  el.style.display = msg ? 'block' : 'none';
}

// ── Envia evento de auditoria ao Power Automate (non-blocking) ──
async function sendAuditEvent(payload) {
  if (!PA_AUDIT_URL) return;
  try {
    await fetch(PA_AUDIT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        app:        'airdnc',
        user_agent: navigator.userAgent,
        timestamp:  new Date().toISOString()
      })
    });
  } catch { /* falhas de auditoria não bloqueiam o app */ }
}
