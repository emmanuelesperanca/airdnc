// ═══════════════════════════════════════════════════════
//  DESK LAYOUT  (positions on 1080×680 floor plan)
// ═══════════════════════════════════════════════════════
const DESK_LAYOUT = [
  // ── Bottom-left cluster ──
  { id: 1,  label: 'Mesa 01', top: 590, left: 38 },
  { id: 2,  label: 'Mesa 02', top: 590, left: 128 },
  { id: 3,  label: 'Mesa 03', top: 590, left: 218 },
  { id: 4,  label: 'Mesa 04', top: 590, left: 328 },
  { id: 15, label: 'Mesa 15', top: 516, left: 38 },
  { id: 14, label: 'Mesa 14', top: 516, left: 128 },
  { id: 13, label: 'Mesa 13', top: 516, left: 218 },
  { id: 12, label: 'Mesa 12', top: 516, left: 328 },
  // ── Bottom-right cluster ──
  { id: 5,  label: 'Mesa 05', top: 590, left: 470 },
  { id: 6,  label: 'Mesa 06', top: 590, left: 560 },
  { id: 7,  label: 'Mesa 07', top: 590, left: 650 },
  { id: 8,  label: 'Mesa 08', top: 590, left: 740 },
  { id: 11, label: 'Mesa 11', top: 516, left: 560 },
  { id: 10, label: 'Mesa 10', top: 516, left: 650 },
  { id: 9,  label: 'Mesa 09', top: 516, left: 740 },
  // ── Middle-left cluster ──
  { id: 16, label: 'Mesa 16', top: 358, left: 38 },
  { id: 17, label: 'Mesa 17', top: 358, left: 128 },
  { id: 18, label: 'Mesa 18', top: 358, left: 218 },
  { id: 19, label: 'Mesa 19', top: 358, left: 308 },
  { id: 31, label: 'Mesa 31', top: 284, left: 38 },
  { id: 30, label: 'Mesa 30', top: 284, left: 128 },
  { id: 29, label: 'Mesa 29', top: 284, left: 218 },
  { id: 28, label: 'Mesa 28', top: 284, left: 308 },
  // ── Middle-right cluster ──
  { id: 20, label: 'Mesa 20', top: 358, left: 470 },
  { id: 21, label: 'Mesa 21', top: 358, left: 560 },
  { id: 22, label: 'Mesa 22', top: 358, left: 650 },
  { id: 23, label: 'Mesa 23', top: 358, left: 740 },
  { id: 27, label: 'Mesa 27', top: 284, left: 470 },
  { id: 26, label: 'Mesa 26', top: 284, left: 560 },
  { id: 25, label: 'Mesa 25', top: 284, left: 650 },
  { id: 24, label: 'Mesa 24', top: 284, left: 740 },
  // ── Top isolated cluster ──
  { id: 32, label: 'Mesa 32', top: 30, left: 38 },
  { id: 33, label: 'Mesa 33', top: 30, left: 128 },
  { id: 34, label: 'Mesa 34', top: 30, left: 218 },
  { id: 35, label: 'Mesa 35', top: 30, left: 308 },
];

const PILASTERS = [
  { top: 516, left: 308, w: 10, h: 74 },
  { top: 516, left: 454, w: 10, h: 74 },
];

// ── Weekday labels (pt-BR) ──
const WD_LABELS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

// ── Equipment predefined options ──
const MONITOR_SIZES = [
  '24" Full HD', '27" Full HD', '27" 4K', '32" 4K',
  '34" Ultrawide', '38" Ultrawide', '49" Ultrawide Curvo'
];

const ERGONOMIA_OPTIONS = [
  { id:'apoio-pes',           label:'Apoio para os pés',         icon:'accessibility' },
  { id:'apoio-pulso-mouse',   label:'Apoio de pulso (mouse)',     icon:'touch_app' },
  { id:'apoio-pulso-teclado', label:'Apoio de pulso (teclado)',   icon:'keyboard' },
  { id:'suporte-notebook',    label:'Suporte para notebook',      icon:'laptop_mac' },
  { id:'braco-monitor',       label:'Braço articulado monitor',   icon:'monitor' },
  { id:'cadeira-ergo',        label:'Cadeira ergonômica',         icon:'chair' },
];

const CARREGADORES_OPTIONS = [
  { id:'inducao-celular',  label:'Indução – celular',           icon:'smartphone' },
  { id:'inducao-relogio',  label:'Indução – relógio',           icon:'watch' },
  { id:'inducao-fone',     label:'Indução – fone de ouvido',    icon:'headphones' },
  { id:'hp-fone',          label:'Carregador HP (Poly/Jabra)',   icon:'headset_mic' },
  { id:'dock-zbook',       label:'Dock Station ZBook',           icon:'laptop_mac' },
  { id:'dock-elitebook',   label:'Dock Station HP EliteBook',    icon:'computer' },
  { id:'hub-usbc',         label:'Hub USB-C',                    icon:'usb' },
  { id:'adaptador-hdmi',   label:'Adaptador HDMI/DisplayPort',   icon:'settings_input_hdmi' },
];

// ── Filter chip definitions ──
const FILTER_CHIPS = [
  { id:'ultrawide',     label:'Monitor Ultrawide', icon:'monitor',
    test: am => (am.monitors||[]).some(m => /ultrawide/i.test(m.size)) },
  { id:'4k',            label:'Monitor 4K',        icon:'monitor',
    test: am => (am.monitors||[]).some(m => m.size.includes('4K')) },
  { id:'multi-monitor', label:'2+ Monitores',      icon:'screenshot_monitor',
    test: am => (am.monitors||[]).length >= 2 },
  { id:'dock',          label:'Dock Station',       icon:'laptop_mac',
    test: am => (am.carregadores||[]).some(c => c.startsWith('dock-')) },
  { id:'cadeira-ergo',  label:'Cadeira Ergo',       icon:'chair',
    test: am => (am.ergonomia||[]).includes('cadeira-ergo') },
  { id:'inducao',       label:'Indução',            icon:'bolt',
    test: am => (am.carregadores||[]).some(c => c.startsWith('inducao-')) },
  { id:'hub-usbc',      label:'Hub USB-C',          icon:'usb',
    test: am => (am.carregadores||[]).includes('hub-usbc') },
  { id:'braco-monitor', label:'Braço de Monitor',   icon:'pivot_table_chart',
    test: am => (am.ergonomia||[]).includes('braco-monitor') },
];

// ─── Team colour palette ───
const TEAM_COLORS = {
  'Nathalia':         '#22c55e',
  'Time da Vanessa':  '#3b82f6',
  'Time do Carlos':   '#f97316',
  'Time da Barbara':  '#ec4899',
  'Time da Gabriela': '#8b5cf6',
  'Time da Dexian':   '#14b8a6',
  'Time do Mikado':   '#dc2626',
  'Marinho':          '#d97706',
  'Barbara Terra':    '#6366f1',
};

// ─── Pessoas com mesa fixa ───
// Quando estão em Home/Fábrica, a mesa delas fica explícita como disponível no mapa
const FIXED_DESK_USERS = {
  'Nathalia':      1,
  'Marinho':       5,
  'Barbara Terra': 19,
};

// ─── Mínimo de pessoas fora do escritório por equipe ───
// Times grandes (≥5 mesas): 2 | Times menores (2–4): 1
const TEAM_MIN_AWAY = {
  'Time da Vanessa':  2,
  'Time do Carlos':   2,
  'Time da Gabriela': 2,
  'Time da Barbara':  1,
  'Time do Mikado':   1,
};

// ─── Tipos de presença ───
// eventTitle = prefixo usado nos eventos de dia-inteiro do Teams Calendar
const PRESENCE_TYPES = {
  office:  { label: 'Escritório', icon: 'business', color: '#22c55e', eventTitle: null },
  home:    { label: 'Home Office', icon: 'home_work', color: '#3b82f6', eventTitle: 'Home Office' },
  fabrica: { label: 'Fábrica',    icon: 'factory',  color: '#f97316', eventTitle: 'Fábrica' },
};

// ═══════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════
function loadState() {
  try { return JSON.parse(localStorage.getItem('airdnc_state')) || {}; } catch { return {}; }
}
function saveState() {
  localStorage.setItem('airdnc_state', JSON.stringify(state));
}

let state = loadState();

if (!state.desks) {
  state.desks = {};
  DESK_LAYOUT.forEach(d => {
    state.desks[d.id] = {
      id: d.id, label: d.label, owner: '',
      amenities: { monitors: [], ergonomia: [], carregadores: [], extras: '' },
      notes: '',
      availability: { type: 'none', dates: [], recurrence: { weekdays: [], startDate: '', endDate: '' } }
    };
  });
}
if (!state.bookings) state.bookings = [];
if (!state.user) state.user = { name: '', dept: '', myDesk: '' };
if (!state.presence) state.presence = {};
if (!state.teamPresence) state.teamPresence = {};
if (!state.teamPresenceLoadedAt) state.teamPresenceLoadedAt = null;

// Ensure all desks from current layout exist (migration for newly added desks)
DESK_LAYOUT.forEach(d => {
  if (!state.desks[d.id]) {
    state.desks[d.id] = {
      id: d.id, label: d.label, owner: '',
      amenities: { monitors: [], ergonomia: [], carregadores: [], extras: '' },
      notes: '',
      availability: { type: 'none', dates: [], recurrence: { weekdays: [], startDate: '', endDate: '' } }
    };
  }
});

// Migrate legacy desk fields
Object.values(state.desks).forEach(d => {
  if ('listed' in d) {
    if (!d.availability) d.availability = { type: 'none', dates: [], recurrence: { weekdays: [], startDate: '', endDate: '' } };
    delete d.listed;
  }
  if (!d.availability) d.availability = { type: 'none', dates: [], recurrence: { weekdays: [], startDate: '', endDate: '' } };
  if (Array.isArray(d.amenities)) {
    const old = d.amenities.join(', ');
    d.amenities = { monitors: [], ergonomia: [], carregadores: [], extras: old };
  }
  if (!d.amenities || typeof d.amenities !== 'object') {
    d.amenities = { monitors: [], ergonomia: [], carregadores: [], extras: '' };
  }
  if (typeof d.hotDesk === 'undefined') d.hotDesk = false;
});
if (typeof state.dummySeeded !== 'undefined') delete state.dummySeeded;

saveState();

// ── Standard amenities for all desks ──
const STD_AM = {
  monitors: [{size:'27" Full HD'}, {size:'27" Full HD'}],
  ergonomia: ['apoio-pes', 'suporte-notebook'],
  carregadores: ['dock-elitebook'],
  extras: 'Teclado com fio\nMouse com fio\nMouse pad\nCaixa organizadora 8L\nFone de ouvido'
};
const AV_NONE = { type:'none', dates:[], recurrence:{ weekdays:[], startDate:'', endDate:'' } };

// ── Team desk assignments (seed v5) ──
const DUMMY_DESKS = [
  // ── Individual / sem time ──
  { id:1,  owner:'Nathalia',         hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  // ── Time da Vanessa (2,3,4,6,7,8,10,11,12) ──
  { id:2,  owner:'Time da Vanessa',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:3,  owner:'Time da Vanessa',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:4,  owner:'Time da Vanessa',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:5,  owner:'Marinho',          hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:6,  owner:'Time da Vanessa',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:7,  owner:'Time da Vanessa',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:8,  owner:'Time da Vanessa',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  // ── Time do Carlos (9,20,21,22,23,24,25,26) ──
  { id:9,  owner:'Time do Carlos',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:10, owner:'Time da Vanessa',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:11, owner:'Time da Vanessa',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:12, owner:'Time da Vanessa',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  // ── Time da Barbara (13,14,18) ──
  { id:13, owner:'Time da Barbara',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:14, owner:'Time da Barbara',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  // ── Time da Gabriela (15,16,17,28,29,30,31) ──
  { id:15, owner:'Time da Gabriela', hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:16, owner:'Time da Gabriela', hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:17, owner:'Time da Gabriela', hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:18, owner:'Time da Barbara',  hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:19, owner:'Barbara Terra',    hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  // ── Time do Carlos (cont.) ──
  { id:20, owner:'Time do Carlos',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:21, owner:'Time do Carlos',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:22, owner:'Time do Carlos',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:23, owner:'Time do Carlos',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:24, owner:'Time do Carlos',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:25, owner:'Time do Carlos',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:26, owner:'Time do Carlos',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  // ── Time da Dexian (27) ──
  { id:27, owner:'Time da Dexian',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  // ── Time da Gabriela (cont.) ──
  { id:28, owner:'Time da Gabriela', hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:29, owner:'Time da Gabriela', hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:30, owner:'Time da Gabriela', hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:31, owner:'Time da Gabriela', hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  // ── Time do Mikado (32,33,34,35) ──
  { id:32, owner:'Time do Mikado',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:33, owner:'Time do Mikado',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:34, owner:'Time do Mikado',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
  { id:35, owner:'Time do Mikado',   hotDesk:true, amenities:STD_AM, availability:AV_NONE },
];

function seedDummyData() {
  if (state.seedV === 5) return;
  DUMMY_DESKS.forEach(({ id, owner, hotDesk, amenities, availability }) => {
    if (!state.desks[id]) return;
    state.desks[id].owner = owner;
    state.desks[id].hotDesk = !!hotDesk;
    state.desks[id].amenities = JSON.parse(JSON.stringify(amenities));
    state.desks[id].availability = JSON.parse(JSON.stringify(availability));
    state.desks[id].notes = '';
  });
  // Clear all seed bookings from previous versions
  state.bookings = state.bookings.filter(b => b.id < 1000000);
  if (!state.user.name) {
    state.user = { name: 'Emmanuel', dept: 'Admin', myDesk: '', isAdmin: true };
  }
  state.seedV = 5;
  saveState();
}

// ── Runtime variables ──
let currentDate = new Date().toISOString().slice(0, 10);
let selectedDeskId = null;
let activeFilters = new Set();
