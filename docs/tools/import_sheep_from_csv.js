#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

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
      if (inQuotes && next === '"') { cur += '"'; i++; continue; }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && (ch === '\n' || (ch === '\r' && next === '\n'))) {
      row.push(cur);
      cur = '';
      rows.push(row);
      row = [];
      if (ch === '\r' && next === '\n') i++;
      continue;
    }
    if (!inQuotes && ch === ',') { row.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur !== '' || inQuotes || row.length) row.push(cur);
  if (row.length) rows.push(row);
  if (rows.length && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
  return rows;
}

function usage() { console.log('Usage: node tools/import_sheep_from_csv.js <file.csv>'); process.exit(1); }
if (process.argv.length < 3) usage();
const infile = process.argv[2];
if (!fs.existsSync(infile)) { console.error('Input file not found:', infile); process.exit(2); }
const raw = fs.readFileSync(infile, 'utf8');
const rows = parseCSV(raw);
if (!rows.length) { console.error('No rows parsed'); process.exit(3); }
const header = rows[0].map(h => String(h || '').trim());
const items = [];
for (let r = 1; r < rows.length; r++) {
  const cols = rows[r];
  if (cols.length === 0) continue;
  const obj = {};
  for (let c = 0; c < header.length; c++) {
    const key = header[c] || ('col' + c);
    const val = (typeof cols[c] === 'undefined') ? '' : cols[c];
    obj[key] = val;
  }
  // attempt to parse JSON-like fields
  ['lambings', 'weights', 'breedings'].forEach(k => {
    if (obj[k] && typeof obj[k] === 'string') {
      const s = obj[k].trim();
      if (s.startsWith('[') || s.startsWith('{')) {
        try { obj[k] = JSON.parse(s); } catch (e) { }
      }
    }
  });
  items.push(obj);
}

const publicSheepDir = path.join(process.cwd(), 'public', 'sheep');
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(publicSheepDir)) fs.mkdirSync(publicSheepDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let written = 0;
const master = [];
items.forEach(it => {
  const id = it.id || it.ID || it.Id || (it['sheep-id'] ? it['sheep-id'] : null);
  if (!id) return;
  const out = Object.assign({}, it);
  // coerce numeric weight if present
  if (out.weight !== undefined && out.weight !== null && String(out.weight).trim() !== '') {
    const n = Number(String(out.weight).replace(/[^0-9.\-]/g, ''));
    if (!isNaN(n)) out.weight = n;
  }
  const fname = path.join(publicSheepDir, `${id}.json`);
  try { fs.writeFileSync(fname, JSON.stringify(out, null, 2), 'utf8'); written++; master.push(out); } catch (e) { }
});

const dataFile = path.join(dataDir, 'sheep.json');
fs.writeFileSync(dataFile, JSON.stringify(master, null, 2), 'utf8');
console.log(`Imported ${written} sheep; wrote ${dataFile}`);
process.exit(0);
