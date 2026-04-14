// SMS Parser — extracts transaction data from Indian bank SMS messages
// Supports: HDFC, SBI, ICICI, Axis, Kotak, IDFC, Yes Bank, PNB, UPI apps

// Returns: { amount, type ('debit'|'credit'), merchant, bank, account_last4, date, raw }
// Returns null if SMS doesn't look like a transaction

function parseBankSMS(smsText) {
  if (!smsText || smsText.trim().length < 10) return null;

  const text = smsText.trim();
  const lower = text.toLowerCase();

  // Skip non-transaction SMS (OTP, balance enquiry, etc.)
  const skipPatterns = ['otp', 'one time password', 'login', 'password', 'pin', 'your otp', 'verification code'];
  for (const skip of skipPatterns) {
    if (lower.includes(skip)) return null;
  }

  let result = null;

  // Try each bank parser
  result = parseHDFC(text) ||
           parseSBI(text) ||
           parseICICI(text) ||
           parseAxis(text) ||
           parseKotak(text) ||
           parseIDFC(text) ||
           parseYesBank(text) ||
           parsePNB(text) ||
           parseUPI(text) ||
           parseGeneric(text);

  if (!result) return null;

  // Clean up merchant name
  if (result.merchant) {
    result.merchant = cleanMerchant(result.merchant);
  }

  // Parse / normalize date
  if (result.dateRaw) {
    result.date = parseDate(result.dateRaw);
  }
  if (!result.date) {
    result.date = new Date().toISOString().split('T')[0];
  }

  result.raw = text;
  return result;
}

// ── HDFC Bank ──
function parseHDFC(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('hdfc')) return null;

  // Format 1: "INR 850.00 debited from A/c XX1234 on 13-04-26 at Zomato"
  // Format 2: "Rs.850 credited to HDFC Bank A/c XX1234 on 13-04-26"
  // Format 3 (new): "Sent Rs.60.00\nFrom HDFC Bank A/C *9366\nTo T NANDESH\nOn 14/04/26"
  // Format 4 (new): "Credit Alert!\nRs.1.00 credited to HDFC Bank A/c XX9366 on 14-04-26 from VPA 8141747801@upi"

  const amountMatch = text.match(/(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = parseAmount(amountMatch[1]);

  // "Sent" = debit (money left your account), "Credit Alert" = credit
  const isDebit  = /\b(debit|debited|dr\b|sent)\b/i.test(text);
  const isCredit = /\b(credit|credited|cr\b|credit alert)\b/i.test(text);
  const type = isDebit ? 'debit' : isCredit ? 'credit' : null;
  if (!type) return null;

  // Handle both A/c XX1234 and A/C *9366 formats
  const accountMatch = text.match(/[Aa]\/[Cc]\s*[X*]{1,}(\d{3,4})|[Aa]cct?\s*[X*]{1,}(\d{3,4})/);
  const account_last4 = accountMatch ? (accountMatch[1] || accountMatch[2]) : null;

  const dateMatch = text.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}[-\s][A-Za-z]{3}[-\s]\d{2,4})/);

  // For "Sent" format, merchant is the recipient after "To "
  let merchant = '';
  const toMatch = text.match(/^To\s+(.+)$/im);
  if (toMatch) {
    merchant = toMatch[1].trim();
  } else {
    // For UPI credit, extract VPA/merchant
    const vpaMatch = text.match(/from\s+VPA\s+([^\s(]+)/i);
    if (vpaMatch) merchant = vpaMatch[1].trim();
    else merchant = extractMerchant(text);
  }

  return { amount, type, merchant, bank: 'HDFC', account_last4, dateRaw: dateMatch?.[1] };
}

// ── SBI ──
function parseSBI(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('sbi') && !lower.includes('state bank')) return null;

  // "Your A/c no. XXXXXXXX1234 is debited by Rs. 850.00 on date 13Apr26"
  // "INB: Txn of Rs.850.00 done on A/c XX1234. Info: UPI/ZOMATO"

  const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  const type = /debit|dr\b|is debited/i.test(text) ? 'debit' : /credit|cr\b|is credited/i.test(text) ? 'credit' : null;
  if (!type) return null;

  const accountMatch = text.match(/[Aa]\/[Cc]\s*(?:no\.?\s*)?[X*]{2,}(\d{3,4})|[Aa]cct?\s*[X*]{2,}(\d{3,4})/);
  const account_last4 = accountMatch ? (accountMatch[1] || accountMatch[2]) : null;

  const dateMatch = text.match(/(\d{1,2}[A-Za-z]{3}\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
  let merchant = extractMerchant(text);

  return { amount, type, merchant, bank: 'SBI', account_last4, dateRaw: dateMatch?.[1] };
}

// ── ICICI Bank ──
function parseICICI(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('icici')) return null;

  // "ICICI Bank Acct XX1234 debited for Rs 850.00 on 13-Apr-26; Zomato credited"
  // "ICICI Bank: Rs 850.00 debited from account XX1234 on 13/04/26"

  const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  const type = /debit|dr\b/i.test(text) ? 'debit' : /credit|cr\b/i.test(text) ? 'credit' : null;
  if (!type) return null;

  const accountMatch = text.match(/[Aa]cct?\s*[X*]{0,6}(\d{3,4})|[Aa]\/[Cc]\s*[X*]{0,6}(\d{3,4})/);
  const account_last4 = accountMatch ? (accountMatch[1] || accountMatch[2]) : null;

  const dateMatch = text.match(/(\d{1,2}[-\/][A-Za-z]{3}[-\/]\d{2,4}|\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
  let merchant = extractMerchant(text);

  return { amount, type, merchant, bank: 'ICICI', account_last4, dateRaw: dateMatch?.[1] };
}

// ── Axis Bank ──
function parseAxis(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('axis')) return null;

  const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  const type = /debit|dr\b/i.test(text) ? 'debit' : /credit|cr\b/i.test(text) ? 'credit' : null;
  if (!type) return null;

  const accountMatch = text.match(/[Aa]\/[Cc]\s*[X*]{0,6}(\d{3,4})|[Aa]cct?\s*[X*]{0,6}(\d{3,4})/);
  const account_last4 = accountMatch ? (accountMatch[1] || accountMatch[2]) : null;

  const dateMatch = text.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
  let merchant = extractMerchant(text);

  return { amount, type, merchant, bank: 'Axis', account_last4, dateRaw: dateMatch?.[1] };
}

// ── Kotak Bank ──
function parseKotak(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('kotak')) return null;

  const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  const type = /debit|dr\b/i.test(text) ? 'debit' : /credit|cr\b/i.test(text) ? 'credit' : null;
  if (!type) return null;

  const accountMatch = text.match(/[Aa]\/[Cc]\s*[X*]{0,6}(\d{3,4})|[Aa]cct?\s*[X*]{0,6}(\d{3,4})/);
  const account_last4 = accountMatch ? (accountMatch[1] || accountMatch[2]) : null;

  const dateMatch = text.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
  let merchant = extractMerchant(text);

  return { amount, type, merchant, bank: 'Kotak', account_last4, dateRaw: dateMatch?.[1] };
}

// ── IDFC First Bank ──
function parseIDFC(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('idfc')) return null;

  const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  const type = /debit|dr\b/i.test(text) ? 'debit' : /credit|cr\b/i.test(text) ? 'credit' : null;
  if (!type) return null;

  const accountMatch = text.match(/[Aa]\/[Cc]\s*[X*]{0,6}(\d{3,4})/);
  const account_last4 = accountMatch?.[1] || null;

  const dateMatch = text.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
  let merchant = extractMerchant(text);

  return { amount, type, merchant, bank: 'IDFC', account_last4, dateRaw: dateMatch?.[1] };
}

// ── Yes Bank ──
function parseYesBank(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('yes bank') && !lower.includes('yesbank')) return null;

  const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  const type = /debit|dr\b/i.test(text) ? 'debit' : /credit|cr\b/i.test(text) ? 'credit' : null;
  if (!type) return null;

  const accountMatch = text.match(/[Aa]\/[Cc]\s*[X*]{0,6}(\d{3,4})/);
  const account_last4 = accountMatch?.[1] || null;

  const dateMatch = text.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
  let merchant = extractMerchant(text);

  return { amount, type, merchant, bank: 'Yes', account_last4, dateRaw: dateMatch?.[1] };
}

// ── PNB ──
function parsePNB(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('pnb') && !lower.includes('punjab national')) return null;

  const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  const type = /debit|dr\b/i.test(text) ? 'debit' : /credit|cr\b/i.test(text) ? 'credit' : null;
  if (!type) return null;

  const accountMatch = text.match(/[Aa]\/[Cc]\s*[X*]{0,6}(\d{3,4})/);
  const account_last4 = accountMatch?.[1] || null;

  const dateMatch = text.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
  let merchant = extractMerchant(text);

  return { amount, type, merchant, bank: 'PNB', account_last4, dateRaw: dateMatch?.[1] };
}

// ── UPI Generic (GPay, PhonePe, Paytm style) ──
function parseUPI(text) {
  const lower = text.toLowerCase();
  if (!lower.includes('upi')) return null;

  const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  const type = /debit|sent|paid|dr\b/i.test(text) ? 'debit' : /credit|received|cr\b/i.test(text) ? 'credit' : null;
  if (!type) return null;

  // Try to detect bank from sender context
  let bank = 'UPI';
  if (lower.includes('gpay') || lower.includes('google pay')) bank = 'GPay';
  else if (lower.includes('phonepe')) bank = 'PhonePe';
  else if (lower.includes('paytm')) bank = 'Paytm';

  const accountMatch = text.match(/[Aa]\/[Cc]\s*[X*]{0,6}(\d{3,4})/);
  const account_last4 = accountMatch?.[1] || null;

  const dateMatch = text.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
  let merchant = extractMerchant(text);

  return { amount, type, merchant, bank, account_last4, dateRaw: dateMatch?.[1] };
}

// ── Generic fallback ──
function parseGeneric(text) {
  const amountMatch = text.match(/(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!amountMatch) return null;

  const amount = parseAmount(amountMatch[1]);
  if (amount <= 0) return null;

  const type = /debit|dr\b|debited|spent|paid/i.test(text) ? 'debit'
             : /credit|cr\b|credited|received/i.test(text) ? 'credit'
             : null;
  if (!type) return null;

  const dateMatch = text.match(/(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/);
  let merchant = extractMerchant(text);

  return { amount, type, merchant, bank: 'Other', account_last4: null, dateRaw: dateMatch?.[1] };
}

// ── Helpers ──

function extractMerchant(text) {
  // UPI pattern: "UPI/ZOMATO/REF" or "UPI-Zomato" or "upi@zomato"
  const upiRef = text.match(/UPI[\/\-@\s]+([A-Za-z0-9\s]+?)(?:\/|\s+[A-Z]{2,}|\s+Ref|\s+on\s|\s+for\s|$)/i);
  if (upiRef) {
    const name = upiRef[1].trim();
    if (name.length > 1 && !name.match(/^\d+$/)) return name;
  }

  // "at Merchant" pattern
  const atPattern = text.match(/\bat\s+([A-Za-z0-9\s\.]+?)(?:\s+on\s|\s+Avl|\s+Bal|\.|\,|$)/i);
  if (atPattern) return atPattern[1].trim();

  // "Info: Merchant" or "Ref: Merchant"
  const infoPattern = text.match(/(?:Info|Ref|Towards|For|To|trf to|Trf To)\s*[:\-\/]?\s*([A-Za-z0-9\s]+?)(?:\/|\s+Ref|\s+on\s|\.|$)/i);
  if (infoPattern) {
    const name = infoPattern[1].trim();
    if (name.length > 1 && !name.match(/^[\d\s]+$/)) return name;
  }

  // "Merchant credited" (ICICI style)
  const creditedPattern = text.match(/([A-Za-z0-9\s]+?)\s+credited/i);
  if (creditedPattern) return creditedPattern[1].trim();

  return '';
}

function cleanMerchant(merchant) {
  return merchant
    .replace(/\s+/g, ' ')
    .replace(/[^A-Za-z0-9\s\.\-]/g, '')
    .trim()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
    .substring(0, 50);
}

function parseAmount(str) {
  return parseFloat(str.replace(/,/g, '')) || 0;
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    // Format: 13-04-26 or 13/04/26
    let match = dateStr.match(/(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/);
    if (match) {
      let [, d, m, y] = match;
      if (y.length === 2) y = '20' + y;
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    // Format: 13Apr26 or 13-Apr-26
    match = dateStr.match(/(\d{1,2})[-\s]?([A-Za-z]{3})[-\s]?(\d{2,4})/);
    if (match) {
      const months = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
      let [, d, mon, y] = match;
      if (y.length === 2) y = '20' + y;
      const m = months[mon.toLowerCase()] || '01';
      return `${y}-${m}-${d.padStart(2,'0')}`;
    }
  } catch {}
  return null;
}
