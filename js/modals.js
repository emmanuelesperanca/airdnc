// ═══════════════════════════════════════════════════════
//  LIST DESK MODAL
// ═══════════════════════════════════════════════════════
// Working state for the list modal
const LM = { tab:'specific', selectedDates:[], weekdays:[], calYear:0, calMonth:0 };

function openListModal() {
  if (!selectedDeskId) return;
  const desk = state.desks[selectedDeskId];
  const av = desk.availability || { type:'none', dates:[], recurrence:{weekdays:[],startDate:'',endDate:''} };

  // Pre-populate from existing schedule
  if (av.type === 'recurring') {
    LM.tab = 'recurring';
    LM.weekdays = [...(av.recurrence.weekdays || [])];
    document.getElementById('rec-start-date').value = av.recurrence.startDate || '';
    document.getElementById('rec-end-date').value = av.recurrence.endDate || '';
    LM.selectedDates = [];
  } else {
    LM.tab = 'specific';
    LM.selectedDates = [...(av.dates || [])];
    LM.weekdays = [];
    document.getElementById('rec-start-date').value = '';
    document.getElementById('rec-end-date').value = '';
  }

  // Start calendar on current month
  const now = new Date();
  LM.calYear = now.getFullYear();
  LM.calMonth = now.getMonth();

  document.getElementById('list-modal-desk-name').textContent = `Disponibilizar ${desk.label}`;
  renderListModal();
  document.getElementById('list-modal-overlay').style.display = 'flex';
}

function closeListModal() {
  document.getElementById('list-modal-overlay').style.display = 'none';
}

function closeListModalOnOverlay(e) {
  if (e.target === document.getElementById('list-modal-overlay')) closeListModal();
}

function switchListTab(tab) {
  LM.tab = tab;
  renderListModal();
}

function renderListModal() {
  // Update tabs
  document.querySelectorAll('.list-tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.list-tab[data-tab="${LM.tab}"]`);
  if (activeTab) activeTab.classList.add('active');

  document.getElementById('list-tab-specific').style.display  = LM.tab === 'specific'  ? 'flex' : 'none';
  document.getElementById('list-tab-recurring').style.display = LM.tab === 'recurring' ? 'flex' : 'none';

  if (LM.tab === 'specific') {
    renderMiniCal();
    renderDateChips();
  } else {
    renderWeekdayPills();
  }
  renderAvailPreview();
}

// ── Mini Calendar ──
function renderMiniCal() {
  const { calYear: y, calMonth: m } = LM;
  const today = new Date().toISOString().slice(0,10);

  const monthLabel = new Date(y, m, 1).toLocaleDateString('pt-BR', { month:'long', year:'numeric' });
  document.getElementById('cal-month-label').textContent = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  // Day-of-week headers
  ['D','S','T','Q','Q','S','S'].forEach(d => {
    const hd = document.createElement('div');
    hd.className = 'cal-dow';
    hd.textContent = d;
    grid.appendChild(hd);
  });

  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevTotal = new Date(y, m, 0).getDate();

  // Filler: prev month
  for (let i = firstDow - 1; i >= 0; i--) {
    const btn = document.createElement('button');
    btn.className = 'cal-day other-month';
    btn.textContent = prevTotal - i;
    btn.disabled = true;
    grid.appendChild(btn);
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const btn = document.createElement('button');
    btn.className = 'cal-day';
    btn.textContent = day;
    if (dateStr === today) btn.classList.add('today');
    if (LM.selectedDates.includes(dateStr)) btn.classList.add('selected');
    btn.addEventListener('click', () => toggleCalDay(dateStr));
    grid.appendChild(btn);
  }
}

function toggleCalDay(dateStr) {
  const idx = LM.selectedDates.indexOf(dateStr);
  if (idx >= 0) LM.selectedDates.splice(idx, 1);
  else LM.selectedDates.push(dateStr);
  LM.selectedDates.sort();
  renderMiniCal();
  renderDateChips();
  renderAvailPreview();
}

function calPrevMonth() {
  LM.calMonth--;
  if (LM.calMonth < 0) { LM.calMonth = 11; LM.calYear--; }
  renderMiniCal();
}

function calNextMonth() {
  LM.calMonth++;
  if (LM.calMonth > 11) { LM.calMonth = 0; LM.calYear++; }
  renderMiniCal();
}

function renderDateChips() {
  const container = document.getElementById('selected-dates-chips');
  container.innerHTML = '';
  if (LM.selectedDates.length === 0) {
    container.innerHTML = '<span style="font-size:12px;color:#94a3b8;">Nenhuma data selecionada</span>';
    return;
  }
  LM.selectedDates.forEach(d => {
    const label = new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
    const chip = document.createElement('div');
    chip.className = 'date-chip';
    chip.innerHTML = `${label}<button onclick="removeCalDay('${d}')" title="Remover">&times;</button>`;
    container.appendChild(chip);
  });
}

function removeCalDay(dateStr) {
  const idx = LM.selectedDates.indexOf(dateStr);
  if (idx >= 0) LM.selectedDates.splice(idx, 1);
  renderMiniCal();
  renderDateChips();
  renderAvailPreview();
}

// ── Weekday Pills ──
function renderWeekdayPills() {
  const container = document.getElementById('weekday-pills-container');
  container.innerHTML = '';
  WD_LABELS.forEach((label, i) => {
    const btn = document.createElement('button');
    btn.className = 'wd-pill' + (LM.weekdays.includes(i) ? ' selected' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => toggleWeekday(i));
    container.appendChild(btn);
  });
}

function toggleWeekday(wd) {
  const idx = LM.weekdays.indexOf(wd);
  if (idx >= 0) LM.weekdays.splice(idx, 1);
  else LM.weekdays.push(wd);
  renderWeekdayPills();
  renderAvailPreview();
}

// ── Availability Preview ──
function renderAvailPreview() {
  const el = document.getElementById('list-avail-preview');
  if (!el) return;
  if (LM.tab === 'specific') {
    if (LM.selectedDates.length === 0) {
      el.textContent = 'Nenhuma data selecionada ainda.';
    } else {
      const words = LM.selectedDates.map(d => new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})).join(', ');
      el.textContent = `${LM.selectedDates.length} dia(s): ${words}`;
    }
  } else {
    if (LM.weekdays.length === 0) {
      el.textContent = 'Selecione pelo menos um dia da semana.';
    } else {
      const wdNames = LM.weekdays.slice().sort().map(w => WD_LABELS[w]).join(', ');
      const startVal = document.getElementById('rec-start-date')?.value || '';
      const endVal = document.getElementById('rec-end-date')?.value || '';
      const range = (startVal || endVal)
        ? ` · Período: ${startVal || 'hoje'} → ${endVal || 'sem fim'}`
        : ' · Sem limite de data';
      el.textContent = `Toda semana em: ${wdNames}${range}`;
    }
  }
}

// ── Save / Clear ──
function saveAvailability() {
  if (!selectedDeskId) return;
  const desk = state.desks[selectedDeskId];

  if (LM.tab === 'specific') {
    if (LM.selectedDates.length === 0) { showToast('Selecione pelo menos uma data.'); return; }
    desk.availability = { type:'specific', dates:[...LM.selectedDates], recurrence:{weekdays:[],startDate:'',endDate:''} };
  } else {
    if (LM.weekdays.length === 0) { showToast('Selecione pelo menos um dia da semana.'); return; }
    const startVal = document.getElementById('rec-start-date').value;
    const endVal   = document.getElementById('rec-end-date').value;
    desk.availability = { type:'recurring', dates:[], recurrence:{ weekdays:[...LM.weekdays], startDate:startVal, endDate:endVal } };
  }

  saveState();
  closeListModal();
  renderDesks();
  refreshInfoPanel();
  refreshLegendCounts();
  refreshDashboard();
  showToast('Disponibilização salva! ✅');
}

function clearAvailability() {
  if (!selectedDeskId) return;
  if (!confirm('Remover toda a disponibilização desta mesa?')) return;
  state.desks[selectedDeskId].availability = { type:'none', dates:[], recurrence:{weekdays:[],startDate:'',endDate:''} };
  saveState();
  renderDesks();
  refreshInfoPanel();
  refreshLegendCounts();
  refreshDashboard();
  showToast('Disponibilização removida.');
}

// ═══════════════════════════════════════════════════════
//  EDIT MODAL
// ═══════════════════════════════════════════════════════
function openEditModal() {
  if (!selectedDeskId) return;
  const desk = state.desks[selectedDeskId];
  document.getElementById('modal-title').textContent = `Editar ${desk.label}`;
  document.getElementById('modal-owner').value = desk.owner || '';
  document.getElementById('modal-notes').value = desk.notes || '';
  renderEquipmentForm(desk.amenities);
  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}

function closeModalOnOverlay(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

function saveEdit() {
  if (!selectedDeskId) return;
  const desk = state.desks[selectedDeskId];
  desk.owner = document.getElementById('modal-owner').value.trim();
  desk.notes  = document.getElementById('modal-notes').value.trim();

  // Collect monitors
  const monitors = [];
  document.querySelectorAll('#monitor-rows .monitor-size-sel').forEach(sel => {
    monitors.push({ size: sel.value });
  });

  // Collect ergonomia
  const ergonomia = [];
  document.querySelectorAll('#modal-equipment-sections input[data-ergo]:checked').forEach(cb => {
    ergonomia.push(cb.dataset.ergo);
  });

  // Collect carregadores
  const carregadores = [];
  document.querySelectorAll('#modal-equipment-sections input[data-carg]:checked').forEach(cb => {
    carregadores.push(cb.dataset.carg);
  });

  // Collect extras
  const extras = (document.getElementById('modal-extras')?.value || '').trim();

  desk.amenities = { monitors, ergonomia, carregadores, extras };

  saveState();
  closeModal();
  renderDesks();
  refreshInfoPanel();
  showToast('Mesa atualizada com sucesso!');
}

// ═══════════════════════════════════════════════════════
//  USER PROFILE MODAL
// ═══════════════════════════════════════════════════════
function openUserModal() {
  populateDeskSelects();
  document.getElementById('quick-name').value = state.user.name || '';
  document.getElementById('quick-dept').value = state.user.dept || '';
  document.getElementById('quick-mydesk').value = state.user.myDesk || '';
  document.getElementById('user-modal-overlay').style.display = 'flex';
}

function closeUserModal() {
  document.getElementById('user-modal-overlay').style.display = 'none';
}

function closeUserModalOnOverlay(e) {
  if (e.target === document.getElementById('user-modal-overlay')) closeUserModal();
}

function saveQuickProfile() {
  const name = document.getElementById('quick-name').value.trim();
  if (!name) { showToast('Por favor, informe seu nome.'); return; }
  state.user.name = name;
  state.user.dept = document.getElementById('quick-dept').value.trim();
  state.user.myDesk = document.getElementById('quick-mydesk').value;
  saveState();
  closeUserModal();
  updateSidebarUser();
  renderDesks();
  refreshInfoPanel();
  refreshDashboard();
  showToast(`Bem-vindo(a), ${name}! 👋`);
}
