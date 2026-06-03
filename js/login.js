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
async function setMyPresence(type, date) {
  if (!state.user || !state.user.name) {
    showToast('Faça login para registrar sua presença.');
    return;
  }

  const prev = ((state.presence || {})[date] || {})[state.user.name];
  if (!state.presence[date]) state.presence[date] = {};
  state.presence[date][state.user.name] = type;
  saveState();

  // Atualiza dashboard e mapa imediatamente
  if (typeof renderPresenceSection === 'function') renderPresenceSection();
  if (typeof renderDesks === 'function') renderDesks();

  const p = PRESENCE_TYPES[type];
  if (type === 'office') {
    showToast(`✅ Status atualizado: ${p.label}`);
    // Se havia um evento criado pelo app, poderia cancelar — por simplicidade, apenas notifica
    if (prev && prev !== 'office') {
      showToast('Lembre-se de remover o evento da sua agenda no Teams se necessário.', 4000);
    }
    return;
  }

  // Para home/fábrica: cria evento na agenda do Teams via Power Automate
  await createCalendarEvent(type, date);
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
    // Modo dev: simula sucesso
    const icon = type === 'home' ? '🏠' : type === 'fabrica' ? '🏧' : '⏱️';
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
      const icon = type === 'home' ? '🏠' : type === 'fabrica' ? '🏧' : '⏱️';
      showToast(`${icon} Evento criado na sua agenda do Teams para ${dateFormatted}!`);
      sendAuditEvent({ type: 'calendar_event_created', email: user.email, status: 'success',
        user_name: user.name, event_type: type, event_date: date });
    } else {
      showToast('Presença registrada, mas falha ao criar evento no Teams. Crie manualmente.', 4000);
    }
  } catch {
    showToast('Presença registrada localmente. Sem conexão com o Teams agora.', 3500);
  }
}

// ── Busca presença de todas as equipes via Power Automate ──────────────────────────────────
async function fetchTeamPresence(date) {
  const btn = document.getElementById('btn-refresh-presence');
  const paUrl = window.PA_PRESENCE_URL || '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined spin" style="font-size:14px;">progress_activity</span>Buscando...';
  }

  // Sem URL: aplica dados auto-relatados (state.presence) como fonte de equipes
  if (!paUrl) {
    _applyLocalPresenceToTeams(date);
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">refresh</span>Atualizar'; }
    renderPresenceSection();
    showToast('Dados de presença das equipes atualizados (local).');
    return;
  }

  try {
    const resp = await fetch(paUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ date, app: 'airdnc' })
    });

    if (!resp.ok) throw new Error(`PA respondeu ${resp.status}`);
    const data = await resp.json();

    // Estrutura esperada do PA: { presence: { 'Nome': 'home'|'fabrica'|'office', ... },
    //                             teams: { 'Time X': { home, fabrica, office, total }, ... } }
    if (data.presence) {
      if (!state.presence[date]) state.presence[date] = {};
      Object.assign(state.presence[date], data.presence);
    }
    if (data.teams) {
      if (!state.teamPresence) state.teamPresence = {};
      if (!state.teamPresence[date]) state.teamPresence[date] = {};
      Object.assign(state.teamPresence[date], data.teams);
    }
    state.teamPresenceLoadedAt = new Date().toISOString();
    saveState();
    renderPresenceSection();
    renderDesks();
    showToast('Presença das equipes atualizada!');

  } catch (err) {
    _applyLocalPresenceToTeams(date);
    showToast('Não foi possível conectar ao Teams. Mostrando dados locais.', 3500);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:14px;">refresh</span>Atualizar'; }
    renderPresenceSection();
  }
}

// Agrega state.presence (auto-relatados) em state.teamPresence para exibição
function _applyLocalPresenceToTeams(date) {
  const dayPres = (state.presence || {})[date] || {};
  if (!state.teamPresence) state.teamPresence = {};
  if (!state.teamPresence[date]) state.teamPresence[date] = {};

  // Conta por equipe a partir das mesas (DUMMY_DESKS → owner → team)
  const teamCounts = {};
  const deskMap = {};
  // Monta mapa nome → equipe para as mesas do andar
  if (typeof DUMMY_DESKS !== 'undefined') {
    DUMMY_DESKS.forEach(({ owner }) => {
      if (!teamCounts[owner]) teamCounts[owner] = { home: 0, fabrica: 0, office: 0, total: 0 };
    });
    // Conta mesas por equipe
    DUMMY_DESKS.forEach(({ owner }) => teamCounts[owner].total++);
  }

  // Aplica presenças conhecidas
  Object.entries(dayPres).forEach(([name, status]) => {
    if (teamCounts[name]) {
      // É um nome de equipe direto — improvável mas tratado
      teamCounts[name][status] = (teamCounts[name][status] || 0) + 1;
    }
    // Verifica se o nome é de um membro individual ligado a um team
    // (Para a versão completa, isso viria do PA)
  });

  Object.assign(state.teamPresence[date], teamCounts);
  state.teamPresenceLoadedAt = new Date().toISOString();
  saveState();
}