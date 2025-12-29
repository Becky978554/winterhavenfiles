#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function load(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; }
}

function isLambByBirthDate(s, monthsThreshold = 8) {
  if (!s || !s.birthDate) return false;
  try {
    const bd = new Date(s.birthDate);
    if (isNaN(bd)) return false;
    const now = new Date();
    const months = (now.getFullYear() - bd.getFullYear()) * 12 + (now.getMonth() - bd.getMonth());
    return months < monthsThreshold;
  } catch (e) { return false; }
}

function analyze(file) {
  const data = load(file);
  if (!Array.isArray(data)) { console.error('Not an array:', file); process.exit(2); }
  const totals = { total: data.length, ewes: 0, rams: 0, unknown: 0, active: 0, culled: 0, sold: 0, archived: 0, lambs: 0 };
  data.forEach(s => {
    const sex = (s && s.sex || '').toString().toLowerCase();
    const status = (s && s.status || '').toString().toLowerCase();
    if (sex === 'ewe' || sex === '' || sex === 'unknown') totals.ewes++;
    else if (sex === 'ram') totals.rams++;
    else totals.unknown++;
    if (!(status === 'culled' || status === 'sold' || status === 'archived')) totals.active++;
    if (status === 'culled') totals.culled++;
    if (status === 'sold') totals.sold++;
    if (status === 'archived') totals.archived++;
    if (isLambByBirthDate(s)) totals.lambs++;
  });
  return totals;
}

const docsFile = path.join(process.cwd(), 'docs', 'data', 'sheep.json');
const rootFile = path.join(process.cwd(), 'data', 'sheep.json');
console.log('Analyzing:', docsFile);
if (fs.existsSync(docsFile)) {
  console.log('docs/data/sheep.json ->', analyze(docsFile));
} else console.log('docs/data/sheep.json not found');

console.log('Analyzing root data/sheep.json ->', rootFile);
if (fs.existsSync(rootFile)) {
  console.log('root data/sheep.json ->', analyze(rootFile));
} else console.log('root data/sheep.json not found');
