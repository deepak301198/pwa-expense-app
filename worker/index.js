// Cloudflare Worker — Expense Tracker Backend
// Receives SMS data from Apple Shortcuts silently in the background
// Stores transactions in Cloudflare KV (key-value database)
// Serves data to the PWA when opened

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Allow the PWA (any origin) to call this API
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Auth — API key passed as ?key=YOUR_SECRET in the URL
    // This way Apple Shortcuts just needs a URL, no headers to configure
    const key = url.searchParams.get('key');
    if (!key || key !== env.API_KEY) {
      return respond({ error: 'Unauthorized — wrong or missing API key' }, 401, cors);
    }

    // ── Routes ──

    // Apple Shortcut calls this with the raw SMS text
    // POST /sms?key=SECRET  body: { "sms": "INR 850 debited from..." }
    if (path === '/sms' && request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { body = {}; }

      const smsText = (body.sms || body.text || '').trim();
      if (!smsText) return respond({ error: 'No SMS text' }, 400, cors);

      const parsed = parseSMS(smsText);
      if (!parsed) return respond({ error: 'SMS not recognised as a transaction' }, 422, cors);

      const cat = categorize(parsed.merchant || '');
      const entry = {
        id: Date.now() + Math.random(),
        amount: parsed.amount,
        type: parsed.type,
        merchant: parsed.merchant || '',
        category: cat.category,
        bank: parsed.bank || '',
        account_last4: parsed.account_last4 || null,
        date: parsed.date || todayStr(),
        month: (parsed.date || todayStr()).substring(0, 7),
        note: '',
        source: 'shortcut',
        raw: smsText,
        createdAt: new Date().toISOString(),
      };

      await saveEntry(env, entry);
      return respond({ ok: true, entry }, 200, cors);
    }

    // PWA fetches all entries on load
    // GET /entries?key=SECRET
    if (path === '/entries' && request.method === 'GET') {
      const entries = await loadEntries(env);
      return respond({ entries }, 200, cors);
    }

    // PWA saves a manually entered transaction
    // POST /entries?key=SECRET  body: entry object
    if (path === '/entries' && request.method === 'POST') {
      let entry;
      try { entry = await request.json(); } catch {
        return respond({ error: 'Invalid JSON' }, 400, cors);
      }
      if (!entry.id) entry.id = Date.now() + Math.random();
      if (!entry.month && entry.date) entry.month = entry.date.substring(0, 7);
      entry.source = entry.source || 'manual';
      await saveEntry(env, entry);
      return respond({ ok: true, entry }, 200, cors);
    }

    // PWA deletes an entry
    // DELETE /entries/:id?key=SECRET
    if (path.startsWith('/entries/') && request.method === 'DELETE') {
      const id = decodeURIComponent(path.replace('/entries/', ''));
      await deleteEntry(env, id);
      return respond({ ok: true }, 200, cors);
    }

    // Health check
    if (path === '/ping') {
      return respond({ ok: true, message: 'Expense tracker worker is running' }, 200, cors);
    }

    return respond({ error: 'Not found' }, 404, cors);
  }
};

// ═══════════════════════════════════════════════════
// KV STORAGE
// All entries stored as one JSON array under key "entries"
// ═══════════════════════════════════════════════════

async function loadEntries(env) {
  const raw = await env.EXPENSES_KV.get('entries');
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

async function saveEntry(env, newEntry) {
  const entries = await loadEntries(env);
  // Deduplicate by id
  const filtered = entries.filter(e => String(e.id) !== String(newEntry.id));
  filtered.unshift(newEntry); // newest first
  await env.EXPENSES_KV.put('entries', JSON.stringify(filtered));
}

async function deleteEntry(env, id) {
  const entries = await loadEntries(env);
  const filtered = entries.filter(e => String(e.id) !== String(id));
  await env.EXPENSES_KV.put('entries', JSON.stringify(filtered));
}

// ═══════════════════════════════════════════════════
// SMS PARSER (inline — no imports in Workers)
// ═══════════════════════════════════════════════════

function parseSMS(text) {
  if (!text || text.length < 10) return null;
  const lower = text.toLowerCase();

  // Skip OTP / login messages
  if (/\botp\b|one.?time.?pass|your otp|verification code/i.test(text)) return null;

  const amountMatch = text.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;
  const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  if (!amount || amount <= 0) return null;

  const isDebit = /\b(debit|debited|dr\b|spent|paid|sent|withdrawn)\b/i.test(text);
  const isCredit = /\b(credit|credited|cr\b|received|deposited)\b/i.test(text);
  if (!isDebit && !isCredit) return null;
  const type = isDebit ? 'debit' : 'credit';

  // Detect bank
  let bank = 'Other';
  if (/hdfc/i.test(text)) bank = 'HDFC';
  else if (/\bsbi\b|state bank/i.test(text)) bank = 'SBI';
  else if (/icici/i.test(text)) bank = 'ICICI';
  else if (/\baxis\b/i.test(text)) bank = 'Axis';
  else if (/kotak/i.test(text)) bank = 'Kotak';
  else if (/idfc/i.test(text)) bank = 'IDFC';
  else if (/yes.?bank|yesbank/i.test(text)) bank = 'Yes';
  else if (/\bpnb\b|punjab national/i.test(text)) bank = 'PNB';
  else if (/paytm/i.test(text)) bank = 'Paytm';

  // Account last 4 digits
  const accMatch = text.match(/[Aa]\/[Cc]\s*[X*]{0,6}(\d{3,4})|[Aa]cct?\s*[X*]{0,6}(\d{3,4})/);
  const account_last4 = accMatch ? (accMatch[1] || accMatch[2]) : null;

  // Date
  let date = null;
  const d1 = text.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
  if (d1) {
    let [, dd, mm, yy] = d1;
    if (yy.length === 2) yy = '20' + yy;
    date = `${yy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
  } else {
    const d2 = text.match(/(\d{1,2})[-\s]?([A-Za-z]{3})[-\s]?(\d{2,4})/);
    if (d2) {
      const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
      let [, dd, mon, yy] = d2;
      if (yy.length === 2) yy = '20' + yy;
      date = `${yy}-${months[mon.toLowerCase()]||'01'}-${dd.padStart(2,'0')}`;
    }
  }
  if (!date) date = todayStr();

  // Merchant extraction
  let merchant = '';

  // HDFC "Sent" format: "To T NANDESH" on its own line
  const toMatch = text.match(/^To\s+(.+)$/im);
  if (toMatch) merchant = toMatch[1].trim();

  // UPI credit: "from VPA 8141747801@upi"
  if (!merchant) {
    const vpaMatch = text.match(/from\s+VPA\s+([^\s(]+)/i);
    if (vpaMatch) merchant = vpaMatch[1].trim();
  }

  const upiRef = text.match(/UPI[\/\-@\s]+([A-Za-z0-9\s]+?)(?:\/|\s+[A-Z]{2,}|\s+[Rr]ef|\s+[Oo]n\s|$)/);
  if (!merchant && upiRef) merchant = upiRef[1].trim();

  if (!merchant) {
    const atPat = text.match(/\bat\s+([A-Za-z0-9\s\.]+?)(?:\s+on\s|\s+Avl|\s+Bal|[\.,]|$)/i);
    if (atPat) merchant = atPat[1].trim();
  }
  if (!merchant) {
    const infoPat = text.match(/(?:Info|Towards|For|To|trf to)\s*[:\-\/]?\s*([A-Za-z0-9\s]+?)(?:\/|\s+[Rr]ef|\s+on\s|$)/i);
    if (infoPat) {
      const m = infoPat[1].trim();
      if (!/^\d+$/.test(m)) merchant = m;
    }
  }

  // Clean merchant name
  merchant = merchant.replace(/\s+/g, ' ').trim()
    .split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    .substring(0, 50);

  return { amount, type, merchant, bank, account_last4, date };
}

// ═══════════════════════════════════════════════════
// CATEGORIZER (inline)
// ═══════════════════════════════════════════════════

const RULES = [
  { category: 'Food',          keywords: ['zomato','swiggy','dominos','pizza','burger','kfc','mcdonalds','subway','cafe','coffee','starbucks','ccd','faasos','box8','freshmenu','restaurant','dhaba','canteen','food','eat'] },
  { category: 'Groceries',     keywords: ['bigbasket','blinkit','zepto','instamart','dmart','reliance fresh','grofers','grocery','supermarket','kirana','milk','dairy','amul'] },
  { category: 'Transport',     keywords: ['uber','ola','rapido','metro','bus','train','irctc','petrol','fuel','bpcl','iocl','hpcl','parking','toll','fastag'] },
  { category: 'Shopping',      keywords: ['amazon','flipkart','myntra','ajio','meesho','nykaa','snapdeal','shopping','mall'] },
  { category: 'Housing',       keywords: ['rent','society','maintenance','housing','electricity','water bill','gas','lpg','broadband','wifi','jio fiber','airtel fiber'] },
  { category: 'Entertainment', keywords: ['netflix','prime','hotstar','disney','zee5','spotify','bookmyshow','pvr','inox','movie','cinema','ott','subscription'] },
  { category: 'Health',        keywords: ['apollo','medplus','netmeds','1mg','pharmeasy','hospital','clinic','doctor','pharmacy','medicine','health','gym','cult'] },
  { category: 'Education',     keywords: ['udemy','coursera','byju','unacademy','college','school','fees','tuition','books','course'] },
  { category: 'Utilities',     keywords: ['bescom','msedcl','tata power','electricity bill','airtel','jio','vodafone','recharge','dth','tata sky','dish tv'] },
  { category: 'Investment',    keywords: ['zerodha','groww','upstox','mutual fund','sip','insurance','lic','invest'] },
  { category: 'Income',        keywords: ['salary','payroll','bonus','freelance','refund','cashback','interest','dividend','received','credit'] },
];

const EMOJIS = { Food:'🍔', Groceries:'🛒', Transport:'🚗', Shopping:'🛍️', Housing:'🏠', Entertainment:'🎬', Health:'💊', Education:'📚', Utilities:'⚡', Investment:'📈', Income:'💰', Uncategorized:'❓' };

function categorize(description) {
  const text = (description || '').toLowerCase();
  for (const rule of RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) return { category: rule.category, emoji: EMOJIS[rule.category] };
    }
  }
  return { category: 'Uncategorized', emoji: '❓' };
}

// ── Utilities ──
function respond(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  });
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}
