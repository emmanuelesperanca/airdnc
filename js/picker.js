// ═══════════════════════════════════════════════════════════════════
//  PRESENCE DATE PICKER  (js/picker.js)
//
//  Abre um modal de seleção de datas antes de registrar presença.
//
//  Modos:
//    multi  — toggle de múltiplos dias úteis (home / fabrica / banco)
//    range  — clique início → clique fim     (ferias)
// ═══════════════════════════════════════════════════════════════════

let _pickerType       = null;
let _pickerMultiSel   = new Set();   // Set<'YYYY-MM-DD'>
let _pickerRangeStart = null;
let _pickerRangeEnd   = null;

// ── Abre o modal ────────────────────────────────────────────────────
function openPresencePicker(type) {
  _pickerType       = type;
  _pickerMultiSel   = new Set();
  _pickerRangeStart = null;
  _pickerRangeEnd   = null;

  const p       = PRESENCE_TYPES[type];
  const isRange = !!p.isRange;

  document.getElementById('ppicker-icon').textContent      = p.icon;
  document.getElementById('ppicker-icon').style.color      = p.color;
  document.getElementById('ppicker-icon-wrap').style.background = p.color + '20';
  document.getElementById('ppicker-title').textContent     = p.label;
  document.getElementById('ppicker-subtitle').textContent  = isRange
    ? 'Clique no 1º dia e depois no último dia do período'
    : 'Clique nos dias para selecionar (pode marcar vários)';
  document.getElementById('ppicker-confirm').style.background = p.color;
  document.getElementById('ppicker-confirm').style.borderColor = p.color;

  _renderPickerGrid();

  const overlay = document.getElementById('ppicker-overlay');
  overlay.style.display = 'flex';
  requestAnimationFrame(() => {
    document.getElementById('ppicker-card').style.transform  = 'translateY(0)';
    document.getElementById('ppicker-card').style.opacity    = '1';
  });
  document.body.style.overflow = 'hidden';
}

function closePresencePicker() {
  const card = document.getElementById('ppicker-card');
  card.style.transform = 'translateY(16px)';
  card.style.opacity   = '0';
  setTimeout(() => {
    document.getElementById('ppicker-overlay').style.display = 'none';
    document.body.style.overflow = '';
  }, 180);
}

// ── Gera esta semana + próximas 3 (Mon-Fri) ─────────────────────────
function _getPickerWeeks() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dow = today.getDay();
  const mondayOff = (dow === 0) ? -6 : 1 - dow;
  const base = new Date(today);
  base.setDate(today.getDate() + mondayOff);

  const weeks = [];
  for (let w = 0; w < 4; w++) {
    const week = [];
    for (let d = 0; d < 5; d++) {
      const dt = new Date(base);
      dt.setDate(base.getDate() + w * 7 + d);
      week.push(dt.toISOString().slice(0, 10));
    }
    weeks.push(week);
  }
  return weeks;
}

function _isInRange(dateStr) {
  if (!_pickerRangeStart) return false;
  if (!_pickerRangeEnd)   return dateStr === _pickerRangeStart;
  return dateStr >= _pickerRangeStart && dateStr <= _pickerRangeEnd;
}

function _isRangeEndpoint(dateStr) {
  return dateStr === _pickerRangeStart || dateStr === _pickerRangeEnd;
}

function _fmtShort(dateStr) {
  return new Date(dateStr + 'T12:00:00')
    .toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

function _countWeekdays(start, end) {
  let n = 0;
  const cur = new Date(start + 'T12:00:00');
  const fin = new Date(end   + 'T12:00:00');
  while (cur <= fin) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

// ── Renderiza o grid ─────────────────────────────────────────────────
function _renderPickerGrid() {
  const weeks   = _getPickerWeeks();
  const today   = new Date().toISOString().slice(0, 10);
  const p       = PRESENCE_TYPES[_pickerType];
  const isRange = !!p.isRange;
  const DAYS    = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
  const WLABELS = ['Esta<br>sem.', 'Próx.<br>sem.', '+2<br>sem.', '+3<br>sem.'];

  let html = `<div class="ppicker-grid">`;

  // Header row
  html += `<div></div>`;
  DAYS.forEach(d => `<div class="ppicker-col-hdr">${d}</div>`
    .split('').forEach((_, i, arr) => { if (i === 0) html += arr.join(''); }));
  // Rebuild properly
  html = `<div class="ppicker-grid"><div></div>` +
    DAYS.map(d => `<div class="ppicker-col-hdr">${d}</div>`).join('');

  // Each week
  weeks.forEach((week, wi) => {
    // Figure out month label for the week
    const wDate   = new Date(week[0] + 'T12:00:00');
    const mLabel  = wDate.toLocaleDateString('pt-BR', { month: 'short' });

    html += `<div class="ppicker-week-lbl">${WLABELS[wi]}</div>`;

    week.forEach(dateStr => {
      const isPast     = dateStr < today;
      const isToday    = dateStr === today;
      const inRange    = _isInRange(dateStr);
      const isEndpoint = _isRangeEndpoint(dateStr);
      const isSelected = isRange ? inRange : _pickerMultiSel.has(dateStr);

      const day = new Date(dateStr + 'T12:00:00').getDate();

      // Compute visual state
      let bg     = 'transparent';
      let border = '#e2e8f0';
      let color  = isPast ? '#cbd5e1' : '#374151';
      let fw     = '600';
      let shadow = '';

      if (isToday && !isSelected) {
        border = p.color;
        shadow = `box-shadow:inset 0 0 0 1.5px ${p.color};`;
      }

      if (isSelected) {
        if (isRange && !isEndpoint) {
          // Middle of range: lighter
          bg     = p.color + '28';
          border = p.color + '60';
          color  = p.color;
          fw     = '700';
        } else {
          // Selected endpoint or multi-select
          bg     = p.color;
          border = p.color;
          color  = '#fff';
          fw     = '800';
          shadow = `box-shadow:0 2px 8px ${p.color}60;`;
        }
      }

      const dotHTML = isToday
        ? `<span class="ppicker-dot" style="background:${isSelected && !isRange ? '#fff' : p.color};"></span>`
        : '';

      html += `<button
        class="ppicker-day${isPast ? ' ppicker-past' : ''}${isToday ? ' ppicker-today' : ''}"
        style="background:${bg};border-color:${border};color:${color};font-weight:${fw};${shadow}"
        onclick="${isPast ? 'void 0' : `_pickDay('${dateStr}')`}"
        ${isPast ? 'disabled' : ''}
        title="${dateStr}">
        <span class="ppicker-day-num">${day}</span>${dotHTML}
      </button>`;
    });
  });

  html += `</div>`;
  document.getElementById('ppicker-grid').innerHTML = html;

  // ── Hint text ──
  const hintEl = document.getElementById('ppicker-hint');
  let hintText = '', hintBg = 'transparent', hintColor = '#94a3b8';
  let canConfirm = false;

  if (isRange) {
    if (!_pickerRangeStart) {
      hintText = 'Clique no primeiro dia do período';
    } else if (!_pickerRangeEnd) {
      hintText = `Início: ${_fmtShort(_pickerRangeStart)} — agora clique no último dia`;
      hintBg   = p.color + '18'; hintColor = p.color;
    } else {
      const n  = _countWeekdays(_pickerRangeStart, _pickerRangeEnd);
      hintText = `${_fmtShort(_pickerRangeStart)} → ${_fmtShort(_pickerRangeEnd)}  ·  ${n} dia${n !== 1 ? 's' : ''} útil${n !== 1 ? 'eis' : ''}`;
      hintBg   = p.color + '18'; hintColor = p.color;
      canConfirm = true;
    }
  } else {
    const n = _pickerMultiSel.size;
    if (n === 0) {
      hintText = 'Nenhum dia selecionado';
    } else {
      hintText   = `${n} dia${n > 1 ? 's' : ''} selecionado${n > 1 ? 's' : ''}`;
      hintBg     = p.color + '18'; hintColor = p.color;
      canConfirm = true;
    }
  }

  hintEl.textContent   = hintText;
  hintEl.style.background = hintBg;
  hintEl.style.color      = hintColor;

  // ── Confirm button ──
  const btn  = document.getElementById('ppicker-confirm');
  const lbl  = document.getElementById('ppicker-confirm-label');
  btn.disabled      = !canConfirm;
  btn.style.opacity = canConfirm ? '1' : '0.38';
  btn.style.cursor  = canConfirm ? 'pointer' : 'not-allowed';
  if (isRange) {
    lbl.textContent = 'Criar evento de Férias';
  } else {
    lbl.textContent = canConfirm
      ? `Confirmar ${_pickerMultiSel.size} dia${_pickerMultiSel.size > 1 ? 's' : ''}`
      : 'Confirmar';
  }
}

// ── Clique num dia ────────────────────────────────────────────────────
function _pickDay(dateStr) {
  const isRange = !!PRESENCE_TYPES[_pickerType].isRange;

  if (isRange) {
    if (!_pickerRangeStart || (_pickerRangeStart && _pickerRangeEnd)) {
      // Começa nova seleção
      _pickerRangeStart = dateStr;
      _pickerRangeEnd   = null;
    } else {
      // Define fim (troca se necessário)
      if (dateStr < _pickerRangeStart) {
        [_pickerRangeStart, _pickerRangeEnd] = [dateStr, _pickerRangeStart];
      } else {
        _pickerRangeEnd = dateStr;
      }
    }
  } else {
    // Toggle
    _pickerMultiSel.has(dateStr)
      ? _pickerMultiSel.delete(dateStr)
      : _pickerMultiSel.add(dateStr);
  }

  _renderPickerGrid();
}

// ── Confirma e dispara criação de eventos ─────────────────────────────
async function confirmPresencePicker() {
  const p = PRESENCE_TYPES[_pickerType];
  closePresencePicker();

  if (p.isRange) {
    if (!_pickerRangeStart || !_pickerRangeEnd) return;
    const n    = _countWeekdays(_pickerRangeStart, _pickerRangeEnd);
    const from = _fmtShort(_pickerRangeStart);
    const to   = _fmtShort(_pickerRangeEnd);
    showToast(`Criando ${p.label} de ${from} a ${to}...`);
    await _createRangeCalendarEvent(_pickerType, _pickerRangeStart, _pickerRangeEnd);
  } else {
    const dates = Array.from(_pickerMultiSel).sort();
    if (!dates.length) return;
    const label = dates.length > 1 ? `${dates.length} dias` : _fmtShort(dates[0]);
    showToast(`Registrando ${p.label} para ${label}...`);
    for (const date of dates) {
      await setMyPresence(_pickerType, date, /* silent */ true);
    }
    // Toast final resumido
    const icon = _pickerType === 'home' ? '🏠' : _pickerType === 'fabrica' ? '🏭' : '⏱️';
    showToast(`${icon} ${p.label} registrado para ${label}!`, 3500);
    if (typeof renderPresenceSection === 'function') renderPresenceSection();
    if (typeof renderDesks === 'function') renderDesks();
    // Recarrega do DB para mostrar dados consolidados de todos
    if (typeof fetchTeamPresence === 'function') fetchTeamPresence(currentDate);
  }
}

// Cria evento com período (férias)
async function _createRangeCalendarEvent(type, startDate, endDate) {
  const p     = PRESENCE_TYPES[type];
  const user  = state.user;

  // 1. Persiste no DB via API imediatamente
  const apiBase = window.API_BASE_URL || '';
  if (apiBase && user && user.name) {
    try {
      await fetch(`${apiBase}/api/presence`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email:    user.email || '',
          user_name:     user.name,
          department:    user.dept  || '',
          team_name:     user.team  || '',
          presence_type: type,
          presence_date: startDate,
          end_date:      endDate,
          is_range:      true,
          event_title:   `${p.eventTitle} - ${user.name.split(' ')[0]}`,
          source:        'app'
        })
      });
    } catch { /* não bloqueia */ }
  }

  // 2. Cria evento no Teams Calendar via Power Automate
  const paUrl = window.PA_CREATE_EVENT_URL || '';
  const from  = _fmtShort(startDate);
  const to    = _fmtShort(endDate);

  if (!paUrl) {
    showToast(`🏖️ ${p.label}: ${from} → ${to} salvo! (Configure PA_CREATE_EVENT_URL para sincronizar com o Teams)`, 5000);
    await fetchTeamPresence(currentDate);
    return;
  }

  try {
    const resp = await fetch(paUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:       user.email || '',
        user_name:   user.name,
        type,
        date:        startDate,
        end_date:    endDate,
        event_title: `${p.eventTitle} - ${user.name.split(' ')[0]}`,
        is_range:    true,
        app:         'airdnc'
      })
    });

    if (resp.ok) {
      showToast(`🏖️ ${p.label} criado na agenda do Teams: ${from} → ${to}`, 4000);
    } else {
      showToast(`${p.label} salvo no sistema. Falha no Teams — crie o evento manualmente.`, 4000);
    }
  } catch {
    showToast(`${p.label} salvo no sistema. Crie o evento no Teams manualmente.`, 4000);
  }

  // 3. Recarrega dados do dashboard do DB
  await fetchTeamPresence(currentDate);
}
