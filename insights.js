// insights.js — Trend engine, nudge generator, optimization tips
// Runs every time home screen loads — compares current vs previous month

// ═══════════════════════════════════════════════════
// NUDGE GENERATOR
// ═══════════════════════════════════════════════════

function generateNudges(entries, currentMonth) {
  const nudges = [];

  const prevMonth = getPrevMonth(currentMonth);
  const curr = getMonthEntries(entries, currentMonth);
  const prev = getMonthEntries(entries, prevMonth);

  const currExpenses = curr.filter(e => e.type === 'debit');
  const currIncome = curr.filter(e => e.type === 'credit');
  const prevExpenses = prev.filter(e => e.type === 'debit');

  const currTotal = sum(currExpenses);
  const prevTotal = sum(prevExpenses);
  const currIncomeTotal = sum(currIncome);
  const currency = getCurrency();
  const settings = getSettings();

  // 1. Spending > income this month
  if (currIncomeTotal > 0 && currTotal > currIncomeTotal) {
    const over = currTotal - currIncomeTotal;
    nudges.push({
      type: 'danger',
      emoji: '🚨',
      text: `You're spending <strong>${currency}${formatAmount(over)} more than you earn</strong> this month. Time to cut back.`
    });
  }

  // 2. Budget exceeded
  if (settings.budget && currTotal > settings.budget) {
    const over = currTotal - settings.budget;
    nudges.push({
      type: 'danger',
      emoji: '💸',
      text: `Monthly budget exceeded by <strong>${currency}${formatAmount(over)}</strong>. You set a limit of ${currency}${formatAmount(settings.budget)}.`
    });
  }

  // 3. Budget warning at 80%
  if (settings.budget && currTotal > settings.budget * 0.8 && currTotal <= settings.budget) {
    const remaining = settings.budget - currTotal;
    nudges.push({
      type: 'warning',
      emoji: '⚠️',
      text: `You've used <strong>${Math.round((currTotal / settings.budget) * 100)}% of your budget</strong>. Only ${currency}${formatAmount(remaining)} left this month.`
    });
  }

  // 4. Month-over-month total change (only if prev month has data)
  if (prevTotal > 0 && currTotal > 0) {
    const change = ((currTotal - prevTotal) / prevTotal) * 100;
    if (change > 20) {
      nudges.push({
        type: 'warning',
        emoji: '📈',
        text: `Total spending is up <strong>${Math.round(change)}%</strong> vs last month (${currency}${formatAmount(currTotal)} vs ${currency}${formatAmount(prevTotal)}).`
      });
    } else if (change < -15) {
      nudges.push({
        type: 'good',
        emoji: '🎉',
        text: `Great job! You spent <strong>${Math.round(Math.abs(change))}% less</strong> this month than last (saved ${currency}${formatAmount(prevTotal - currTotal)}).`
      });
    }
  }

  // 5. Category-level spikes
  const currCats = getCategoryTotals(currExpenses);
  const prevCats = getCategoryTotals(prevExpenses);

  for (const [cat, currAmt] of Object.entries(currCats)) {
    const prevAmt = prevCats[cat] || 0;
    if (prevAmt > 0) {
      const change = ((currAmt - prevAmt) / prevAmt) * 100;
      if (change > 40 && currAmt > 500) {
        nudges.push({
          type: 'warning',
          emoji: getCategoryEmoji(cat),
          text: `<strong>${cat}</strong> spend is up <strong>${Math.round(change)}%</strong> this month — ${currency}${formatAmount(currAmt)} vs ${currency}${formatAmount(prevAmt)} last month.`
        });
      } else if (change < -30 && prevAmt > 500) {
        nudges.push({
          type: 'good',
          emoji: getCategoryEmoji(cat),
          text: `<strong>${cat}</strong> spend is down <strong>${Math.round(Math.abs(change))}%</strong> — nice! You saved ${currency}${formatAmount(prevAmt - currAmt)}.`
        });
      }
    }
  }

  // 6. Large single transaction (> 2x category average or > 5000)
  const allExpenses = entries.filter(e => e.type === 'debit');
  for (const entry of currExpenses) {
    const catAvg = getCategoryAverage(allExpenses, entry.category);
    if (catAvg > 0 && entry.amount > catAvg * 2.5 && entry.amount > 1000) {
      nudges.push({
        type: 'info',
        emoji: '🔍',
        text: `Unusually large ${entry.category} expense: <strong>${entry.merchant}</strong> for ${currency}${formatAmount(entry.amount)} (your avg is ${currency}${formatAmount(catAvg)}).`
      });
      break; // only show one of these
    }
  }

  // 7. Possible duplicate transaction
  const duplicates = findDuplicates(currExpenses);
  if (duplicates.length > 0) {
    const d = duplicates[0];
    nudges.push({
      type: 'warning',
      emoji: '🔁',
      text: `Possible duplicate: <strong>${d.merchant}</strong> charged ${currency}${formatAmount(d.amount)} twice within 24 hours.`
    });
  }

  // 8. High food delivery spend
  const foodDelivery = currExpenses
    .filter(e => e.category === 'Food')
    .reduce((s, e) => s + e.amount, 0);
  const groceries = currExpenses
    .filter(e => e.category === 'Groceries')
    .reduce((s, e) => s + e.amount, 0);

  if (foodDelivery > 3000 && foodDelivery > groceries * 2) {
    nudges.push({
      type: 'info',
      emoji: '🍔',
      text: `Food delivery (${currency}${formatAmount(foodDelivery)}) is <strong>${Math.round(foodDelivery / Math.max(groceries, 1))}x your grocery spend</strong>. Cooking more could save significantly.`
    });
  }

  // 9. Subscription total
  const subs = currExpenses.filter(e => e.category === 'Entertainment').reduce((s, e) => s + e.amount, 0);
  if (subs > 1000) {
    nudges.push({
      type: 'info',
      emoji: '📺',
      text: `You're spending <strong>${currency}${formatAmount(subs)}</strong> on subscriptions this month. Worth checking if all are in use.`
    });
  }

  // 10. Positive: savings rate
  if (currIncomeTotal > 0 && currTotal < currIncomeTotal) {
    const savingsRate = Math.round(((currIncomeTotal - currTotal) / currIncomeTotal) * 100);
    if (savingsRate >= 20) {
      nudges.push({
        type: 'good',
        emoji: '💪',
        text: `You're saving <strong>${savingsRate}%</strong> of your income this month — ${currency}${formatAmount(currIncomeTotal - currTotal)} saved so far.`
      });
    }
  }

  // Limit to 5 most important nudges
  return nudges.slice(0, 5);
}

// ═══════════════════════════════════════════════════
// OPTIMIZATION TIPS
// ═══════════════════════════════════════════════════

function generateOptimizationTips(entries, currentMonth, currency) {
  const tips = [];
  const monthEntries = getMonthEntries(entries, currentMonth);
  const expenses = monthEntries.filter(e => e.type === 'debit');
  const allExpenses = entries.filter(e => e.type === 'debit');

  const catTotals = getCategoryTotals(expenses);

  // Tip 1: Food delivery vs groceries ratio
  const food = catTotals['Food'] || 0;
  const groceries = catTotals['Groceries'] || 0;
  if (food > 2000) {
    const potentialSave = Math.round(food * 0.4);
    tips.push({
      emoji: '🍔',
      title: 'Cut food delivery costs',
      body: `You spent ${currency}${formatAmount(food)} on food delivery this month. Cooking just 3-4 meals a week at home could cut this significantly.`,
      saving: `${currency}${formatAmount(potentialSave)}/month`
    });
  }

  // Tip 2: Transport — Uber/Ola vs metro
  const transport = catTotals['Transport'] || 0;
  if (transport > 2000) {
    const potentialSave = Math.round(transport * 0.35);
    tips.push({
      emoji: '🚇',
      title: 'Switch some cab rides to metro',
      body: `${currency}${formatAmount(transport)} on transport this month. Using metro for regular commutes and cabs only for long/late trips could save 30-40%.`,
      saving: `${currency}${formatAmount(potentialSave)}/month`
    });
  }

  // Tip 3: Entertainment / subscriptions
  const entertainment = catTotals['Entertainment'] || 0;
  if (entertainment > 800) {
    tips.push({
      emoji: '📺',
      title: 'Audit your subscriptions',
      body: `${currency}${formatAmount(entertainment)} on subscriptions. Check: are you using all of them? Consider sharing family plans or rotating instead of stacking.`,
      saving: null
    });
  }

  // Tip 4: Shopping spike
  const shopping = catTotals['Shopping'] || 0;
  const prevMonth = getPrevMonth(currentMonth);
  const prevShopping = getCategoryTotals(getMonthEntries(entries, prevMonth).filter(e => e.type === 'debit'))['Shopping'] || 0;
  if (shopping > 3000 && shopping > prevShopping * 1.5) {
    tips.push({
      emoji: '🛍️',
      title: 'Shopping spend jumped this month',
      body: `${currency}${formatAmount(shopping)} on shopping vs ${currency}${formatAmount(prevShopping)} last month. Consider a 24-hour rule: wait a day before buying non-essentials.`,
      saving: null
    });
  }

  // Tip 5: Weekend spending pattern
  const weekendExpenses = expenses.filter(e => {
    const day = new Date(e.date + 'T00:00:00').getDay();
    return day === 0 || day === 6;
  });
  const weekdayExpenses = expenses.filter(e => {
    const day = new Date(e.date + 'T00:00:00').getDay();
    return day >= 1 && day <= 5;
  });
  const weekendTotal = sum(weekendExpenses);
  const weekdayTotal = sum(weekdayExpenses);
  if (weekendTotal > weekdayTotal * 0.8 && weekendTotal > 2000) {
    tips.push({
      emoji: '📅',
      title: 'Weekend spending is high',
      body: `You spent ${currency}${formatAmount(weekendTotal)} on weekends vs ${currency}${formatAmount(weekdayTotal)} on weekdays. Planning weekend activities in advance can help control impulse spending.`,
      saving: null
    });
  }

  // Tip 6: Health spending reminder (positive)
  const health = catTotals['Health'] || 0;
  if (health === 0 && expenses.length > 5) {
    tips.push({
      emoji: '💊',
      title: 'No health spending tracked',
      body: 'Consider budgeting for health checkups, gym, or wellness — preventive health spending pays off long-term.',
      saving: null
    });
  }

  // Tip 7: Investment reminder
  const investment = catTotals['Investment'] || 0;
  const income = sum(monthEntries.filter(e => e.type === 'credit'));
  if (income > 0 && investment === 0) {
    const suggested = Math.round(income * 0.2);
    tips.push({
      emoji: '📈',
      title: 'No investments tracked this month',
      body: `You earned ${currency}${formatAmount(income)} this month but no investments are recorded. Even a small SIP helps build wealth.`,
      saving: `Target: ${currency}${formatAmount(suggested)} (20% of income)`
    });
  }

  return tips.slice(0, 5);
}

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

function getMonthEntries(entries, month) {
  return entries.filter(e => e.month === month);
}

function getCategoryTotals(expenses) {
  const totals = {};
  for (const e of expenses) {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  }
  return totals;
}

function getCategoryAverage(expenses, category) {
  const catEntries = expenses.filter(e => e.category === category);
  if (catEntries.length === 0) return 0;
  return sum(catEntries) / catEntries.length;
}

function sum(entries) {
  return entries.reduce((s, e) => s + (e.amount || 0), 0);
}

function getPrevMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function findDuplicates(expenses) {
  const duplicates = [];
  for (let i = 0; i < expenses.length; i++) {
    for (let j = i + 1; j < expenses.length; j++) {
      const a = expenses[i];
      const b = expenses[j];
      if (a.amount === b.amount && a.merchant === b.merchant) {
        const diff = Math.abs(new Date(a.date) - new Date(b.date));
        if (diff < 86400000) { // within 24 hours
          duplicates.push(a);
          break;
        }
      }
    }
  }
  return duplicates;
}
