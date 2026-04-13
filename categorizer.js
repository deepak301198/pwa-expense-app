// Categorizer — maps merchant names / descriptions to spending categories
// Uses keyword pattern matching. Learns from user corrections via localStorage.

const CATEGORY_RULES = [
  // ── Food & Dining ──
  { category: 'Food', emoji: '🍔', keywords: ['zomato','swiggy','dominos','dominoes','pizza','burger','kfc','mcdonalds','mcd','subway','barbeque','bbq','cafe','coffee','starbucks','ccd','dunkin','chaayos','faasos','box8','freshmenu','eatsure','rebel foods','biryani','restaurant','dhaba','hotel','canteen','mess','tiffin','snacks','eatery','diner','food','eat'] },

  // ── Groceries ──
  { category: 'Groceries', emoji: '🛒', keywords: ['bigbasket','blinkit','zepto','instamart','dmart','reliance fresh','nature basket','more supermarket','spencer','star bazaar','daily','grofer','grofers','grocery','vegetables','fruits','supermarket','kirana','provisions','milk','dairy','amul','mother dairy','mahanagar','haldiram','fmcg'] },

  // ── Transport ──
  { category: 'Transport', emoji: '🚗', keywords: ['uber','ola','rapido','auto','cab','taxi','metro','bmtc','best bus','bus','train','irctc','railway','petrol','fuel','pump','bpcl','iocl','hpcl','reliance petrol','shell','parking','toll','fastag','namma metro','delhi metro','mumbai metro','local train','rickshaw','bike','rapido','yulu','bounce'] },

  // ── Shopping ──
  { category: 'Shopping', emoji: '🛍️', keywords: ['amazon','flipkart','myntra','ajio','meesho','nykaa','tata cliq','shopify','snapdeal','paytm mall','indiamart','pepperfry','urban ladder','ikea','westside','lifestyle','shoppers stop','zara','h&m','uniqlo','max fashion','reliance trends','pantaloons','v mart','shopping','mall','store','purchase','order'] },

  // ── Housing ──
  { category: 'Housing', emoji: '🏠', keywords: ['rent','society','maintenance','housing','apartment','flat','pg','hostel','nobroker','magicbricks','99acres','electricity','water bill','gas','lpg','bharat gas','hp gas','indane','piped gas','mtnl','bsnl','broadband','wifi','internet','jio fiber','airtel fiber','act fibernet','hathway'] },

  // ── Entertainment ──
  { category: 'Entertainment', emoji: '🎬', keywords: ['netflix','amazon prime','hotstar','disney','zee5','sonyliv','mx player','youtube premium','spotify','apple music','wynk','gaana','jio saavn','bookmyshow','pvr','inox','cinepolis','concert','event','game','gaming','steam','playstation','xbox','movie','cinema','theatre','ott','subscription'] },

  // ── Health & Medical ──
  { category: 'Health', emoji: '💊', keywords: ['apollo','medplus','netmeds','1mg','tata 1mg','pharmeasy','practo','lybrate','hospital','clinic','doctor','dentist','pharmacy','chemist','medicine','health','wellness','gym','cult fit','curefit','fitpass','yoga','diagnostic','lab','pathology','scan','xray','mri'] },

  // ── Education ──
  { category: 'Education', emoji: '📚', keywords: ['udemy','coursera','byju','unacademy','vedantu','whitehat','skill india','upskill','college','school','university','fees','tuition','coaching','books','stationery','course','learning','education','exam','test'] },

  // ── Utilities & Bills ──
  { category: 'Utilities', emoji: '⚡', keywords: ['bescom','msedcl','torrent','tata power','adani electricity','bses','tpddl','electricity bill','water board','bwssb','mcgm','nmmc','postpaid','airtel','jio','vi','vodafone','idea','recharge','prepaid','dth','tata sky','dish tv','d2h','sun direct','bill','utility','payment','recharge'] },

  // ── Investment & Finance ──
  { category: 'Investment', emoji: '📈', keywords: ['zerodha','groww','upstox','kite','angel broking','paytm money','smallcase','mutual fund','sip','stock','equity','mf','nps','ppf','fd','fixed deposit','rd','recurring deposit','insurance','lic','hdfc life','sbi life','bajaj allianz','max life','invest','trading','demat','portfolio'] },

  // ── Income / Credits ──
  { category: 'Income', emoji: '💰', keywords: ['salary','payroll','wages','stipend','bonus','incentive','commission','freelance','consulting','invoice','payment received','credit received','refund','cashback','reward','interest earned','dividend','rental income','transfer received','neft received','imps received','upi received','credit'] },
];

const CATEGORY_EMOJIS = {
  'Food': '🍔', 'Groceries': '🛒', 'Transport': '🚗', 'Shopping': '🛍️',
  'Housing': '🏠', 'Entertainment': '🎬', 'Health': '💊', 'Education': '📚',
  'Utilities': '⚡', 'Investment': '📈', 'Income': '💰', 'Uncategorized': '❓'
};

// Load user-learned mappings from localStorage
function getLearnedMappings() {
  try { return JSON.parse(localStorage.getItem('learned_categories') || '{}'); }
  catch { return {}; }
}

function saveLearnedMapping(merchant, category) {
  const mappings = getLearnedMappings();
  mappings[merchant.toLowerCase().trim()] = category;
  localStorage.setItem('learned_categories', JSON.stringify(mappings));
}

// Main categorization function
function categorize(description) {
  if (!description) return { category: 'Uncategorized', emoji: '❓', confidence: 'none' };

  const text = description.toLowerCase().trim();

  // 1. Check learned mappings first (user has explicitly told us)
  const learned = getLearnedMappings();
  for (const [key, cat] of Object.entries(learned)) {
    if (text.includes(key)) {
      return { category: cat, emoji: CATEGORY_EMOJIS[cat] || '❓', confidence: 'learned' };
    }
  }

  // 2. Run through rules
  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      if (text.includes(keyword)) {
        return { category: rule.category, emoji: rule.emoji, confidence: 'auto' };
      }
    }
  }

  // 3. UPI pattern — extract beneficiary name from UPI reference
  const upiMatch = text.match(/upi[\/\-\s]+([a-z0-9]+)/i);
  if (upiMatch) {
    const upiName = upiMatch[1].toLowerCase();
    for (const rule of CATEGORY_RULES) {
      for (const keyword of rule.keywords) {
        if (upiName.includes(keyword)) {
          return { category: rule.category, emoji: rule.emoji, confidence: 'auto' };
        }
      }
    }
  }

  return { category: 'Uncategorized', emoji: '❓', confidence: 'none' };
}

function getCategoryEmoji(category) {
  return CATEGORY_EMOJIS[category] || '❓';
}

function getAllCategories() {
  return Object.keys(CATEGORY_EMOJIS);
}
