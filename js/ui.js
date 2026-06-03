// ═══════════════════════════════════════════════════════
//  DESK STATUS LOGIC
// ═══════════════════════════════════════════════════════
function isAvailableOnDate(desk, dateStr) {
  const av = desk.availability;
  if (!av || av.type === 'none') return false;
  if (av.type === 'specific') return (av.dates || []).includes(dateStr);
  if (av.type === 'recurring') {
    const d = new Date(dateStr + 'T12:00:00');
    const wd = d.getDay(); // 0=Sun..6=Sat
    if (!(av.recurrence.weekdays || []).includes(wd)) return false;
    if (av.recurrence.startDate && dateStr < av.recurrence.startDate) return false;
    if (av.recurrence.endDate && dateStr > av.recurrence.endDate) return false;
    return true;
  }
  return false;
}

function isAdmin() {
  return state.user.isAdmin === true ||
         (state.user.name || '').toLowerCase() === 'emmanuel';
}

function getDeskStatus(deskId) {
  const user = state.user;
  const desk = state.desks[deskId];
  const isMine = user.myDesk && parseInt(user.myDesk) === deskId;

  const booking = state.bookings.find(b => b.deskId === deskId && b.date === currentDate && b.status !== 'cancelled');
  if (booking) return booking.status === 'active' ? 'occupied' : 'reserved';

  // Hot desks (Livre) — always available on weekdays
  if (desk.hotDesk) {
    const wd = new Date(currentDate + 'T12:00:00').getDay();
    return (wd >= 1 && wd <= 5) ? 'available' : 'mine';
  }

  if (isMine) return isAvailableOnDate(desk, currentDate) ? 'available' : 'mine';
  return isAvailableOnDate(desk, currentDate) ? 'available' : 'mine';
}

function getDeskStatusLabel(status) {
  const map = { available:'Disponível', reserved:'Reservada', occupied:'Ocupada', mine:'Pertence a alguém' };
  return map[status] || status;
}

function getDeskStatusColor(status) {
  const map = { available:'#22c55e', reserved:'#f59e0b', occupied:'#ef4444', mine:'#6366f1' };
  return map[status] || '#94a3b8';
}

// ═══════════════════════════════════════════════════════
//  RENDER FLOOR DESKS
// ═══════════════════════════════════════════════════════
function renderDesks() {
  const fp = document.getElementById('floorPlan');

  // Remove existing desks & pilasters
  fp.querySelectorAll('.desk, .fp-pilaster, .fp-gap-label').forEach(e => e.remove());

  // Render pilasters
  PILASTERS.forEach(p => {
    const el = document.createElement('div');
    el.className = 'pilaster fp-pilaster';
    el.style.cssText = `top:${p.top}px;left:${p.left}px;width:${p.w}px;height:${p.h}px;`;
    fp.appendChild(el);
  });

  // Render desks
  DESK_LAYOUT.forEach(d => {
    const deskData = state.desks[d.id];
    const status = getDeskStatus(d.id);

    const btn = document.createElement('button');
    btn.className = 'desk';
    btn.dataset.id = d.id;
    btn.dataset.status = status;
    btn.style.cssText = `top:${d.top}px;left:${d.left}px;`;

    const amenityIcon = hasEquipment(deskData.amenities) ? 'desktop_windows' : 'desk';
    const ownerTag = deskData.owner
      ? `<span class="desk-owner-name">${deskData.owner}</span>`
      : (deskData.hotDesk ? `<span class="desk-owner-name" style="color:#10b981;">&#x2736; Rotativa</span>` : '');
    if (deskData.hotDesk) btn.dataset.hotdesk = 'true';
    btn.title = `${d.label}${deskData.owner ? ' · ' + deskData.owner : ''} — ${getDeskStatusLabel(status)}`;

    btn.innerHTML = `
      <div class="dot"></div>
      <span class="material-symbols-outlined desk-icon">${amenityIcon}</span>
      <span class="desk-name">${d.label}</span>
      ${ownerTag}
    `;
    btn.addEventListener('click', () => selectDesk(d.id));
    fp.appendChild(btn);
  });

  // Re-apply active equipment filters after re-render
  applyDeskFilter();
}

// ═══════════════════════════════════════════════════════
//  INFO PANEL
// ═══════════════════════════════════════════════════════
function selectDesk(id) {
  selectedDeskId = id;

  // Highlight selected
  document.querySelectorAll('.desk').forEach(d => {
    d.style.outline = d.dataset.id == id ? '2.5px solid #565e74' : '';
    d.style.outlineOffset = d.dataset.id == id ? '2px' : '';
  });

  refreshInfoPanel();
}

function refreshInfoPanel() {
  if (!selectedDeskId) return;

  const id = selectedDeskId;
  const desk = state.desks[id];
  const status = getDeskStatus(id);
  const user = state.user;
  const isMine = user.myDesk && parseInt(user.myDesk) === id;

  const booking = state.bookings.find(b => b.deskId === id && b.date === currentDate && b.status !== 'cancelled');
  const myBooking = state.bookings.find(b => b.deskId === id && b.date === currentDate && b.bookedBy === user.name && b.status !== 'cancelled');

  document.getElementById('info-empty').style.display = 'none';
  document.getElementById('info-content').style.display = 'flex';

  document.getElementById('info-name').textContent = desk.label;

  // Status badge
  const badge = document.getElementById('info-status-badge');
  const color = getDeskStatusColor(status);
  badge.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>${getDeskStatusLabel(status)}`;
  badge.style.color = color;

  // Owner row
  const ownerRow = document.getElementById('info-owner-row');
  const ownerAvatarEl = document.getElementById('info-owner-avatar');
  const ownerSubtitle = document.getElementById('info-owner-subtitle');
  if (desk.hotDesk) {
    ownerRow.style.display = 'flex';
    document.getElementById('info-owner-name').textContent = desk.owner || 'Mesa Rotativa';
    ownerAvatarEl.textContent = desk.owner ? desk.owner.charAt(0).toUpperCase() : '✶';
    ownerAvatarEl.style.background = desk.owner ? '#6366f1' : '#10b981';
    ownerAvatarEl.style.fontSize = desk.owner ? '' : '18px';
    if (ownerSubtitle) ownerSubtitle.textContent = desk.owner
      ? `Mesa rotativa — ${desk.owner}`
      : 'Disponível todos os dias úteis';
  } else if (desk.owner) {
    ownerRow.style.display = 'flex';
    document.getElementById('info-owner-name').textContent = desk.owner;
    ownerAvatarEl.textContent = desk.owner.charAt(0).toUpperCase();
    ownerAvatarEl.style.background = '#565e74';
    ownerAvatarEl.style.fontSize = '';
    if (ownerSubtitle) ownerSubtitle.textContent = 'Responsável pela mesa';
  } else {
    ownerRow.style.display = 'none';
  }

  // Amenities
  const amenitiesEl = document.getElementById('info-amenities');
  const noAmenitiesEl = document.getElementById('info-no-amenities');
  amenitiesEl.innerHTML = '';
  const amenityLines = buildAmenityLines(desk.amenities);
  if (amenityLines.length > 0) {
    noAmenitiesEl.style.display = 'none';
    amenityLines.forEach(({ icon, label }) => {
      const row = document.createElement('div');
      row.className = 'amenity-row';
      row.innerHTML = `<div class="amenity-icon"><span class="material-symbols-outlined">${icon}</span></div><span style="font-size:14px;font-weight:600;color:#1e2a30;">${label}</span>`;
      amenitiesEl.appendChild(row);
    });
  } else {
    noAmenitiesEl.style.display = 'block';
  }

  // Notes
  const notesRow = document.getElementById('info-notes-row');
  if (desk.notes) {
    notesRow.style.display = 'block';
    document.getElementById('info-notes').textContent = desk.notes;
  } else {
    notesRow.style.display = 'none';
  }

  // Buttons logic
  ['btn-book','btn-cancel-booking','btn-list','btn-unlist','btn-edit'].forEach(bid =>
    document.getElementById(bid).style.display = 'none');

  const availRow = document.getElementById('info-avail-row');
  const availSummaryEl = document.getElementById('info-avail-summary');
  const adminMode = isAdmin();
  const isHotDesk = !!desk.hotDesk;

  function renderAvailSummary(av) {
    if (!av || av.type === 'none') {
      availSummaryEl.className = 'avail-summary none';
      availSummaryEl.innerHTML = '<span style="font-size:12px;color:#94a3b8;font-weight:600;">Não disponibilizada para reserva</span>';
    } else if (av.type === 'specific') {
      const today = new Date().toISOString().slice(0,10);
      const future = (av.dates||[]).filter(x => x >= today).length;
      const total = (av.dates||[]).length;
      availSummaryEl.className = 'avail-summary';
      availSummaryEl.innerHTML = `<span style="font-size:12px;color:#15803d;font-weight:700;">&#128197; ${total} data(s) espec&iacute;fica(s) &middot; ${future} futuras</span>`;
    } else if (av.type === 'recurring') {
      const wdNames = (av.recurrence.weekdays||[]).slice().sort().map(w => WD_LABELS[w]).join(', ');
      const rangeStr = av.recurrence.endDate ? ` &middot; at&eacute; ${av.recurrence.endDate}` : '';
      availSummaryEl.className = 'avail-summary recurring';
      availSummaryEl.innerHTML = `<span style="font-size:12px;color:#1d4ed8;font-weight:700;">&#128260; Toda semana: ${wdNames||'—'}${rangeStr}</span>`;
    }
  }

  if (isHotDesk) {
    // ── Hot desk: always available ──
    availRow.style.display = 'block';
    availSummaryEl.className = 'avail-summary';
    availSummaryEl.innerHTML = '<span style="font-size:12px;color:#10b981;font-weight:700;">&#x2736; Mesa rotativa — dispon&iacute;vel todos os dias &uacute;teis</span>';
    if (adminMode) document.getElementById('btn-edit').style.display = 'block';
    if (myBooking) {
      document.getElementById('btn-cancel-booking').style.display = 'block';
    } else if (status === 'available') {
      document.getElementById('btn-book').style.display = 'block';
    }
  } else if (isMine || adminMode) {
    // ── Desk owner or admin: full management ──
    availRow.style.display = 'block';
    renderAvailSummary(desk.availability);
    document.getElementById('btn-edit').style.display = 'block';
    document.getElementById('btn-list').style.display = 'block';
    if (desk.availability && desk.availability.type !== 'none') {
      document.getElementById('btn-unlist').style.display = 'block';
    }
    // Admin can also book/cancel if the desk is available and not their own
    if (!isMine && status === 'available' && !myBooking) {
      document.getElementById('btn-book').style.display = 'block';
    } else if (!isMine && myBooking) {
      document.getElementById('btn-cancel-booking').style.display = 'block';
    }
  } else {
    // ── Regular user on someone else's named desk ──
    availRow.style.display = 'none';
    if (status === 'available') {
      if (myBooking) document.getElementById('btn-cancel-booking').style.display = 'block';
      else document.getElementById('btn-book').style.display = 'block';
    } else if (myBooking) {
      document.getElementById('btn-cancel-booking').style.display = 'block';
    }
  }
}

function closeInfoPanel() {
  selectedDeskId = null;
  document.querySelectorAll('.desk').forEach(d => { d.style.outline=''; d.style.outlineOffset=''; });
  document.getElementById('info-empty').style.display = 'flex';
  document.getElementById('info-content').style.display = 'none';
}

// ═══════════════════════════════════════════════════════
//  SIDEBAR USER
// ═══════════════════════════════════════════════════════
function updateSidebarUser() {
  const name = state.user.name || '?';
  const initials = name !== '?' ? name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '?';
  document.getElementById('sidebar-name').textContent = name !== '?' ? name : 'Não identificado';
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('topbar-avatar').textContent = initials;
  const adminBadge = document.getElementById('admin-badge');
  if (adminBadge) adminBadge.style.display = isAdmin() ? 'inline-flex' : 'none';
}

// ═══════════════════════════════════════════════════════
//  SETTINGS PAGE
// ═══════════════════════════════════════════════════════
function populateDeskSelects() {
  const selects = ['settings-mydesk','quick-mydesk'];
  selects.forEach(sid => {
    const sel = document.getElementById(sid);
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '<option value="">-- Nenhuma --</option>';
    DESK_LAYOUT.sort((a,b)=>a.id-b.id).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.label;
      sel.appendChild(opt);
    });
    sel.value = current || state.user.myDesk || '';
  });
}

function saveSettings() {
  const name = document.getElementById('settings-name').value.trim();
  if (!name) { showToast('Informe seu nome.'); return; }
  state.user.name = name;
  state.user.dept = document.getElementById('settings-dept').value.trim();
  state.user.myDesk = document.getElementById('settings-mydesk').value;
  saveState();
  updateSidebarUser();
  renderDesks();
  refreshDashboard();
  showToast('Perfil salvo!');
}

function loadSettingsPage() {
  document.getElementById('settings-name').value = state.user.name || '';
  document.getElementById('settings-dept').value = state.user.dept || '';
  populateDeskSelects();
  document.getElementById('settings-mydesk').value = state.user.myDesk || '';
}

// ═══════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════
function refreshDashboard() {
  const counts = { available:0, reserved:0, occupied:0, mine:0 };
  DESK_LAYOUT.forEach(d => {
    counts[getDeskStatus(d.id)]++;
  });
  document.getElementById('stat-available').textContent = counts.available;
  document.getElementById('stat-reserved').textContent = counts.reserved;
  document.getElementById('stat-occupied').textContent = counts.occupied;
  document.getElementById('stat-total').textContent = DESK_LAYOUT.length;

  const user = state.user;
  const nameDisplay = user.name ? `Bom dia, ${user.name.split(' ')[0]}! 👋` : 'Bom dia! 👋';
  document.getElementById('dash-welcome').textContent = nameDisplay;

  // My desk card
  const myDeskCard = document.getElementById('dash-mydesk-card');
  myDeskCard.innerHTML = '';
  if (user.myDesk) {
    const desk = state.desks[parseInt(user.myDesk)];
    if (desk) {
      const availToday = isAvailableOnDate(desk, currentDate);
      const av = desk.availability || { type: 'none' };
      let availDesc = '🟣 Você está na mesa hoje (home base)';
      if (availToday) availDesc = '🟢 Disponível para reserva hoje';
      else if (av.type === 'specific') availDesc = `📅 ${(av.dates||[]).length} data(s) agendada(s)`;
      else if (av.type === 'recurring') {
        const wds = (av.recurrence.weekdays||[]).slice().sort().map(w=>WD_LABELS[w]).join(', ');
        availDesc = `🔄 Recorrente: ${wds}`;
      }
      myDeskCard.innerHTML = `
        <div style="width:52px;height:52px;background:${availToday?'#f0fdf4':'#eef2ff'};border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span class="material-symbols-outlined" style="font-size:26px;color:${availToday?'#16a34a':'#4f46e5'};">desk</span>
        </div>
        <div style="flex:1;">
          <div style="font-size:15px;font-weight:800;font-family:'Manrope',sans-serif;">${desk.label}</div>
          <div style="font-size:13px;color:#94a3b8;margin-top:2px;">${availDesc}</div>
        </div>
        <button onclick="navigate('floormap');selectDesk(${desk.id});" style="padding:8px 16px;background:#f1f5f9;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Manrope',sans-serif;color:#566166;" onmouseover="this.style.background='#e2e8f0'" onmouseout="this.style.background='#f1f5f9'">Ver Mesa →</button>
      `;
    }
  } else {
    myDeskCard.innerHTML = `<p style="font-size:14px;color:#94a3b8;">Você ainda não configurou sua mesa. <a href="#" onclick="navigate('settings');return false;" style="color:#565e74;font-weight:700;">Configurar agora →</a></p>`;
  }

  // Upcoming bookings (mine)
  const upcoming = document.getElementById('dash-upcoming');
  upcoming.innerHTML = '';
  const myBookings = user.name
    ? state.bookings.filter(b => b.bookedBy === user.name && b.status !== 'cancelled' && b.date >= new Date().toISOString().slice(0,10))
        .sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5)
    : [];

  if (myBookings.length === 0) {
    upcoming.innerHTML = `<div style="background:#fff;border-radius:12px;padding:20px;box-shadow:0 2px 12px rgba(0,0,0,.06);font-size:14px;color:#94a3b8;text-align:center;">Nenhuma reserva futura. <a href="#" onclick="navigate('floormap');return false;" style="color:#565e74;font-weight:700;">Reservar uma mesa →</a></div>`;
  } else {
    myBookings.forEach(b => {
      const d = document.createElement('div');
      d.className = 'my-booking-card';
      const bdate = new Date(b.date+'T12:00:00');
      const dlabel = bdate.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
      d.innerHTML = `
        <div style="width:44px;height:44px;background:#eef2ff;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span class="material-symbols-outlined" style="color:#6366f1;font-size:22px;">event_available</span>
        </div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:700;">${b.deskLabel}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${dlabel}</div>
        </div>
        <button onclick="cancelBookingById(${b.id})" style="padding:7px 12px;background:#fff5f5;border:1px solid #fca5a5;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;color:#b91c1c;font-family:'Manrope',sans-serif;" onmouseover="this.style.background='#fee2e2'" onmouseout="this.style.background='#fff5f5'">Cancelar</button>
      `;
      upcoming.appendChild(d);
    });
  }
}

function cancelBookingById(bookingId) {
  const bk = state.bookings.find(b => b.id === bookingId);
  if (bk) {
    bk.status = 'cancelled';
    saveState();
    refreshDashboard();
    refreshBookingsTable();
    renderDesks();
    refreshLegendCounts();
    showToast('Reserva cancelada.');
  }
}

// ═══════════════════════════════════════════════════════
//  BOOKINGS TABLE
// ═══════════════════════════════════════════════════════
function refreshBookingsTable() {
  const tbody = document.getElementById('bookings-tbody');
  tbody.innerHTML = '';
  const sorted = [...state.bookings].sort((a,b)=>b.date.localeCompare(a.date));
  if (sorted.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Nenhuma reserva ainda.</td></tr>';
    return;
  }
  sorted.forEach(b => {
    const tr = document.createElement('tr');
    const statusMap = { reserved:'yellow', active:'green', cancelled:'red' };
    const statusLabelMap = { reserved:'Reservada', active:'Ativa', cancelled:'Cancelada' };
    const bdate = new Date(b.date+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
    tr.innerHTML = `
      <td><strong>${b.deskLabel}</strong></td>
      <td>${b.bookedBy}${b.bookedByDept ? ' <span style="font-size:11px;color:#94a3b8;">'+b.bookedByDept+'</span>' : ''}</td>
      <td>${bdate}</td>
      <td><span class="badge ${statusMap[b.status]||'yellow'}">${statusLabelMap[b.status]||b.status}</span></td>
      <td>
        ${b.status !== 'cancelled' ? `<button onclick="cancelBookingById(${b.id})" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:12px;font-weight:700;font-family:'Manrope',sans-serif;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">Cancelar</button>` : '<span style="color:#94a3b8;font-size:12px;">—</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ═══════════════════════════════════════════════════════
//  LEGEND COUNTS
// ═══════════════════════════════════════════════════════
function refreshLegendCounts() {
  const counts = { available:0, reserved:0, occupied:0, mine:0 };
  DESK_LAYOUT.forEach(d => counts[getDeskStatus(d.id)]++);
  document.getElementById('leg-available').textContent = `Disponível (${counts.available})`;
  document.getElementById('leg-reserved').textContent = `Reservada (${counts.reserved})`;
  document.getElementById('leg-occupied').textContent = `Ocupada (${counts.occupied})`;
  document.getElementById('leg-mine').textContent = `Home-base (${counts.mine})`;
}

// ═══════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════
const PAGE_TITLES = { dashboard:'Dashboard', floormap:'Mapa do Andar', bookings:'Reservas', settings:'Configurações' };

function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('#sidebar nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  document.getElementById('page-title').textContent = PAGE_TITLES[page] || page;
  if (page === 'dashboard') refreshDashboard();
  if (page === 'bookings') refreshBookingsTable();
  if (page === 'settings') loadSettingsPage();
}
