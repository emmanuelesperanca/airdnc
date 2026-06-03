function renderFilterBar() {
  const bar = document.getElementById('filter-bar');
  if (!bar) return;
  // Remove old chip buttons (keep label + clear btn)
  bar.querySelectorAll('.filter-chip').forEach(e => e.remove());
  const clearBtn = document.getElementById('filter-clear-btn');
  FILTER_CHIPS.forEach(fc => {
    const btn = document.createElement('button');
    btn.className = 'filter-chip' + (activeFilters.has(fc.id) ? ' active' : '');
    btn.dataset.filterId = fc.id;
    btn.innerHTML = `<span class="material-symbols-outlined">${fc.icon}</span>${fc.label}`;
    btn.onclick = () => toggleFilter(fc.id);
    bar.insertBefore(btn, clearBtn);
  });
  clearBtn.style.display = activeFilters.size > 0 ? 'inline-flex' : 'none';
}

function toggleFilter(id) {
  if (activeFilters.has(id)) activeFilters.delete(id);
  else activeFilters.add(id);
  renderFilterBar();
  applyDeskFilter();
}

function clearFilters() {
  activeFilters.clear();
  renderFilterBar();
  applyDeskFilter();
}

function applyDeskFilter() {
  document.querySelectorAll('.desk').forEach(d => {
    if (activeFilters.size === 0) {
      d.classList.remove('filtered-out', 'filter-match');
      return;
    }
    const id = parseInt(d.dataset.id);
    const am = (state.desks[id] && state.desks[id].amenities) || {};
    const matches = [...activeFilters].every(fid => {
      const fc = FILTER_CHIPS.find(c => c.id === fid);
      return fc ? fc.test(am) : false;
    });
    d.classList.toggle('filtered-out', !matches);
    d.classList.toggle('filter-match', matches);
  });
}
