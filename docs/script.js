// Auto-sync helper: wrap localStorage.setItem to detect sheep data changes
try {
  (function () {
    const _origSetItem = Storage.prototype.setItem;
    let _shareDebounceTimer = null;
    function _maybeScheduleShare(key) {
      try {
        if (!key) return;
        const k = String(key);
        if (!(k.indexOf('sheep-') === 0 || k === 'sheepList')) return;
        if (localStorage.getItem('shareLanAuto') !== '1') return;
        if (typeof shareDataToLAN !== 'function') return;
        clearTimeout(_shareDebounceTimer);
        _shareDebounceTimer = setTimeout(() => {
          try { shareDataToLAN({ silent: true, retries: 3 }); } catch (e) { console.warn('Auto-sync shareDataToLAN failed', e); }
        }, 1200);
      } catch (e) { /* ignore */ }
    }
    Storage.prototype.setItem = function (key, value) {
      _origSetItem.apply(this, arguments);
      try {
        try {
          const k = key && String(key);
          if (k && (k.indexOf('sheep-') === 0 || k === 'sheepList')) {
            try { console.debug && console.debug('localStorage.setItem ->', k, value); } catch (e) { }
          }
        } catch (ee) { }
        _maybeScheduleShare(key);
      } catch (e) { /* ignore */ }
    };
  })();
} catch (e) { console.warn('Failed to install localStorage wrapper', e); }

// Save notes for individual sheep
// Polyfill for crypto.randomUUID() for older browsers/environments
(function () {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function') {
      crypto.randomUUID = function () {
        try {
          const getRandom = (crypto && typeof crypto.getRandomValues === 'function')
            ? (arr => crypto.getRandomValues(arr))
            : (arr => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; });
          const arr = new Uint8Array(16);
          getRandom(arr);
          arr[6] = (arr[6] & 0x0f) | 0x40;
          arr[8] = (arr[8] & 0x3f) | 0x80;
          const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
          return `${hex.substr(0, 8)}-${hex.substr(8, 4)}-${hex.substr(12, 4)}-${hex.substr(16, 4)}-${hex.substr(20, 12)}`;
        } catch (e) {
          // fallback to simple RNG string (not cryptographically strong)
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
          });
        }
      };
    }
  } catch (e) { /* ignore polyfill failures */ }
})();

// Convert many common date formats to ISO `YYYY-MM-DD` for inputs.
function toIsoDate(value) {
  try {
    if (!value) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    // handle timestamps
    if (!isNaN(Number(value))) {
      const d = new Date(Number(value));
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    // try parsing natural formats
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch (e) { }
  return '';
}

// On first load, normalize all stored weight dates to ISO (YYYY-MM-DD)
function normalizeAllWeightDates() {
  try {
    const all = getAllSheep() || [];
    let changed = 0;
    all.forEach(s => {
      try {
        if (!s || !s.id) return;
        let mutated = false;
        // normalize weight entries
        if (Array.isArray(s.weights)) {
          s.weights = s.weights.map(w => {
            try {
              if (!w || !w.date) return w;
              const nd = toIsoDate(w.date);
              if (nd && nd !== w.date) { mutated = true; return Object.assign({}, w, { date: nd }); }
            } catch (e) { }
            return w;
          });
        }
        // normalize common date fields
        try {
          const bd = toIsoDate(s.birthDate);
          if (bd && bd !== (s.birthDate || '')) { s.birthDate = bd; mutated = true; }
        } catch (e) { }
        try {
          const br = toIsoDate(s.bredDate);
          if (br && br !== (s.bredDate || '')) { s.bredDate = br; mutated = true; }
        } catch (e) { }
        try {
          const ed = toIsoDate(s.expectedDueDate);
          if (ed && ed !== (s.expectedDueDate || '')) { s.expectedDueDate = ed; mutated = true; }
        } catch (e) { }
        // normalize lambing entries if present
        try {
          if (Array.isArray(s.lambings)) {
            s.lambings = s.lambings.map(ev => {
              try {
                if (!ev) return ev;
                const d1 = toIsoDate(ev.date || ev.birthDate || ev.born);
                if (d1 && d1 !== (ev.date || ev.birthDate || ev.born || '')) {
                  mutated = true;
                  const copy = Object.assign({}, ev);
                  if (ev.date) copy.date = d1; else if (ev.birthDate) copy.birthDate = d1; else if (ev.born) copy.born = d1;
                  return copy;
                }
              } catch (e) { }
              return ev;
            });
          }
        } catch (e) { }
        if (mutated) {
          try { localStorage.setItem('sheep-' + s.id, JSON.stringify(s)); changed++; } catch (e) { }
        }
      } catch (e) { }
    });
    if (changed) console.info(`Normalized weight dates for ${changed} sheep records.`);
  } catch (e) { console.warn('normalizeAllWeightDates failed', e); }
}

try { normalizeAllWeightDates(); } catch (e) { }
// One-time migration: add dated weight entries (2025-12-18) for current `weight` values
function addDatedWeightsForCurrent(dateIso) {
  try {
    if (!dateIso) return;
    const all = getAllSheep() || [];
    let changed = 0;
    all.forEach(s => {
      try {
        if (!s || !s.id) return;
        const current = (s.weight !== undefined && s.weight !== null && s.weight !== '') ? Number(s.weight) : null;
        if (current === null || isNaN(current)) return;
        s.weights = Array.isArray(s.weights) ? s.weights.slice() : [];
        const exists = s.weights.some(w => (w && (w.date || '')) === dateIso && Number(w.weight) === current);
        if (!exists) {
          s.weights.push({ date: dateIso, weight: current });
          s.weights.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
          try {
            if (typeof saveSheepRecord === 'function') saveSheepRecord(s);
            else {
              localStorage.setItem('sheep-' + s.id, JSON.stringify(s));
              try {
                const master = JSON.parse(localStorage.getItem('sheepList') || '[]');
                const idx = master.findIndex(x => x && x.id === s.id);
                if (idx !== -1) master[idx] = Object.assign({}, master[idx] || {}, s);
                else master.push(s);
                localStorage.setItem('sheepList', JSON.stringify(master));
              } catch (e) { }
              try { window.dispatchEvent(new CustomEvent('sheep-updated', { detail: { id: String(s.id) } })); } catch (e) { }
            }
          } catch (e) { }
          changed++;
        }
      } catch (e) { }
    });
    if (changed) console.info(`Migration: added dated weight entries (${dateIso}) for ${changed} sheep.`);
  } catch (e) { console.warn('addDatedWeightsForCurrent failed', e); }
}

try {
  const flag = 'migration.addDatedWeights.2025-12-18';
  if (!localStorage.getItem(flag)) {
    try { addDatedWeightsForCurrent('2025-12-18'); } catch (e) { }
    try { localStorage.setItem(flag, '1'); } catch (e) { }
  }
} catch (e) { }

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
        // normalize weight representations so UI shows consistent numeric values
        try {
          normalizeSheepWeights(s);
        } catch (e) { }
        if (s && (!s.id || s.id === '')) {
          try { s.id = key.slice(6); } catch (e) { /* ignore */ }
        }
        if (s) out.push(s);
      } catch (e) { /* ignore parse errors */ }
    }
  }
  return out;
}

// Ensure `s.weights` entries have numeric `weight` and set `s.weight` to latest numeric if possible
function normalizeSheepWeights(s) {
  if (!s) return;
  try {
    if (Array.isArray(s.weights) && s.weights.length) {
      s.weights = s.weights.map(w => {
        if (!w) return null;
        const date = w.date || w.d || '';
        let wt = (w.weight !== undefined && w.weight !== null && w.weight !== '') ? w.weight : (w.w !== undefined ? w.w : undefined);
        if (wt !== undefined && wt !== null && String(wt).trim() !== '') {
          const n = Number(String(wt).replace(/[^0-9.\-]/g, ''));
          if (!isNaN(n)) wt = n; else {
            const p = parseFloat(String(wt)); if (!isNaN(p)) wt = p;
          }
        }
        return (date || wt !== undefined) ? { date: String(date || ''), weight: wt } : null;
      }).filter(Boolean);
      if (s.weights.length) {
        const parsed = s.weights.map(w => ({ d: w.date ? new Date(w.date) : null, wt: (w.weight !== undefined && w.weight !== null && w.weight !== '') ? Number(w.weight) : NaN })).filter(p => p && p.d && !isNaN(p.d.getTime()) && !isNaN(p.wt));
        if (parsed.length) {
          parsed.sort((a, b) => b.d.getTime() - a.d.getTime());
          s.weight = parsed[0].wt;
        }
      }
    } else if (s.weight !== undefined && s.weight !== null && String(s.weight).trim() !== '') {
      const n = Number(String(s.weight).replace(/[^0-9.\-]/g, ''));
      if (!isNaN(n)) s.weight = n; else {
        const p = parseFloat(String(s.weight)); if (!isNaN(p)) s.weight = p;
      }
    }
  } catch (e) { /* non-fatal */ }
}

// Expose helpers for diagnostics and bulk normalization
function inspectSheep(id) {
  try {
    if (!id) return null;
    const raw = localStorage.getItem(`sheep-${id}`);
    if (!raw) return null;
    const s = JSON.parse(raw);
    // provide a concise view
    return {
      id: s.id || id,
      weight: s.weight !== undefined ? s.weight : null,
      weights: Array.isArray(s.weights) ? s.weights.slice() : (s.weights ? s.weights : null),
      bredDate: s.bredDate || s.breedingDate || null,
      status: s.status || null
    };
  } catch (e) { return { error: String(e) }; }
}

function normalizeAndPersistAllSheepWeights() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.indexOf('sheep-') === 0) keys.push(k);
  }
  let written = 0;
  keys.forEach(k => {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return;
      const s = JSON.parse(raw);
      normalizeSheepWeights(s);
      localStorage.setItem(k, JSON.stringify(s));
      written++;
    } catch (e) { }
  });
  return { normalized: written };
}

try { window.inspectSheep = inspectSheep; window.normalizeAndPersistAllSheepWeights = normalizeAndPersistAllSheepWeights; } catch (e) { }

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
  try { if (typeof toggleLambAgeHolderVisibility === 'function') try { toggleLambAgeHolderVisibility(); } catch (e) { } } catch (e) { }
  try { if (typeof toggleLambAgeVisibility === 'function') try { toggleLambAgeVisibility(); } catch (e) { } } catch (e) { }
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
  // Allow an explicit manual override to treat an animal as no longer a lamb
  try { if (sheep._matured) return false; } catch (e) { }
  // Also honor automatic maturation marker set by lamb-age threshold adjustments
  try { if (sheep._autoMatured) return false; } catch (e) { }
  const bd = new Date(sheep.birthDate);
  if (isNaN(bd)) return false;
  const now = new Date();

  // Render a small summary (charts/goals) above the report table. Non-fatal.
  try { renderReportSummary(sheep); } catch (e) { console.warn('renderReportSummary failed', e); }
  const months = (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth());
  // Use configurable threshold (in months) stored in localStorage as 'lambAgeMonths'.
  // Default to 8 months if setting is missing or invalid.
  let threshold = 8;
  try { threshold = parseInt(localStorage.getItem('lambAgeMonths') || '8', 10); if (isNaN(threshold) || threshold < 0) threshold = 8; } catch (e) { threshold = 8; }
  return months < threshold;
}



// Restore all sheep records to their state at `ref` (Date, ISO string, or timestamp).

// Returns an object with counts by tab.


function matchesTab(sheep, tabId) {
  // If no tab specified, be permissive. When tab === 'all' we intentionally
  // only show active animals (exclude archived/sold/culled) so the 'All'
  // view remains useful for day-to-day operations.
  if (!tabId) return true;
  if (tabId === 'all') {
    // Treat 'All' as the active-ewes view per user request: show only active ewes (include lambs)
    const status = String(sheep.status || '').trim();
    const sex = String(sheep.sex || '').trim().toLowerCase();
    return isActiveStatus(status) && (sex === 'ewe' || sex === '' || sex === 'unknown');
  }
  const status = String(sheep.status || '').trim();
  const sex = String(sheep.sex || '').trim().toLowerCase();
  switch (tabId) {
    case 'active-ewes':
      // Show active ewes, excluding lambs so age-threshold adjustments
      // correctly move animals out of/into this tab.
      // Treat missing or unknown sex as ewes for listing convenience
      try { return isActiveStatus(status) && (sex === 'ewe' || sex === '' || sex === 'unknown') && !isLamb(sheep); } catch (e) { return isActiveStatus(status) && (sex === 'ewe' || sex === '' || sex === 'unknown'); }
    case 'active-rams':
      // Show active rams, excluding lambs so age-threshold adjustments
      // correctly move animals out of/into this tab.
      try { return isActiveStatus(status) && sex === 'ram' && !isLamb(sheep); } catch (e) { return isActiveStatus(status) && sex === 'ram'; }
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
    case 'color':
      return dir * String((a.color || '')).localeCompare(String((b.color || '')));
    case 'tagType':
      return dir * String((a.tagType || '')).localeCompare(String((b.tagType || '')));
    case 'sire':
      return dir * String((a.sire || '')).localeCompare(String((b.sire || '')));
    case 'dam':
      return dir * String((a.dam || '')).localeCompare(String((b.dam || '')));
    case 'sex':
      return dir * String((a.sex || '')).localeCompare(String((b.sex || '')));
    case 'weight':
      {
        const getLatest = (s) => {
          try {
            if (s && Array.isArray(s.weights) && s.weights.length) {
              const parsed = s.weights.map(w => {
                const d = w && w.date ? new Date(w.date) : null;
                const wt = (w && w.weight !== undefined && w.weight !== null && w.weight !== '') ? parseFloat(String(w.weight)) : NaN;
                return { d, wt };
              }).filter(p => p && p.d && !isNaN(p.d.getTime()));
              if (parsed.length) {
                parsed.sort((x, y) => y.d.getTime() - x.d.getTime());
                return !isNaN(parsed[0].wt) ? parsed[0].wt : 0;
              }
            }
          } catch (e) { }
          return parseFloat(s && s.weight) || 0;
        };
        const wa = getLatest(a);
        const wb = getLatest(b);
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
        // Compare expected due dates using centralized inference helper.
        const da = (typeof getSheepExpectedDue === 'function') ? getSheepExpectedDue(a) : (a.expectedDueDate || a.nextDue || a.dueDate || null);
        const db = (typeof getSheepExpectedDue === 'function') ? getSheepExpectedDue(b) : (b.expectedDueDate || b.nextDue || b.dueDate || null);
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
        const daRaw = (typeof getSheepExpectedDue === 'function') ? getSheepExpectedDue(a) : (a.expectedDueDate || null);
        const dbRaw = (typeof getSheepExpectedDue === 'function') ? getSheepExpectedDue(b) : (b.expectedDueDate || null);
        const da = daRaw ? new Date(daRaw).getTime() : Infinity;
        const db = dbRaw ? new Date(dbRaw).getTime() : Infinity;
        const va = (isFinite(da) ? Math.max(0, Math.ceil((da - now) / (1000 * 60 * 60 * 24))) : Infinity);
        const vb = (isFinite(db) ? Math.max(0, Math.ceil((db - now) / (1000 * 60 * 60 * 24))) : Infinity);
        return dir * (va - vb);
      }
    case 'daysPost':
      {
        // days since last lambing (if last lambing date known)
        const sa = getSheepLambingSummary(a).lastDate ? new Date(getSheepLambingSummary(a).lastDate).getTime() : -Infinity;
        const sb = getSheepLambingSummary(b).lastDate ? new Date(getSheepLambingSummary(b).lastDate).getTime() : -Infinity;
        const refMs = Date.now();
        const ta = (isFinite(sa) && sa !== -Infinity) ? Math.floor((refMs - sa) / (1000 * 60 * 60 * 24)) : Infinity;
        const tb = (isFinite(sb) && sb !== -Infinity) ? Math.floor((refMs - sb) / (1000 * 60 * 60 * 24)) : Infinity;
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

// Populate the shared sheep datalist used by finance UIs
function populateSheepDatalist() {
  try {
    const list = JSON.parse(localStorage.getItem('sheepList') || '[]') || [];
    const dl = document.getElementById('sheepList');
    if (!dl) return;
    dl.innerHTML = '';
    (list || []).forEach(s => {
      try {
        const name = (s && s.name) ? s.name : (s && s.id) ? s.id : '';
        const id = (s && s.id) ? s.id : '';
        const val = name ? (name + ' — ' + id) : id;
        const opt = document.createElement('option');
        opt.value = val;
        dl.appendChild(opt);
      } catch (e) { }
    });
  } catch (e) { }
}

try { window.addEventListener('DOMContentLoaded', populateSheepDatalist); } catch (e) { }

// Abbreviate tag types for compact displays
function getTagTypeAbbrev(tag) {
  if (!tag) return '';
  try {
    const t = String(tag).trim();
    if (!t) return '';
    const lower = t.toLowerCase();
    if (lower === 'square') return 'Sq';
    if (lower === 'long') return 'L';
    if (lower === 'custom') return 'C';
    if (lower === 'other') return 'Oth';
    return t;
  } catch (e) { return String(tag); }
}

// Format a sheep name combined with abbreviated tag type. Accepts either a
// sheep object or a name/id string (will attempt to resolve object by name/id).
function formatNameWithTag(objOrName) {
  try {
    if (!objOrName) return '';
    // If passed a string, try to resolve to a sheep record
    if (typeof objOrName === 'string') {
      const raw = objOrName || '';
      const rec = (typeof findSheepByNameOrId === 'function') ? findSheepByNameOrId(raw) : null;
      if (rec && rec.tagType) return `${escapeHtml(raw)} / ${escapeHtml(getTagTypeAbbrev(rec.tagType))}`;
      return escapeHtml(raw);
    }
    // If it's an object record
    const name = objOrName.name || objOrName.id || '';
    if (!name) return '';
    if (objOrName.tagType) return `${escapeHtml(name)} / ${escapeHtml(getTagTypeAbbrev(objOrName.tagType))}`;
    return escapeHtml(name);
  } catch (e) { return '' + (typeof objOrName === 'string' ? objOrName : (objOrName && (objOrName.name || objOrName.id) || '')); }
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

// Infer the expected due date for a sheep from various fields (arrays/CSV supported)
// Returns an ISO date string (YYYY-MM-DD) or null if not found.
function getSheepExpectedDue(s) {
  if (!s) return null;
  const gather = (obj) => {
    const out = [];
    const pushVal = (v) => {
      if (v === undefined || v === null) return;
      if (Array.isArray(v)) v.forEach(x => x && out.push(x));
      else if (typeof v === 'string') {
        if (v.indexOf(',') !== -1 || v.indexOf(';') !== -1) v.split(/[,;]+/).map(x => x.trim()).forEach(x => x && out.push(x));
        else out.push(v);
      } else out.push(v);
    };
    pushVal(obj.expectedDueDate); pushVal(obj.expectedDueDates); pushVal(obj.nextDue); pushVal(obj.dueDate); pushVal(obj.dueDates); pushVal(obj.due); pushVal(obj.expected);
    return out;
  };
  try {
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
    if (dueDate && !isNaN(dueDate.getTime())) return dueDate.toISOString().slice(0, 10);
  } catch (e) { }
  return null;
}

// Return latest numeric weight for a sheep (prefers dated entries in `weights`), or null if none.
function getSheepLatestWeight(s) {
  try {
    if (s && Array.isArray(s.weights) && s.weights.length) {
      const parsed = s.weights.map(w => {
        const d = w && w.date ? new Date(w.date) : null;
        const wt = (w && w.weight !== undefined && w.weight !== null && w.weight !== '') ? parseFloat(String(w.weight)) : NaN;
        return { d, wt };
      }).filter(p => p && p.d && !isNaN(p.d.getTime()));
      if (parsed.length) {
        parsed.sort((x, y) => y.d.getTime() - x.d.getTime());
        return !isNaN(parsed[0].wt) ? parsed[0].wt : (s.weight !== undefined ? parseFloat(s.weight) : null);
      }
    }
  } catch (e) { }
  return (s && s.weight !== undefined && s.weight !== null && s.weight !== '') ? parseFloat(s.weight) : null;
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
        const color = cell.node.color || cell.node.colour || '';
        const colorHtml = color ? `<div class="pedigree-color">${escapeHtml(color)}</div>` : '';
        // render as a button so navigation is handled by JS and looks like a link
        html += `<div class="pedigree-box"><button type="button" class="detail-link" data-id="${id}">${name}</button>${colorHtml}</div>`;
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

// Centralized colour options used across pages. Render selects from this list
const SHEEP_COLOR_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: 'Black', label: 'Black' },
  { value: 'Black and White', label: 'Black and White' },
  { value: 'Brown and White', label: 'Brown and White' },
  { value: 'White and Brown', label: 'White and Brown' },
  { value: 'Chocolate Brown', label: 'Chocolate Brown' },
  { value: 'Dark Brown', label: 'Dark Brown' },
  { value: 'Light Brown', label: 'Light Brown' },
  { value: 'Tan', label: 'Tan' },
  { value: 'Med Brown', label: 'Med Brown' },
  { value: 'Red', label: 'Red' },
  { value: 'Red Roan', label: 'Red Roan' },
  { value: 'Red and White', label: 'Red and White' },
  { value: 'White', label: 'White' },
  { value: 'White with Brown Speckles', label: 'White with Brown Speckles' },
  { value: 'White with Tricolour Speckles', label: 'White with Tricolour Speckles' },
  { value: 'White with Red Speckles', label: 'White with Red Speckles' },
  { value: 'White with Red Spots', label: 'White with Red Spots' },
  { value: 'White Speckled Black', label: 'White Speckled Black' },
  { value: 'White Speckled Brown', label: 'White Speckled Brown' },
  { value: 'White Speckled Red', label: 'White Speckled Red' },
  { value: 'Brown Speckled White', label: 'Brown Speckled White' },
  { value: 'White Darkening', label: 'White Darkening' },
  { value: '__other__', label: 'Other — enter...' }
];

// Centralized tag type options used for ear/tag shape/type
const SHEEP_TAG_TYPE_OPTIONS = [
  { value: '', label: 'Unknown' },
  { value: 'Square', label: 'Square' },
  { value: 'Long', label: 'Long' },
  { value: 'Custom', label: 'Custom' },
  { value: 'Other', label: 'Other' }
];

// Populate any `<select id="sheepColor">` elements with the centralized list
function initColorSelects() {
  try {
    const sels = Array.from(document.querySelectorAll('select#sheepColor, select#sheepColorDetail, select#be_colour'));
    sels.forEach(sel => {
      // remember current selection
      const prev = sel.value;
      // clear existing options
      sel.innerHTML = '';
      SHEEP_COLOR_OPTIONS.forEach(opt => {
        const o = document.createElement('option');
        if (opt.value !== undefined) o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
      // restore previous if present otherwise leave default
      try { if (prev) sel.value = prev; } catch (e) { }

      // wire Other behaviour: toggle nearby input with id 'sheepColorOther'
      sel.addEventListener('change', (ev) => {
        try {
          const val = sel.value;
          // find a sibling input with id sheepColorOther in same form or container
          let other = null;
          try { other = sel.form ? sel.form.querySelector('#sheepColorOther') : sel.parentNode.querySelector('#sheepColorOther'); } catch (e) { }
          if (!other) {
            // fallback: search document for first matching id
            other = document.getElementById('sheepColorOther');
          }
          if (other) other.style.display = (val === '__other__') ? '' : 'none';
        } catch (e) { }
      });

      // trigger visibility on load
      try { const ev = new Event('change'); sel.dispatchEvent(ev); } catch (e) { }
    });
  } catch (e) { /* ignore on pages without selects */ }
}

// ensure selects are initialized on DOM ready
try { window.addEventListener('DOMContentLoaded', initColorSelects); } catch (e) { }
try { window.SHEEP_COLOR_OPTIONS = SHEEP_COLOR_OPTIONS; } catch (e) { }
try { window.SHEEP_TAG_TYPE_OPTIONS = SHEEP_TAG_TYPE_OPTIONS; } catch (e) { }

// Populate any `<select id="sheepTagType">` or `<select id="be_tag_type">` elements
function initTagTypeSelects() {
  try {
    const sels = Array.from(document.querySelectorAll('select#sheepTagType, select#be_tag_type'));
    sels.forEach(sel => {
      const prev = sel.value;
      sel.innerHTML = '';
      SHEEP_TAG_TYPE_OPTIONS.forEach(opt => {
        const o = document.createElement('option');
        if (opt.value !== undefined) o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });
      try { if (prev) sel.value = prev; } catch (e) { }
    });
  } catch (e) { /* ignore on pages without selects */ }
}
try { window.addEventListener('DOMContentLoaded', initTagTypeSelects); } catch (e) { }

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

  // Before rendering, for any column that appears to be a Name/Sire/Dam column,
  // combine the displayed name with the sheep's `tagType` when available.
  try {
    const nameLikeIndices = [];
    columns.forEach((c, idx) => {
      try {
        if (/\bName\b/i.test(c) || /\bSire\b/i.test(c) || /\bDam\b/i.test(c) || /Name\/Tag/i.test(c)) nameLikeIndices.push(idx);
      } catch (e) { }
    });
    if (nameLikeIndices.length && Array.isArray(rows)) {
      // create a shallow copy of rows so caller data isn't mutated
      for (let ri = 0; ri < rows.length; ri++) {
        try {
          const row = rows[ri];
          if (!Array.isArray(row)) continue;
          nameLikeIndices.forEach(ci => {
            try {
              const raw = String(row[ci] || '').trim();
              if (!raw) return;
              // try to resolve a sheep record by name or id
              const rec = (typeof findSheepByNameOrId === 'function') ? findSheepByNameOrId(raw) : null;
              if (rec && rec.tagType) {
                row[ci] = `${escapeHtml(raw)} / ${escapeHtml(getTagTypeAbbrev(rec.tagType))}`;
              }
            } catch (e) { }
          });
        } catch (e) { }
      }
    }
  } catch (e) { }

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
  const closeBtns = Array.from(document.querySelectorAll('.modal-close'));

  // continue initialization even if some index-only elements are missing

  // Open modal on button click (guarded in case the page omits the direct add button)
  if (addBtn) {
    addBtn.addEventListener('click', (e) => {
      try { setBulkMode(true); } catch (err) { }
      if (modal) {
        modal.style.display = 'block';
        if (form) form.reset();
        try { const nameInput = document.getElementById('sheepName'); if (nameInput) { nameInput.focus(); } } catch (e) { }
        try { updateSheepAgeDisplay(); } catch (e) { }
      }
    });
  }

  // Close modal on cancel or X button (guard for missing elements)
  const closeModal = () => { try { if (modal) modal.style.display = 'none'; } catch (e) { } };

  try { if (cancelBtn) cancelBtn.addEventListener('click', closeModal); } catch (e) { }
  try { closeBtns.forEach(b => b.addEventListener('click', closeModal)); } catch (e) { }

  // Close modal if clicking outside content
  window.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  // Wire up birth date change to update age display
  try {
    const birthEl2 = document.getElementById('sheepBirthDate');
    if (birthEl2) birthEl2.addEventListener('change', () => { try { updateSheepAgeDisplay(); } catch (e) { } });
  } catch (e) { }

  // Handle form submission
  try {
    if (form) form.addEventListener('submit', (e) => {
      e.preventDefault();
      createNewSheep();
    });
  } catch (e) { }

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

  // Columns settings modal wiring
  try {
    const colBtn = document.getElementById('columnSettingsBtn');
    const colModal = document.getElementById('columnsModal');
    const colClose = document.getElementById('columnsClose');
    const colCancel = document.getElementById('columnsCancel');
    const colSave = document.getElementById('columnsSave');
    const colForm = document.getElementById('columnsForm');
    const columnList = [
      { key: 'breed', label: 'Show Breed' },
      { key: 'color', label: 'Show Colour' },
      { key: 'sire', label: 'Show Sire' },
      { key: 'dam', label: 'Show Dam' },
      { key: 'sireSire', label: 'Show Sire-Sire (grandfather)' },
      { key: 'notes', label: 'Show Notes' },
      { key: 'age', label: 'Show Age' },
      { key: 'weight', label: 'Show Weight' },
      { key: 'sex', label: 'Show Sex' },
      { key: 'pastLambing', label: 'Show Past Lambing (Single/Twin/Triplet/Other)' },
      { key: 'bredDate', label: 'Show Past Bred Date' },
      { key: 'daysUntil', label: 'Show Days Until Lambing' },
      { key: 'daysPost', label: 'Show Days Post-Lambing' },
      { key: 'expectedDueDate', label: 'Show Expected Due Date' }
    ];

    function openColumnsModal() {
      try {
        if (!colForm) return;
        colForm.innerHTML = '';
        const current = getDashboardColumns('global') || {};
        columnList.forEach(item => {
          const wrap = document.createElement('div');
          wrap.style.display = 'flex';
          wrap.style.alignItems = 'center';
          wrap.style.gap = '8px';
          const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'col_' + item.key; cb.checked = !!current[item.key];
          const lbl = document.createElement('label'); lbl.htmlFor = cb.id; lbl.textContent = item.label;
          wrap.appendChild(cb); wrap.appendChild(lbl);
          colForm.appendChild(wrap);
        });
        if (colModal) colModal.style.display = 'block';
      } catch (e) { console.warn('openColumnsModal failed', e); }
    }

    if (colBtn) colBtn.addEventListener('click', (e) => { e.preventDefault(); try { openColumnsModal(); } catch (e) { } });
    if (colClose) colClose.addEventListener('click', () => { try { if (colModal) colModal.style.display = 'none'; } catch (e) { } });
    if (colCancel) colCancel.addEventListener('click', () => { try { if (colModal) colModal.style.display = 'none'; } catch (e) { } });
    if (colSave) colSave.addEventListener('click', () => {
      try {
        const map = {};
        columnList.forEach(item => { const cb = document.getElementById('col_' + item.key); map[item.key] = !!(cb && cb.checked); });
        saveDashboardColumns(map, 'global');
        if (colModal) colModal.style.display = 'none';
        try { loadSheepList(); } catch (e) { }
        alert('Columns saved (global).');
      } catch (e) { console.warn(e); alert('Failed to save columns.'); }
    });
    // close modal when clicking outside
    window.addEventListener('click', (ev) => { try { if (ev.target === colModal) { colModal.style.display = 'none'; } } catch (e) { } });
  } catch (e) { /* ignore */ }

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
                const modalEl = document.getElementById('sheepModal');
                if (modalEl) {
                  modalEl.style.display = 'block';
                  const f = document.getElementById('sheepForm'); if (f) f.reset();
                  try { updateSheepAgeDisplay(); } catch (e) { }
                }
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
  const headers = ['id', 'name', 'breed', 'color', 'sex', 'age', 'weight', 'birthDate', 'sire', 'dam', 'pedigree', 'notes', 'bredDate', 'expectedDueDate', 'lambings'];
  const rows = [headers];

  if (includeData) {
    const sheep = getAllSheep();
    if (sheep && sheep.length) {
      sheep.forEach(s => {
        const row = [
          s.id || '',
          s.name || '',
          s.breed || '',
          s.color || '',
          s.sex || '',
          // prefer stored age text, otherwise compute from birthDate
          (s.age || (s.birthDate ? computeAge(s.birthDate) : '')),
          s.weight || '',
          s.birthDate || '',
          s.sire || '',
          s.dam || '',
          s.pedigree || '',
          s.notes || '',
          s.bredDate || '',
          s.expectedDueDate || '',
          s.lambings ? JSON.stringify(s.lambings) : ''
        ];
        rows.push(row);
      });
    } else {
      // no animals: include one example row as a hint (includes sex)
      rows.push(['', 'Bella', 'Katahdin', 'White', 'Ewe', '3 years', '140', '2022-05-12', 'sire-tag', 'dam-tag', 'Grandparents: ...', 'Healthy', '2025-05-12', '2026-02-10']);
    }
  } else {
    const example = ['', 'Bella', 'Katahdin', 'White', 'Ewe', '3 years', '140', '2022-05-12', 'sire-tag', 'dam-tag', 'Grandparents: ...', 'Healthy', '2025-05-12', '2026-02-10', '[{"date":"2026-02-10","count":2}]'];
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
    try {
      const pieces = p.split(':').map(x => x.trim()).filter(Boolean);
      if (pieces.length === 2 && /^\d{4}/.test(pieces[0])) {
        out.push({ date: pieces[0], count: parseInt(pieces[1], 10) || 0 });
        return;
      }
      // single date -> count 1
      if (pieces.length >= 1 && /^\d{4}/.test(pieces[0])) {
        out.push({ date: pieces[0], count: 1 });
        return;
      }
      // numeric value -> treat as count for today
      const n = parseInt(pieces[0], 10);
      if (!isNaN(n)) {
        out.push({ date: new Date().toISOString().slice(0, 10), count: n });
      }
    } catch (e) { }
  });
  return out.length ? out : undefined;
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
    tr.innerHTML = `<td>${action}</td><td>${escapeHtml(pr.id)}</td><td>${escapeHtml(r.name || '')}</td><td>${escapeHtml(r.breed || '')}</td><td>${escapeHtml(r.color || '')}</td><td>${escapeHtml(r.sex || '')}</td><td>${escapeHtml(r.birthDate || '')}</td><td>${escapeHtml(r.bredDate || r.breedingDate || '')}</td><td>${escapeHtml(r.expectedDueDate || '')}</td><td>${escapeHtml(r.weight || '')}</td><td>${escapeHtml(r.notes || '')}</td><td>${lambCell}</td>`;
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

    // helper: coerce and attach weights from imported row `r` onto `sheep`
    const attachImportedWeights = (r, sheep) => {
      try {
        // parse a JSON-style `weights` column if present
        if (r.weights) {
          let parsed = null;
          try { parsed = JSON.parse(r.weights); } catch (e) { parsed = null; }
          if (!Array.isArray(parsed)) parsed = null;
          if (Array.isArray(parsed)) {
            const w = parsed.map(x => {
              const date = x && x.date ? String(x.date) : '';
              const wtRaw = x && (x.weight !== undefined) ? x.weight : (x && x.w ? x.w : undefined);
              const n = wtRaw !== undefined && wtRaw !== null && String(wtRaw).trim() !== '' ? Number(String(wtRaw).replace(/[^0-9.\-]/g, '')) : NaN;
              return (date && !isNaN(new Date(date).getTime()) && !isNaN(n)) ? { date: date, weight: n } : null;
            }).filter(Boolean);
            if (w.length) {
              w.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
              sheep.weights = w;
            }
          }
        }
        // accept a pair of columns like weightDate + weight to create a single dated weight
        if ((!sheep.weights || !sheep.weights.length) && r.weightDate && r.weight) {
          const d = String(r.weightDate).trim();
          const n = Number(String(r.weight).replace(/[^0-9.\-]/g, ''));
          if (!isNaN(new Date(d).getTime()) && !isNaN(n)) {
            sheep.weights = [{ date: d, weight: n }];
          }
        }
        // coerce top-level weight into numeric if present
        if (r.weight !== undefined && r.weight !== null && String(r.weight).trim() !== '') {
          const n = Number(String(r.weight).replace(/[^0-9.\-]/g, ''));
          if (!isNaN(n)) sheep.weight = n; else sheep.weight = r.weight;
        }
        // if weights[] exists, derive latest numeric weight into sheep.weight
        if (Array.isArray(sheep.weights) && sheep.weights.length) {
          const latest = sheep.weights.slice().map(w => ({ d: new Date(w.date), wt: Number(w.weight) })).filter(p => p.d && !isNaN(p.d.getTime()) && !isNaN(p.wt));
          if (latest.length) {
            latest.sort((a, b) => b.d.getTime() - a.d.getTime());
            sheep.weight = latest[0].wt;
          }
        }
      } catch (e) { /* non-fatal */ }
    };

    if (id && existingById[id]) {
      if (overwrite) {
        const sheep = Object.assign({}, existingById[id], {
          id: id,
          name: r.name || existingById[id].name || '',
          breed: r.breed || existingById[id].breed || '',
          color: r.color || r.colour || existingById[id].color || '',
          sex: normalizeSex(r.sex || r.Sex || '') || existingById[id].sex || '',
          status: r.status || existingById[id].status || '',
          age: r.age || existingById[id].age || '',
          weight: r.weight || existingById[id].weight || '',
          birthDate: r.birthDate || existingById[id].birthDate || '',
          bredDate: r.bredDate || r.breedingDate || r.bred || existingById[id].bredDate || '',
          sire: r.sire || existingById[id].sire || '',
          dam: r.dam || existingById[id].dam || '',
          pedigree: r.pedigree || existingById[id].pedigree || '',
          notes: r.notes || existingById[id].notes || '',
          expectedDueDate: r.expectedDueDate || existingById[id].expectedDueDate || ''
        });
        if (parsedLambings) sheep.lambings = parsedLambings;
        attachImportedWeights(r, sheep);
        // Compute expected due date from bredDate if missing
        try {
          if ((!sheep.expectedDueDate || sheep.expectedDueDate === '') && sheep.bredDate) {
            const bd = new Date(sheep.bredDate);
            const gd = getGestationDays();
            if (!isNaN(bd) && gd) {
              const due = new Date(bd.getTime() + (gd * 24 * 60 * 60 * 1000));
              sheep.expectedDueDate = due.toISOString().slice(0, 10);
            }
          }
        } catch (e) { }
        localStorage.setItem(`sheep-${id}`, JSON.stringify(sheep));
        const idxm = master.findIndex(s => s.id === id);
        if (idxm !== -1) master[idxm] = sheep;
        updated++;
      } else {
        // create a new id instead
        const newId = `sheep-${Date.now()}-${idx}`;
        const sheep = {
          id: newId,
          name: r.name || '',
          breed: r.breed || '',
          color: r.color || r.colour || '',
          sex: normalizeSex(r.sex || r.Sex || '') || (r.sex || ''),
          status: r.status || '',
          age: r.age || '',
          weight: r.weight || '',
          birthDate: r.birthDate || '',
          bredDate: r.bredDate || r.breedingDate || r.bred || '',
          sire: r.sire || '',
          dam: r.dam || '',
          pedigree: r.pedigree || '',
          notes: r.notes || '',
          expectedDueDate: r.expectedDueDate || ''
        };
        if (parsedLambings) sheep.lambings = parsedLambings;
        attachImportedWeights(r, sheep);
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
        color: r.color || r.colour || '',
        sex: normalizeSex(r.sex || r.Sex || '') || (r.sex || ''),
        status: r.status || '',
        age: r.age || '',
        weight: r.weight || '',
        birthDate: r.birthDate || '',
        bredDate: r.bredDate || r.breedingDate || r.bred || '',
        sire: r.sire || '',
        dam: r.dam || '',
        pedigree: r.pedigree || '',
        notes: r.notes || '',
        expectedDueDate: r.expectedDueDate || ''
      };
      if (parsedLambings) sheep.lambings = parsedLambings;
      // Compute expected due date from bredDate if missing
      try {
        if ((!sheep.expectedDueDate || sheep.expectedDueDate === '') && sheep.bredDate) {
          const bd = new Date(sheep.bredDate);
          const gd = getGestationDays();
          if (!isNaN(bd) && gd) {
            const due = new Date(bd.getTime() + (gd * 24 * 60 * 60 * 1000));
            sheep.expectedDueDate = due.toISOString().slice(0, 10);
          }
        }
      } catch (e) { }
      localStorage.setItem(`sheep-${sheep.id}`, JSON.stringify(sheep));
      // ensure any imported weights are parsed and top-level weight set
      try { attachImportedWeights(r, sheep); localStorage.setItem(`sheep-${sheep.id}`, JSON.stringify(sheep)); } catch (e) { }
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
      bredDate: r.bredDate || r.breedingDate || r.BreedingDate || r.bred || '',
      sire: r.sire || '',
      dam: r.dam || '',
      pedigree: r.pedigree || '',
      notes: r.notes || '',
      expectedDueDate: r.expectedDueDate || ''
    };

    // If a bred date is provided but no expected due date, compute using gestation
    try {
      if ((!sheep.expectedDueDate || sheep.expectedDueDate === '') && sheep.bredDate) {
        const bd = new Date(sheep.bredDate);
        const gd = getGestationDays();
        if (!isNaN(bd) && gd) {
          const due = new Date(bd.getTime() + (gd * 24 * 60 * 60 * 1000));
          sheep.expectedDueDate = due.toISOString().slice(0, 10);
        }
      }
    } catch (e) { /* ignore gestation calc errors */ }

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
  // mothers: active ewes only (exclude culled/sold/archived)
  const ewes = all.filter(s => (s.sex || '').toString().toLowerCase() === 'ewe' && isActiveStatus(s.status));
  // rams: active rams only, exclude lambs
  const rams = all.filter(s => (s.sex || '').toString().toLowerCase() === 'ram' && isActiveStatus(s.status) && !isLamb(s));
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
        let color = '';
        try {
          const container = document.getElementById('lambChildrenContainer');
          if (container) {
            const row = container.querySelector(`[data-lamb-index="${i}"]`);
            if (row) {
              const sexEl = row.querySelector('select.lamb-sex-input');
              const weightEl = row.querySelector('input.lamb-weight-input');
              const colorEl = row.querySelector('select.lamb-color-input');
              if (sexEl) sex = sexEl.value || '';
              if (weightEl) weight = weightEl.value || '';
              if (colorEl) {
                try { color = colorEl.value || ''; } catch (e) { color = ''; }
              }
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
          color: color || '',
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
    // add header labels for the lamb input columns
    try {
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.gap = '8px';
      header.style.alignItems = 'center';
      header.style.marginBottom = '8px';
      header.style.fontWeight = '600';
      header.style.color = '#333';

      const hLabel = document.createElement('div'); hLabel.style.minWidth = '70px'; hLabel.textContent = 'Lamb';
      const hTag = document.createElement('div'); hTag.style.flex = '1'; hTag.textContent = 'Tag / Name';
      const hSex = document.createElement('div'); hSex.style.width = '110px'; hSex.textContent = 'Sex';
      const hWeight = document.createElement('div'); hWeight.style.width = '110px'; hWeight.textContent = 'Weight (lbs)';
      const hColor = document.createElement('div'); hColor.style.width = '160px'; hColor.textContent = 'Colour';

      header.appendChild(hLabel);
      header.appendChild(hTag);
      header.appendChild(hSex);
      header.appendChild(hWeight);
      header.appendChild(hColor);
      container.appendChild(header);
    } catch (e) { }
    for (let i = 0; i < n; i++) {
      const row = document.createElement('div');
      row.className = 'lamb-input-row';
      row.style.marginBottom = '6px';
      row.setAttribute('data-lamb-index', String(i));

      const label = document.createElement('div');
      label.className = 'lamb-col-label';
      label.textContent = `Lamb #${i + 1}`;

      const tagInput = document.createElement('input');
      tagInput.type = 'text';
      tagInput.className = 'lamb-tag-input';
      tagInput.placeholder = 'Tag / Name (unique)';
      tagInput.style.flex = '1';
      tagInput.classList.add('lamb-col-tag');

      const sexSel = document.createElement('select');
      sexSel.className = 'lamb-sex-input';
      sexSel.innerHTML = '<option value="">Unknown</option><option value="Ewe">Ewe</option><option value="Ram">Ram</option>';
      sexSel.style.width = '110px';
      sexSel.classList.add('lamb-sex-input');

      const colorSel = document.createElement('select');
      colorSel.className = 'lamb-color-input';
      colorSel.style.width = '160px';
      // populate from centralized list if available
      try {
        if (Array.isArray(SHEEP_COLOR_OPTIONS)) {
          SHEEP_COLOR_OPTIONS.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.value !== undefined ? o.value : o.label;
            opt.textContent = o.label;
            colorSel.appendChild(opt);
          });
        }
      } catch (e) { }

      // No custom colour input — users select from predefined colour list only

      const weightInput = document.createElement('input');
      weightInput.type = 'number';
      weightInput.className = 'lamb-weight-input';
      weightInput.placeholder = 'Weight lbs';
      weightInput.style.width = '110px';

      row.appendChild(label);
      row.appendChild(tagInput);
      row.appendChild(sexSel);
      row.appendChild(weightInput);
      row.appendChild(colorSel);

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
  const weightEl = document.getElementById('sheepWeight');
  const sexEl = document.getElementById('sheepSex');
  const statusEl = document.getElementById('sheepStatus');
  const birthEl = document.getElementById('sheepBirthDate');
  if (!nameEl) return alert('Add Sheep form not available on this page.');
  const name = nameEl.value || '';
  const breed = breedEl ? (breedEl.value || '') : '';
  const weight = weightEl ? (weightEl.value || '') : '';
  const sex = (sexEl && sexEl.value) ? sexEl.value : 'Unknown';
  const status = (statusEl && statusEl.value) ? statusEl.value : 'active';
  const birthDate = birthEl ? (birthEl.value || '') : '';
  // Age is auto-calculated from birth date; notes removed
  // read colour selection (support Other fallback)
  const colorEl = document.getElementById('sheepColor');
  const colorOtherEl = document.getElementById('sheepColorOther');
  const color = (colorEl && colorEl.value) ? (colorEl.value === '__other__' ? (colorOtherEl ? (colorOtherEl.value || '') : '') : colorEl.value) : '';
  // read tag type selection
  const tagTypeEl = document.getElementById('sheepTagType');
  const tagType = tagTypeEl ? (tagTypeEl.value || '') : '';

  // Create unique sheep ID
  const sheepId = 'sheep-' + Date.now();

  // Create sheep object
  const sheep = {
    id: sheepId,
    name,
    breed,
    color: color || '',
    tagType: tagType || '',
    sex,
    status: status,
    // age is omitted (computed from birthDate when displaying)
    weight,
    birthDate,
    // notes omitted per preference
  };

  // Save to localStorage
  let sheepList = JSON.parse(localStorage.getItem('sheepList') || '[]');
  sheepList.push(sheep);
  localStorage.setItem('sheepList', JSON.stringify(sheepList));

  // Also save individual sheep data (log to help debug duplicate-creation)
  try { console.debug && console.debug('createNewSheep: saving', 'sheep-' + sheepId, sheep); } catch (e) { }
  localStorage.setItem(`sheep-${sheepId}`, JSON.stringify(sheep));

  // Close modal and reload list
  const sheepModal = document.getElementById('sheepModal');
  if (sheepModal) sheepModal.style.display = 'none';
  loadSheepList();

  alert(`${name} added successfully!`);
}

// Update the sheep age display based on birth date input
function updateSheepAgeDisplay() {
  try {
    const birthEl = document.getElementById('sheepBirthDate');
    const disp = document.getElementById('sheepAgeDisplay');
    if (!disp) return;
    const val = birthEl ? (birthEl.value || '') : '';
    if (!val) { disp.textContent = ''; return; }
    try { disp.textContent = computeAge(val); } catch (e) { disp.textContent = ''; }
  } catch (e) { }
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
      ['.col-color', cols.color],
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
  try { console.info(`[Dashboard] loadSheepList tab=${_currentTab} -> visibleList.length=${(visibleList || []).length}`); } catch (e) { }

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
    let weightText = 'N/A';
    try {
      if (Array.isArray(sheep.weights) && sheep.weights.length) {
        const parsed = sheep.weights.map(w => {
          const d = w && w.date ? new Date(w.date) : null;
          const wt = (w && w.weight !== undefined && w.weight !== null && w.weight !== '') ? parseFloat(String(w.weight)) : NaN;
          return { d, wt, raw: w };
        }).filter(p => p && p.d && !isNaN(p.d.getTime()));
        if (parsed.length) {
          parsed.sort((x, y) => y.d.getTime() - x.d.getTime());
          const latest = parsed[0];
          weightText = (!isNaN(latest.wt) ? String(latest.wt) + ' lbs' : (sheep.weight ? String(sheep.weight) + ' lbs' : 'N/A'));
        } else if (sheep.weight) {
          weightText = String(sheep.weight) + ' lbs';
        }
      } else if (sheep.weight) {
        weightText = String(sheep.weight) + ' lbs';
      }
    } catch (e) { weightText = sheep.weight ? String(sheep.weight) + ' lbs' : 'N/A'; }
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
    const colorTd = document.createElement('td');
    colorTd.className = 'col-color';
    colorTd.setAttribute('data-col', 'color');
    try { colorTd.textContent = sheep.color || ''; } catch (e) { colorTd.textContent = ''; }
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
    tr.appendChild(colorTd);
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
      if (!cols.color) colorTd.style.display = 'none';
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
  try { renderBreedingSummary(); } catch (e) { }
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

// Global helpers for the shared time window used by dashboard widgets
try {
  window.getGlobalTimeWindow = function () {
    try {
      const raw = localStorage.getItem('breedingTimeWindow');
      if (!raw) return { type: 'thisYear' };
      return JSON.parse(raw);
    } catch (e) { return { type: 'thisYear' }; }
  };
  window.saveGlobalTimeWindow = function (w) { try { localStorage.setItem('breedingTimeWindow', JSON.stringify(w)); } catch (e) { } };
  window.isInGlobalWindow = function (dateObj) {
    try {
      if (!dateObj || isNaN(dateObj.getTime())) return false;
      const win = window.getGlobalTimeWindow();
      const t = dateObj.getTime();
      if (!win || !win.type || win.type === 'thisYear') {
        return dateObj.getFullYear() === new Date().getFullYear();
      }
      if (win.type === 'last12') {
        const twelveAgo = new Date(); twelveAgo.setMonth(twelveAgo.getMonth() - 12);
        return t >= twelveAgo.getTime() && t <= Date.now();
      }
      if (win.type === 'custom') {
        try {
          if (win.start) {
            const s = new Date(win.start); if (isNaN(s)) return false; if (t < s.getTime()) return false;
          }
          if (win.end) {
            const e = new Date(win.end); if (isNaN(e)) return false; const eEnd = e.getTime() + (24 * 60 * 60 * 1000 - 1); if (t > eEnd) return false;
          }
          return true;
        } catch (e) { return false; }
      }
      return false;
    } catch (e) { return false; }
  };
} catch (e) { }

// Global helpers for the shared time window used by dashboard widgets
try {
  window.getGlobalTimeWindow = function () {
    try {
      const raw = localStorage.getItem('breedingTimeWindow');
      if (!raw) return { type: 'thisYear' };
      return JSON.parse(raw);
    } catch (e) { return { type: 'thisYear' }; }
  };
  window.saveGlobalTimeWindow = function (w) { try { localStorage.setItem('breedingTimeWindow', JSON.stringify(w)); } catch (e) { } };
  window.isInGlobalWindow = function (dateObj) {
    try {
      if (!dateObj || isNaN(dateObj.getTime())) return false;
      const win = window.getGlobalTimeWindow();
      const t = dateObj.getTime();
      if (!win || !win.type || win.type === 'thisYear') {
        return dateObj.getFullYear() === new Date().getFullYear();
      }
      if (win.type === 'last12') {
        const twelveAgo = new Date(); twelveAgo.setMonth(twelveAgo.getMonth() - 12);
        return t >= twelveAgo.getTime() && t <= Date.now();
      }
      if (win.type === 'custom') {
        try {
          if (win.start) {
            const s = new Date(win.start); if (isNaN(s)) return false; if (t < s.getTime()) return false;
          }
          if (win.end) {
            const e = new Date(win.end); if (isNaN(e)) return false; const eEnd = e.getTime() + (24 * 60 * 60 * 1000 - 1); if (t > eEnd) return false;
          }
          return true;
        } catch (e) { return false; }
      }
      return false;
    } catch (e) { return false; }
  };
} catch (e) { }

// Render a small breeding summary widget on the dashboard.
function renderBreedingSummary() {
  try {
    const container = document.getElementById('breedingSummary');
    if (!container) return;
    const all = JSON.parse(localStorage.getItem('sheepList') || '[]');
    const now = Date.now();
    const gd = getGestationDays() || 147;

    // Time window handling: delegate to global helpers so all widgets follow same selection
    function getSavedWindow() { try { return window.getGlobalTimeWindow ? window.getGlobalTimeWindow() : { type: 'thisYear' }; } catch (e) { return { type: 'thisYear' }; } }
    function saveWindow(w) { try { if (window.saveGlobalTimeWindow) window.saveGlobalTimeWindow(w); else localStorage.setItem('breedingTimeWindow', JSON.stringify(w)); } catch (e) { } }
    const win = getSavedWindow();

    // UI elements (selector + custom inputs) - wire if present
    try {
      const sel = document.getElementById('breedingTimeWindowSelect');
      const customWrap = document.getElementById('breedingCustomRange');
      const startEl = document.getElementById('breedingCustomStart');
      const endEl = document.getElementById('breedingCustomEnd');
      if (sel) {
        sel.value = win.type || 'thisYear';
        sel.addEventListener('change', (e) => {
          const v = e.target.value;
          if (v !== 'custom') { if (customWrap) customWrap.style.display = 'none'; }
          else if (customWrap) customWrap.style.display = 'flex';
          saveWindow(Object.assign({}, getSavedWindow(), { type: v }));
          try { renderBreedingSummary(); } catch (err) { }
        });
      }
      if (startEl && endEl) {
        if (win.start) startEl.value = win.start;
        if (win.end) endEl.value = win.end;
        startEl.addEventListener('change', () => { const w = getSavedWindow(); w.start = startEl.value; saveWindow(w); renderBreedingSummary(); });
        endEl.addEventListener('change', () => { const w = getSavedWindow(); w.end = endEl.value; saveWindow(w); renderBreedingSummary(); });
        if (customWrap) customWrap.style.display = (win.type === 'custom') ? 'flex' : 'none';
      }
    } catch (e) { }

    // Helper: test whether a Date object falls inside the selected window
    function inWindow(dateObj) { try { return window.isInGlobalWindow ? window.isInGlobalWindow(dateObj) : false; } catch (e) { return false; } }

    // Active ewes that are not lambs
    const ewes = (all || []).filter(s => {
      try {
        return isActiveStatus((s && s.status) || '') && ((s.sex || '').toString().toLowerCase() === 'ewe');
      } catch (e) { return false; }
    });

    const total = ewes.length;

    // Young ewes under 6 months
    const youngEwes = ewes.filter(s => {
      try {
        if (!s.birthDate) return false;
        const bd = new Date(s.birthDate);
        if (isNaN(bd)) return false;
        const months = (new Date().getFullYear() - bd.getFullYear()) * 12 + (new Date().getMonth() - bd.getMonth());
        return months < 6;
      } catch (e) { return false; }
    });

    // Old ewes over 8 years
    const oldEwes = ewes.filter(s => {
      try {
        if (!s.birthDate) return false;
        const bd = new Date(s.birthDate);
        if (isNaN(bd)) return false;
        const now = new Date();
        let years = now.getFullYear() - bd.getFullYear();
        // adjust if birthday hasn't occurred yet this year
        if (now.getMonth() < bd.getMonth() || (now.getMonth() === bd.getMonth() && now.getDate() < bd.getDate())) years -= 1;
        return years >= 8;
      } catch (e) { return false; }
    });

    // Determine bred/pregnant status and near due list (<=14 days)
    let bred = 0;
    let close = 0;
    const closeList = [];
    let bredYoung = 0;

    const pickDate = (v) => {
      if (!v) return null;
      if (Array.isArray(v) && v.length) return new Date(v[0]);
      return new Date(v);
    };

    ewes.forEach(s => {
      try {
        let due = null;
        const candFields = [s.expectedDueDate, s.nextDue, s.dueDate, s.expected];
        for (let i = 0; i < candFields.length; i++) {
          const d = pickDate(candFields[i]);
          if (d && !isNaN(d.getTime())) { due = d; break; }
        }
        if (!due) {
          const bd = s.bredDate ? new Date(s.bredDate) : (s._lastBredDate ? new Date(s._lastBredDate) : null);
          if (bd && !isNaN(bd.getTime())) due = new Date(bd.getTime() + gd * 24 * 60 * 60 * 1000);
        }
        if (due && !isNaN(due.getTime())) {
          bred++;
          const days = Math.max(0, Math.ceil((due.getTime() - now) / (1000 * 60 * 60 * 24)));
          if (days <= 14) {
            close++;
            try {
              closeList.push({ id: s.id, name: formatNameWithTag(s) || (s.name || s.id), days });
            } catch (e) { closeList.push({ id: s.id, name: s.name || s.id, days }); }
          }
          // young bred count
          try {
            if (s.birthDate) {
              const bd2 = new Date(s.birthDate);
              if (!isNaN(bd2)) {
                const months = (new Date().getFullYear() - bd2.getFullYear()) * 12 + (new Date().getMonth() - bd2.getMonth());
                if (months < 6) bredYoung++;
              }
            }
          } catch (e) { }
        }
      } catch (e) { }
    });

    // Lamb statistics (windowed): infer lambs by scanning child records and lambing events, avoid double-counting
    const currentYear = new Date().getFullYear();
    let totalLambs = 0, maleLambs = 0, femaleLambs = 0, unknownLambs = 0;
    const lambsPerEwe = {}; // eweKey -> count (in-window)

    // Lifetime lamb statistics (all years) from unique child records + unmatched lambing summaries
    const lambsPerEweAll = {};
    let childrenAll = 0;
    let lambingsUnmatchedAll = 0;
    let minLambYear = Infinity, maxLambYear = -Infinity;

    // Build quick maps of ewes by id and name (lower)
    const ewesById = {};
    const ewesByName = {};
    ewes.forEach(e => { if (e && e.id) ewesById[String(e.id)] = e; if (e && e.name) ewesByName[String(e.name).toLowerCase()] = e; });


    // Track producers set (ewes that produced lambs by either child records or lambing entries)
    const producers = new Set();

    // Build child record maps (global) and collect in-window child records
    const childrenById = {};
    const childrenByDamDate = {};
    const inWindowChildren = [];
    (all || []).forEach(a => {
      try {
        if (!a || !a.dam) return;
        // count unique child records (use id when available)
        childrenAll++;
        const damRawAll = (a.dam || '').toString().trim();
        const matchedEweAll = ewesById[damRawAll] || ewesByName[damRawAll.toLowerCase()] || null;
        const eweKeyAll = matchedEweAll && (matchedEweAll.id || matchedEweAll.name) ? (matchedEweAll.id || matchedEweAll.name) : null;
        if (eweKeyAll) {
          lambsPerEweAll[eweKeyAll] = (lambsPerEweAll[eweKeyAll] || 0) + 1;
          producers.add(eweKeyAll);
        }
        const bdRaw = a.birthDate || a.birthdate || '';
        const bd = bdRaw ? new Date(bdRaw) : null;
        if (bd && !isNaN(bd.getTime())) {
          minLambYear = Math.min(minLambYear, bd.getFullYear());
          maxLambYear = Math.max(maxLambYear, bd.getFullYear());
        }
        if (a.id) childrenById[String(a.id)] = a;
        if (bd && !isNaN(bd.getTime())) {
          const dateIso = bd.toISOString().slice(0, 10);
          const damKey = (a.dam || '').toString().trim();
          const key = damKey + '||' + dateIso;
          childrenByDamDate[key] = childrenByDamDate[key] || [];
          childrenByDamDate[key].push(a);
          if (inWindow(bd)) inWindowChildren.push(a);
        }
      } catch (e) { }
    });

    // Track counted child IDs to avoid double-counting
    const countedChildIds = new Set();
    const markChildCounted = (rec) => {
      if (!rec) return;
      if (rec.id) countedChildIds.add(String(rec.id));
      const sex = (rec.sex || '').toString().toLowerCase();
      totalLambs++;
      if (sex === 'ram' || sex === 'male' || sex === 'm') maleLambs++; else if (sex === 'ewe' || sex === 'female' || sex === 'f') femaleLambs++; else unknownLambs++;
      const damRaw = (rec.dam || '').toString().trim();
      const matched = ewesById[damRaw] || ewesByName[damRaw.toLowerCase()] || null;
      const key = matched && (matched.id || matched.name) ? (matched.id || matched.name) : null;
      if (key) {
        lambsPerEwe[key] = (lambsPerEwe[key] || 0) + 1;
        producers.add(key);
      }
    };

    // Prepare per-ewe lambing event counters for accurate avg per lambing
    const perEweEventCounts = {};
    const perEweEventLambCounts = {};
    let totalEventCount = 0;
    let totalLambsFromEvents = 0;

    // Process lambings first to match children by explicit child IDs or dam+date
    ewes.forEach(e => {
      try {
        if (!Array.isArray(e.lambings)) {
          return;
        }
        e.lambings.forEach(ev => {
          try {
            const date = ev && (ev.date || ev.d || ev.on) ? new Date(ev.date || ev.d || ev.on) : null;
            let cnt = 0;
            try { cnt = parseInt(ev && ev.count, 10); if (isNaN(cnt)) cnt = 0; } catch (e) { cnt = 0; }
            if (!cnt && Array.isArray(ev.children)) cnt = ev.children.length || 0;
            if (!cnt) return;
            // mark ewe as producer
            const eweKey = e && (e.id || e.name) ? (e.id || e.name) : null;
            if (eweKey) producers.add(eweKey);

            // accumulate event-level stats
            perEweEventCounts[eweKey] = (perEweEventCounts[eweKey] || 0) + 1;
            perEweEventLambCounts[eweKey] = (perEweEventLambCounts[eweKey] || 0) + cnt;
            totalEventCount += 1;
            totalLambsFromEvents += cnt;
            let matchedCount = 0;
            if (Array.isArray(ev.children) && ev.children.length) {
              ev.children.forEach(cid => {
                try {
                  const id = String(cid);
                  const child = childrenById[id];
                  if (child && inWindow(new Date(child.birthDate || child.birthdate || '1970-01-01'))) {
                    if (!countedChildIds.has(id)) { markChildCounted(child); matchedCount++; }
                  }
                } catch (e) { }
              });
            }
            if (date && !isNaN(date.getTime())) {
              const damKey = (e.id || e.name || '').toString().trim();
              const dateIso = date.toISOString().slice(0, 10);
              const key = damKey + '||' + dateIso;
              const matches = childrenByDamDate[key] || [];
              for (let i = 0; i < matches.length && matchedCount < cnt; i++) {
                const child = matches[i];
                const cid = child && child.id ? String(child.id) : null;
                if (cid && !countedChildIds.has(cid)) { markChildCounted(child); matchedCount++; }
                else if (child && !child.id) { markChildCounted(child); matchedCount++; }
              }
            }
            const unmatched = Math.max(0, cnt - matchedCount);
            if (unmatched > 0) lambingsUnmatchedAll += unmatched;
          } catch (e) { }
        });
      } catch (e) { }
    });

    // Count any remaining in-window children not matched above
    inWindowChildren.forEach(rec => { try { if (rec && rec.id && !countedChildIds.has(String(rec.id))) markChildCounted(rec); else if (rec && !rec.id) markChildCounted(rec); } catch (e) { } });

    // compute lifetime totals (unique child records + unmatched lambing summaries)
    const uniqueChildCount = Object.keys(childrenById).length + Object.values(childrenByDamDate).reduce((acc, arr) => acc + arr.filter(c => !c.id).length, 0);
    const totalLambsAll = uniqueChildCount + lambingsUnmatchedAll;

    // Use producers set to count distinct ewes that produced lambs
    const ewesThatProduced = producers.size;
    const avgLambsPerEweAll = total > 0 ? (totalLambsAll / total) : 0; // collective lifetime lambs per ewe
    // Compute avg lambs per lambing event using recorded events (more accurate)
    let avgLambsPerLambingEwe = 0;
    if (totalEventCount > 0) {
      avgLambsPerLambingEwe = totalLambsFromEvents / totalEventCount;
    } else if (ewesThatProduced > 0) {
      avgLambsPerLambingEwe = totalLambsAll / ewesThatProduced;
    }
    // Clamp to realistic upper bound (should not be higher than 3 per lambing)
    if (avgLambsPerLambingEwe > 3) avgLambsPerLambingEwe = 3;

    // Avg lambs/year/ewe: compute years span from lifetime records
    let yearsSpan = 1;
    if (isFinite(minLambYear) && isFinite(maxLambYear) && maxLambYear >= minLambYear) yearsSpan = Math.max(1, (maxLambYear - minLambYear + 1));
    const avgLambsPerYearPerEwe = (totalLambsAll > 0 && total > 0) ? (totalLambsAll / yearsSpan / total) : 0;

    // Avg birth weight for current-year lambs (use weight or birthWeight fields)
    let totalBirthWeight = 0, birthWeightCount = 0;
    (all || []).forEach(a => {
      try {
        const bdRaw = a.birthDate || a.birthdate || '';
        if (!bdRaw) return;
        const bd = new Date(bdRaw);
        if (isNaN(bd) || bd.getFullYear() !== currentYear) return;
        // determine birth weight: prefer explicit birthWeight fields, otherwise use any dated weight recorded on the birth day
        (function () {
          function sameDay(d1, d2) {
            try {
              var x = new Date(d1), y = new Date(d2);
              return x && y && !isNaN(x.getTime()) && !isNaN(y.getTime()) && x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
            } catch (e) { return false; }
          }

          var bw = NaN;
          // explicit birth weight fields (legacy and variants)
          bw = parseFloat(a.birthWeight || a.birth_weight || a.birthWeightKg || a.birth_weight_kg || NaN);
          if (isNaN(bw) || bw <= 0) {
            // check dated weights array for entries on the birth date
            try {
              var arr = Array.isArray(a.weights) ? a.weights : [];
              var vals = [];
              for (var i = 0; i < arr.length; i++) {
                try {
                  var it = arr[i];
                  var wt = (it && (it.weight !== undefined)) ? parseFloat(it.weight) : (it && (it.w !== undefined) ? parseFloat(it.w) : NaN);
                  var dt = it && (it.date || it.d || it.weightDate || it.dateRecorded) ? (it.date || it.d || it.weightDate || it.dateRecorded) : null;
                  if (!isNaN(wt) && wt > 0 && dt && sameDay(dt, bd)) vals.push(wt);
                } catch (e) { }
              }
              if (vals.length) {
                // average multiple same-day entries if present
                var s = 0; for (var j = 0; j < vals.length; j++) s += vals[j]; bw = s / vals.length;
              }
            } catch (e) { bw = NaN; }
          }

          if (!isNaN(bw) && bw > 0) {
            totalBirthWeight += bw;
            birthWeightCount++;
          }
        })();
      } catch (e) { }
    });
    const avgBirthWeight = birthWeightCount ? (totalBirthWeight / birthWeightCount) : null;

    // Build UI (use CSS classes and allow drag/drop ordering)
    container.innerHTML = '';
    // Insert time/year selection controls above the summary
    try {
      const ctrl = document.createElement('div');
      ctrl.id = 'breedingTimeControls';
      ctrl.style.display = 'flex';
      ctrl.style.alignItems = 'center';
      ctrl.style.gap = '8px';
      ctrl.style.marginBottom = '8px';
      const sel = document.createElement('select'); sel.id = 'breedingTimeWindowSelect'; sel.style.padding = '6px';
      sel.innerHTML = '<option value="thisYear">This year</option><option value="last12">Last 12 months</option><option value="custom">Custom range</option>';
      const customWrap = document.createElement('div'); customWrap.id = 'breedingCustomRange'; customWrap.style.display = 'none'; customWrap.style.gap = '6px'; customWrap.style.alignItems = 'center';
      const start = document.createElement('input'); start.type = 'date'; start.id = 'breedingCustomStart'; start.style.padding = '6px';
      const end = document.createElement('input'); end.type = 'date'; end.id = 'breedingCustomEnd'; end.style.padding = '6px';
      customWrap.appendChild(document.createTextNode('From:'));
      customWrap.appendChild(start);
      customWrap.appendChild(document.createTextNode('To:'));
      customWrap.appendChild(end);
      ctrl.appendChild(sel);
      ctrl.appendChild(customWrap);
      container.appendChild(ctrl);

      // initialize values from saved window
      try { sel.value = win.type || 'thisYear'; if (win.type === 'custom') customWrap.style.display = 'flex'; } catch (e) { }
      try { if (win.start) start.value = win.start; if (win.end) end.value = win.end; } catch (e) { }

      sel.addEventListener('change', (e) => { const v = e.target.value; try { if (v === 'custom') customWrap.style.display = 'flex'; else customWrap.style.display = 'none'; saveWindow(Object.assign({}, getSavedWindow(), { type: v })); } catch (er) { } try { renderBreedingSummary(); } catch (er) { } });
      start.addEventListener('change', () => { try { const w = getSavedWindow(); w.start = start.value; saveWindow(w); renderBreedingSummary(); } catch (e) { } });
      end.addEventListener('change', () => { try { const w = getSavedWindow(); w.end = end.value; saveWindow(w); renderBreedingSummary(); } catch (e) { } });
    } catch (e) { }
    const wrapper = document.createElement('div');
    wrapper.className = 'breeding-wrapper';
    wrapper.id = 'breedingWrapper';

    const stats = document.createElement('div');
    stats.className = 'breeding-stats draggable-panel';
    stats.id = 'breedingStatsPanel';
    stats.dataset.key = 'panel-stats';
    stats.innerHTML = `<div class="breeding-title">Breeding Summary</div>`;

    const list = document.createElement('div');
    list.className = 'breeding-cards';
    list.id = 'breedingCards';

    const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    // read hidden list from storage
    const loadHidden = () => {
      try { return JSON.parse(localStorage.getItem('breeding-hidden-cards') || '[]') || []; } catch (e) { return []; }
    };
    const isHidden = (key) => (loadHidden() || []).indexOf(key) !== -1;
    const mk = (label, value, small) => {
      const key = slug(label);
      if (isHidden(key)) return null;
      const d = document.createElement('div');
      d.className = 'breeding-card';
      d.dataset.key = key;
      const smallHtml = small ? `<div class="breeding-card-small">${small}</div>` : '';
      d.innerHTML = `<div class="breeding-card-label">${label}</div><div class="breeding-card-value">${value}</div>${smallHtml}`;
      // make stat tiles clickable to open the Reports page focused on this tile
      try {
        d.classList.add('clickable-tile');
        d.setAttribute('role', 'button');
        d.tabIndex = 0;
        const onClickTile = () => {
          try {
            localStorage.setItem('reportFocus', JSON.stringify({ key: key, label: label }));
          } catch (e) { }
          try { window.location.href = 'reports.html'; } catch (e) { }
        };
        d.addEventListener('click', onClickTile);
        d.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onClickTile(); } });
      } catch (e) { }
      return d;
    };

    // Append cards (we'll restore order afterwards if saved)
    [
      ['Total active ewes', total],
      ['Young ewes (<6 mo)', youngEwes.length, `${Math.round((youngEwes.length / (total || 1)) * 100)}% of ewes`],
      ['Old ewes (>8 yrs)', oldEwes.length, `${Math.round((oldEwes.length / (total || 1)) * 100)}% of ewes`],
      ['Ewes recorded pregnant', `${bred} (${total ? Math.round((bred / total) * 100) : 0}%)`, `Young bred: ${bredYoung}`],
      ['Ewes that produced lambs', `${ewesThatProduced} (${total ? Math.round((ewesThatProduced / total) * 100) : 0}%)`],
      ['Total lambs recorded', `${totalLambs}`, `Males: ${maleLambs} • Females: ${femaleLambs} • Unknown: ${unknownLambs}`],
      ['Avg lambs per ewe (collective)', `${(Math.round(avgLambsPerEweAll * 100) / 100)}`],
      ['Avg lambs per lambing ewe', `${(Math.round(avgLambsPerLambingEwe * 100) / 100)}`],
      ['Avg Lifetime Lambs', `${(Math.round(avgLambsPerEweAll * 100) / 100)}`, 'Average lambs produced per ewe (all years)'],
      ['Avg Lambs / Year / Ewe', `${(Math.round(avgLambsPerYearPerEwe * 100) / 100)}`, `Based on ${yearsSpan} year(s)`],
      ['Avg birth weight', `${avgBirthWeight ? (Math.round(avgBirthWeight * 10) / 10) + ' (lbs)' : 'N/A'}`, `${birthWeightCount} lamb(s) (current year)`]
    ].forEach(args => { try { const el = mk.apply(null, args); if (el) list.appendChild(el); } catch (e) { } });

    // Additional breeding tiles (5 new statistics)
    try {
      // 1) Average age of active ewes (years)
      let totalAgeYears = 0, ageCount = 0;
      ewes.forEach(s => { try { if (s.birthDate) { const bd = new Date(s.birthDate); if (!isNaN(bd)) { const yrs = (new Date().getTime() - bd.getTime()) / (1000 * 60 * 60 * 24 * 365.25); totalAgeYears += yrs; ageCount++; } } } catch (e) { } });
      const avgAge = ageCount ? (totalAgeYears / ageCount) : null;

      // 2) Replacement rate: number of kept female lambs in window / total ewes
      let keptFemaleInWindow = 0;
      try {
        const entries = JSON.parse(localStorage.getItem('financeEntries') || '[]') || [];
        const entriesInWindow = entries.filter(en => { try { const d = new Date(en.date); return inWindow(d); } catch (e) { return false; } });
        const incomeEntriesInWindow = entriesInWindow.filter(en => (en.type === 'income'));
        if (Array.isArray(inWindowChildren) && inWindowChildren.length) {
          inWindowChildren.forEach(ch => {
            try {
              let isSold = false;
              const st = (ch.status || '').toString().toLowerCase(); if (st === 'sold') isSold = true;
              if (!isSold && incomeEntriesInWindow && incomeEntriesInWindow.length) {
                const idStr = ch.id ? String(ch.id) : '';
                const nameStr = ch.name ? String(ch.name).toLowerCase() : '';
                for (let ie of incomeEntriesInWindow) {
                  try { const txt = ((ie.desc || ie.description || ie.category || '') + '').toLowerCase(); if (idStr && txt.indexOf(String(idStr)) !== -1) { isSold = true; break; } if (nameStr && nameStr.length > 2 && txt.indexOf(nameStr) !== -1) { isSold = true; break; } } catch (e) { }
                }
              }
              if (!isSold) {
                const sex = (ch.sex || '').toString().toLowerCase(); if (sex === 'ewe' || sex === 'female' || sex === 'f') keptFemaleInWindow++;
              }
            } catch (e) { }
          });
        }
      } catch (e) { }
      const replacementRate = total ? Math.round((keptFemaleInWindow / total) * 10000) / 100 : 0;

      // 3) Median lifetime lambs per ewe
      const vals = Object.values(lambsPerEweAll || {}).map(v => parseInt(v, 10) || 0).sort((a, b) => a - b);
      let medianLambs = 0;
      if (vals.length) { const mid = Math.floor(vals.length / 2); medianLambs = (vals.length % 2) ? vals[mid] : Math.round(((vals[mid - 1] + vals[mid]) / 2) * 100) / 100; }

      // 4) Average lambing interval (months) across ewes with >=2 recorded lambings
      let sumIntervalsDays = 0, intervalCount = 0;
      ewes.forEach(e => {
        try {
          if (!Array.isArray(e.lambings) || e.lambings.length < 2) return;
          const dates = e.lambings.map(ev => { try { return new Date(ev.date || ev.d || ev.on); } catch (e) { return null; } }).filter(d => d && !isNaN(d.getTime())).sort((a, b) => a - b);
          for (let i = 1; i < dates.length; i++) { const diff = Math.max(0, Math.floor((dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24))); if (diff > 0) { sumIntervalsDays += diff; intervalCount++; } }
        } catch (e) { }
      });
      const avgLambingIntervalMonths = intervalCount ? Math.round(((sumIntervalsDays / intervalCount) / 30.44) * 10) / 10 : null;

      // 5) Percent ewes that produced this window (explicit numeric tile, complements existing list)
      const pctProduced = total ? Math.round((ewesThatProduced / total) * 10000) / 100 : 0;

      [["Avg ewe age (yrs)", avgAge ? (Math.round(avgAge * 10) / 10) : 'N/A'], ["Replacement rate", `${replacementRate}%`], ["Median lambs/ewe (life)", medianLambs], ["Avg lambing interval (mo)", avgLambingIntervalMonths ? `${avgLambingIntervalMonths} mo` : 'N/A'], ["% ewes produced (window)", `${pctProduced}%`]].forEach(args => { try { const el = mk.apply(null, args); if (el) list.appendChild(el); } catch (e) { } });
    } catch (e) { }

    stats.appendChild(list);

    // --- Additional statistics and small graphics ---
    (function renderCharts() {
      try {
        const charts = document.createElement('div');
        charts.className = 'breeding-charts';

        // Helper: build inline sparkline SVG from values (smoothed path + hover titles)
        function sparkline(values, w = 120, h = 28, stroke = '#0366d6', labels) {
          if (!Array.isArray(values) || !values.length) return '';
          const max = Math.max.apply(null, values.concat([1]));
          const min = Math.min.apply(null, values.concat([0]));
          const range = Math.max(1, max - min);
          const step = values.length > 1 ? (w / (values.length - 1)) : w;
          // compute points
          const pts = values.map((v, i) => {
            const x = (i * step);
            const y = h - ((v - min) / range) * h;
            return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, v };
          });
          // Catmull-Rom to Bezier smoothing
          function catmullRom2bezier(points) {
            if (!points || points.length < 2) return '';
            let d = '';
            for (let i = 0; i < points.length; i++) {
              const p0 = points[i - 1] || points[i];
              const p1 = points[i];
              const p2 = points[i + 1] || p1;
              const p3 = points[i + 2] || p2;
              if (i === 0) d += `M ${p1.x} ${p1.y}`;
              if (p2) {
                const cp1x = p1.x + (p2.x - p0.x) / 6;
                const cp1y = p1.y + (p2.y - p0.y) / 6;
                const cp2x = p2.x - (p3.x - p1.x) / 6;
                const cp2y = p2.y - (p3.y - p1.y) / 6;
                d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
              }
            }
            return d;
          }
          const pathD = catmullRom2bezier(pts);
          // circles for hover tooltips
          const circles = pts.map((p, i) => {
            const label = labels && labels[i] ? labels[i] : null;
            const val = (Math.round(p.v * 100) / 100);
            const title = label ? `${label}: ${val}` : `${val}`;
            return `<circle cx="${p.x}" cy="${p.y}" r="2" fill="${stroke}" opacity="0.95"><title>${title}</title></circle>`;
          }).join('');
          const svg = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${circles}</svg>`;
          return svg;
        }

        // 1) Conception rate - last 12 months sparkline (percent of ewes with recorded bred date per month)
        const monthKeys = [];
        const monthSets = {};
        const nowDate = new Date();
        for (let i = 11; i >= 0; i--) {
          const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          monthKeys.push(key);
          monthSets[key] = new Set();
        }
        ewes.forEach(e => {
          try {
            const addDate = (dt) => {
              if (!dt) return;
              const d = new Date(dt);
              if (isNaN(d)) return;
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              if (monthSets[key]) monthSets[key].add(e.id || e.name || JSON.stringify(e));
            };
            if (e._lastBredDate) addDate(e._lastBredDate);
            if (e.bredDate) addDate(e.bredDate);
            if (Array.isArray(e.breedings)) e.breedings.forEach(b => addDate(b.date || b.bredDate));
          } catch (e) { }
        });
        const conceptionValues = monthKeys.map(k => {
          const c = monthSets[k] ? monthSets[k].size : 0;
          return total > 0 ? Math.round((c / total) * 100) : 0;
        });
        const conceptionLatest = conceptionValues[conceptionValues.length - 1] || 0;

        const conceptionCard = document.createElement('div'); conceptionCard.className = 'chart-card'; conceptionCard.dataset.key = 'chart-conception';
        conceptionCard.innerHTML = `<div class="chart-title">Conception rate (last 12mo)</div><div class="chart-value">${conceptionLatest}%</div><div class="chart-spark">${sparkline(conceptionValues, 140, 28, '#10b981')}</div>`;
        if (!isHidden('chart-conception')) {
          try {
            conceptionCard.classList.add('clickable-tile'); conceptionCard.setAttribute('role', 'button'); conceptionCard.tabIndex = 0;
            const _lbl = 'Conception rate (last 12mo)';
            const _on = () => { try { localStorage.setItem('reportFocus', JSON.stringify({ key: conceptionCard.dataset.key, label: _lbl })); } catch (e) { } try { window.location.href = 'reports.html'; } catch (e) { } };
            conceptionCard.addEventListener('click', _on);
            conceptionCard.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); _on(); } });
          } catch (e) { }
          charts.appendChild(conceptionCard);
        }

        // 2) Twinning rate (percent of lambings with >1 lamb) - use lambings across ewes
        let twinEvents = 0, totalEvents = 0, singles = 0, twins = 0, triplets = 0;
        ewes.forEach(e => {
          try {
            if (!Array.isArray(e.lambings)) return;
            e.lambings.forEach(ev => {
              try {
                let cnt = parseInt(ev.count, 10);
                if (isNaN(cnt) || !cnt) cnt = Array.isArray(ev.children) ? ev.children.length : 0;
                if (!cnt) return;
                totalEvents++;
                if (cnt === 1) singles++; else if (cnt === 2) twins++; else if (cnt === 3) triplets++;
                if (cnt > 1) twinEvents++;
              } catch (e) { }
            });
          } catch (e) { }
        });
        const twinningPct = totalEvents ? Math.round((twinEvents / totalEvents) * 100) : 0;
        // Merge twin summary into a single card (avoid duplicate cards)
        const twinningCard = document.createElement('div'); twinningCard.className = 'chart-card clickable-tile'; twinningCard.dataset.key = 'chart-twinning';
        try {
          // Build a simple three-bar SVG showing counts for Singles, Twins, Triplets
          const maxCnt = Math.max(1, singles || 0, twins || 0, triplets || 0);
          const barW = 28;
          const gap = 8;
          const svgH = 56;
          const svgW = (barW + gap) * 3;
          const colors = ['#60a5fa', '#f59e0b', '#ef4444'];
          const labels = ['Singles', 'Twins', 'Triplets'];
          const vals = [singles || 0, twins || 0, triplets || 0];
          let bars = '';
          vals.forEach((v, i) => {
            const h = Math.round((v / maxCnt) * (svgH - 18));
            const x = i * (barW + gap);
            const y = svgH - h - 4;
            bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${colors[i]}" rx="4"><title>${labels[i]}: ${v}</title></rect>`;
            bars += `<text x="${x + barW / 2}" y="${y - 6}" font-size="10" text-anchor="middle" fill="#222">${v}</text>`;
            bars += `<text x="${x + barW / 2}" y="${svgH}" font-size="10" text-anchor="middle" fill="#444">${labels[i].charAt(0)}</text>`;
          });
          const barsSvg = `<svg viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Twinning distribution"><title>Twinning distribution: Singles ${singles}, Twins ${twins}, Triplets ${triplets}</title>${bars}</svg>`;
          const legend = `<div class="chart-small">Singles:${singles} Twins:${twins} Triplets:${triplets}</div>`;
          twinningCard.innerHTML = `<div class="chart-title">Twinning distribution</div><div class="chart-value">${twinningPct}%</div><div class="chart-visual">${barsSvg}</div>${legend}`;
          twinningCard.setAttribute('role', 'button'); twinningCard.tabIndex = 0;
          const _lbl2 = 'Twinning distribution';
          const _on2 = () => { try { localStorage.setItem('reportFocus', JSON.stringify({ key: twinningCard.dataset.key, label: _lbl2 })); } catch (e) { } try { window.location.href = 'reports.html'; } catch (e) { } };
          twinningCard.addEventListener('click', _on2);
          twinningCard.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); _on2(); } });
        } catch (e) { }
        if (!isHidden('chart-twinning')) charts.appendChild(twinningCard);

        // 3) Lambs per year bar chart (based on child records with birthDate)
        const yearCounts = {};
        (all || []).forEach(a => {
          try {
            if (!a || !a.dam) return;
            const bdRaw = a.birthDate || a.birthdate || '';
            if (!bdRaw) return;
            const y = new Date(bdRaw).getFullYear();
            if (isNaN(y)) return;
            yearCounts[y] = (yearCounts[y] || 0) + 1;
          } catch (e) { }
        });
        const years = Object.keys(yearCounts).map(Number).sort((a, b) => a - b);
        const yearValues = years.map(y => yearCounts[y] || 0);
        const maxYearVal = Math.max.apply(null, yearValues.concat([1]));
        // build simple bars
        const barW = 18;
        const barH = 48;
        let barsSvg = `<svg viewBox="0 0 ${Math.max(120, years.length * (barW + 6))} ${barH}" xmlns="http://www.w3.org/2000/svg">`;
        years.forEach((y, i) => {
          const v = yearCounts[y] || 0;
          const h = Math.round((v / maxYearVal) * (barH - 12));
          const x = i * (barW + 6);
          const yPos = barH - h - 4;
          barsSvg += `<rect x="${x}" y="${yPos}" width="${barW}" height="${h}" fill="#60a5fa" rx="3"></rect>`;
          // numeric value above the bar
          barsSvg += `<text x="${x + barW / 2}" y="${yPos - 6}" font-size="7" text-anchor="middle" fill="#333">${v}</text>`;
          // year label below (slightly larger but reduced size)
          barsSvg += `<text x="${x + barW / 2}" y="${barH}" font-size="7" text-anchor="middle" fill="#333">${y}</text>`;
        });
        barsSvg += `</svg>`;
        const yearsCard = document.createElement('div'); yearsCard.id = 'lambsPerYearCard'; yearsCard.className = 'chart-card wide'; yearsCard.dataset.key = 'chart-lambs-per-year';
        yearsCard.innerHTML = `<div class="chart-title">Lambs per year</div><div class="chart-visual">${barsSvg}</div>`;
        if (!isHidden('chart-lambs-per-year')) {
          try {
            yearsCard.classList.add('clickable-tile'); yearsCard.setAttribute('role', 'button'); yearsCard.tabIndex = 0;
            const _lblY = 'Lambs per year';
            const _onY = () => { try { localStorage.setItem('reportFocus', JSON.stringify({ key: yearsCard.dataset.key, label: _lblY })); } catch (e) { } try { window.location.href = 'reports.html'; } catch (e) { } };
            yearsCard.addEventListener('click', _onY);
            yearsCard.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); _onY(); } });
          } catch (e) { }
          charts.appendChild(yearsCard);

          // Top producing ewes (top 5 by lifetime lambs) - placed under Lambs per year in the right column
          try {
            // remove any previously-created tile to avoid stale/empty cards
            try { const prevTop = document.getElementById('topProducersCard'); if (prevTop) prevTop.remove(); } catch (e) { }
            const producersArr = Object.keys(lambsPerEweAll || {}).map(k => ({ key: k, count: parseInt(lambsPerEweAll[k] || 0, 10) || 0 }));
            producersArr.sort((a, b) => b.count - a.count);
            // Always create the card (shows a helpful message if no data)
            const topCard = document.createElement('div');
            topCard.id = 'topProducersCard';
            topCard.className = 'chart-card';
            topCard.dataset.key = 'chart-top-producers';
            const title = document.createElement('div');
            title.className = 'chart-title';
            title.textContent = 'Top producing ewes (lifetime)';
            topCard.appendChild(title);
            // visible counter to help diagnose empty/hidden lists
            try {
              const counterEl = document.createElement('div');
              counterEl.className = 'producer-counter';
              counterEl.style.fontSize = '12px';
              counterEl.style.color = '#6b7280';
              counterEl.style.marginTop = '6px';
              counterEl.textContent = `Showing ${Math.min(5, (Object.keys(lambsPerEweAll || {}) || []).length)} of ${(Object.keys(lambsPerEweAll || {}) || []).length}`;
              topCard.appendChild(counterEl);
            } catch (e) { }
            const listWrap = document.createElement('ul');
            listWrap.className = 'producer-list chart-small';
            listWrap.style.marginTop = '6px';
            if (producersArr.length) {
              producersArr.slice(0, 5).forEach((p) => {
                try {
                  const rawKey = String(p.key || '');
                  let name = getSheepLabel(rawKey);
                  if ((!name || name === 'Unknown') && rawKey.indexOf('sheep-') === 0) {
                    name = getSheepLabel(rawKey.replace(/^sheep-/, ''));
                  }
                  const displayName = (name && name !== 'Unknown') ? name : '';
                  const li = document.createElement('li');
                  li.className = 'producer-row';
                  const left = document.createElement('span');
                  left.textContent = displayName || String(rawKey).replace(/^sheep-/, '');
                  left.style.fontWeight = '600';
                  const right = document.createElement('span');
                  right.textContent = `${p.count} lamb${p.count === 1 ? '' : 's'}`;
                  right.style.color = '#666';
                  li.appendChild(left);
                  li.appendChild(right);
                  // make the row clickable - try to resolve an id and navigate to sheep detail
                  try {
                    li.style.cursor = 'pointer';
                    li.addEventListener('click', () => {
                      try {
                        let rawKey = String(p.key || '');
                        let candidate = rawKey;
                        if ((candidate || '').indexOf('sheep-') === 0) candidate = candidate.replace(/^sheep-/, '');
                        // try find a matching sheep record
                        try {
                          const rec = findSheepByNameOrId(candidate) || findSheepByNameOrId(rawKey) || null;
                          const targetId = rec && rec.id ? rec.id : (candidate || rawKey);
                          window.location.href = buildDetailLink(targetId);
                        } catch (e) { window.location.href = buildDetailLink(candidate || rawKey); }
                      } catch (e) { /* ignore click errors */ }
                    });
                  } catch (e) { }
                  listWrap.appendChild(li);
                } catch (e) { /* ignore single row errors */ }
              });
            } else {
              const none = document.createElement('li');
              none.className = 'muted';
              none.style.padding = '6px 0';
              none.textContent = 'No lifetime producer data available.';
              listWrap.appendChild(none);
            }
            topCard.appendChild(listWrap);
            charts.appendChild(topCard);
          } catch (e) { }
        }

        // 4) Avg birth weight sparkline (last 12 months)
        const bwByMonth = {};
        (all || []).forEach(a => {
          try {
            const bdRaw = a.birthDate || a.birthdate || '';
            if (!bdRaw) return;
            const bd = new Date(bdRaw);
            if (isNaN(bd)) return;
            const key = `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, '0')}`;
            const w = parseFloat(a.birthWeight || a.birthWeightKg || a.weight || a.birth_weight || NaN);
            if (isNaN(w) || w <= 0) return;
            bwByMonth[key] = bwByMonth[key] || { sum: 0, count: 0 };
            bwByMonth[key].sum += w; bwByMonth[key].count += 1;
          } catch (e) { }
        });
        const bwValues = monthKeys.map(k => {
          const rec = bwByMonth[k];
          return rec && rec.count ? (rec.sum / rec.count) : 0;
        });
        const bwHasData = bwValues.some(v => v > 0);
        if (bwHasData) {
          const bwLatest = bwValues[bwValues.length - 1] ? Math.round(bwValues[bwValues.length - 1] * 10) / 10 : 'N/A';
          const bwCard = document.createElement('div'); bwCard.className = 'chart-card'; bwCard.dataset.key = 'chart-avg-bw';
          bwCard.innerHTML = `<div class="chart-title">Avg birth weight (lbs)</div><div class="chart-value">${bwLatest}</div><div class="chart-spark">${sparkline(bwValues, 140, 28, '#f59e0b')}</div>`;
          if (!isHidden('chart-avg-bw')) {
            try {
              bwCard.classList.add('clickable-tile'); bwCard.setAttribute('role', 'button'); bwCard.tabIndex = 0;
              const _lbl3 = 'Avg birth weight (lbs)';
              const _on3 = () => { try { localStorage.setItem('reportFocus', JSON.stringify({ key: bwCard.dataset.key, label: _lbl3 })); } catch (e) { } try { window.location.href = 'reports.html'; } catch (e) { } };
              bwCard.addEventListener('click', _on3);
              bwCard.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); _on3(); } });
            } catch (e) { }
            charts.appendChild(bwCard);
          }
        }

        // --- FIVE ADDITIONAL BREEDING CHARTS / GRAPHICS ---
        try {
          // Mortality rate (last 12 months)
          const deathsByMonth = {};
          (all || []).forEach(a => {
            try {
              const bdRaw = a.birthDate || a.birthdate || '';
              const st = (a.status || '').toString().toLowerCase();
              if (!bdRaw && !a.diedDate && !a.deathDate) return;
              const dRaw = a.diedDate || a.deathDate || a.death || a.removedDate || '';
              const d = dRaw ? new Date(dRaw) : null;
              if (!d || isNaN(d.getTime())) return;
              const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              deathsByMonth[key] = (deathsByMonth[key] || 0) + 1;
            } catch (e) { }
          });
          const deathValues = monthKeys.map(k => deathsByMonth[k] || 0);
          const totalDeaths = deathValues.reduce((a, b) => a + b, 0);
          const mortPct = lambCount ? Math.round((totalDeaths / (lambCount || 1)) * 10000) / 100 : 0;
          const mortCard = document.createElement('div'); mortCard.className = 'chart-card'; mortCard.dataset.key = 'chart-mortality';
          mortCard.innerHTML = `<div class="chart-title">Mortality (12mo)</div><div class="chart-value">${mortPct}%</div><div class="chart-spark">${sparkline(deathValues, 140, 28, '#ef4444')}</div>`;
          if (!isHidden('chart-mortality')) charts.appendChild(mortCard);

          // Weaning weight (avg of weights recorded at ~45-90 days)
          const weanWeights = {};
          (all || []).forEach(a => {
            try {
              const w = parseFloat(a.weaningWeight || a.weanWeight || a.weightAtWean || a.weight_at_wean || NaN);
              const bdRaw = a.birthDate || a.birthdate || '';
              if (isNaN(w) || !bdRaw) return;
              const bd = new Date(bdRaw);
              if (isNaN(bd)) return;
              const key = `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, '0')}`;
              weanWeights[key] = weanWeights[key] || { sum: 0, count: 0 };
              weanWeights[key].sum += w; weanWeights[key].count += 1;
            } catch (e) { }
          });
          const weanValues = monthKeys.map(k => (weanWeights[k] && weanWeights[k].count) ? (Math.round((weanWeights[k].sum / weanWeights[k].count) * 10) / 10) : 0);
          const weanLatest = weanValues[weanValues.length - 1] || 0;
          if (weanValues.some(v => v > 0)) {
            const weanCard = document.createElement('div'); weanCard.className = 'chart-card'; weanCard.dataset.key = 'chart-wean';
            weanCard.innerHTML = `<div class="chart-title">Avg wean weight (lbs)</div><div class="chart-value">${weanLatest || 'N/A'}</div><div class="chart-spark">${sparkline(weanValues, 140, 28, '#a78bfa')}</div>`;
            if (!isHidden('chart-wean')) charts.appendChild(weanCard);
          }

          // Replacement flow (simple ASCII boxes showing lambs -> kept -> replacements)
          const replCard = document.createElement('div'); replCard.className = 'chart-card'; replCard.dataset.key = 'chart-replacement-flow';
          try {
            const keptFemales = Object.keys(soldIncomeMap || {}).reduce((acc, k) => acc + ((soldIncomeMap[k] && soldIncomeMap[k].keptFemaleCount) || 0), 0);
            const bredCount = bred || 0;
            const replHtml = `<div class="chart-title">Replacement flow</div><div class="chart-small">Breeding: ${bredCount} → Lambs: ${totalLambs} → Kept females: ${keptFemales} → Replacements: ${Math.round((keptFemales / (total || 1)) * 100) / 100}</div>`;
            replCard.innerHTML = replHtml;
            if (!isHidden('chart-replacement-flow')) charts.appendChild(replCard);
          } catch (e) { }

          // Growth rate (birth -> recorded weight) approximate (avg lb/day)
          let growSum = 0, growCount = 0;
          (all || []).forEach(a => {
            try {
              const bdRaw = a.birthDate || a.birthdate || '';
              const w = parseFloat(a.latestWeight || a.weight || a.currentWeight || NaN);
              const wdRaw = a.weightDate || a.latestWeightDate || a.weight_date || '';
              if (!bdRaw || isNaN(w) || !wdRaw) return;
              const bd = new Date(bdRaw); const wd = new Date(wdRaw);
              if (isNaN(bd) || isNaN(wd)) return;
              const days = Math.max(1, Math.round((wd.getTime() - bd.getTime()) / (1000 * 60 * 60 * 24)));
              const birthW = parseFloat(a.birthWeight || a.birth_weight || NaN);
              if (isNaN(birthW)) return;
              const rate = (w - birthW) / days;
              if (!isFinite(rate)) return;
              growSum += rate; growCount++;
            } catch (e) { }
          });
          const avgGrow = growCount ? Math.round((growSum / growCount) * 100) / 100 : null;
          const growthCard = document.createElement('div'); growthCard.className = 'chart-card'; growthCard.dataset.key = 'chart-growth';
          growthCard.innerHTML = `<div class="chart-title">Avg growth (lb/day)</div><div class="chart-value">${avgGrow !== null ? avgGrow : 'N/A'}</div>`;
          if (!isHidden('chart-growth')) charts.appendChild(growthCard);

          // Cost by category (mini table) using ledger expenses in window
          try {
            const catSums = {};
            entries.forEach(en => { try { if (en.type === 'expense' || en.type === 'output') { const cat = (en.category || en.cat || en.desc || 'Other').toString().trim() || 'Other'; catSums[cat] = (catSums[cat] || 0) + (parseFloat(en.amount) || 0); } } catch (e) { } });
            const topCats = Object.keys(catSums).map(k => ({ k, v: catSums[k] })).sort((a, b) => b.v - a.v).slice(0, 4);
            if (topCats.length) {
              const tableSvg = `<div class="chart-title">Expense breakdown</div><div class="chart-small">${topCats.map(t => `${t.k}: $${(Math.round(t.v * 100) / 100).toLocaleString()}`).join('<br/>')}</div>`;
              const costCard = document.createElement('div'); costCard.className = 'chart-card'; costCard.dataset.key = 'chart-cost-breakdown'; costCard.innerHTML = tableSvg;
              if (!isHidden('chart-cost-breakdown')) charts.appendChild(costCard);
            }
          } catch (e) { }
        } catch (e) { /* non-fatal */ }

        stats.appendChild(charts);
      } catch (e) { /* non-fatal - skip charts */ }
    })();

    // Ensure the Lambs-per-year card is placed under the Pregnant % bar
    // after any saved card/panel ordering has been restored. Using a short
    // timeout ensures DOM reflows/append operations have completed.
    try {
      // Ensure a minimal getSheepLabel exists before the async rebuild runs.
      if (typeof getSheepLabel !== 'function') {
        window.getSheepLabel = function (key) {
          try {
            if (!key) return 'Unknown';
            const k = String(key);
            try {
              const raw = localStorage.getItem('sheep-' + k);
              if (raw) {
                const obj = JSON.parse(raw);
                if (obj) return obj.name || obj.tag || obj.nickname || k.replace(/^sheep-/, '');
              }
            } catch (e) { }
            return k.replace(/^sheep-/, '');
          } catch (e) { return 'Unknown'; }
        };
      }

      setTimeout(() => {
        try {
          const closeBoxNow = document.getElementById('breedingClosePanel');
          const yCardNow = document.getElementById('lambsPerYearCard');
          const topProducersNow = document.getElementById('topProducersCard');
          if (yCardNow && closeBoxNow) {
            if (yCardNow.parentElement !== closeBoxNow) {
              closeBoxNow.appendChild(yCardNow);
            }
            try { yCardNow.classList.add('under-pregnant'); } catch (e) { }
            try { if (topProducersNow && topProducersNow.parentElement !== closeBoxNow) closeBoxNow.appendChild(topProducersNow); } catch (e) { }
          }
          // Move the Sales by month tile under the breeding summary (below Top producing ewes)
          try {
            const salesCard = document.querySelector('#fi_summary [data-key="salesByMonth"]');
            if (salesCard && closeBoxNow && salesCard.parentElement !== closeBoxNow) {
              closeBoxNow.appendChild(salesCard);
            }
          } catch (e) { }
          // Rebuild the top producers content here to ensure it is visible after any DOM moves
          try {
            if (topProducersNow) {
              // rebuild the entire contents cleanly to avoid leftover/hidden nodes
              try { topProducersNow.innerHTML = ''; } catch (e) { }
              const t = document.createElement('div'); t.className = 'chart-title'; t.textContent = 'Top producing ewes (lifetime)'; topProducersNow.appendChild(t);
              const keys = Object.keys(lambsPerEweAll || {});
              try { console.log('topProducers rebuild - keys found:', keys.length, keys.slice(0, 10)); } catch (e) { }
              // counter removed: showing total/visible count not needed in this tile
              const producersArr2 = keys.map(k => ({ key: k, count: parseInt(lambsPerEweAll[k] || 0, 10) || 0 }));
              try { console.log('topProducers producersArr2 sample:', producersArr2.slice(0, 5)); } catch (e) { }
              producersArr2.sort((a, b) => b.count - a.count);
              const ul2 = document.createElement('ul'); ul2.className = 'producer-list chart-small'; ul2.style.marginTop = '6px';
              producersArr2.slice(0, 5).forEach(p => {
                try {
                  try { console.log('topProducers iterating:', p && p.key, 'count:', p && p.count); } catch (e) { }
                  const rawKey = String(p.key || '');
                  let name = getSheepLabel(rawKey);
                  if ((!name || name === 'Unknown') && rawKey.indexOf('sheep-') === 0) name = getSheepLabel(rawKey.replace(/^sheep-/, ''));
                  const displayName = (name && name !== 'Unknown') ? name : String(rawKey).replace(/^sheep-/, '');
                  const li = document.createElement('li'); li.className = 'producer-row';
                  try { li.dataset.rawKey = rawKey; } catch (e) { }
                  const left = document.createElement('span'); left.textContent = displayName; left.style.fontWeight = '600';
                  const right = document.createElement('span'); right.textContent = `${p.count} lamb${p.count === 1 ? '' : 's'}`; right.style.color = '#666';
                  li.appendChild(left); li.appendChild(right);
                  // clickable
                  try {
                    li.style.cursor = 'pointer';
                    li.addEventListener('click', () => {
                      try {
                        let candidate = rawKey;
                        if (candidate.indexOf('sheep-') === 0) candidate = candidate.replace(/^sheep-/, '');
                        const rec = findSheepByNameOrId(candidate) || findSheepByNameOrId(rawKey) || null;
                        const targetId = rec && rec.id ? rec.id : (candidate || rawKey);
                        window.location.href = buildDetailLink(targetId);
                      } catch (e) { }
                    });
                  } catch (e) { }
                  try { ul2.appendChild(li); console.log('topProducers appended li for', rawKey); } catch (err) { console.error('Failed to append li for', rawKey, err); }
                } catch (e) { console.error('topProducers inner error for item', p, e); }
              });
              try { console.log('topProducers created LI count (before append):', ul2.children.length); } catch (e) { }
              topProducersNow.appendChild(ul2);
              try { console.log('topProducers appended rows count:', (topProducersNow.querySelectorAll && topProducersNow.querySelectorAll('.producer-row') ? topProducersNow.querySelectorAll('.producer-row').length : 0)); } catch (e) { }
            }
          } catch (e) { }
        } catch (e) { /* non-fatal */ }
      }, 40);
    } catch (e) { }

    // Proportion pregnant (percent) — we'll render the progress bar below the sex ratio
    const pct = total > 0 ? Math.round((bred / total) * 100) : 0;

    wrapper.appendChild(stats);

    // Close-to-lambing panel
    const closeBox = document.createElement('div');
    closeBox.className = 'breeding-close-box draggable-panel';
    closeBox.id = 'breedingClosePanel';
    closeBox.dataset.key = 'panel-close';
    closeBox.innerHTML = `<div class="breeding-close-title">Close to lambing (≤14 days): <strong>${close}</strong></div>`;
    if (closeList.length) {
      const ul = document.createElement('ul');
      ul.className = 'breeding-close-list';
      closeList.sort((a, b) => a.days - b.days).slice(0, 20).forEach(it => {
        const li = document.createElement('li');
        li.textContent = `${it.name} — ${it.days} day${it.days === 1 ? '' : 's'}`;
        ul.appendChild(li);
      });
      closeBox.appendChild(ul);
    } else {
      const none = document.createElement('div'); none.className = 'muted'; none.textContent = 'None close to lambing.'; closeBox.appendChild(none);
    }

    // Lamb sex ratio mini bar
    const sexWrap = document.createElement('div');
    sexWrap.className = 'breeding-sex-wrap';
    sexWrap.innerHTML = `<div class="breeding-sex-title">Lamb sex ratio</div>`;
    // Lamb sex ratio (show counts and percentages of lambs produced)
    // Use totalLambs as the denominator per request
    const denom = (typeof totalLambs === 'number' && totalLambs >= 0) ? totalLambs : 0;
    const malePct = denom ? Math.round((maleLambs / denom) * 100) : 0;
    const femalePct = denom ? Math.round((femaleLambs / denom) * 100) : 0;
    let unknownCount = denom ? Math.max(0, denom - maleLambs - femaleLambs) : 0;
    const unknownPct = denom ? Math.round((unknownCount / denom) * 100) : 0;
    const ratioBar = document.createElement('div'); ratioBar.className = 'breeding-sex-bar';
    const maleSeg = document.createElement('div'); maleSeg.className = 'sex-seg male'; maleSeg.style.width = malePct + '%'; maleSeg.title = `Males ${malePct}%`;
    const femaleSeg = document.createElement('div'); femaleSeg.className = 'sex-seg female'; femaleSeg.style.width = femalePct + '%'; femaleSeg.title = `Females ${femalePct}%`;
    const unknownSeg = document.createElement('div'); unknownSeg.className = 'sex-seg unknown'; unknownSeg.style.width = unknownPct + '%'; unknownSeg.title = `Unknown ${unknownPct}%`;
    ratioBar.appendChild(maleSeg); ratioBar.appendChild(femaleSeg); ratioBar.appendChild(unknownSeg);
    sexWrap.appendChild(ratioBar);

    // textual breakdown for lamb sex ratio
    const breakdown = document.createElement('div');
    breakdown.className = 'breeding-card-small';
    breakdown.textContent = `Males: ${maleLambs} (${malePct}%) • Females: ${femaleLambs} (${femalePct}%)` + (unknownCount ? ` • Unknown: ${unknownCount} (${unknownPct}%)` : '');
    sexWrap.appendChild(breakdown);
    closeBox.appendChild(sexWrap);

    // Move the blue pregnant proportion bar here (under sex ratio) and add a label
    try {
      const pregLabel = document.createElement('div');
      pregLabel.className = 'breeding-progress-label';
      pregLabel.textContent = `Pregnant: ${pct}% (${bred}/${total})`;
      closeBox.appendChild(pregLabel);

      const barWrap2 = document.createElement('div');
      barWrap2.className = 'breeding-progress-wrap';
      const bar2 = document.createElement('div');
      bar2.className = 'breeding-progress-bar';
      bar2.style.width = pct + '%';
      barWrap2.appendChild(bar2);
      closeBox.appendChild(barWrap2);
      // NOTE: actual move of the Lambs-per-year card is done after
      // panel/card restore to avoid it being re-created or re-ordered
      // later in this function. See code after restorePanels().
    } catch (e) { }

    wrapper.appendChild(closeBox);
    container.appendChild(wrapper);

    // --- Financial widget (estimates + manual entries) ---
    try {
      const finId = 'breedingFinanceWidget';
      // remove previous if re-rendering
      const prev = document.getElementById(finId);
      if (prev) prev.remove();

      const finance = document.createElement('div');
      finance.id = finId;
      finance.className = 'finance-widget';
      // default assumptions
      const DEFAULT_EWE_VALUE = 400;
      const DEFAULT_RAM_VALUE = 300;

      const DEFAULT_PRICE_PER_LB = 0.85;
      const DEFAULT_FEED_ADULT = 3.4;
      const DEFAULT_FEED_YEARLING = 2;
      const DEFAULT_FEED_LAMB = 1;
      const DEFAULT_SUPPLEMENT_PER_DAY = 0; // $ per animal per day for supplements
      const DEFAULT_MINERAL_PER_MONTH = 0; // $ per animal per month for minerals/vitamins
      const DEFAULT_FEED_WASTE_PCT = 0; // percent additional waste of purchased feed
      const DEFAULT_FEED_START = 11; // November (1-12)
      const DEFAULT_FEED_END = 4; // April

      // load persisted settings
      function loadFiSettings() {
        try {
          return JSON.parse(localStorage.getItem('breeding-finance-settings') || '{}') || {};
        } catch (e) { return {}; }
      }
      function saveFiSettings(s) { try { localStorage.setItem('breeding-finance-settings', JSON.stringify(s || {})); } catch (e) { } }

      const saved = loadFiSettings();
      const eweVal = parseFloat(saved.eweValue || DEFAULT_EWE_VALUE) || DEFAULT_EWE_VALUE;
      const ramVal = parseFloat(saved.ramValue || DEFAULT_RAM_VALUE) || DEFAULT_RAM_VALUE;
      // unknown lambs will use the ewe lamb value by default (no separate unknown input)
      const pricePerLb = parseFloat(saved.pricePerLb || DEFAULT_PRICE_PER_LB) || DEFAULT_PRICE_PER_LB;
      const feedAdult = parseFloat(saved.feedAdult || DEFAULT_FEED_ADULT) || DEFAULT_FEED_ADULT;
      const feedYearling = parseFloat(saved.feedYearling || DEFAULT_FEED_YEARLING) || DEFAULT_FEED_YEARLING;
      const feedLamb = parseFloat(saved.feedLamb || DEFAULT_FEED_LAMB) || DEFAULT_FEED_LAMB;
      const feedStartMonth = parseInt(saved.feedStartMonth || DEFAULT_FEED_START, 10) || DEFAULT_FEED_START;
      const feedEndMonth = parseInt(saved.feedEndMonth || DEFAULT_FEED_END, 10) || DEFAULT_FEED_END;
      const expenseCategoriesRaw = (saved.expenseCategories || 'expense,output') + '';
      const expenseCategoriesList = (expenseCategoriesRaw || '').split(',').map(x => (x || '').trim().toLowerCase()).filter(Boolean);
      const savedSupplement = parseFloat(saved.supplementPerDay || '') || DEFAULT_SUPPLEMENT_PER_DAY;
      const savedMineral = parseFloat(saved.mineralPerMonth || '') || DEFAULT_MINERAL_PER_MONTH;
      const savedFeedWaste = parseFloat(saved.feedWastePct || '') || DEFAULT_FEED_WASTE_PCT;

      // helper: sum ledger amounts that should be attributed to a given ewe
      function sumLedgerForEwe(entriesList, eweKey, rec) {
        try {
          if (!Array.isArray(entriesList) || !eweKey) return 0;
          const kStr = String(eweKey || '');
          const kStrNoPrefix = kStr.replace(/^#/, '').toLowerCase();
          const nameLower = rec && (rec.name || rec.tag || '') ? (String(rec.name || rec.tag || '').toLowerCase()) : '';
          const tagLower = rec && rec.tag ? String(rec.tag).toLowerCase() : '';
          const candidates = [kStr.toLowerCase(), kStrNoPrefix, nameLower, tagLower].filter(Boolean);
          // add normalized variations
          const normCandidates = candidates.slice();
          candidates.forEach(c => { normCandidates.push(c.replace(/\s+/g, '')); normCandidates.push(c.replace(/[-_]/g, '')); });
          const allCandidates = Array.from(new Set(normCandidates)).filter(Boolean);

          let sum = 0;
          (entriesList || []).forEach(en => {
            try {
              // check allowed category/type first
              const t = (en.type || en.category || '').toString().toLowerCase();
              if (expenseCategoriesList && expenseCategoriesList.length) {
                // require that entry's type/category contains one of the configured tokens
                const matchesCat = expenseCategoriesList.some(ec => t.indexOf(ec) !== -1);
                if (!matchesCat) return;
              }
              const amt = parseFloat(en.amount) || 0;
              if (!amt) return;
              // explicit id fields match (preferred)
              const idFields = [en.eweId, en.sheepId, en.animalId, en.id, en.for];
              for (let i = 0; i < idFields.length; i++) {
                const v = idFields[i];
                if (!v) continue;
                const vs = String(v).toLowerCase();
                if (vs === kStr.toLowerCase() || vs === kStrNoPrefix) { sum += amt; return; }
              }
              // text matching against description/category fields
              const txt = ((en.desc || en.description || en.category || '') + '').toLowerCase();
              if (!txt) return;
              for (let i = 0; i < allCandidates.length; i++) {
                const c = allCandidates[i];
                if (!c || c.length < 2) continue;
                if (txt.indexOf(c) !== -1) { sum += amt; break; }
              }
            } catch (e) { }
          });
          return sum;
        } catch (e) { return 0; }
      }

      // helper to render month <option> list
      function makeMonthOptions(selected) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return months.map((m, i) => `<option value="${i + 1}" ${((i + 1) === (selected * 1)) ? 'selected' : ''}>${m}</option>`).join('');
      }

      finance.innerHTML = `
        <div class="finance-inner" style="margin-top:12px;background:#fff;border:1px solid #eee;padding:12px;border-radius:6px;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div style="font-weight:700">Financial snapshot (estimates)</div>
            <div style="display:flex;gap:8px;align-items:center;">
              <button id="fi_saveSettingsBtn" class="button" style="padding:6px 10px;font-size:13px">Save</button>
              <div id="fi_savedStatus" style="font-size:13px;color:#666">Values editable — saved to browser</div>
            </div>
          </div>
          <div style="display:flex;gap:12px;margin-top:10px;flex-wrap:wrap;align-items:center;">
          </div>

          <!-- Manual finance entry moved above the summary grid (single-line row) -->
          <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <form id="fi_addEntryForm" style="display:flex;gap:6px;align-items:center;width:100%;max-width:900px;">
              <input type="date" id="fi_entryDate" style="padding:6px;width:130px;" />
              <input type="number" id="fi_entryAmount" placeholder="Amount" style="padding:6px;width:90px;" />
              <select id="fi_entryType" style="padding:6px;width:110px;">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <input id="fi_entryCategory" placeholder="Category" style="padding:6px;min-width:90px;width:150px;" />
              <input id="fi_entryFor" list="sheepList" placeholder="Sheep (opt)" style="padding:6px;width:160px;" />
              <datalist id="sheepList"></datalist>
              <button type="button" id="fi_addEntryBtn" class="button" style="padding:6px 10px">Add</button>
            </form>
          </div>

          <div id="fi_summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:12px;align-items:center;">
            <div class="fi-card" data-key="income" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Income: <span id="fi_income" class="fi-amount"></span></div>
            <div class="fi-card" data-key="sold" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Sold lambs: <span id="fi_soldCount" class="fi-amount"></span></div>
            <div class="fi-card" data-key="expenses" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Expenses: <span id="fi_expenses" class="fi-amount"></span></div>
            <div class="fi-card" data-key="balance" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Balance: <span id="fi_balance" class="fi-amount" title="Balance = Income (sold lambs + ledger income) - Expenses (ledger)" ></span></div>
            <div class="fi-card" data-key="netIncome" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Net income: <span id="fi_netIncome" class="fi-amount" title="Includes sold lambs, kept ewe-lamb value, and income ledger entries"></span></div>
            <div class="fi-card" data-key="netExpense" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Net expense: <span id="fi_netExpense" class="fi-amount" title="Includes ledger expenses and seasonal feed costs (does not include per-lamb estimate unless toggled)"></span></div>
            <div class="fi-card" data-key="netBalance" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Net balance: <span id="fi_netBalance" class="fi-amount" title="Net income minus net expense (positive/negative)"></span></div>
            <div class="fi-card" data-key="avgPerLamb" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Avg income / lamb: <span id="fi_avgPerLamb" class="fi-amount"></span></div>
            <div class="fi-card" data-key="avgPerEweAll" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Avg income / ewe (all): <span id="fi_avgPerEweAll" class="fi-amount"></span></div>
            <div class="fi-card" data-key="avgPerEweProd" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Avg income / producing ewe: <span id="fi_avgPerEweProd" class="fi-amount"></span></div>
            <div class="fi-card" data-key="feedPerEwe" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Feed cost / ewe: <span id="fi_feedPerEwe" class="fi-amount"></span></div>
            <div class="fi-card" data-key="incomePerSold" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Income / sold lamb: <span id="fi_incomePerSoldLamb" class="fi-amount"></span></div>
            <div class="fi-card" data-key="expPerLamb" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Expense / lamb: <span id="fi_expPerLamb" class="fi-amount"></span></div>
            <div class="fi-card" data-key="netMarginPct" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Net margin: <span id="fi_netMarginPct" class="fi-amount"></span></div>
            <div class="fi-card" data-key="ledgerIncomeRatio" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Ledger income ratio: <span id="fi_ledgerIncomeRatio" class="fi-amount"></span></div>
            <div class="fi-card" data-key="revenueTrend" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Revenue (12mo): <div id="fi_revenueSpark" style="display:inline-block;vertical-align:middle;margin-left:6px"></div></div>
            <div class="fi-card" data-key="expenseTrend" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Expenses (12mo): <div id="fi_expenseSpark" style="display:inline-block;vertical-align:middle;margin-left:6px"></div></div>
            <div class="fi-card" data-key="feedBreakdown" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Feed efficiency: <div id="fi_feedBreakdown" style="margin-top:6px;font-size:12px"></div></div>
            <div class="fi-card" data-key="salesByMonth" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Sales by month: <div id="fi_salesTable" style="margin-top:6px;font-size:12px"></div></div>
            <div class="fi-card" data-key="topExpenses" draggable="true" style="cursor:grab"><span class="fi-grip" style="display:inline-block;width:18px;text-align:center;margin-right:8px;cursor:grab;opacity:0.8">☰</span>Top expenses: <div id="fi_topExpenses" style="margin-top:6px;font-size:12px"></div></div>
          </div>

          <div style="margin-top:12px;border-top:1px solid #f1f1f1;padding-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start;">
            
            <div id="fi_feedCol" style="flex:1 1 0;min-width:200px;">
              <div style="font-weight:600;margin-bottom:8px">Feed assumptions (season & rates)</div>
              <div style="background:#fbfdff;padding:8px;border:1px solid #eef2f7;border-radius:6px;font-size:13px;">
                <div style="margin-bottom:6px">Season: <select id="fi_feedStart" style="padding:6px;margin-left:6px">${makeMonthOptions(feedStartMonth)}</select> to <select id="fi_feedEnd" style="padding:6px;margin-left:6px">${makeMonthOptions(feedEndMonth)}</select></div>
                <div style="margin-bottom:6px">Price per lb: $<input id="fi_pricePerLb" type="number" step="0.01" value="${pricePerLb}" style="width:100px;padding:6px;margin-left:6px" /></div>
                <div style="margin-bottom:6px">Adult/day: <input id="fi_feedAdult" type="number" step="0.01" value="${feedAdult}" style="width:100px;padding:6px;margin-left:6px" /> lb</div>
                <div style="margin-bottom:6px">Yearling/day: <input id="fi_feedYearling" type="number" step="0.01" value="${feedYearling}" style="width:100px;padding:6px;margin-left:6px" /> lb</div>
                <div style="margin-bottom:8px">Lamb/day: <input id="fi_feedLamb" type="number" step="0.01" value="${feedLamb}" style="width:100px;padding:6px;margin-left:6px" /> lb</div>
                <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                  <label style="font-size:13px">Ewe lamb value: $<input id="fi_eweValue" type="number" step="1" value="${eweVal}" style="width:90px;padding:6px;margin-left:6px" /></label>
                  <label style="font-size:13px">Ram lamb value: $<input id="fi_ramValue" type="number" step="1" value="${ramVal}" style="width:90px;padding:6px;margin-left:6px" /></label>
                </div>
                <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;align-items:center">
                  <label style="font-size:13px">Supplement / day ($): <input id="fi_supplementPerDay" type="number" step="0.01" value="${savedSupplement}" style="width:110px;padding:6px;margin-left:6px" /></label>
                  <label style="font-size:13px">Mineral / month ($): <input id="fi_mineralPerMonth" type="number" step="0.01" value="${savedMineral}" style="width:110px;padding:6px;margin-left:6px" /></label>
                  <label style="font-size:13px">Feed waste (%): <input id="fi_feedWastePct" type="number" step="0.1" value="${savedFeedWaste}" style="width:80px;padding:6px;margin-left:6px" /></label>
                </div>
                <div style="margin-top:8px">Expense categories (comma-separated): <input id="fi_expenseCategories" type="text" value="${(saved.expenseCategories || 'expense,output')}" style="width:180px;padding:6px;margin-left:6px" /></div>
              </div>
            </div>

            <div id="fi_eweSummaryCol" style="flex:1 1 0;min-width:200px;">
              <div style="font-weight:600;margin-bottom:8px">Ewe cost / producer summary</div>
              <div id="fi_eweSummary" style="background:#fbfdff;padding:8px;border:1px solid #eef2f7;border-radius:6px"></div>
            </div>
          </div>

          <div style="margin-top:10px;font-size:12px;color:#666">Notes: values are estimates. Ewe lambs are counted at $<span id="fi_noteEwe">${eweVal}</span> by default. You can add past expenses above which will be included in the selected window. Ledger matching: entries with an explicit sheep id (set when you enter a sheep into "Sheep (opt)"), or entries whose description/category mention the sheep's id, name or tag, will be attributed to that ewe; which ledger types are considered can be configured above.</div>
        </div>`;

      container.appendChild(finance);
      // Ensure the adjusted weights widget is a sibling of the finance widget
      try {
        let aw = document.getElementById('fi_adjustedWeights');
        if (!aw) {
          aw = document.createElement('div');
          aw.id = 'fi_adjustedWeights';
          aw.style.marginTop = '12px';
          container.appendChild(aw);
        }
      } catch (e) { }
      try { if (typeof populateSheepDatalist === 'function') populateSheepDatalist(); } catch (e) { }

      // Initialize draggable grid reorder for the summary tiles and persist order
      try {
        (function initSummaryDrag() {
          const settings = loadFiSettings();
          const summary = document.getElementById('fi_summary');
          if (!summary) return;

          // apply saved order if present
          try {
            const order = settings.summaryOrder || [];
            if (Array.isArray(order) && order.length) {
              order.forEach(k => {
                try {
                  const el = summary.querySelector('[data-key="' + k + '"]');
                  if (el) summary.appendChild(el);
                } catch (e) { }
              });
            }
          } catch (e) { }

          let dragEl = null;
          let lastTarget = null;

          function swapElements(a, b) {
            try {
              const pa = a.parentNode;
              const pb = b.parentNode;
              const na = a.nextSibling === b ? a : a.nextSibling;
              pb.insertBefore(a, b);
              pa.insertBefore(b, na);
            } catch (e) { }
          }

          summary.addEventListener('dragstart', e => {
            const tgt = e.target && e.target.closest ? e.target.closest('.fi-card') : null;
            if (!tgt) return;
            dragEl = tgt;
            dragEl.classList.add('dragging');
            try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragEl.dataset.key || ''); } catch (err) { }
            dragEl.style.opacity = '0.6';
          });

          summary.addEventListener('dragend', e => {
            if (dragEl) { dragEl.classList.remove('dragging'); dragEl.style.opacity = ''; dragEl = null; lastTarget = null; }
          });

          summary.addEventListener('dragover', e => {
            e.preventDefault();
            const under = document.elementFromPoint(e.clientX, e.clientY);
            const card = under && under.closest ? under.closest('.fi-card') : null;
            try {
              if (!dragEl || !card || card === dragEl) return;
              if (card === lastTarget) return;
              lastTarget = card;
              // determine indices
              const nodes = Array.from(summary.querySelectorAll('.fi-card'));
              const dragIndex = nodes.indexOf(dragEl);
              const targetIndex = nodes.indexOf(card);
              if (dragIndex < 0 || targetIndex < 0) return;
              if (dragIndex < targetIndex) {
                summary.insertBefore(dragEl, card.nextSibling);
              } else {
                summary.insertBefore(dragEl, card);
              }
            } catch (err) { }
          });

          summary.addEventListener('drop', e => {
            e.preventDefault();
            try {
              // save current order
              const keys = Array.from(summary.querySelectorAll('.fi-card')).map(x => x.dataset.key);
              const s = loadFiSettings();
              s.summaryOrder = keys;
              saveFiSettings(s);
              const status = document.getElementById('fi_savedStatus');
              if (status) {
                status.textContent = 'Order saved';
                setTimeout(() => { try { status.textContent = 'Values editable — saved to browser'; } catch (e) { } }, 1400);
              }
            } catch (err) { }
          });
        })();
      } catch (e) { }

      // Finance storage helpers (integrate with main ledger `financeEntries`)
      function loadEntries() {
        try { return JSON.parse(localStorage.getItem('financeEntries') || '[]') || []; } catch (e) { return []; }
      }
      function saveEntries(arr) { try { localStorage.setItem('financeEntries', JSON.stringify(arr || [])); } catch (e) { } }

      // render routine using available lamb stats computed above
      function renderFinance() {
        try {
          const settings = loadFiSettings();
          const eVal = parseFloat(settings.eweValue || document.getElementById('fi_eweValue').value) || DEFAULT_EWE_VALUE;
          const rVal = parseFloat(settings.ramValue || document.getElementById('fi_ramValue').value) || DEFAULT_RAM_VALUE;
          // unknown lambs are valued equal to ewe lambs
          const uVal = eVal;
          // no per-lamb flat cost used (feed covers animal costs)
          // feed & season settings (use saved settings or current inputs)
          const PRICE_PER_LB = parseFloat(settings.pricePerLb || (document.getElementById('fi_pricePerLb') ? document.getElementById('fi_pricePerLb').value : '')) || DEFAULT_PRICE_PER_LB;
          const FEED_PER_DAY = {
            adult: parseFloat(settings.feedAdult || (document.getElementById('fi_feedAdult') ? document.getElementById('fi_feedAdult').value : '')) || DEFAULT_FEED_ADULT,
            yearling: parseFloat(settings.feedYearling || (document.getElementById('fi_feedYearling') ? document.getElementById('fi_feedYearling').value : '')) || DEFAULT_FEED_YEARLING,
            lamb: parseFloat(settings.feedLamb || (document.getElementById('fi_feedLamb') ? document.getElementById('fi_feedLamb').value : '')) || DEFAULT_FEED_LAMB
          };
          const FEED_SEASON_START = parseInt(settings.feedStartMonth || (document.getElementById('fi_feedStart') ? document.getElementById('fi_feedStart').value : ''), 10) || DEFAULT_FEED_START;
          const FEED_SEASON_END = parseInt(settings.feedEndMonth || (document.getElementById('fi_feedEnd') ? document.getElementById('fi_feedEnd').value : ''), 10) || DEFAULT_FEED_END;

          // counts for window (we used totalLambs, femaleLambs, maleLambs earlier)
          const lambCount = (typeof totalLambs === 'number') ? totalLambs : 0;
          const fCount = (typeof femaleLambs === 'number') ? femaleLambs : 0;
          const mCount = (typeof maleLambs === 'number') ? maleLambs : 0;
          const unkCount = Math.max(0, lambCount - fCount - mCount);

          // manual entries filtered by window (use inWindow helper defined above)
          const entries = loadEntries();
          const entriesInWindow = entries.filter(en => { try { const d = new Date(en.date); return inWindow(d); } catch (e) { return false; } });
          // income entries in window (helps detect sold lambs referenced by ledger)
          const incomeEntriesInWindow = entriesInWindow.filter(en => (en.type === 'income'));

          // Only count lambs that were sold as income — kept lambs are not considered income.
          // A lamb is considered sold if either the child record has status 'sold'
          // OR an income ledger entry references the lamb (by id or name) in its description.
          let soldFemale = 0, soldMale = 0, soldUnknown = 0;
          try {
            if (Array.isArray(inWindowChildren) && inWindowChildren.length) {
              inWindowChildren.forEach(ch => {
                try {
                  let isSold = false;
                  const st = (ch.status || '').toString().toLowerCase();
                  if (st === 'sold') isSold = true;
                  // look for ledger references to this child in income entries
                  if (!isSold && (incomeEntriesInWindow && incomeEntriesInWindow.length)) {
                    const idStr = ch.id ? String(ch.id) : '';
                    const nameStr = ch.name ? String(ch.name).toLowerCase() : '';
                    for (let ie of incomeEntriesInWindow) {
                      try {
                        const txt = ((ie.desc || ie.description || ie.category || '') + '').toLowerCase();
                        if (idStr && txt.indexOf(String(idStr)) !== -1) { isSold = true; break; }
                        if (nameStr && nameStr.length > 2 && txt.indexOf(nameStr) !== -1) { isSold = true; break; }
                      } catch (e) { }
                    }
                  }
                  if (!isSold) return; // skip kept/unsold lambs
                  const sex = (ch.sex || '').toString().toLowerCase();
                  if (sex === 'ram' || sex === 'male' || sex === 'm') soldMale++;
                  else if (sex === 'ewe' || sex === 'female' || sex === 'f') soldFemale++;
                  else soldUnknown++;
                } catch (e) { }
              });
            }
          } catch (e) { }
          const incomeEst = (soldFemale * eVal) + (soldMale * rVal) + (soldUnknown * uVal);
          // support both the dashboard's earlier 'expense' type and the main ledger's 'output' type
          const expensesSum = entriesInWindow.reduce((acc, en) => acc + (((en.type === 'expense' || en.type === 'output') ? (parseFloat(en.amount) || 0) : 0)), 0);
          const incomeFromEntries = entriesInWindow.reduce((acc, en) => acc + (((en.type === 'income' || en.type === 'income') ? (parseFloat(en.amount) || 0) : 0)), 0);

          // Do NOT include per-lamb/animal estimated cost in the expense total
          // unless the user explicitly adds it via the manual finance entry or finance page.
          const totalIncome = incomeEst + incomeFromEntries;
          const totalExpenses = (expensesSum || 0);
          const balance = totalIncome - totalExpenses;

          document.getElementById('fi_income').textContent = `$${(Math.round(totalIncome * 100) / 100).toLocaleString()}`;
          const expensesEl = document.getElementById('fi_expenses');
          if (expensesEl) expensesEl.textContent = `$${(Math.round(totalExpenses * 100) / 100).toLocaleString()}`;
          const balEl = document.getElementById('fi_balance');
          balEl.textContent = `$${(Math.round(balance * 100) / 100).toLocaleString()}`;
          balEl.style.color = balance < 0 ? '#dc2626' : '#16a34a';

          // show sold lamb count explicitly
          try { const soldCountEl = document.getElementById('fi_soldCount'); if (soldCountEl) { const soldTotal = soldFemale + soldMale + soldUnknown; soldCountEl.textContent = soldTotal; soldCountEl.style.color = soldTotal ? '#16a34a' : '#666'; } } catch (e) { }

          const incomeFromEweLambs = fCount * eVal;
          const avgPerEweAll = total > 0 ? (incomeFromEweLambs / total) : 0;
          const avgPerEweProd = ewesThatProduced > 0 ? (incomeFromEweLambs / ewesThatProduced) : 0;
          document.getElementById('fi_avgPerEweAll').textContent = total ? `$${(Math.round(avgPerEweAll * 100) / 100).toLocaleString()}` : 'N/A';
          document.getElementById('fi_avgPerEweProd').textContent = ewesThatProduced ? `$${(Math.round(avgPerEweProd * 100) / 100).toLocaleString()}` : 'N/A';

          document.getElementById('fi_noteEwe').textContent = eVal;
          // update small explanatory note to clarify we count only sold lambs
          try { const note = document.querySelector('#' + finId + ' .finance-inner div[style*="Notes:"]'); } catch (e) { }

          // Note: the log of manual entries is intentionally not shown here
          // to avoid duplication with the main Finance page. Entries are still
          // saved to the shared ledger (`financeEntries`) and will appear in
          // `finance.html`.

          // (Ewe income tile removed — no chart-card is created here)

          // helper to display a sheep's friendly label (name/tags) instead of raw id
          function getSheepLabel(key) {
            try {
              if (!key) return 'Unknown';
              const kStr = String(key);
              // try find record by id first
              let rec = null;
              if (ewesById && ewesById[kStr]) rec = ewesById[kStr];
              // try by name (case-insensitive)
              if (!rec && ewesByName && ewesByName[kStr.toLowerCase()]) rec = ewesByName[kStr.toLowerCase()];
              // try localStorage fallback
              if (!rec) {
                try {
                  const raw = localStorage.getItem('sheep-' + kStr);
                  if (raw) {
                    const obj = JSON.parse(raw);
                    if (obj) rec = obj;
                  }
                } catch (e) { }
              }
              if (rec) {
                // prefer name, then tag, then nickname
                return (rec.name || rec.tag || rec.nickname || 'Unknown');
              }
              // fallback to name lookup in ewesById map
              try {
                const maybeName = Object.keys(ewesById || {}).map(x => ewesById[x]).find(x => (x && (x.id === kStr || x.name === kStr)));
                if (maybeName) return (maybeName.name || maybeName.tag || 'Unknown');
              } catch (e) { }
              return 'Unknown';
            } catch (e) { return 'Unknown'; }
          }

          // ewe cost and income summary
          const summaryWrap = document.getElementById('fi_eweSummary');
          summaryWrap.innerHTML = '';
          try {
            // build per-ewe estimated cost based on lambs in window
            // Use feed-based cost calculation (no flat estimated cost per lamb)
            const rows = [];
            const nowDate = new Date();
            Object.keys(lambsPerEwe || {}).forEach(k => {
              try {
                const cnt = lambsPerEwe[k] || 0;
                // Do NOT include lambs' feed burden in the ewe's cost here. Only count the ewe's own feed
                // and any ledger-recorded expenses that explicitly reference this ewe (by id or name).
                const eweFeedPerDay = FEED_PER_DAY.adult;
                const totalFeedPerDay = eweFeedPerDay;
                let cost = 0;
                try {
                  const nowYear = nowDate.getFullYear();
                  const startMonthIdx = (FEED_SEASON_START || DEFAULT_FEED_START) - 1;
                  const endMonthIdx = (FEED_SEASON_END || DEFAULT_FEED_END) - 1;
                  let feedStart = new Date(nowYear, startMonthIdx, 1);
                  // last day of end month
                  let feedEnd = new Date(nowYear, endMonthIdx + 1, 0);
                  if (feedEnd < feedStart) {
                    // season wraps to next year
                    feedEnd = new Date(nowYear + 1, endMonthIdx + 1, 0);
                  }
                  const feedDays = Math.round((feedEnd.getTime() - feedStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  const seasonalFeedCost = totalFeedPerDay * PRICE_PER_LB * (feedDays || 182);
                  // sum expense ledger lines in the selected window that reference this ewe
                  let ledgerCost = 0;
                  try {
                    const expenseEntriesInWindow = (entriesInWindow || []);
                    const rec = null; // we'll resolve rec inside helper where needed
                    ledgerCost = sumLedgerForEwe(expenseEntriesInWindow, k, (ewesById && ewesById[String(k || '')]) || null);
                  } catch (e) { }
                  cost = Math.round(((seasonalFeedCost || 0) + (ledgerCost || 0)) * 100) / 100;
                } catch (e) {
                  const seasonalFeedCost = totalFeedPerDay * PRICE_PER_LB * 182;
                  cost = Math.round(((seasonalFeedCost || 0)) * 100) / 100;
                }
                const income = (cnt || 0) * eVal; // income still uses ewe lamb value for sold lambs
                rows.push({ key: k, cnt, cost, income });
              } catch (e) { }
            });
            rows.sort((a, b) => b.cost - a.cost);

            // compute sold-income per ewe by scanning in-window children and matching sold detection
            // Also include kept ewe-lambs valued at `eVal` so the widget reflects estimated retained value
            const soldIncomeMap = {}; // key -> { soldCount, income, keptFemaleCount, keptValue }
            try {
              if (Array.isArray(inWindowChildren) && inWindowChildren.length) {
                inWindowChildren.forEach(ch => {
                  try {
                    // determine if sold (status or referenced in income entries)
                    let isSold = false;
                    const st = (ch.status || '').toString().toLowerCase();
                    if (st === 'sold') isSold = true;
                    if (!isSold && incomeEntriesInWindow && incomeEntriesInWindow.length) {
                      const idStr = ch.id ? String(ch.id) : '';
                      const nameStr = ch.name ? String(ch.name).toLowerCase() : '';
                      for (let ie of incomeEntriesInWindow) {
                        try {
                          const txt = ((ie.desc || ie.description || ie.category || '') + '').toLowerCase();
                          if (idStr && txt.indexOf(String(idStr)) !== -1) { isSold = true; break; }
                          if (nameStr && nameStr.length > 2 && txt.indexOf(nameStr) !== -1) { isSold = true; break; }
                        } catch (e) { }
                      }
                    }
                    // find the dam/ewe key for this child
                    const damRaw = (ch.dam || '').toString().trim();
                    const matchedEwe = ewesById[damRaw] || ewesByName[damRaw.toLowerCase()] || null;
                    const eweKey = matchedEwe && (matchedEwe.id || matchedEwe.name) ? (matchedEwe.id || matchedEwe.name) : null;
                    if (!eweKey) return;
                    const sex = (ch.sex || '').toString().toLowerCase();
                    const lambIncome = (sex === 'ram' || sex === 'male' || sex === 'm') ? rVal : ((sex === 'ewe' || sex === 'female' || sex === 'f') ? eVal : uVal);
                    soldIncomeMap[eweKey] = soldIncomeMap[eweKey] || { soldCount: 0, income: 0, keptFemaleCount: 0, keptValue: 0 };
                    if (isSold) {
                      soldIncomeMap[eweKey].soldCount += 1;
                      soldIncomeMap[eweKey].income += lambIncome;
                    } else {
                      // if not sold, include ewe lambs (female) at their estimated value
                      // Count kept ewe lambs regardless of the dam's active status.
                      if (sex === 'ewe' || sex === 'female' || sex === 'f') {
                        soldIncomeMap[eweKey].keptFemaleCount += 1;
                        soldIncomeMap[eweKey].keptValue += eVal;
                      }
                    }
                  } catch (e) { }
                });
              }
            } catch (e) { }

            // find highest income ewe (include kept ewe-lambs value in the ranking)
            // We build two maps: one for the current calendar year and one for all-time.
            const nowYear = (new Date()).getFullYear();
            // gather all child records (those with a dam)
            const allChildren = (all || []).filter(a => a && a.dam);
            const childrenThisYear = allChildren.filter(c => { try { const bd = new Date(c.birthDate || c.birthdate || ''); return !isNaN(bd) && bd.getFullYear() === nowYear; } catch (e) { return false; } });

            // prepare income entries (ledger)
            const allEntries = entries || [];
            const incomeEntriesAll = allEntries.filter(en => (en && (en.type || '').toString().toLowerCase() === 'income'));
            const incomeEntriesYear = incomeEntriesAll.filter(en => { try { const d = new Date(en.date); return !isNaN(d) && d.getFullYear() === nowYear; } catch (e) { return false; } });

            // helper to build sold-income map from a given children list and income-entries list
            const buildSoldIncomeMap = (childrenList, incomeEntriesList) => {
              const map = {};
              try {
                if (Array.isArray(childrenList) && childrenList.length) {
                  childrenList.forEach(ch => {
                    try {
                      let isSold = false;
                      const st = (ch.status || '').toString().toLowerCase(); if (st === 'sold') isSold = true;
                      if (!isSold && incomeEntriesList && incomeEntriesList.length) {
                        const idStr = ch.id ? String(ch.id) : '';
                        const nameStr = ch.name ? String(ch.name).toLowerCase() : '';
                        for (let ie of incomeEntriesList) {
                          try {
                            const txt = ((ie.desc || ie.description || ie.category || '') + '').toLowerCase();
                            if (idStr && txt.indexOf(String(idStr)) !== -1) { isSold = true; break; }
                            if (nameStr && nameStr.length > 2 && txt.indexOf(nameStr) !== -1) { isSold = true; break; }
                          } catch (e) { }
                        }
                      }
                      const damRaw = (ch.dam || '').toString().trim();
                      const matchedEwe = ewesById[damRaw] || ewesByName[damRaw.toLowerCase()] || null;
                      const eweKey = matchedEwe && (matchedEwe.id || matchedEwe.name) ? (matchedEwe.id || matchedEwe.name) : null;
                      if (!eweKey) return;
                      const sex = (ch.sex || '').toString().toLowerCase();
                      const lambIncome = (sex === 'ram' || sex === 'male' || sex === 'm') ? rVal : ((sex === 'ewe' || sex === 'female' || sex === 'f') ? eVal : uVal);
                      map[eweKey] = map[eweKey] || { soldCount: 0, income: 0, keptFemaleCount: 0, keptValue: 0 };
                      if (isSold) {
                        map[eweKey].soldCount += 1;
                        map[eweKey].income += lambIncome;
                      } else {
                        if (sex === 'ewe' || sex === 'female' || sex === 'f') {
                          map[eweKey].keptFemaleCount += 1;
                          map[eweKey].keptValue += eVal;
                        }
                      }
                    } catch (e) { }
                  });
                }
              } catch (e) { }
              return map;
            };

            const soldIncomeMapYear = buildSoldIncomeMap(childrenThisYear, incomeEntriesYear);
            const soldIncomeMapAll = buildSoldIncomeMap(allChildren, incomeEntriesAll);

            let highestIncomeEweYear = null;
            Object.keys(soldIncomeMapYear).forEach(k => {
              try {
                const rec = soldIncomeMapYear[k];
                const total = (rec.income || 0) + (rec.keptValue || 0);
                if (!highestIncomeEweYear || total > (highestIncomeEweYear.total || 0)) highestIncomeEweYear = { key: k, income: rec.income || 0, soldCount: rec.soldCount || 0, keptFemaleCount: rec.keptFemaleCount || 0, keptValue: rec.keptValue || 0, total: total };
              } catch (e) { }
            });

            let highestIncomeEweAll = null;
            Object.keys(soldIncomeMapAll).forEach(k => {
              try {
                const rec = soldIncomeMapAll[k];
                const total = (rec.income || 0) + (rec.keptValue || 0);
                if (!highestIncomeEweAll || total > (highestIncomeEweAll.total || 0)) highestIncomeEweAll = { key: k, income: rec.income || 0, soldCount: rec.soldCount || 0, keptFemaleCount: rec.keptFemaleCount || 0, keptValue: rec.keptValue || 0, total: total };
              } catch (e) { }
            });

            // build ranked lists of highest income-producing ewes for year and all-time
            const incomeRowsYear = Object.keys(soldIncomeMapYear || {}).map(k => {
              const r = soldIncomeMapYear[k];
              return { key: k, soldCount: r.soldCount || 0, income: r.income || 0, keptFemaleCount: r.keptFemaleCount || 0, keptValue: r.keptValue || 0, total: ((r.income || 0) + (r.keptValue || 0)) };
            }).sort((a, b) => b.total - a.total);
            const incomeRowsAll = Object.keys(soldIncomeMapAll || {}).map(k => {
              const r = soldIncomeMapAll[k];
              return { key: k, soldCount: r.soldCount || 0, income: r.income || 0, keptFemaleCount: r.keptFemaleCount || 0, keptValue: r.keptValue || 0, total: ((r.income || 0) + (r.keptValue || 0)) };
            }).sort((a, b) => b.total - a.total);

            // compute highest-cost ewe for THIS YEAR using childrenThisYear
            const rowsYear = [];
            try {
              const nowDate = new Date();
              const grouped = {};
              (childrenThisYear || []).forEach(ch => {
                try {
                  const damRaw = (ch.dam || '').toString().trim();
                  const matched = ewesById[damRaw] || ewesByName[damRaw.toLowerCase()] || null;
                  const eweKey = matched && (matched.id || matched.name) ? (matched.id || matched.name) : null;
                  if (!eweKey) return;
                  grouped[eweKey] = grouped[eweKey] || { children: [] };
                  grouped[eweKey].children.push(ch);
                } catch (e) { }
              });
              Object.keys(grouped).forEach(k => {
                try {
                  const chs = grouped[k].children || [];
                  let childFeedPerDay = 0;
                  chs.forEach(ch => {
                    try {
                      const bdRaw = ch.birthDate || ch.birthdate || '';
                      const bd = bdRaw ? new Date(bdRaw) : null;
                      if (!bd || isNaN(bd.getTime())) return;
                      const ageDays = Math.max(0, Math.floor((nowDate.getTime() - bd.getTime()) / (1000 * 60 * 60 * 24)));
                      const ageMonths = ageDays / 30.44;
                      let feedPerDay = FEED_PER_DAY.lamb;
                      if (ageMonths >= 16) feedPerDay = FEED_PER_DAY.adult;
                      else if (ageMonths >= 8) feedPerDay = FEED_PER_DAY.yearling;
                      else feedPerDay = FEED_PER_DAY.lamb;
                      childFeedPerDay += feedPerDay;
                    } catch (e) { }
                  });
                  const eweFeedPerDay = FEED_PER_DAY.adult;
                  const totalFeedPerDay = eweFeedPerDay + childFeedPerDay;
                  // feeding season days
                  const startMonthIdx = (FEED_SEASON_START || DEFAULT_FEED_START) - 1;
                  const endMonthIdx = (FEED_SEASON_END || DEFAULT_FEED_END) - 1;
                  let feedStart = new Date(nowDate.getFullYear(), startMonthIdx, 1);
                  let feedEnd = new Date(nowDate.getFullYear(), endMonthIdx + 1, 0);
                  if (feedEnd < feedStart) feedEnd = new Date(nowDate.getFullYear() + 1, endMonthIdx + 1, 0);
                  const feedDays = Math.round((feedEnd.getTime() - feedStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  const seasonalFeedCost = totalFeedPerDay * PRICE_PER_LB * (feedDays || 182);
                  // include expense ledger lines that reference this ewe for THIS YEAR
                  let ledgerCostYear = 0;
                  try {
                    const nowYearLocal = (new Date()).getFullYear();
                    const expenseEntriesYear = (entries || []).filter(en => {
                      try {
                        const d = new Date(en.date || en.dt || '');
                        return !isNaN(d) && d.getFullYear() === nowYearLocal;
                      } catch (e) { return false; }
                    });
                    ledgerCostYear = sumLedgerForEwe(expenseEntriesYear, k, (ewesById && ewesById[String(k || '')]) || null);
                  } catch (e) { }
                  const cost = Math.round(((seasonalFeedCost || 0) + (ledgerCostYear || 0)) * 100) / 100;
                  rowsYear.push({ key: k, cnt: chs.length, cost, income: (chs.length || 0) * eVal });
                } catch (e) { }
              });
              rowsYear.sort((a, b) => b.cost - a.cost);
            } catch (e) { }

            // show message when there's no data for the year and no all-time income
            if ((!rowsYear || !rowsYear.length) && !highestIncomeEweYear && !highestIncomeEweAll) summaryWrap.innerHTML = '<div class="muted">No lambs assigned to ewes in this window or year.</div>';
            else {
              // Prepare all-time cost summary (based on all children)
              let rowsAll = [];
              try {
                const nowDate = new Date();
                const groupedAll = {};
                (allChildren || []).forEach(ch => {
                  try {
                    const damRaw = (ch.dam || '').toString().trim();
                    const matched = ewesById[damRaw] || ewesByName[damRaw.toLowerCase()] || null;
                    const eweKey = matched && (matched.id || matched.name) ? (matched.id || matched.name) : null;
                    if (!eweKey) return;
                    groupedAll[eweKey] = groupedAll[eweKey] || { children: [] };
                    groupedAll[eweKey].children.push(ch);
                  } catch (e) { }
                });
                Object.keys(groupedAll).forEach(k => {
                  try {
                    const chs = groupedAll[k].children || [];
                    let childFeedPerDay = 0;
                    chs.forEach(ch => {
                      try {
                        const bdRaw = ch.birthDate || ch.birthdate || '';
                        const bd = bdRaw ? new Date(bdRaw) : null;
                        if (!bd || isNaN(bd.getTime())) return;
                        const ageDays = Math.max(0, Math.floor((nowDate.getTime() - bd.getTime()) / (1000 * 60 * 60 * 24)));
                        const ageMonths = ageDays / 30.44;
                        let feedPerDay = FEED_PER_DAY.lamb;
                        if (ageMonths >= 16) feedPerDay = FEED_PER_DAY.adult;
                        else if (ageMonths >= 8) feedPerDay = FEED_PER_DAY.yearling;
                        else feedPerDay = FEED_PER_DAY.lamb;
                        childFeedPerDay += feedPerDay;
                      } catch (e) { }
                    });
                    const eweFeedPerDay = FEED_PER_DAY.adult;
                    const totalFeedPerDay = eweFeedPerDay + childFeedPerDay;
                    const startMonthIdx = (FEED_SEASON_START || DEFAULT_FEED_START) - 1;
                    const endMonthIdx = (FEED_SEASON_END || DEFAULT_FEED_END) - 1;
                    let feedStart = new Date(nowDate.getFullYear(), startMonthIdx, 1);
                    let feedEnd = new Date(nowDate.getFullYear(), endMonthIdx + 1, 0);
                    if (feedEnd < feedStart) feedEnd = new Date(nowDate.getFullYear() + 1, endMonthIdx + 1, 0);
                    const feedDays = Math.round((feedEnd.getTime() - feedStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    const seasonalFeedCost = totalFeedPerDay * PRICE_PER_LB * (feedDays || 182);
                    // include any ledger expenses that reference this ewe (all-time)
                    let ledgerCostAll = 0;
                    try {
                      ledgerCostAll = sumLedgerForEwe((entries || []), k, (ewesById && ewesById[String(k || '')]) || null);
                    } catch (e) { }
                    const cost = Math.round(((seasonalFeedCost || 0) + (ledgerCostAll || 0)) * 100) / 100;
                    rowsAll.push({ key: k, cnt: chs.length, cost, income: (chs.length || 0) * eVal });
                  } catch (e) { }
                });
                rowsAll.sort((a, b) => b.cost - a.cost);
              } catch (e) { }

              // render highest income ewes side-by-side (this year | all-time)
              const incomeContainer = document.createElement('div');
              incomeContainer.style.display = 'flex';
              incomeContainer.style.gap = '12px';
              incomeContainer.style.flexWrap = 'wrap';
              incomeContainer.style.alignItems = 'flex-start';
              const leftCol = document.createElement('div'); leftCol.style.flex = '1 1 260px';
              const rightCol = document.createElement('div'); rightCol.style.flex = '1 1 260px';

              // incomeContainer columns reserved for layout; detailed highest-income stats
              // will be shown in the right summary tile. Keep columns empty for lists.
              incomeContainer.appendChild(leftCol);
              incomeContainer.appendChild(rightCol);

              // render highest-cost tiles under the income container (we'll stack them in the left column)
              const costContainer = document.createElement('div');
              costContainer.style.display = 'flex';
              costContainer.style.gap = '12px';
              costContainer.style.flexWrap = 'wrap';
              costContainer.style.marginTop = '6px';
              // highest-cost tiles removed from left column; detailed cost stats
              // will be shown in the right summary tile. Left column keeps top lists.

              // Build two-column layout: left = income+cost, right = compact summary tile
              const twoCol = document.createElement('div');
              twoCol.style.display = 'flex';
              twoCol.style.gap = '12px';
              twoCol.style.alignItems = 'flex-start';

              const leftStack = document.createElement('div');
              leftStack.style.flex = '1 1 40%';
              leftStack.appendChild(incomeContainer);
              if (costContainer.children.length) leftStack.appendChild(costContainer);

              const rightStack = document.createElement('div');
              // compact summary tile with the requested data (will be displayed to the right of the main row)
              const summaryTile = document.createElement('div');
              summaryTile.className = 'fi-card';
              summaryTile.style.padding = '10px';
              summaryTile.style.background = '#fff';
              summaryTile.style.border = '1px solid #eee';
              summaryTile.style.borderRadius = '6px';
              summaryTile.innerHTML = `
                <div style="font-weight:700;margin-bottom:6px">Summary — Top ewes</div>
                <div style="margin-bottom:8px"><strong>Highest income ewe (this year):</strong> ${highestIncomeEweYear ? getSheepLabel(highestIncomeEweYear.key) : 'N/A'}<br /><span class="muted">Estimated income: $${(Math.round(((highestIncomeEweYear && highestIncomeEweYear.total) || 0) * 100) / 100).toLocaleString()} — Sold lambs: ${(highestIncomeEweYear && highestIncomeEweYear.soldCount) || 0} ${((highestIncomeEweYear && highestIncomeEweYear.keptFemaleCount) ? '• Kept ewe lambs: ' + (highestIncomeEweYear.keptFemaleCount) + ' (value $' + (Math.round((highestIncomeEweYear.keptValue || 0) * 100) / 100).toLocaleString() + ')' : '')}</span></div>
                <div style="margin-bottom:8px"><strong>Highest income ewe (all-time):</strong> ${highestIncomeEweAll ? getSheepLabel(highestIncomeEweAll.key) : 'N/A'}<br /><span class="muted">Estimated income: $${(Math.round(((highestIncomeEweAll && highestIncomeEweAll.total) || 0) * 100) / 100).toLocaleString()} — Sold lambs: ${(highestIncomeEweAll && highestIncomeEweAll.soldCount) || 0} ${((highestIncomeEweAll && highestIncomeEweAll.keptFemaleCount) ? '• Kept ewe lambs: ' + (highestIncomeEweAll.keptFemaleCount) + ' (value $' + (Math.round((highestIncomeEweAll.keptValue || 0) * 100) / 100).toLocaleString() + ')' : '')}</span></div>
                <div style="margin-bottom:8px"><strong>Highest estimated cost ewe (this year):</strong> ${rowsYear && rowsYear.length ? getSheepLabel(rowsYear[0].key) : 'N/A'}<br /><span class="muted">Estimated cost: $${(Math.round(((rowsYear && rowsYear[0] && rowsYear[0].cost) || 0) * 100) / 100).toLocaleString()}</span></div>
                <div><strong>Highest estimated cost ewe (all-time):</strong> ${rowsAll && rowsAll.length ? getSheepLabel(rowsAll[0].key) : 'N/A'}<br /><span class="muted">Estimated cost: $${(Math.round(((rowsAll && rowsAll[0] && rowsAll[0].cost) || 0) * 100) / 100).toLocaleString()}</span></div>
              `;

              // attach left content into the existing `fi_eweSummary`
              summaryWrap.innerHTML = '';
              summaryWrap.appendChild(leftStack);

              // Re-add the Top 5 income-producing ewes (this year) into the left column
              try {
                if (incomeRowsYear && incomeRowsYear.length) {
                  const incomeHeader = document.createElement('div'); incomeHeader.style.margin = '6px 0 6px 0'; incomeHeader.innerHTML = `<div style="font-weight:600">Top income-producing ewes (this year)</div>`;
                  leftStack.appendChild(incomeHeader);
                  const incomeList = document.createElement('div');
                  incomeRowsYear.slice(0, 5).forEach(r => {
                    const line = document.createElement('div');
                    line.style.padding = '4px 0';
                    line.innerHTML = `<strong>${getSheepLabel(r.key)}</strong> — Sold:${r.soldCount} • Kept:${r.keptFemaleCount || 0} • Total:$${(Math.round((r.total || 0) * 100) / 100).toLocaleString()}`;
                    incomeList.appendChild(line);
                  });
                  leftStack.appendChild(incomeList);
                }
              } catch (e) { }

              // Re-add the Top 5 highest-cost ewes into the left column
              try {
                if (rows && rows.length) {
                  const costHeader = document.createElement('div'); costHeader.style.margin = '6px 0 6px 0'; costHeader.innerHTML = `<div style="font-weight:600">Top estimated-cost ewes (this window)</div>`;
                  leftStack.appendChild(costHeader);
                  const costList = document.createElement('div');
                  rows.slice(0, 5).forEach(r => {
                    const line = document.createElement('div'); line.style.padding = '4px 0'; line.innerHTML = `<strong>${getSheepLabel(r.key)}</strong> — Cost:$${(Math.round(r.cost * 100) / 100).toLocaleString()}`; costList.appendChild(line);
                  });
                  leftStack.appendChild(costList);
                }
              } catch (e) { }

              // find the row container that holds the manual entry / feed assumptions / ewe summary
              const rowContainer = summaryWrap.parentElement && summaryWrap.parentElement.parentElement ? summaryWrap.parentElement.parentElement : null;
              if (rowContainer) {
                // ensure the row is a single non-wrapping flex row so the three columns sit side-by-side
                try {
                  rowContainer.style.display = 'flex';
                  rowContainer.style.flexWrap = 'nowrap';
                  rowContainer.style.gap = '12px';
                  rowContainer.style.alignItems = 'flex-start';
                } catch (e) { }

                const rightOuter = document.createElement('div');
                // reduce width so it fits on typical screens; will still be roomy
                rightOuter.style.flex = '1 1 0';
                rightOuter.style.minWidth = '200px';
                // mark the right column so it can be targeted for the minimize control
                try { rightOuter.id = 'fi_rightCol'; } catch (e) { }
                rightOuter.style.display = 'flex';
                // stack children vertically so Summary appears above Sales
                rightOuter.style.flexDirection = 'column';
                rightOuter.style.alignItems = 'flex-start';
                rightOuter.style.marginLeft = '12px';
                rightOuter.appendChild(summaryTile);
                rowContainer.appendChild(rightOuter);
                // Move the Sales by month tile under the Summary — Top ewes tile
                try {
                  const salesCard = document.querySelector('#fi_summary [data-key="salesByMonth"]');
                  if (salesCard) {
                    // make slightly narrower than the right column and keep responsive
                    salesCard.style.width = '100%';
                    salesCard.style.maxWidth = '360px';
                    salesCard.style.boxSizing = 'border-box';
                    salesCard.style.margin = '6px 0 0 0';
                    // append sales card beneath the summary tile inside the right column
                    rightOuter.appendChild(salesCard);
                  }
                } catch (e) { }
              } else {
                // fallback: append to summaryWrap
                summaryWrap.appendChild(summaryTile);
              }

              // Top income-producing and highest-cost lists are shown in the right summary tile now (avoid duplication).
            }
            // compute net values: separated income (lambs kept+sold + ledger income)
            // and expenses (ledger expenses + feed costs). The user can optionally
            // include the flat per-lamb estimate in net accounting using the toggle.
            try {
              const feedCosts = rows.reduce((acc, r) => acc + (parseFloat(r.cost) || 0), 0);
              // estimated flat animal cost (informational)
              // per-lamb flat estimate removed from accounting (feed covers animal costs)

              // total kept value collected earlier per-ewe
              const totalKeptValue = Object.keys(soldIncomeMap || {}).reduce((acc, k) => acc + ((soldIncomeMap[k] && soldIncomeMap[k].keptValue) || 0), 0);
              // compute supplemental/mineral/waste costs for the feed season
              try {
                const nowDateLocal = new Date();
                const startMonthIdxLocal = (FEED_SEASON_START || DEFAULT_FEED_START) - 1;
                const endMonthIdxLocal = (FEED_SEASON_END || DEFAULT_FEED_END) - 1;
                let feedStartLocal = new Date(nowDateLocal.getFullYear(), startMonthIdxLocal, 1);
                let feedEndLocal = new Date(nowDateLocal.getFullYear(), endMonthIdxLocal + 1, 0);
                if (feedEndLocal < feedStartLocal) feedEndLocal = new Date(nowDateLocal.getFullYear() + 1, endMonthIdxLocal + 1, 0);
                const feedDays = Math.round((feedEndLocal.getTime() - feedStartLocal.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                const supplementPerDay = parseFloat(settings.supplementPerDay || (document.getElementById('fi_supplementPerDay') ? document.getElementById('fi_supplementPerDay').value : '')) || DEFAULT_SUPPLEMENT_PER_DAY;
                const mineralPerMonth = parseFloat(settings.mineralPerMonth || (document.getElementById('fi_mineralPerMonth') ? document.getElementById('fi_mineralPerMonth').value : '')) || DEFAULT_MINERAL_PER_MONTH;
                const feedWastePct = parseFloat(settings.feedWastePct || (document.getElementById('fi_feedWastePct') ? document.getElementById('fi_feedWastePct').value : '')) || DEFAULT_FEED_WASTE_PCT;
                const supplementTotal = supplementPerDay * ((total || 0)) * (feedDays || 0);
                const mineralMonths = Math.max(1, Math.round((feedDays || 0) / 30.44));
                const mineralTotal = mineralPerMonth * ((total || 0)) * mineralMonths;
                var feedCostsWithExtras = Math.round((((feedCosts || 0) * (1 + (feedWastePct / 100))) + supplementTotal + mineralTotal) * 100) / 100;
              } catch (e) { var feedCostsWithExtras = Math.round((feedCosts || 0) * 100) / 100; }
              // income from sold lambs (incomeEst) + kept-lamb value + any income ledger entries
              const lambIncomeTotal = Math.round(((incomeEst || 0) + (totalKeptValue || 0) + (incomeFromEntries || 0)) * 100) / 100;

              // update average income per lamb using the recalculated lamb income total
              try {
                const avgEl = document.getElementById('fi_avgPerLamb');
                if (avgEl) avgEl.textContent = lambCount ? `$${(Math.round(((lambIncomeTotal || 0) / (lambCount || 1)) * 100) / 100).toLocaleString()}` : 'N/A';
              } catch (e) { }

              const ledgerExpenses = Math.round((expensesSum || 0) * 100) / 100;
              const netExpenseVal = Math.round(((ledgerExpenses + (feedCostsWithExtras || feedCosts))) * 100) / 100;
              const netIncomeVal = Math.max(0, lambIncomeTotal);
              const netBalance = Math.round((lambIncomeTotal - netExpenseVal) * 100) / 100;

              // Additional finance stats
              try {
                const feedPerEweEl = document.getElementById('fi_feedPerEwe');
                const incomePerSoldEl = document.getElementById('fi_incomePerSoldLamb');
                const expPerLambEl = document.getElementById('fi_expPerLamb');
                const netMarginEl = document.getElementById('fi_netMarginPct');
                const ledgerRatioEl = document.getElementById('fi_ledgerIncomeRatio');

                const soldTotal = (soldFemale + soldMale + soldUnknown) || 0;
                const feedPerEwe = total > 0 ? (feedCosts / total) : 0;
                const incomePerSold = soldTotal ? ((incomeEst || 0) / soldTotal) : 0;
                const expPerLamb = lambCount ? ((totalExpenses || 0) / lambCount) : 0;
                const netMarginPct = (netIncomeVal > 0) ? Math.round((netBalance / netIncomeVal) * 10000) / 100 : (netBalance === 0 ? 0 : -100);
                const ledgerIncomeRatio = (totalIncome > 0) ? Math.round(((incomeFromEntries || 0) / totalIncome) * 10000) / 100 : 0;

                if (feedPerEweEl) feedPerEweEl.textContent = `$${(Math.round(feedPerEwe * 100) / 100).toLocaleString()}`;
                if (incomePerSoldEl) incomePerSoldEl.textContent = soldTotal ? `$${(Math.round(incomePerSold * 100) / 100).toLocaleString()}` : 'N/A';
                if (expPerLambEl) expPerLambEl.textContent = lambCount ? `$${(Math.round(expPerLamb * 100) / 100).toLocaleString()}` : 'N/A';
                if (netMarginEl) netMarginEl.textContent = `${netMarginPct}%`;
                if (ledgerRatioEl) ledgerRatioEl.textContent = `${ledgerIncomeRatio}%`;
              } catch (e) { }

              const netIncEl = document.getElementById('fi_netIncome');
              const netExpEl = document.getElementById('fi_netExpense');
              const netBalEl = document.getElementById('fi_netBalance');
              if (netIncEl) netIncEl.textContent = `$${(Math.round(netIncomeVal * 100) / 100).toLocaleString()}`;
              if (netExpEl) netExpEl.textContent = `$${(Math.round(netExpenseVal * 100) / 100).toLocaleString()}`;
              if (netBalEl) {
                netBalEl.textContent = `$${(Math.round(netBalance * 100) / 100).toLocaleString()}`;
                netBalEl.style.color = netBalance < 0 ? '#dc2626' : '#16a34a';
              }

              // --- Finance mini-graphics: revenue/expense sparkline, feed breakdown, sales table, top expenses ---
              try {
                // small sparkline renderer (inline; isolated to this function)
                function renderMiniSpark(values, w, h, stroke, labels) {
                  if (!Array.isArray(values) || !values.length) return '';
                  const max = Math.max.apply(null, values.concat([1]));
                  const min = Math.min.apply(null, values.concat([0]));
                  const range = Math.max(1, max - min);
                  const step = values.length > 1 ? (w / (values.length - 1)) : w;
                  const pts = values.map((v, i) => ({ x: Math.round((i * step) * 10) / 10, y: Math.round((h - ((v - min) / range) * h) * 10) / 10, v }));
                  function catmullRom2bezier(points) {
                    if (!points || points.length < 2) return '';
                    let d = '';
                    for (let i = 0; i < points.length; i++) {
                      const p0 = points[i - 1] || points[i];
                      const p1 = points[i];
                      const p2 = points[i + 1] || p1;
                      const p3 = points[i + 2] || p2;
                      if (i === 0) d += `M ${p1.x} ${p1.y}`;
                      if (p2) {
                        const cp1x = p1.x + (p2.x - p0.x) / 6;
                        const cp1y = p1.y + (p2.y - p0.y) / 6;
                        const cp2x = p2.x - (p3.x - p1.x) / 6;
                        const cp2y = p2.y - (p3.y - p1.y) / 6;
                        d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
                      }
                    }
                    return d;
                  }
                  const pathD = catmullRom2bezier(pts);
                  const circles = pts.map((p, i) => {
                    const label = labels && labels[i] ? labels[i] : null;
                    const val = (Math.round(p.v * 100) / 100);
                    const title = label ? `${label}: ${val}` : `${val}`;
                    return `<circle cx="${p.x}" cy="${p.y}" r="2" fill="${stroke}" opacity="0.95"><title>${title}</title></circle>`;
                  }).join('');
                  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg"><path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${circles}</svg>`;
                }

                // build last-12-month keys
                const now = new Date();
                const monthKeys = [];
                for (let i = 11; i >= 0; i--) {
                  const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                  monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
                }

                // aggregate ledger revenue/expense by month
                const revByMonth = {}; const expByMonth = {};
                (entries || []).forEach(en => {
                  try {
                    const dt = new Date(en.date);
                    if (isNaN(dt)) return;
                    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
                    const amt = parseFloat(en.amount) || 0;
                    if ((en.type || '').toString().toLowerCase().indexOf('inc') === 0) revByMonth[key] = (revByMonth[key] || 0) + amt;
                    else expByMonth[key] = (expByMonth[key] || 0) + amt;
                  } catch (e) { }
                });

                const revenueValues = monthKeys.map(k => Math.round(((revByMonth[k] || 0) + 0) * 100) / 100);
                const expenseValues = monthKeys.map(k => Math.round(((expByMonth[k] || 0) + 0) * 100) / 100);

                const revEl = document.getElementById('fi_revenueSpark'); if (revEl) revEl.innerHTML = renderMiniSpark(revenueValues, 150, 30, '#10b981', monthKeys);
                const expEl = document.getElementById('fi_expenseSpark'); if (expEl) expEl.innerHTML = renderMiniSpark(expenseValues, 150, 30, '#ef4444', monthKeys);

                // Feed efficiency: income per $ feed + ROI
                try {
                  const feedBreakEl = document.getElementById('fi_feedBreakdown');
                  if (feedBreakEl) {
                    const fb = Math.round(((feedCostsWithExtras || feedCosts) || 0) * 100) / 100;
                    const ledger = Math.round((ledgerExpenses || 0) * 100) / 100;
                    let html = '';
                    if (fb > 0) {
                      const incomePerFeed = Math.round(((totalIncome || 0) / fb) * 100) / 100;
                      const roi = Math.round((((totalIncome || 0) - fb) / fb) * 10000) / 100;
                      html = `<div style="font-weight:600">Feed efficiency</div><div style="font-size:13px">Income / $feed: $${incomePerFeed.toLocaleString()} • ROI: ${isFinite(roi) ? roi + '%' : 'N/A'}</div>`;
                    } else {
                      html = `<div style="font-weight:600">Feed efficiency</div><div style="font-size:13px" class="muted">No feed cost data</div>`;
                    }
                    feedBreakEl.innerHTML = html;
                  }
                } catch (e) { }

                // sales by recent months (last 6 months)
                try {
                  const salesEl = document.getElementById('fi_salesTable');
                  if (salesEl) {
                    const last6 = monthKeys.slice(-6);
                    let html = '<div style="font-weight:600">Sales (last 6 mo)</div><table style="width:100%;font-size:13px">';
                    last6.forEach(k => { html += `<tr><td style="padding:2px 6px">${k}</td><td style="text-align:right;padding:2px 6px">$${(Math.round((revByMonth[k] || 0) * 100) / 100).toLocaleString()}</td></tr>`; });
                    html += '</table>';
                    salesEl.innerHTML = html;
                  }
                } catch (e) { }

                // Adjusted weights widget: compute and render adjusted birth & adjusted wean weights
                try {
                  function renderAdjustedWeights() {
                    try {
                      const container = document.getElementById('fi_adjustedWeights');
                      if (!container) return;
                      const startDefault = (win && win.start) ? win.start : '';
                      const endDefault = (win && win.end) ? win.end : '';
                      const stdAgeInput = `<label style="font-size:13px">Standard wean age (days): <select id="fi_stdWeanAge" style="width:100px;padding:4px;margin-left:6px"><option value="60">60</option><option value="90">90</option></select></label>`;
                      const winType = (window.getGlobalTimeWindow ? (window.getGlobalTimeWindow().type || 'thisYear') : (win && win.type) ? win.type : 'thisYear');
                      const winSelect = `<label style="font-size:13px;margin-right:8px">Window: <select id="fi_adjWindow" style="padding:4px;margin-left:6px"><option value="thisYear">Current year</option><option value="last12">Last 12 months</option><option value="custom">Custom range</option></select></label>`;
                      const dateRangeInputs = `<label style="font-size:13px;margin-left:12px">From: <input type="date" id="fi_adjStart" style="padding:4px;margin-left:6px" value="${startDefault}"/></label><label style="font-size:13px;margin-left:6px">To: <input type="date" id="fi_adjEnd" style="padding:4px;margin-left:6px" value="${endDefault}"/></label>`;
                      const recalcBtn = `<button id="fi_recalcAdj" class="button" style="margin-left:8px;padding:4px 8px">Recalc</button>`;
                      let html = `<div style="font-weight:700;margin-bottom:6px">Lambs by adjusted weights</div><div style="margin-bottom:6px">${winSelect}${stdAgeInput}${dateRangeInputs}${recalcBtn}</div>`;
                      // gather lamb records
                      // only include currently active lambs (exclude sold/removed/dead)
                      const lambs = (all || []).filter(a => {
                        try {
                          if (!a || !a.dam) return false;
                          const hasBirth = !!(a.birthDate || a.birthdate);
                          if (!hasBirth) return false;
                          const st = (a.status || '').toString().toLowerCase();
                          if (!st) return true; // treat missing status as active
                          const excluded = ['sold', 'dead', 'died', 'removed', 'deceased'];
                          if (excluded.indexOf(st) !== -1) return false;
                          return true;
                        } catch (e) { return false; }
                      });
                      const rows = [];
                      const stdAgeElVal = (document.getElementById('fi_stdWeanAge') && parseInt(document.getElementById('fi_stdWeanAge').value, 10)) || 60;
                      const adjStartVal = (document.getElementById('fi_adjStart') && document.getElementById('fi_adjStart').value) ? document.getElementById('fi_adjStart').value : '';
                      const adjEndVal = (document.getElementById('fi_adjEnd') && document.getElementById('fi_adjEnd').value) ? document.getElementById('fi_adjEnd').value : '';
                      const adjStartDate = adjStartVal ? new Date(adjStartVal) : null;
                      const adjEndDate = adjEndVal ? new Date(adjEndVal) : null;
                      function _sameDay(d1, d2) {
                        try { const x = new Date(d1); const y = new Date(d2); return x && y && !isNaN(x.getTime()) && !isNaN(y.getTime()) && x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); } catch (e) { return false; }
                      }
                      function _birthWeightFor(l, birth) {
                        try {
                          let bw = parseFloat(l.birthWeight || l.birth_weight || l.birthWeightKg || l.birth_weight_kg || NaN);
                          if (!isNaN(bw) && bw > 0) return bw;
                          if (Array.isArray(l.weights) && birth) {
                            const vals = [];
                            for (let i = 0; i < l.weights.length; i++) {
                              try {
                                const it = l.weights[i];
                                const wt = (it && (it.weight !== undefined)) ? parseFloat(it.weight) : (it && (it.w !== undefined) ? parseFloat(it.w) : NaN);
                                const dt = it && (it.date || it.d || it.weightDate || it.dateRecorded) ? (it.date || it.d || it.weightDate || it.dateRecorded) : null;
                                if (!isNaN(wt) && wt > 0 && dt && _sameDay(dt, birth)) vals.push(wt);
                              } catch (e) { }
                            }
                            if (vals.length) return vals.reduce((s, v) => s + v, 0) / vals.length;
                          }
                        } catch (e) { }
                        return null;
                      }

                      lambs.forEach(l => {
                        try {
                          const birthRaw = l.birthDate || l.birthdate || '';
                          const birth = birthRaw ? new Date(birthRaw) : null;
                          if (!birth || isNaN(birth)) return;
                          // Prefer global window filtering; otherwise fall back to the local date inputs
                          try {
                            if (window && typeof window.isInGlobalWindow === 'function') {
                              if (!window.isInGlobalWindow(birth)) return;
                            } else if ((adjStartDate || adjEndDate)) {
                              if (adjStartDate && !isNaN(adjStartDate.getTime()) && birth.getTime() < adjStartDate.getTime()) return;
                              if (adjEndDate && !isNaN(adjEndDate.getTime())) {
                                const eEnd = adjEndDate.getTime() + (24 * 60 * 60 * 1000 - 1);
                                if (birth.getTime() > eEnd) return;
                              }
                            }
                          } catch (e) { }

                          const bW = _birthWeightFor(l, birth) || 0;
                          // try to find a recorded wean/latest weight and date
                          const w = parseFloat(l.weaningWeight || l.weanWeight || l.weightAtWean || l.latestWeight || l.weight || 0) || 0;
                          const wDateRaw = l.weanDate || l.wean_date || l.latestWeightDate || l.weightDate || l.weight_date || '';
                          const wDate = wDateRaw ? new Date(wDateRaw) : null;
                          // If a date range is specified, restrict to lambs (by birth) above; additionally if a wean weight is required for adjusted wean we still need a weight date inside range
                          try {
                            if ((adjStartDate || adjEndDate) && (!wDate || isNaN(wDate.getTime()))) {
                              // allow lambs without wean weight if only birth-based listing was requested
                            }
                            if ((adjStartDate || adjEndDate) && wDate && !isNaN(wDate.getTime())) {
                              if (adjStartDate && !isNaN(adjStartDate.getTime()) && wDate.getTime() < adjStartDate.getTime()) return;
                              if (adjEndDate && !isNaN(adjEndDate.getTime())) {
                                const eEnd = adjEndDate.getTime() + (24 * 60 * 60 * 1000 - 1);
                                if (wDate.getTime() > eEnd) return;
                              }
                            }
                          } catch (e) { }
                          const ageDays = (wDate && !isNaN(wDate)) ? Math.max(1, Math.round((wDate.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24))) : null;

                          // adjusted wean weight: linear interpolate from birth weight to recorded weight to standard age
                          let adjWean = null;
                          if (w && ageDays && ageDays > 0) {
                            if (bW && bW > 0) {
                              const dailyGain = (w - bW) / ageDays;
                              adjWean = Math.round((bW + (dailyGain * stdAgeElVal)) * 100) / 100;
                            } else {
                              const dailyGain = w / ageDays;
                              adjWean = Math.round((dailyGain * stdAgeElVal) * 100) / 100;
                            }
                          }

                          // determine litter size: try explicit field(s) else derive by counting same-dam same-birthdate
                          let litterSize = parseInt(l.litterSize || l.litter_size || l.litter || l.siblingCount || 0, 10) || 0;
                          if (!litterSize || litterSize < 1) {
                            try {
                              const same = (all || []).filter(x => x && x.dam && ((x.dam || '').toString().trim() === (l.dam || '').toString().trim()) && ((new Date(x.birthDate || x.birthdate || '')).toDateString() === birth.toDateString()));
                              litterSize = same.length || 1;
                            } catch (e) { litterSize = 1; }
                          }

                          // adjusted birth weight: correct for litter size (simple correction factor)
                          let adjBirth = null;
                          if (bW && bW > 0) {
                            const factor = 1 + ((1 - (1 / (litterSize || 1))) * 0.08); // 8% adjustment per difference from singleton
                            adjBirth = Math.round((bW * factor) * 100) / 100;
                          }

                          rows.push({ id: l.id || l.name || '', name: l.name || l.tag || l.id || '', dam: l.dam || '', birthDate: birthRaw, birthW: bW || null, adjBirth: adjBirth, weanW: w || null, weanDate: wDateRaw || null, ageDays: ageDays, adjWean: adjWean });
                        } catch (e) { }
                      });
                      // sort by adjusted wean weight descending (fallback to adjusted birth)
                      rows.sort((a, b) => (b.adjWean || b.adjBirth || 0) - (a.adjWean || a.adjBirth || 0));
                      html += '<div style="max-height:260px;overflow:auto;border:1px solid #eef2f7;padding:8px;border-radius:6px;background:#fff">';
                      html += '<table style="width:100%;font-size:13px;border-collapse:collapse">';
                      html += '<thead><tr><th style="text-align:left;padding:6px">Lamb</th><th style="text-align:left;padding:6px">Birth Date</th><th style="text-align:right;padding:6px">Birth</th><th style="text-align:right;padding:6px">Adj birth</th><th style="text-align:right;padding:6px">Wean (age)</th><th style="text-align:right;padding:6px">Adj wean</th></tr></thead>';
                      html += '<tbody>';
                      rows.slice(0, 50).forEach(r => {
                        const bDateText = r.birthDate ? (typeof formatDateLong === 'function' ? formatDateLong(r.birthDate) : r.birthDate) : '';
                        html += `<tr><td style="padding:4px 6px">${r.name}${r.dam ? ' — dam:' + r.dam : ''}</td><td style="text-align:left;padding:4px 6px">${escapeHtml(bDateText)}</td><td style="text-align:right;padding:4px 6px">${r.birthW !== null ? r.birthW : 'N/A'}</td><td style="text-align:right;padding:4px 6px">${r.adjBirth !== null ? r.adjBirth : 'N/A'}</td><td style="text-align:right;padding:4px 6px">${r.weanW !== null ? r.weanW : 'N/A'}${r.ageDays ? ' (' + r.ageDays + 'd)' : ''}</td><td style="text-align:right;padding:4px 6px">${r.adjWean !== null ? r.adjWean : 'N/A'}</td></tr>`;
                      });
                      html += '</tbody></table></div>';
                      container.innerHTML = html;
                      // wire recalc button & input and persist chosen date range to saved window
                      const rec = document.getElementById('fi_recalcAdj');
                      const adjStartEl = document.getElementById('fi_adjStart');
                      const adjEndEl = document.getElementById('fi_adjEnd');
                      const winSel = document.getElementById('fi_adjWindow');
                      try {
                        if (winSel) {
                          try {
                            const gw = (window.getGlobalTimeWindow ? window.getGlobalTimeWindow() : (typeof getSavedWindow === 'function' ? getSavedWindow() : { type: 'thisYear' }));
                            winSel.value = gw.type || 'thisYear';
                          } catch (e) { winSel.value = 'thisYear'; }
                          const setCustomDisplay = () => {
                            try {
                              const adjStart = document.getElementById('fi_adjStart');
                              const adjEnd = document.getElementById('fi_adjEnd');
                              if (winSel.value === 'custom') {
                                if (adjStart) adjStart.style.display = '';
                                if (adjEnd) adjEnd.style.display = '';
                              } else {
                                if (adjStart) adjStart.style.display = 'none';
                                if (adjEnd) adjEnd.style.display = 'none';
                              }
                            } catch (e) { }
                          };
                          setCustomDisplay();
                          winSel.addEventListener('change', () => {
                            try {
                              const newW = (window.getGlobalTimeWindow ? window.getGlobalTimeWindow() : (typeof getSavedWindow === 'function' ? getSavedWindow() : { type: 'thisYear' }));
                              newW.type = winSel.value;
                              if (winSel.value === 'custom') {
                                if (adjStartEl) newW.start = adjStartEl.value || '';
                                if (adjEndEl) newW.end = adjEndEl.value || '';
                              } else {
                                try { delete newW.start; delete newW.end; } catch (e) { }
                              }
                              if (window.saveGlobalTimeWindow) window.saveGlobalTimeWindow(newW); else if (typeof saveWindow === 'function') saveWindow(newW);
                            } catch (e) { }
                            try { if (window.refreshDashboardWidgets) window.refreshDashboardWidgets(); else renderAdjustedWeights(); } catch (e) { try { renderAdjustedWeights(); } catch (e) { } }
                          });
                        }
                      } catch (e) { }
                      try {
                        if (adjStartEl) {
                          adjStartEl.addEventListener('change', () => {
                            try { const w = getSavedWindow(); w.start = adjStartEl.value || ''; saveWindow(w); } catch (e) { }
                          });
                        }
                        if (adjEndEl) {
                          adjEndEl.addEventListener('change', () => {
                            try { const w = getSavedWindow(); w.end = adjEndEl.value || ''; saveWindow(w); } catch (e) { }
                          });
                        }
                      } catch (e) { }
                      if (rec) {
                        rec.addEventListener('click', () => {
                          try {
                            const w = getSavedWindow();
                            if (adjStartEl) w.start = adjStartEl.value || '';
                            if (adjEndEl) w.end = adjEndEl.value || '';
                            saveWindow(w);
                          } catch (e) { }
                          renderAdjustedWeights();
                        });
                      }
                    } catch (e) { }
                  }
                  // initial render
                  try { renderAdjustedWeights(); } catch (e) { }
                } catch (e) { }

                // top expenses in window
                try {
                  const topEl = document.getElementById('fi_topExpenses');
                  if (topEl) {
                    // group entriesInWindow expenses by category/desc
                    const cmap = {};
                    (entriesInWindow || []).forEach(en => { try { const t = en.type || ''; if (t.toString().toLowerCase().indexOf('exp') !== 0 && t.toString().toLowerCase().indexOf('out') !== 0) return; const k = (en.category || en.cat || en.desc || 'Other').toString().trim() || 'Other'; cmap[k] = (cmap[k] || 0) + (parseFloat(en.amount) || 0); } catch (e) { } });
                    const tops = Object.keys(cmap).map(k => ({ k, v: cmap[k] })).sort((a, b) => b.v - a.v).slice(0, 5);
                    if (!tops.length) topEl.innerHTML = '<div class="muted">No expenses in window</div>';
                    else topEl.innerHTML = '<div style="font-weight:600">Top expenses</div>' + tops.map(t => `<div style="font-size:13px;padding:2px 0">${t.k}: $${(Math.round(t.v * 100) / 100).toLocaleString()}</div>`).join('');
                  }
                } catch (e) { }
              } catch (e) { /* non-fatal */ }
            } catch (e) { }
          } catch (e) { summaryWrap.innerHTML = '<div class="muted">Summary unavailable</div>'; }

        } catch (e) { }
      }

      // wire input handlers
      try {
        const els = ['fi_eweValue', 'fi_ramValue', 'fi_pricePerLb', 'fi_feedAdult', 'fi_feedYearling', 'fi_feedLamb', 'fi_supplementPerDay', 'fi_mineralPerMonth', 'fi_feedWastePct', 'fi_feedStart', 'fi_feedEnd', 'fi_expenseCategories'];
        els.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          el.addEventListener('change', () => {
            try {
              const s = loadFiSettings();
              s.eweValue = parseFloat(document.getElementById('fi_eweValue').value) || DEFAULT_EWE_VALUE;
              s.ramValue = parseFloat(document.getElementById('fi_ramValue').value) || DEFAULT_RAM_VALUE;
              // unknown value removed; unknowns use ewe value
              s.pricePerLb = parseFloat(document.getElementById('fi_pricePerLb').value) || DEFAULT_PRICE_PER_LB;
              s.feedAdult = parseFloat(document.getElementById('fi_feedAdult').value) || DEFAULT_FEED_ADULT;
              s.feedYearling = parseFloat(document.getElementById('fi_feedYearling').value) || DEFAULT_FEED_YEARLING;
              s.feedLamb = parseFloat(document.getElementById('fi_feedLamb').value) || DEFAULT_FEED_LAMB;
              s.supplementPerDay = parseFloat(document.getElementById('fi_supplementPerDay').value) || DEFAULT_SUPPLEMENT_PER_DAY;
              s.mineralPerMonth = parseFloat(document.getElementById('fi_mineralPerMonth').value) || DEFAULT_MINERAL_PER_MONTH;
              s.feedWastePct = parseFloat(document.getElementById('fi_feedWastePct').value) || DEFAULT_FEED_WASTE_PCT;
              s.feedStartMonth = parseInt(document.getElementById('fi_feedStart').value, 10) || DEFAULT_FEED_START;
              s.feedEndMonth = parseInt(document.getElementById('fi_feedEnd').value, 10) || DEFAULT_FEED_END;
              s.expenseCategories = (document.getElementById('fi_expenseCategories').value || '');

              saveFiSettings(s);
              renderFinance();
            } catch (e) { }
          });
        });
        // Save button (explicit save + feedback)
        try {
          const saveBtn = document.getElementById('fi_saveSettingsBtn');
          const statusEl = document.getElementById('fi_savedStatus');
          if (saveBtn) saveBtn.addEventListener('click', () => {
            try {
              const s = loadFiSettings();
              s.eweValue = parseFloat(document.getElementById('fi_eweValue').value) || DEFAULT_EWE_VALUE;
              s.ramValue = parseFloat(document.getElementById('fi_ramValue').value) || DEFAULT_RAM_VALUE;
              // unknown value removed; unknowns use ewe value

              s.pricePerLb = parseFloat(document.getElementById('fi_pricePerLb').value) || DEFAULT_PRICE_PER_LB;
              s.feedAdult = parseFloat(document.getElementById('fi_feedAdult').value) || DEFAULT_FEED_ADULT;
              s.feedYearling = parseFloat(document.getElementById('fi_feedYearling').value) || DEFAULT_FEED_YEARLING;
              s.feedLamb = parseFloat(document.getElementById('fi_feedLamb').value) || DEFAULT_FEED_LAMB;
              s.supplementPerDay = parseFloat(document.getElementById('fi_supplementPerDay').value) || DEFAULT_SUPPLEMENT_PER_DAY;
              s.mineralPerMonth = parseFloat(document.getElementById('fi_mineralPerMonth').value) || DEFAULT_MINERAL_PER_MONTH;
              s.feedWastePct = parseFloat(document.getElementById('fi_feedWastePct').value) || DEFAULT_FEED_WASTE_PCT;
              s.feedStartMonth = parseInt(document.getElementById('fi_feedStart').value, 10) || DEFAULT_FEED_START;
              s.feedEndMonth = parseInt(document.getElementById('fi_feedEnd').value, 10) || DEFAULT_FEED_END;
              s.expenseCategories = (document.getElementById('fi_expenseCategories').value || '');

              saveFiSettings(s);
              renderFinance();
              if (statusEl) {
                statusEl.textContent = 'Saved';
                setTimeout(() => { try { statusEl.textContent = 'Values editable — saved to browser'; } catch (e) { } }, 2000);
              }
            } catch (e) { if (statusEl) statusEl.textContent = 'Save failed'; }
          });
        } catch (e) { }
      } catch (e) { }

      // add entry form
      try {
        document.getElementById('fi_addEntryBtn').addEventListener('click', () => {
          try {
            const d = document.getElementById('fi_entryDate').value || new Date().toISOString().slice(0, 10);
            const amt = parseFloat(document.getElementById('fi_entryAmount').value) || 0;
            const type = document.getElementById('fi_entryType').value || 'expense';
            const cat = document.getElementById('fi_entryCategory').value || '';
            const forSheep = document.getElementById('fi_entryFor').value || '';
            if (!amt) return alert('Enter an amount');
            const arr = loadEntries();
            const id = 'f' + Date.now();
            const mappedType = (type === 'expense') ? 'output' : 'income';
            const desc = (cat || '') + (forSheep ? (' — Sheep:' + forSheep) : '');
            const entryObj = { id: id, date: d, amount: Math.round(amt * 100) / 100, type: mappedType, desc: desc };
            try {
              const forSheepValRaw = (document.getElementById('fi_entryFor').value || '').toString().trim();
              let forSheepVal = forSheepValRaw;
              if (forSheepVal) {
                // If the datalist provided a 'Name — id' format, try to extract the id portion
                try {
                  if (forSheepVal.indexOf('—') !== -1) {
                    const parts = forSheepVal.split('—').map(p => p.trim());
                    // prefer last part as id when present
                    if (parts.length > 1 && parts[parts.length - 1]) forSheepVal = parts[parts.length - 1];
                  } else if (forSheepVal.indexOf(' - ') !== -1) {
                    const parts = forSheepVal.split(' - ').map(p => p.trim());
                    if (parts.length > 1 && parts[parts.length - 1]) forSheepVal = parts[parts.length - 1];
                  } else if (forSheepVal.match(/\(|\)/)) {
                    // extract id inside parentheses if present: "Name (id)"
                    const m = forSheepVal.match(/\(([^)]+)\)/);
                    if (m && m[1]) forSheepVal = m[1].trim();
                  }
                } catch (e) { }
                // try to resolve to a sheep record and store explicit eweId for precise ledger matching
                try {
                  const resolved = (typeof findSheepByNameOrId === 'function') ? findSheepByNameOrId(forSheepVal) : null;
                  if (resolved && resolved.id) entryObj.eweId = resolved.id;
                  else if (forSheepVal) entryObj.eweId = forSheepVal;
                } catch (e) { entryObj.eweId = forSheepVal; }
              }
            } catch (e) { }
            arr.push(entryObj);
            saveEntries(arr);
            document.getElementById('fi_entryAmount').value = '';
            document.getElementById('fi_entryFor').value = '';
            document.getElementById('fi_entryCategory').value = '';
            renderFinance();
          } catch (e) { }
        });
      } catch (e) { }

      // initial render
      renderFinance();
      // Ensure widgets are collapsible: add toggle buttons and persist collapsed state
      try {
        function ensureWidgetCollapsibles(rootSelector) {
          try {
            console.debug('ensureWidgetCollapsibles: start');
            const root = document.getElementById('breedingFinanceWidget') || document.getElementById('breedingFinanceWidget') || document.getElementById('breedingFinanceWidget');
            console.debug('ensureWidgetCollapsibles: root=', root);
            const storeKey = 'breeding-widget-collapsed';
            let collapsedMap = {};
            try { collapsedMap = JSON.parse(localStorage.getItem(storeKey) || '{}') || {}; } catch (e) { collapsedMap = {}; }

            function makeToggleFor(el, key) {
              try {
                console.debug('makeToggleFor: called', { key: key, el: el });
                if (!el) { console.debug('makeToggleFor: no element for key', key); return; }
                if (el.dataset && el.dataset.hasToggle) { console.debug('makeToggleFor: already has toggle', key); return; } // already wired
                // Ensure we can absolutely position inside this element
                try {
                  const cs = window.getComputedStyle(el);
                  console.debug('makeToggleFor: computedStyle.position=', cs && cs.position);
                  if (cs && cs.position === 'static') { el.style.position = 'relative'; console.debug('makeToggleFor: set position:relative for', key); }
                } catch (e) { console.warn('makeToggleFor: getComputedStyle failed', e); }

                // mark as collapsible so CSS rules apply
                try { el.classList.add('wm-collapsible'); console.debug('makeToggleFor: added wm-collapsible for', key); } catch (e) { }

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'widget-toggle';
                btn.setAttribute('aria-label', 'Toggle widget');

                const isCollapsed = !!collapsedMap[key];
                if (isCollapsed) {
                  try { el.classList.add('wm-collapsed'); } catch (e) { }
                } else {
                  try { el.classList.remove('wm-collapsed'); } catch (e) { }
                }
                btn.textContent = isCollapsed ? '+' : '−';
                btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');

                btn.addEventListener('click', (ev) => {
                  try {
                    const nowCollapsed = el.classList.toggle('wm-collapsed');
                    btn.textContent = nowCollapsed ? '+' : '−';
                    btn.setAttribute('aria-expanded', nowCollapsed ? 'false' : 'true');
                    if (nowCollapsed) collapsedMap[key] = true; else delete collapsedMap[key];
                    try { localStorage.setItem(storeKey, JSON.stringify(collapsedMap)); } catch (e) { }
                  } catch (e) { }
                });

                // insert button as first child so the header (2nd child) remains visible when collapsed
                try { el.insertBefore(btn, el.firstChild); console.debug('makeToggleFor: inserted toggle for', key); } catch (e) { try { el.appendChild(btn); console.debug('makeToggleFor: appended toggle for', key); } catch (ee) { console.warn('makeToggleFor: failed to insert or append toggle', ee); } }
                if (!el.dataset) el.dataset = {};
                el.dataset.hasToggle = '1';
                console.debug('makeToggleFor: done for', key);
              } catch (e) { console.warn('makeToggleFor: unexpected error', e); }
            }

            if (root) {
              // remove any existing widget-toggle buttons globally (we'll re-attach only to the three main sections)
              try { Array.from(document.querySelectorAll('.widget-toggle')).forEach(b => { try { b.remove(); } catch (e) { } }); } catch (e) { }
              // attach toggles only to the three main sections: Breeding summary, Financial snapshot, Lambs adjusted by weights
              const ids = ['breedingSummary', 'breedingFinanceWidget', 'fi_adjustedWeights'];
              ids.forEach(id => {
                try {
                  const el = document.getElementById(id);
                  if (!el) return;
                  makeToggleFor(el, id);
                } catch (e) { }
              });
            }
          } catch (e) { }
        }

        // run once and then observe for changes to re-attach toggles
        try { ensureWidgetCollapsibles(); } catch (e) { }
        try {
          if (window.MutationObserver) {
            const observeTargets = [document.getElementById('breedingFinanceWidget'), document.getElementById('breedingSummary'), document.getElementById('fi_adjustedWeights')];
            const mo = new MutationObserver(() => { try { ensureWidgetCollapsibles(); } catch (e) { } });
            observeTargets.forEach(t => { try { if (t) mo.observe(t, { childList: true, subtree: true }); } catch (e) { } });
            // as a fallback observe body for broader changes
            try { mo.observe(document.body, { childList: true, subtree: true }); } catch (e) { }
          }
        } catch (e) { }
      } catch (e) { }
    } catch (e) { console.warn('finance widget failed', e); }

    // --- Drag & drop reordering helpers ---
    function saveOrder(key, keys) { try { localStorage.setItem(key, JSON.stringify(keys)); } catch (e) { } }
    function loadOrder(key) { try { const raw = localStorage.getItem(key); if (!raw) return null; return JSON.parse(raw); } catch (e) { return null; } }

    function enableDragSort(containerEl, itemSelector, storageKey) {
      if (!containerEl) return;
      let dragKey = null;
      containerEl.addEventListener('dragstart', (ev) => {
        const el = ev.target.closest(itemSelector);
        if (!el) return;
        dragKey = el.dataset.key || null;
        try { ev.dataTransfer.setData('text/plain', dragKey || ''); } catch (e) { }
        ev.dataTransfer.effectAllowed = 'move';
      });
      containerEl.addEventListener('dragover', (ev) => { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; });
      containerEl.addEventListener('drop', (ev) => {
        ev.preventDefault();
        const target = ev.target.closest(itemSelector);
        if (!dragKey) return;
        const src = containerEl.querySelector(`[data-key="${dragKey}"]`);
        if (!src) return;
        if (!target || src === target) return;
        // determine insert position
        const rect = target.getBoundingClientRect();
        const after = (ev.clientY - rect.top) > (rect.height / 2);
        if (after) {
          target.insertAdjacentElement('afterend', src);
        } else {
          target.insertAdjacentElement('beforebegin', src);
        }
        // persist order
        const keys = Array.from(containerEl.querySelectorAll(itemSelector)).map(x => x.dataset.key || '');
        saveOrder(storageKey, keys);
      });
      // make items draggable
      Array.from(containerEl.querySelectorAll(itemSelector)).forEach(it => { it.setAttribute('draggable', 'true'); });
    }

    // Restore saved card order into a combined grid: put both small stat cards
    // and chart cards into `#breedingCards` so they can be interleaved.
    (function restoreCards() {
      const cardOrder = loadOrder('breeding-card-order');
      const cardsWrap = document.getElementById('breedingCards');
      const statsWrap = document.getElementById('breedingStatsPanel');
      if (cardOrder && statsWrap && cardsWrap) {
        cardOrder.forEach(k => {
          try {
            const el = statsWrap.querySelector(`[data-key="${k}"]`);
            if (!el) return;
            cardsWrap.appendChild(el);
          } catch (e) { }
        });
      } else if (statsWrap && cardsWrap) {
        // fallback: move any existing cards/chart-cards into combined grid
        Array.from(statsWrap.querySelectorAll('.breeding-card, .chart-card')).forEach(el => {
          try { cardsWrap.appendChild(el); } catch (e) { }
        });
      }
      // enable dragging for both small cards and chart cards inside the combined grid
      if (cardsWrap) enableDragSort(cardsWrap, '.breeding-card, .chart-card', 'breeding-card-order');
    })();

    // Restore saved panel order for wrapper (panels: stats, close)
    (function restorePanels() {
      const panelOrder = loadOrder('breeding-panel-order');
      const wrap = document.getElementById('breedingWrapper');
      if (panelOrder && wrap) {
        const map = {};
        Array.from(wrap.children).forEach(c => { if (c.dataset && c.dataset.key) map[c.dataset.key] = c; });
        panelOrder.forEach(k => { try { const el = map[k]; if (el) wrap.appendChild(el); } catch (e) { } });
      }
      enableDragSort(wrap, '.draggable-panel', 'breeding-panel-order');
    })();

    // Controls: Reset layout and small legend
    try {
      const statsEl = document.getElementById('breedingStatsPanel');
      if (statsEl) {
        // controls container (placed at top-right)
        const ctrl = document.createElement('div'); ctrl.className = 'breeding-controls';
        const resetBtn = document.createElement('button'); resetBtn.type = 'button'; resetBtn.className = 'button'; resetBtn.textContent = 'Reset layout';
        resetBtn.addEventListener('click', () => {
          try {
            localStorage.removeItem('breeding-card-order');
            localStorage.removeItem('breeding-panel-order');
            localStorage.removeItem('breeding-hidden-cards');
          } catch (e) { }
          try { renderBreedingSummary(); } catch (e) { }
        });
        ctrl.appendChild(resetBtn);
        // hide-select and button: choose a visible tile to hide
        const hideSelect = document.createElement('select'); hideSelect.id = 'breedingHideSelect'; hideSelect.style.marginLeft = '10px'; hideSelect.style.padding = '6px';
        const hideBtn = document.createElement('button'); hideBtn.type = 'button'; hideBtn.className = 'button'; hideBtn.textContent = 'Hide selected'; hideBtn.style.marginLeft = '8px';
        hideBtn.addEventListener('click', () => {
          try {
            const key = (hideSelect.value || '').trim();
            if (!key) return;
            const cur = loadHidden();
            if (cur.indexOf(key) === -1) cur.push(key);
            localStorage.setItem('breeding-hidden-cards', JSON.stringify(cur));
            renderBreedingSummary();
          } catch (e) { }
        });
        ctrl.appendChild(hideSelect);
        ctrl.appendChild(hideBtn);
        // small legend
        const legend = document.createElement('div'); legend.className = 'breeding-legend';
        legend.innerHTML = `<strong>Legend:</strong> <span class="muted">Conception: percent of ewes recorded bred; Twinning: percent lambings >1; Lambs/yr: child records by birth year; Avg BW: monthly avg birth weight</span>`;
        ctrl.appendChild(legend);
        // populate hideSelect with visible tiles
        try {
          setTimeout(() => {
            try {
              const sel = document.getElementById('breedingHideSelect');
              if (!sel) return;
              sel.innerHTML = '';
              const statsPanel = document.getElementById('breedingStatsPanel');
              if (!statsPanel) return;
              const items = statsPanel.querySelectorAll('.breeding-card, .chart-card');
              Array.from(items).forEach(it => {
                try {
                  const k = it.dataset && it.dataset.key ? it.dataset.key : null;
                  const label = it.querySelector('.breeding-card-label') ? it.querySelector('.breeding-card-label').textContent : (it.querySelector('.chart-title') ? it.querySelector('.chart-title').textContent : k);
                  if (!k) return;
                  // only list items that are not already hidden
                  const hidden = loadHidden();
                  if ((hidden || []).indexOf(k) !== -1) return;
                  const opt = document.createElement('option'); opt.value = k; opt.textContent = label || k; sel.appendChild(opt);
                } catch (e) { }
              });
            } catch (e) { }
          }, 60);
        } catch (e) { }
        // insert at top of stats
        statsEl.insertBefore(ctrl, statsEl.firstChild);
      }
    } catch (e) { }
  } catch (e) { try { console.warn('renderBreedingSummary failed', e); } catch (ee) { } }
}

// Nursing window in days: configurable via Settings (localStorage key 'nursingWindowDays')
function getNursingWindowDays() {
  try {
    const raw = localStorage.getItem('nursingWindowDays');
    const v = parseInt(raw, 10);
    return (isNaN(v) || v < 0) ? 90 : v;
  } catch (e) { return 90; }
}

// Sync status UI helpers
function _getShareStatusEl() {
  try {
    let el = document.getElementById('shareLanStatus');
    if (el) return el;
    const container = document.getElementById('topActionShortcuts');
    if (!container) return null;
    el = document.createElement('div');
    el.id = 'shareLanStatus';
    el.style.marginLeft = '12px';
    el.style.fontSize = '12px';
    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.innerHTML = `<span id="shareLanStatusDot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#ddd;margin-right:8px;"></span><span id="shareLanStatusText" style="color:#333">Sync: idle</span>`;
    container.appendChild(el);
    return el;
  } catch (e) { return null; }
}

function setShareStatus(state, message) {
  // state: 'idle'|'syncing'|'ok'|'error'
  try {
    const el = _getShareStatusEl();
    if (!el) return;
    const dot = document.getElementById('shareLanStatusDot');
    const txt = document.getElementById('shareLanStatusText');
    if (dot) {
      if (state === 'syncing') { dot.style.background = '#f59e0b'; dot.style.boxShadow = '0 0 6px rgba(245,158,11,0.6)'; }
      else if (state === 'ok') { dot.style.background = '#10b981'; dot.style.boxShadow = '0 0 6px rgba(16,185,129,0.6)'; }
      else if (state === 'error') { dot.style.background = '#ef4444'; dot.style.boxShadow = '0 0 6px rgba(239,68,68,0.6)'; }
      else { dot.style.background = '#d1d5db'; dot.style.boxShadow = 'none'; }
    }
    if (txt) {
      const time = new Date();
      if (state === 'ok') txt.textContent = `Last sync: ${time.toLocaleString()}`;
      else if (state === 'syncing') txt.textContent = message || 'Syncing…';
      else if (state === 'error') txt.textContent = `Sync error: ${message || 'unknown'}`;
      else txt.textContent = 'Sync: idle';
    }
    try { if (state === 'ok') localStorage.setItem('shareLanLastSync', new Date().toISOString()); } catch (e) { }
  } catch (e) { }
}

// Share current sheep data to the local server so it's available on the LAN
function shareDataToLAN(options) {
  // options: { silent: boolean, retries: number }
  const opts = Object.assign({ silent: false, retries: 0 }, options || {});
  const attempt = (attemptNum) => {
    try {
      if (!opts.silent) setShareStatus('syncing', 'Uploading...'); else setShareStatus('syncing', 'Auto-syncing...');
      const payload = {
        exportedAt: new Date().toISOString(),
        sheepList: (() => { try { return JSON.parse(localStorage.getItem('sheepList') || '[]'); } catch (e) { return []; } })(),
        sheepRecords: getAllSheep() || [],
        meta: { origin: window.location.href }
      };
      const url = '/api/sheep';
      const token = (function () { try { return localStorage.getItem('shareLanToken') || null; } catch (e) { return null; } })();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['X-API-Key'] = token;
      return fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) }).then(resp => {
        const ct = resp.headers.get('content-type') || '';
        if (!resp.ok) {
          return resp.text().then(text => {
            let parsed = null;
            try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
            const errMsg = (parsed && parsed.error) ? parsed.error : (text && text.trim()) ? text.trim() : `HTTP ${resp.status} ${resp.statusText}`;
            throw new Error(errMsg);
          });
        }
        if (ct.indexOf('application/json') !== -1) return resp.json();
        return resp.text().then(text => {
          if (!text || !text.trim()) return { ok: true, path: '/api/sheep' };
          try { return JSON.parse(text); } catch (e) { return { ok: true, path: '/api/sheep', raw: text }; }
        });
      }).then(js => {
        try {
          if (js && js.ok) {
            setShareStatus('ok');
            if (!opts.silent) {
              const host = location.hostname || 'localhost';
              const port = location.port || (location.protocol === 'https:' ? '443' : '80');
              const accessUrl = `${location.protocol}//${host}${port && port !== '80' && port !== '443' ? (':' + port) : ''}${js.path || '/api/sheep'}`;
              alert('Data shared on LAN. Access it at: ' + accessUrl);
            }
            return js;
          } else {
            const emsg = (js && js.error) ? js.error : (js && js.raw) ? js.raw : 'unknown';
            throw new Error(emsg);
          }
        } catch (e) { throw e; }
      }).catch(err => {
        // Retry logic
        const remaining = (opts.retries || 0) - attemptNum;
        if (remaining > 0) {
          const delay = Math.min(30000, Math.pow(2, attemptNum) * 1000); // exponential backoff
          setShareStatus('error', `Retrying in ${Math.round(delay / 1000)}s: ${err && err.message ? err.message : err}`);
          return new Promise((resolve) => setTimeout(resolve, delay)).then(() => attempt(attemptNum + 1));
        }
        // final failure
        setShareStatus('error', err && err.message ? err.message : String(err));
        if (!opts.silent) alert('Failed to share data to server: ' + String(err && err.message ? err.message : err));
        throw err;
      });
    } catch (e) {
      setShareStatus('error', e && e.message ? e.message : String(e));
      if (!opts.silent) alert('Failed to prepare data for sharing: ' + String(e));
      return Promise.reject(e);
    }
  };
  return attempt(0);
}

// Add a Share on LAN button to the top shortcuts so user can push data to server
window.addEventListener('DOMContentLoaded', () => {
  try {
    const shortcuts = document.getElementById('topActionShortcuts');
    if (!shortcuts) return;
    if (document.getElementById('shareLanBtn')) return; // already present
    const btn = document.createElement('a');
    btn.className = 'button';
    btn.id = 'shareLanBtn';
    btn.href = '#';
    btn.textContent = 'Share on LAN';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!confirm('This will upload your sheep data to the local server and make it available on your LAN. Continue?')) return;
      try {
        // prompt for token (optional) and save
        try {
          const cur = localStorage.getItem('shareLanToken') || '';
          const t = prompt('Enter API token for server (leave blank for none):', cur || '');
          if (t !== null) {
            if (t === '') localStorage.removeItem('shareLanToken'); else localStorage.setItem('shareLanToken', t);
          }
        } catch (e) { }
        shareDataToLAN({ silent: false, retries: 2 }).catch(() => { });
      } catch (err) { alert('Share failed: ' + String(err)); }
    });
    shortcuts.appendChild(btn);

    // Auto-sync checkbox
    try {
      const autoWrap = document.createElement('label'); autoWrap.style.marginLeft = '8px'; autoWrap.style.display = 'inline-flex'; autoWrap.style.alignItems = 'center';
      const chk = document.createElement('input'); chk.type = 'checkbox'; chk.id = 'shareLanAuto'; chk.style.marginRight = '6px';
      const curAuto = localStorage.getItem('shareLanAuto'); if (curAuto === '1') chk.checked = true;
      chk.addEventListener('change', () => {
        try { if (chk.checked) localStorage.setItem('shareLanAuto', '1'); else localStorage.removeItem('shareLanAuto'); } catch (e) { }
      });
      autoWrap.appendChild(chk);
      const lbl = document.createElement('span'); lbl.textContent = 'Auto-sync'; autoWrap.appendChild(lbl);
      shortcuts.appendChild(autoWrap);
    } catch (e) { }
  } catch (e) { /* ignore */ }
});
// Lambing modal size controls removed: expand/shrink buttons and handlers

// Render full breeding details page charts into #breedingDetails
function renderBreedingDetails() {
  try {
    const container = document.getElementById('breedingDetails');
    if (!container) return;
    container.innerHTML = '';
    const all = JSON.parse(localStorage.getItem('sheepList') || '[]');
    const now = new Date();

    // Reuse computations: lambs per year
    const yearCounts = {};
    (all || []).forEach(a => {
      try {
        if (!a || !a.dam) return;
        const bdRaw = a.birthDate || a.birthdate || '';
        if (!bdRaw) return;
        const y = new Date(bdRaw).getFullYear();
        if (isNaN(y)) return;
        yearCounts[y] = (yearCounts[y] || 0) + 1;
      } catch (e) { }
    });
    const years = Object.keys(yearCounts).map(Number).sort((a, b) => a - b);
    const values = years.map(y => yearCounts[y] || 0);

    // Large bar chart
    const maxVal = Math.max.apply(null, values.concat([1]));
    const barW = 36; const barH = 220;
    let bars = `<svg viewBox="0 0 ${Math.max(200, years.length * (barW + 12))} ${barH}" xmlns="http://www.w3.org/2000/svg">`;
    years.forEach((y, i) => {
      const v = yearCounts[y] || 0;
      const h = Math.round((v / maxVal) * (barH - 40));
      const x = i * (barW + 12);
      const yPos = barH - h - 20;
      bars += `<rect x="${x}" y="${yPos}" width="${barW}" height="${h}" fill="#60a5fa" rx="6"></rect>`;
      bars += `<text x="${x + barW / 2}" y="${yPos - 8}" font-size="12" text-anchor="middle" fill="#333">${v}</text>`;
      bars += `<text x="${x + barW / 2}" y="${barH - 2}" font-size="12" text-anchor="middle" fill="#333">${y}</text>`;
    });
    bars += `</svg>`;
    const yearsBox = document.createElement('div'); yearsBox.className = 'full-chart'; yearsBox.innerHTML = `<h3>Lambs per Year</h3><div>${bars}</div>`;
    container.appendChild(yearsBox);

    // Conception rate last 12 months (breds)
    const monthKeys = [];
    const monthSets = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthKeys.push(key); monthSets[key] = new Set();
    }
    const ewes = (all || []).filter(s => { try { return ((s.sex || '').toString().toLowerCase() === 'ewe') && isActiveStatus(s.status); } catch (e) { return false; } });
    ewes.forEach(e => {
      try {
        const addDate = (dt) => { if (!dt) return; const d = new Date(dt); if (isNaN(d)) return; const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; if (monthSets[key]) monthSets[key].add(e.id || e.name || JSON.stringify(e)); };
        if (e._lastBredDate) addDate(e._lastBredDate);
        if (e.bredDate) addDate(e.bredDate);
        if (Array.isArray(e.breedings)) e.breedings.forEach(b => addDate(b.date || b.bredDate));
      } catch (e) { }
    });
    const conceptionValues = monthKeys.map(k => { const c = monthSets[k] ? monthSets[k].size : 0; return ewes.length ? Math.round((c / ewes.length) * 100) : 0; });
    const spark = (vals, w = 480, h = 80, stroke = '#10b981') => {
      const max = Math.max.apply(null, vals.concat([1])); const min = Math.min.apply(null, vals.concat([0])); const range = Math.max(1, max - min);
      const step = vals.length > 1 ? (w / (vals.length - 1)) : w; let path = ''; vals.forEach((v, i) => { const x = i * step; const y = h - ((v - min) / range) * h; path += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`); }); return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    };
    const concBox = document.createElement('div'); concBox.className = 'full-chart'; concBox.innerHTML = `<h3>Conception rate (12 months)</h3><div>${spark(conceptionValues)}</div>`;
    container.appendChild(concBox);

    // Twinning and avg birth weight
    // twinning
    let twinEvents = 0, totalEvents = 0; let singles = 0, twins = 0, triplets = 0;
    ewes.forEach(e => { if (!Array.isArray(e.lambings)) return; e.lambings.forEach(ev => { try { let c = parseInt(ev.count, 10); if (isNaN(c) || !c) c = Array.isArray(ev.children) ? ev.children.length : 0; if (!c) return; totalEvents++; if (c === 1) singles++; else if (c === 2) twins++; else if (c === 3) triplets++; if (c > 1) twinEvents++; } catch (e) { } }); });
    const twinPct = totalEvents ? Math.round((twinEvents / totalEvents) * 100) : 0;
    const twinBox = document.createElement('div'); twinBox.className = 'full-chart'; twinBox.innerHTML = `<h3>Twinning rate</h3><div style="font-size:20px;font-weight:700">${twinPct}%</div><div>Singles:${singles} Twins:${twins} Triplets:${triplets}</div>`;
    container.appendChild(twinBox);

    // avg birth weight per month chart
    const bwByMonth = {}; (all || []).forEach(a => { try { const bdRaw = a.birthDate || a.birthdate || ''; if (!bdRaw) return; const bd = new Date(bdRaw); if (isNaN(bd)) return; const key = `${bd.getFullYear()}-${String(bd.getMonth() + 1).padStart(2, '0')}`; const w = parseFloat(a.birthWeight || a.birthWeightKg || a.weight || a.birth_weight || NaN); if (isNaN(w) || w <= 0) return; bwByMonth[key] = bwByMonth[key] || { sum: 0, count: 0 }; bwByMonth[key].sum += w; bwByMonth[key].count++; } catch (e) { } });
    const bwVals = monthKeys.map(k => { const r = bwByMonth[k]; return r && r.count ? Math.round((r.sum / r.count) * 10) / 10 : 0; });
    if (bwVals.some(v => v > 0)) { const bwBox = document.createElement('div'); bwBox.className = 'full-chart'; bwBox.innerHTML = `<h3>Avg birth weight (monthly)</h3><div>${spark(bwVals, 480, 80, '#f59e0b')}</div>`; container.appendChild(bwBox); }

  } catch (e) { console.warn('renderBreedingDetails failed', e); }
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
    // optional text size (e.g. '13px','15px','17px')
    if (s.textSize) document.documentElement.style.setProperty('--text-size', s.textSize);
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

// --- Simple auth & role helpers ---
function setCurrentUser(user) {
  try { localStorage.setItem('currentUser', JSON.stringify(user)); } catch (e) { }
  try { window._currentUser = user; } catch (e) { }
  try { if (typeof applyRoleVisibility === 'function') applyRoleVisibility(); } catch (e) { }
}

function getCurrentUser() {
  try {
    if (window._currentUser) return window._currentUser;
    const raw = localStorage.getItem('currentUser');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    window._currentUser = parsed;
    return parsed;
  } catch (e) { return null; }
}

// Normalize role label to expected designations
function roleLabel(role) {
  try {
    const r = String(role || '').toLowerCase();
    if (r === 'admin') return 'admin';
    if (r === 'manager') return 'manager';
    return 'viewer';
  } catch (e) { return 'viewer'; }
}

function logoutCurrentUser() {
  try { localStorage.removeItem('currentUser'); window._currentUser = null; } catch (e) { }
  try { if (typeof applyRoleVisibility === 'function') applyRoleVisibility(); } catch (e) { }
  try {
    // Redirect explicitly to login page to end session and avoid reload issues
    if (location && typeof location.href !== 'undefined') location.href = 'login.html';
  } catch (e) { try { location.reload(); } catch (e) { } }
}

// Check whether current user role is allowed. allowed can be string or array.
function roleAllowed(allowed) {
  try {
    const cur = getCurrentUser();
    const role = cur && cur.role ? String(cur.role) : 'viewer';
    if (!allowed) return false;
    const arr = Array.isArray(allowed) ? allowed : String(allowed).split(',').map(s => s.trim());
    return arr.indexOf(role) !== -1 || (role === 'admin' && arr.indexOf('admin') !== -1);
  } catch (e) { return false; }
}

// Apply visibility rules for elements with `data-role` attribute.
function applyRoleVisibility() {
  try {
    const els = document.querySelectorAll('[data-role]');
    const cur = getCurrentUser();
    const role = cur && cur.role ? String(cur.role) : 'viewer';
    els.forEach(el => {
      try {
        const spec = el.getAttribute('data-role') || '';
        const allowed = spec.split(',').map(s => s.trim()).filter(Boolean);
        // if empty spec -> hide
        if (!allowed.length) { el.style.display = 'none'; el.setAttribute('aria-hidden', 'true'); return; }
        if (allowed.indexOf(role) !== -1 || role === 'admin') {
          el.style.display = ''; el.removeAttribute('aria-hidden');
        } else {
          // disable interactive elements and hide visually but keep for screen readers with aria-hidden
          el.style.display = 'none'; el.setAttribute('aria-hidden', 'true');
        }
      } catch (e) { }
    });
    // Wire a small top-right auth status element if container present
    try {
      let status = document.getElementById('authStatus');
      if (!status) {
        status = document.createElement('div');
        status.id = 'authStatus';
        status.style.cssText = 'position:fixed;right:12px;top:12px;background:#fff;padding:6px 10px;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.08);z-index:9999;font-size:13px;';
        document.body.appendChild(status);
      }
      if (cur && cur.username) {
        const rl = roleLabel(cur.role);
        status.innerHTML = `Signed in: <strong>${cur.username}</strong> (${rl}) <button id="logoutBtn" style="margin-left:8px;">Sign out</button>`;
        const lb = document.getElementById('logoutBtn'); if (lb) lb.addEventListener('click', logoutCurrentUser);
      } else {
        status.innerHTML = `<a href="login.html">Sign in</a>`;
      }
    } catch (e) { }
  } catch (e) { /* ignore */ }
}

try { window.addEventListener('DOMContentLoaded', applyRoleVisibility); } catch (e) { }
try { window.setCurrentUser = setCurrentUser; window.getCurrentUser = getCurrentUser; window.logoutCurrentUser = logoutCurrentUser; window.applyRoleVisibility = applyRoleVisibility; window.roleLabel = roleLabel; } catch (e) { }

// Redirect unauthenticated users to login page and remember where they were going.
function ensureAuthRedirect() {
  try {
    const path = (location.pathname || '').split('/').pop() || '';
    // Allow login page itself and static assets to load
    const publicPages = ['login.html', 'login', 'login.htm'];
    if (publicPages.indexOf(path) !== -1) return;
    const cur = getCurrentUser();
    if (cur && cur.username) return; // authenticated
    try { localStorage.setItem('postLoginRedirect', location.pathname + (location.search || '')); } catch (e) { }
    try { location.href = 'login.html'; } catch (e) { }
  } catch (e) { /* ignore */ }
}

try { window.addEventListener('DOMContentLoaded', ensureAuthRedirect); } catch (e) { }

// --- User management: register and authenticate ---
// Hash password using SubtleCrypto SHA-256 when available
async function hashPassword(password) {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
      const enc = new TextEncoder();
      const data = enc.encode(password);
      const hash = await crypto.subtle.digest('SHA-256', data);
      const arr = Array.from(new Uint8Array(hash));
      return arr.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) { }
  // fallback: simple (insecure) hash
  try {
    let h = 0;
    for (let i = 0; i < password.length; i++) h = ((h << 5) - h) + password.charCodeAt(i), h |= 0;
    return String(h);
  } catch (e) { return String(password); }
}

// Register a new user: { username, password, role }
async function registerUser(username, password, role) {
  try {
    username = String(username || '').trim();
    role = String(role || 'viewer');
    if (!username) return { ok: false, reason: 'missing_username' };
    if (!password || String(password).length < 4) return { ok: false, reason: 'weak_password' };
    const raw = localStorage.getItem('users');
    let users = {};
    try { users = raw ? JSON.parse(raw) : {}; } catch (e) { users = {}; }
    if (users[username]) return { ok: false, reason: 'exists' };
    const ph = await hashPassword(String(password));
    users[username] = { passwordHash: ph, role: role };
    localStorage.setItem('users', JSON.stringify(users));
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'error', error: String(e) }; }
}

// Authenticate and return user object on success
async function authenticateUser(username, password) {
  try {
    username = String(username || '').trim();
    const raw = localStorage.getItem('users');
    let users = {};
    try { users = raw ? JSON.parse(raw) : {}; } catch (e) { users = {}; }
    const u = users[username];
    if (!u) return { ok: false, reason: 'not_found' };
    const ph = await hashPassword(String(password));
    if (ph !== u.passwordHash) return { ok: false, reason: 'invalid' };
    return { ok: true, user: { username: username, role: u.role || 'viewer' } };
  } catch (e) { return { ok: false, reason: 'error', error: String(e) }; }
}

try { window.registerUser = registerUser; window.authenticateUser = authenticateUser; window.hashPassword = hashPassword; } catch (e) { }

// Auto-create requested admin user `Rwinter` with provided password if not present,
// and ensure the user is signed in. This runs immediately so the auth-guard finds a user.
(function () {
  try {
    // Run this bootstrap only once so logout actually signs the user out.
    const BOOT_FLAG = 'adminBootstrapDone';
    try { if (localStorage.getItem(BOOT_FLAG) === '1') return; } catch (e) { /* ignore */ }

    const uname = 'Rwinter';
    const pwd = 'Dancer123';
    const role = 'admin';
    // ensure users map exists
    let users = {};
    try { users = JSON.parse(localStorage.getItem('users') || '{}'); } catch (e) { users = {}; }
    const hadAnyUsers = Object.keys(users || {}).length > 0;
    // if missing or role not admin, insert placeholder entry so auth works immediately
    if (!users[uname] || users[uname].role !== role) {
      users[uname] = users[uname] || { passwordHash: '__CREATED__', role: role };
      users[uname].role = role;
      try { localStorage.setItem('users', JSON.stringify(users)); } catch (e) { }
    }
    // If this is a fresh store (no users previously), sign in the admin so first-time setup is smooth.
    try {
      if (!hadAnyUsers) {
        const cur = { username: uname, role: role };
        localStorage.setItem('currentUser', JSON.stringify(cur));
        try { window._currentUser = cur; } catch (e) { }
      }
    } catch (e) { }

    // compute and store proper password hash asynchronously
    try {
      if (typeof hashPassword === 'function') {
        hashPassword(pwd).then(h => {
          try {
            let u2 = {};
            try { u2 = JSON.parse(localStorage.getItem('users') || '{}'); } catch (e) { u2 = {}; }
            u2[uname] = { passwordHash: h, role: role };
            localStorage.setItem('users', JSON.stringify(u2));
          } catch (e) { }
        }).catch(() => { });
      }
    } catch (e) { }

    try { localStorage.setItem(BOOT_FLAG, '1'); } catch (e) { }
  } catch (e) { /* ignore */ }
})();

// --- Admin user management helpers ---
function getAllUsers() {
  try {
    const raw = localStorage.getItem('users');
    const users = raw ? JSON.parse(raw) : {};
    // return array of { username, role, email, pendingSetup }
    return Object.keys(users).map(u => ({ username: u, role: users[u].role || 'viewer', email: users[u].email || '', pendingSetup: !!(users[u].tempSetupToken) }));
  } catch (e) { return []; }
}

async function setUserPassword(username, newPassword) {
  try {
    if (!username) return { ok: false, reason: 'missing' };
    const raw = localStorage.getItem('users');
    let users = raw ? JSON.parse(raw) : {};
    if (!users[username]) return { ok: false, reason: 'not_found' };
    const h = await hashPassword(String(newPassword || ''));
    users[username].passwordHash = h;
    localStorage.setItem('users', JSON.stringify(users));
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'error', error: String(e) }; }
}

function setUserRole(username, role) {
  try {
    if (!username) return { ok: false, reason: 'missing' };
    const raw = localStorage.getItem('users');
    let users = raw ? JSON.parse(raw) : {};
    if (!users[username]) return { ok: false, reason: 'not_found' };
    users[username].role = String(role || 'viewer');
    localStorage.setItem('users', JSON.stringify(users));
    // if the changed user is currentUser, update in-memory
    try { const cur = getCurrentUser(); if (cur && cur.username === username) { cur.role = users[username].role; localStorage.setItem('currentUser', JSON.stringify(cur)); window._currentUser = cur; } } catch (e) { }
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'error', error: String(e) }; }
}

function deleteUser(username) {
  try {
    if (!username) return { ok: false, reason: 'missing' };
    const raw = localStorage.getItem('users');
    let users = raw ? JSON.parse(raw) : {};
    if (!users[username]) return { ok: false, reason: 'not_found' };
    delete users[username];
    localStorage.setItem('users', JSON.stringify(users));
    // if deleting current user, clear currentUser
    try { const cur = getCurrentUser(); if (cur && cur.username === username) { logoutCurrentUser(); } } catch (e) { }
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'error', error: String(e) }; }
}

try { window.getAllUsers = getAllUsers; window.setUserPassword = setUserPassword; window.setUserRole = setUserRole; window.deleteUser = deleteUser; } catch (e) { }
// Admin helpers: create an invited user with temporary setup token and temp password
async function adminCreateUser(username, email, role) {
  try {
    username = String(username || '').trim();
    email = String(email || '').trim();
    role = String(role || 'viewer');
    if (!username) return { ok: false, reason: 'missing_username' };
    const raw = localStorage.getItem('users');
    let users = raw ? JSON.parse(raw) : {};
    if (users[username]) return { ok: false, reason: 'exists' };
    // temp password and token
    const tempPassword = 'pw' + Math.random().toString(36).slice(2, 10);
    const token = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('tkn-' + Math.random().toString(36).slice(2, 10));
    users[username] = users[username] || {};
    users[username].role = role || 'viewer';
    users[username].email = email || '';
    users[username].tempSetupToken = token;
    // store temporary password hash so admin can provide it; we won't activate login until setup completes
    try { const ph = await hashPassword(String(tempPassword)); users[username].passwordHash = ph; } catch (e) { users[username].passwordHash = '__TEMP__'; }
    try { localStorage.setItem('users', JSON.stringify(users)); } catch (e) { }
    const setupLink = 'setup.html?token=' + encodeURIComponent(token);
    const mailto = email ? ('mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent('Account setup') + '&body=' + encodeURIComponent('Please set up your account: ' + location.origin + '/' + setupLink)) : null;
    return { ok: true, tempPassword: tempPassword, setupLink: setupLink, mailto: mailto };
  } catch (e) { return { ok: false, reason: 'error', error: String(e) }; }
}

function findUserBySetupToken(token) {
  try {
    const raw = localStorage.getItem('users');
    const users = raw ? JSON.parse(raw) : {};
    if (!token) return null;
    for (const k of Object.keys(users)) {
      try { if (users[k] && users[k].tempSetupToken === token) return { username: k, email: users[k].email || '' }; } catch (e) { }
    }
    return null;
  } catch (e) { return null; }
}

async function completeSetupWithToken(token, newPassword) {
  try {
    if (!token) return { ok: false, reason: 'missing' };
    const raw = localStorage.getItem('users');
    let users = raw ? JSON.parse(raw) : {};
    let found = null;
    for (const k of Object.keys(users)) {
      try { if (users[k] && users[k].tempSetupToken === token) { found = k; break; } } catch (e) { }
    }
    if (!found) return { ok: false, reason: 'invalid' };
    const ph = await hashPassword(String(newPassword));
    users[found].passwordHash = ph;
    delete users[found].tempSetupToken;
    try { localStorage.setItem('users', JSON.stringify(users)); } catch (e) { }
    return { ok: true };
  } catch (e) { return { ok: false, reason: 'error', error: String(e) }; }
}

try { window.adminCreateUser = adminCreateUser; window.findUserBySetupToken = findUserBySetupToken; window.completeSetupWithToken = completeSetupWithToken; } catch (e) { }
// Activate a named user immediately (create minimal entry if missing).
function activateUserNow(username) {
  try {
    if (!username) return { ok: false, reason: 'missing' };
    const raw = localStorage.getItem('users');
    const users = raw ? JSON.parse(raw) : {};
    if (!users[username]) {
      // create a minimal user record with no password (admin can reset later)
      users[username] = { role: 'admin', email: '', createdAt: Date.now() };
      try { localStorage.setItem('users', JSON.stringify(users)); } catch (e) { }
    }
    // If the user exists but has no passwordHash, and this is the known admin bootstrap name,
    // populate a default password hash so sign-in works (non-blocking async).
    try {
      if (!users[username].passwordHash && username === 'Rwinter' && typeof hashPassword === 'function') {
        // set to the expected original password so the user can sign in: Dancer123
        hashPassword('Dancer123').then(h => {
          try {
            const raw2 = localStorage.getItem('users');
            const users2 = raw2 ? JSON.parse(raw2) : {};
            users2[username] = users2[username] || {};
            users2[username].passwordHash = h;
            users2[username].role = users2[username].role || 'admin';
            try { localStorage.setItem('users', JSON.stringify(users2)); } catch (e) { }
          } catch (e) { }
        }).catch(() => { });
      }
    } catch (e) { }
    const cur = { username: username, role: users[username].role || 'viewer' };
    try { localStorage.setItem('currentUser', JSON.stringify(cur)); } catch (e) { }
    try { window._currentUser = cur; } catch (e) { }
    try { if (typeof applyRoleVisibility === 'function') applyRoleVisibility(); } catch (e) { }
    return { ok: true, user: cur };
  } catch (e) { return { ok: false, reason: 'error', error: String(e) }; }
}
try { window.activateUserNow = activateUserNow; } catch (e) { }

// If you asked to activate a specific account during this edit, activate it now.
try { activateUserNow('Rwinter'); } catch (e) { }

// Prevent auto-refresh while user edits Actions table columns modal.
// Open modal -> suspend render; Close (Save/Cancel) -> resume and apply once.
try {
  window.addEventListener('DOMContentLoaded', () => {
    try {
      // guard flag
      window._suspendAutoRefresh = false;

      // wrap common renderers to honor the suspend flag
      if (typeof window.loadSheepList === 'function' && !window._orig_loadSheepList) {
        window._orig_loadSheepList = window.loadSheepList;
        window.loadSheepList = function () { if (window._suspendAutoRefresh) return; return window._orig_loadSheepList.apply(this, arguments); };
      }
      if (typeof window.renderActionsTable === 'function' && !window._orig_renderActionsTable) {
        window._orig_renderActionsTable = window.renderActionsTable;
        window.renderActionsTable = function () { if (window._suspendAutoRefresh) return; return window._orig_renderActionsTable.apply(this, arguments); };
      }

      const editBtn = document.getElementById('editColumnsBtn');
      const saveBtn = document.getElementById('saveColumnsBtn');
      const cancelBtn = document.getElementById('columnsCancelBtn');
      const closeX = document.getElementById('columnsSettingsClose');
      const modal = document.getElementById('columnsSettingsModal');

      const actionColumnKeys = ['name', 'tagType', 'id', 'breed', 'color', 'sire', 'dam', 'sireSire', 'notes', 'age', 'weight', 'sex', 'pastLambing', 'lastLambingDate', 'bredDate', 'daysUntil', 'daysPost', 'expectedDueDate'];

      const buildAndSaveFromModal = () => {
        try {
          const tabEl = document.getElementById('columnsTabSelect');
          const tab = tabEl ? (tabEl.value || 'global') : 'global';
          const map = {};
          actionColumnKeys.forEach(k => { const el = document.getElementById('col_' + k); map[k] = !!(el && el.checked); });
          try { saveActionsColumns(map, tab); } catch (e) { }
          // update badges to reflect current state
          try {
            actionColumnKeys.forEach(k => {
              try {
                const badge = document.getElementById('badge_col_' + k);
                const el = document.getElementById('col_' + k);
                if (!badge || !el) return;
                if (el.checked) { badge.textContent = 'On'; badge.classList.add('badge-on'); badge.classList.remove('badge-off'); }
                else { badge.textContent = 'Off'; badge.classList.add('badge-off'); badge.classList.remove('badge-on'); }
              } catch (e) { }
            });
          } catch (e) { }
          // show transient saved indicator
          try {
            const ind = document.getElementById('columnsSavedIndicator');
            if (ind) {
              ind.style.display = 'inline-block';
              clearTimeout(window._columnsSavedIndicatorTimer);
              window._columnsSavedIndicatorTimer = setTimeout(() => { try { ind.style.display = 'none'; } catch (e) { } }, 1200);
            }
          } catch (e) { }
        } catch (e) { }
      };

      const detachAutosaveHandlers = () => {
        try {
          if (window._columnsAutosaveHandlers && window._columnsAutosaveHandlers.length) {
            window._columnsAutosaveHandlers.forEach(o => { try { o.el.removeEventListener('change', o.handler); } catch (e) { } });
          }
        } catch (e) { }
        window._columnsAutosaveHandlers = [];
      };

      const attachAutosaveHandlers = () => {
        try {
          detachAutosaveHandlers();
          window._columnsAutosaveHandlers = [];
          actionColumnKeys.forEach(k => {
            try {
              const el = document.getElementById('col_' + k);
              if (!el) return;
              const handler = function () { try { buildAndSaveFromModal(); } catch (e) { } };
              el.addEventListener('change', handler);
              window._columnsAutosaveHandlers.push({ el, handler });
            } catch (e) { }
          });
        } catch (e) { }
      };

      const applyAndClose = (apply) => {
        try {
          // resume refresh
          window._suspendAutoRefresh = false;
          // detach autosave handlers when closing
          try { detachAutosaveHandlers(); } catch (e) { }

          if (apply) {
            // build map from modal checkboxes and save to actions namespace
            try {
              const tabEl = document.getElementById('columnsTabSelect');
              const tab = tabEl ? (tabEl.value || 'global') : 'global';
              const map = {};
              actionColumnKeys.forEach(k => { const el = document.getElementById('col_' + k); map[k] = !!(el && el.checked); });
              try { saveActionsColumns(map, tab); } catch (e) { }
              // refresh actions table once after saving
              try { if (typeof renderActionsTable === 'function') renderActionsTable(); else if (typeof loadSheepList === 'function') loadSheepList(); } catch (e) { }
            } catch (e) { }
          }
          if (modal) modal.style.display = 'none';
        } catch (e) { if (modal) modal.style.display = 'none'; }
      };

      const forceInlineEditHandler = (ev) => {
        try {
          try { ev && ev.stopImmediatePropagation && ev.stopImmediatePropagation(); } catch (e) { }
          try { ev && ev.preventDefault && ev.preventDefault(); } catch (e) { }
          // prefer named function in page scope
          if (typeof window.enterEditColumnsMode === 'function') { try { window.enterEditColumnsMode(); } catch (e) { } return; }
          if (typeof enterEditColumnsMode === 'function') { try { enterEditColumnsMode(); } catch (e) { } return; }
          // fallback to modal
          if (modal) modal.style.display = 'block';
          window._suspendAutoRefresh = true;
          attachAutosaveHandlers();
        } catch (e) { }
      };

      if (editBtn) editBtn.addEventListener('click', forceInlineEditHandler);
      const topEditBtn = document.getElementById('topEditColumnsBtn');
      if (topEditBtn) topEditBtn.addEventListener('click', forceInlineEditHandler);
      if (saveBtn) saveBtn.addEventListener('click', (ev) => { try { applyAndClose(true); } catch (e) { } });
      if (cancelBtn) cancelBtn.addEventListener('click', (ev) => { try { applyAndClose(false); } catch (e) { } });
      if (closeX) closeX.addEventListener('click', (ev) => { try { applyAndClose(false); } catch (e) { } });
      // also close when clicking outside modal content (modal backdrop)
      window.addEventListener('click', (ev) => { try { if (!modal) return; if (ev.target === modal) applyAndClose(false); } catch (e) { } });
    } catch (e) { }
  });
} catch (e) { }

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
    color: true,
    sire: true,
    dam: true,
    sireSire: true,
    notes: false,
    age: true,
    weight: true,
    sex: true,
    status: false,
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
    // legacy migration: if old `dashboardColumns` stores actions under `actions`, and
    // no standalone `actionsColumns` key exists, copy that node to the new primary
    // `actionsColumns` key for clarity and future edits.
    try {
      const rawActions = localStorage.getItem('actionsColumns');
      if (rawActions) return; // already present, nothing to do
    } catch (e) { }
    try {
      const rawDash = localStorage.getItem('dashboardColumns');
      if (!rawDash) return;
      let dashParsed = JSON.parse(rawDash) || {};
      const actionsNode = dashParsed.actions || dashParsed.action || null;
      if (!actionsNode) return;
      // persist actionsNode under the standalone key and remove it from dashboardColumns
      try { localStorage.setItem('actionsColumns', JSON.stringify(actionsNode)); } catch (e) { }
      try {
        delete dashParsed.actions; delete dashParsed.action;
        localStorage.setItem('dashboardColumns', JSON.stringify(dashParsed));
      } catch (e) { /* ignore */ }
    } catch (e) { /* ignore parse errors */ }
  } catch (e) { /* ignore */ }
}

function getActionsColumns(tabId) {
  const defaults = {
    tagType: false,
    breed: true,
    color: true,
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
    // Prefer the standalone `actionsColumns` key; otherwise fall back to
    // legacy `dashboardColumns.actions` if present (migration handled above).
    try { _migrateActionsColumnsIfNeeded(); } catch (e) { }
    try {
      const rawStandalone = localStorage.getItem('actionsColumns');
      if (rawStandalone) {
        const parsedStandalone = JSON.parse(rawStandalone) || {};
        // parsedStandalone may be a tab->map object or direct boolean map
        const key = tabId || 'global';
        if (parsedStandalone && Object.keys(parsedStandalone).length && Object.keys(parsedStandalone).every(k => typeof parsedStandalone[k] === 'boolean')) {
          return Object.assign({}, defaults, parsedStandalone || {});
        }
        const tabMap = (parsedStandalone && parsedStandalone[key]) ? parsedStandalone[key] : (parsedStandalone && parsedStandalone.global ? parsedStandalone.global : null);
        return Object.assign({}, defaults, tabMap || {});
      }
    } catch (e) { /* ignore */ }
    // fallback to legacy dashboardColumns.actions
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
    const merged = Object.assign({}, defaults, tabMap || {});
    try {
      // Ensure tagType is visible by default for 'all' and 'active-ewes' when not explicitly set
      if ((key === 'all' || key === 'active-ewes') && (tabMap == null || typeof tabMap.tagType === 'undefined')) {
        merged.tagType = true;
      }
    } catch (e) { /* ignore */ }
    return merged;
  } catch (e) { return defaults; }
}

function saveActionsColumns(map, tabId) {
  try {
    // Save under the standalone `actionsColumns` key so Settings manages only Actions columns
    const key = tabId || 'global';
    let parsed = {};
    const raw = localStorage.getItem('actionsColumns');
    if (raw) {
      try { parsed = JSON.parse(raw) || {}; } catch (e) { parsed = {}; }
    }
    parsed[key] = map || {};
    localStorage.setItem('actionsColumns', JSON.stringify(parsed));
    // Attempt to remove legacy storage to avoid confusion
    try {
      const rawDash = localStorage.getItem('dashboardColumns');
      if (rawDash) {
        const dashParsed = JSON.parse(rawDash) || {};
        if (dashParsed && dashParsed.actions) { delete dashParsed.actions; localStorage.setItem('dashboardColumns', JSON.stringify(dashParsed)); }
      }
    } catch (e) { }
  } catch (e) { console.warn(e); }
}

// Given a sheep record, return lambing summary counts and last lambing date.
// Supports a `lambings` array of objects {date: 'YYYY-MM-DD', count: N} if present.
function getSheepLambingSummary(sheep) {
  const out = { single: 0, twins: 0, triplets: 0, lastDate: null };
  if (!sheep) return out;
  // We'll compute counts from explicit `lambings` if present, otherwise infer from offspring.
  // For lastDate, take the most recent date found across explicit lambings, inferred children birth dates, or legacy fields.
  try {
    const candidateDates = [];

    // Explicit lambings
    if (Array.isArray(sheep.lambings) && sheep.lambings.length) {
      sheep.lambings.forEach(ev => {
        const cnt = parseInt((ev && ev.count) || 0, 10) || 0;
        if (cnt <= 1) out.single += 1;
        else if (cnt === 2) out.twins += 1;
        else if (cnt >= 3) out.triplets += 1;
        const d = ev && ev.date ? new Date(ev.date) : null;
        if (d && !isNaN(d)) candidateDates.push(d.toISOString().slice(0, 10));
      });
      // continue to also consider offspring-derived dates for the most recent date
    }

    // Infer from stored offspring (sheep where dam === this sheep)
    try {
      const all = getAllSheep();
      const myId = sheep.id || '';
      const myName = (sheep.name || '').toString().trim().toLowerCase();
      const children = all.filter(c => {
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
            // If explicit lambings were not provided, derive counts from children groups
            if (!Array.isArray(sheep.lambings) || !sheep.lambings.length) {
              if (cnt <= 1) out.single += 1;
              else if (cnt === 2) out.twins += 1;
              else if (cnt >= 3) out.triplets += 1;
            }
            candidateDates.push(k);
          }
        });
      }
    } catch (e) { /* ignore child inference errors */ }

    // Legacy single-field fallbacks
    try {
      if (sheep.lastLambCount) {
        const cnt = parseInt(sheep.lastLambCount, 10) || 0;
        if (cnt <= 1) out.single += 1;
        else if (cnt === 2) out.twins += 1;
        else if (cnt >= 3) out.triplets += 1;
      }
      if (sheep.lastLambingDate) candidateDates.push(sheep.lastLambingDate);
      if (sheep._lastLambingDate) candidateDates.push(sheep._lastLambingDate);
    } catch (e) { }

    // Choose the newest valid date among candidates
    try {
      let newest = null;
      candidateDates.forEach(d => {
        try {
          if (!d) return;
          const dt = new Date(d);
          if (isNaN(dt)) return;
          if (!newest || dt.getTime() > newest.getTime()) newest = dt;
        } catch (e) { }
      });
      if (newest) out.lastDate = newest.toISOString().slice(0, 10);
    } catch (e) { }
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
      // also render while typing for immediate feedback (do not persist settings on input)
      try {
        const liveIds = ['fi_eweValue', 'fi_ramValue', 'fi_pricePerLb', 'fi_feedAdult', 'fi_feedYearling', 'fi_feedLamb', 'fi_feedStart', 'fi_feedEnd'];
        liveIds.forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          el.addEventListener('input', () => { try { renderFinance(); } catch (e) { } });
        });
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

  // Normalize any stored weight dates to ISO `YYYY-MM-DD` so date inputs accept them.
  try {
    if (sheep && Array.isArray(sheep.weights)) {
      sheep.weights = sheep.weights.map(w => {
        try {
          if (!w || !w.date) return w;
          const parsed = new Date(w.date);
          if (!isNaN(parsed.getTime())) {
            return Object.assign({}, w, { date: parsed.toISOString().slice(0, 10) });
          }
        } catch (e) { }
        return w;
      });
      // persist normalized weights back so future loads are clean
      try { localStorage.setItem(`sheep-${sheepId}`, JSON.stringify(sheep)); } catch (e) { }
    }
  } catch (e) { }

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
  try {
    const lw = (typeof getSheepLatestWeight === 'function') ? getSheepLatestWeight(sheep) : (sheep.weight || null);
    document.getElementById('weight').textContent = (lw !== null && lw !== undefined && !isNaN(lw)) ? (String(lw) + ' lbs') : 'N/A';
  } catch (e) { document.getElementById('weight').textContent = sheep.weight ? sheep.weight + ' lbs' : 'N/A'; }
  const birthInput = document.getElementById('birthDate');
  if (birthInput) birthInput.value = toIsoDate(sheep.birthDate) || '';
  const dueSpan = document.getElementById('expectedDueDate');
  try { if (dueSpan) { const due = (typeof getSheepExpectedDue === 'function') ? getSheepExpectedDue(sheep) : (sheep.expectedDueDate || null); dueSpan.textContent = due ? formatDateLong(due) : 'N/A'; } } catch (e) { if (dueSpan) dueSpan.textContent = sheep.expectedDueDate ? formatDateLong(sheep.expectedDueDate) : 'N/A'; }
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

  // Click-to-edit Colour on detail page: show static text + Edit button, open inline editor when clicked
  try {
    const colorDisplayP = document.getElementById('colorDisplay');
    const colorSpan = document.getElementById('color');
    if (colorDisplayP && colorSpan) {
      // create edit controls
      const editBtn = document.createElement('button');
      editBtn.className = 'button';
      editBtn.id = 'editColorBtn';
      editBtn.type = 'button';
      editBtn.textContent = 'Edit';
      editBtn.style.marginLeft = '8px';

      const editWrap = document.createElement('span');
      editWrap.id = 'colorEditWrap';
      editWrap.style.display = 'none';
      editWrap.style.marginLeft = '8px';

      const sel = document.createElement('select');
      sel.id = 'sheepColorDetail';
      sel.style.minWidth = '160px';
      // populate options from centralized list if available
      if (Array.isArray(SHEEP_COLOR_OPTIONS)) {
        SHEEP_COLOR_OPTIONS.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.value !== undefined ? o.value : o.label;
          opt.textContent = o.label || o.value;
          sel.appendChild(opt);
        });
      }

      const otherInp = document.createElement('input');
      otherInp.type = 'text';
      otherInp.id = 'sheepColorOtherDetail';
      otherInp.placeholder = 'Enter colour';
      otherInp.style.display = 'none';
      otherInp.style.marginLeft = '6px';

      const saveBtnC = document.createElement('button');
      saveBtnC.className = 'button-primary';
      saveBtnC.id = 'saveColorDetailBtn';
      saveBtnC.type = 'button';
      saveBtnC.textContent = 'Save';
      saveBtnC.style.marginLeft = '6px';

      const cancelBtnC = document.createElement('button');
      cancelBtnC.className = 'button button-cancel';
      cancelBtnC.id = 'cancelColorDetailBtn';
      cancelBtnC.type = 'button';
      cancelBtnC.textContent = 'Cancel';
      cancelBtnC.style.marginLeft = '6px';

      editWrap.appendChild(sel);
      editWrap.appendChild(otherInp);
      editWrap.appendChild(saveBtnC);
      editWrap.appendChild(cancelBtnC);

      // append edit controls after the static span (but inside same paragraph)
      try { colorDisplayP.appendChild(editBtn); colorDisplayP.appendChild(editWrap); } catch (e) { }

      // helper to show/hide based on current sheep value
      const showEditor = () => {
        // set select value to matching option or '__other__'
        const val = (sheep.color || sheep.colour || '') || '';
        let matched = false;
        Array.from(sel.options || []).forEach(o => { if (o && String(o.value) === String(val)) matched = true; });
        if (matched) {
          try { sel.value = val; otherInp.style.display = 'none'; } catch (e) { }
        } else if (val) {
          try { sel.value = '__other__'; otherInp.style.display = ''; otherInp.value = val; } catch (e) { }
        } else {
          try { sel.value = ''; otherInp.style.display = 'none'; otherInp.value = ''; } catch (e) { }
        }
        editWrap.style.display = '';
        colorSpan.style.display = 'none';
        editBtn.style.display = 'none';
        sel.focus();
      };

      const hideEditor = () => {
        editWrap.style.display = 'none';
        colorSpan.style.display = '';
        editBtn.style.display = '';
      };

      // wire select to show other input
      sel.addEventListener('change', () => {
        try {
          if (sel.value === '__other__') otherInp.style.display = '';
          else otherInp.style.display = 'none';
        } catch (e) { }
      });

      editBtn.addEventListener('click', (ev) => { ev.preventDefault(); showEditor(); });
      cancelBtnC.addEventListener('click', (ev) => { ev.preventDefault(); hideEditor(); });
      saveBtnC.addEventListener('click', (ev) => {
        ev.preventDefault();
        try {
          let newColor = '';
          if (sel.value === '__other__') newColor = (otherInp.value || '').trim();
          else newColor = sel.value || '';
          sheep.color = newColor;
          // persist immediate change for convenience
          try { localStorage.setItem(`sheep-${sheepId}`, JSON.stringify(sheep)); } catch (e) { console.warn(e); }
          try {
            let list = JSON.parse(localStorage.getItem('sheepList') || '[]');
            const idx = list.findIndex(s => s.id === sheepId);
            if (idx !== -1) list[idx] = Object.assign({}, list[idx], sheep);
            else list.push(sheep);
            localStorage.setItem('sheepList', JSON.stringify(list));
          } catch (e) { }
          // update UI
          try { colorSpan.textContent = newColor || 'N/A'; } catch (e) { }
          hideEditor();
          try { updateAutoPedigree(sheepId); } catch (e) { }
        } catch (e) { console.warn('Saving colour failed', e); }
      });
    }
  } catch (e) { console.warn('Colour edit wiring failed', e); }

  // Save changes button (saves notes, sire, dam, pedigree)
  const saveBtn = document.getElementById('saveChanges');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      if (sireInput) sheep.sire = sireInput.value;
      if (damInput) sheep.dam = damInput.value;
      if (notesEl) sheep.notes = notesEl.value;
      // Capture colour from the detail page select (or fallback to displayed text)
      try {
        const sel = document.getElementById('sheepColor') || document.getElementById('sheepColorDetail');
        if (sel) {
          if (sel.value === '__other__') {
            const other = document.getElementById('sheepColorOther') || document.getElementById('sheepColorOtherDetail');
            sheep.color = other ? (other.value || '') : '';
          } else {
            sheep.color = sel.value || '';
          }
        } else {
          const sp = document.getElementById('color');
          if (sp) {
            const t = (sp.textContent || '').trim();
            sheep.color = (t && t !== 'N/A') ? t : '';
          }
        }
      } catch (e) { }
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
        // Update the colour display and any detail-page selects to reflect saved value
        try {
          const span = document.getElementById('color');
          if (span) span.textContent = (sheep.color || sheep.colour) || 'N/A';
          // sync any inline color selects/other inputs on the page (supporting detail-editor ids)
          const sel = document.getElementById('sheepColor') || document.getElementById('sheepColorDetail');
          const other = document.getElementById('sheepColorOther') || document.getElementById('sheepColorOtherDetail');
          if (sel) {
            // if saved value matches an option, select it; otherwise select '__other__' and populate other input
            let val = sheep.color || sheep.colour || '';
            let matched = false;
            Array.from(sel.options || []).forEach(o => { if (o && String(o.value) === String(val)) matched = true; });
            if (matched) { try { sel.value = val; if (other) other.style.display = 'none'; } catch (e) { } }
            else if (val) { try { sel.value = '__other__'; if (other) { other.style.display = ''; other.value = val; } } catch (e) { } }
            else { try { sel.value = ''; if (other) other.style.display = 'none'; } catch (e) { } }
          }
        } catch (e) { /* ignore UI sync errors */ }
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
  // Listen for storage changes to this sheep record (useful when editing weights from another tab/page)
  try {
    try { if (window._sheepDetailStorageHandler) { window.removeEventListener('storage', window._sheepDetailStorageHandler); } } catch (e) { }
    window._sheepDetailStorageHandler = function (ev) {
      try {
        if (!ev || !ev.key) return;
        if (ev.key === `sheep-${sheepId}`) {
          try {
            const updated = JSON.parse(localStorage.getItem(ev.key) || '{}');
            if (updated && updated.id) {
              // merge updated fields into local sheep object and re-render weights panel
              Object.keys(updated).forEach(k => { sheep[k] = updated[k]; });
              try { renderWeightsPanel(sheep, sheepId); } catch (e) { console.warn('renderWeightsPanel after storage event failed', e); }
            }
          } catch (e) { console.warn('failed to parse updated sheep record', e); }
        }
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('storage', window._sheepDetailStorageHandler);
    // Also listen for same-window updates dispatched via saveSheepRecord()
    try { if (window._sheepDetailCustomHandler) { window.removeEventListener('sheep-updated', window._sheepDetailCustomHandler); } } catch (e) { }
    window._sheepDetailCustomHandler = function (ev) {
      try {
        if (!ev || !ev.detail || !ev.detail.id) return;
        if (String(ev.detail.id) === String(sheepId)) {
          try {
            const updated = JSON.parse(localStorage.getItem(`sheep-${sheepId}`) || '{}');
            if (updated && updated.id) {
              Object.keys(updated).forEach(k => { sheep[k] = updated[k]; });
              try { renderWeightsPanel(sheep, sheepId); } catch (e) { console.warn('renderWeightsPanel after sheep-updated failed', e); }
            }
          } catch (e) { console.warn('sheep-updated handler parse failed', e); }
        }
      } catch (e) { /* ignore */ }
    };
    window.addEventListener('sheep-updated', window._sheepDetailCustomHandler);
  } catch (e) { }
  try { renderOtherExpensesForSheep(sheep, sheepId); } catch (e) { console.warn('renderOtherExpenses failed', e); }
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

    // helper: convert various date formats to ISO YYYY-MM-DD for date inputs
    function toIsoDate(value) {
      try {
        if (!value) return '';
        // If already in YYYY-MM-DD form, return as-is
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
        const d = new Date(value);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      } catch (e) { }
      return '';
    }

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
          // ensure date input receives ISO-format value required by <input type="date">
          const iso = toIsoDate(w.date);
          dateInp.value = iso || '';
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
      let d = dateInp.value;
      if (!d) d = new Date().toISOString().slice(0, 10);
      const wv = weightInp.value;
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

// Render ledger entries attributed to a single sheep into the detail page "Other expenses" box
function renderOtherExpensesForSheep(sheep, sheepId) {
  try {
    const container = document.getElementById('otherExpensesList');
    if (!container) return;
    const entries = (typeof loadEntries === 'function') ? loadEntries() : JSON.parse(localStorage.getItem('financeEntries') || '[]');
    if (!Array.isArray(entries) || !entries.length) {
      container.innerHTML = '<div class="muted">No expenses found for this sheep.</div>';
      return;
    }
    const idStr = String(sheepId || '').toLowerCase();
    const nameStr = (sheep && (sheep.name || sheep.tag)) ? String((sheep.name || sheep.tag)).toLowerCase() : '';
    const matched = entries.slice().filter(en => {
      try {
        // focus on outputs/expenses primarily
        const t = (en.type || '').toString().toLowerCase();
        // don't strictly require type since user may mark differently; but prefer outputs
        const txt = ((en.desc || en.description || en.category || '') + '').toLowerCase();
        if (en.eweId && String(en.eweId).toLowerCase() === idStr) return true;
        if (txt && idStr && txt.indexOf(idStr) !== -1) return true;
        if (txt && nameStr && nameStr.length > 2 && txt.indexOf(nameStr) !== -1) return true;
        return false;
      } catch (e) { return false; }
    }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    if (!matched.length) {
      container.innerHTML = '<div class="muted">No expenses found for this sheep.</div>';
      return;
    }
    // render list
    container.innerHTML = '';
    matched.forEach(en => {
      try {
        const row = document.createElement('div');
        row.style.display = 'flex'; row.style.justifyContent = 'space-between'; row.style.padding = '6px 0'; row.style.borderBottom = '1px solid #f6f6f6';
        const left = document.createElement('div'); left.textContent = `${formatDate(en.date)} — ${en.desc || ''}`;
        const right = document.createElement('div'); right.textContent = (typeof formatMoney === 'function') ? formatMoney(en.amount || 0) : ('$' + (Number(en.amount || 0).toFixed(2)));
        row.appendChild(left); row.appendChild(right);
        container.appendChild(row);
      } catch (e) { }
    });
  } catch (e) { try { document.getElementById('otherExpensesList').textContent = 'Unable to load expenses.'; } catch (er) { } }
}

function saveSheepWeightsToStorage(sheepId, sheep) {
  try {
    // Use centralized save helper to ensure consistent master-list update and events
    if (typeof saveSheepRecord === 'function') {
      saveSheepRecord(sheep);
      return;
    }
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

// Generic helper to persist a sheep record and update the master list,
// dispatches a `sheep-updated` CustomEvent for same-window listeners.
// Helper: local fallback save implementation used when server is unavailable
function _localSaveSheepRecord(sheep) {
  try {
    if (!sheep || !sheep.id) return;
    const id = String(sheep.id);
    try { localStorage.setItem('sheep-' + id, JSON.stringify(sheep)); } catch (e) { console.warn('saveSheepRecord localStorage set failed', e); }
    try {
      let list = JSON.parse(localStorage.getItem('sheepList') || '[]');
      const idx = list.findIndex(s => s && s.id === id);
      if (idx !== -1) list[idx] = Object.assign({}, list[idx], sheep);
      else list.push(sheep);
      localStorage.setItem('sheepList', JSON.stringify(list));
    } catch (e) { console.warn('saveSheepRecord master update failed', e); }
    try { window.dispatchEvent(new CustomEvent('sheep-updated', { detail: { id: id } })); } catch (e) { /* ignore */ }
    // Update UI where possible
    try { if (typeof computeCounts === 'function') computeCounts(); } catch (e) { }
    try {
      const activeFilter = (typeof _currentTab !== 'undefined' && _currentTab) ? _currentTab : (window.activeFilter || 'all');
      const searchVal = (document.getElementById && document.getElementById('actionsSearch')) ? (document.getElementById('actionsSearch').value || '') : '';
      if (typeof buildTable === 'function') try { buildTable(activeFilter, searchVal); } catch (e) { }
    } catch (e) { }
    try { window.dispatchEvent(new CustomEvent('sheep-list-updated', { detail: { id: id } })); } catch (e) { }
  } catch (e) { console.warn('saveSheepRecord failed', e); }
}

// Server-backed persistence helpers (Netlify Function endpoints)
async function serverLoadSheepFile() {
  try {
    const res = await fetch('/.netlify/functions/sheep');
    if (!res.ok) throw new Error('Server load failed: ' + res.status);
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { return text; }
  } catch (e) { throw e; }
}

async function serverSaveSheepFile(payload) {
  try {
    const res = await fetch('/.netlify/functions/sheep', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const body = await res.text();
      throw new Error('Server save failed: ' + res.status + ' ' + body);
    }
    return await res.json();
  } catch (e) { throw e; }
}

async function serverSaveSheepRecord(sheep) {
  if (!sheep || !sheep.id) return; // nothing to do
  try {
    let data = await serverLoadSheepFile();
    if (!Array.isArray(data)) data = Array.isArray(data.sheep) ? data.sheep : (Array.isArray(data) ? data : []);
    const id = String(sheep.id);
    const idx = data.findIndex(s => s && String(s.id) === id);
    if (idx !== -1) data[idx] = Object.assign({}, data[idx], sheep);
    else data.push(sheep);
    await serverSaveSheepFile(data);
    // mirror to localStorage + dispatch events so UI updates immediately
    try { localStorage.setItem('sheep-' + id, JSON.stringify(sheep)); } catch (e) { }
    try { let list = JSON.parse(localStorage.getItem('sheepList') || '[]'); const lidx = list.findIndex(s => s && String(s.id) === id); if (lidx !== -1) list[lidx] = Object.assign({}, list[lidx], sheep); else list.push(sheep); localStorage.setItem('sheepList', JSON.stringify(list)); } catch (e) { }
    try { window.dispatchEvent(new CustomEvent('sheep-updated', { detail: { id: id } })); } catch (e) { }
    try { window.dispatchEvent(new CustomEvent('sheep-list-updated', { detail: { id: id } })); } catch (e) { }
    return true;
  } catch (e) {
    throw e;
  }
}

// Generic helper to persist a sheep record and update the master list,
// dispatches a `sheep-updated` CustomEvent for same-window listeners.
function saveSheepRecord(sheep) {
  try {
    // Prefer server persistence when a logged-in user exists; fall back to localStorage
    try {
      const cur = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
      if (cur && cur.id) {
        // fire-and-forget server save; if it fails, mirror to local storage
        serverSaveSheepRecord(sheep).catch(err => { console.warn('server save failed, falling back to local:', err); _localSaveSheepRecord(sheep); });
        return;
      }
    } catch (e) { /* ignore detection errors and fall back */ }

    // no logged-in user or server not used: local save
    _localSaveSheepRecord(sheep);
  } catch (e) { console.warn('saveSheepRecord failed', e); }
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

// Centralized page initialization: keep page-specific script minimal and
// call shared init logic from here so index.html does not need inline handlers.
window.addEventListener('DOMContentLoaded', () => {
  try { if (typeof initIndex === 'function') initIndex(); } catch (e) { console.warn('initIndex failed', e); }
  try { if (typeof renderBreedingSummary === 'function') renderBreedingSummary(); } catch (e) { console.warn('renderBreedingSummary failed', e); }

  // Refresh helper for dashboard widgets: call known render functions safely
  ; (function () {
    function safeCall(fn) { try { if (typeof fn === 'function') fn(); } catch (e) { console.warn('dashboard refresh error', e); } }
    function debounce(fn, wait) { let t = null; return function () { clearTimeout(t); t = setTimeout(fn, wait || 120); }; }
    window.refreshDashboardWidgets = function () {
      try {
        safeCall(renderBreedingSummary);
        safeCall(renderBreedingHistory);
        safeCall(renderBreedingDetails);
      } catch (e) { console.warn('refreshDashboardWidgets failed', e); }
    };

    try {
      const debounced = debounce(() => { try { window.refreshDashboardWidgets(); } catch (e) { } }, 180);
      window.addEventListener('sheep-updated', debounced);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') debounced(); });
    } catch (e) { console.warn('dashboard refresh wiring failed', e); }
  })();
});

// --- Storage API: centralized helpers for reading/writing sheep records ---
function saveSheepRecord(sheep) {
  try {
    if (!sheep || (typeof sheep.id === 'undefined' || sheep.id === null || String(sheep.id).trim() === '')) return false;
    const id = String(sheep.id);
    const key = 'sheep-' + id;
    // persist per-record
    localStorage.setItem(key, JSON.stringify(sheep));

    // upsert master list
    try {
      const masterRaw = localStorage.getItem('sheepList') || '[]';
      const master = JSON.parse(masterRaw) || [];
      const idx = master.findIndex(x => x && String(x.id) === id);
      if (idx === -1) master.push(sheep); else master[idx] = Object.assign({}, master[idx] || {}, sheep);
      localStorage.setItem('sheepList', JSON.stringify(master));
    } catch (e) { /* non-fatal */ }

    try { window.dispatchEvent(new CustomEvent('sheep-updated', { detail: { id: id } })); } catch (e) { }
    return true;
  } catch (e) { console.warn('saveSheepRecord failed', e); return false; }
}

function loadSheepRecord(id) {
  try {
    if (typeof id === 'undefined' || id === null) return null;
    const key = 'sheep-' + String(id);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  } catch (e) { console.warn('loadSheepRecord failed', e); return null; }
}

function deleteSheepRecord(id) {
  try {
    if (typeof id === 'undefined' || id === null) return false;
    const sid = String(id);
    const key = 'sheep-' + sid;
    try { localStorage.removeItem(key); } catch (e) { }
    // remove from master list too
    try {
      const master = JSON.parse(localStorage.getItem('sheepList') || '[]') || [];
      const filtered = master.filter(x => !(x && String(x.id) === sid));
      localStorage.setItem('sheepList', JSON.stringify(filtered));
    } catch (e) { }
    try { window.dispatchEvent(new CustomEvent('sheep-deleted', { detail: { id: sid } })); } catch (e) { }
    return true;
  } catch (e) { console.warn('deleteSheepRecord failed', e); return false; }
}

function getAllSheepRecords() {
  try {
    if (typeof getAllSheep === 'function') return getAllSheep();
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.indexOf('sheep-') === 0) {
        try { const raw = localStorage.getItem(k); const s = raw ? JSON.parse(raw) : null; if (s) out.push(s); } catch (e) { }
      }
    }
    return out;
  } catch (e) { console.warn('getAllSheepRecords failed', e); return []; }
}

// Optional remote sync helper. Configure URL in `localStorage.remoteSheepUrl` or pass in `url`.
// Usage: syncSheepRemote({ method: 'GET' }) or syncSheepRemote({ method: 'PUT', payload: data })
async function syncSheepRemote(opts) {
  opts = opts || {};
  const method = (opts.method || 'GET').toUpperCase();
  const url = opts.url || localStorage.getItem('remoteSheepUrl') || '/.netlify/functions/sheep';
  if (!url) throw new Error('No remote URL configured (localStorage.remoteSheepUrl)');
  try {
    if (method === 'GET') {
      const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('Remote GET failed: ' + res.status);
      const text = await res.text();
      try { return JSON.parse(text); } catch (e) { return text; }
    }
    if (method === 'PUT' || method === 'POST') {
      const body = (typeof opts.payload === 'string') ? opts.payload : JSON.stringify(opts.payload || getAllSheepRecords());
      const res = await fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body });
      const txt = await res.text();
      try { return JSON.parse(txt); } catch (e) { return txt; }
    }
    throw new Error('Unsupported method');
  } catch (e) { console.warn('syncSheepRemote failed', e); throw e; }
}

// expose API globally for legacy pages and other modules
try { window.saveSheepRecord = saveSheepRecord; window.loadSheepRecord = loadSheepRecord; window.deleteSheepRecord = deleteSheepRecord; window.getAllSheepRecords = getAllSheepRecords; window.syncSheepRemote = syncSheepRemote; } catch (e) { }
