#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node tools/import_sheep_from_export.js <export.json>');
  process.exit(1);
}

if (process.argv.length < 3) usage();
const infile = process.argv[2];
if (!fs.existsSync(infile)) {
  console.error('Input file not found:', infile);
  process.exit(2);
}

let raw = fs.readFileSync(infile, 'utf8');
let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.error('Failed to parse JSON:', e.message);
  process.exit(3);
}

// Accept formats: array of sheep objects, or { sheepList: [...] }, or { master: [...] }
let list = [];
if (Array.isArray(parsed)) list = parsed;
else if (parsed && Array.isArray(parsed.sheepList)) list = parsed.sheepList;
else if (parsed && Array.isArray(parsed.master)) list = parsed.master;
else {
  // try to detect localStorage dump: keys -> values map
  if (parsed && typeof parsed === 'object') {
    const keys = Object.keys(parsed).filter(k => k && k.indexOf('sheep-') === 0);
    if (keys.length) {
      keys.forEach(k => {
        try { const s = JSON.parse(parsed[k]); if (s) list.push(s); } catch (e) { }
      });
    }
  }
}

if (!list.length) {
  console.error('No sheep records found in the provided file. Expected an array or object with `sheepList` or `sheep-` keys.');
  process.exit(4);
}

// Ensure output directories
const publicSheepDir = path.join(process.cwd(), 'public', 'sheep');
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(publicSheepDir)) fs.mkdirSync(publicSheepDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Write per-sheep files into public/sheep/<id>.json
let written = 0;
list.forEach(s => {
  try {
    const id = s && (s.id || s.ID || s.tag) ? String(s.id || s.ID || s.tag) : null;
    if (!id) return;
    const outPath = path.join(publicSheepDir, `${id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(s, null, 2), 'utf8');
    written++;
  } catch (e) { }
});

// Write consolidated data file: data/sheep.json
const dataFile = path.join(dataDir, 'sheep.json');
fs.writeFileSync(dataFile, JSON.stringify(list, null, 2), 'utf8');

console.log(`Imported ${written} sheep into ${publicSheepDir}`);
console.log(`Wrote consolidated file: ${dataFile}`);

process.exit(0);
