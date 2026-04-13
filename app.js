// app.js — Core application logic
// Manages: data storage, screen navigation, form handling, SMS parsing UI

// ═══════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════

function getEntries() {
  try { return JSON.parse(localStorage.getItem('expense_entries') || '[]'); }
  catch { return []; }
}

function saveEntries(entries) {
  localStorage.setItem('expense_entries', JSON.stringify(entries));
}

function getSettings() {
  try { return JSON.parse(localStorage.getItem('app_settings') || '{}'); }
  catch { return {}; }
}

function saveSettings(settings) {
  localStorage.setItem('app_settings', JSON.stringify(settings));
}

function getCurrency() {
  return getSettings().currency || '₹';
}

function addEntry(entry) {
  const entries = getEntries();
  entry.id = Date.now() + Math.random();
  entries.unshift(entry); // newest first
  saveEntries(entries);
  return entry;
}

function deleteEntry(id) {
  const entries = getEntries().filter(e => e.id !== id);
  saveEntries(entries);
}

// ═══════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════

let currentScreen = 'home';

function navigate(screen) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  const el = document.getElementById('screen-' + screen);
  if (el) el.classList.add('active');

  const nav = document.getElementById('nav-' + screen);
  if (nav) nav.classList.add('active');

  currentScreen = screen;

  // Show/hide FAB
  const fab = document.getElementById('fab-add');
  fab.style.display = (screen === 'add') ? 'none' : 'flex';

  // Refresh screen content
  if (screen === 'home') renderHome();
  if (screen === 'history') renderHistory();
  if (screen === 'insights') renderInsights();
  if (screen === 'add') resetAddForm();

  // Scroll to top
  if (el) el.scrollTop = 0;
}

// ═══════════════════════════════════════════════════
// HOME SCREEN
// ═══════════════════════════════════════════════════

function renderHome() {
  const entries = getEntries();
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const monthEntries = entries.filter(e => e.month === currentMonth);
  const currency = getCurrency();

  const income = monthEntries.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
  const expenses = monthEntries.filter(e => e.type === 'debit').reduce((s, e) => s + e.amount, 0);
  const balance = income - expenses;

  // Balance
  const balEl = document.getElementById('home-balance');
  balEl.textContent = currency + formatAmount(Math.abs(balance));
  balEl.className = 'header-balance ' + (balance >= 0 ? 'positive' : 'negative');
  if (balance < 0) balEl.textContent = '-' + currency + formatAmount(Math.abs(balance));

  document.getElementById('home-income').textContent = currency + formatAmount(income);
  document.getElementById('home-expenses').textContent = currency + formatAmount(expenses);

  // Month label
  document.getElementById('home-month').textContent = formatMonthLabel(currentMonth);

  // Nudges
  const nudges = generateNudges(entries, currentMonth);
  renderNudges(nudges);

  // Recent transactions (last 5)
  const recent = entries.slice(0, 5);
  renderTransactionList('recent-list', recent, true);
}

function renderNudges(nudges) {
  const container = document.getElementById('nudges-container');
  const badge = document.getElementById('nudge-count');

  badge.textContent = nudges.length;

  if (nudges.length === 0) {
    container.innerHTML = '<div class="empty-nudges">No nudges yet — add some transactions to get insights.</div>';
    return;
  }

  container.innerHTML = nudges.map(n => `
    <div class="nudge-item nudge-${n.type}">
      <span class="nudge-emoji">${n.emoji}</span>
      <span class="nudge-text">${n.text}</span>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════
// HISTORY SCREEN
// ═══════════════════════════════════════════════════

function renderHistory() {
  const entries = getEntries();
  populateMonthFilter('filter-month', entries);
  populateBankFilter(entries);
  applyFilters();
}

function applyFilters() {
  const entries = getEntries();
  const month = document.getElementById('filter-month').value;
  const category = document.getElementById('filter-category').value;
  const bank = document.getElementById('filter-bank').value;
  const search = document.getElementById('search-input').value.toLowerCase();

  let filtered = entries;
  if (month) filtered = filtered.filter(e => e.month === month);
  if (category) filtered = filtered.filter(e => e.category === category);
  if (bank) filtered = filtered.filter(e => e.bank === bank);
  if (search) filtered = filtered.filter(e =>
    (e.merchant || '').toLowerCase().includes(search) ||
    (e.note || '').toLowerCase().includes(search) ||
    (e.category || '').toLowerCase().includes(search)
  );

  renderTransactionList('history-list', filtered);
  renderHistorySummary(filtered);
}

function renderHistorySummary(entries) {
  const currency = getCurrency();
  const income = entries.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
  const expenses = entries.filter(e => e.type === 'debit').reduce((s, e) => s + e.amount, 0);
  const count = entries.length;

  document.getElementById('history-summary').innerHTML = `
    <div class="month-stat"><div class="month-stat-label">Entries</div><div class="month-stat-value">${count}</div></div>
    <div class="month-stat"><div class="month-stat-label">Income</div><div class="month-stat-value" style="color:var(--green)">${currency}${formatAmount(income)}</div></div>
    <div class="month-stat"><div class="month-stat-label">Spent</div><div class="month-stat-value" style="color:var(--red)">${currency}${formatAmount(expenses)}</div></div>
    <div class="month-stat"><div class="month-stat-label">Balance</div><div class="month-stat-value" style="color:${income-expenses>=0?'var(--green)':'var(--red)'}">${currency}${formatAmount(income - expenses)}</div></div>
  `;
}

// ═══════════════════════════════════════════════════
// TRANSACTION LIST RENDERER
// ═══════════════════════════════════════════════════

function renderTransactionList(containerId, entries, isRecent = false) {
  const container = document.getElementById(containerId);
  const currency = getCurrency();

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💸</div>
        <div class="empty-title">No transactions yet</div>
        <div class="empty-sub">Tap + to add your first entry or paste a bank SMS</div>
      </div>`;
    return;
  }

  container.innerHTML = entries.map(e => `
    <div class="txn-item" onclick="showEntryDetail('${e.id}')">
      <div class="txn-icon">${getCategoryEmoji(e.category)}</div>
      <div class="txn-body">
        <div class="txn-merchant">${e.merchant || 'Unknown'}</div>
        <div class="txn-meta">${e.category || 'Uncategorized'} ${e.bank ? '· ' + e.bank : ''}</div>
      </div>
      <div class="txn-right">
        <div class="txn-amount ${e.type}">${e.type === 'debit' ? '-' : '+'}${currency}${formatAmount(e.amount)}</div>
        <div class="txn-date">${formatDisplayDate(e.date)}</div>
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════
// INSIGHTS SCREEN
// ═══════════════════════════════════════════════════

function renderInsights() {
  const entries = getEntries();
  populateMonthFilter('insights-month', entries);

  const selectedMonth = document.getElementById('insights-month').value;
  renderInsightsForMonth(entries, selectedMonth);
}

function renderInsightsForMonth(entries, selectedMonth) {
  const currency = getCurrency();
  const now = new Date();
  const currentMonth = selectedMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  renderCharts(entries, currentMonth);
  renderTopMerchants(entries, currentMonth, currency);
  renderOptimizationTips(entries, currentMonth, currency);
}

function renderTopMerchants(entries, month, currency) {
  const monthEntries = entries.filter(e => e.month === month && e.type === 'debit');

  const merchantTotals = {};
  for (const e of monthEntries) {
    const key = e.merchant || 'Unknown';
    if (!merchantTotals[key]) merchantTotals[key] = { amount: 0, count: 0 };
    merchantTotals[key].amount += e.amount;
    merchantTotals[key].count++;
  }

  const sorted = Object.entries(merchantTotals)
    .sort((a, b) => b[1].amount - a[1].amount)
    .slice(0, 8);

  const container = document.getElementById('top-merchants');
  if (sorted.length === 0) {
    container.innerHTML = '<div class="empty-nudges">No expense data for this month.</div>';
    return;
  }

  container.innerHTML = sorted.map(([name, data]) => `
    <div class="merchant-row">
      <div>
        <div class="merchant-name">${name}</div>
        <div class="merchant-count">${data.count} transaction${data.count > 1 ? 's' : ''}</div>
      </div>
      <div class="merchant-amount">${currency}${formatAmount(data.amount)}</div>
    </div>
  `).join('');
}

function renderOptimizationTips(entries, month, currency) {
  const tips = generateOptimizationTips(entries, month, currency);
  const container = document.getElementById('optimization-tips');

  if (tips.length === 0) {
    container.innerHTML = '<div class="empty-nudges">Add more transactions to get personalized tips.</div>';
    return;
  }

  container.innerHTML = tips.map(t => `
    <div class="tip-item">
      <div class="tip-emoji">${t.emoji}</div>
      <div>
        <div class="tip-title">${t.title}</div>
        <div class="tip-body">${t.body}</div>
        ${t.saving ? `<div class="tip-saving">Potential saving: ${t.saving}</div>` : ''}
      </div>
    </div>
  `).join('');
}

// ═══════════════════════════════════════════════════
// ADD ENTRY FORM
// ═══════════════════════════════════════════════════

let currentEntryType = 'debit';

function setEntryType(type) {
  currentEntryType = type;
  document.getElementById('btn-debit').classList.toggle('active', type === 'debit');
  document.getElementById('btn-credit').classList.toggle('active', type === 'credit');

  // Auto-set category for income
  if (type === 'credit') {
    document.getElementById('field-category').value = 'Income';
  }
}

function resetAddForm() {
  currentEntryType = 'debit';
  document.getElementById('btn-debit').classList.add('active');
  document.getElementById('btn-credit').classList.remove('active');
  document.getElementById('field-amount').value = '';
  document.getElementById('field-merchant').value = '';
  document.getElementById('field-category').value = 'Food';
  document.getElementById('field-bank').value = '';
  document.getElementById('field-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('field-note').value = '';
  document.getElementById('sms-input').value = '';
  document.getElementById('sms-parse-result').classList.add('hidden');
  document.getElementById('auto-category-tag').classList.add('hidden');
}

// Auto-categorize when user types merchant name
document.getElementById('field-merchant').addEventListener('input', function () {
  const merchant = this.value;
  if (merchant.length > 2) {
    const result = categorize(merchant);
    if (result.confidence !== 'none') {
      document.getElementById('field-category').value = result.category;
      document.getElementById('auto-category-tag').classList.remove('hidden');
    } else {
      document.getElementById('auto-category-tag').classList.add('hidden');
    }
  }
});

// Form submit
document.getElementById('entry-form').addEventListener('submit', function (e) {
  e.preventDefault();

  const amount = parseFloat(document.getElementById('field-amount').value);
  if (!amount || amount <= 0) {
    showToast('Please enter a valid amount');
    return;
  }

  const merchant = document.getElementById('field-merchant').value.trim() || 'Unknown';
  const category = document.getElementById('field-category').value;
  const bank = document.getElementById('field-bank').value;
  const date = document.getElementById('field-date').value || new Date().toISOString().split('T')[0];
  const note = document.getElementById('field-note').value.trim();
  const month = date.substring(0, 7);

  const entry = {
    amount,
    type: currentEntryType,
    merchant,
    category,
    bank,
    date,
    month,
    note,
    source: 'manual'
  };

  addEntry(entry);
  showToast('Entry saved ✓');
  navigate('home');
});

// SMS Parse button
document.getElementById('parse-sms-btn').addEventListener('click', function () {
  const smsText = document.getElementById('sms-input').value.trim();
  if (!smsText) {
    showToast('Please paste an SMS first');
    return;
  }

  const parsed = parseBankSMS(smsText);
  if (!parsed) {
    showToast('Could not read this SMS — try manual entry');
    document.getElementById('sms-parse-result').classList.add('hidden');
    return;
  }

  // Auto-categorize the merchant
  const catResult = categorize(parsed.merchant || '');

  // Fill the result preview
  const resultEl = document.getElementById('sms-parse-result');
  resultEl.classList.remove('hidden');
  resultEl.innerHTML = `
    <div class="parsed-row"><span class="parsed-label">Amount</span><span class="parsed-value">${getCurrency()}${formatAmount(parsed.amount)}</span></div>
    <div class="parsed-row"><span class="parsed-label">Type</span><span class="parsed-value" style="color:${parsed.type==='debit'?'var(--red)':'var(--green)'}">${parsed.type === 'debit' ? 'Expense (Debit)' : 'Income (Credit)'}</span></div>
    <div class="parsed-row"><span class="parsed-label">Merchant</span><span class="parsed-value">${parsed.merchant || 'Unknown'}</span></div>
    <div class="parsed-row"><span class="parsed-label">Category</span><span class="parsed-value">${catResult.emoji} ${catResult.category}</span></div>
    <div class="parsed-row"><span class="parsed-label">Bank</span><span class="parsed-value">${parsed.bank || 'Unknown'}</span></div>
    <div class="parsed-row"><span class="parsed-label">Date</span><span class="parsed-value">${parsed.date || 'Today'}</span></div>
  `;

  // Fill the form with parsed data
  setEntryType(parsed.type);
  document.getElementById('field-amount').value = parsed.amount;
  document.getElementById('field-merchant').value = parsed.merchant || '';
  document.getElementById('field-category').value = catResult.category;
  if (parsed.bank) document.getElementById('field-bank').value = parsed.bank;
  if (parsed.date) document.getElementById('field-date').value = parsed.date;

  if (catResult.confidence !== 'none') {
    document.getElementById('auto-category-tag').classList.remove('hidden');
  }

  showToast('SMS parsed — review and save');
});

// ═══════════════════════════════════════════════════
// ASK CLAUDE
// ═══════════════════════════════════════════════════

function askClaude(question) {
  const q = question || document.getElementById('claude-question').value.trim();
  if (!q) {
    showToast('Please enter a question');
    return;
  }

  const entries = getEntries();
  const prompt = buildClaudePrompt(entries, q);

  // Copy to clipboard
  navigator.clipboard.writeText(prompt).then(() => {
    showToast('Copied! Opening Claude...');
    setTimeout(() => {
      window.open('https://claude.ai', '_blank');
    }, 800);
  }).catch(() => {
    // Fallback: show prompt in alert
    showToast('Clipboard blocked — copy manually');
    const ta = document.createElement('textarea');
    ta.value = prompt;
    ta.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;bottom:10px;z-index:9999;font-size:12px;padding:12px;background:#1e293b;color:white;border:1px solid #6366f1;border-radius:12px;';
    document.body.appendChild(ta);
    ta.select();
    setTimeout(() => ta.remove(), 10000);
  });
}

function buildClaudePrompt(entries, question) {
  const now = new Date();
  const months = [];

  // Get last 3 months of data
  for (let i = 0; i < 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthEntries = entries.filter(e => e.month === key);

    if (monthEntries.length === 0) continue;

    const income = monthEntries.filter(e => e.type === 'credit').reduce((s, e) => s + e.amount, 0);
    const expenses = monthEntries.filter(e => e.type === 'debit').reduce((s, e) => s + e.amount, 0);

    // Category breakdown
    const catTotals = {};
    for (const e of monthEntries.filter(e => e.type === 'debit')) {
      catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
    }
    const catBreakdown = Object.entries(catTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, amt]) => `  ${cat}: ₹${formatAmount(amt)}`)
      .join('\n');

    months.push(`${formatMonthLabel(key)}:\n  Income: ₹${formatAmount(income)}\n  Total Expenses: ₹${formatAmount(expenses)}\n  Breakdown:\n${catBreakdown}`);
  }

  const settings = getSettings();
  const budget = settings.budget ? `Monthly budget: ₹${settings.budget}` : '';

  return `Here is my personal expense data for the last ${months.length} month(s). Please answer my question at the end.

${budget ? budget + '\n\n' : ''}--- EXPENSE DATA ---
${months.join('\n\n')}
---

My question: ${question}

Please give me specific, actionable advice in plain English. Use Indian Rupee (₹) amounts. Be direct and concise.`;
}

// ═══════════════════════════════════════════════════
// ENTRY DETAIL / DELETE
// ═══════════════════════════════════════════════════

function showEntryDetail(id) {
  const entries = getEntries();
  const entry = entries.find(e => String(e.id) === String(id));
  if (!entry) return;

  const currency = getCurrency();
  const confirmed = confirm(
    `${entry.merchant || 'Unknown'}\n${entry.type === 'debit' ? '-' : '+'}${currency}${formatAmount(entry.amount)}\n${entry.category} · ${entry.date}\n\nDelete this entry?`
  );
  if (confirmed) {
    deleteEntry(entry.id);
    showToast('Entry deleted');
    if (currentScreen === 'home') renderHome();
    if (currentScreen === 'history') renderHistory();
  }
}

// ═══════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════

function openSettings() {
  const settings = getSettings();
  document.getElementById('setting-name').value = settings.name || '';
  document.getElementById('setting-currency').value = settings.currency || '₹';
  document.getElementById('setting-budget').value = settings.budget || '';

  // Build shortcut URL
  const baseUrl = window.location.href.split('?')[0];
  const shortcutUrl = `${baseUrl}?sms=[Shortcut Input]`;
  document.getElementById('shortcut-url').textContent = shortcutUrl;

  document.getElementById('settings-modal').classList.remove('hidden');
}

function closeSettings() {
  document.getElementById('settings-modal').classList.add('hidden');
}

document.getElementById('save-settings-btn').addEventListener('click', function () {
  const settings = {
    name: document.getElementById('setting-name').value.trim(),
    currency: document.getElementById('setting-currency').value,
    budget: parseFloat(document.getElementById('setting-budget').value) || 0
  };
  saveSettings(settings);
  closeSettings();
  showToast('Settings saved ✓');
  renderHome();
});

document.getElementById('copy-shortcut-url').addEventListener('click', function () {
  const url = document.getElementById('shortcut-url').textContent;
  navigator.clipboard.writeText(url).then(() => showToast('URL copied!'));
});

// Export JSON
document.getElementById('export-json-btn').addEventListener('click', function () {
  const data = { entries: getEntries(), settings: getSettings(), exported: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `expenses-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Export downloaded ✓');
});

// Import JSON
document.getElementById('import-json-btn').addEventListener('click', function () {
  document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', function (e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (evt) {
    try {
      const data = JSON.parse(evt.target.result);
      if (data.entries) {
        const existing = getEntries();
        const merged = [...data.entries, ...existing];
        // Deduplicate by id
        const seen = new Set();
        const deduped = merged.filter(e => {
          if (seen.has(e.id)) return false;
          seen.add(e.id);
          return true;
        });
        saveEntries(deduped);
        showToast(`Imported ${data.entries.length} entries ✓`);
        renderHome();
      }
    } catch {
      showToast('Import failed — invalid file');
    }
  };
  reader.readAsText(file);
  this.value = '';
});

// Clear data
document.getElementById('clear-data-btn').addEventListener('click', function () {
  if (confirm('Delete ALL transactions? This cannot be undone.')) {
    localStorage.removeItem('expense_entries');
    localStorage.removeItem('learned_categories');
    closeSettings();
    showToast('All data cleared');
    renderHome();
  }
});

// Export button in history
document.getElementById('export-btn').addEventListener('click', function () {
  document.getElementById('export-json-btn').click();
});

// Ask Claude button
document.getElementById('ask-claude-btn').addEventListener('click', function () {
  askClaude(document.getElementById('claude-question').value.trim());
});

// Settings button in home header
document.getElementById('home-settings-btn').addEventListener('click', openSettings);

// History filters
['filter-month', 'filter-category', 'filter-bank'].forEach(id => {
  document.getElementById(id).addEventListener('change', applyFilters);
});
document.getElementById('search-input').addEventListener('input', applyFilters);

// Insights month filter
document.getElementById('insights-month').addEventListener('change', function () {
  renderInsightsForMonth(getEntries(), this.value);
});

// ═══════════════════════════════════════════════════
// URL PARAM HANDLER (for Apple Shortcuts)
// When shortcut opens app with ?sms=... in URL
// ═══════════════════════════════════════════════════

function handleURLParams() {
  const params = new URLSearchParams(window.location.search);
  const sms = params.get('sms');
  const screen = params.get('screen');

  if (sms) {
    // Navigate to add screen and pre-fill SMS
    navigate('add');
    document.getElementById('sms-input').value = decodeURIComponent(sms);
    // Auto-parse after a short delay
    setTimeout(() => document.getElementById('parse-sms-btn').click(), 300);
    // Clean URL so it doesn't re-trigger on refresh
    window.history.replaceState({}, '', window.location.pathname);
  } else if (screen) {
    navigate(screen);
    window.history.replaceState({}, '', window.location.pathname);
  }
}

// ═══════════════════════════════════════════════════
// FILTER HELPERS
// ═══════════════════════════════════════════════════

function populateMonthFilter(selectId, entries) {
  const select = document.getElementById(selectId);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Get all months from entries + current month
  const months = new Set([currentMonth]);
  entries.forEach(e => { if (e.month) months.add(e.month); });
  const sorted = Array.from(months).sort().reverse();

  const prevValue = select.value;
  select.innerHTML = sorted.map(m => `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${formatMonthLabel(m)}</option>`).join('');
  if (prevValue && months.has(prevValue)) select.value = prevValue;
}

function populateBankFilter(entries) {
  const select = document.getElementById('filter-bank');
  const banks = new Set(entries.map(e => e.bank).filter(Boolean));
  const existing = select.innerHTML.split('<option value="">')[0] || '<option value="">All Banks</option>';
  select.innerHTML = '<option value="">All Banks</option>' +
    Array.from(banks).sort().map(b => `<option value="${b}">${b}</option>`).join('');
}

// ═══════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

// ═══════════════════════════════════════════════════
// FORMAT HELPERS
// ═══════════════════════════════════════════════════

function formatAmount(n) {
  if (n >= 100000) return (n / 100000).toFixed(1).replace(/\.0$/, '') + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function formatMonthLabel(month) {
  const [y, m] = month.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(m) - 1]} ${y}`;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ═══════════════════════════════════════════════════
// SERVICE WORKER REGISTRATION
// ═══════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ═══════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function () {
  handleURLParams();
  renderHome();
});
