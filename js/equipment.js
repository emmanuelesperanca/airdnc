function hasEquipment(amenities) {
  if (!amenities) return false;
  if (Array.isArray(amenities)) return amenities.length > 0;
  return (amenities.monitors||[]).length > 0
      || (amenities.ergonomia||[]).length > 0
      || (amenities.carregadores||[]).length > 0
      || !!(amenities.extras||'').trim();
}

function buildAmenityLines(amenities) {
  const lines = [];
  if (!amenities) return lines;
  // Legacy flat array
  if (Array.isArray(amenities)) {
    const iconMap = { monitor:'monitor', tela:'monitor', display:'monitor', dock:'settings_input_hdmi', usb:'usb', cadeira:'chair', 'indu':'bolt', carregador:'bolt', webcam:'videocam', headset:'headphones', notebook:'laptop_mac' };
    amenities.forEach(a => {
      const lc = a.toLowerCase();
      let icon = 'devices_other';
      for (const [k,v] of Object.entries(iconMap)) { if (lc.includes(k)) { icon=v; break; } }
      lines.push({ icon, label: a });
    });
    return lines;
  }
  // Monitors — group by size
  const grouped = {};
  (amenities.monitors||[]).forEach(m => { grouped[m.size] = (grouped[m.size]||0) + 1; });
  Object.entries(grouped).forEach(([size, qty]) => {
    lines.push({ icon:'monitor', label:`${qty}x Monitor ${size}` });
  });
  // Ergonomia
  (amenities.ergonomia||[]).forEach(id => {
    const opt = ERGONOMIA_OPTIONS.find(o => o.id === id);
    if (opt) lines.push({ icon: opt.icon, label: opt.label });
  });
  // Carregadores
  (amenities.carregadores||[]).forEach(id => {
    const opt = CARREGADORES_OPTIONS.find(o => o.id === id);
    if (opt) lines.push({ icon: opt.icon, label: opt.label });
  });
  // Extras (free text, one line per item)
  const extras = (amenities.extras||'').trim();
  if (extras) extras.split('\n').filter(Boolean).forEach(e => lines.push({ icon:'stars', label: e.trim() }));
  return lines;
}

function renderEquipmentForm(amenities) {
  const container = document.getElementById('modal-equipment-sections');
  if (!container) return;
  container.innerHTML = '';

  const am = (!amenities || Array.isArray(amenities))
    ? { monitors: [], ergonomia: [], carregadores: [], extras: '' }
    : amenities;

  // ── Monitores ──
  const monSec = document.createElement('div');
  monSec.className = 'eq-section';
  monSec.innerHTML = `
    <div class="eq-section-header">
      <span class="material-symbols-outlined">monitor</span>Monitores
    </div>
    <div id="monitor-rows" style="display:flex;flex-direction:column;gap:6px;"></div>
    <button class="add-monitor-btn" type="button" onclick="addMonitorRow()">
      <span class="material-symbols-outlined" style="font-size:16px;">add</span>Adicionar Monitor
    </button>`;
  container.appendChild(monSec);
  (am.monitors||[]).forEach(m => addMonitorRow(m.size));

  // ── Ergonomia ──
  const ergoSec = document.createElement('div');
  ergoSec.className = 'eq-section';
  ergoSec.innerHTML = `<div class="eq-section-header"><span class="material-symbols-outlined">chair</span>Ergonomia</div>`;
  const ergoGrid = document.createElement('div');
  ergoGrid.className = 'eq-check-grid';
  ERGONOMIA_OPTIONS.forEach(opt => {
    const checked = (am.ergonomia||[]).includes(opt.id);
    const lbl = document.createElement('label');
    lbl.className = 'eq-check-item' + (checked ? ' checked' : '');
    lbl.innerHTML = `<input type="checkbox" data-ergo="${opt.id}"${checked?' checked':''}><span>${opt.label}</span>`;
    lbl.querySelector('input').addEventListener('change', e => lbl.classList.toggle('checked', e.target.checked));
    ergoGrid.appendChild(lbl);
  });
  ergoSec.appendChild(ergoGrid);
  container.appendChild(ergoSec);

  // ── Carregadores & Dock ──
  const cargSec = document.createElement('div');
  cargSec.className = 'eq-section';
  cargSec.innerHTML = `<div class="eq-section-header"><span class="material-symbols-outlined">bolt</span>Carregadores &amp; Dock</div>`;
  const cargGrid = document.createElement('div');
  cargGrid.className = 'eq-check-grid';
  CARREGADORES_OPTIONS.forEach(opt => {
    const checked = (am.carregadores||[]).includes(opt.id);
    const lbl = document.createElement('label');
    lbl.className = 'eq-check-item' + (checked ? ' checked' : '');
    lbl.innerHTML = `<input type="checkbox" data-carg="${opt.id}"${checked?' checked':''}><span>${opt.label}</span>`;
    lbl.querySelector('input').addEventListener('change', e => lbl.classList.toggle('checked', e.target.checked));
    cargGrid.appendChild(lbl);
  });
  cargSec.appendChild(cargGrid);
  container.appendChild(cargSec);

  // ── Extras (texto livre) ──
  const extSec = document.createElement('div');
  extSec.className = 'eq-section';
  extSec.innerHTML = `
    <div class="eq-section-header"><span class="material-symbols-outlined">stars</span>Extras</div>
    <textarea id="modal-extras" rows="3" style="padding:9px 12px;border:1.5px solid #d1dae0;border-radius:8px;font-size:13px;font-family:'Inter',sans-serif;outline:none;resize:vertical;" placeholder="Ex: Cafeteira, teclado mec&#226;nico, suporte celular, lumin&#225;ria..." onfocus="this.style.borderColor='#565e74'" onblur="this.style.borderColor='#d1dae0'">${am.extras||''}</textarea>`;
  container.appendChild(extSec);
}

function addMonitorRow(selectedSize) {
  const container = document.getElementById('monitor-rows');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'monitor-row';
  const options = MONITOR_SIZES.map(s =>
    `<option value="${s}"${s === (selectedSize||'27" 4K') ? ' selected' : ''}>${s}</option>`
  ).join('');
  row.innerHTML = `
    <span class="material-symbols-outlined" style="font-size:18px;color:#94a3b8;flex-shrink:0;">monitor</span>
    <select class="monitor-size-sel">${options}</select>
    <button class="monitor-rm-btn" type="button" onclick="this.closest('.monitor-row').remove()" title="Remover">
      <span class="material-symbols-outlined" style="font-size:16px;">close</span>
    </button>`;
  container.appendChild(row);
}
