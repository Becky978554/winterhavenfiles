// Save notes for individual sheep
function saveNotes(sheepID) {
  const notes = document.getElementById("notes").value;
  try {
    // Save in per-sheep record and also keep legacy notes_<id> key for compatibility
    const raw = localStorage.getItem(`sheep-${sheepID}`);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        s.notes = notes;
        localStorage.setItem(`sheep-${sheepID}`, JSON.stringify(s));
      } catch (e) { /* fall back below */ }
    }
    try { localStorage.setItem("notes_" + sheepID, notes); } catch (e) { }
    // Rebuild master list to ensure dashboard reflects updated notes
    try {
      const all = getAllSheep();
      // merge with existing master list entries to avoid losing fields
      const master = JSON.parse(localStorage.getItem('sheepList') || '[]');
      const masterMap = {};
      master.forEach(m => { if (m && m.id) masterMap[m.id] = m; });
      const merged = all.map(a => Object.assign({}, masterMap[a.id] || {}, a));
      localStorage.setItem('sheepList', JSON.stringify(merged));
    } catch (e) { }
    alert("Notes saved!");
  } catch (e) { alert('Failed to save notes; see console.'); console.warn(e); }
}

// Render breeding history for a given sheep into the detail page container
function renderBreedingHistory(sheep) {
  try {
    const sex = (sheep && sheep.sex || '').toString().toLowerCase();
    // Choose container: rams get bottom container if present, ewes use inline container
    const contId = (sex === 'ram' && document.getElementById('breedingHistoryBottom')) ? 'breedingHistoryBottom' : 'breedingHistory';
    const cont = document.getElementById(contId) || document.getElementById('breedingHistory');
    if (!cont) return;
    // Do not alter container display here; load handler controls which outer box/header is visible.
    cont.innerHTML = '';

    const all = getAllSheep() || [];
    const sid = sheep && sheep.id ? String(sheep.id) : '';

    // For rams, first render Progeny: list of animals that list this ram as sire
    if (sex === 'ram') {
      const progeny = all.filter(s => s && (String(s.sire || '') === sid));
      const progWrap = document.createElement('div');
      progWrap.style.marginBottom = '8px';
      const title = document.createElement('div'); title.style.fontWeight = '600'; title.style.marginBottom = '6px'; title.textContent = 'Offspring:';
      progWrap.appendChild(title);
      if (!progeny.length) {
        const empty = document.createElement('div'); empty.style.color = '#666'; empty.textContent = 'No progeny recorded.'; progWrap.appendChild(empty);
      } else {
        progeny.forEach(p => {
          try {
            const line = document.createElement('div');
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'detail-link'; btn.textContent = p.name || p.id; btn.style.color = '#0366d6';
            btn.dataset.id = p.id;
            btn.addEventListener('click', () => { try { window.location.href = buildDetailLink(p.id); } catch (e) { window.location.href = 'sheep-detail.html?id=' + encodeURIComponent(p.id); } });
            line.appendChild(btn);
            // ID mini-text removed per preference; keep name and info only
            // show sex and birth date next to each progeny
            try {
              const sexLabel = p.sex ? (String(p.sex).charAt(0).toUpperCase() + String(p.sex).slice(1).toLowerCase()) : 'Unknown';
              const bd = p.birthDate ? formatDateLong(p.birthDate) : '';
              const infoSmall = document.createElement('small'); infoSmall.style.color = '#666'; infoSmall.style.marginLeft = '8px';
              infoSmall.textContent = bd ? `${sexLabel}, ${bd}` : sexLabel;
              line.appendChild(infoSmall);
            } catch (e) { }
            progWrap.appendChild(line);
          } catch (e) { }
        });
      }
      cont.appendChild(progWrap);
    }

    // Build breeding events (works for both ewes and rams)
    const events = [];
    try {
      // Ewe: show recorded breedings on this ewe
      if (sex === 'ewe') {
        if (sheep._lastBredDate || sheep.bredDate) {
          events.push({ date: sheep._lastBredDate || sheep.bredDate, partnerId: (sheep._lastBreedingSire || sheep.sire) || '', note: 'Recorded breeding' });
        }
        if (Array.isArray(sheep.breedings) && sheep.breedings.length) {
          sheep.breedings.forEach(b => { try { events.push({ date: b.date || b.bredDate || '', partnerId: b.sire || '', note: b.note || 'Breeding' }); } catch (e) { } });
        }
      }

      // Ram: find breedings recorded on dams that reference this ram
      if (sex === 'ram') {
        all.forEach(s => {
          try {
            const isEwe = ((s.sex || '').toString().toLowerCase() === 'ewe');
            if (!isEwe) return;
            if (s._lastBreedingSire === sid || s.sire === sid) {
              events.push({ date: s._lastBredDate || s.bredDate || '', partnerId: s.id, partnerName: s.name || s.id, note: 'Recorded on dam' });
            }
            if (Array.isArray(s.lambings)) {
              s.lambings.forEach(ev => { try { if (ev && String(ev.sire || '') === sid) events.push({ date: ev.date || '', partnerId: s.id, partnerName: s.name || s.id, note: 'Recorded lambing (sire)' }); } catch (e) { } });
            }
          } catch (e) { }
        });
      }

      // Also scan all lambings for matches (generic)
      all.forEach(s => {
        try {
          if (!Array.isArray(s.lambings)) return;
          s.lambings.forEach(ev => { try { if (ev && String(ev.sire || '') === sid) events.push({ date: ev.date || '', partnerId: s.id, partnerName: s.name || s.id, note: 'Recorded lambing (sire)' }); } catch (e) { } });
        } catch (e) { }
      });
    } catch (e) { }

    if (!events.length) {
      // If we already rendered progeny for rams, don't overwrite that block; append a small note
      if (sex === 'ram') {
        const note = document.createElement('div'); note.style.color = '#666'; note.style.marginTop = '8px'; note.textContent = 'No breeding events recorded.'; cont.appendChild(note);
        return;
      }
      cont.innerHTML = '<div style="color:#666">No breeding history found.</div>';
      return;
    }

    // Normalize and sort events by date desc
    events.forEach(ev => { try { ev._ts = ev.date ? new Date(ev.date).getTime() : 0; } catch (e) { ev._ts = 0; } });
    events.sort((a, b) => (b._ts || 0) - (a._ts || 0));

    const list = document.createElement('div'); list.className = 'breeding-events';
    events.forEach(ev => {
      try {
        const evWrap = document.createElement('div'); evWrap.style.padding = '6px 0'; evWrap.style.borderBottom = '1px solid #f6f6f6';
        const dateText = ev.date ? formatDateLong(ev.date) : 'Unknown date';
        const header = document.createElement('div'); header.style.fontWeight = '600'; header.style.marginBottom = '6px';
        header.textContent = `${dateText} — ${ev.note || 'Breeding'}`;
        evWrap.appendChild(header);

        const meta = document.createElement('div'); meta.style.color = '#333'; meta.style.fontSize = '14px';
        if (ev.partnerId) {
          const partner = findSheepByNameOrId(ev.partnerId) || null;
          if (partner && partner.id) {
            const a = document.createElement('a'); a.href = buildDetailLink(partner.id); a.textContent = partner.name || partner.id; a.style.color = '#0366d6';
            meta.appendChild(a);
            const small = document.createElement('small'); small.style.color = '#666'; small.style.marginLeft = '8px'; small.textContent = ` (${partner.id})`; meta.appendChild(small);
          } else {
            meta.textContent = `${ev.partnerName || ev.partnerId}`;
          }
        } else if (ev.partnerName) {
          meta.textContent = ev.partnerName;
        }

        evWrap.appendChild(meta);
        list.appendChild(evWrap);
      } catch (e) { }
    });

    cont.appendChild(list);
  } catch (e) {
    try { const cont = document.getElementById('breedingHistory') || document.getElementById('breedingHistoryBottom'); if (cont) cont.innerHTML = '<div style="color:#a33">Unable to render breeding history.</div>'; } catch (ee) { }
  }
}

// Save and display reports
function saveReport() {
  let text = document.getElementById("reportText").value;
  if (!text.trim()) return alert("Write something first!");

  let reports = JSON.parse(localStorage.getItem("reports") || "[]");
  reports.push({ text, date: new Date().toLocaleString() });
  localStorage.setItem("reports", JSON.stringify(reports));

  displayReports();
  alert("Report saved!");
  document.getElementById("reportText").value = "";
}

function displayReports() {
  let reports = JSON.parse(localStorage.getItem("reports") || "[]");
  let list = document.getElementById("reportList");

  if (!list) return; // not on the reports page

  list.innerHTML = "";

  reports.forEach(r => {
    let li = document.createElement("li");
    li.innerHTML = `<strong>${r.date}</strong><br>${r.text}`;
    list.appendChild(li);
  });
}

// Return all sheep objects found in localStorage (keys starting with "sheep-")
function getAllSheep() {
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (key.indexOf('sheep-') === 0) {
      try {
        const raw = localStorage.getItem(key);
        const s = raw ? JSON.parse(raw) : null;
        if (s && (!s.id || s.id === '')) {
          try { s.id = key.slice(6); } catch (e) { /* ignore */ }
        }
        if (s) out.push(s);
      } catch (e) { /* ignore parse errors */ }
    }
  }
  return out;
}

// Ensure the master `sheepList` is consistent with individual `sheep-<id>` records.
// If the master list is missing or out-of-sync, rebuild it from storage and persist.
function ensureMasterListIntegrity() {
  try {
    const all = getAllSheep();
    const masterRaw = localStorage.getItem('sheepList');
    let master = [];
    try { master = masterRaw ? JSON.parse(masterRaw) : []; } catch (e) { master = []; }

    // build maps
    const mapAll = {};
    all.forEach(s => { if (s && s.id) mapAll[s.id] = s; });
    const mapMaster = {};
    master.forEach(s => { if (s && s.id) mapMaster[s.id] = s; });

    // Compare counts and ids
    const allIds = Object.keys(mapAll).sort();
    const masterIds = Object.keys(mapMaster).sort();
    const same = allIds.length === masterIds.length && allIds.every((v, i) => v === masterIds[i]);
    if (!same) {
      // Rebuild master from scanned records, but merge with existing master entries
      const merged = all.map(a => Object.assign({}, mapMaster[a.id] || {}, a));
      localStorage.setItem('sheepList', JSON.stringify(merged));
      console.info(`Integrity: rebuilt sheepList from ${all.length} sheep- records (was ${masterIds.length}).`);
    } else {
      // If same IDs but some objects differ (e.g., missing notes), synchronize by merging
      let differs = false;
      const merged = [];
      for (let id of allIds) {
        const a = mapAll[id];
        const m = mapMaster[id] || {};
        // quick shallow compare of JSON string to detect differences
        try {
          if (JSON.stringify(Object.assign({}, m, a)) !== JSON.stringify(m)) { differs = true; }
        } catch (e) { differs = true; }
        merged.push(Object.assign({}, m, a));
      }
      if (differs) {
        localStorage.setItem('sheepList', JSON.stringify(merged));
        console.info(`Integrity: synchronized sheepList entries from ${all.length} scanned records.`);
      }
    }
  } catch (e) { console.warn('ensureMasterListIntegrity failed', e); }
}

// Current sort state for dashboard table
let _sheepTableSort = { field: 'name', asc: true };
// Current tab state for category filter
let _currentTab = 'active-ewes';
// Whether bulk-selection mode is active (shows checkboxes and bulk controls)
let _bulkMode = false;
// Current sort state for report tables (column index and asc/desc)
let _reportTableSort = { index: null, asc: true };

function setTab(tabId) {
  _currentTab = tabId || 'all';
  const buttons = document.querySelectorAll('#tabs .tab-button');
  buttons.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === _currentTab));
  loadSheepList();
}

function isActiveStatus(status) {
  if (!status) return true;
  const s = String(status || '').trim().toLowerCase();
  // Treat only explicitly removed statuses as inactive. "To be culled" should
  // still be considered active until the animal is actually marked 'culled'.
  return !(s === 'culled' || s === 'sold' || s === 'archived');
}

function isLamb(sheep) {
  if (!sheep || !sheep.birthDate) return false;
  const bd = new Date(sheep.birthDate);
  if (isNaN(bd)) return false;
  const now = new Date();

  // Render a small summary (charts/goals) above the report table. Non-fatal.
  try { renderReportSummary(sheep, type); } catch (e) { console.warn('renderReportSummary failed', e); }
  const months = (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth());
  // Consider animals under 4 months as lambs so they appear only in the
  // "Current Lambs" tab and not in Active Ewes/Rams.
  return months < 4;
}

function matchesTab(sheep, tabId) {
  // If no tab specified, be permissive. When tab === 'all' we intentionally
  // only show active animals (exclude archived/sold/culled) so the 'All'
  // view remains useful for day-to-day operations.
  if (!tabId) return true;
  if (tabId === 'all') return isActiveStatus((sheep && sheep.status) || '');
  const status = (sheep.status || '').toString();
  const sex = (sheep.sex || '').toString().toLowerCase();
  switch (tabId) {
    case 'active-ewes':
      // Exclude very young animals (lambs) from the active lists so lambs
      // appear only under the "current-lambs" tab.
      return isActiveStatus(status) && sex === 'ewe' && !isLamb(sheep);
    case 'active-rams':
      return isActiveStatus(status) && sex === 'ram' && !isLamb(sheep);
    case 'current-lambs':
      return isActiveStatus(status) && isLamb(sheep);
    case 'culled':
      return String(status).toLowerCase() === 'culled';
    case 'to-be-culled':
      return String(status).toLowerCase() === 'to-be-culled' || String(status).toLowerCase() === 'to be culled' || String(status).toLowerCase() === 'tobe-culled';
    case 'sold':
      return String(status).toLowerCase() === 'sold';
    case 'archived':
      return String(status).toLowerCase() === 'archived';
    default:
      return true;
  }
}

function setSheepTableSort(field) {
  if (_sheepTableSort.field === field) {
    _sheepTableSort.asc = !_sheepTableSort.asc;
  } else {
    _sheepTableSort.field = field;
    _sheepTableSort.asc = true;
  }
  updateSortIndicators();
  loadSheepList();
}

function updateSortIndicators() {
  const headers = document.querySelectorAll('#sheepTable th[data-sort]');
  headers.forEach(h => {
    let ind = h.querySelector('.sort-indicator');
    if (!ind) { ind = document.createElement('span'); ind.className = 'sort-indicator'; h.appendChild(ind); }
    const field = h.getAttribute('data-sort');
    if (field === _sheepTableSort.field) {
      ind.textContent = _sheepTableSort.asc ? '▲' : '▼';
    } else {
      ind.textContent = '';
    }
  });
}

function getSavedColumnWidths(table) {
  if (!table || !table.id) return null;
  try {
    const key = `table-colwidths-${table.id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch (e) { return null; }
}

function saveColumnWidths(table) {
  if (!table || !table.id) return;
  const ths = table.querySelectorAll('th');
  const widths = Array.from(ths).map(th => th.offsetWidth);
  try { localStorage.setItem(`table-colwidths-${table.id}`, JSON.stringify(widths)); } catch (e) { console.warn(e); }
}

function autoFitColumn(table, index) {
  if (!table) return;
  // measure text width using a hidden element
  const measure = document.createElement('div');
  document.body.appendChild(measure);
  const style = getComputedStyle(table);
  measure.style.position = 'absolute';
  measure.style.visibility = 'hidden';
  measure.style.whiteSpace = 'nowrap';
  measure.style.font = style.font;
  let max = 40;
  // include header
  const header = table.querySelector(`th:nth-child(${index})`);
  if (header) {
    measure.textContent = header.innerText || header.textContent || '';
    max = Math.max(max, measure.scrollWidth + 24);
  }
  Array.from(table.querySelectorAll(`tbody tr td:nth-child(${index})`)).forEach(td => {
    measure.textContent = td.innerText || td.textContent || '';
    max = Math.max(max, measure.scrollWidth + 24);
  });
  document.body.removeChild(measure);
  const th = table.querySelector(`th:nth-child(${index})`);
  if (th) th.style.width = max + 'px';
  Array.from(table.querySelectorAll('tbody tr')).forEach(row => {
    const cell = row.querySelector(`td:nth-child(${index})`);
    if (cell) cell.style.width = max + 'px';
  });
  saveColumnWidths(table);
}

// Auto-fit any visible columns in a table by calling autoFitColumn for each visible header.
function refreshVisibleColumnWidths(table) {
  if (!table) return;
  try {
    const ths = Array.from(table.querySelectorAll('th'));
    ths.forEach((th, i) => {
      try {
        const style = getComputedStyle(th);
        if (style && style.display && style.display === 'none') return;
        autoFitColumn(table, i + 1);
      } catch (e) { /* ignore individual column errors */ }
    });
  } catch (e) { /* ignore */ }
}

function compareSheep(a, b, field) {
  const now = new Date();
  const dir = _sheepTableSort.asc ? 1 : -1;
  switch (field) {
    case 'name':
      return dir * String((a.name || '')).localeCompare(String((b.name || '')));
    case 'id':
      return dir * String((a.id || '')).localeCompare(String((b.id || '')));
    case 'breed':
      return dir * String((a.breed || '')).localeCompare(String((b.breed || '')));
    case 'sire':
      return dir * String((a.sire || '')).localeCompare(String((b.sire || '')));
    case 'dam':
      return dir * String((a.dam || '')).localeCompare(String((b.dam || '')));
    case 'sex':
      return dir * String((a.sex || '')).localeCompare(String((b.sex || '')));
    case 'weight':
      {
        const wa = parseFloat(a.weight) || 0;
        const wb = parseFloat(b.weight) || 0;
        return dir * (wa - wb);
      }
    case 'age':
      {
        const bdA = a.birthDate ? new Date(a.birthDate) : null;
        const bdB = b.birthDate ? new Date(b.birthDate) : null;
        const daysA = (bdA && !isNaN(bdA)) ? Math.floor((now - bdA) / (1000 * 60 * 60 * 24)) : Infinity;
        const daysB = (bdB && !isNaN(bdB)) ? Math.floor((now - bdB) / (1000 * 60 * 60 * 24)) : Infinity;
        return dir * (daysA - daysB);
      }
    case 'expectedDueDate':
      {
        // Compare expected due dates (ISO or other parsable date strings).
        const da = a.expectedDueDate || a.nextDue || a.dueDate || null;
        const db = b.expectedDueDate || b.nextDue || b.dueDate || null;
        const dA = da ? new Date(da) : null;
        const dB = db ? new Date(db) : null;
        const ta = (dA && !isNaN(dA)) ? dA.getTime() : Infinity;
        const tb = (dB && !isNaN(dB)) ? dB.getTime() : Infinity;
        return dir * (ta - tb);
      }
    case 'pastLambing':
      {
        // Sort by highest multiplicity seen: Triplet (3) > Twin (2) > Single (1) > Other (0)
        function val(s) {
          const sum = getSheepLambingSummary(s);
          if ((sum.triplets || 0) > 0) return 3;
          if ((sum.twins || 0) > 0) return 2;
          if ((sum.single || 0) > 0) return 1;
          return 0;
        }
        const va = val(a);
        const vb = val(b);
        return dir * (va - vb);
      }
    case 'bredDate':
      {
        const da = a.bredDate || null;
        const db = b.bredDate || null;
        const dA = da ? new Date(da) : null;
        const dB = db ? new Date(db) : null;
        const ta = (dA && !isNaN(dA)) ? dA.getTime() : Infinity;
        const tb = (dB && !isNaN(dB)) ? dB.getTime() : Infinity;
        return dir * (ta - tb);
      }
    case 'daysUntil':
      {
        const now = Date.now();
        const da = a.expectedDueDate ? new Date(a.expectedDueDate).getTime() : Infinity;
        const db = b.expectedDueDate ? new Date(b.expectedDueDate).getTime() : Infinity;
        const va = (isFinite(da) ? Math.max(0, Math.ceil((da - now) / (1000 * 60 * 60 * 24))) : Infinity);
        const vb = (isFinite(db) ? Math.max(0, Math.ceil((db - now) / (1000 * 60 * 60 * 24))) : Infinity);
        return dir * (va - vb);
      }
    case 'daysPost':
      {
        // days since last lambing (if last lambing date known)
        const sa = getSheepLambingSummary(a).lastDate ? new Date(getSheepLambingSummary(a).lastDate).getTime() : -Infinity;
        const sb = getSheepLambingSummary(b).lastDate ? new Date(getSheepLambingSummary(b).lastDate).getTime() : -Infinity;
        const ta = (isFinite(sa) && sa !== -Infinity) ? Math.floor((Date.now() - sa) / (1000 * 60 * 60 * 24)) : Infinity;
        const tb = (isFinite(sb) && sb !== -Infinity) ? Math.floor((Date.now() - sb) / (1000 * 60 * 60 * 24)) : Infinity;
        return dir * (ta - tb);
      }
    case 'lastLambingDate':
      {
        // Sort by the last lambing date (earlier => smaller). Missing dates go to the end.
        const laRaw = getSheepLambingSummary(a).lastDate;
        const lbRaw = getSheepLambingSummary(b).lastDate;
        const ta = laRaw ? new Date(laRaw).getTime() : Infinity;
        const tb = lbRaw ? new Date(lbRaw).getTime() : Infinity;
        return dir * (ta - tb);
      }
    default:
      return 0;
  }
}

// Find a sheep by id or name (case-insensitive name). Returns the sheep object or null.
function findSheepByNameOrId(key) {
  if (!key) return null;
  const list = JSON.parse(localStorage.getItem('sheepList') || '[]');
  // direct id match
  const byId = list.find(s => s.id === key);
  if (byId) return byId;

  const keyNorm = key.trim().toLowerCase();
  return list.find(s => (s.name || '').trim().toLowerCase() === keyNorm) || null;
}

// Build a detail-page URL for a sheep id, preserving the current tab when available.
function buildDetailLink(id, tabOverride, fromSource) {
  if (!id) return 'sheep-detail.html';
  try {
    const params = new URLSearchParams();
    params.set('id', id);
    let tab = typeof tabOverride !== 'undefined' ? tabOverride : null;
    if (!tab) {
      try { const p = new URLSearchParams(window.location.search); tab = p.get('tab') || _currentTab; } catch (e) { tab = _currentTab; }
    }
    if (tab && tab !== 'all') params.set('tab', tab);

    // Determine 'from' source if not explicitly provided. Prefer explicit param.
    let from = typeof fromSource !== 'undefined' ? fromSource : null;
    if (!from) {
      try {
        const path = (window.location && window.location.pathname) ? window.location.pathname.split('/').pop() : '';
        if (path === 'actions.html') from = 'actions';
        else if (!path || path === 'index.html' || path === '') from = 'dashboard';
      } catch (e) { /* ignore */ }
    }
    if (from) params.set('from', from);

    return 'sheep-detail.html?' + params.toString();
  } catch (e) {
    return 'sheep-detail.html?id=' + encodeURIComponent(id);
  }
}

// Build pedigree HTML for a sheep object up to `depth` generations.
// If sire/dam match existing sheep, link to them and expand recursively.
function buildPedigreeHtml(sheepObj, depth, visited) {
  if (!sheepObj || depth < 0) return '';
  depth = Math.max(0, depth);

  // Build levels array where level 0 is the subject, level 1 parents, level 2 grandparents, etc.
  const levels = [];
  levels.push([{ node: sheepObj, label: sheepObj.name || sheepObj.id || '(unknown)' }]);

  for (let g = 0; g < depth; g++) {
    const prev = levels[levels.length - 1];
    const next = [];
    prev.forEach(item => {
      const n = item && item.node ? item.node : null;
      if (n) {
        const sireKey = n.sire || '';
        const damKey = n.dam || '';
        const sireSheep = sireKey ? findSheepByNameOrId(sireKey) : null;
        const damSheep = damKey ? findSheepByNameOrId(damKey) : null;
        next.push({ node: sireSheep, label: sireSheep ? (sireSheep.name || sireSheep.id) : (sireKey || '') });
        next.push({ node: damSheep, label: damSheep ? (damSheep.name || damSheep.id) : (damKey || '') });
      } else {
        // maintain shape
        next.push({ node: null, label: '' });
        next.push({ node: null, label: '' });
      }
    });
    levels.push(next);
  }

  // Render columns left-to-right from subject -> oldest generation (child on the left)
  const cols = levels;
  let html = '<div class="pedigree-grid">';
  cols.forEach((col, ci) => {
    html += '<div class="pedigree-col">';
    col.forEach(cell => {
      if (cell && cell.node) {
        const id = cell.node.id || '';
        const name = escapeHtml(cell.node.name || cell.node.id || '');
        // render as a button so navigation is handled by JS and looks like a link
        html += `<div class="pedigree-box"><button type="button" class="detail-link" data-id="${id}">${name}</button></div>`;
      } else {
        const txt = escapeHtml(cell && cell.label ? cell.label : '—');
        html += `<div class="pedigree-box pedigree-missing">${txt}</div>`;
      }
    });
    html += '</div>';
  });
  html += '</div>';
  return html;
}

// Wire up any `.detail-link` buttons or legacy detail anchors to navigate to the sheep detail page.
function wireDetailButtons(root) {
  try {
    const r = root || document;
    // Buttons rendered as detail-link: navigate using buildDetailLink with the data-id
    Array.from(r.querySelectorAll('button.detail-link')).forEach(btn => {
      if (btn._detailWired) return;
      btn.addEventListener('click', (e) => {
        try {
          const id = btn.dataset && btn.dataset.id ? btn.dataset.id : (btn.getAttribute('data-id') || '');
          if (!id) return;
          window.location.href = buildDetailLink(id);
        } catch (er) { window.location.href = buildDetailLink(btn.dataset && btn.dataset.id ? btn.dataset.id : ''); }
      });
      btn._detailWired = true;
    });

    // Legacy anchors that point to sheep-detail.html: prevent default and navigate (keeps behavior consistent)
    Array.from(r.querySelectorAll('a[href*="sheep-detail.html"]')).forEach(a => {
      if (a._detailWired) return;
      a.addEventListener('click', (ev) => {
        try {
          ev.preventDefault();
          const href = a.getAttribute('href');
          window.location.href = href;
        } catch (e) { /* ignore */ }
      });
      a._detailWired = true;
    });
  } catch (e) { console.warn('wireDetailButtons failed', e); }
}

// Draw SVG connectors between pedigree boxes. Expects the pedigree grid
// to be rendered inside `container` using `.pedigree-grid` / `.pedigree-col` / `.pedigree-box`.
function drawPedigreeConnectors(container, sheepId) {
  try {
    if (!container) return;
    // ensure container can position an absolute SVG overlay
    const prevSvg = container.querySelector('svg.pedigree-connectors');
    if (prevSvg) prevSvg.remove();

    const grid = container.querySelector('.pedigree-grid');
    if (!grid) return;

    // make container positioned for overlay
    const prevPos = window.getComputedStyle(container).position;
    if (prevPos === 'static') container.style.position = 'relative';

    const cols = Array.from(grid.querySelectorAll('.pedigree-col'));
    if (!cols.length) return;

    // measure container size
    const contRect = container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(contRect.width));
    const height = Math.max(1, Math.floor(contRect.height));

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'pedigree-connectors');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.overflow = 'visible';
    svg.style.zIndex = '1';

    // ensure boxes appear above the SVG
    grid.querySelectorAll('.pedigree-box').forEach(b => { b.style.position = 'relative'; b.style.zIndex = 2; });

    // For each column (child) connect to next column (parents).
    for (let ci = 0; ci < cols.length - 1; ci++) {
      const childBoxes = Array.from(cols[ci].querySelectorAll('.pedigree-box'));
      const parentBoxes = Array.from(cols[ci + 1].querySelectorAll('.pedigree-box'));
      for (let r = 0; r < childBoxes.length; r++) {
        const child = childBoxes[r];
        if (!child) continue;
        const childRect = child.getBoundingClientRect();
        const startX = childRect.right - contRect.left; // right edge of child (outgoing)
        const startY = childRect.top + (childRect.height / 2) - contRect.top;

        // corresponding parents are typically at indices 2*r and 2*r+1
        // but be tolerant: if column lengths differ, map proportionally
        let parents = [];
        if (parentBoxes.length >= (childBoxes.length * 2)) {
          parents = [parentBoxes[2 * r], parentBoxes[2 * r + 1]];
        } else {
          const base = Math.floor((r * parentBoxes.length) / Math.max(1, childBoxes.length));
          parents = [parentBoxes[base], parentBoxes[base + 1]];
        }
        parents.forEach(p => {
          if (!p) return;
          const pRect = p.getBoundingClientRect();
          const endX = pRect.left - contRect.left; // left edge of parent (incoming)
          const endY = pRect.top + (pRect.height / 2) - contRect.top;

          // compute a smooth cubic curve from child -> parent
          const delta = Math.max(24, Math.abs(endX - startX) * 0.35);
          const c1x = startX + delta;
          const c1y = startY;
          const c2x = endX - delta;
          const c2y = endY;
          const path = document.createElementNS(svgNS, 'path');
          const d = `M ${startX} ${startY} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${endX} ${endY}`;
          path.setAttribute('d', d);
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', '#cbd5e1');
          path.setAttribute('stroke-width', '1.8');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          svg.appendChild(path);
        });
      }
    }

    // Insert SVG under the grid so it sits behind boxes
    grid.parentNode.insertBefore(svg, grid);

    // Debounced resize: re-draw on window resize
    try {
      if (container._pedigreeResizeHandler) window.removeEventListener('resize', container._pedigreeResizeHandler);
    } catch (e) { }
    const handler = debounce(() => drawPedigreeConnectors(container, sheepId), 180);
    container._pedigreeResizeHandler = handler;
    window.addEventListener('resize', handler);
  } catch (e) {
    console.warn('drawPedigreeConnectors failed', e);
  }
}

// Simple debounce helper
function debounce(fn, wait) {
  let t = null;
  return function () {
    clearTimeout(t);
    const args = arguments;
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Update the auto-pedigree display for a given sheep id. If `overrides` provided,
// those fields (sire/dam/name) will be used for preview without saving.
function updateAutoPedigree(sheepId, overrides) {
  const container = document.getElementById('autoPedigree');
  if (!container) return;
  const stored = JSON.parse(localStorage.getItem(`sheep-${sheepId}`) || '{}');
  const combined = Object.assign({}, stored, overrides || {});
  // Build pedigree to configured generations (default 3)
  const gens = getPedigreeGenerations();
  const html = buildPedigreeHtml(combined, gens, new Set());
  container.innerHTML = html || '<em>No pedigree available.</em>';
  // After DOM insertion, draw connector SVGs. Use a short timeout so layout is settled.
  try {
    setTimeout(() => {
      drawPedigreeConnectors(container, sheepId);
      try { wireDetailButtons(container); } catch (e) { }
    }, 30);
  } catch (e) { /* ignore */ }
}

// Render a report into the report table container. type: 'ageAsc'|'ageDesc'|'dueDates'
function renderReport(type) {
  let sheep = getAllSheep();
  // By default, reports should operate on active animals only (exclude archived/sold/culled)
  // unless the report explicitly targets inactive/statused animals (death/sold/culled reports).
  try {
    const inactiveReports = ['deathReport', 'soldReport', 'cullReport'];
    if (!inactiveReports.includes(type)) {
      sheep = (sheep || []).filter(s => isActiveStatus((s && s.status) || ''));
    }
  } catch (e) { /* ignore filtering errors and fall back to full list */ }
  const now = new Date();

  if (!sheep.length) {
    document.getElementById('reportTableContainer').innerHTML = '<p>No sheep data found.</p>';
    return;
  }

  if (type === 'ageAsc' || type === 'ageDesc') {
    const rows = sheep.map(s => {
      const bd = s.birthDate ? new Date(s.birthDate) : null;
      const ageDays = bd && !isNaN(bd) ? Math.floor((now - bd) / (1000 * 60 * 60 * 24)) : null;
      return {
        id: s.id || '',
        name: s.name || '',
        breed: s.breed || '',
        birthDate: s.birthDate ? formatDateLong(s.birthDate) : '',
        ageText: s.birthDate ? computeAge(s.birthDate) : (s.age || ''),
        ageDays
      };
    });

    rows.sort((a, b) => {
      const av = a.ageDays === null ? Infinity : a.ageDays;
      const bv = b.ageDays === null ? Infinity : b.ageDays;
      return type === 'ageAsc' ? av - bv : bv - av;
    });

    const columns = ['Name', 'Breed', 'Birth Date', 'Age'];
    const tableRows = rows.map(r => [r.name, r.breed, r.birthDate, r.ageText]);
    buildReportTable(columns, tableRows);
    return;
  }

  if (type === 'dueDates') {
    // Look for expectedDueDate / nextDue / dueDate fields on sheep objects (accept arrays/CSV and infer from bredDate)
    const rows = sheep.map(s => {
      const gather = (s) => {
        const out = [];
        const pushVal = (v) => {
          if (v === undefined || v === null) return;
          if (Array.isArray(v)) v.forEach(x => x && out.push(x));
          else if (typeof v === 'string') {
            if (v.indexOf(',') !== -1 || v.indexOf(';') !== -1) v.split(/[,;]+/).map(x => x.trim()).forEach(x => x && out.push(x));
            else out.push(v);
          } else out.push(v);
        };
        pushVal(s.expectedDueDate); pushVal(s.expectedDueDates); pushVal(s.nextDue); pushVal(s.dueDate); pushVal(s.dueDates); pushVal(s.due); pushVal(s.expected);
        return out;
      };
      const cands = gather(s);
      let dueDate = null;
      if (cands && cands.length) {
        for (let i = 0; i < cands.length; i++) {
          const d = new Date(cands[i]);
          if (!isNaN(d)) { dueDate = d; break; }
        }
      }
      if (!dueDate && s.bredDate) {
        try { const bd = new Date(s.bredDate); const gd = getGestationDays(); if (!isNaN(bd) && gd) dueDate = new Date(bd.getTime() + (gd * 24 * 60 * 60 * 1000)); } catch (e) { }
      }
      return {
        id: s.id || '',
        name: s.name || '',
        breed: s.breed || '',
        due: dueDate && !isNaN(dueDate) ? formatDateLong(dueDate) : '',
        dueTs: dueDate && !isNaN(dueDate) ? dueDate.getTime() : null
      };
    }).filter(r => r.due);

    if (!rows.length) {
      document.getElementById('reportTableContainer').innerHTML = '<p>No due-date data available for any sheep.</p>';
      return;
    }

    rows.sort((a, b) => a.dueTs - b.dueTs);
    const columns = ['Name', 'Breed', 'Expected Due Date'];
    const tableRows = rows.map(r => [r.name, r.breed, r.due]);
    buildReportTable(columns, tableRows);
    return;
  }

  // Weight Gain / Growth report: summarize initial and latest weights and compute gain
  if (type === 'weightGain') {
    const rows = [];
    sheep.forEach(s => {
      try {
        const wts = Array.isArray(s.weights) ? s.weights.slice().filter(w => w && w.date) : [];
        if (!wts || !wts.length) return; // skip animals with no weight history
        // Normalize weight values and parse dates
        const parsed = wts.map(w => {
          const d = new Date(w.date);
          const wt = (w.weight !== undefined && w.weight !== null && w.weight !== '') ? parseFloat(String(w.weight)) : NaN;
          return { date: d, dateIso: (w.date || ''), weight: isNaN(wt) ? null : wt };
        }).filter(p => p && p.date && !isNaN(p.date.getTime()));
        if (!parsed.length) return;
        parsed.sort((a, b) => a.date.getTime() - b.date.getTime());
        const first = parsed[0];
        const last = parsed[parsed.length - 1];
        const days = Math.max(0, Math.round((last.date.getTime() - first.date.getTime()) / (1000 * 60 * 60 * 24)));
        const initialW = (first.weight !== null && first.weight !== undefined) ? first.weight : '';
        const latestW = (last.weight !== null && last.weight !== undefined) ? last.weight : '';
        const gain = (typeof initialW === 'number' && typeof latestW === 'number') ? (latestW - initialW) : '';
        const gainPerDay = (gain !== '' && days > 0) ? (gain / days) : (days === 0 ? '' : '');
        rows.push({
          name: s.name || '',
          id: s.id || '',
          sex: s.sex || '',
          initialDate: first.dateIso || (first.date ? first.date.toISOString().slice(0, 10) : ''),
          initialWeight: initialW !== '' ? String(initialW) : '',
          latestDate: last.dateIso || (last.date ? last.date.toISOString().slice(0, 10) : ''),
          latestWeight: latestW !== '' ? String(latestW) : '',
          days,
          gain: gain !== '' ? String(Math.round((gain + Number.EPSILON) * 100) / 100) : '',
          gainPerDay: (gainPerDay !== '' && gainPerDay !== undefined && !isNaN(gainPerDay)) ? String(Math.round((gainPerDay + Number.EPSILON) * 1000) / 1000) : ''
        });
      } catch (e) { /* ignore per-sheep errors */ }
    });

    if (!rows.length) {
      document.getElementById('reportTableContainer').innerHTML = '<p>No weight history available for any sheep.</p>';
      return;
    }

    // build table rows
    const columns = ['Name', 'Sex', 'Initial Date', 'Initial Weight (lbs)', 'Latest Date', 'Latest Weight (lbs)', 'Days', 'Gain (lbs)', 'Gain per day (lbs)'];
    const tableRows = rows.map(r => [r.name, r.sex, r.initialDate, r.initialWeight, r.latestDate, r.latestWeight, r.days, r.gain, r.gainPerDay]);
    buildReportTable(columns, tableRows);
    return;
  }

  // Breeding history: show bredDate, sire and expected due
  if (type === 'breedingHistory') {
    const rows = [];
    sheep.forEach(s => {
      try {
        if (!s.bredDate && !s._lastBreedingSire) return;
        const bd = s.bredDate ? new Date(s.bredDate) : null;
        let expected = '';
        try { if (bd && !isNaN(bd)) { const gd = getGestationDays(); if (gd) expected = formatDateLong(new Date(bd.getTime() + gd * 24 * 60 * 60 * 1000)); } } catch (e) { }
        const sireDisplay = (s._lastBreedingSire || s.sire) ? ((findSheepByNameOrId(s._lastBreedingSire || s.sire) || {}).name || (s._lastBreedingSire || s.sire)) : '';
        rows.push([s.name || '', s.breed || '', s.bredDate ? formatDateLong(s.bredDate) : '', sireDisplay, expected]);
      } catch (e) { }
    });
    if (!rows.length) { document.getElementById('reportTableContainer').innerHTML = '<p>No breeding history found.</p>'; return; }
    buildReportTable(['Name', 'Breed', 'Bred Date', 'Sire', 'Expected Due'], rows);
    return;
  }

  // Lamb report: list recorded lambing events with counts and children
  if (type === 'lambReport') {
    const rows = [];
    sheep.forEach(s => {
      try {
        if (!Array.isArray(s.lambings) || !s.lambings.length) return;
        s.lambings.forEach(ev => {
          try {
            const date = ev && ev.date ? (formatDateLong(ev.date) || ev.date) : '';
            const count = ev && ev.count ? String(ev.count) : '';
            const sire = ev && ev.sire ? ((findSheepByNameOrId(ev.sire) || {}).name || ev.sire) : (s.sire || '');
            // Map child IDs to names where possible; omit raw IDs
            let children = '';
            try {
              if (ev && ev.children) {
                if (Array.isArray(ev.children)) {
                  const mapped = ev.children.map(c => { try { const r = findSheepByNameOrId(c); return (r && r.name) ? r.name : (typeof c === 'string' && c.indexOf('sheep-') === 0 ? '' : (c || '')); } catch (e) { return ''; } }).filter(Boolean);
                  children = mapped.join(', ');
                } else {
                  const raw = String(ev.children || '');
                  const r = findSheepByNameOrId(raw);
                  children = (r && r.name) ? r.name : (raw.indexOf('sheep-') === 0 ? '' : raw);
                }
              }
            } catch (e) { children = ''; }
            rows.push([s.name || '', date, count, sire, children]);
          } catch (e) { }
        });
      } catch (e) { }
    });
    if (!rows.length) { document.getElementById('reportTableContainer').innerHTML = '<p>No lambing records found.</p>'; return; }
    buildReportTable(['Dam Name', 'Lambing Date', 'Count', 'Sire', 'Children'], rows);
    return;
  }

  // Herd / Ram / Ewe reports: simple animal listings
  if (type === 'herdReport' || type === 'ramReport' || type === 'eweReport') {
    const wantSex = type === 'ramReport' ? 'ram' : (type === 'eweReport' ? 'ewe' : null);
    const rows = sheep.filter(s => { try { return !wantSex || ((s.sex || '').toString().toLowerCase() === wantSex); } catch (e) { return false; } }).map(s => {
      return [s.name || '', s.sex || '', s.breed || '', s.status || '', s.birthDate ? formatDateLong(s.birthDate) : '', s.birthDate ? computeAge(s.birthDate) : (s.age || ''), s.weight ? (s.weight + ' lbs') : ''];
    });
    if (!rows.length) { document.getElementById('reportTableContainer').innerHTML = '<p>No animals match this report.</p>'; return; }
    buildReportTable(['Name', 'Sex', 'Breed', 'Status', 'Birth Date', 'Age', 'Weight'], rows);
    return;
  }

  // Sire offspring report: group by sire id (based on sheep.sire)
  if (type === 'sireOffspring' || type === 'damOffspring') {
    const byParent = {};
    const field = type === 'sireOffspring' ? 'sire' : 'dam';
    sheep.forEach(s => {
      try {
        const p = s[field];
        if (!p) return;
        const key = String(p);
        if (!byParent[key]) byParent[key] = [];
        byParent[key].push(s);
      } catch (e) { }
    });
    const rows = [];
    Object.keys(byParent).forEach(pid => {
      try {
        const parentRec = findSheepByNameOrId(pid) || { id: pid, name: pid };
        const offs = byParent[pid] || [];
        const names = offs.map(o => (o.name || '')).filter(Boolean).join(', ');
        rows.push([parentRec.name || pid, String(offs.length), names]);
      } catch (e) { }
    });
    if (!rows.length) { document.getElementById('reportTableContainer').innerHTML = '<p>No parent-offspring links found.</p>'; return; }
    buildReportTable([type === 'sireOffspring' ? 'Sire' : 'Dam', 'Offspring Count', 'Offspring (names)'], rows);
    return;
  }

  // FAMACHA / BCS report: look for famacha / bcs fields on sheep
  if (type === 'famachaBcs') {
    const rows = [];
    sheep.forEach(s => {
      try {
        if (!s.famacha && !s.bcs && !s.famachaDate && !s.bcsDate) return;
        rows.push([s.name || '', s.famacha || '', s.famachaDate ? formatDateLong(s.famachaDate) : '', s.bcs || '', s.bcsDate ? formatDateLong(s.bcsDate) : '']);
      } catch (e) { }
    });
    if (!rows.length) { document.getElementById('reportTableContainer').innerHTML = '<p>No FAMACHA/BCS entries found.</p>'; return; }
    buildReportTable(['Name', 'FAMACHA', 'FAMACHA Date', 'BCS', 'BCS Date'], rows);
    return;
  }

  // Deaths, Sold, Cull reports
  if (type === 'deathReport' || type === 'soldReport' || type === 'cullReport') {
    const statusMap = { deathReport: ['died', 'dead', 'deceased'], soldReport: ['sold'], cullReport: ['culled', 'to-be-culled', 'to be culled'] };
    const wanted = statusMap[type] || [];
    const rows = [];
    sheep.forEach(s => {
      try {
        const st = (s.status || '').toString().toLowerCase();
        if (!wanted.some(w => st.indexOf(w) !== -1)) return;
        const date = s.deathDate || s.soldDate || s.cullDate || s.statusDate || '';
        rows.push([s.name || '', s.sex || '', s.breed || '', date ? formatDateLong(date) : '', s.notes || '']);
      } catch (e) { }
    });
    if (!rows.length) { document.getElementById('reportTableContainer').innerHTML = '<p>No records found for this report.</p>'; return; }
    buildReportTable(['Name', 'Sex', 'Breed', 'Date', 'Notes'], rows);
    return;
  }

  // Lambing calendar: show expected due dates and recorded lambing events
  if (type === 'lambingCalendar' || type === 'lambingCalendarIcs') {
    // Build a lambing report with columns: Dam (Name/Tag), Sire (Name/Tag), Breeding Date, Date, Due Date
    let rowsOut = [];
    const gatherDateCandidates = (s) => {
      const out = [];
      const pushVal = (v) => {
        if (v === undefined || v === null) return;
        if (Array.isArray(v)) { v.forEach(x => { if (x) out.push(x); }); }
        else if (typeof v === 'string') {
          if (v.indexOf(',') !== -1 || v.indexOf(';') !== -1) v.split(/[,;]+/).map(x => x.trim()).forEach(x => { if (x) out.push(x); });
          else out.push(v);
        } else out.push(v);
      };
      pushVal(s.expectedDueDate); pushVal(s.expectedDueDates); pushVal(s.nextDue); pushVal(s.dueDate); pushVal(s.dueDates); pushVal(s.due); pushVal(s.expected);
      return out;
    };

    // read only date-range filters from the report UI (if present)
    const lowerBoundInput = document.getElementById('matingdate_lowerbound');
    const upperBoundInput = document.getElementById('matingdate_upperbound');
    // advanced filters removed (Breed/Dam/Sire/Herd/Sex and "Show ewes without marks"); always exclude no-mark ewes unless a date range is used
    const showEwesWithoutMarks = false;
    const lowerBound = (lowerBoundInput && lowerBoundInput.value) ? new Date(lowerBoundInput.value) : null;
    const upperBound = (upperBoundInput && upperBoundInput.value) ? new Date(upperBoundInput.value) : null;

    sheep.forEach(s => {
      try {
        const damName = s.name || s.id || '';
        const damId = s.id || '';
        const breedingDate = s.bredDate || '';

        // resolve default sire display from sheep-level data
        let defaultSireDisplay = '';
        try {
          if (s.sire) {
            let sireRec = null;
            const raw = localStorage.getItem(`sheep-${s.sire}`);
            if (raw) sireRec = JSON.parse(raw);
            if (!sireRec) sireRec = findSheepByNameOrId(s.sire) || null;
            defaultSireDisplay = (sireRec && (sireRec.name || sireRec.id)) || s.sire || '';
          }
        } catch (e) { defaultSireDisplay = s.sire || ''; }

        // advanced text filters removed (breed/dam/sire/herd/sex)

        // Find the earliest explicit due-date candidate, if any
        const candidates = gatherDateCandidates(s) || [];
        let chosenDue = null;
        try {
          const parsed = candidates.map(c => { const d = new Date(c); return isNaN(d) ? null : d; }).filter(Boolean);
          if (parsed.length) {
            parsed.sort((a, b) => a.getTime() - b.getTime());
            chosenDue = parsed[0];
          }
        } catch (e) { chosenDue = null; }

        // If no explicit chosen due, infer from bredDate
        if (!chosenDue && s.bredDate) {
          try { const bd = new Date(s.bredDate); const gd = getGestationDays(); if (!isNaN(bd) && gd) chosenDue = new Date(bd.getTime() + (gd * 24 * 60 * 60 * 1000)); } catch (e) { }
        }

        // If we still have no due date, either skip or include depending on filter
        if (!chosenDue && !showEwesWithoutMarks) return;

        const dueIso = chosenDue ? chosenDue.toISOString().slice(0, 10) : '';
        const dueDisplay = chosenDue ? formatDateLong(chosenDue) : 'No mark recorded';

        // Gather recorded lambing dates (if any) to show only the most recent as subtext
        let lambedSub = '';
        try {
          if (Array.isArray(s.lambings) && s.lambings.length) {
            const lambDates = s.lambings.map(ev => { try { return ev && ev.date ? new Date(ev.date) : null; } catch (e) { return null; } }).filter(d => d && !isNaN(d));
            if (lambDates.length) {
              // pick the most recent lambing date
              lambDates.sort((a, b) => b.getTime() - a.getTime());
              lambedSub = 'Lambed: ' + formatDateLong(lambDates[0]);
            }
          }
        } catch (e) { lambedSub = ''; }

        const dueCell = `<span data-due="${dueIso}">${dueDisplay}${lambedSub ? `<div style="font-size:12px;color:#666;margin-top:4px;">${lambedSub}</div>` : ''}</span>`;

        // Use the sheep-level sire display (the ram the ewe was bred to)
        rowsOut.push([damName, defaultSireDisplay || '', breedingDate, dueCell]);
      } catch (e) { /* ignore per-sheep errors */ }
    });

    // If a date-range filter is set, filter rows by Due Date; keep rows with no due when user asked for them.
    try {
      if (lowerBound || upperBound) {
        rowsOut = rowsOut.filter(r => {
          try {
            const cell = String(r[3] || '');
            const m = cell.match(/data-due="([0-9]{4}-[0-9]{2}-[0-9]{2})"/);
            const iso = m ? m[1] : '';
            if (!iso) return showEwesWithoutMarks; // keep only if user asked to see no-mark ewes
            const d = new Date(iso);
            if (isNaN(d)) return false;
            if (lowerBound && d < lowerBound) return false;
            if (upperBound && d > upperBound) return false;
            return true;
          } catch (e) { return false; }
        });
      } else {
        // No date-range: if user didn't ask for no-mark ewes, drop rows with no due date
        if (!showEwesWithoutMarks) {
          rowsOut = rowsOut.filter(r => {
            try { const cell = String(r[3] || ''); const m = cell.match(/data-due="([0-9]{4}-[0-9]{2}-[0-9]{2})"/); return !!m; } catch (e) { return false; }
          });
        }
      }
    } catch (e) { /* ignore filtering errors */ }

    if (!rowsOut.length) {
      document.getElementById('reportTableContainer').innerHTML = '<p>No lambing or due-date events found.</p>';
      return;
    }

    // sort rows by the Due Date column (index 3). Use data-due if present.
    rowsOut.sort((a, b) => {
      try {
        const getIso = (cell) => {
          try {
            const s = String(cell || '');
            const m = s.match(/data-due="([0-9]{4}-[0-9]{2}-[0-9]{2})"/);
            return m ? m[1] : s;
          } catch (e) { return '' + cell; }
        };
        const da = new Date(getIso(a[3]));
        const db = new Date(getIso(b[3]));
        return (da.getTime() || 0) - (db.getTime() || 0);
      } catch (e) { return 0; }
    });

    const columns = ['Dam (Name/Tag)', 'Sire (Name/Tag)', 'Breeding Date', 'Due Date'];
    buildReportTable(columns, rowsOut);

    // If the user requested the ICS variant directly, offer automatic download
    if (type === 'lambingCalendarIcs') {
      try { exportReportIcs('lambingCalendar', events); } catch (e) { console.warn('Export ICS failed', e); }
    }
    return;
  }
}

// Build HTML table from columns array and rows array-of-arrays, place in container
function buildReportTable(columns, rows) {
  const container = document.getElementById('reportTableContainer');
  if (!container) return;

  // Create table element so we can attach handlers after insertion
  const table = document.createElement('table');
  table.className = 'report-table';

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((c, idx) => {
    const th = document.createElement('th');
    th.innerHTML = `<span class="col-title">${c}</span><span class="sort-indicator" style="margin-left:6px"></span>`;
    th.setAttribute('data-col-index', String(idx));
    th.style.cursor = 'pointer';
    // click to sort by this column
    th.addEventListener('click', () => {
      try {
        if (_reportTableSort.index === idx) _reportTableSort.asc = !_reportTableSort.asc; else { _reportTableSort.index = idx; _reportTableSort.asc = true; }
        // perform sort on a copy of rows
        const sorted = (rows || []).slice().sort((a, b) => {
          const va = getSortableCellValue(a[idx]);
          const vb = getSortableCellValue(b[idx]);
          return compareSortableValues(va, vb) * (_reportTableSort.asc ? 1 : -1);
        });
        // rebuild tbody
        const newTbody = buildTbody(sorted);
        const existingTbody = table.querySelector('tbody');
        if (existingTbody) table.replaceChild(newTbody, existingTbody); else table.appendChild(newTbody);
        updateReportSortIndicators(table);
      } catch (e) { console.warn('report sort failed', e); }
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  function buildTbody(dataRows) {
    const tbody = document.createElement('tbody');
    (dataRows || []).forEach(r => {
      const tr = document.createElement('tr');
      (r || []).forEach(c => {
        const td = document.createElement('td');
        // allow HTML cells (preserve markup) but ensure string fallback
        td.innerHTML = (c === undefined || c === null) ? '' : String(c);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    return tbody;
  }

  // initial body
  const tbody = buildTbody(rows);
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);

  // show initial sort indicators if state exists
  updateReportSortIndicators(table);
}

// Helper: produce a sortable primitive from a cell value (HTML or text)
function getSortableCellValue(cellHtml) {
  try {
    if (cellHtml === null || typeof cellHtml === 'undefined') return '';
    const div = document.createElement('div'); div.innerHTML = String(cellHtml);
    const txt = (div.textContent || div.innerText || '').trim();
    if (txt === '') return '';
    // detect ISO date (YYYY-MM-DD) or other date strings
    const isoMatch = txt.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return new Date(isoMatch[1]).getTime();
    // detect plain number
    const num = Number(txt.replace(/[^0-9\.\-]/g, ''));
    if (!isNaN(num) && String(num) !== '') return num;
    return txt.toLowerCase();
  } catch (e) { return String(cellHtml); }
}

function compareSortableValues(a, b) {
  if (a === b) return 0;
  if (a === '' || a === null || typeof a === 'undefined') return -1;
  if (b === '' || b === null || typeof b === 'undefined') return 1;
  // numeric timestamps or numbers
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  try { return String(a).localeCompare(String(b)); } catch (e) { return 0; }
}

function updateReportSortIndicators(table) {
  try {
    const ths = Array.from(table.querySelectorAll('thead th'));
    ths.forEach(th => {
      const idx = parseInt(th.getAttribute('data-col-index'), 10);
      const ind = th.querySelector('.sort-indicator');
      if (!ind) return;
      if (_reportTableSort.index === idx) ind.textContent = _reportTableSort.asc ? '▲' : '▼'; else ind.textContent = '';
    });
  } catch (e) { }
}

// Render a compact report summary (counts & simple charts) into #reportSummary.
function renderReportSummary(sheep, type) {
  try {
    const container = document.getElementById('reportSummary');
    if (!container) return;
    const list = Array.isArray(sheep) ? sheep : (sheep ? [sheep] : []);
    const total = list.length;
    let lambingsCount = 0;
    const bySex = { ewe: 0, ram: 0, unknown: 0 };
    const statusMap = {};
    list.forEach(s => {
      try {
        const sex = (s && s.sex || '').toString().toLowerCase();
        if (sex === 'ewe') bySex.ewe++; else if (sex === 'ram') bySex.ram++; else bySex.unknown++;
        const st = (s && s.status || '').toString().toLowerCase() || 'active';
        statusMap[st] = (statusMap[st] || 0) + 1;
        if (Array.isArray(s.lambings)) lambingsCount += s.lambings.length;
      } catch (e) { }
    });

    const statusData = Object.keys(statusMap).map(k => ({ label: k.charAt(0).toUpperCase() + k.slice(1), value: statusMap[k] }));
    const sexData = [{ label: 'Ewes', value: bySex.ewe }, { label: 'Rams', value: bySex.ram }, { label: 'Unknown', value: bySex.unknown }];

    // Build summary HTML and placeholders for charts
    const html = `
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;">
        <div style="min-width:200px;">
          <h3 style="margin:0 0 8px 0">Summary</h3>
          <div>Total animals: <strong>${total}</strong></div>
          <div>Recorded lambing events: <strong>${lambingsCount}</strong></div>
        </div>
        <div id="sexChart" style="width:220px;height:140px;" aria-hidden="false"></div>
        <div id="statusChart" style="width:320px;height:140px;" aria-hidden="false"></div>
      </div>
    `;
    container.innerHTML = html;

    // Draw charts into the placeholders
    try { drawDonutChart(document.getElementById('sexChart'), sexData); } catch (e) { }
    try { drawSimpleBarChart(document.getElementById('statusChart'), statusData); } catch (e) { }
  } catch (e) { console.warn('renderReportSummary error', e); }
}

// Draw a very small horizontal bar chart into `el`. `data` is [{label,value},...].
function drawSimpleBarChart(el, data) {
  if (!el) return;
  try {
    const w = Math.max(240, el.clientWidth || 320);
    const h = 140;
    const pad = 8;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.style.fontFamily = 'sans-serif';
    const max = Math.max(1, ...(data.map(d => Number(d.value) || 0)));
    const barH = Math.floor((h - pad * 2) / Math.max(1, data.length));
    data.forEach((d, i) => {
      const val = Number(d.value) || 0;
      const barW = Math.round((w - 120 - pad * 2) * (val / max));
      const y = pad + i * barH + 6;
      const rect = document.createElementNS(svgNS, 'rect');
      rect.setAttribute('x', String(120)); rect.setAttribute('y', String(y)); rect.setAttribute('width', String(barW)); rect.setAttribute('height', String(barH - 10)); rect.setAttribute('fill', '#2f855a');
      svg.appendChild(rect);
      const label = document.createElementNS(svgNS, 'text'); label.setAttribute('x', String(6)); label.setAttribute('y', String(y + (barH - 10) / 2 + 4)); label.setAttribute('fill', '#222'); label.setAttribute('font-size', '12'); label.textContent = d.label;
      svg.appendChild(label);
      const vtext = document.createElementNS(svgNS, 'text'); vtext.setAttribute('x', String(120 + barW + 6)); vtext.setAttribute('y', String(y + (barH - 10) / 2 + 4)); vtext.setAttribute('fill', '#222'); vtext.setAttribute('font-size', '12'); vtext.textContent = String(val);
      svg.appendChild(vtext);
    });
    el.innerHTML = ''; el.appendChild(svg);
  } catch (e) { console.warn('drawSimpleBarChart failed', e); }
}

// Draw a simple donut chart into `el`. `data` is [{label,value},...].
function drawDonutChart(el, data) {
  if (!el) return;
  try {
    const w = Math.max(160, el.clientWidth || 220);
    const h = Math.max(120, el.clientHeight || 140);
    const r = Math.min(w, h) / 2 - 6;
    const cx = w / 2; const cy = h / 2;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('width', String(w)); svg.setAttribute('height', String(h)); svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const total = Math.max(1, data.reduce((s, it) => s + (Number(it.value) || 0), 0));
    let angle = -Math.PI / 2;
    const colors = ['#2f855a', '#0b66c3', '#888888', '#e2a600', '#c62828'];
    data.forEach((d, i) => {
      const val = Number(d.value) || 0; if (val <= 0) return;
      const frac = val / total; const end = angle + frac * Math.PI * 2;
      const x1 = cx + Math.cos(angle) * r; const y1 = cy + Math.sin(angle) * r;
      const x2 = cx + Math.cos(end) * r; const y2 = cy + Math.sin(end) * r;
      const large = (end - angle) > Math.PI ? 1 : 0;
      const path = document.createElementNS(svgNS, 'path');
      const dAttr = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
      path.setAttribute('d', dAttr);
      path.setAttribute('fill', colors[i % colors.length] || '#999'); svg.appendChild(path);
      angle = end;
    });
    // center hole
    const hole = document.createElementNS(svgNS, 'circle'); hole.setAttribute('cx', String(cx)); hole.setAttribute('cy', String(cy)); hole.setAttribute('r', String(Math.max(12, r * 0.45))); hole.setAttribute('fill', '#fff'); svg.appendChild(hole);
    // legend
    const legendX = 8; const legendY = h - 16 * data.length - 6;
    data.forEach((d, i) => {
      const lx = 8; const ly = 8 + i * 16;
      const rect = document.createElementNS(svgNS, 'rect'); rect.setAttribute('x', String(w - 110)); rect.setAttribute('y', String(ly)); rect.setAttribute('width', '12'); rect.setAttribute('height', '12'); rect.setAttribute('fill', colors[i % colors.length] || '#999'); svg.appendChild(rect);
      const t = document.createElementNS(svgNS, 'text'); t.setAttribute('x', String(w - 92)); t.setAttribute('y', String(ly + 10)); t.setAttribute('font-size', '11'); t.setAttribute('fill', '#222'); t.textContent = `${d.label} (${d.value})`; svg.appendChild(t);
    });
    el.innerHTML = ''; el.appendChild(svg);
  } catch (e) { console.warn('drawDonutChart failed', e); }
}

// Export currently-rendered report table to CSV
function exportReportCsv() {
  const container = document.getElementById('reportTableContainer');
  if (!container) return alert('No report to export');
  const table = container.querySelector('table');
  if (!table) return alert('No table available to export');

  const rows = Array.from(table.querySelectorAll('tr'));
  const csv = rows.map(tr => Array.from(tr.querySelectorAll('th,td')).map(td => '"' + (td.textContent || '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sheep-report-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Convert an events array to an ICS string and trigger download
function eventsToIcs(events, calendarName) {
  if (!Array.isArray(events)) events = [];
  calendarName = calendarName || 'Sheep Lambing Calendar';
  const lines = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//SheepManagement//EN');
  lines.push('CALSCALE:GREGORIAN');
  lines.push(`X-WR-CALNAME:${calendarName}`);
  const nowTs = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  events.forEach((ev, idx) => {
    try {
      const dt = ev.date ? ev.date.replace(/-/g, '') : null; // YYYYMMDD
      if (!dt) return;
      const uid = `sheep-${(ev.id || '')}-${dt}-${idx}@sheep-management`;
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${nowTs}`);
      // Use all-day DTSTART
      lines.push(`DTSTART;VALUE=DATE:${dt}`);
      // Make a one-day event
      lines.push(`DTEND;VALUE=DATE:${dt}`);
      const summary = `${ev.type}: ${ev.name}`;
      lines.push(`SUMMARY:${summary}`);
      const desc = `ID:${ev.id || ''}${ev.note ? ' — ' + ev.note : ''}`;
      lines.push(`DESCRIPTION:${desc}`);
      lines.push('END:VEVENT');
    } catch (e) { }
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// Export current report as ICS. If events provided, use them; otherwise generate from report type.
function exportReportIcs(reportType, events) {
  try {
    let evts = events;
    if (!Array.isArray(evts)) {
      if (reportType === 'lambingCalendar') {
        // regenerate events
        evts = [];
        const sheep = getAllSheep();
        sheep.forEach(s => {
          try {
            const id = s.id || '';
            const name = s.name || id || '';
            // gather possible due date candidates (arrays, csv lists, legacy fields)
            const gatherDateCandidates = (s) => {
              const out = [];
              const pushVal = (v) => {
                if (v === undefined || v === null) return;
                if (Array.isArray(v)) { v.forEach(x => { if (x) out.push(x); }); }
                else if (typeof v === 'string') {
                  if (v.indexOf(',') !== -1 || v.indexOf(';') !== -1) {
                    v.split(/[,;]+/).map(x => x.trim()).forEach(x => { if (x) out.push(x); });
                  } else out.push(v);
                } else out.push(v);
              };
              pushVal(s.expectedDueDate);
              pushVal(s.expectedDueDates);
              pushVal(s.nextDue);
              pushVal(s.dueDate);
              pushVal(s.dueDates);
              pushVal(s.due);
              pushVal(s.expected);
              return out;
            };
            const candidates = gatherDateCandidates(s);
            // Include a Breeding event if a bredDate is present so ICS contains breeding dates
            try {
              if (s.bredDate) {
                const bd = new Date(s.bredDate);
                if (!isNaN(bd)) evts.push({ date: bd.toISOString().slice(0, 10), type: 'Breeding', name, id, note: `Sire:${s.sire || ''}` });
              }
            } catch (e) { }

            if (candidates && candidates.length) {
              candidates.forEach(cand => { try { const d = new Date(cand); if (!isNaN(d)) evts.push({ date: d.toISOString().slice(0, 10), type: 'Expected Due', name, id, note: '' }); } catch (e) { } });
            } else {
              // infer from bredDate if available
              try {
                if (s.bredDate) {
                  const gd = getGestationDays();
                  const bd = new Date(s.bredDate);
                  if (!isNaN(bd) && gd && !isNaN(gd)) {
                    const inf = new Date(bd.getTime() + (gd * 24 * 60 * 60 * 1000));
                    evts.push({ date: inf.toISOString().slice(0, 10), type: 'Expected Due (inferred)', name, id, note: '' });
                  }
                }
              } catch (e) { }
            }
            if (Array.isArray(s.lambings)) {
              s.lambings.forEach(ev => {
                try {
                  const dstr = ev && ev.date ? ev.date : null;
                  const d = dstr ? new Date(dstr) : null;
                  if (d && !isNaN(d)) evts.push({ date: d.toISOString().slice(0, 10), type: 'Recorded Lambing', name, id, note: `count:${ev.count || ''}` });
                } catch (e) { }
              });
            }
          } catch (e) { }
        });
      } else {
        return alert('ICS export is only available for Lambing Calendar in this release.');
      }
    }

    if (!evts || !evts.length) return alert('No events to export.');
    const ics = eventsToIcs(evts, 'Sheep Lambing Calendar');
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lambing-calendar-${new Date().toISOString().slice(0, 10)}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) { console.warn('exportReportIcs failed', e); alert('Failed to export ICS. See console.'); }
}

function initReports() {
  const gen = document.getElementById('generateReport') || document.getElementById('generateReport2');
  const sel = document.getElementById('reportType');
  const exp = document.getElementById('exportCsv');
  const expIcs = document.getElementById('exportIcs');

  if (gen && sel) {
    gen.addEventListener('click', () => {
      // If user selected the ICS-first option, render and trigger ICS
      if (sel.value === 'lambingCalendarIcs') {
        // render table view for visibility, then download ICS
        renderReport('lambingCalendar');
        exportReportIcs('lambingCalendar');
      } else {
        renderReport(sel.value);
      }
    });
    // generate initial
    if (sel.value === 'lambingCalendarIcs') { renderReport('lambingCalendar'); } else { renderReport(sel.value); }
  }
  // wire secondary generate button if present (avoid double-wiring if we used it as primary)
  try {
    const gen2 = document.getElementById('generateReport2');
    if (gen2 && gen && gen !== gen2) gen2.addEventListener('click', () => gen.click());
  } catch (e) { }
  if (exp) exp.addEventListener('click', exportReportCsv);
  if (expIcs) expIcs.addEventListener('click', () => exportReportIcs(sel.value));
}

// Compute age string from a birth date string (YYYY-MM-DD)
function computeAge(birthDateStr) {
  if (!birthDateStr) return 'N/A';
  const bd = new Date(birthDateStr);
  if (isNaN(bd)) return 'N/A';
  const now = new Date();

  let years = now.getFullYear() - bd.getFullYear();
  let months = now.getMonth() - bd.getMonth();
  let days = now.getDate() - bd.getDate();

  if (days < 0) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  if (years > 1) return `${years} years${months ? ' ' + months + ' months' : ''}`;
  if (years === 1) return `1 year${months ? ' ' + months + ' months' : ''}`;
  if (months > 0) return `${months} months`;
  return 'Less than 1 month';
}

// ===== Sheep Management =====

// Initialize index page: load sheep list and set up modal
function initIndex() {
  const modal = document.getElementById('sheepModal');
  const addBtn = document.getElementById('addSheepBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const form = document.getElementById('sheepForm');
  const closeBtn = document.querySelector('.modal-close');

  // continue initialization even if some index-only elements are missing

  // Open modal on button click (guarded in case the page omits the direct add button)
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      if (modal) {
        modal.style.display = 'block';
        if (form) form.reset();
      }
    });
  }

  // Close modal on cancel or X button
  const closeModal = () => {
    modal.style.display = 'none';
  };

  cancelBtn.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);

  // Close modal if clicking outside content
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Handle form submission
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    createNewSheep();
  });

  // Initial loading will occur after wiring tabs

  // Wire sortable headers
  const headers = document.querySelectorAll('#sheepTable th[data-sort]');
  headers.forEach(h => {
    h.style.cursor = 'pointer';
    h.addEventListener('click', () => {
      const field = h.getAttribute('data-sort');
      setSheepTableSort(field);
    });
  });

  // Initialize column resizers for adjustable column widths
  try { initTableColumnResizers(document.getElementById('sheepTable')); } catch (e) { /* ignore if table missing */ }
  // Initialize column reorder (drag to move columns)
  try { initColumnReorder(document.getElementById('sheepTable')); } catch (e) { /* ignore */ }

  // Wire tabs
  const tabButtons = document.querySelectorAll('#tabs .tab-button');
  tabButtons.forEach(tb => {
    const tabId = tb.getAttribute('data-tab');
    if (tabId === 'bulk-actions') {
      tb.addEventListener('click', () => showBulkActions(tb));
    } else {
      tb.addEventListener('click', () => setTab(tabId));
    }
  });

  // Activate the default tab and load list
  // Persist any inferred lambing events before rendering so data is stable
  try { persistInferredLambingsForAll(); } catch (e) { /* ignore migration errors */ }
  try { ensureMasterListIntegrity(); } catch (e) { /* ignore */ }
  setTab(_currentTab);
  // initialize bulk action handlers (select all, mark culled/sold)
  try { initBulkActionHandlers(); } catch (e) { /* ignore if not present */ }

  // Bulk-selection mode: show/hide checkboxes and primary bulk buttons
  try {
    // use global `_bulkMode` variable
    const bulkToggle = document.getElementById('bulkDropdownToggle');
    const bulkToolbar = document.getElementById('bulkToolbar');
    const selectAll = document.getElementById('selectAllCheckbox');

    // setBulkMode shows/hides selection UI depending on `on` (used when Actions panel opens/closes)
    const setBulkMode = (on) => {
      try {
        _bulkMode = !!on;
        if (_bulkMode) {
          if (selectAll) selectAll.style.display = '';
          try { const th = document.querySelector('#sheepTable thead th.col-select'); if (th) th.style.display = ''; } catch (e) { }
          document.querySelectorAll('#sheepTable tbody td.col-select').forEach(td => { try { td.style.display = ''; } catch (e) { } });
          try { sessionStorage.setItem('bulkModeActive', '1'); } catch (e) { }
        } else {
          try { if (selectAll) selectAll.style.display = 'none'; } catch (e) { }
          try { const th = document.querySelector('#sheepTable thead th.col-select'); if (th) th.style.display = 'none'; } catch (e) { }
          document.querySelectorAll('#sheepTable tbody td.col-select').forEach(td => { try { td.style.display = 'none'; const inp = td.querySelector('.row-checkbox'); if (inp) inp.checked = false; } catch (e) { } });
          try { sessionStorage.removeItem('bulkModeActive'); sessionStorage.removeItem('bulkSelected'); } catch (e) { }
        }
        try { updateBulkSelectedCount(); } catch (e) { }
        try { const tableEl = document.getElementById('sheepTable'); if (tableEl) refreshVisibleColumnWidths(tableEl); } catch (e) { }
      } catch (e) { /* swallow */ }
    };

    if (bulkToggle) {
      const bulkMenu = document.getElementById('bulkDropdownMenu');
      // Build the actions area as an inline row of tab-style buttons (no floating dropdown)
      const buildActionsDropdown = () => {
        if (!bulkMenu) return;
        // Prepare the container: clear children and ensure it's inline (not absolute)
        const inner = bulkMenu;
        inner.innerHTML = '';
        // keep hidden by default; show when user clicks Actions
        inner.style.display = 'none';
        inner.style.position = 'relative';
        inner.style.flexWrap = 'wrap';
        inner.style.gap = '6px';
        inner.style.marginTop = '8px';
        inner.style.alignItems = 'center';

        // Add a counts summary at the top of the actions menu (category -> count)
        try {
          const countsWrap = document.createElement('div');
          countsWrap.className = 'actions-counts';
          const categories = [
            { tab: 'active-ewes', label: 'Active Ewes' },
            { tab: 'active-rams', label: 'Active Rams' },
            { tab: 'current-lambs', label: 'Current Lambs' },
            { tab: 'culled', label: 'Culled' },
            { tab: 'to-be-culled', label: 'To Be Culled' },
            { tab: 'sold', label: 'Sold' },
            { tab: 'all', label: 'All' }
          ];
          const allSheep = getAllSheep() || [];
          categories.forEach(cat => {
            try {
              const cnt = allSheep.filter(s => matchesTab(s, cat.tab)).length;
              const item = document.createElement('button');
              item.type = 'button';
              item.className = 'counts-item dropdown-item';
              item.innerHTML = `<span>${cat.label}</span><span class="count-badge">${cnt}</span>`;
              item.addEventListener('click', (e) => {
                e.preventDefault();
                try { setTab(cat.tab); } catch (err) { }
                try { const bm = document.getElementById('bulkDropdownMenu'); if (bm) bm.style.display = 'none'; } catch (err) { }
                try { const shortcuts = document.getElementById('topActionShortcuts'); if (shortcuts) shortcuts.style.display = ''; } catch (err) { }
              });
              countsWrap.appendChild(item);
            } catch (e) { /* ignore per-category errors */ }
          });
          inner.appendChild(countsWrap);
        } catch (e) { /* ignore counts rendering errors */ }

        // Actions rendered as compact dropdown items beneath the counts
        const actions = [
          { id: 'ddAddSheep', label: 'Add New Sheep', mapped: 'addSheepBtn' },
          { id: 'ddLambing', label: 'Record Lambing', mapped: 'addLambingBtn' },
          { id: 'ddRecordBreeding', label: 'Record Breeding', mapped: 'recordBreedingBtn' },
          { id: 'ddMarkCulled', label: 'Mark Selected Culled', mapped: 'markCulledBtn' },
          { id: 'ddMarkToBeCulled', label: 'Mark Selected To Be Culled', mapped: 'markToBeCulledBtn' },
          { id: 'ddMarkSold', label: 'Mark Selected Sold', mapped: 'markSoldBtn' }
        ];

        // Separator between counts and actions
        const sep = document.createElement('div'); sep.style.height = '8px'; inner.appendChild(sep);

        actions.forEach(a => {
          const link = document.createElement('a');
          link.href = '#';
          link.className = 'dropdown-item';
          link.id = a.id;
          link.textContent = a.label;
          link.addEventListener('click', (ev) => {
            ev.preventDefault();
            try {
              if (a.id === 'ddAddSheep') {
                try { if (typeof setBulkMode === 'function') setBulkMode(true); } catch (e) { }
                const modalEl = document.getElementById('sheepModal'); if (modalEl) { modalEl.style.display = 'block'; const f = document.getElementById('sheepForm'); if (f) f.reset(); }
                return;
              }
              if (a.id === 'ddRecordBreeding') {
                try { if (typeof setBulkMode === 'function') setBulkMode(true); } catch (e) { }
                try { const ids = getSelectedIds(); openBreedingModal(ids, 'breeding'); } catch (e) { console.warn(e); }
                return;
              }
              if (a.id === 'ddLambing') {
                try { if (typeof setBulkMode === 'function') setBulkMode(true); } catch (e) { }
                try { const ids = getSelectedIds(); openLambingModal(ids); } catch (e) { console.warn(e); }
                return;
              }
              if (a.id === 'ddMarkCulled' || a.id === 'ddMarkToBeCulled' || a.id === 'ddMarkSold') {
                const statusMap = { ddMarkCulled: 'culled', ddMarkToBeCulled: 'to-be-culled', ddMarkSold: 'sold' };
                const status = statusMap[a.id] || 'culled';
                try { if (typeof setBulkMode === 'function') setBulkMode(true); } catch (e) { }
                try {
                  let ids = [];
                  try { ids = getSelectedIds(); } catch (e) { ids = Array.from(document.querySelectorAll('#sheepTable tbody .row-checkbox:checked')).map(c => c.dataset.id).filter(Boolean); }
                  if (!ids || !ids.length) return alert('No sheep selected');
                  if (!confirm(`Mark ${ids.length} selected sheep as ${status.replace('-', ' ').toUpperCase()}?`)) return;
                  let master = JSON.parse(localStorage.getItem('sheepList') || '[]');
                  if (status === 'sold') {
                    try {
                      // open modal-based sale UI for these ids
                      if (typeof openSaleModal === 'function') {
                        openSaleModal(ids);
                        return;
                      }
                    } catch (e) { console.warn('openSaleModal failed', e); }
                  }
                  // fallback for non-sold statuses or if modal not available: apply status directly
                  ids.forEach(id => {
                    try {
                      const raw = localStorage.getItem(`sheep-${id}`);
                      if (raw) {
                        const s = JSON.parse(raw);
                        try { applySheepStatus(s, status); } catch (e) { s.status = status; }
                        localStorage.setItem(`sheep-${id}`, JSON.stringify(s));
                        const idx = master.findIndex(x => x.id === id);
                        if (idx !== -1) master[idx] = s;
                      }
                    } catch (e) { console.warn(e); }
                  });
                  localStorage.setItem('sheepList', JSON.stringify(master));
                  loadSheepList();
                } catch (e) { console.warn(e); }
                return;
              }
            } catch (e) { console.warn(e); }
          });
          inner.appendChild(link);
        });
      };

      // Configuration: auto-restore hidden action tabs after this many seconds (0 = disabled)
      // Auto-restore hidden action tabs after this many seconds (0 = disabled)
      // Default changed to 0 so actions remain immediately available and
      // there's no 10s waiting period after performing an action.
      const bulkActionsAutoRestoreSeconds = (function () {
        try { const v = parseInt(localStorage.getItem('bulkAutoRestoreSeconds') || '', 10); return isNaN(v) ? 0 : v; } catch (e) { return 0; }
      })();

      // Snackbar / restore timer holders
      let _snackbarTimer = null;
      let _restoreTimer = null;

      // Helper: show a transient snackbar message. durationSeconds defaults to 3.
      function showSnackbar(message, durationSeconds) {
        try {
          durationSeconds = typeof durationSeconds === 'number' ? durationSeconds : 1.5;
          let container = document.getElementById('snackbarContainer');
          if (!container) {
            container = document.createElement('div');
            container.id = 'snackbarContainer';
            container.className = 'snackbar-container';
            document.body.appendChild(container);
          }
          container.innerHTML = '';
          const s = document.createElement('div');
          s.className = 'snackbar show';
          s.textContent = message;
          container.appendChild(s);
          if (_snackbarTimer) clearTimeout(_snackbarTimer);
          _snackbarTimer = setTimeout(() => {
            try { s.classList.remove('show'); s.classList.add('hide'); } catch (e) { }
            setTimeout(() => { try { if (container) container.remove(); } catch (e) { } }, 240);
          }, durationSeconds * 1000);
        } catch (e) { console.warn('snackbar failed', e); }
      }

      // Helper: enter single-action mode — record the active action but do not
      // change the overall actions layout. We keep a single actions panel only.
      function enterSingleActionMode(activeId) {
        try {
          const bulkMenuEl = document.getElementById('bulkDropdownMenu');
          if (!bulkMenuEl) return;
          // If the actions menu is not visible yet, remember the desired action
          // so it can be highlighted when the menu opens, but do not swap layouts.
          const isVisible = bulkMenuEl.style.display && bulkMenuEl.style.display !== 'none';
          if (!isVisible) {
            bulkMenuEl.dataset.pendingAction = activeId || '';
            return;
          }
          bulkMenuEl.dataset.active = activeId || '';
          // Visually mark the active button, but keep all buttons visible.
          Array.from(bulkMenuEl.querySelectorAll('.tab-button')).forEach(b => {
            b.classList.toggle('active', b.id === activeId);
            b.style.display = '';
          });
        } catch (e) { console.warn(e); }
      }

      function exitSingleActionMode() {
        try {
          const bulkMenuEl = document.getElementById('bulkDropdownMenu');
          if (!bulkMenuEl) return;
          bulkMenuEl.dataset.active = '';
          Array.from(bulkMenuEl.querySelectorAll('.tab-button')).forEach(b => {
            b.classList.remove('active');
            b.style.display = '';
          });
          try { if (_restoreTimer) { clearTimeout(_restoreTimer); _restoreTimer = null; } } catch (e) { }
        } catch (e) { console.warn(e); }
      }

      // Ensure dropdown is populated before first use
      buildActionsDropdown();



      bulkToggle.addEventListener('click', (e) => {
        // If the floating menu isn't present on this page, allow the button to navigate
        const bulkMenuNow = document.getElementById('bulkDropdownMenu');
        if (!bulkMenuNow) return; // allow default link behavior (navigation)
        e.stopPropagation();
        try {
          if (bulkMenuNow) {
            const isShown = bulkMenuNow.style.display && bulkMenuNow.style.display !== 'none';
            // when opening the Actions panel, do not force bulk-selection mode
            // (leave bulk-selection toggling to the user to avoid switching layouts)
            const shortcuts = document.getElementById('topActionShortcuts');
            // rebuild action-area each time so active state is correct
            try { buildActionsDropdown(); } catch (e) { }
            // Toggle visibility and hide top shortcuts while actions are visible
            if (isShown) {
              // currently shown -> hide it
              bulkMenuNow.style.display = 'none';
              try { setBulkMode(false); } catch (e) { }
              try {
                if (shortcuts && !bulkMenuNow.classList.contains('single-action-mode')) shortcuts.style.display = '';
              } catch (e) { }
              bulkToggle.setAttribute('aria-expanded', 'false');
            } else {
              // currently hidden -> show it
              bulkMenuNow.style.display = 'block';
              // enable bulk-selection so checkboxes appear when user opens Actions
              try { if (typeof setBulkMode === 'function') setBulkMode(true); } catch (e) { }
              if (shortcuts) shortcuts.style.display = 'none';
              bulkToggle.setAttribute('aria-expanded', 'true');
              // If a single-action mode was requested while the menu was hidden,
              // apply it now so the action tabs are shown/filtered appropriately.
              try {
                const pending = bulkMenuNow.dataset.pendingAction;
                if (pending) {
                  enterSingleActionMode(pending);
                  delete bulkMenuNow.dataset.pendingAction;
                }
              } catch (e) { }
            }
          }
        } catch (err) { /* ignore */ }
      });
      bulkToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bulkToggle.click(); }
      });
      // Close menu when clicking outside — but ignore clicks inside the menu, the toggle,
      // the sheep table or on row checkboxes so selecting rows doesn't close it.
      document.addEventListener('click', (e) => {
        try {
          if (!bulkMenu) return;
          const target = e.target;
          // If click is inside the menu or on the toggle, ignore
          if (bulkMenu.contains(target)) return;
          if (bulkToggle && bulkToggle.contains && bulkToggle.contains(target)) return;
          // If click is inside the sheep table (e.g., row checkbox), ignore so selections persist
          const table = document.getElementById('sheepTable');
          if (table && table.contains(target)) return;
          // Also allow checkbox-like controls inside other UI (breeding modal lists)
          if (target.closest && (target.closest('.row-checkbox') || target.closest('.breeding-target-checkbox'))) return;

          if (bulkMenu.style.display && bulkMenu.style.display !== 'none') {
            // hide menu and disable selection UI
            bulkMenu.style.display = 'none';
            try { setBulkMode(false); } catch (e) { }
            try { bulkToggle.setAttribute('aria-expanded', 'false'); } catch (e) { }
            // restore top shortcuts when menu closes (unless single-action mode active)
            try {
              const shortcuts = document.getElementById('topActionShortcuts');
              if (shortcuts && !bulkMenu.classList.contains('single-action-mode')) shortcuts.style.display = '';
            } catch (e) { }
          }
        } catch (err) { }
      });
    }

    // Actions are handled directly by the inline tab buttons created in buildActionsDropdown().
    // No separate wiring required here to avoid duplicate handlers.

    // Clear / Cancel control inside bulk toolbar
    try {
      const bulkClear = document.getElementById('bulkClearBtn');
      if (bulkClear) {
        bulkClear.addEventListener('click', (ev) => {
          ev.preventDefault();
          // clear selections
          document.querySelectorAll('#sheepTable tbody .row-checkbox').forEach(cb => { try { cb.checked = false; } catch (e) { } });
          const selectAllEl = document.getElementById('selectAllCheckbox'); if (selectAllEl) selectAllEl.checked = false;
          // exit bulk mode
          setBulkMode(false);
        });
      }
    } catch (e) { }

    // ensure initial state hides checkboxes by default
    setBulkMode(false);

    // If user navigated away while in bulk mode (Back button), restore bulk-mode + selections
    try {
      const wasBulk = sessionStorage.getItem('bulkModeActive') === '1';
      const prevSelected = JSON.parse(sessionStorage.getItem('bulkSelected') || '[]');
      if (wasBulk) {
        setBulkMode(true);
        // restore selections after list renders
        setTimeout(() => {
          if (Array.isArray(prevSelected) && prevSelected.length) {
            prevSelected.forEach(id => {
              try {
                const cb = document.querySelector(`#sheepTable tbody .row-checkbox[data-id="${id}"]`);
                if (cb) cb.checked = true;
              } catch (e) { }
            });
            try { updateBulkSelectedCount(); } catch (e) { }
          }
        }, 80);
      }
    } catch (e) { }

    // Keep select-all behavior wired (initBulkActionHandlers registered handler)
  } catch (e) { /* ignore if elements missing */ }


  // Wire CSV import controls (if present)
  const csvFileInput = document.getElementById('csvFile');
  const importBtn = document.getElementById('importCsvBtn');
  const overwriteChk = document.getElementById('csvOverwrite');
  const downloadBtn = document.getElementById('downloadTemplate');
  const downloadWithDataBtn = document.getElementById('downloadTemplateWithData');

  if (downloadBtn) downloadBtn.addEventListener('click', () => generateTemplateCsv(false));
  if (downloadWithDataBtn) downloadWithDataBtn.addEventListener('click', () => generateTemplateCsv(true));

  if (importBtn && csvFileInput) {
    importBtn.addEventListener('click', () => {
      const files = csvFileInput.files;
      if (!files || files.length === 0) return alert('Please choose a CSV file to import.');
      const file = files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        // show preview first, then confirm to apply
        importSheepCsvWithPreview(text, !!(overwriteChk && overwriteChk.checked));
      };
      reader.onerror = (e) => {
        console.error(e);
        alert('Failed to read file.');
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  // Wire top shortcut lambing button
  try {
    const addLambingTop = document.getElementById('addLambingBtn');
    if (addLambingTop) addLambingTop.addEventListener('click', (e) => { e.preventDefault(); try { setBulkMode(true); } catch (err) { } openLambingModal(); });
  } catch (e) { }

  // Wire bulk action row under import controls (if present)
  const bulkRowMarkCulled = document.getElementById('bulkRowMarkCulledBtn');
  const bulkRowMarkSold = document.getElementById('bulkRowMarkSoldBtn');
  const bulkRowAddSheep = document.getElementById('bulkRowAddSheepBtn');
  const bulkRowWriteReports = document.getElementById('bulkRowWriteReports');

  if (bulkRowMarkCulled) {
    bulkRowMarkCulled.addEventListener('click', () => {
      // reuse existing handler by delegating to the primary bulk button
      const primary = document.getElementById('markCulledBtn');
      if (primary) primary.click();
    });
  }
  if (bulkRowMarkSold) {
    bulkRowMarkSold.addEventListener('click', () => {
      const primary = document.getElementById('markSoldBtn');
      if (primary) primary.click();
    });
  }
  if (bulkRowAddSheep) {
    bulkRowAddSheep.addEventListener('click', () => {
      const primary = document.getElementById('addSheepBtn');
      if (primary) primary.click();
    });
  }
  if (bulkRowWriteReports) {
    bulkRowWriteReports.addEventListener('click', (e) => {
      // link already points to reports.html; ensure default behavior
    });
  }
}

// Generate a CSV template and trigger download. If includeData is true,
// include current animals from storage as data rows. Adds a `sex` column.
function generateTemplateCsv(includeData = false) {
  const headers = ['id', 'name', 'breed', 'sex', 'age', 'weight', 'birthDate', 'sire', 'dam', 'pedigree', 'notes', 'expectedDueDate', 'lambings'];
  const rows = [headers];

  if (includeData) {
    const sheep = getAllSheep();
    if (sheep && sheep.length) {
      sheep.forEach(s => {
        const row = [
          s.id || '',
          s.name || '',
          s.breed || '',
          s.sex || '',
          // prefer stored age text, otherwise compute from birthDate
          (s.age || (s.birthDate ? computeAge(s.birthDate) : '')),
          s.weight || '',
          s.birthDate || '',
          s.sire || '',
          s.dam || '',
          s.pedigree || '',
          s.notes || '',
          s.expectedDueDate || '',
          s.lambings ? JSON.stringify(s.lambings) : ''
        ];
        rows.push(row);
      });
    } else {
      // no animals: include one example row as a hint (includes sex)
      rows.push(['', 'Bella', 'Katahdin', 'Ewe', '3 years', '140', '2022-05-12', 'sire-tag', 'dam-tag', 'Grandparents: ...', 'Healthy', '2026-02-10']);
    }
  } else {
    const example = ['', 'Bella', 'Katahdin', 'Ewe', '3 years', '140', '2022-05-12', 'sire-tag', 'dam-tag', 'Grandparents: ...', 'Healthy', '2026-02-10', '[{"date":"2026-02-10","count":2}]'];
    rows.push(example);
  }

  const csv = rows.map(r => r.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = includeData ? 'sheep-import-template-with-data.csv' : 'sheep-import-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Parse CSV text into header array and row objects {header:value}
function parseCsvToObjects(csvText) {
  if (!csvText) return { headers: [], rows: [] };
  csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
  const lines = csvText.split('\n').filter(l => l.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };

  const parseRow = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = !inQuotes; }
        continue;
      }
      if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const headers = parseRow(lines[0]).map(h => h.trim());
  const rows = lines.slice(1).map(parseRow).map(cells => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = cells[i] !== undefined ? cells[i] : ''; });
    return obj;
  });
  return { headers, rows };
}

// Parse a lambings cell from CSV into an array of {date,count} objects when possible.
function parseLambingsCell(cell) {
  if (!cell && cell !== '') return undefined;
  if (Array.isArray(cell)) return cell;
  const str = String(cell || '').trim();
  if (!str) return undefined;
  // Try JSON first
  try {
    const parsed = JSON.parse(str);
    if (Array.isArray(parsed)) return parsed;
  } catch (e) { }
  // Accept semicolon-separated date:count items e.g. "2025-03-03:2;2024-01-01:1"
  const parts = str.split(';').map(p => p.trim()).filter(Boolean);
  const out = [];
  parts.forEach(p => {
    const pieces = p.split(':').map(x => x.trim());
    if (pieces.length === 2) {
      const date = pieces[0] || null;
      const count = parseInt(pieces[1], 10) || 0;
      out.push({ date, count });
    } else {
      // If only a date present, count unknown
      out.push({ date: p || null, count: null });
    }
  });
  return out.length ? out : undefined;
}

// Normalize sex/gender values from CSV or free text to internal canonical values
// Accepts: 'f','m','female','male','ewe','ram' (case-insensitive) and returns 'ewe' or 'ram' or ''
function normalizeSex(v) {
  try {
    if (v === undefined || v === null) return '';
    const s = String(v).trim().toLowerCase();
    if (!s) return '';
    if (s === 'f' || s === 'female' || s === 'ewe') return 'ewe';
    if (s === 'm' || s === 'male' || s === 'ram') return 'ram';
    // allow common capitalized forms (Ewe/Ram) too via lowercasing above
    return s; // fallback: return the lowercased token so other code can still match flexibly
  } catch (e) {
    return '';
  }
}

// Show a preview of parsed CSV rows, indicating New/Update, and wait for confirm
function importSheepCsvWithPreview(csvText, overwrite) {
  const parsed = parseCsvToObjects(csvText);
  if (!parsed.rows || parsed.rows.length === 0) return alert('No data rows found in CSV.');

  // Build preview data
  const master = JSON.parse(localStorage.getItem('sheepList') || '[]');
  const existingById = {};
  master.forEach(s => { if (s && s.id) existingById[s.id] = s; });

  const previewRows = parsed.rows.map((r, idx) => {
    const id = (r.id || '').trim();
    const existing = id && existingById[id] ? existingById[id] : null;
    const action = existing ? (overwrite ? 'Update' : 'Create (new id)') : 'New';
    return {
      src: r,
      action,
      id: id || `sheep-${Date.now()}-${idx}`,
      existing
    };
  });

  // Normalize sex values for preview so the user sees the canonical values
  previewRows.forEach(pr => {
    try { if (pr && pr.src) pr.src.sex = normalizeSex(pr.src.sex || pr.src.Sex || pr.src.SEX || ''); } catch (e) { }
  });

  showCsvPreview(previewRows, overwrite);
}

function showCsvPreview(previewRows, overwrite) {
  const modal = document.getElementById('csvPreviewModal');
  const tbody = document.querySelector('#csvPreviewTable tbody');
  const summary = document.getElementById('csvPreviewSummary');
  if (!modal || !tbody || !summary) {
    // Fallback when preview UI is not present: ask user to confirm applying import directly
    try {
      let newCount = 0, updateCount = 0;
      previewRows.forEach(pr => { const action = pr.action || ''; if (action === 'New') newCount++; else if ((action || '').indexOf('Update') === 0) updateCount++; });
      const msg = `Preview UI not found. Apply import directly?\nRows: ${previewRows.length}\nNew: ${newCount}\nUpdates: ${updateCount}\nOverwrite: ${overwrite ? 'ON' : 'OFF'}`;
      if (confirm(msg)) {
        applyImportRows(previewRows, overwrite);
      }
    } catch (e) { alert('Preview UI not found. Import cancelled.'); }
    return;
  }
  tbody.innerHTML = '';

  let newCount = 0, updateCount = 0;
  previewRows.forEach(pr => {
    const r = pr.src;
    const action = pr.action;
    if (action === 'New') newCount++; else if (action.indexOf('Update') === 0) updateCount++;
    const tr = document.createElement('tr');
    const lambCell = escapeHtml(r.lambings || '');
    tr.innerHTML = `<td>${action}</td><td>${escapeHtml(pr.id)}</td><td>${escapeHtml(r.name || '')}</td><td>${escapeHtml(r.breed || '')}</td><td>${escapeHtml(r.sex || '')}</td><td>${escapeHtml(r.birthDate || '')}</td><td>${escapeHtml(r.weight || '')}</td><td>${escapeHtml(r.notes || '')}</td><td>${lambCell}</td>`;
    tbody.appendChild(tr);
  });

  summary.innerHTML = `<strong>Rows:</strong> ${previewRows.length} — <strong>New:</strong> ${newCount}, <strong>Updates:</strong> ${updateCount}, <strong>Overwrite option:</strong> ${overwrite ? 'ON' : 'OFF'}`;

  // Wire confirm/cancel
  const confirmBtn = document.getElementById('csvConfirmBtn');
  const cancelBtn = document.getElementById('csvCancelPreviewBtn');
  const closeX = document.getElementById('csvPreviewClose');

  const onClose = () => { modal.style.display = 'none'; };
  const onConfirm = () => { modal.style.display = 'none'; applyImportRows(previewRows, overwrite); };

  cancelBtn.onclick = onClose;
  closeX.onclick = onClose;
  confirmBtn.onclick = onConfirm;

  // show modal
  modal.style.display = 'block';
}

function applyImportRows(previewRows, overwrite) {
  let master = JSON.parse(localStorage.getItem('sheepList') || '[]');
  const existingById = {};
  master.forEach(s => { if (s && s.id) existingById[s.id] = s; });

  let added = 0, updated = 0;
  previewRows.forEach((pr, idx) => {
    const r = pr.src;
    let id = (r.id || '').trim();
    // Helper to parse lambings field if present
    const parsedLambings = parseLambingsCell(r.lambings);

    if (id && existingById[id]) {
      if (overwrite) {
        const sheep = Object.assign({}, existingById[id], {
          id: id,
          name: r.name || existingById[id].name || '',
          breed: r.breed || existingById[id].breed || '',
          sex: normalizeSex(r.sex || r.Sex || '') || existingById[id].sex || '',
          status: r.status || existingById[id].status || '',
          age: r.age || existingById[id].age || '',
          weight: r.weight || existingById[id].weight || '',
          birthDate: r.birthDate || existingById[id].birthDate || '',
          sire: r.sire || existingById[id].sire || '',
          dam: r.dam || existingById[id].dam || '',
          pedigree: r.pedigree || existingById[id].pedigree || '',
          notes: r.notes || existingById[id].notes || '',
          expectedDueDate: r.expectedDueDate || existingById[id].expectedDueDate || ''
        });
        if (parsedLambings) sheep.lambings = parsedLambings;
        localStorage.setItem(`sheep-${id}`, JSON.stringify(sheep));
        const idxm = master.findIndex(s => s.id === id);
        if (idxm !== -1) master[idxm] = sheep;
        updated++;
      } else {
        // create a new id instead
        const newId = `sheep-${Date.now()}-${idx}`;
        const sheep = {
          id: sheepId,
          name: r.name || '',
          breed: r.breed || '',
          sex: normalizeSex(r.sex || r.Sex || '') || (r.sex || ''),
          status: r.status || '',
          age: r.age || '',
          weight: r.weight || '',
          birthDate: r.birthDate || '',
          sire: r.sire || '',
          dam: r.dam || '',
          pedigree: r.pedigree || '',
          notes: r.notes || '',
          expectedDueDate: r.expectedDueDate || ''
        };
        if (parsedLambings) sheep.lambings = parsedLambings;
        localStorage.setItem(`sheep-${newId}`, JSON.stringify(sheep));
        master.push(sheep);
        added++;
      }
    } else {
      // new entry
      const newId = id || `sheep-${Date.now()}-${idx}`;
      const sheep = {
        id: newId,
        name: r.name || '',
        breed: r.breed || '',
        sex: normalizeSex(r.sex || r.Sex || '') || (r.sex || ''),
        status: r.status || '',
        age: r.age || '',
        weight: r.weight || '',
        birthDate: r.birthDate || '',
        sire: r.sire || '',
        dam: r.dam || '',
        pedigree: r.pedigree || '',
        notes: r.notes || '',
        expectedDueDate: r.expectedDueDate || ''
      };
      if (parsedLambings) sheep.lambings = parsedLambings;
      localStorage.setItem(`sheep-${sheep.id}`, JSON.stringify(sheep));
      master.push(sheep);
      added++;
    }
  });

  localStorage.setItem('sheepList', JSON.stringify(master));
  loadSheepList();
  alert(`Import applied — added: ${added}, updated: ${updated}`);
}

// Import sheep from CSV text. If overwrite=true, matching `id` values will be replaced.
function importSheepCsv(csvText, overwrite) {
  if (!csvText || !csvText.trim()) return alert('CSV is empty.');
  // Normalize line endings and remove BOM
  csvText = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
  const lines = csvText.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 1) return alert('CSV has no rows.');

  // Parse header
  const parseRow = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = !inQuotes; }
        continue;
      }
      if (ch === ',' && !inQuotes) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const headers = parseRow(lines[0]).map(h => h.trim());
  const rows = lines.slice(1).map(parseRow).map(cells => {
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = cells[i] !== undefined ? cells[i] : ''; });
    return obj;
  });

  if (!rows.length) return alert('No data rows found in CSV.');

  // Load existing master list
  let master = JSON.parse(localStorage.getItem('sheepList') || '[]');
  const existingById = {};
  master.forEach(s => { if (s && s.id) existingById[s.id] = s; });

  let added = 0, updated = 0, skipped = 0;
  rows.forEach((r, idx) => {
    // Map CSV columns to sheep object fields; allow CSV to omit id
    let id = (r.id || '').trim();
    if (id && id.indexOf('sheep-') !== 0) {
      // allow plain numeric or names; but we'll use as-is if provided
      id = id;
    }
    const sheep = {
      id: id || `sheep-${Date.now()}-${idx}`,
      name: r.name || '',
      breed: r.breed || '',
      sex: normalizeSex(r.sex || r.Sex || '') || (r.sex || ''),
      status: r.status || '',
      age: r.age || '',
      weight: r.weight || '',
      birthDate: r.birthDate || '',
      sire: r.sire || '',
      dam: r.dam || '',
      pedigree: r.pedigree || '',
      notes: r.notes || '',
      expectedDueDate: r.expectedDueDate || ''
    };

    if (r.id && existingById[r.id]) {
      if (overwrite) {
        // overwrite existing
        localStorage.setItem(`sheep-${r.id}`, JSON.stringify(Object.assign({}, existingById[r.id], sheep)));
        // update master list
        const idxm = master.findIndex(s => s.id === r.id);
        if (idxm !== -1) master[idxm] = Object.assign({}, master[idxm], sheep);
        updated++;
      } else {
        // don't overwrite: create new ID
        const newId = `sheep-${Date.now()}-${idx}`;
        sheep.id = newId;
        localStorage.setItem(`sheep-${sheep.id}`, JSON.stringify(sheep));
        master.push(sheep);
        added++;
      }
    } else {
      // no matching id provided or not existing
      localStorage.setItem(`sheep-${sheep.id}`, JSON.stringify(sheep));
      master.push(sheep);
      added++;
    }
  });

  // Save master list and refresh
  localStorage.setItem('sheepList', JSON.stringify(master));
  loadSheepList();
  alert(`Import complete — added: ${added}, updated: ${updated}, skipped: ${skipped}`);
}

// ---- Lambing modal helpers ----
function openLambingModal(targetIds) {
  const modal = document.getElementById('lambingModal');
  if (!modal) return alert('Lambing UI not available on this page.');

  // populate mother (ewes) and sire (rams)
  const motherSel = document.getElementById('lambingMother');
  const sireSel = document.getElementById('lambingSire');
  if (motherSel) motherSel.innerHTML = '';
  if (sireSel) sireSel.innerHTML = '';
  const all = getAllSheep();
  // mothers: ewes, active (include lambs? allow selection of ewes regardless)
  const ewes = all.filter(s => (s.sex || '').toString().toLowerCase() === 'ewe');
  const rams = all.filter(s => (s.sex || '').toString().toLowerCase() === 'ram');
  const momNone = document.createElement('option'); momNone.value = ''; momNone.textContent = '-- Select mother --'; if (motherSel) motherSel.appendChild(momNone);
  ewes.forEach(e => { try { const opt = document.createElement('option'); opt.value = e.id || (e.name || ''); opt.textContent = `${e.name || e.id || opt.value}`; motherSel.appendChild(opt); } catch (err) { } });
  const sireNone = document.createElement('option'); sireNone.value = ''; sireNone.textContent = '-- Unknown / No sire --'; if (sireSel) sireSel.appendChild(sireNone);
  rams.forEach(r => { try { const opt = document.createElement('option'); opt.value = r.id || (r.name || ''); opt.textContent = `${r.name || r.id || opt.value}`; sireSel.appendChild(opt); } catch (err) { } });

  // If a single targetId provided and it is an ewe, preselect mother
  try {
    const ids = Array.isArray(targetIds) && targetIds.length ? targetIds.slice() : [];
    if (ids.length === 1) {
      const raw = localStorage.getItem(`sheep-${ids[0]}`);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && (s.sex || '').toString().toLowerCase() === 'ewe') {
          try { motherSel.value = s.id; } catch (e) { }
        }
      }
    }
  } catch (e) { }

  // If a mother is preselected, try to preselect an inferred sire (last breeding sire or stored sire)
  try {
    const tryPreselectSireFor = (motherId) => {
      if (!motherId) return;
      try {
        const rawM = localStorage.getItem(`sheep-${motherId}`);
        if (!rawM) return;
        const m = JSON.parse(rawM);
        const inferred = (m && (m._lastBreedingSire || m.sire)) ? (m._lastBreedingSire || m.sire) : '';
        if (inferred && sireSel) {
          // Only set if an option with that value exists (avoid creating new option)
          const opt = Array.from(sireSel.options).find(o => (o.value || '') === inferred || (o.text || '') === inferred);
          if (opt) {
            try {
              // remove any previous inferred labels, then set this one
              Array.from(sireSel.options).forEach(o => {
                if (o.dataset && o.dataset.inferred === 'true') {
                  o.dataset.inferred = '';
                  if ((o.textContent || '').endsWith(' (inferred)')) o.textContent = o.textContent.replace(/ \(inferred\)$/, '');
                }
              });
              sireSel.value = opt.value;
              // annotate the option to indicate it was inferred (so UI shows helpful label)
              if (opt && opt.dataset && opt.dataset.inferred !== 'true') {
                opt.dataset.inferred = 'true';
                if (!(opt.textContent || '').endsWith(' (inferred)')) opt.textContent = (opt.textContent || '') + ' (inferred)';
              }
            } catch (e) { }
          }
        }
      } catch (e) { }
    };
    try { if (motherSel && motherSel.value) tryPreselectSireFor(motherSel.value); } catch (e) { }
    // Also auto-fill sire when the user changes mother selection (only if sire not manually chosen)
    try {
      if (motherSel && sireSel) {
        // When mother changes, try to preselect inferred sire (unless user already chose one)
        motherSel.addEventListener('change', () => {
          try {
            if (sireSel.value && sireSel.value !== '') return;
            const mid = motherSel.value;
            tryPreselectSireFor(mid);
          } catch (e) { }
        });

        // When user manually changes sire selection, remove any '(inferred)' labels to reflect explicit choice
        sireSel.addEventListener('change', () => {
          try {
            Array.from(sireSel.options).forEach(o => {
              if (o.dataset && o.dataset.inferred === 'true') {
                // if the selected option is still the inferred value, keep the label; otherwise remove it
                if (sireSel.value !== o.value) {
                  o.dataset.inferred = '';
                  if ((o.textContent || '').endsWith(' (inferred)')) o.textContent = o.textContent.replace(/ \(inferred\)$/, '');
                }
              }
            });
          } catch (e) { }
        });
      }
    } catch (e) { }
  } catch (e) { }

  // default date to today
  try { const dt = document.getElementById('lambingDate'); if (dt) dt.value = formatDateISO(new Date()); } catch (e) { }
  // default count to 1
  try { const c = document.getElementById('lambingCount'); if (c) { c.value = '1'; const other = document.getElementById('lambingCountOther'); if (other) other.style.display = 'none'; } } catch (e) { }

  // wire close/cancel
  modal.style.display = 'block';
  const closeX = document.getElementById('lambingClose'); const cancelBtn = document.getElementById('lambingCancel');
  const onClose = () => { try { modal.style.display = 'none'; } catch (e) { } };
  if (closeX) closeX.onclick = onClose;
  if (cancelBtn) cancelBtn.onclick = onClose;

  // show/hide other count input when 'other' selected
  try {
    const countSel = document.getElementById('lambingCount');
    const otherInp = document.getElementById('lambingCountOther');
    if (countSel) {
      countSel.addEventListener('change', () => {
        try {
          if (countSel.value === 'other') { if (otherInp) otherInp.style.display = ''; }
          else { if (otherInp) { otherInp.style.display = 'none'; otherInp.value = ''; } }
          // render lamb tag inputs for the selected count
          try {
            const container = document.getElementById('lambChildrenContainer');
            const computeCount = () => {
              if (countSel.value === 'other') {
                const v = parseInt(otherInp && otherInp.value, 10) || 0; return v >= 4 ? v : 4;
              }
              return parseInt(countSel.value, 10) || 1;
            };
            const n = computeCount();
            renderLambInputs(n);
          } catch (e) { }
        } catch (e) { }
      });
    }
  } catch (e) { }

  // Render initial lamb inputs for default count
  try {
    const initCountSel = document.getElementById('lambingCount');
    const otherInpInit = document.getElementById('lambingCountOther');
    let initN = 1;
    if (initCountSel) {
      if (initCountSel.value === 'other') initN = parseInt(otherInpInit && otherInpInit.value, 10) || 4;
      else initN = parseInt(initCountSel.value, 10) || 1;
    }
    renderLambInputs(initN);
  } catch (e) { }

  // wire confirm button (avoid duplicate handlers)
  const confirmBtn = document.getElementById('lambingConfirmBtn');
  if (!confirmBtn) return;
  const handler = () => {
    try { applyLambing(); } finally { confirmBtn.removeEventListener('click', handler); }
  };
  confirmBtn.removeEventListener('click', handler);
  confirmBtn.addEventListener('click', handler);
}

function applyLambing() {
  try {
    const motherSel = document.getElementById('lambingMother');
    const sireSel = document.getElementById('lambingSire');
    const dateEl = document.getElementById('lambingDate');
    const countSel = document.getElementById('lambingCount');
    const otherInp = document.getElementById('lambingCountOther');
    if (!motherSel || !motherSel.value) return alert('Please select a mother (ewe) for this lambing.');
    const motherId = motherSel.value;
    const date = dateEl && dateEl.value ? dateEl.value : null;
    if (!date) return alert('Please choose a birth date.');
    let count = 1;
    try {
      if (countSel && countSel.value === 'other') {
        const v = parseInt(otherInp && otherInp.value, 10) || 0;
        if (!v || v < 4) return alert('Please enter a valid number of lambs (4 or more) for Other.');
        count = v;
      } else {
        count = parseInt(countSel && countSel.value, 10) || 1;
      }
    } catch (e) { count = 1; }

    if (!confirm(`Record ${count} lamb(s) for mother ${motherId} on ${date}?`)) return;

    let master = JSON.parse(localStorage.getItem('sheepList') || '[]');
    const raw = localStorage.getItem(`sheep-${motherId}`);
    if (!raw) return alert('Selected mother not found in storage.');
    const mother = JSON.parse(raw);
    // choose sire for this lambing: prefer explicit selection, otherwise use mother's last breeding sire or stored sire
    const sireId = (sireSel && sireSel.value) ? sireSel.value : ((mother && (mother._lastBreedingSire || mother.sire)) ? (mother._lastBreedingSire || mother.sire) : '');

    // collect lamb tags/names from inputs
    const children = [];
    try {
      const container = document.getElementById('lambChildrenContainer');
      if (container) {
        const inputs = Array.from(container.querySelectorAll('input.lamb-tag-input'));
        if (inputs.length !== count) return alert('Please enter tag/name for each lamb.');
        for (let i = 0; i < inputs.length; i++) {
          const v = (inputs[i].value || '').toString().trim();
          if (!v) return alert(`Please provide a tag/name for lamb #${i + 1}.`);
          // ensure id uniqueness
          if (localStorage.getItem(`sheep-${v}`)) return alert(`A sheep with tag/id "${v}" already exists. Choose a different tag.`);
          children.push(v);
        }
      }
    } catch (e) { /* ignore collection errors */ }

    // create child records
    const createdIds = [];
    try {
      for (let i = 0; i < children.length; i++) {
        const tag = children[i];
        // read optional sex and weight for this lamb
        let sex = '';
        let weight = '';
        try {
          const container = document.getElementById('lambChildrenContainer');
          if (container) {
            const row = container.querySelector(`[data-lamb-index="${i}"]`);
            if (row) {
              const sexEl = row.querySelector('select.lamb-sex-input');
              const weightEl = row.querySelector('input.lamb-weight-input');
              if (sexEl) sex = sexEl.value || '';
              if (weightEl) weight = weightEl.value || '';
            }
          }
        } catch (e) { }

        // Normalize sex to consistent capitalization
        try {
          const sNorm = (sex || '').toString().trim().toLowerCase();
          if (sNorm === 'ewe') sex = 'Ewe';
          else if (sNorm === 'ram') sex = 'Ram';
          else sex = '';
        } catch (e) { sex = '' }
        const child = {
          id: tag,
          name: tag,
          breed: '',
          sex: sex || '',
          status: 'active',
          age: '',
          weight: (weight !== undefined && weight !== null && weight !== '') ? String(weight) : '',
          birthDate: date,
          sire: sireId || '',
          dam: motherId,
          notes: `Born ${date}`
        };
        localStorage.setItem(`sheep-${tag}`, JSON.stringify(child));
        master.push(child);
        createdIds.push(tag);
      }
    } catch (e) { console.warn('failed creating child records', e); }

    // record lambing on mother (include children ids)
    if (!mother.lambings) mother.lambings = [];
    mother.lambings.push({ date: date, count: count, sire: sireId || null, children: createdIds });
    localStorage.setItem(`sheep-${motherId}`, JSON.stringify(mother));
    const idx = master.findIndex(s => s.id === motherId);
    if (idx !== -1) master[idx] = mother;
    localStorage.setItem('sheepList', JSON.stringify(master));
    loadSheepList();
    // close modal
    try { const modal = document.getElementById('lambingModal'); if (modal) modal.style.display = 'none'; } catch (e) { }
    try {
      if (createdIds && createdIds.length) {
        showSnackbarWithLinks(`Recorded ${count} lamb(s) for ${mother.name || mother.id || motherId}. Created ${createdIds.length} lamb record(s).`, createdIds);
      } else {
        showSnackbar(`Recorded ${count} lamb(s) for ${mother.name || mother.id || motherId}.`);
      }
    } catch (e) { showSnackbar(`Recorded ${count} lamb(s).`); }
  } catch (e) { console.warn(e); alert('Failed to record lambing; see console.'); }
}

// Render lamb inputs into #lambChildrenContainer: tag, sex, weight
function renderLambInputs(n) {
  try {
    const container = document.getElementById('lambChildrenContainer');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.alignItems = 'center';
      row.style.marginBottom = '6px';
      row.setAttribute('data-lamb-index', String(i));

      const label = document.createElement('div');
      label.style.minWidth = '70px';
      label.textContent = `Lamb #${i + 1}`;

      const tagInput = document.createElement('input');
      tagInput.type = 'text';
      tagInput.className = 'lamb-tag-input';
      tagInput.placeholder = 'Tag / Name (unique)';
      tagInput.style.flex = '1';

      const sexSel = document.createElement('select');
      sexSel.className = 'lamb-sex-input';
      sexSel.innerHTML = '<option value="">Unknown</option><option value="Ewe">Ewe</option><option value="Ram">Ram</option>';
      sexSel.style.width = '110px';

      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.className = 'lamb-weight-input';
      weightInput.placeholder = 'Weight lbs';
      weightInput.style.width = '110px';

      row.appendChild(label);
      row.appendChild(tagInput);
      row.appendChild(sexSel);
      row.appendChild(weightInput);

      container.appendChild(row);
    }
  } catch (e) { console.warn('renderLambInputs failed', e); }
}

// Show snackbar with links to newly created lamb detail pages
function showSnackbarWithLinks(text, ids) {
  try {
    let container = document.getElementById('snackbarContainer');
    if (!container) {
      container = document.createElement('div'); container.id = 'snackbarContainer'; container.className = 'snackbar-container'; document.body.appendChild(container);
    }
    container.innerHTML = '';
    const s = document.createElement('div'); s.className = 'snackbar show';
    const span = document.createElement('span'); span.textContent = text + ' ';
    s.appendChild(span);
    const _tabParam = (typeof _currentTab !== 'undefined' && _currentTab) ? `&tab=${encodeURIComponent(_currentTab)}` : '';
    ids.forEach((id, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'snackbar-link';
      btn.textContent = id;
      btn.style.color = '#fff';
      btn.style.marginLeft = '8px';
      btn.style.textDecoration = 'underline';
      btn.addEventListener('click', () => { try { window.open(buildDetailLink(id), '_blank'); } catch (e) { window.open('sheep-detail.html?id=' + encodeURIComponent(id), '_blank'); } });
      s.appendChild(btn);
    });
    container.appendChild(s);
    if (_snackbarTimer) clearTimeout(_snackbarTimer);
    _snackbarTimer = setTimeout(() => { try { s.classList.remove('show'); s.classList.add('hide'); } catch (e) { } setTimeout(() => { try { if (container) container.remove(); } catch (e) { } }, 240); }, 1500);
  } catch (e) { console.warn(e); }
}

// Create a new sheep from form data
function createNewSheep() {
  // Guard against being called on pages without the create form
  const nameEl = document.getElementById('sheepName');
  const breedEl = document.getElementById('sheepBreed');
  const ageEl = document.getElementById('sheepAge');
  const weightEl = document.getElementById('sheepWeight');
  const sexEl = document.getElementById('sheepSex');
  const statusEl = document.getElementById('sheepStatus');
  const birthEl = document.getElementById('sheepBirthDate');
  const notesEl = document.getElementById('sheepNotes');
  if (!nameEl) return alert('Add Sheep form not available on this page.');
  const name = nameEl.value || '';
  const breed = breedEl ? (breedEl.value || '') : '';
  const age = ageEl ? (ageEl.value || '') : '';
  const weight = weightEl ? (weightEl.value || '') : '';
  const sex = (sexEl && sexEl.value) ? sexEl.value : 'Unknown';
  const status = (statusEl && statusEl.value) ? statusEl.value : 'active';
  const birthDate = birthEl ? (birthEl.value || '') : '';
  const notes = notesEl ? (notesEl.value || '') : '';

  // Create unique sheep ID
  const sheepId = 'sheep-' + Date.now();

  // Create sheep object
  const sheep = {
    id: sheepId,
    name,
    breed,
    sex,
    status: status,
    age,
    weight,
    birthDate,
    notes
  };

  // Save to localStorage
  let sheepList = JSON.parse(localStorage.getItem('sheepList') || '[]');
  sheepList.push(sheep);
  localStorage.setItem('sheepList', JSON.stringify(sheepList));

  // Also save individual sheep data
  localStorage.setItem(`sheep-${sheepId}`, JSON.stringify(sheep));

  // Close modal and reload list
  const sheepModal = document.getElementById('sheepModal');
  if (sheepModal) sheepModal.style.display = 'none';
  loadSheepList();

  alert(`${name} added successfully!`);
}

// Load and display the list of sheep into the dashboard table
function loadSheepList() {
  const table = document.getElementById('sheepTable');
  const noMsg = document.getElementById('noSheepMessage');
  if (!table) return;

  // Apply header visibility based on saved dashboard column settings
  try {
    const cols = getDashboardColumns(_currentTab);
    const map = [
      ['.col-breed', cols.breed],
      ['.col-sire', cols.sire],
      ['.col-dam', cols.dam],
      ['.col-notes', cols.notes],
      ['.col-sire-sire', cols.sireSire],
      ['.col-age', cols.age],
      ['.col-weight', cols.weight],
      ['.col-sex', cols.sex],
      ['.col-past-lambing', cols.pastLambing],
      ['.col-past-bred', cols.bredDate],
      ['.col-days-until', cols.daysUntil],
      ['.col-days-post', cols.daysPost],
      ['.col-expectedDueDate', cols.expectedDueDate],
      ['.col-actions', cols.actions]
    ];
    map.forEach(([sel, show]) => {
      try {
        const el = table.querySelector('th' + sel);
        if (el) el.style.display = show ? '' : 'none';
      } catch (e) { }
    });
    // ensure select column header visibility matches bulk mode
    try {
      const selTh = table.querySelector('th.col-select');
      if (selTh) selTh.style.display = _bulkMode ? '' : 'none';
    } catch (e) { }
    // Adjust column widths to fit visible columns after toggling headers
    try { refreshVisibleColumnWidths(table); } catch (e) { }
  } catch (e) { }

  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  const selectAll = document.getElementById('selectAllCheckbox');
  if (selectAll) {
    selectAll.checked = false;
    // show select-all only when bulk mode active
    selectAll.style.display = _bulkMode ? '' : 'none';
  }

  let sheepList = JSON.parse(localStorage.getItem('sheepList') || '[]');

  // If master list is empty but individual sheep records exist, rebuild now.
  try {
    if ((!sheepList || sheepList.length === 0)) {
      const scanned = getAllSheep();
      if (scanned && scanned.length) {
        localStorage.setItem('sheepList', JSON.stringify(scanned));
        sheepList = scanned;
      }
    }
  } catch (e) { /* ignore */ }

  // Filter by current tab selection
  const visibleList = sheepList.filter(s => matchesTab(s, _currentTab));

  // If the current view is a ram-only view (explicit tab) or all visible rows are rams,
  // hide lambing/breeding-related header cells so headers don't appear above ram rows.
  try {
    const thPastLamb = table.querySelector('th.col-past-lambing');
    const thPastBred = table.querySelector('th.col-past-bred');
    const thDaysUntil = table.querySelector('th.col-days-until');
    const thDaysPost = table.querySelector('th.col-days-post');
    const thDue = table.querySelector('th.col-expectedDueDate');
    const isRamTab = (_currentTab === 'active-rams' || _currentTab === 'rams' || _currentTab === 'ram');
    const allRams = Array.isArray(visibleList) && visibleList.length && visibleList.every(s => (s.sex || '').toString().toLowerCase() === 'ram');
    const hideBreedingHeaders = isRamTab || allRams;
    if (thPastLamb) thPastLamb.style.display = hideBreedingHeaders ? 'none' : (thPastLamb.style.display || '');
    if (thPastBred) thPastBred.style.display = hideBreedingHeaders ? 'none' : (thPastBred.style.display || '');
    if (thDaysUntil) thDaysUntil.style.display = hideBreedingHeaders ? 'none' : (thDaysUntil.style.display || '');
    if (thDaysPost) thDaysPost.style.display = hideBreedingHeaders ? 'none' : (thDaysPost.style.display || '');
    if (thDue) thDue.style.display = hideBreedingHeaders ? 'none' : (thDue.style.display || '');
  } catch (e) { }

  if (!sheepList || sheepList.length === 0) {
    table.style.display = 'none';
    if (noMsg) {
      noMsg.textContent = 'No animals yet. Add one using "Add New Sheep".';
      noMsg.style.display = '';
    }
    updateTabCounts();
    return;
  }

  if (!visibleList || visibleList.length === 0) {
    table.style.display = 'none';
    if (noMsg) {
      noMsg.textContent = 'No animals match this category.';
      noMsg.style.display = '';
    }
    updateTabCounts();
    return;
  }

  // sort according to _sheepTableSort
  try {
    if (_sheepTableSort && _sheepTableSort.field) {
      visibleList.sort((a, b) => compareSheep(a, b, _sheepTableSort.field));
    }
  } catch (e) { console.warn(e); }

  table.style.display = '';
  if (noMsg) noMsg.style.display = 'none';

  visibleList.forEach(sheep => {
    const tr = document.createElement('tr');

    const ageText = sheep.birthDate ? computeAge(sheep.birthDate) : (sheep.age || 'N/A');
    const weightText = sheep.weight ? (sheep.weight + ' lbs') : 'N/A';
    const sexText = sheep.sex || 'Unknown';

    // Build cells: checkbox, name(link), breed, age, weight, sex, actions
    const cbTd = document.createElement('td');
    cbTd.className = 'col-select';
    cbTd.setAttribute('data-col', 'select');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'row-checkbox';
    cb.dataset.id = sheep.id;
    // show/hide the td cell depending on bulk mode (checkbox column)
    cbTd.style.display = _bulkMode ? '' : 'none';
    // update selected-count badge when checkboxes change
    cb.addEventListener('change', () => { try { updateBulkSelectedCount(); } catch (e) { } });
    cbTd.appendChild(cb);

    const nameTd = document.createElement('td');
    nameTd.setAttribute('data-col', 'name');
    try {
      const nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'detail-link';
      nameBtn.textContent = sheep.name || '';
      nameBtn.dataset.id = sheep.id;
      nameBtn.addEventListener('click', () => { try { window.location.href = buildDetailLink(sheep.id); } catch (e) { window.location.href = 'sheep-detail.html?id=' + encodeURIComponent(sheep.id); } });
      nameTd.appendChild(nameBtn);
    } catch (e) { nameTd.innerHTML = `<a href="${buildDetailLink(sheep.id)}">${escapeHtml(sheep.name || '')}</a>`; }
    const sireTd = document.createElement('td');
    sireTd.className = 'col-sire';
    sireTd.setAttribute('data-col', 'sire');
    try {
      const sireVal = sheep.sire || '';
      const sireResolved = sireVal ? findSheepByNameOrId(sireVal) : null;
      if (sireResolved) {
        const name = escapeHtml(sireResolved.name || sireResolved.id || '');
        try {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'detail-link'; b.textContent = name; b.dataset.id = sireResolved.id; b.addEventListener('click', () => { try { window.location.href = buildDetailLink(sireResolved.id); } catch (e) { window.location.href = 'sheep-detail.html?id=' + encodeURIComponent(sireResolved.id); } }); sireTd.appendChild(b);
        } catch (e) { sireTd.innerHTML = `<a href="${buildDetailLink(sireResolved.id)}">${name}</a>`; }
      } else {
        const disp = (sireVal && sireVal.toString().indexOf('sheep-') === 0) ? sireVal.toString().replace(/^sheep-/, '') : (sireVal || '');
        sireTd.textContent = disp;
      }
    } catch (e) { sireTd.textContent = ''; }
    const damTd = document.createElement('td');
    damTd.className = 'col-dam';
    damTd.setAttribute('data-col', 'dam');
    try {
      const damVal = sheep.dam || '';
      const damResolved = damVal ? findSheepByNameOrId(damVal) : null;
      if (damResolved) {
        const name = escapeHtml(damResolved.name || damResolved.id || '');
        try {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'detail-link'; b.textContent = name; b.dataset.id = damResolved.id; b.addEventListener('click', () => { try { window.location.href = buildDetailLink(damResolved.id); } catch (e) { window.location.href = 'sheep-detail.html?id=' + encodeURIComponent(damResolved.id); } }); damTd.appendChild(b);
        } catch (e) { damTd.innerHTML = `<a href="${buildDetailLink(damResolved.id)}">${name}</a>`; }
      } else {
        const disp = (damVal && damVal.toString().indexOf('sheep-') === 0) ? damVal.toString().replace(/^sheep-/, '') : (damVal || '');
        damTd.textContent = disp;
      }
    } catch (e) { damTd.textContent = ''; }
    const sireSireTd = document.createElement('td');
    sireSireTd.className = 'col-sire-sire';
    sireSireTd.setAttribute('data-col', 'sireSire');
    try {
      const sireVal2 = sheep.sire || '';
      const sireResolved2 = sireVal2 ? findSheepByNameOrId(sireVal2) : null;
      if (sireResolved2) {
        const gVal = sireResolved2.sire || '';
        if (gVal) {
          const gResolved = findSheepByNameOrId(gVal);
          if (gResolved) {
            const name = escapeHtml(gResolved.name || gResolved.id || '');
            try {
              const b = document.createElement('button'); b.type = 'button'; b.className = 'detail-link'; b.textContent = name; b.dataset.id = gResolved.id; b.addEventListener('click', () => { try { window.location.href = buildDetailLink(gResolved.id); } catch (e) { window.location.href = 'sheep-detail.html?id=' + encodeURIComponent(gResolved.id); } }); sireSireTd.appendChild(b);
            } catch (e) { sireSireTd.innerHTML = `<a href="${buildDetailLink(gResolved.id)}">${name}</a>`; }
          } else {
            const disp = (gVal && gVal.toString().indexOf('sheep-') === 0) ? gVal.toString().replace(/^sheep-/, '') : gVal;
            sireSireTd.textContent = disp || '';
          }
        } else sireSireTd.textContent = '';
      } else sireSireTd.textContent = '';
    } catch (e) { sireSireTd.textContent = ''; }
    // Visual badge for "to be culled" status
    const statusNorm = (sheep.status || '').toString().toLowerCase();
    const isToBeCulled = statusNorm === 'to-be-culled' || statusNorm === 'to be culled' || statusNorm === 'tobe-culled' || statusNorm === 'to_be_culled';
    if (isToBeCulled) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-to-be-culled';
      badge.textContent = 'To be culled';
      badge.tabIndex = 0;
      badge.style.cursor = 'pointer';
      // Prevent row click navigation when interacting with the badge
      badge.addEventListener('click', (ev) => { ev.stopPropagation(); openQuickActions(sheep.id, badge); });
      badge.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); openQuickActions(sheep.id, badge); } });
      nameTd.appendChild(badge);
      tr.classList.add('to-be-culled-row');
    }

    // Badge for ewes that have a recorded bredDate / expectedDueDate
    try {
      const isEwe = (sheep.sex || '').toString().toLowerCase() === 'ewe';
      const hasBred = !!(sheep.bredDate || sheep.expectedDueDate);
      if (isEwe && hasBred) {
        const bredBadge = document.createElement('span');
        bredBadge.className = 'badge badge-bred';
        bredBadge.textContent = 'Bred';
        bredBadge.title = `Bred on ${sheep.bredDate ? formatDateLong(sheep.bredDate) : ''}`;
        bredBadge.tabIndex = 0;
        bredBadge.style.cursor = 'pointer';
        bredBadge.addEventListener('click', (ev) => { ev.stopPropagation(); openQuickActions(sheep.id, bredBadge); });
        bredBadge.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); openQuickActions(sheep.id, bredBadge); } });
        nameTd.appendChild(bredBadge);
        // Nursing badge: show if the sheep lambed within the last 90 days
        try {
          const summary = getSheepLambingSummary(sheep);
          if (summary && summary.lastDate) {
            const last = new Date(summary.lastDate);
            if (!isNaN(last)) {
              const diffDays = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
              const windowDays = (typeof getNursingWindowDays === 'function') ? getNursingWindowDays() : 90;
              if (diffDays >= 0 && diffDays <= windowDays) {
                const nursingBadge = document.createElement('span');
                nursingBadge.className = 'badge badge-nursing';
                nursingBadge.textContent = 'Nursing';
                nursingBadge.title = `Lambed on ${formatDateLong(summary.lastDate)} (${diffDays} days ago)`;
                nursingBadge.tabIndex = 0;
                nursingBadge.style.cursor = 'pointer';
                nursingBadge.addEventListener('click', (ev) => { ev.stopPropagation(); openQuickActions(sheep.id, nursingBadge); });
                nursingBadge.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); openQuickActions(sheep.id, nursingBadge); } });
                nameTd.appendChild(nursingBadge);
              }
            }
          }
        } catch (e) { /* ignore nursing badge failures */ }
      }
    } catch (e) { }

    const breedTd = document.createElement('td'); breedTd.className = 'col-breed'; breedTd.textContent = sheep.breed || '';
    breedTd.setAttribute('data-col', 'breed');
    const ageTd = document.createElement('td'); ageTd.className = 'col-age'; ageTd.textContent = ageText;
    ageTd.setAttribute('data-col', 'age');
    const weightTd = document.createElement('td'); weightTd.className = 'col-weight'; weightTd.textContent = weightText;
    weightTd.setAttribute('data-col', 'weight');
    const sexTd = document.createElement('td'); sexTd.className = 'col-sex'; sexTd.textContent = sexText;
    sexTd.setAttribute('data-col', 'sex');
    // Breeding/lambing derived columns
    const cols = getDashboardColumns(_currentTab);
    const summary = getSheepLambingSummary(sheep);

    // Single combined Past Lambing column: show classification (Single / Twin / Triplet / Other)
    const pastLambingTd = document.createElement('td'); pastLambingTd.className = 'col-past-lambing';
    pastLambingTd.setAttribute('data-col', 'pastLambing');
    try {
      let cls = '';
      if ((summary.triplets || 0) > 0) cls = 'Triplet';
      else if ((summary.twins || 0) > 0) cls = 'Twin';
      else if ((summary.single || 0) > 0) cls = 'Single';
      else cls = 'Other';
      pastLambingTd.textContent = cls;
    } catch (e) { pastLambingTd.textContent = ''; }
    const pastBredTd = document.createElement('td'); pastBredTd.className = 'col-past-bred'; pastBredTd.textContent = sheep.bredDate ? formatDateLong(sheep.bredDate) : '';
    pastBredTd.setAttribute('data-col', 'bredDate');

    // Days until lambing: based on expectedDueDate
    const daysUntilTd = document.createElement('td'); daysUntilTd.className = 'col-days-until';
    daysUntilTd.setAttribute('data-col', 'daysUntil');
    try {
      // determine expected due date from multiple possible fields or infer from bredDate
      const gather = (s) => {
        const out = [];
        const pushVal = (v) => {
          if (v === undefined || v === null) return;
          if (Array.isArray(v)) v.forEach(x => x && out.push(x));
          else if (typeof v === 'string') {
            if (v.indexOf(',') !== -1 || v.indexOf(';') !== -1) v.split(/[,;]+/).map(x => x.trim()).forEach(x => x && out.push(x));
            else out.push(v);
          } else out.push(v);
        };
        pushVal(s.expectedDueDate); pushVal(s.expectedDueDates); pushVal(s.nextDue); pushVal(s.dueDate); pushVal(s.dueDates); pushVal(s.due); pushVal(s.expected);
        return out;
      };
      let due = null;
      try {
        const cands = gather(sheep);
        if (cands && cands.length) {
          for (let i = 0; i < cands.length; i++) {
            const d = new Date(cands[i]);
            if (!isNaN(d)) { due = d; break; }
          }
        }
        if (!due && sheep.bredDate) {
          const bd = new Date(sheep.bredDate);
          const gd = getGestationDays();
          if (!isNaN(bd) && gd) due = new Date(bd.getTime() + (gd * 24 * 60 * 60 * 1000));
        }
      } catch (e) { due = null; }
      if (due) {
        try { const diff = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24)); daysUntilTd.textContent = String(diff >= 0 ? diff : 0); } catch (e) { daysUntilTd.textContent = ''; }
      } else daysUntilTd.textContent = '';
    } catch (e) { daysUntilTd.textContent = ''; }

    // Days post-lambing: days since last lambing date (if known)
    const daysPostTd = document.createElement('td'); daysPostTd.className = 'col-days-post';
    daysPostTd.setAttribute('data-col', 'daysPost');
    try {
      if (summary.lastDate) {
        const ld = new Date(summary.lastDate);
        if (!isNaN(ld)) {
          const diff = Math.floor((Date.now() - ld.getTime()) / (1000 * 60 * 60 * 24));
          daysPostTd.textContent = String(diff >= 0 ? diff : 0);
        } else daysPostTd.textContent = '';
      } else daysPostTd.textContent = '';
    } catch (e) { daysPostTd.textContent = ''; }

    // Show expected due date for active ewes (if present)
    const dueTd = document.createElement('td'); dueTd.className = 'col-expectedDueDate';
    dueTd.setAttribute('data-col', 'expectedDueDate');
    try {
      const isEwe = (sheep.sex || '').toString().toLowerCase() === 'ewe';
      const active = isActiveStatus(sheep.status);
      // resolve expected due date similar to days-until above
      let dueDate = null;
      try {
        const gather2 = (s) => {
          const out = [];
          const pushVal = (v) => { if (v === undefined || v === null) return; if (Array.isArray(v)) v.forEach(x => x && out.push(x)); else if (typeof v === 'string') { if (v.indexOf(',') !== -1 || v.indexOf(';') !== -1) v.split(/[,;]+/).map(x => x.trim()).forEach(x => x && out.push(x)); else out.push(v); } else out.push(v); };
          pushVal(s.expectedDueDate); pushVal(s.expectedDueDates); pushVal(s.nextDue); pushVal(s.dueDate); pushVal(s.dueDates); pushVal(s.due); pushVal(s.expected);
          return out;
        };
        const cands = gather2(sheep);
        if (cands && cands.length) {
          for (let i = 0; i < cands.length; i++) { const d = new Date(cands[i]); if (!isNaN(d)) { dueDate = d; break; } }
        }
        if (!dueDate && sheep.bredDate) { const bd = new Date(sheep.bredDate); const gd = getGestationDays(); if (!isNaN(bd) && gd) dueDate = new Date(bd.getTime() + (gd * 24 * 60 * 60 * 1000)); }
      } catch (e) { dueDate = null; }
      dueTd.textContent = (isEwe && active && dueDate) ? formatDateLong(dueDate) : '';
    } catch (e) { dueTd.textContent = ''; }

    const actionTd = document.createElement('td'); actionTd.className = 'col-actions actions-cell';
    actionTd.setAttribute('data-col', 'actions');
    const delBtn = document.createElement('button');
    delBtn.className = 'button button-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteSheep(sheep.id); });
    actionTd.appendChild(delBtn);

    // Notes column (optional)
    const notesTd = document.createElement('td'); notesTd.className = 'col-notes';
    notesTd.setAttribute('data-col', 'notes');
    try {
      const noteRaw = sheep.notes || localStorage.getItem(`notes_${sheep.id}`) || '';
      const preview = (noteRaw || '').toString();
      const disp = preview.length > 120 ? preview.slice(0, 120) + '…' : preview;
      notesTd.textContent = disp;
      if (preview && preview.length > 0) notesTd.title = preview;
    } catch (e) { notesTd.textContent = ''; }

    // Row click navigation (but ignore clicks on actions or checkboxes)
    tr.style.cursor = 'pointer';
    tr.tabIndex = 0;
    tr.addEventListener('click', (e) => {
      // Ignore clicks on action buttons, inputs, anchors or buttons inside the row
      if (e.target.closest('.actions-cell') || e.target.closest('input') || e.target.closest('button') || e.target.closest('a')) return;
      // If bulk mode active, persist selections so Back returns to bulk mode
      if (_bulkMode) {
        try { updateBulkSelectedCount(); } catch (err) { }
      }
      window.location.href = buildDetailLink(sheep.id);
    });
    tr.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        // If focus is on an interactive element inside the row, let that element handle the key
        try {
          const active = document.activeElement;
          if (active && (active.tagName === 'BUTTON' || active.tagName === 'A' || active.tagName === 'INPUT' || active.closest && active.closest('.actions-cell'))) return;
        } catch (err) { }
        e.preventDefault();
        window.location.href = buildDetailLink(sheep.id);
      }
    });

    tr.appendChild(cbTd);
    tr.appendChild(nameTd);
    tr.appendChild(sireTd);
    tr.appendChild(damTd);
    tr.appendChild(sireSireTd);
    tr.appendChild(breedTd);
    tr.appendChild(notesTd);
    tr.appendChild(ageTd);
    tr.appendChild(weightTd);
    tr.appendChild(sexTd);
    // optional breeding columns (visibility governed by settings)
    tr.appendChild(pastLambingTd);
    tr.appendChild(pastBredTd);
    tr.appendChild(daysUntilTd);
    tr.appendChild(daysPostTd);
    tr.appendChild(dueTd);
    tr.appendChild(actionTd);

    // hide/show columns based on settings
    try {
      if (!cols.breed) breedTd.style.display = 'none';
      if (!cols.sire) sireTd.style.display = 'none';
      if (!cols.dam) damTd.style.display = 'none';
      if (!cols.notes) notesTd.style.display = 'none';
      if (!cols.sireSire) sireSireTd.style.display = 'none';
      if (!cols.age) ageTd.style.display = 'none';
      if (!cols.weight) weightTd.style.display = 'none';
      if (!cols.sex) sexTd.style.display = 'none';

      // If this row represents a ram, hide all lambing/breeding related cells
      const isRam = ((sheep.sex || '').toString().toLowerCase() === 'ram');
      if (isRam) {
        try { pastLambingTd.style.display = 'none'; } catch (e) { }
        try { pastBredTd.style.display = 'none'; } catch (e) { }
        try { daysUntilTd.style.display = 'none'; } catch (e) { }
        try { daysPostTd.style.display = 'none'; } catch (e) { }
        try { dueTd.style.display = 'none'; } catch (e) { }
      } else {
        if (!cols.pastLambing) pastLambingTd.style.display = 'none';
        if (!cols.bredDate) pastBredTd.style.display = 'none';
        if (!cols.daysUntil) daysUntilTd.style.display = 'none';
        if (!cols.daysPost) daysPostTd.style.display = 'none';
        if (!cols.expectedDueDate) dueTd.style.display = 'none';
      }

      if (!cols.actions) actionTd.style.display = 'none';
    } catch (e) { }

    tbody.appendChild(tr);
  });

  try { applyColumnOrder(document.getElementById('sheepTable'), getSavedColumnOrder(_currentTab) || []); } catch (e) { }
  updateTabCounts();
  try { updateBulkSelectedCount(); } catch (e) { }
}

// Column order persistence and drag-to-reorder
function getSavedColumnOrder(tabId) {
  try {
    const raw = localStorage.getItem('dashboardColumns');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed) return null;
    // legacy single map (booleans) -> no order
    const key = tabId || 'global';
    const tabMap = (parsed && parsed[key]) ? parsed[key] : (parsed && parsed.global ? parsed.global : null);
    if (tabMap && Array.isArray(tabMap.order)) return tabMap.order.slice();
    return null;
  } catch (e) { return null; }
}

function saveColumnOrder(order, tabId) {
  try {
    const raw = localStorage.getItem('dashboardColumns');
    let parsed = {};
    if (raw) {
      try { parsed = JSON.parse(raw) || {}; } catch (e) { parsed = {}; }
    }
    const key = tabId || 'global';
    parsed[key] = parsed[key] || {};
    parsed[key].order = order || [];
    localStorage.setItem('dashboardColumns', JSON.stringify(parsed));
  } catch (e) { console.warn('saveColumnOrder failed', e); }
}

function applyColumnOrder(table, order) {
  try {
    if (!table || !order || !order.length) return;
    const thead = table.querySelector('thead');
    if (!thead) return;
    const headRow = thead.querySelector('tr');
    if (!headRow) return;
    // build map of current th by key
    const ths = Array.from(headRow.children);
    const keyFor = (th) => {
      if (!th) return '';
      const ds = th.getAttribute('data-sort');
      if (ds) return ds;
      // class like col-sire -> sire
      for (let c of th.classList) {
        if (c.indexOf('col-') === 0) return c.replace(/^col-/, '');
      }
      return (th.textContent || '').trim().toLowerCase().replace(/\s+/g, '-');
    };
    const thMap = {};
    ths.forEach(t => { thMap[keyFor(t)] = t; });
    // Build new header order nodes in sequence of `order`, falling back to existing ones
    const newThs = [];
    order.forEach(k => { if (thMap[k]) { newThs.push(thMap[k]); delete thMap[k]; } });
    // append any remaining ths not in the saved order
    Object.keys(thMap).forEach(k => { newThs.push(thMap[k]); });
    // apply order by re-appending in desired sequence
    newThs.forEach(t => headRow.appendChild(t));

    // Now reorder each tbody row's tds to match header keys
    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    rows.forEach(r => {
      try {
        const cells = Array.from(r.children);
        const findCellByKey = (key) => {
          for (let c of cells) {
            try {
              if (c.getAttribute && c.getAttribute('data-col') === key) return c;
              if (c.classList && Array.from(c.classList).some(cl => cl === ('col-' + key))) return c;
            } catch (e) { }
          }
          return null;
        };
        const newCells = [];
        order.forEach(k => {
          const found = findCellByKey(k);
          if (found) {
            newCells.push(found);
            const idx = cells.indexOf(found);
            if (idx !== -1) cells.splice(idx, 1);
          }
        });
        // append any remaining cells in their current sequence
        cells.forEach(c => newCells.push(c));
        newCells.forEach(c => r.appendChild(c));
      } catch (e) { }
    });
  } catch (e) { console.warn('applyColumnOrder failed', e); }
}

function initColumnReorder(table) {
  if (!table) return;
  const thead = table.querySelector('thead');
  if (!thead) return;
  const headRow = thead.querySelector('tr');
  if (!headRow) return;
  const getKey = (th) => th.getAttribute('data-sort') || Array.from(th.classList).find(c => c.indexOf('col-') === 0)?.replace(/^col-/, '') || (th.textContent || '').trim().toLowerCase().replace(/\s+/g, '-');

  let dragSrcKey = null;

  Array.from(headRow.children).forEach(th => {
    // only allow dragging of visible headers (skip hidden)
    th.draggable = true;
    th.addEventListener('dragstart', (ev) => {
      try {
        if (th.style.display === 'none') { ev.preventDefault(); return; }
        dragSrcKey = getKey(th);
        ev.dataTransfer.setData('text/plain', dragSrcKey);
        ev.dataTransfer.effectAllowed = 'move';
        th.classList.add('dragging');
      } catch (e) { }
    });
    th.addEventListener('dragend', (ev) => { try { th.classList.remove('dragging'); } catch (e) { } });
    th.addEventListener('dragover', (ev) => { try { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; th.classList.add('drag-over'); } catch (e) { } });
    th.addEventListener('dragleave', (ev) => { try { th.classList.remove('drag-over'); } catch (e) { } });
    th.addEventListener('drop', (ev) => {
      try {
        ev.preventDefault(); th.classList.remove('drag-over');
        const srcKey = ev.dataTransfer.getData('text/plain') || dragSrcKey;
        const destKey = getKey(th);
        if (!srcKey || !destKey || srcKey === destKey) return;
        // compute current header order keys
        const keys = Array.from(headRow.children).map(h => getKey(h));
        const srcIdx = keys.indexOf(srcKey);
        const destIdx = keys.indexOf(destKey);
        if (srcIdx === -1 || destIdx === -1) return;
        // move src to dest position (insert before dest)
        const movingTh = headRow.children[srcIdx];
        const beforeNode = (destIdx > srcIdx) ? headRow.children[destIdx].nextSibling : headRow.children[destIdx];
        headRow.insertBefore(movingTh, beforeNode);
        // reorder body cells accordingly
        const tbody = table.querySelector('tbody');
        if (tbody) {
          Array.from(tbody.querySelectorAll('tr')).forEach(row => {
            const cells = Array.from(row.children);
            const movingCell = cells[srcIdx];
            const beforeCell = (destIdx > srcIdx) ? cells[destIdx] ? cells[destIdx].nextSibling : null : cells[destIdx];
            if (movingCell) row.insertBefore(movingCell, beforeCell);
          });
        }
        // save new order
        const newKeys = Array.from(headRow.children).map(h => getKey(h));
        saveColumnOrder(newKeys, _currentTab);
      } catch (e) { console.warn('drop failed', e); }
    });
  });

  // Do not apply saved order here; apply after rows are rendered in loadSheepList()
}

// Make table columns resizable by adding a small draggable handle to each header
// Initialize bulk action handlers and update tab counts
function initBulkActionHandlers() {
  const selectAll = document.getElementById('selectAllCheckbox');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      const checked = !!selectAll.checked;
      document.querySelectorAll('#sheepTable tbody .row-checkbox').forEach(cb => { try { cb.checked = checked; } catch (e) { } });
      try { updateBulkSelectedCount(); } catch (e) { }
    });
  }

  const markCulled = document.getElementById('markCulledBtn');
  if (markCulled) {
    markCulled.addEventListener('click', () => {
      const checked = Array.from(document.querySelectorAll('#sheepTable tbody .row-checkbox:checked')).map(c => c.dataset.id);
      if (!checked.length) return alert('No sheep selected');
      if (!confirm(`Mark ${checked.length} selected sheep as culled?`)) return;
      let master = JSON.parse(localStorage.getItem('sheepList') || '[]');
      checked.forEach(id => {
        try {
          const raw = localStorage.getItem(`sheep-${id}`);
          if (raw) {
            const s = JSON.parse(raw);
            applySheepStatus(s, 'culled');
            localStorage.setItem(`sheep-${id}`, JSON.stringify(s));
            const idx = master.findIndex(x => x.id === id);
            if (idx !== -1) master[idx] = s;
          }
        } catch (e) { console.warn(e); }
      });
      localStorage.setItem('sheepList', JSON.stringify(master));
      loadSheepList();
    });
  }

  const markToBeCulled = document.getElementById('markToBeCulledBtn');
  if (markToBeCulled) {
    markToBeCulled.addEventListener('click', () => {
      const checked = Array.from(document.querySelectorAll('#sheepTable tbody .row-checkbox:checked')).map(c => c.dataset.id);
      if (!checked.length) return alert('No sheep selected');
      if (!confirm(`Mark ${checked.length} selected sheep as TO BE CULLED?`)) return;
      let master = JSON.parse(localStorage.getItem('sheepList') || '[]');
      checked.forEach(id => {
        try {
          const raw = localStorage.getItem(`sheep-${id}`);
          if (raw) {
            const s = JSON.parse(raw);
            applySheepStatus(s, 'to-be-culled');
            localStorage.setItem(`sheep-${id}`, JSON.stringify(s));
            const idx = master.findIndex(x => x.id === id);
            if (idx !== -1) master[idx] = s;
          }
        } catch (e) { console.warn(e); }
      });
      localStorage.setItem('sheepList', JSON.stringify(master));
      loadSheepList();
    });
  }

  const markSold = document.getElementById('markSoldBtn');
  if (markSold) {
    markSold.addEventListener('click', () => {
      const checked = Array.from(document.querySelectorAll('#sheepTable tbody .row-checkbox:checked')).map(c => c.dataset.id);
      if (!checked.length) return alert('No sheep selected');
      if (!confirm(`Mark ${checked.length} selected sheep as sold?`)) return;
      // open modal-based sale UI (preferred) which will handle status + finance entries
      try {
        if (typeof openSaleModal === 'function') {
          openSaleModal(checked);
          return;
        }
      } catch (e) { console.warn('openSaleModal failed', e); }
      // fallback: perform a simple sold status apply
      let master = JSON.parse(localStorage.getItem('sheepList') || '[]');
      checked.forEach(id => {
        try {
          const raw = localStorage.getItem(`sheep-${id}`);
          if (raw) {
            const s = JSON.parse(raw);
            try { applySheepStatus(s, 'sold'); } catch (e) { s.status = 'sold'; }
            localStorage.setItem(`sheep-${id}`, JSON.stringify(s));
            const idx = master.findIndex(x => x.id === id);
            if (idx !== -1) master[idx] = s; else master.push(s);
          }
        } catch (e) { console.warn(e); }
      });
      localStorage.setItem('sheepList', JSON.stringify(master));
      loadSheepList();
    });
  }
}

function updateTabCounts() {
  const master = JSON.parse(localStorage.getItem('sheepList') || '[]');
  const tabs = document.querySelectorAll('#tabs .tab-button');
  tabs.forEach(tb => {
    const tabId = tb.getAttribute('data-tab');
    if (tabId === 'bulk-actions') {
      // keep bulk tab label as-is (no count)
      tb.textContent = tb.getAttribute('data-label') || 'Bulk Actions';
      return;
    }
    const label = tb.getAttribute('data-label') || tb.textContent.replace(/\s*\(\d+\)$/, '');
    const count = master.filter(s => matchesTab(s, tabId)).length;
    tb.textContent = `${label} (${count})`;
  });
}

// Update the bulk selection count badge
function updateBulkSelectedCount() {
  const badge = document.getElementById('bulkSelectedCount');
  if (!badge) return;
  const checkedEls = Array.from(document.querySelectorAll('#sheepTable tbody .row-checkbox:checked'));
  const checked = checkedEls.length;
  if (!_bulkMode || checked === 0) {
    badge.style.display = 'none';
    badge.textContent = '';
    try { sessionStorage.removeItem('bulkSelected'); } catch (e) { }
    return;
  }
  const ids = checkedEls.map(cb => cb.dataset.id).filter(Boolean);
  badge.textContent = `${checked} selected`;
  badge.style.display = '';
  try { sessionStorage.setItem('bulkSelected', JSON.stringify(ids)); } catch (e) { }
}

// --- Breeding helpers -------------------------------------------------
function getGestationDays() {
  const raw = localStorage.getItem('gestationDays');
  const v = parseInt(raw, 10);
  return (isNaN(v) || v <= 0) ? 147 : v;
}

// Nursing window in days: configurable via Settings (localStorage key 'nursingWindowDays')
function getNursingWindowDays() {
  try {
    const raw = localStorage.getItem('nursingWindowDays');
    const v = parseInt(raw, 10);
    return (isNaN(v) || v < 0) ? 90 : v;
  } catch (e) { return 90; }
}

// Theme handling: apply CSS variable overrides for saved theme
function applyTheme(themeName) {
  try {
    const themes = {
      default: {
        '--color-primary': '#2f855a',
        '--color-primary-600': '#276749',
        '--color-accent': '#0b66c3',
        '--color-danger': '#f44336',
        '--color-danger-700': '#c62828',
        '--color-success': '#e8f5e9',
        '--color-success-border': '#a5d6a7',
        '--color-warning': '#fff8e1',
        '--color-warning-border': '#ffd966'
      },
      blue: {
        '--color-primary': '#0b66c3',
        '--color-primary-600': '#074a8a',
        '--color-accent': '#2f855a',
        '--color-danger': '#e53935',
        '--color-danger-700': '#b71c1c',
        '--color-success': '#e8f5e9',
        '--color-success-border': '#a5d6a7',
        '--color-warning': '#fff8e1',
        '--color-warning-border': '#ffd966'
      },
      dark: {
        '--color-primary': '#1f6f3b',
        '--color-primary-600': '#124726',
        '--color-accent': '#1e90ff',
        '--color-danger': '#d9534f',
        '--color-danger-700': '#b52b2b',
        '--color-success': '#153b23',
        '--color-success-border': '#1f6f3b',
        '--color-warning': '#4a3f00',
        '--color-warning-border': '#7a5f00'
      }
    };
    const t = themes[themeName] || themes.default;
    Object.keys(t).forEach(k => document.documentElement.style.setProperty(k, t[k]));
    try { localStorage.setItem('siteTheme', themeName); } catch (e) { }
  } catch (e) { console.warn('applyTheme failed', e); }
}

// Appearance presets (hex palettes) and helpers
function getAppearancePreset(name) {
  const presets = {
    default: {
      pageBg: '#ffffff',
      buttonBg: '#2f855a',
      buttonText: '#ffffff',
      buttonBgHover: '#276749',
      buttonCancelBg: '#f44336',
      buttonCancelBgHover: '#c62828',
      tableBorder: '#000000',
      tableZebra: true,
      zoom: 1
    },
    blue: {
      pageBg: '#ffffff',
      buttonBg: '#0b66c3',
      buttonText: '#ffffff',
      buttonBgHover: '#074a8a',
      buttonCancelBg: '#e53935',
      buttonCancelBgHover: '#b71c1c',
      tableBorder: '#000000',
      tableZebra: true,
      zoom: 1
    },
    dark: {
      pageBg: '#121212',
      buttonBg: '#1f6f3b',
      buttonText: '#ffffff',
      buttonBgHover: '#124726',
      buttonCancelBg: '#d9534f',
      buttonCancelBgHover: '#b52b2b',
      tableBorder: '#000000',
      tableZebra: false,
      zoom: 1
    }
  };
  return presets[name] || presets.default;
}

// Apply a named preset; if save=true also persist to localStorage
function applyPreset(name, save) {
  try {
    const preset = getAppearancePreset(name);
    applyAppearance(preset);
    if (save) {
      try { localStorage.setItem('appearanceSettings', JSON.stringify(preset)); } catch (e) { }
    }
    try { window._lastAppliedPreset = name; } catch (e) { }
  } catch (e) { console.warn('applyPreset failed', e); }
}

try { window.getAppearancePreset = getAppearancePreset; } catch (e) { }
try { window.applyPreset = applyPreset; } catch (e) { }

function applySavedTheme() {
  try {
    const s = localStorage.getItem('siteTheme') || 'default';
    applyTheme(s);
  } catch (e) { }
}

// Apply saved theme on page load
try { window.addEventListener('DOMContentLoaded', applySavedTheme); } catch (e) { }

// Appearance overrides: apply custom appearance settings saved under 'appearanceSettings'
function applyAppearance(settings) {
  try {
    let s = settings;
    if (!s) {
      try { s = JSON.parse(localStorage.getItem('appearanceSettings') || '{}'); } catch (e) { s = {}; }
    }
    if (!s || typeof s !== 'object') s = {};
    if (s.pageBg) document.documentElement.style.setProperty('--page-bg', s.pageBg);
    if (s.buttonBg) document.documentElement.style.setProperty('--button-bg', s.buttonBg);
    if (s.buttonText) document.documentElement.style.setProperty('--button-text', s.buttonText);
    if (s.buttonBgHover) document.documentElement.style.setProperty('--button-bg-hover', s.buttonBgHover);
    if (s.buttonCancelBg) document.documentElement.style.setProperty('--button-cancel-bg', s.buttonCancelBg);
    if (s.buttonCancelBgHover) document.documentElement.style.setProperty('--button-cancel-bg-hover', s.buttonCancelBgHover);
    // zoom: expect numeric like 1 or 1.1; coerce to string
    if (s.zoom) {
      try { document.documentElement.style.zoom = String(s.zoom); } catch (e) { }
    }
    // table border color
    if (s.tableBorder) document.documentElement.style.setProperty('--table-border', s.tableBorder);
    // zebra rows toggle: set or remove a global class so CSS can target zebra-only
    try {
      if (typeof s.tableZebra !== 'undefined') {
        if (s.tableZebra) document.documentElement.classList.add('global-table-zebra');
        else document.documentElement.classList.remove('global-table-zebra');
      }
    } catch (e) { }
    // persist if a settings object was explicitly passed
    try { if (settings) localStorage.setItem('appearanceSettings', JSON.stringify(s)); } catch (e) { }
    // expose last applied for debugging
    window._appliedAppearance = s;
  } catch (e) { console.warn('applyAppearance failed', e); }
}

function applySavedAppearance() {
  try {
    const raw = localStorage.getItem('appearanceSettings');
    if (!raw) return;
    const s = JSON.parse(raw);
    applyAppearance(s);
  } catch (e) { /* ignore */ }
}

try { window.addEventListener('DOMContentLoaded', applySavedAppearance); } catch (e) { }
try { window.applyAppearance = applyAppearance; } catch (e) { }

// Number of pedigree generations to show in auto-pedigree (default 3)
function getPedigreeGenerations() {
  try {
    const raw = localStorage.getItem('pedigreeGenerations');
    const v = parseInt(raw, 10);
    return (isNaN(v) || v < 1) ? 3 : v;
  } catch (e) { return 3; }
}

// Read dashboard column visibility settings from localStorage.
// Returns an object of boolean flags for each optional column.
// Read dashboard column visibility settings from localStorage.
// Supports per-tab settings: stored as an object mapping tabId -> columnMap.
// Legacy format (single map) is still supported and treated as the default/global map.
function getDashboardColumns(tabId) {
  const defaults = {
    id: true,
    breed: true,
    sire: true,
    dam: true,
    sireSire: true,
    notes: false,
    age: true,
    weight: true,
    sex: true,
    pastLambing: true,
    bredDate: true,
    daysUntil: true,
    daysPost: true,
    expectedDueDate: true,
    actions: false
  };
  try {
    const raw = localStorage.getItem('dashboardColumns');
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    // If parsed is a plain map of booleans (legacy), migrate/merge it into defaults
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length && Object.keys(parsed).every(k => typeof parsed[k] === 'boolean')) {
      return Object.assign({}, defaults, parsed || {});
    }
    // Expect parsed to be an object mapping tabId->map
    const key = tabId || 'global';
    const tabMap = (parsed && parsed[key]) ? parsed[key] : (parsed && parsed.global ? parsed.global : null);
    return Object.assign({}, defaults, tabMap || {});
  } catch (e) {
    return defaults;
  }
}

// Save dashboard columns for a specific tab (tabId). If tabId omitted, save to 'global'.
function saveDashboardColumns(map, tabId) {
  try {
    const raw = localStorage.getItem('dashboardColumns');
    let parsed = {};
    if (raw) {
      try { parsed = JSON.parse(raw) || {}; } catch (e) { parsed = {}; }
    }
    // If parsed looks like a legacy single map (booleans), migrate it into parsed.global
    const isLegacy = parsed && Object.keys(parsed).length && Object.keys(parsed).every(k => typeof parsed[k] === 'boolean');
    if (isLegacy) {
      parsed = { global: parsed };
    }
    const key = tabId || 'global';
    parsed[key] = map || {};
    localStorage.setItem('dashboardColumns', JSON.stringify(parsed));
  } catch (e) { console.warn(e); }
}

// Actions page column visibility helpers (separate from dashboardColumns so
// changes on the Actions page don't overwrite dashboard preferences).
// Actions page column visibility helpers — store under `dashboardColumns.actions`
// so dashboard and actions settings share a single storage key but remain
// namespaced. Also migrate any legacy `actionsColumns` key into the new
// schema.
function _migrateActionsColumnsIfNeeded() {
  try {
    const rawActions = localStorage.getItem('actionsColumns');
    if (!rawActions) return;
    // Move actionsColumns into dashboardColumns.actions and remove the legacy key
    try {
      const actionsParsed = JSON.parse(rawActions) || {};
      const rawDash = localStorage.getItem('dashboardColumns');
      let dashParsed = rawDash ? JSON.parse(rawDash) : {};
      if (dashParsed && Object.keys(dashParsed).length && Object.keys(dashParsed).every(k => typeof dashParsed[k] === 'boolean')) dashParsed = { global: dashParsed };
      dashParsed = dashParsed || {};
      dashParsed.actions = actionsParsed;
      localStorage.setItem('dashboardColumns', JSON.stringify(dashParsed));
      localStorage.removeItem('actionsColumns');
    } catch (e) { /* ignore parse errors */ }
  } catch (e) { /* ignore */ }
}

function getActionsColumns(tabId) {
  const defaults = {
    breed: true,
    sire: true,
    dam: true,
    sireSire: true,
    notes: false,
    age: true,
    weight: true,
    sex: true,
    pastLambing: true,
    lastLambingDate: false,
    bredDate: true,
    daysUntil: true,
    daysPost: true,
    expectedDueDate: true,
    actions: false
  };
  try {
    // migrate legacy if present
    _migrateActionsColumnsIfNeeded();
    const raw = localStorage.getItem('dashboardColumns');
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) || {};
    const actionsNode = parsed.actions || parsed.action || null;
    if (!actionsNode) return defaults;
    // If actionsNode is a plain boolean map, treat as legacy global
    if (actionsNode && typeof actionsNode === 'object' && Object.keys(actionsNode).length && Object.keys(actionsNode).every(k => typeof actionsNode[k] === 'boolean')) {
      // treat as global map
      return Object.assign({}, defaults, actionsNode || {});
    }
    const key = tabId || 'global';
    const tabMap = (actionsNode && actionsNode[key]) ? actionsNode[key] : (actionsNode && actionsNode.global ? actionsNode.global : null);
    return Object.assign({}, defaults, tabMap || {});
  } catch (e) { return defaults; }
}

function saveActionsColumns(map, tabId) {
  try {
    // Load dashboardColumns and ensure it is an object
    const raw = localStorage.getItem('dashboardColumns');
    let parsed = raw ? JSON.parse(raw) : {};
    if (parsed && Object.keys(parsed).length && Object.keys(parsed).every(k => typeof parsed[k] === 'boolean')) parsed = { global: parsed };
    parsed = parsed || {};
    // Ensure actions namespace exists
    parsed.actions = parsed.actions || {};
    const key = tabId || 'global';
    parsed.actions[key] = map || {};
    localStorage.setItem('dashboardColumns', JSON.stringify(parsed));
    // Also remove any legacy separate key to avoid confusion
    try { localStorage.removeItem('actionsColumns'); } catch (e) { }
  } catch (e) { console.warn(e); }
}

// Given a sheep record, return lambing summary counts and last lambing date.
// Supports a `lambings` array of objects {date: 'YYYY-MM-DD', count: N} if present.
function getSheepLambingSummary(sheep) {
  const out = { single: 0, twins: 0, triplets: 0, lastDate: null };
  if (!sheep) return out;
  // If `lambings` array exists, use it
  try {
    if (Array.isArray(sheep.lambings) && sheep.lambings.length) {
      sheep.lambings.forEach(ev => {
        const cnt = parseInt((ev && ev.count) || 0, 10) || 0;
        if (cnt <= 1) out.single += 1;
        else if (cnt === 2) out.twins += 1;
        else if (cnt >= 3) out.triplets += 1;
        const d = ev && ev.date ? new Date(ev.date) : null;
        if (d && !isNaN(d)) {
          if (!out.lastDate || d.getTime() > new Date(out.lastDate).getTime()) out.lastDate = d.toISOString().slice(0, 10);
        }
      });
      return out;
    }
  } catch (e) { }
  // If no explicit lambings data, try to infer from stored offspring (sheep where dam === this sheep)
  try {
    const all = getAllSheep();
    const myId = sheep.id || '';
    const myName = (sheep.name || '').toString().trim().toLowerCase();
    const children = all.filter(c => {
      try {
        if (!c || !c.dam) return false;
        const dam = (c.dam || '').toString().trim();
        if (!dam) return false;
        // direct id match
        if (myId && dam === myId) return true;
        // name match (case-insensitive)
        if (myName && dam.toLowerCase() === myName) return true;
        // if dam contains the id or name (loose), treat as match
        if (myId && dam.indexOf(myId) !== -1) return true;
        if (myName && dam.toLowerCase().indexOf(myName) !== -1) return true;
      } catch (e) { }
      return false;
    });

    if (children && children.length) {
      // Group children by birth date (YYYY-MM-DD)
      const groups = {};
      children.forEach(c => {
        try {
          const bdRaw = c.birthDate || c.birthdate || '';
          const bd = bdRaw ? new Date(bdRaw) : null;
          const key = (bd && !isNaN(bd)) ? bd.toISOString().slice(0, 10) : 'unknown';
          groups[key] = groups[key] || [];
          groups[key].push(c);
        } catch (e) { /* ignore */ }
      });
      Object.keys(groups).forEach(k => {
        const arr = groups[k] || [];
        const cnt = arr.length;
        if (k !== 'unknown') {
          if (cnt <= 1) out.single += 1;
          else if (cnt === 2) out.twins += 1;
          else if (cnt >= 3) out.triplets += 1;
          // update lastDate using the group's date
          try {
            if (!out.lastDate || new Date(k).getTime() > new Date(out.lastDate).getTime()) out.lastDate = k;
          } catch (e) { }
        } else {
          // unknown-date births count as 'Other'
          // we won't increment single/twins/triplets for unknowns but set lastDate if missing
          if (!out.lastDate && arr.length) out.lastDate = null;
        }
      });
      return out;
    }
  } catch (e) { }

  // Fallbacks for legacy / single-field schemas
  try {
    if (sheep.lastLambCount) {
      const cnt = parseInt(sheep.lastLambCount, 10) || 0;
      if (cnt <= 1) out.single += 1;
      else if (cnt === 2) out.twins += 1;
      else if (cnt >= 3) out.triplets += 1;
      if (sheep.lastLambingDate) out.lastDate = sheep.lastLambingDate;
    }
  } catch (e) { }
  return out;
}

// Infer detailed lambing events (array of {date,count,children:[ids]}) for a sheep
function getSheepInferredLambings(sheep, allSheep) {
  const out = [];
  if (!sheep) return out;
  try {
    const myId = sheep.id || '';
    const myName = (sheep.name || '').toString().trim().toLowerCase();
    const children = (allSheep || getAllSheep()).filter(c => {
      try {
        if (!c || !c.dam) return false;
        const dam = (c.dam || '').toString().trim();
        if (!dam) return false;
        if (myId && dam === myId) return true;
        if (myName && dam.toLowerCase() === myName) return true;
        if (myId && dam.indexOf(myId) !== -1) return true;
        if (myName && dam.toLowerCase().indexOf(myName) !== -1) return true;
      } catch (e) { }
      return false;
    });

    if (!children || !children.length) return out;

    const groups = {};
    children.forEach(c => {
      try {
        const bdRaw = c.birthDate || c.birthdate || '';
        const bd = bdRaw ? new Date(bdRaw) : null;
        const key = (bd && !isNaN(bd)) ? bd.toISOString().slice(0, 10) : 'unknown';
        groups[key] = groups[key] || [];
        groups[key].push(c);
      } catch (e) { }
    });

    Object.keys(groups).forEach(k => {
      const arr = groups[k] || [];
      const cnt = arr.length;
      out.push({ date: k === 'unknown' ? null : k, count: cnt, children: arr.map(x => x.id || (x.name || '')) });
    });
    // sort by date desc, unknowns last
    out.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  } catch (e) { }
  return out;
}

// Persist inferred lambing events into each ewe's `lambings` array when missing or empty.
function persistInferredLambingsForAll() {
  try {
    const all = getAllSheep();
    if (!all || !all.length) return;
    let master = JSON.parse(localStorage.getItem('sheepList') || '[]');
    let changed = false;
    all.forEach(s => {
      try {
        const sex = (s.sex || '').toString().toLowerCase();
        // only infer for ewes
        if (sex !== 'ewe') return;
        const existing = Array.isArray(s.lambings) && s.lambings.length;
        if (existing) return; // don't overwrite explicit data
        const inferred = getSheepInferredLambings(s, all);
        if (inferred && inferred.length) {
          s.lambings = inferred;
          localStorage.setItem(`sheep-${s.id}`, JSON.stringify(s));
          const idx = master.findIndex(x => x.id === s.id);
          if (idx !== -1) master[idx] = s; else master.push(s);
          changed = true;
        }
      } catch (e) { }
    });
    if (changed) localStorage.setItem('sheepList', JSON.stringify(master));
  } catch (e) { console.warn('persistInferredLambingsForAll failed', e); }
}

// Render lambing history for a given sheep into the detail page container
function renderLambingHistory(sheep) {
  try {
    const cont = document.getElementById('lambingHistory');
    if (!cont) return;
    cont.innerHTML = '';

    // Prefer explicit persisted lambings, otherwise infer from pedigree/offspring
    let events = Array.isArray(sheep.lambings) && sheep.lambings.length ? sheep.lambings : getSheepInferredLambings(sheep);
    if (!events || !events.length) {
      cont.innerHTML = '<div style="color:#666">No lambing events recorded.</div>';
      return;
    }

    // Build list grouped by date
    const list = document.createElement('div');
    list.className = 'lambing-events';

    events.forEach(ev => {
      const evWrap = document.createElement('div');
      evWrap.className = 'lambing-event';
      evWrap.style.padding = '6px 0';
      evWrap.style.borderBottom = '1px solid #f0f0f0';

      const dateText = ev.date ? formatDateLong(ev.date) : 'Unknown date';
      const header = document.createElement('div');
      header.style.fontWeight = '600';
      header.style.marginBottom = '6px';
      header.textContent = `${dateText} — ${ev.count || (ev.children && ev.children.length) || 0} lamb(s)`;
      evWrap.appendChild(header);

      const kidsWrap = document.createElement('div');
      kidsWrap.style.display = 'flex';
      kidsWrap.style.flexDirection = 'column';
      kidsWrap.style.gap = '4px';

      const children = Array.isArray(ev.children) ? ev.children : [];
      if (!children.length) {
        const noKids = document.createElement('div'); noKids.style.color = '#666'; noKids.textContent = 'No lamb records linked.'; kidsWrap.appendChild(noKids);
      } else {
        children.forEach(cid => {
          const kidId = cid || '';
          // Try to resolve a sheep record for this child (by id or name)
          let linked = null;
          try {
            // if cid looks like an id that exists in localStorage, use it
            if (kidId && String(kidId).indexOf('sheep-') === 0) {
              const raw = localStorage.getItem(kidId);
              if (raw) linked = JSON.parse(raw);
            }
            if (!linked && kidId) {
              // try to find by id or name using helper
              linked = findSheepByNameOrId(kidId) || null;
            }
          } catch (e) { linked = null; }

          const kidLine = document.createElement('div');
          kidLine.style.fontSize = '14px';
          if (linked && linked.id) {
            const btn = document.createElement('button');
            btn.type = 'button';
            // use the app's standard button styling while keeping the detail-link marker
            btn.className = 'button detail-link';
            btn.textContent = linked.name || linked.id;
            btn.dataset.id = linked.id;
            btn.addEventListener('click', () => { try { window.location.href = buildDetailLink(linked.id); } catch (e) { window.location.href = 'sheep-detail.html?id=' + encodeURIComponent(linked.id); } });
            kidLine.appendChild(btn);
            const meta = document.createElement('small'); meta.style.color = '#666'; meta.style.marginLeft = '8px'; meta.textContent = ` (${linked.id})`; kidLine.appendChild(meta);
          } else {
            // plain text (name or identifier)
            kidLine.textContent = String(kidId || '(unknown)');
            kidLine.style.color = '#333';
          }
          kidsWrap.appendChild(kidLine);
        });
      }

      evWrap.appendChild(kidsWrap);
      list.appendChild(evWrap);
    });

    cont.appendChild(list);
  } catch (e) {
    try { const cont = document.getElementById('lambingHistory'); if (cont) cont.innerHTML = '<div style="color:#a33">Unable to render lambing history.</div>'; } catch (ee) { }
  }
}

function getSelectedIds() {
  try {
    const fromSession = JSON.parse(sessionStorage.getItem('bulkSelected') || '[]');
    if (Array.isArray(fromSession) && fromSession.length) return fromSession;
  } catch (e) { }
  // fallback to checked checkboxes in the table
  try {
    const els = Array.from(document.querySelectorAll('#sheepTable tbody .row-checkbox:checked'));
    const ids = els.map(e => e.dataset.id).filter(Boolean);
    if (ids.length) return ids;
  } catch (e) { }
  return [];
}

function formatDateISO(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
}

// Format a date for display as "Month D, YYYY" (e.g. March 3, 2025)
function formatDateLong(d) {
  if (!d) return '';
  const dt = (d instanceof Date) ? d : new Date(d);
  if (isNaN(dt)) return '';
  try {
    return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    // fallback to manual formatting
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${monthNames[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;
  }
}

// Compute a display age string for a sheep record.
function getDisplayAge(sheep) {
  try {
    if (!sheep) return '';
    // If a frozenAge exists (set when archived/culled/sold), return it
    if (sheep.frozenAge && (sheep.status === 'archived' || sheep.status === 'culled' || sheep.status === 'sold')) return sheep.frozenAge;
    // otherwise compute from birthDate if present
    if (sheep.birthDate) return computeAge(sheep.birthDate);
    // fallback to stored age field
    return sheep.age || '';
  } catch (e) { return sheep && (sheep.age || '') || ''; }
}

// Apply a status change to a sheep record, freezing age when moved to inactive states
function applySheepStatus(sheep, newStatus) {
  if (!sheep) return;
  try {
    sheep.status = newStatus;
    if (newStatus === 'archived' || newStatus === 'culled' || newStatus === 'sold') {
      try {
        const computed = computeAge(sheep.birthDate);
        sheep.frozenAge = computed || (sheep.age || '');
      } catch (e) { sheep.frozenAge = sheep.age || ''; }
    } else if (newStatus === 'active') {
      // restore live aging by removing frozenAge so computeAge(birthDate) is used
      try { if (sheep.hasOwnProperty('frozenAge')) delete sheep.frozenAge; } catch (e) { }
    }
  } catch (e) { }
}
try { window.applySheepStatus = applySheepStatus; } catch (e) { }

// Add a finance income entry for a sale. amount is a number, desc is string, date optional (ISO yyyy-mm-dd)
function addFinanceEntry(amount, desc, date) {
  try {
    const key = 'financeEntries';
    let entries = [];
    try { entries = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { entries = []; }
    const amt = Math.round((Number(amount) || 0) * 100) / 100;
    const d = date || (new Date()).toISOString().slice(0, 10);
    const entry = { id: 'f' + Date.now(), type: 'income', date: d, amount: amt, desc: String(desc || '') };
    entries.push(entry);
    try { localStorage.setItem(key, JSON.stringify(entries)); } catch (e) { console.warn('save finance failed', e); }
    // If finance UI present, try to refresh it
    try { if (typeof window.initFinance === 'function') window.initFinance(); } catch (e) { }
    return entry;
  } catch (e) { console.warn('addFinanceEntry failed', e); return null; }
}
try { window.addFinanceEntry = addFinanceEntry; } catch (e) { }

function openBreedingModal(targetIds, mode) {
  const modal = document.getElementById('breedingModal');
  if (!modal) return alert('Breeding UI not available on this page.');

  // adjust modal title depending on how it was opened
  try {
    const titleEl = document.getElementById('breedingModalTitle');
    if (titleEl) titleEl.textContent = (mode === 'mating') ? 'Record Mating' : 'Record Breeding';
  } catch (e) { }

  // populate sire list (rams only, active)
  const sireSelect = document.getElementById('breedingSire');
  sireSelect.innerHTML = '';
  const all = getAllSheep();
  const rams = all.filter(s => (s.sex || '').toString().toLowerCase() === 'ram' && isActiveStatus(s.status) && !isLamb(s));
  const noneOpt = document.createElement('option'); noneOpt.value = ''; noneOpt.textContent = '-- Unknown / No sire --'; sireSelect.appendChild(noneOpt);
  rams.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r.id || (r.name || '');
    opt.textContent = `${r.name || r.id || opt.value}`;
    sireSelect.appendChild(opt);
  });

  // show targets summary
  const targetsEl = document.getElementById('breedingTargets');
  if (targetsEl) {
    // Build a checklist of selected targets so the user can uncheck before applying
    let ids = Array.isArray(targetIds) && targetIds.length ? targetIds.slice() : getSelectedIds();
    let fallbackUsed = false;
    // If no explicit selections, fall back to visible active ewes (so user can pick from the list)
    if ((!ids || !ids.length)) {
      try {
        const all = getAllSheep();
        const visible = all.filter(s => matchesTab(s, _currentTab));
        // prefer active ewes (exclude lambs)
        const visibleEwes = visible.filter(s => (s.sex || '').toString().toLowerCase() === 'ewe' && isActiveStatus(s.status) && !isLamb(s));
        if (visibleEwes && visibleEwes.length) {
          ids = visibleEwes.map(s => s.id).filter(Boolean);
          fallbackUsed = true;
        } else {
          // global fallback to any active ewes
          const allEwes = all.filter(s => (s.sex || '').toString().toLowerCase() === 'ewe' && isActiveStatus(s.status) && !isLamb(s));
          if (allEwes && allEwes.length) {
            ids = allEwes.map(s => s.id).filter(Boolean);
            fallbackUsed = true;
          }
        }
      } catch (e) { /* ignore fallback errors */ }
    }

    if (ids && ids.length) {
      const rows = ids.map(id => {
        try {
          const raw = localStorage.getItem(`sheep-${id}`);
          const s = raw ? JSON.parse(raw) : null;
          const label = s ? (s.name || s.id || id) : id;
          return `<label style="display:flex; align-items:center; gap:8px; padding:4px 0;"><input type=\"checkbox\" class=\"breeding-target-checkbox\" data-id=\"${id}\" checked><span>${escapeHtml(label)}</span><small style=\"margin-left:auto;color:#666\">${escapeHtml(id)}</small></label>`;
        } catch (e) {
          return `<label style="display:flex; align-items:center; gap:8px; padding:4px 0;"><input type=\"checkbox\" class=\"breeding-target-checkbox\" data-id=\"${id}\" checked><span>${escapeHtml(id)}</span></label>`;
        }
      }).join('');
      let note = fallbackUsed ? '<div style="margin-bottom:6px;font-size:12px;color:#a33;">No sheep were explicitly selected — showing active ewes from the current view. Uncheck any you do not want to include.</div>' : '';
      targetsEl.innerHTML = note + `<div class="breeding-target-list" style="max-height:160px; overflow:auto; border:1px solid #eee; padding:8px; background:#fafafa;">${rows}</div><div style=\"margin-top:6px;font-size:12px;color:#666;\">Uncheck any animals you do not want to apply this breeding to.</div>`;
    } else {
      targetsEl.textContent = `No target sheep selected. You can apply to the current sheep only.`;
    }
  }

  // default bred date today
  const bredInput = document.getElementById('breedingDate');
  if (bredInput) bredInput.value = formatDateISO(new Date());

  // show modal
  modal.style.display = 'block';

  // wire close/cancel
  const closeX = document.getElementById('breedingClose');
  const cancelBtn = document.getElementById('breedingCancel');
  const onClose = () => { try { modal.style.display = 'none'; } catch (e) { } };
  if (closeX) closeX.onclick = onClose;
  if (cancelBtn) cancelBtn.onclick = onClose;

  // wire confirm (remove any existing handler first)
  const confirmBtn = document.getElementById('breedingConfirmBtn');
  if (!confirmBtn) return;
  const handler = () => {
    try {
      applyBreeding(targetIds);
    } finally {
      confirmBtn.removeEventListener('click', handler);
    }
  };
  // ensure we don't add duplicate listeners
  confirmBtn.removeEventListener('click', handler);
  confirmBtn.addEventListener('click', handler);
}

function applyBreeding(targetIds) {
  const sireSelect = document.getElementById('breedingSire');
  const bredInput = document.getElementById('breedingDate');
  if (!bredInput) return alert('Please provide a bred date.');
  const bredDate = bredInput.value;
  if (!bredDate) return alert('Please choose a bred date.');

  let ids = Array.isArray(targetIds) ? targetIds.slice() : [];
  // If the modal contains a checklist, prefer the checked items in that checklist
  try {
    const cbEls = Array.from(document.querySelectorAll('.breeding-target-checkbox'));
    if (cbEls && cbEls.length) {
      const checked = cbEls.filter(cb => cb.checked).map(cb => cb.dataset.id).filter(Boolean);
      ids = checked;
    }
  } catch (e) { }
  // If no targets were provided, try to use selections or current detail sheep id
  if (!ids.length) {
    ids = getSelectedIds();
  }

  // If still none and we have a sheep id in URL (detail page), apply to that
  if (!ids.length) {
    try {
      const params = new URLSearchParams(window.location.search);
      const sid = params.get('id');
      if (sid) ids = [sid];
    } catch (e) { }
  }

  if (!ids.length) return alert('No sheep selected for breeding.');

  const sireVal = sireSelect ? sireSelect.value : '';
  const gestation = getGestationDays();

  const dueDateObj = new Date(bredDate);
  if (isNaN(dueDateObj)) return alert('Invalid bred date.');
  const dueTs = dueDateObj.getTime() + (gestation * 24 * 60 * 60 * 1000);
  const dueStr = formatDateISO(new Date(dueTs));

  // Apply to each selected sheep
  let master = JSON.parse(localStorage.getItem('sheepList') || '[]');
  ids.forEach(id => {
    try {
      const raw = localStorage.getItem(`sheep-${id}`);
      let s = raw ? JSON.parse(raw) : null;
      if (!s) {
        // create a minimal record if missing
        s = { id, name: id };
      }
      // set sire (store id if provided, otherwise leave blank)
      if (sireVal) s.sire = sireVal;
      // store last-breeding metadata so future lambing records can default to this sire
      try { if (sireVal) s._lastBreedingSire = sireVal; if (bredDate) s._lastBredDate = bredDate; } catch (e) { }
      // Persist a breeding record array so the sheep has a history of breedings
      try {
        if (!Array.isArray(s.breedings)) s.breedings = [];
        // avoid pushing a duplicate identical trailing record
        const last = s.breedings.length ? s.breedings[s.breedings.length - 1] : null;
        if (!last || String(last.date || '') !== String(bredDate || '') || String(last.sire || '') !== String(sireVal || '')) {
          s.breedings.push({ date: bredDate, sire: sireVal || '', note: 'Recorded breeding' });
        }
      } catch (e) { }
      s.bredDate = bredDate;
      s.expectedDueDate = dueStr;
      localStorage.setItem(`sheep-${id}`, JSON.stringify(s));
      const idx = master.findIndex(x => x.id === id);
      if (idx !== -1) master[idx] = s; else master.push(s);
    } catch (e) { console.warn(e); }
  });
  try { localStorage.setItem('sheepList', JSON.stringify(master)); } catch (e) { console.warn(e); }

  // refresh UI
  try { loadSheepList(); } catch (e) { }
  // Close modal
  const modal = document.getElementById('breedingModal'); if (modal) modal.style.display = 'none';
  // update detail page expected due date display if present
  try { const dueSpan = document.getElementById('expectedDueDate'); if (dueSpan) dueSpan.textContent = dueStr || 'N/A'; } catch (e) { }
  alert(`Breeding recorded for ${ids.length} sheep. Expected due date: ${dueStr}`);

  // Persist inferred lambings and refresh lambing history if we're viewing one of the affected sheep
  try {
    try { persistInferredLambingsForAll(); } catch (e) { }
    const params = new URLSearchParams(window.location.search);
    const currId = params.get('id');
    if (currId && ids && ids.indexOf(currId) !== -1) {
      const raw = localStorage.getItem(`sheep-${currId}`);
      const s = raw ? JSON.parse(raw) : null;
      if (s) {
        try {
          const sexVal = (s && s.sex || '').toString().toLowerCase();
          // prepare containers similar to detail load
          try {
            const inlineBox = document.getElementById('breedingHistoryBox');
            const bottomBox = document.getElementById('breedingHistoryBottomBox');
            if (sexVal === 'ewe') { if (inlineBox) inlineBox.style.display = ''; if (bottomBox) bottomBox.style.display = 'none'; }
            else if (sexVal === 'ram') { if (inlineBox) inlineBox.style.display = 'none'; if (bottomBox) bottomBox.style.display = ''; }
            else { if (inlineBox) inlineBox.style.display = ''; if (bottomBox) bottomBox.style.display = 'none'; }
          } catch (ee) { }
          if (sexVal === 'ewe') try { renderLambingHistory(s); } catch (e) { }
          else try { const lh = document.getElementById('lambingHistory'); if (lh) { lh.innerHTML = ''; lh.style.display = 'none'; } } catch (e) { }
        } catch (e) { }
        try { renderBreedingHistory(s); } catch (e) { }
      }
    }
  } catch (e) { /* non-fatal */ }
}

// Open the sale modal and handle bulk or per-animal sale recording.
function openSaleModal(targetIds) {
  const modal = document.getElementById('saleModal');
  if (!modal) return alert('Sale UI not available on this page.');

  // Resolve ids: use provided array, session-selected, or current detail id
  let ids = Array.isArray(targetIds) ? targetIds.slice() : [];
  try {
    if (!ids.length) ids = getSelectedIds();
  } catch (e) { }
  try {
    if (!ids.length) {
      const params = new URLSearchParams(window.location.search);
      const sid = params.get('id');
      if (sid) ids = [sid];
    }
  } catch (e) { }

  if (!ids || !ids.length) return alert('No animals selected for sale.');

  // Populate selected list display
  const selectedList = document.getElementById('saleSelectedList');
  const perContainer = document.getElementById('salePerAnimalContainer');
  const bulkRow = document.getElementById('saleBulkRow');
  const perRow = document.getElementById('salePerAnimalRow');
  const bulkPriceInput = document.getElementById('saleBulkPrice');

  if (selectedList) {
    selectedList.innerHTML = ids.map(id => {
      try {
        const raw = localStorage.getItem(`sheep-${id}`);
        const s = raw ? JSON.parse(raw) : null;
        const label = s ? `${s.name || s.id || id}${s.sex ? ' (' + s.sex + ')' : ''}` : id;
        return `<span style="display:inline-block;margin-right:8px;padding:4px 6px;background:#f5f5f5;border-radius:4px;">${escapeHtml(label)}</span>`;
      } catch (e) { return `<span>${escapeHtml(id)}</span>`; }
    }).join(' ');
  }

  // Build per-animal inputs
  if (perContainer) {
    perContainer.innerHTML = '';
    ids.forEach(id => {
      try {
        const raw = localStorage.getItem(`sheep-${id}`);
        const s = raw ? JSON.parse(raw) : { id };
        const label = escapeHtml(s.name || s.id || id);
        const row = document.createElement('div');
        row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px'; row.style.padding = '6px 0';
        const lbl = document.createElement('div'); lbl.style.minWidth = '160px'; lbl.textContent = label + (s.sex ? ' (' + s.sex + ')' : '');
        const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'sale-price-input'; inp.dataset.id = id; inp.placeholder = 'Price'; inp.style.flex = '1'; inp.style.padding = '6px';
        row.appendChild(lbl); row.appendChild(inp);
        perContainer.appendChild(row);
      } catch (e) { }
    });
  }

  // Wire mode radios to toggle rows
  try {
    const radios = modal.querySelectorAll('input[name="saleMode"]');
    radios.forEach(r => r.addEventListener('change', () => {
      if (r.value === 'per' && r.checked) {
        if (bulkRow) bulkRow.style.display = 'none';
        if (perRow) perRow.style.display = '';
      } else if (r.value === 'bulk' && r.checked) {
        if (bulkRow) bulkRow.style.display = '';
        if (perRow) perRow.style.display = 'none';
      }
    }));
  } catch (e) { }

  // default: show bulk
  try { if (bulkRow) bulkRow.style.display = ''; if (perRow) perRow.style.display = 'none'; if (bulkPriceInput) bulkPriceInput.value = ''; } catch (e) { }

  // show modal
  modal.style.display = 'block';

  // wire close/cancel
  const closeX = document.getElementById('saleModalClose');
  const cancelBtn = document.getElementById('saleCancelBtn');
  const onClose = () => { try { modal.style.display = 'none'; } catch (e) { } };
  if (closeX) closeX.onclick = onClose;
  if (cancelBtn) cancelBtn.onclick = onClose;

  // wire confirm (avoid duplicate listeners)
  const confirmBtn = document.getElementById('saleConfirmBtn');
  if (!confirmBtn) return;
  const handler = () => {
    try {
      // determine mode
      const mode = (modal.querySelector('input[name="saleMode"]:checked') || {}).value || 'bulk';
      let master = JSON.parse(localStorage.getItem('sheepList') || '[]');
      if (mode === 'bulk') {
        const rawAmt = (bulkPriceInput && bulkPriceInput.value) ? String(bulkPriceInput.value) : '';
        if (!rawAmt) return alert('Please enter a total sale amount.');
        const amt = parseFloat(rawAmt.replace(/[^0-9.\-]/g, ''));
        if (isNaN(amt) || amt <= 0) return alert('Invalid sale amount.');
        // apply sold status to each sheep
        ids.forEach(id => {
          try {
            const raw = localStorage.getItem(`sheep-${id}`);
            if (!raw) return;
            const s = JSON.parse(raw);
            try { applySheepStatus(s, 'sold'); } catch (e) { s.status = 'sold'; }
            localStorage.setItem(`sheep-${id}`, JSON.stringify(s));
            const idx = master.findIndex(x => x.id === id);
            if (idx !== -1) master[idx] = s; else master.push(s);
          } catch (e) { console.warn(e); }
        });
        // record single finance entry describing animals
        try {
          if (typeof addFinanceEntry === 'function') {
            const names = ids.map(id => { try { const raw = localStorage.getItem(`sheep-${id}`); const ss = raw ? JSON.parse(raw) : { id }; return `${ss.name || 'Unnamed'}${ss.sex ? ' (' + ss.sex + ')' : ''}`; } catch (e) { return id; } }).filter(Boolean).join(', ');
            addFinanceEntry(amt, `Bulk sale: ${ids.length} sheep — ${names}`);
          }
        } catch (e) { console.warn(e); }
      } else {
        // per-animal: read each input and record individual finance entries
        const inputs = Array.from(document.querySelectorAll('.sale-price-input')).filter(x => x && x.dataset && x.dataset.id);
        for (let i = 0; i < inputs.length; i++) {
          try {
            const inp = inputs[i];
            const id = inp.dataset.id;
            const rawVal = (inp.value || '').toString().trim();
            if (!rawVal) return alert('Please enter a price for each selected animal.');
            const amt = parseFloat(rawVal.replace(/[^0-9.\-]/g, ''));
            if (isNaN(amt) || amt <= 0) return alert('Invalid price for an animal.');
            const raw = localStorage.getItem(`sheep-${id}`);
            if (!raw) continue;
            const s = JSON.parse(raw);
            try { applySheepStatus(s, 'sold'); } catch (e) { s.status = 'sold'; }
            localStorage.setItem(`sheep-${id}`, JSON.stringify(s));
            const idx = master.findIndex(x => x.id === id);
            if (idx !== -1) master[idx] = s; else master.push(s);
            try { if (typeof addFinanceEntry === 'function') addFinanceEntry(amt, `${s.name || 'Unnamed'}${s.sex ? ' (' + s.sex + ')' : ''}`); } catch (e) { console.warn(e); }
          } catch (e) { console.warn(e); }
        }
      }

      try { localStorage.setItem('sheepList', JSON.stringify(master)); } catch (e) { }
      try { loadSheepList(); } catch (e) { }
      try { modal.style.display = 'none'; } catch (e) { }
      try { showSnackbar(`Recorded sale for ${ids.length} animal(s).`); } catch (e) { }
    } finally {
      confirmBtn.removeEventListener('click', handler);
    }
  };
  confirmBtn.removeEventListener('click', handler);
  confirmBtn.addEventListener('click', handler);
}


function showBulkActions(tabButton) {
  // Mark the bulk tab active and clear others
  const buttons = document.querySelectorAll('#tabs .tab-button');
  buttons.forEach(b => b.classList.toggle('active', b === tabButton));

  // Scroll top-controls into view and add a temporary highlight
  const top = document.querySelector('.top-controls');
  if (top) {
    top.scrollIntoView({ behavior: 'smooth', block: 'center' });
    top.classList.add('bulk-highlight');
    setTimeout(() => top.classList.remove('bulk-highlight'), 2200);
  }
}

// Quick action menu for badge clicks (Mark culled / Snooze)
function openQuickActions(sheepId, anchorEl) {
  closeQuickActions();
  const menu = document.createElement('div');
  menu.className = 'quick-actions';
  // Build menu dynamically based on the sheep's data (show Clear bred if applicable)
  try {
    const raw = localStorage.getItem(`sheep-${sheepId}`);
    const s = raw ? JSON.parse(raw) : null;
    const isBredBadge = anchorEl && anchorEl.classList && anchorEl.classList.contains && (anchorEl.classList.contains('badge-bred') || anchorEl.classList.contains('badge-nursing'));
    let html = '';
    // If the sheep has breeding data, offer Clear bred
    if (s && (s.bredDate || s.expectedDueDate)) {
      html += `<button class="qa-btn" data-action="clearBred">Clear bred</button>`;
    }
    // If the menu was opened from the bred badge, don't include 'Mark culled'
    if (!isBredBadge) {
      html += `<button class="qa-btn" data-action="markCulled">Mark culled</button>`;
    }
    html += `<button class="qa-btn" data-action="snooze">Snooze</button>`;
    html += `<button class="qa-btn" data-action="cancel">Cancel</button>`;
    menu.innerHTML = html;
  } catch (e) {
    // fallback to default menu; omit markCulled when opened from bred badge
    const isBredBadge = anchorEl && anchorEl.classList && anchorEl.classList.contains && anchorEl.classList.contains('badge-bred');
    menu.innerHTML = `${isBredBadge ? '' : '<button class="qa-btn" data-action="markCulled">Mark culled</button>'}<button class="qa-btn" data-action="snooze">Snooze</button><button class="qa-btn" data-action="cancel">Cancel</button>`;
  }
  document.body.appendChild(menu);

  // Position the menu near the anchor element
  try {
    const rect = anchorEl.getBoundingClientRect();
    const left = rect.right + window.scrollX + 6;
    const top = rect.top + window.scrollY;
    menu.style.position = 'absolute';
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.zIndex = 2000;
  } catch (e) { /* ignore positioning errors */ }

  const onClick = (ev) => {
    const action = ev.target.getAttribute('data-action');
    if (!action) return;
    if (action === 'cancel') { closeQuickActions(); return; }
    // Load sheep record
    try {
      const raw = localStorage.getItem(`sheep-${sheepId}`);
      if (!raw) return closeQuickActions();
      const s = JSON.parse(raw);
      if (action === 'markCulled') {
        if (!confirm('Mark this sheep as CULLED?')) { closeQuickActions(); return; }
        applySheepStatus(s, 'culled');
      } else if (action === 'snooze') {
        if (!confirm('Snooze "To be culled" and mark as active?')) { closeQuickActions(); return; }
        applySheepStatus(s, 'active');
      } else if (action === 'clearBred') {
        if (!confirm('Clear breeding information (bred date and expected due date) for this sheep?')) { closeQuickActions(); return; }
        try {
          delete s.bredDate;
          delete s.expectedDueDate;
        } catch (ee) { }
      }
      // save individual and update master list
      localStorage.setItem(`sheep-${s.id}`, JSON.stringify(s));
      let master = JSON.parse(localStorage.getItem('sheepList') || '[]');
      const idx = master.findIndex(x => x.id === s.id);
      if (idx !== -1) master[idx] = s; else master.push(s);
      localStorage.setItem('sheepList', JSON.stringify(master));
      closeQuickActions();
      loadSheepList();
    } catch (err) { console.warn(err); closeQuickActions(); }
  };

  menu.addEventListener('click', onClick);

  // Close when clicking outside
  const onDocClick = (e) => { if (!menu.contains(e.target) && e.target !== anchorEl) closeQuickActions(); };
  setTimeout(() => document.addEventListener('click', onDocClick), 0);
  menu._cleanup = () => { document.removeEventListener('click', onDocClick); menu.removeEventListener('click', onClick); };
}

function closeQuickActions() {
  const existing = document.querySelector('.quick-actions');
  if (existing) {
    if (existing._cleanup) try { existing._cleanup(); } catch (e) { }
    existing.remove();
  }
}

function initTableColumnResizers(table) {
  if (!table) return;
  const ths = table.querySelectorAll('th');
  // apply saved widths first
  const saved = getSavedColumnWidths(table);
  if (saved && saved.length) {
    Array.from(ths).forEach((th, i) => {
      if (saved[i]) {
        th.style.width = saved[i] + 'px';
        // set body cells
        Array.from(table.querySelectorAll('tbody tr')).forEach(row => {
          const cell = row.querySelector(`td:nth-child(${i + 1})`);
          if (cell) cell.style.width = saved[i] + 'px';
        });
      }
    });
  }

  ths.forEach(th => {
    // skip if already has resizer
    if (th.querySelector('.col-resizer')) return;
    const resizer = document.createElement('div');
    resizer.className = 'col-resizer';
    th.appendChild(resizer);

    let startX, startWidth;
    const onMouseDown = (e) => {
      startX = e.clientX;
      startWidth = th.offsetWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    };
    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const newWidth = Math.max(40, startWidth + dx);
      th.style.width = newWidth + 'px';
      // set corresponding column cells to match via nth-child
      const index = Array.prototype.indexOf.call(th.parentNode.children, th) + 1;
      Array.from(table.querySelectorAll('tbody tr')).forEach(row => {
        const cell = row.querySelector(`td:nth-child(${index})`);
        if (cell) cell.style.width = newWidth + 'px';
      });
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      // persist widths
      saveColumnWidths(table);
    };
    resizer.addEventListener('mousedown', onMouseDown);
    // double-click header to auto-fit
    th.addEventListener('dblclick', (e) => {
      const index = Array.prototype.indexOf.call(th.parentNode.children, th) + 1;
      autoFitColumn(table, index);
    });
  });
}

// Delete a sheep by id (removes individual sheep key and from sheepList)
function deleteSheep(sheepId) {
  if (!sheepId) return;
  if (!confirm('Delete this sheep? This cannot be undone.')) return;

  try {
    // Remove individual sheep entry
    localStorage.removeItem(`sheep-${sheepId}`);

    // Update master list
    let sheepList = JSON.parse(localStorage.getItem('sheepList') || '[]');
    sheepList = sheepList.filter(s => s.id !== sheepId);
    localStorage.setItem('sheepList', JSON.stringify(sheepList));

    // Refresh table
    loadSheepList();
  } catch (e) {
    console.warn(e);
    alert('Unable to delete sheep. See console for details.');
  }
}

// Load sheep detail page
function loadSheepDetail() {
  const params = new URLSearchParams(window.location.search);
  const sheepId = params.get('id');

  if (!sheepId) {
    document.body.innerHTML = '<p>No sheep selected.</p>';
    return;
  }

  // Ensure inferred lambings are persisted so the detail page shows up-to-date history
  try { persistInferredLambingsForAll(); } catch (e) { }

  const sheep = JSON.parse(localStorage.getItem(`sheep-${sheepId}`) || '{}');

  if (!sheep.id) {
    document.body.innerHTML = '<p>Sheep not found.</p>';
    return;
  }

  // Wire previous/next navigation buttons and keyboard shortcuts
  try {
    // Helper to get previous/next sheep ids based on master list order
    const getPrevNextSheepIds = (currentId) => {
      try {
        let list = JSON.parse(localStorage.getItem('sheepList') || '[]');
        if (!Array.isArray(list) || !list.length) list = getAllSheep() || [];
        if (!Array.isArray(list) || !list.length) return { prevId: null, nextId: null };
        // respect tab parameter in URL or fall back to global _currentTab
        try {
          const params = new URLSearchParams(window.location.search);
          const tabParam = params.get('tab') || _currentTab || 'all';
          if (tabParam) {
            list = list.filter(s => matchesTab(s, tabParam));
          }
        } catch (e) { /* ignore URL parsing */ }
        const ids = list.map(s => (s && s.id) ? s.id : '');
        let idx = ids.indexOf(currentId);
        if (idx === -1) {
          // try matching by name if id wasn't found
          idx = list.findIndex(s => (s && (s.name || '')).toString().toLowerCase() === (currentId || '').toString().toLowerCase());
        }
        if (idx === -1) return { prevId: null, nextId: null };
        const prevIdx = (idx - 1 + ids.length) % ids.length;
        const nextIdx = (idx + 1) % ids.length;
        return {
          prevId: ids[prevIdx] || null,
          nextId: ids[nextIdx] || null,
          prevName: (list[prevIdx] && (list[prevIdx].name || list[prevIdx].id)) || null,
          nextName: (list[nextIdx] && (list[nextIdx].name || list[nextIdx].id)) || null,
          index: idx,
          total: ids.length
        };
      } catch (e) { return { prevId: null, nextId: null }; }
    };

    const nav = getPrevNextSheepIds(sheepId);
    // Show breadcrumb like "5 of 22" when possible
    try {
      const bc = document.getElementById('detailBreadcrumb');
      if (bc && nav && typeof nav.index === 'number' && typeof nav.total === 'number') {
        bc.textContent = `${nav.index + 1} of ${nav.total}`;
      } else if (bc) {
        bc.textContent = '';
      }
    } catch (e) { }

    // Helper: navigate with fade animation for smoother transitions
    const navigateWithFade = (url) => {
      try {
        const container = document.querySelector('.container');
        if (container) {
          container.classList.add('page-fade');
          // trigger visible -> hidden transition
          // ensure visible class present first
          container.classList.add('page-visible');
          // allow browser to paint
          requestAnimationFrame(() => {
            // start hide transition
            container.classList.remove('page-visible');
            container.classList.add('page-hidden');
            try {
              // derive transition duration from computed CSS to keep JS in sync
              const cs = getComputedStyle(container);
              const td = cs.transitionDuration || cs['transition-duration'] || '0.08s';
              // transitionDuration may be a comma-separated list; take first
              const first = (td || '').split(',')[0].trim();
              let ms = 80;
              if (first.endsWith('ms')) ms = parseFloat(first) || ms;
              else if (first.endsWith('s')) ms = (parseFloat(first) * 1000) || ms;
              // If transition is effectively zero, navigate immediately for instant swap
              if (!ms || ms <= 12) {
                window.location.href = url;
              } else {
                // add a tiny buffer to ensure the animation finishes
                const wait = Math.round(ms + 8);
                setTimeout(() => { window.location.href = url; }, wait);
              }
            } catch (e) { setTimeout(() => { window.location.href = url; }, 90); }
          });
          return;
        }
        // fallback immediate
        window.location.href = url;
      } catch (e) { window.location.href = url; }
    };
    const prevBtn = document.getElementById('prevSheepBtn');
    const nextBtn = document.getElementById('nextSheepBtn');
    if (prevBtn) {
      // replace any previous inline handler to avoid duplicate invocations
      try { prevBtn.onclick = null; } catch (e) { }
      if (nav.prevId) {
        prevBtn.disabled = false;
        prevBtn.title = `Previous: ${nav.prevName || nav.prevId}`;
        prevBtn.onclick = () => {
          const params = new URLSearchParams(window.location.search);
          const tabP = params.get('tab') ? `&tab=${encodeURIComponent(params.get('tab'))}` : ((_currentTab && _currentTab !== 'all') ? `&tab=${encodeURIComponent(_currentTab)}` : '');
          navigateWithFade(buildDetailLink(nav.prevId));
        };
      } else {
        prevBtn.disabled = true;
      }
    }
    if (nextBtn) {
      try { nextBtn.onclick = null; } catch (e) { }
      if (nav.nextId) {
        nextBtn.disabled = false;
        nextBtn.title = `Next: ${nav.nextName || nav.nextId}`;
        nextBtn.onclick = () => {
          const params = new URLSearchParams(window.location.search);
          const tabP = params.get('tab') ? `&tab=${encodeURIComponent(params.get('tab'))}` : ((_currentTab && _currentTab !== 'all') ? `&tab=${encodeURIComponent(_currentTab)}` : '');
          navigateWithFade(buildDetailLink(nav.nextId));
        };
      } else {
        nextBtn.disabled = true;
      }
    }

    // Keyboard navigation (left/right arrows)
    try {
      // remove any previously-registered handler to avoid duplicates
      try { if (window._sheepDetailKeyHandler) { window.removeEventListener('keydown', window._sheepDetailKeyHandler); } } catch (e) { }
      const keyHandler = (ev) => {
        if (ev.key === 'ArrowLeft' && nav.prevId) {
          const params = new URLSearchParams(window.location.search);
          const tabP = params.get('tab') ? `&tab=${encodeURIComponent(params.get('tab'))}` : ((_currentTab && _currentTab !== 'all') ? `&tab=${encodeURIComponent(_currentTab)}` : '');
          navigateWithFade(buildDetailLink(nav.prevId));
        }
        if (ev.key === 'ArrowRight' && nav.nextId) {
          const params = new URLSearchParams(window.location.search);
          const tabP = params.get('tab') ? `&tab=${encodeURIComponent(params.get('tab'))}` : ((_currentTab && _currentTab !== 'all') ? `&tab=${encodeURIComponent(_currentTab)}` : '');
          navigateWithFade(buildDetailLink(nav.nextId));
        }
      };
      window._sheepDetailKeyHandler = keyHandler;
      window.addEventListener('keydown', keyHandler);
    } catch (e) { /* ignore keyboard wiring errors */ }
  } catch (e) { /* non-fatal */ }

  // Ensure the container fades in smoothly when page loads
  try {
    const container = document.querySelector('.container');
    if (container) {
      container.classList.add('page-fade');
      // force a reflow then add visible class to animate in
      requestAnimationFrame(() => { container.classList.add('page-visible'); });
    }
  } catch (e) { }

  // Populate page with sheep data and render status/bred/nursing badges by the title
  try {
    const titleEl = document.getElementById('sheepTitle') || document.querySelector('h1');
    if (titleEl) {
      // set base title
      titleEl.textContent = sheep.name || 'Unknown Sheep';
      // remove any existing detail badges we added previously
      Array.from(titleEl.querySelectorAll('.detail-badge')).forEach(n => n.remove());

      // --- Editable name UI wiring ---
      try {
        const editBtn = document.getElementById('editNameBtn');
        const nameInput = document.getElementById('nameInput');
        const nameEditWrap = document.getElementById('nameEdit');
        const saveNameBtn = document.getElementById('saveNameBtn');
        const cancelNameBtn = document.getElementById('cancelNameBtn');
        if (editBtn && nameInput && nameEditWrap) {
          // ensure initial visibility
          nameEditWrap.style.display = 'none';
          editBtn.addEventListener('click', (ev) => {
            ev.preventDefault();
            try {
              nameInput.value = sheep.name || '';
              nameEditWrap.style.display = 'flex';
              nameInput.focus();
              editBtn.style.display = 'none';
            } catch (e) { console.warn('editName click failed', e); }
          });
        }

        const persistNameChange = () => {
          const newName = (nameInput && String(nameInput.value || '').trim()) || '';
          if (!newName) return alert('Name cannot be empty.');
          const oldName = sheep.name || '';
          // If name didn't change, just close editor
          if (oldName === newName) {
            if (nameEditWrap) nameEditWrap.style.display = 'none';
            if (editBtn) editBtn.style.display = '';
            return;
          }

          sheep.name = newName;
          try { titleEl.textContent = newName; } catch (e) { }
          if (nameEditWrap) nameEditWrap.style.display = 'none';
          if (editBtn) editBtn.style.display = '';
          try {
            // persist primary sheep record
            localStorage.setItem(`sheep-${sheepId}`, JSON.stringify(sheep));

            // Update any other sheep records that referenced the old name in sire/dam or lambing.sire
            const all = getAllSheep() || [];
            let changed = 0;
            all.forEach(s => {
              try {
                let modified = false;
                // Update sire/dam fields that store parent's name (not id)
                if (s.sire && String(s.sire) === oldName) { s.sire = newName; modified = true; }
                if (s.dam && String(s.dam) === oldName) { s.dam = newName; modified = true; }

                // Update lambings entries that may have stored sire by name
                if (Array.isArray(s.lambings)) {
                  s.lambings.forEach(ev => {
                    try {
                      if (ev && ev.sire && String(ev.sire) === oldName) { ev.sire = newName; modified = true; }
                    } catch (e) { }
                  });
                }

                if (modified) {
                  try {
                    localStorage.setItem(`sheep-${s.id}`, JSON.stringify(s));
                    changed++;
                  } catch (e) { console.warn('Failed to persist updated offspring record', e); }
                }
              } catch (e) { /* ignore per-record errors */ }
            });

            // Refresh master list by syncing modified entries
            try {
              let list = JSON.parse(localStorage.getItem('sheepList') || '[]');
              // merge with latest scanned records
              const map = {};
              (getAllSheep() || []).forEach(s => { if (s && s.id) map[s.id] = s; });
              const merged = (list || []).map(m => Object.assign({}, m, map[m.id] || {}));
              // include any new/changed that weren't in master
              Object.keys(map).forEach(id => {
                if (!merged.find(x => x.id === id)) merged.push(map[id]);
              });
              localStorage.setItem('sheepList', JSON.stringify(merged));
            } catch (e) { /* ignore master list sync errors */ }

            try { updateAutoPedigree(sheepId); } catch (e) { }
            alert('Name updated.' + (changed ? (' Updated references in ' + changed + ' other records.') : ''));
          } catch (e) { console.warn(e); alert('Failed to update name. See console.'); }
        };

        if (saveNameBtn) saveNameBtn.addEventListener('click', (ev) => { ev.preventDefault(); persistNameChange(); });
        if (cancelNameBtn) cancelNameBtn.addEventListener('click', (ev) => { ev.preventDefault(); if (nameEditWrap) nameEditWrap.style.display = 'none'; if (editBtn) editBtn.style.display = ''; });
        if (nameInput) {
          nameInput.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); persistNameChange(); }
            if (ev.key === 'Escape') { ev.preventDefault(); if (nameEditWrap) nameEditWrap.style.display = 'none'; if (editBtn) editBtn.style.display = ''; }
          });
        }
      } catch (e) { console.warn('Editable name wiring failed', e); }
      // --- end editable name wiring ---

      // Helper to attach badge elements consistently
      const makeBadge = (cls, text, title) => {
        const b = document.createElement('span');
        b.className = `badge ${cls} detail-badge`;
        b.textContent = text;
        if (title) b.title = title;
        b.tabIndex = 0;
        b.style.cursor = 'pointer';
        b.addEventListener('click', (ev) => { ev.stopPropagation(); openQuickActions(sheep.id, b); });
        b.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); openQuickActions(sheep.id, b); } });
        return b;
      };

      // To-be-culled badge (if status indicates)
      try {
        const statusNorm = (sheep.status || '').toString().toLowerCase();
        const isToBeCulled = statusNorm === 'to-be-culled' || statusNorm === 'to be culled' || statusNorm === 'tobe-culled' || statusNorm === 'to_be_culled';
        if (isToBeCulled) {
          const tb = makeBadge('badge-to-be-culled', 'To be culled', 'Marked To Be Culled');
          titleEl.appendChild(tb);
          // subtle row highlight not needed here
        }
      } catch (e) { }

      // Bred badge
      try {
        const isEwe = (sheep.sex || '').toString().toLowerCase() === 'ewe';
        const hasBred = !!(sheep.bredDate || sheep.expectedDueDate);
        if (isEwe && hasBred) {
          const bredTitle = `Bred on ${sheep.bredDate ? formatDateLong(sheep.bredDate) : ''}`;
          const bb = makeBadge('badge-bred', 'Bred', bredTitle);
          titleEl.appendChild(bb);
          // Nursing badge: show if the sheep lambed within configured nursing window
          try {
            const summary = getSheepLambingSummary(sheep);
            if (summary && summary.lastDate) {
              const last = new Date(summary.lastDate);
              if (!isNaN(last)) {
                const diffDays = Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24));
                const windowDays = (typeof getNursingWindowDays === 'function') ? getNursingWindowDays() : 90;
                if (diffDays >= 0 && diffDays <= windowDays) {
                  const nb = makeBadge('badge-nursing', 'Nursing', `Lambed on ${formatDateLong(summary.lastDate)} (${diffDays} days ago)`);
                  titleEl.appendChild(nb);
                }
              }
            }
          } catch (e) { /* ignore nursing badge failures */ }
        }
      } catch (e) { }
    }
  } catch (e) { try { document.querySelector('h1').textContent = sheep.name || 'Unknown Sheep'; } catch (ee) { } }
  document.getElementById('breed').textContent = sheep.breed || 'N/A';
  const ageEl = document.getElementById('age');
  try {
    ageEl.textContent = getDisplayAge(sheep) || 'N/A';
  } catch (e) {
    ageEl.textContent = (sheep.birthDate ? computeAge(sheep.birthDate) : (sheep.age || 'N/A'));
  }
  document.getElementById('weight').textContent = sheep.weight ? sheep.weight + ' lbs' : 'N/A';
  const birthInput = document.getElementById('birthDate');
  if (birthInput) birthInput.value = sheep.birthDate || '';
  const dueSpan = document.getElementById('expectedDueDate');
  if (dueSpan) dueSpan.textContent = sheep.expectedDueDate ? formatDateLong(sheep.expectedDueDate) : 'N/A';
  // Update age and persist when birth date changes on detail page
  if (birthInput) {
    birthInput.addEventListener('change', () => {
      const val = birthInput.value;
      ageEl.textContent = val ? computeAge(val) : (sheep.age || 'N/A');
      sheep.birthDate = val;
      try { localStorage.setItem(`sheep-${sheepId}`, JSON.stringify(sheep)); } catch (e) { console.warn(e); }
    });
  }
  document.getElementById('notes').textContent = sheep.notes || '';
  // Populate new pedigree fields
  const sireInput = document.getElementById('sire');
  const damInput = document.getElementById('dam');
  if (sireInput) sireInput.value = sheep.sire || '';
  if (damInput) damInput.value = sheep.dam || '';

  // Ensure notes textarea uses value
  const notesEl = document.getElementById('notes');
  if (notesEl) notesEl.value = sheep.notes || '';

  // Populate sex input
  const sexInput = document.getElementById('sex');
  const statusInput = document.getElementById('status');
  if (sexInput) sexInput.value = sheep.sex || 'Unknown';
  if (statusInput) statusInput.value = sheep.status || 'active';

  // Save changes button (saves notes, sire, dam, pedigree)
  const saveBtn = document.getElementById('saveChanges');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (sireInput) sheep.sire = sireInput.value;
      if (damInput) sheep.dam = damInput.value;
      if (notesEl) sheep.notes = notesEl.value;
      // Warn if sex is blank to avoid accidental removal from sex-specific tabs.
      try {
        const sexVal = sexInput ? (sexInput.value || '').toString().trim() : '';
        if (!sexVal) {
          const proceed = confirm('Sex is blank. This may hide the animal from Active Ewes/Active Rams.\n\nClick OK to set Sex = "Unknown" and save, or Cancel to return and choose a Sex.');
          if (!proceed) return; // abort save so user can set sex
          sheep.sex = 'Unknown';
        } else {
          sheep.sex = sexVal;
        }
      } catch (e) { try { sheep.sex = (sexInput && sexInput.value) || 'Unknown'; } catch (ee) { sheep.sex = 'Unknown'; } }
      if (statusInput) {
        const newStatus = statusInput.value;
        try {
          if (newStatus === 'sold' && sheep.status !== 'sold') {
            try {
              // persist current non-status fields so changes to notes/pedigree/sex are not lost
              localStorage.setItem(`sheep-${sheepId}`, JSON.stringify(sheep));
              let list = JSON.parse(localStorage.getItem('sheepList') || '[]');
              const idx = list.findIndex(s => s.id === sheepId);
              if (idx !== -1) {
                list[idx] = Object.assign({}, list[idx], sheep);
              } else {
                list.push(sheep);
              }
              localStorage.setItem('sheepList', JSON.stringify(list));
            } catch (e) { console.warn('pre-save before sale modal failed', e); }

            // Open sale modal for single-animal sale (handles price entry, finance, and status)
            try {
              if (typeof openSaleModal === 'function') {
                openSaleModal([sheepId]);
                return; // modal workflow will handle status change and final save
              }
            } catch (e) { console.warn('openSaleModal failed', e); }

            // Fallback: if modal not available, leave status unchanged here
          } else {
            try { applySheepStatus(sheep, newStatus); } catch (e) { sheep.status = newStatus; }
          }
        } catch (e) { try { sheep.status = newStatus; } catch (ee) { } }
      }

      try {
        localStorage.setItem(`sheep-${sheepId}`, JSON.stringify(sheep));
        // update master list
        let list = JSON.parse(localStorage.getItem('sheepList') || '[]');
        const idx = list.findIndex(s => s.id === sheepId);
        if (idx !== -1) {
          // merge to preserve any other fields master may carry
          list[idx] = Object.assign({}, list[idx], sheep);
        } else {
          // add if missing
          list.push(sheep);
        }
        localStorage.setItem('sheepList', JSON.stringify(list));
        alert('Sheep saved!');
      } catch (e) {
        console.warn(e);
        alert('Unable to save sheep. See console.');
      }
    });
  }

  // Wire top Save button (if present) to trigger the primary save button's handler
  try {
    const saveTop = document.getElementById('saveChangesTop');
    if (saveTop) {
      saveTop.addEventListener('click', (ev) => {
        ev.preventDefault();
        try {
          if (saveBtn) {
            // reuse existing save handler to avoid duplication
            saveBtn.click();
          } else {
            // fallback: attempt to perform a minimal save of common fields
            if (sireInput) sheep.sire = sireInput.value;
            if (damInput) sheep.dam = damInput.value;
            if (notesEl) sheep.notes = notesEl.value;
            try { localStorage.setItem(`sheep-${sheepId}`, JSON.stringify(sheep)); } catch (e) { console.warn(e); }
            try {
              let list = JSON.parse(localStorage.getItem('sheepList') || '[]');
              const idx = list.findIndex(s => s.id === sheepId);
              if (idx !== -1) list[idx] = Object.assign({}, list[idx], sheep);
              else list.push(sheep);
              localStorage.setItem('sheepList', JSON.stringify(list));
            } catch (e) { /* ignore */ }
            alert('Sheep saved (fallback).');
          }
        } catch (e) { console.warn('Top Save failed', e); alert('Save failed. See console.'); }
      });
    }
  } catch (e) { /* ignore wiring errors */ }

  // Wire auto-pedigree updates
  const autoContainer = document.getElementById('autoPedigree');
  // initial render
  updateAutoPedigree(sheepId);
  if (sireInput) {
    sireInput.addEventListener('input', () => updateAutoPedigree(sheepId, { sire: sireInput.value }));
  }
  if (damInput) {
    damInput.addEventListener('input', () => updateAutoPedigree(sheepId, { dam: damInput.value }));
  }

  // Record Breeding button (detail page)
  try {
    const recordBtn = document.getElementById('recordBreedingBtn');
    if (recordBtn) {
      recordBtn.addEventListener('click', () => {
        openBreedingModal([sheepId], 'breeding');
      });
    }
  } catch (e) { }

  // Render lambing history only for ewes; render breeding history for all
  try {
    const sexVal = (sheep && sheep.sex || '').toString().toLowerCase();
    // prepare containers: inline breedingHistory (above button) and bottom breedingHistory
    try {
      const inlineBox = document.getElementById('breedingHistoryBox');
      const bottomBox = document.getElementById('breedingHistoryBottomBox');
      if (sexVal === 'ewe') {
        if (inlineBox) { inlineBox.style.display = ''; }
        if (bottomBox) { bottomBox.style.display = 'none'; }
        try { renderLambingHistory(sheep); } catch (e) { }
      } else if (sexVal === 'ram') {
        if (inlineBox) { inlineBox.style.display = 'none'; }
        if (bottomBox) { bottomBox.style.display = ''; }
        // hide lambing history for rams (hide inner lambing block)
        try { const lh = document.getElementById('lambingHistory'); if (lh) { lh.innerHTML = ''; lh.style.display = 'none'; } } catch (e) { }
      } else {
        // default: show inline, hide bottom
        if (inlineBox) { inlineBox.style.display = ''; }
        if (bottomBox) { bottomBox.style.display = 'none'; }
      }
    } catch (e) { }
  } catch (e) { }
  try { renderBreedingHistory(sheep); } catch (e) { }
  // Render weight-history UI and chart (no external libs)
  try { renderWeightsPanel(sheep, sheepId); } catch (e) { console.warn('renderWeightsPanel failed', e); }
}

// Weight history helpers (store as sheep.weights = [{date:'YYYY-MM-DD', weight: Number}, ...])
function renderWeightsPanel(sheep, sheepId) {
  try {
    const panel = document.getElementById('weightsPanel');
    if (!panel) return;
    const listEl = document.getElementById('weightsList');
    const dateInp = document.getElementById('weightDateInput');
    const weightInp = document.getElementById('weightValueInput');
    const addBtn = document.getElementById('addWeightBtn');
    const clearBtn = document.getElementById('clearWeightsBtn');

    sheep.weights = Array.isArray(sheep.weights) ? sheep.weights.slice() : [];

    const renderList = () => {
      if (!listEl) return;
      if (!sheep.weights || !sheep.weights.length) {
        listEl.innerHTML = '<div style="color:#666;">No weight records yet.</div>';
        drawWeightChart('weightChart', []);
        return;
      }
      // show most recent first
      const rows = sheep.weights.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      listEl.innerHTML = '';
      rows.forEach((w, idx) => {
        const r = document.createElement('div');
        r.style.display = 'flex';
        r.style.justifyContent = 'space-between';
        r.style.alignItems = 'center';
        r.style.padding = '6px 0';
        r.style.borderBottom = '1px solid #f6f6f6';
        const left = document.createElement('div');
        left.textContent = `${w.date || 'Unknown'} — ${w.weight != null ? w.weight + ' lbs' : 'N/A'}`;
        const right = document.createElement('div');
        right.style.display = 'flex'; right.style.gap = '8px';
        const edit = document.createElement('button'); edit.className = 'button'; edit.textContent = 'Edit';
        const del = document.createElement('button'); del.className = 'button button-cancel'; del.textContent = 'Delete';
        edit.addEventListener('click', () => {
          dateInp.value = w.date || '';
          weightInp.value = w.weight != null ? String(w.weight) : '';
          addBtn.textContent = 'Update';
          addBtn.dataset.editIndex = String(idx);
        });
        del.addEventListener('click', () => {
          if (!confirm('Delete this weight entry?')) return;
          // find actual index in sheep.weights (they may be unsorted)
          const actualIdx = sheep.weights.findIndex(x => x.date === w.date && String(x.weight) === String(w.weight));
          if (actualIdx !== -1) sheep.weights.splice(actualIdx, 1);
          saveSheepWeightsToStorage(sheepId, sheep);
          renderList();
        });
        right.appendChild(edit); right.appendChild(del);
        r.appendChild(left); r.appendChild(right);
        listEl.appendChild(r);
      });
      // redraw chart with chrono order
      const chartData = sheep.weights.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      drawWeightChart('weightChart', chartData);
    };

    // Add / Update button
    addBtn.onclick = () => {
      const d = dateInp.value;
      const wv = weightInp.value;
      if (!d) return alert('Please choose a date for the weight.');
      const num = parseFloat(String(wv || '').replace(/[^0-9.\-]/g, ''));
      if (isNaN(num)) return alert('Please enter a numeric weight.');
      // If in edit mode
      if (addBtn.dataset && addBtn.dataset.editIndex) {
        const editIndex = parseInt(addBtn.dataset.editIndex, 10);
        if (!isNaN(editIndex) && sheep.weights[editIndex]) {
          sheep.weights[editIndex].date = d;
          sheep.weights[editIndex].weight = num;
        } else {
          // fallback: push
          sheep.weights.push({ date: d, weight: num });
        }
        delete addBtn.dataset.editIndex;
        addBtn.textContent = 'Add Weight';
      } else {
        sheep.weights.push({ date: d, weight: num });
      }
      // normalize: sort by date ascending
      sheep.weights.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      saveSheepWeightsToStorage(sheepId, sheep);
      // clear inputs
      dateInp.value = '';
      weightInp.value = '';
      renderList();
    };

    clearBtn.onclick = () => {
      if (!confirm('Clear ALL weight entries for this animal?')) return;
      sheep.weights = [];
      saveSheepWeightsToStorage(sheepId, sheep);
      renderList();
    };

    // initial render
    renderList();
  } catch (e) { console.warn('renderWeightsPanel error', e); }
}

function saveSheepWeightsToStorage(sheepId, sheep) {
  try {
    localStorage.setItem(`sheep-${sheepId}`, JSON.stringify(sheep));
    // update master list
    let list = JSON.parse(localStorage.getItem('sheepList') || '[]');
    const idx = list.findIndex(s => s.id === sheepId);
    if (idx !== -1) {
      list[idx] = Object.assign({}, list[idx], sheep);
    } else {
      list.push(sheep);
    }
    localStorage.setItem('sheepList', JSON.stringify(list));
  } catch (e) { console.warn('saveSheepWeightsToStorage failed', e); }
}

// Lightweight canvas line chart for weight over time (no external libs)
function drawWeightChart(canvasId, weights) {
  try {
    const cvs = document.getElementById(canvasId);
    if (!cvs || !cvs.getContext) return;
    const ctx = cvs.getContext('2d');
    // Resize canvas to match CSS width for crispness
    const rect = cvs.getBoundingClientRect();
    cvs.width = Math.max(300, Math.floor(rect.width * (window.devicePixelRatio || 1)));
    cvs.height = Math.max(120, Math.floor(rect.height * (window.devicePixelRatio || 1) || 240));
    // simple redraw with devicePixelRatio scaling
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // clear
    ctx.clearRect(0, 0, cvs.width / dpr, cvs.height / dpr);
    const w = cvs.width / dpr;
    const h = cvs.height / dpr;
    // padding
    const pad = { left: 40, right: 12, top: 12, bottom: 28 };

    if (!weights || weights.length === 0) {
      // show placeholder
      ctx.fillStyle = '#666'; ctx.font = '14px sans-serif'; ctx.fillText('No weight data to chart', pad.left, h / 2);
      return;
    }

    // parse dates and values
    const pts = weights.map(wt => ({ x: new Date(wt.date).getTime() || 0, y: (typeof wt.weight === 'number' ? wt.weight : parseFloat(String(wt.weight || '') || 0)) }));
    // filter invalid
    const valid = pts.filter(p => p.x && !isNaN(p.y));
    if (!valid.length) { ctx.fillStyle = '#666'; ctx.font = '14px sans-serif'; ctx.fillText('Insufficient numeric weight data', pad.left, h / 2); return; }
    valid.sort((a, b) => a.x - b.x);
    const xs = valid.map(p => p.x);
    const ys = valid.map(p => p.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs);
    const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const yRange = (maxY - minY) || 1;
    const xRange = (maxX - minX) || 1;

    // draw grid lines
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; ctx.beginPath();
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const yy = pad.top + ((h - pad.top - pad.bottom) * i / gridLines);
      ctx.moveTo(pad.left, yy); ctx.lineTo(w - pad.right, yy);
    }
    ctx.stroke();

    // axes labels
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'; ctx.textAlign = 'right';
    // Y axis ticks
    for (let i = 0; i <= gridLines; i++) {
      const v = (maxY - (yRange * i / gridLines));
      const yy = pad.top + ((h - pad.top - pad.bottom) * i / gridLines);
      ctx.fillText(String(Math.round(v * 10) / 10), pad.left - 6, yy + 4);
    }
    // X axis labels (first, mid, last)
    ctx.textAlign = 'center'; ctx.font = '11px sans-serif'; ctx.fillStyle = '#333';
    const labelY = h - 8;
    const datesToShow = [minX, Math.round((minX + maxX) / 2), maxX];
    datesToShow.forEach((dt, i) => {
      const x = pad.left + (((dt - minX) / xRange) * (w - pad.left - pad.right));
      const d = new Date(dt);
      ctx.fillText(d.toISOString().slice(0, 10), x, labelY);
    });

    // plot line
    ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = '#007acc'; ctx.fillStyle = '#007acc';
    valid.forEach((p, i) => {
      const x = pad.left + ((p.x - minX) / xRange) * (w - pad.left - pad.right);
      const y = pad.top + ((maxY - p.y) / yRange) * (h - pad.top - pad.bottom);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // draw points
    valid.forEach(p => {
      const x = pad.left + ((p.x - minX) / xRange) * (w - pad.left - pad.right);
      const y = pad.top + ((maxY - p.y) / yRange) * (h - pad.top - pad.bottom);
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });
  } catch (e) { console.warn('drawWeightChart failed', e); }
}

window.addEventListener('DOMContentLoaded', () => {
  displayReports();
  if (document.getElementById('reportControls')) {
    initReports();
  }
});
