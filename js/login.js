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
// ── Presença: define o status do usuário logado para uma data ──────────────────────────────
// silent=true: não re-renderiza nem exibe toast (picker.js gerencia em lote)
async function setMyPresence(type, date, silent = false) {
  if (!state.user || !state.user.name) {
    if (!silent) showToast('Faça login para registrar sua presença.');
    return;
  }

  // 1. Atualiza state local imediatamente (UI instantânea)
  const prev = ((state.presence || {})[date] || {})[state.user.name];
  if (!state.presence[date]) state.presence[date] = {};
  state.presence[date][state.user.name] = type;
  saveState();

  if (!silent) {
    if (typeof renderPresenceSection === 'function') renderPresenceSection();
    if (typeof renderDesks === 'function') renderDesks();
  }

  const p = PRESENCE_TYPES[type];

  // 2. Persiste no banco de dados via API (não bloqueia a UI)
  _persistPresenceToApi(type, date, p.eventTitle).catch(err =>
    console.warn('Presence API write failed:', err)
  );

  if (type === 'office') {
    if (!silent) {
      showToast(`✅ Status atualizado: ${p.label}`);
      if (prev && prev !== 'office') {
        showToast('Lembre-se de remover o evento da sua agenda no Teams se necessário.', 4000);
      }
    }
    return;
  }

  // 3. Cria evento no Teams Calendar via Power Automate
  if (!silent) await createCalendarEvent(type, date);
}

// Grava um registro de presença no banco via POST /api/presence
async function _persistPresenceToApi(type, date, eventTitle, extraFields = {}) {
  const apiBase = window.API_BASE_URL || '';
  if (!apiBase) return;
  const user = state.user;
  try {
    await fetch(`${apiBase}/api/presence`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        user_email:    user.email || '',
        user_name:     user.name,
        department:    user.dept  || '',
        team_name:     user.team  || '',
        presence_type: type,
        presence_date: date,
        event_title:   eventTitle || '',
        source:        'app',
        ...extraFields
      })
    });
  } catch { /* não bloqueia o app */ }
}

// ── Cria evento de dia-inteiro na agenda do Teams via Power Automate ───────────────────────
async function createCalendarEvent(type, date) {
  const p     = PRESENCE_TYPES[type];
  const user  = state.user;
  const paUrl = window.PA_CREATE_EVENT_URL || '';

  const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });

  if (!paUrl) {
    // Modo dev: simula sucesso (DB já foi gravado em _persistPresenceToApi)
    const icon = type === 'home' ? '🏠' : type === 'fabrica' ? '🏭' : '⏱️';
    showToast(`${icon} ${p.label} registrado para ${dateFormatted}!`);
    return;
  }

  try {
    const resp = await fetch(paUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        email:      user.email || '',
        user_name:  user.name,
        type,
        date,
        event_title: `${p.eventTitle} - ${user.name.split(' ')[0]}`,
        app: 'airdnc'
      })
    });

    if (resp.ok) {
      const icon = type === 'home' ? '🏠' : type === 'fabrica' ? '🏭' : '⏱️';
      showToast(`${icon} Evento criado na sua agenda do Teams para ${dateFormatted}!`);
      sendAuditEvent({ type: 'calendar_event_created', email: user.email, status: 'success',
        user_name: user.name, event_type: type, event_date: date });
    } else {
      showToast('Presença salva no sistema. Falha ao criar evento no Teams — crie manualmente.', 4000);
    }
  } catch {
    showToast('Presença salva no sistema. Sem conexão com o Teams agora.', 3500);
  }
}

// ── Busca presença de todas as equipes via API Python (banco de dados) ─────────────────────
async function fetchTeamPresence(date) {
  const btn     = document.getElementById('btn-refresh-presence');
  const apiBase = window.API_BASE_URL || '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined spin" style="font-size:14px;">progress_activity</span>Buscando...';
  }

  if (!apiBase) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">refresh</span>Atualizar'; }
    renderPresenceSection();
    showToast('Configure API_BASE_URL para buscar presença do servidor.', 3000);
    return;
  }

  try {
    const resp = await fetch(`${apiBase}/api/presence?date=${encodeURIComponent(date)}`);

    if (!resp.ok) throw new Error(`API respondeu ${resp.status}`);
    const data = await resp.json();

    // data: { date, persisted, presence: { Nome: 'home'|... }, teams: { 'Time X': {...} } }
    if (data.presence && Object.keys(data.presence).length) {
      if (!state.presence[date]) state.presence[date] = {};
      // Dados do DB têm precedência sobre localStorage
      Object.assign(state.presence[date], data.presence);
    }
    if (data.teams && Object.keys(data.teams).length) {
      if (!state.teamPresence)       state.teamPresence = {};
      if (!state.teamPresence[date]) state.teamPresence[date] = {};
      Object.assign(state.teamPresence[date], data.teams);
    }
    state.teamPresenceLoadedAt = new Date().toISOString();
    saveState();

    renderPresenceSection();
    renderDesks();
    showToast('Presença atualizada!');

  } catch (err) {
    console.warn('fetchTeamPresence error:', err);
    renderPresenceSection();
    showToast('Não foi possível buscar presença do servidor. Exibindo dados locais.', 3500);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">refresh</span>Atualizar';
    }
  }
}