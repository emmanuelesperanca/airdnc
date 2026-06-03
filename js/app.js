// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  seedDummyData();
  initDateLabel();
  renderDesks();
  renderFilterBar();
  populateDeskSelects();
  updateSidebarUser();
  refreshLegendCounts();
  refreshDashboard();
  refreshBookingsTable();

  // 1º: verifica se há um magic link ?token= na URL (retorno do Teams)
  const tokenHandled = await checkMagicToken();
  // 2º: se não havia token, verifica sessão local
  if (!tokenHandled && !checkLoginSession()) {
    showLoginScreen();
  }
});

// ═══════════════════════════════════════════════════════
//  DATE PICKER
// ═══════════════════════════════════════════════════════
function initDateLabel() {
  const d = new Date(currentDate + 'T12:00:00');
  const opts = { weekday:'long', day:'numeric', month:'long', year:'numeric' };
  document.getElementById('date-label').textContent = d.toLocaleDateString('pt-BR', opts);
  document.getElementById('date-picker').value = currentDate;
}

function toggleDatePicker() {
  const dp = document.getElementById('date-picker');
  dp.style.display = dp.style.display === 'none' ? 'inline-block' : 'none';
  if (dp.style.display !== 'none') dp.focus();
}

function onDateChange(val) {
  currentDate = val;
  document.getElementById('date-picker').style.display = 'none';
  initDateLabel();
  renderDesks();
  refreshInfoPanel();
  refreshLegendCounts();
  refreshDashboard();
  refreshBookingsTable();
}

// ═══════════════════════════════════════════════════════
//  BOOKING ACTIONS
// ═══════════════════════════════════════════════════════
function bookDesk() {
  if (!selectedDeskId) return;
  const user = state.user;
  if (!user.name) { openUserModal(); return; }

  const desk = state.desks[selectedDeskId];
  const status = getDeskStatus(selectedDeskId);
  if (status !== 'available') { showToast('Mesa não disponível para reserva.'); return; }

  const booking = {
    id: Date.now(),
    deskId: selectedDeskId,
    deskLabel: desk.label,
    date: currentDate,
    bookedBy: user.name,
    bookedByDept: user.dept,
    status: 'reserved',
    createdAt: new Date().toISOString()
  };
  state.bookings.push(booking);
  saveState();
  renderDesks();
  refreshInfoPanel();
  refreshLegendCounts();
  refreshDashboard();
  refreshBookingsTable();
  showToast(`✓ ${desk.label} reservada para ${currentDate}!`);
  document.getElementById('notif-badge').style.display = 'block';
}

function cancelBooking() {
  if (!selectedDeskId) return;
  const user = state.user;
  const bk = state.bookings.find(b => b.deskId === selectedDeskId && b.date === currentDate && b.bookedBy === user.name && b.status !== 'cancelled');
  if (!bk) { showToast('Reserva não encontrada.'); return; }
  bk.status = 'cancelled';
  saveState();
  renderDesks();
  refreshInfoPanel();
  refreshLegendCounts();
  refreshDashboard();
  refreshBookingsTable();
  showToast('Reserva cancelada.');
}

// ═══════════════════════════════════════════════════════
//  ZOOM & PAN
// ═══════════════════════════════════════════════════════
let currentScale = 0.85;
const fpEl = document.getElementById('floorPlan');
fpEl.style.transform = `scale(${currentScale})`;

function zoom(factor) {
  currentScale = Math.min(1.5, Math.max(0.4, currentScale * factor));
  fpEl.style.transform = `scale(${currentScale})`;
}

function resetZoom() {
  currentScale = 0.85;
  fpEl.style.transform = `scale(${currentScale})`;
}

// Pan support
let isPanning = false, panStart = {x:0,y:0};
const canvas = document.getElementById('floorCanvas');
canvas.addEventListener('mousedown', e => { if(e.target===canvas||e.target.id==='floorPlan'){isPanning=true; panStart={x:e.clientX+canvas.scrollLeft,y:e.clientY+canvas.scrollTop};} });
canvas.addEventListener('mousemove', e => { if(isPanning){ canvas.scrollLeft=panStart.x-e.clientX; canvas.scrollTop=panStart.y-e.clientY; } });
canvas.addEventListener('mouseup', ()=>isPanning=false);
canvas.addEventListener('mouseleave', ()=>isPanning=false);

// Scroll to zoom
canvas.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY<0?1.08:0.93); }, {passive:false});

// ═══════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════
let toastTimer;
function showToast(msg, duration = 3000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(20px)';
  }, duration);
}
