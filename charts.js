// charts.js — Chart.js visualizations for the Insights screen
// Renders: monthly bar chart, category donut, daily trend line

let chartMonthly = null;
let chartCategory = null;
let chartTrend = null;

const CHART_COLORS = {
  primary:     '#6366f1',
  green:       '#22c55e',
  red:         '#ef4444',
  yellow:      '#f59e0b',
  blue:        '#3b82f6',
  purple:      '#a855f7',
  orange:      '#f97316',
  pink:        '#ec4899',
  teal:        '#14b8a6',
  indigo:      '#818cf8',
  gridColor:   'rgba(51,65,85,0.5)',
  textColor:   '#94a3b8',
};

const CATEGORY_COLORS = {
  'Food':           '#f97316',
  'Groceries':      '#22c55e',
  'Transport':      '#3b82f6',
  'Shopping':       '#a855f7',
  'Housing':        '#f59e0b',
  'Entertainment':  '#ec4899',
  'Health':         '#14b8a6',
  'Education':      '#818cf8',
  'Utilities':      '#64748b',
  'Investment':     '#10b981',
  'Income':         '#22c55e',
  'Uncategorized':  '#475569',
};

Chart.defaults.color = CHART_COLORS.textColor;
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

function renderCharts(entries, selectedMonth) {
  renderMonthlyChart(entries);
  renderCategoryChart(entries, selectedMonth);
  renderTrendChart(entries, selectedMonth);
}

// ── Monthly Bar Chart: Income vs Expenses for last 6 months ──
function renderMonthlyChart(entries) {
  const months = getLast6Months();
  const currency = getCurrency();

  const incomeData = months.map(m =>
    entries.filter(e => e.month === m && e.type === 'credit').reduce((s, e) => s + e.amount, 0)
  );
  const expenseData = months.map(m =>
    entries.filter(e => e.month === m && e.type === 'debit').reduce((s, e) => s + e.amount, 0)
  );
  const labels = months.map(m => formatMonthLabel(m));

  const ctx = document.getElementById('chart-monthly').getContext('2d');
  if (chartMonthly) chartMonthly.destroy();

  chartMonthly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: 'rgba(34,197,94,0.7)',
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Expenses',
          data: expenseData,
          backgroundColor: 'rgba(239,68,68,0.7)',
          borderRadius: 6,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${currency}${formatAmount(ctx.raw)}`
          }
        }
      },
      scales: {
        x: { grid: { color: CHART_COLORS.gridColor }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: CHART_COLORS.gridColor },
          ticks: {
            font: { size: 11 },
            callback: v => currency + formatAmount(v)
          }
        }
      }
    }
  });
}

// ── Category Donut Chart ──
function renderCategoryChart(entries, selectedMonth) {
  const currency = getCurrency();
  const monthExpenses = entries.filter(e => e.month === selectedMonth && e.type === 'debit');

  const catTotals = {};
  for (const e of monthExpenses) {
    catTotals[e.category] = (catTotals[e.category] || 0) + e.amount;
  }

  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);

  // Group small categories into "Other" if more than 7 categories
  let labels = [], data = [], colors = [];
  if (sorted.length <= 7) {
    labels = sorted.map(([cat]) => cat);
    data = sorted.map(([, amt]) => amt);
    colors = sorted.map(([cat]) => CATEGORY_COLORS[cat] || '#64748b');
  } else {
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((s, [, amt]) => s + amt, 0);
    labels = [...top.map(([cat]) => cat), 'Other'];
    data = [...top.map(([, amt]) => amt), rest];
    colors = [...top.map(([cat]) => CATEGORY_COLORS[cat] || '#64748b'), '#64748b'];
  }

  const ctx = document.getElementById('chart-category').getContext('2d');
  if (chartCategory) chartCategory.destroy();

  if (data.length === 0) {
    chartCategory = null;
    return;
  }

  chartCategory = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#0f172a',
        borderWidth: 2,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 12, font: { size: 12 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = Math.round((ctx.raw / total) * 100);
              return ` ${currency}${formatAmount(ctx.raw)} (${pct}%)`;
            }
          }
        }
      }
    }
  });
}

// ── Daily Trend Line Chart ──
function renderTrendChart(entries, selectedMonth) {
  const currency = getCurrency();
  const monthExpenses = entries.filter(e => e.month === selectedMonth && e.type === 'debit');

  // Group by day
  const dayTotals = {};
  for (const e of monthExpenses) {
    const day = e.date;
    dayTotals[day] = (dayTotals[day] || 0) + e.amount;
  }

  // Build cumulative daily data for the month
  const [year, month] = selectedMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  const labels = [];
  const dailyData = [];
  const cumulativeData = [];
  let cumulative = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${selectedMonth}-${String(d).padStart(2, '0')}`;
    if (dateStr > today) break;
    labels.push(d);
    const dayAmt = dayTotals[dateStr] || 0;
    cumulative += dayAmt;
    dailyData.push(dayAmt);
    cumulativeData.push(cumulative);
  }

  const ctx = document.getElementById('chart-trend').getContext('2d');
  if (chartTrend) chartTrend.destroy();

  if (labels.length === 0) {
    chartTrend = null;
    return;
  }

  chartTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Cumulative',
          data: cumulativeData,
          borderColor: CHART_COLORS.primary,
          backgroundColor: 'rgba(99,102,241,0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
        },
        {
          label: 'Daily',
          data: dailyData,
          borderColor: CHART_COLORS.yellow,
          backgroundColor: 'transparent',
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 1.5,
          borderDash: [4, 4],
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 16 } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${currency}${formatAmount(ctx.raw)}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: CHART_COLORS.gridColor },
          ticks: { font: { size: 10 }, maxTicksLimit: 10 }
        },
        y: {
          grid: { color: CHART_COLORS.gridColor },
          ticks: {
            font: { size: 11 },
            callback: v => currency + formatAmount(v)
          }
        }
      }
    }
  });
}

// ── Helpers ──

function getLast6Months() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}
