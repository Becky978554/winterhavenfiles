// finance.js - simple income/output/balance portal for Sheep Management
function initFinance() {
  try { setupUI(); loadEntries(); showSection('income'); } catch (e) { console.warn(e); }
}

function getEntries() {
  try {
    const raw = localStorage.getItem('financeEntries');
    if (!raw) return [];
    return JSON.parse(raw) || [];
  } catch (e) { return []; }
}
function saveEntries(entries) { try { localStorage.setItem('financeEntries', JSON.stringify(entries)); } catch (e) { console.warn(e); } }

function setupUI() {
  document.getElementById('btnIncome').addEventListener('click', () => showSection('income'));
  document.getElementById('btnOutput').addEventListener('click', () => showSection('output'));
  document.getElementById('btnBalance').addEventListener('click', () => showSection('balance'));
  document.getElementById('incomeAdd').addEventListener('click', addIncome);
  document.getElementById('outputAdd').addEventListener('click', addOutput);
  document.getElementById('clearAll').addEventListener('click', clearAll);
  document.getElementById('exportCsv').addEventListener('click', exportCsv);
  try { document.getElementById('exportIncomeCsv').addEventListener('click', exportIncomeCsv); } catch (e) { }
  try { document.getElementById('exportOutputCsv').addEventListener('click', exportOutputCsv); } catch (e) { }
  try { document.getElementById('exportBalanceCsv').addEventListener('click', exportBalanceCsv); } catch (e) { }
}

function showSection(sec) {
  document.getElementById('incomeSection').style.display = (sec === 'income') ? '' : 'none';
  document.getElementById('outputSection').style.display = (sec === 'output') ? '' : 'none';
  document.getElementById('balanceSection').style.display = (sec === 'balance') ? '' : 'none';
}

function loadEntries() {
  const entries = getEntries();
  renderTable('incomeTable', entries.filter(e => e.type === 'income'));
  renderTable('outputTable', entries.filter(e => e.type === 'output'));
  renderRecent(entries.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 50));
  renderTotals(entries);
}

function renderTable(id, list) {
  const tbody = document.getElementById(id).querySelector('tbody');
  tbody.innerHTML = '';
  list.forEach((e, idx) => {
    const tr = document.createElement('tr');
    const dTd = document.createElement('td'); dTd.textContent = formatDate(e.date);
    const descTd = document.createElement('td'); descTd.textContent = e.desc || '';
    const amtTd = document.createElement('td'); amtTd.style.textAlign = 'right'; amtTd.textContent = formatMoney(e.amount || 0);
    const actTd = document.createElement('td');
    const del = document.createElement('button'); del.className = 'button'; del.textContent = 'Delete';
    del.addEventListener('click', () => { deleteEntry(e.id); });
    actTd.appendChild(del);
    tr.appendChild(dTd); tr.appendChild(descTd); tr.appendChild(amtTd); tr.appendChild(actTd);
    tbody.appendChild(tr);
  });
}

function renderRecent(list) {
  const tbody = document.getElementById('recentTable').querySelector('tbody');
  tbody.innerHTML = '';
  list.forEach(e => {
    const tr = document.createElement('tr');
    const dTd = document.createElement('td'); dTd.textContent = formatDate(e.date);
    const descTd = document.createElement('td'); descTd.textContent = e.desc || '';
    const amtTd = document.createElement('td'); amtTd.style.textAlign = 'right'; amtTd.textContent = formatMoney(e.amount || 0);
    const typeTd = document.createElement('td'); typeTd.textContent = e.type || '';
    tr.appendChild(dTd); tr.appendChild(descTd); tr.appendChild(amtTd); tr.appendChild(typeTd);
    tbody.appendChild(tr);
  });
}

function renderTotals(entries) {
  const income = entries.filter(e => e.type === 'income').reduce((s, x) => s + Number(x.amount || 0), 0);
  const output = entries.filter(e => e.type === 'output').reduce((s, x) => s + Number(x.amount || 0), 0);
  document.getElementById('totalIncome').textContent = formatMoney(income);
  document.getElementById('totalOutput').textContent = formatMoney(output);
  document.getElementById('balanceAmt').textContent = formatMoney(income - output);
}

function addIncome() {
  const date = document.getElementById('incomeDate').value || (new Date()).toISOString().slice(0, 10);
  const amount = parseFloat(document.getElementById('incomeAmount').value) || 0;
  const desc = document.getElementById('incomeDesc').value || '';
  if (!amount) return alert('Enter an amount');
  const entries = getEntries();
  entries.push({ id: 'f' + Date.now(), type: 'income', date, amount: Math.round(amount * 100) / 100, desc });
  saveEntries(entries);
  loadEntries();
  document.getElementById('incomeAmount').value = ''; document.getElementById('incomeDesc').value = '';
}
function addOutput() {
  const date = document.getElementById('outputDate').value || (new Date()).toISOString().slice(0, 10);
  const amount = parseFloat(document.getElementById('outputAmount').value) || 0;
  const desc = document.getElementById('outputDesc').value || '';
  if (!amount) return alert('Enter an amount');
  const entries = getEntries();
  entries.push({ id: 'f' + Date.now(), type: 'output', date, amount: Math.round(amount * 100) / 100, desc });
  saveEntries(entries);
  loadEntries();
  document.getElementById('outputAmount').value = ''; document.getElementById('outputDesc').value = '';
}

function deleteEntry(id) {
  if (!confirm('Delete this entry?')) return;
  let entries = getEntries();
  entries = entries.filter(e => e.id !== id);
  saveEntries(entries);
  loadEntries();
}

function clearAll() {
  if (!confirm('Clear ALL finance entries? This cannot be undone.')) return;
  localStorage.removeItem('financeEntries');
  loadEntries();
}

function exportCsv() {
  const entries = getEntries();
  if (!entries.length) return alert('No entries to export');
  const rows = [['id', 'type', 'date', 'amount', 'description']];
  entries.forEach(e => rows.push([e.id, e.type, e.date, String(e.amount || ''), `"${(e.desc || '').replace(/"/g, '""')}"`]));
  const txt = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([txt], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'finance-entries.csv'; a.click(); URL.revokeObjectURL(url);
}

function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function escapeCsvCell(val) {
  if (val === null || typeof val === 'undefined') return '';
  const s = String(val);
  if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function exportIncomeCsv() {
  const entries = getEntries().filter(e => e.type === 'income');
  if (!entries.length) return alert('No income entries to export');
  const rows = [['id', 'date', 'amount', 'description']];
  entries.forEach(e => rows.push([e.id, e.date || '', String(e.amount || ''), escapeCsvCell(e.desc || '')]));
  const txt = rows.map(r => r.join(',')).join('\n');
  downloadCsv(txt, 'finance-income.csv');
}

function exportOutputCsv() {
  const entries = getEntries().filter(e => e.type === 'output');
  if (!entries.length) return alert('No output entries to export');
  const rows = [['id', 'date', 'amount', 'description']];
  entries.forEach(e => rows.push([e.id, e.date || '', String(e.amount || ''), escapeCsvCell(e.desc || '')]));
  const txt = rows.map(r => r.join(',')).join('\n');
  downloadCsv(txt, 'finance-output.csv');
}

function exportBalanceCsv() {
  const entries = getEntries().slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  if (!entries.length) return alert('No entries to export');
  const rows = [['date', 'description', 'income', 'output', 'running_balance']];
  let balance = 0;
  entries.forEach(e => {
    const income = e.type === 'income' ? Number(e.amount || 0) : 0;
    const output = e.type === 'output' ? Number(e.amount || 0) : 0;
    balance += income - output;
    rows.push([e.date || '', escapeCsvCell(e.desc || ''), income ? String(income) : '', output ? String(output) : '', String(Math.round(balance * 100) / 100)]);
  });
  const txt = rows.map(r => r.join(',')).join('\n');
  downloadCsv(txt, 'finance-balance.csv');
}

function formatMoney(n) { return '$' + (Number(n) || 0).toFixed(2); }
function formatDate(d) { if (!d) return ''; try { const dt = new Date(d); if (isNaN(dt)) return d; return dt.toISOString().slice(0, 10); } catch (e) { return d; } }

// expose for the inline initializer
window.initFinance = initFinance;
