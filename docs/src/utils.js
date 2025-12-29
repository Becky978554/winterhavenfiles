// Helper to map page names to your existing static pages.
function createPageUrl(pageName) {
  const map = {
    Dashboard: 'index.html',
    Actions: 'actions.html',
    Finances: 'finance.html',
    Reports: 'reports.html',
    Settings: 'settings.html',
  };

  const file = map[pageName];
  if (!file) return '#';
  // Return a root-relative URL so it works when served from web server root
  return `/${file}`;
}

// --- CSV import helpers ---
// Simple CSV parser that supports quoted fields and CRLF/LF
function parseCSV(text) {
  const rows = [];
  if (!text) return rows;
  let cur = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++; // skip escaped quote
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === '\n' || (ch === '\r' && next === '\n'))) {
      // end of field
      row.push(cur);
      cur = '';
      rows.push(row);
      row = [];
      if (ch === '\r' && next === '\n') i++; // skip second char
      continue;
    }
    if (!inQuotes && ch === ',') {
      row.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  // push last
  if (cur !== '' || inQuotes || row.length) row.push(cur);
  if (row.length) rows.push(row);
  // trim possible trailing empty row from final newline
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

// Basic validation for a row after mapping
function validateMappedRow(map, knownFields) {
  // map: { targetField: value }
  const errors = [];
  // id is required
  if (!map.id || String(map.id).trim() === '') errors.push('Missing id');
  // sex if present should be ewe/ram/unknown
  if (map.sex) {
    const s = String(map.sex).toLowerCase();
    if (!['ewe', 'ram', 'unknown', ''].includes(s)) errors.push('Invalid sex (use ewe/ram)');
  }
  // birthDate: try to coerce via Date
  if (map.birthDate) {
    const d = new Date(map.birthDate);
    if (isNaN(d.getTime())) errors.push('Invalid birthDate');
  }
  return errors;
}

// Build sheep object from mapped row
function buildSheepFromMapped(map) {
  const s = {};
  // copy known fields (expanded to include color, breed, age, expectedDueDate, pedigree, lambings, weights)
  const fields = ['id', 'name', 'sex', 'birthDate', 'weight', 'weightDate', 'bredDate', 'breedingDate', 'sire', 'dam', 'status', 'notes', 'color', 'breed', 'age', 'expectedDueDate', 'pedigree', 'lambings', 'weights'];
  fields.forEach(f => {
    if (typeof map[f] !== 'undefined' && map[f] !== null && String(map[f]).trim() !== '') {
      s[f] = map[f];
    }
  });

  // coerce top-level weight to number if present
  if (s.weight !== undefined) {
    const n = Number(String(s.weight).replace(/[^0-9.\-]/g, ''));
    if (!isNaN(n)) s.weight = n; else delete s.weight;
  }

  // debug: show weight presence after initial mapping
  try { console.debug && console.debug('buildSheepFromMapped initial', { id: s.id, weight: s.weight, weights: s.weights }); } catch (e) { }

  // parse lambings if provided as JSON or semicolon-separated list
  if (s.lambings && !Array.isArray(s.lambings)) {
    const raw = String(s.lambings).trim();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (Array.isArray(parsed)) {
      s.lambings = parsed;
    } else {
      // accept semicolon-separated like "2025-03-03:2;2024-01-01:1" or simple counts
      const parts = raw.split(';').map(p => p.trim()).filter(Boolean);
      const out = [];
      parts.forEach(p => {
        const pieces = p.split(':').map(x => x.trim());
        if (pieces.length === 2 && /^\d{4}/.test(pieces[0])) {
          out.push({ date: pieces[0], count: parseInt(pieces[1], 10) || 0 });
        } else if (pieces.length >= 1 && /^\d{4}/.test(pieces[0])) {
          out.push({ date: pieces[0], count: 1 });
        } else {
          const n = parseInt(pieces[0], 10);
          if (!isNaN(n)) out.push({ date: new Date().toISOString().slice(0, 10), count: n });
        }
      });
      if (out.length) s.lambings = out; else delete s.lambings;
    }
  }

  // parse weights if provided as JSON array of {date,weight}
  if (s.weights && !Array.isArray(s.weights)) {
    const raw = String(s.weights).trim();
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (Array.isArray(parsed)) {
      const out = parsed.map(x => {
        const date = x && x.date ? String(x.date) : '';
        const wtRaw = x && (x.weight !== undefined) ? x.weight : (x && x.w ? x.w : undefined);
        const n = wtRaw !== undefined && wtRaw !== null && String(wtRaw).trim() !== '' ? Number(String(wtRaw).replace(/[^0-9.\-]/g, '')) : NaN;
        return (date && !isNaN(new Date(date).getTime()) && !isNaN(n)) ? { date: date, weight: n } : null;
      }).filter(Boolean);
      if (out.length) {
        out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        s.weights = out;
        // also set top-level weight to latest numeric
        const latest = out.slice().map(w => ({ d: new Date(w.date), wt: Number(w.weight) })).filter(p => p.d && !isNaN(p.d.getTime()) && !isNaN(p.wt));
        if (latest.length) {
          latest.sort((a, b) => b.d.getTime() - a.d.getTime());
          s.weight = latest[0].wt;
        }
      } else {
        delete s.weights;
      }
    } else {
      delete s.weights;
    }
  }

  try { console.debug && console.debug('buildSheepFromMapped after weights parse', { id: s.id, weight: s.weight, weights: s.weights }); } catch (e) { }

  // accept a pair of columns weightDate + weight to create a single dated weight
  if ((!s.weights || !s.weights.length) && s.weightDate && s.weight !== undefined) {
    try {
      const d = String(s.weightDate).trim();
      const n = Number(String(s.weight).replace(/[^0-9.\-]/g, ''));
      if (!isNaN(new Date(d).getTime()) && !isNaN(n)) {
        s.weights = [{ date: d, weight: n }];
      }
    } catch (e) { }
    // remove transient weightDate field
    try { delete s.weightDate; } catch (e) { }
  }

  try { console.debug && console.debug('buildSheepFromMapped final', { id: s.id, weight: s.weight, weights: s.weights }); } catch (e) { }

  return s;
}

// Perform import: items is array of sheep objects to create; returns a detailed report object
function performImport(items, opts) {
  if (!Array.isArray(items)) return { created: [], merged: [], overwritten: [], skipped: [], details: {} };
  opts = opts || {};
  const mergeMode = !!opts.merge;
  const overwrite = (typeof opts.overwrite !== 'undefined') ? !!opts.overwrite : true;
  const created = [];
  const report = { created: [], merged: [], overwritten: [], skipped: [], details: {} };
  try {
    const masterRaw = localStorage.getItem('sheepList') || '[]';
    let master = [];
    try { master = JSON.parse(masterRaw) || []; } catch (e) { master = []; }
    // backup master for undo
    try { sessionStorage.setItem('lastImport_backup_sheepList', JSON.stringify(master)); } catch (e) { }
    items.forEach(it => {
      try {
        if (!it || !it.id) return;
        // normalize incoming item: coerce weight and weights entries to numeric, map breeding fields
        try {
          if (it.weight !== undefined && it.weight !== null && String(it.weight).trim() !== '') {
            const n = Number(String(it.weight).replace(/[^0-9.\-]/g, ''));
            if (!isNaN(n)) it.weight = n; else {
              const p = parseFloat(String(it.weight)); if (!isNaN(p)) it.weight = p;
            }
          }
          if (it.weights && !Array.isArray(it.weights)) {
            try { const parsed = typeof it.weights === 'string' ? JSON.parse(it.weights) : it.weights; if (Array.isArray(parsed)) it.weights = parsed; else delete it.weights; } catch (e) { delete it.weights; }
          }
          if (Array.isArray(it.weights)) {
            it.weights = it.weights.map(w => {
              try {
                const date = w && w.date ? String(w.date) : (w && w.d ? String(w.d) : '');
                let wt = (w && w.weight !== undefined) ? w.weight : (w && w.w !== undefined ? w.w : undefined);
                if (wt !== undefined && wt !== null && String(wt).trim() !== '') { const nn = Number(String(wt).replace(/[^0-9.\-]/g, '')); if (!isNaN(nn)) wt = nn; else { const pp = parseFloat(String(wt)); if (!isNaN(pp)) wt = pp; } }
                return (date || wt !== undefined) ? { date: String(date || ''), weight: wt } : null;
              } catch (e) { return null; }
            }).filter(Boolean);
            if (it.weights.length && (it.weight === undefined || it.weight === null || it.weight === '')) {
              const parsed = it.weights.map(w => ({ d: w.date ? new Date(w.date) : null, wt: (w.weight !== undefined && w.weight !== null && w.weight !== '') ? Number(w.weight) : NaN })).filter(p => p && p.d && !isNaN(p.d.getTime()) && !isNaN(p.wt));
              if (parsed.length) { parsed.sort((a, b) => b.d.getTime() - a.d.getTime()); it.weight = parsed[0].wt; }
            }
          }
          // map common breeding fields into `bredDate` when present
          if ((!it.bredDate || it.bredDate === '') && it.breedingDate) it.bredDate = it.breedingDate;
          if ((!it.bredDate || it.bredDate === '') && it.bred) it.bredDate = it.bred;
        } catch (e) { /* ignore normalization errors */ }
        const key = 'sheep-' + String(it.id);
        try { console.debug && console.debug('performImport item', { id: it.id, weight: it.weight, weights: it.weights ? it.weights.length : 0, mergeMode: mergeMode, overwrite: overwrite }); } catch (e) { }
        const prev = localStorage.getItem(key);
        const idStr = String(it.id);
        // if exists and user chose to skip (not overwrite and not merge) then don't modify
        if (prev !== null && !overwrite && !mergeMode) {
          try { console.debug && console.debug('performImport skip existing (no-overwrite):', { id: it.id }); } catch (e) { }
          try { sessionStorage.setItem('lastImport_prev_' + key, prev === null ? '__MISSING__' : prev); } catch (e) { }
          report.skipped.push(idStr);
          report.details[idStr] = { action: 'skipped' };
          return; // skip this item
        }

        // prepare final item to persist. In merge mode, append/dedupe weights into existing record
        let finalItem = it;
        if (mergeMode && prev !== null) {
          try {
            const existing = JSON.parse(prev) || {};
            const merged = Object.assign({}, existing);
            const addedFields = [];
            // copy non-empty incoming fields only when existing is missing/empty (avoid overwriting core existing data)
            Object.keys(it || {}).forEach(k => {
              if (k === 'weights') return;
              const val = it[k];
              if (val === undefined || val === null) return;
              if (typeof val === 'string' && val.trim() === '') return;
              if (merged[k] === undefined || merged[k] === null || (typeof merged[k] === 'string' && String(merged[k]).trim() === '')) { merged[k] = val; addedFields.push(k); }
            });
            // combine weights arrays (existing first), then dedupe by date keeping the incoming value when duplicate
            const existingWeights = Array.isArray(existing.weights) ? existing.weights.slice() : [];
            const incomingWeights = Array.isArray(it.weights) ? it.weights.slice() : [];
            try { console.debug && console.debug('performImport merge debug', { id: idStr, existingWeights: existingWeights, incomingWeights: incomingWeights }); } catch (e) { }
            const combined = existingWeights.concat(incomingWeights);
            const byDate = {};
            combined.forEach(w => {
              try {
                const d = w && w.date ? String(w.date) : '';
                if (!d) return;
                const wtRaw = (w && typeof w.weight !== 'undefined') ? w.weight : (w && w.w !== undefined ? w.w : undefined);
                if (wtRaw === undefined || wtRaw === null || (String(wtRaw || '').trim() === '')) return;
                const wt = Number(String(wtRaw).replace(/[^0-9.\-]/g, ''));
                if (!isNaN(wt)) byDate[d] = wt;
              } catch (e) { }
            });
            const out = Object.keys(byDate).map(d => ({ date: d, weight: byDate[d] }));
            out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
            const addedWeightDates = [];
            if (out.length) {
              merged.weights = out;
              // determine which incoming dates were newly added compared to existing
              try {
                const existDates = new Set((existingWeights || []).map(x => String(x && x.date)));
                (incomingWeights || []).forEach(w => { const d = w && w.date ? String(w.date) : ''; if (d && !existDates.has(d)) addedWeightDates.push(d); });
              } catch (e) { }
              const parsed = out.map(w => ({ d: new Date(w.date), wt: Number(w.weight) })).filter(p => p.d && !isNaN(p.d.getTime()) && !isNaN(p.wt));
              if (parsed.length) { parsed.sort((a, b) => b.d.getTime() - a.d.getTime()); merged.weight = parsed[0].wt; }
            }
            try { console.debug && console.debug('performImport merge final', { id: idStr, mergedWeights: merged.weights, mergedTopWeight: merged.weight, addedWeightDates: addedWeightDates }); } catch (e) { }
            finalItem = merged;
            report.merged.push(idStr);
            report.details[idStr] = { action: 'merged', addedFields: addedFields, addedWeightDates: addedWeightDates };
          } catch (e) { /* fall back to incoming item */ }
        } else if (prev !== null && overwrite) {
          // this will overwrite existing - record overwritten fields
          try {
            const existing = JSON.parse(prev) || {};
            const overwrittenFields = [];
            Object.keys(it || {}).forEach(k => {
              try {
                const a = existing[k];
                const b = it[k];
                if (typeof a === 'undefined' && typeof b !== 'undefined') overwrittenFields.push(k);
                else if (typeof a !== 'undefined' && JSON.stringify(a) !== JSON.stringify(b)) overwrittenFields.push(k);
              } catch (e) { }
            });
            report.overwritten.push(idStr);
            report.details[idStr] = { action: 'overwritten', overwrittenFields: overwrittenFields };
          } catch (e) { report.details[idStr] = { action: 'overwritten' }; }
        } else if (prev === null) {
          report.created.push(idStr);
          report.details[idStr] = { action: 'created' };
        }

        try { sessionStorage.setItem('lastImport_prev_' + key, prev === null ? '__MISSING__' : prev); } catch (e) { }
        localStorage.setItem(key, JSON.stringify(finalItem));
        // upsert master
        const idx = master.findIndex(x => x && String(x.id) === String(finalItem.id));
        if (idx === -1) master.push(finalItem); else master[idx] = Object.assign({}, master[idx], finalItem);
        created.push(key);
        // If a centralized save helper exists, use it to ensure UI update hooks run
        try {
          if (typeof window !== 'undefined' && typeof window.saveSheepRecord === 'function') {
            try { window.saveSheepRecord(it); } catch (e) { /* ignore save helper errors */ }
          } else {
            // fallback: dispatch an update event so pages can refresh
            try { if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent('sheep-updated', { detail: { id: String(it.id) } })); } catch (e) { }
          }
        } catch (e) { }
      } catch (e) { console.warn('import item write failed', e); }
    });
    try { localStorage.setItem('sheepList', JSON.stringify(master)); } catch (e) { }
    try { sessionStorage.setItem('lastImport_created', JSON.stringify(created)); } catch (e) { }
    // dispatch a high-level import event so other open pages can react
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try { window.dispatchEvent(new CustomEvent('sheep-imported', { detail: { created: created.slice() } })); } catch (e) { }
      }
    } catch (e) { }
    // also notify that the sheep list was updated
    try {
      if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
        try { window.dispatchEvent(new CustomEvent('sheep-list-updated', { detail: { created: created.slice() } })); } catch (e) { }
      }
    } catch (e) { }
  } catch (e) { console.warn('performImport failed', e); }
  // return the detailed report for UI consumption
  try { return report; } catch (e) { return created; }
}

// Undo last import (restores previous keys and sheepList)
function undoLastImport() {
  try {
    const createdRaw = sessionStorage.getItem('lastImport_created');
    if (!createdRaw) return { restored: 0 };
    const created = JSON.parse(createdRaw) || [];
    let restored = 0;
    created.forEach(k => {
      try {
        const prev = sessionStorage.getItem('lastImport_prev_' + k);
        if (prev === '__MISSING__') {
          localStorage.removeItem(k);
        } else if (prev !== null) {
          localStorage.setItem(k, prev);
        }
        restored++;
      } catch (e) { }
    });
    // restore master list backup
    try {
      const backup = sessionStorage.getItem('lastImport_backup_sheepList');
      if (backup !== null) localStorage.setItem('sheepList', backup);
    } catch (e) { }
    // clear session storage keys
    try { sessionStorage.removeItem('lastImport_created'); } catch (e) { }
    // also remove prev_ keys
    created.forEach(k => { try { sessionStorage.removeItem('lastImport_prev_' + k); } catch (e) { } });
    try { sessionStorage.removeItem('lastImport_backup_sheepList'); } catch (e) { }
    return { restored };
  } catch (e) { return { restored: 0, error: String(e) }; }
}

// expose to window for non-module pages
try { window.parseCSV = parseCSV; window.validateMappedRow = validateMappedRow; window.buildSheepFromMapped = buildSheepFromMapped; window.performImport = performImport; window.undoLastImport = undoLastImport; } catch (e) { }
