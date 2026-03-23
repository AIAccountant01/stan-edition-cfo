// Vercel Serverless Function — POST /api/chat
// Server-side chatbot with pattern matching on dashboard data
const { getSQL } = require('./lib/db');
const { setCors, verifyToken } = require('./lib/auth-middleware');
const staticDashboard = require('./_data/dashboard.json');

// ===== FORMATTING HELPERS =====
function fmtCrL(val) {
  if (val === null || val === undefined || typeof val !== 'number') return '—';
  var abs = Math.abs(val);
  var sign = val < 0 ? '-' : '';
  if (abs >= 10000000) return sign + '\u20B9' + (abs / 10000000).toFixed(2) + ' Cr';
  if (abs >= 100000) return sign + '\u20B9' + (abs / 100000).toFixed(1) + 'L';
  if (abs >= 1000) return sign + '\u20B9' + abs.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return sign + '\u20B9' + abs.toLocaleString('en-IN');
}

function fmtINRFull(val) {
  if (val === null || val === undefined || typeof val !== 'number') return '—';
  return '\u20B9' + Math.round(val).toLocaleString('en-IN');
}

function fmtNum(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val !== 'number') return String(val);
  return val.toLocaleString('en-IN');
}

function fmtPct(val) {
  if (val === null || val === undefined || typeof val !== 'number') return '—';
  return val.toFixed(1) + '%';
}

// ===== CHATBOT RESPONSE ENGINE =====
function chatbotRespond(message, data) {
  var msg = message.toLowerCase().trim();

  // Greeting
  if (msg.match(/^(hi|hello|hey|good morning|good afternoon|good evening)/)) {
    return 'Hello! I\'m your CFO Assistant for Stan Edition. I can help with revenue, products, customers, payments, geography, discounts, sessions, margins, and risks. What would you like to know?';
  }

  // Revenue / Sales
  if (msg.match(/revenue|sales|gross|net sales|how much.*made|total sales|turnover/)) {
    var rev = data.revenue;
    if (!rev) return 'Revenue data is not available yet.';
    return 'Stan Edition generated ' + fmtCrL(rev.total_gross) + ' in gross sales and ' + fmtCrL(rev.total_net) + ' in net sales (' + (data.period || '') + '). Discount rate is ' + fmtPct(rev.discount_rate) + ' (' + fmtCrL(rev.total_discounts) + ') and return rate is ' + fmtPct(rev.return_rate) + ' (' + fmtCrL(rev.total_returns) + ').';
  }

  // Top products
  if (msg.match(/top product|best sell|popular|which product|product performance/)) {
    var prods = data.products && data.products.products;
    if (!prods || !prods.length) return 'Product data is not available yet.';
    var top5 = prods.slice(0, 5);
    var lines = top5.map(function(p, i) { return (i + 1) + '. ' + p.name + ' — ' + fmtINRFull(p.gross_sales) + ' (' + (p.share_of_gross || 0).toFixed(1) + '% share)'; });
    return 'Top 5 products by gross sales:\n' + lines.join('\n');
  }

  // Customer metrics
  if (msg.match(/customer|retention|repeat|ltv|lifetime value|buyer/)) {
    var c = data.customers;
    if (!c) return 'Customer data is not available yet.';
    return 'Total customers: ' + fmtNum(c.total_customers) + '. Repeat rate: ' + fmtPct(c.repeat_rate) + ' (' + fmtNum(c.repeat_customers) + ' repeat buyers). Average LTV: ' + fmtINRFull(c.avg_ltv) + '. Avg orders per customer: ' + (c.avg_orders_per_customer || 0).toFixed(2) + '.';
  }

  // Payment methods
  if (msg.match(/payment|cod|upi|prepaid|gateway|refund/)) {
    var pay = data.payments;
    if (!pay) return 'Payment data is not available yet.';
    var gw = pay.gateway_summary || {};
    var reply = 'Payment summary: ' + fmtNum(gw.total_transactions) + ' transactions, ' + fmtCrL(gw.gross_payments) + ' gross. Refund rate: ' + fmtPct(gw.refund_rate_pct) + '. Net: ' + fmtCrL(gw.net_payments) + '.';
    var bt = pay.by_type || [];
    if (bt.length > 0) {
      reply += '\n\nBreakdown: ' + bt.slice(0, 5).map(function(b) { return b.type + ' (' + fmtPct(b.pct_of_gross) + ')'; }).join(', ') + '.';
    }
    return reply;
  }

  // Geography / states / cities
  if (msg.match(/geography|state|city|region|where|location|top state|top city/)) {
    var geo = data.geography;
    if (!geo) return 'Geography data is not available yet.';
    var states = (geo.states || []).slice(0, 5);
    var cities = (geo.cities || []).slice(0, 5);
    var reply = 'Top 5 states by revenue:\n' + states.map(function(s, i) { return (i + 1) + '. ' + s.state + ' — ' + fmtINRFull(s.revenue) + ' (' + fmtPct(s.pct_revenue) + ')'; }).join('\n');
    if (cities.length > 0) {
      reply += '\n\nTop 5 cities:\n' + cities.map(function(c, i) { return (i + 1) + '. ' + c.city + ' — ' + fmtNum(c.orders) + ' orders'; }).join('\n');
    }
    return reply;
  }

  // Discounts
  if (msg.match(/discount|coupon|promo|code/)) {
    var disc = data.discounts;
    if (!disc) return 'Discount data is not available yet.';
    var reply = 'Total discount value: ' + fmtCrL(disc.total_discount_value) + '. Discount rate: ' + fmtPct(disc.discount_rate) + '. Codes used: ' + fmtNum(disc.total_codes_used) + '.';
    var top3 = (disc.top_discounts || []).slice(0, 3);
    if (top3.length > 0) {
      reply += '\n\nTop codes: ' + top3.map(function(d) { return d.name + ' (' + d.orders + ' orders, ' + fmtINRFull(d.applied_amount) + ')'; }).join(', ') + '.';
    }
    return reply;
  }

  // Sessions / traffic / conversion
  if (msg.match(/session|traffic|visitor|conversion rate|website/)) {
    var sess = data.sessions;
    if (!sess) return 'Session data is not available yet.';
    return 'Total sessions: ' + fmtNum(sess.total_sessions) + ' (' + fmtNum(sess.total_visitors) + ' unique visitors). Avg daily: ' + fmtNum(sess.avg_daily_sessions) + ' sessions. Overall conversion rate: ' + fmtPct(sess.overall_conversion) + '.';
  }

  // Margin / profit / COGS / unit economics
  if (msg.match(/margin|profit|cogs|cost|unit economic|contribution/)) {
    var intel = data.intelligence;
    if (!intel || !intel.unit_economics) return 'Margin/unit economics data is not fully available. COGS data is needed for complete analysis.';
    var ue = intel.unit_economics;
    return 'Unit economics: AOV ' + (typeof ue.avg_order_value === 'number' ? fmtINRFull(ue.avg_order_value) : ue.avg_order_value) +
      ', Avg discount/order ' + (typeof ue.avg_discount_per_order === 'number' ? fmtINRFull(ue.avg_discount_per_order) : ue.avg_discount_per_order) +
      ', Avg net/order ' + (typeof ue.avg_net_per_order === 'number' ? fmtINRFull(ue.avg_net_per_order) : ue.avg_net_per_order) +
      '. COGS/order: ' + (typeof ue.cogs_per_order === 'number' ? fmtINRFull(ue.cogs_per_order) : ue.cogs_per_order) + '.';
  }

  // Risk / concern / warning / advisory
  if (msg.match(/risk|concern|warning|advisory|alert|issue|problem/)) {
    var adv = data.advisory;
    if (!adv) return 'Advisory data is not available yet.';
    var items = [];
    if (adv.critical) {
      adv.critical.forEach(function(c) { items.push('\uD83D\uDEA8 CRITICAL: ' + c.title); });
    }
    if (adv.warnings) {
      adv.warnings.slice(0, 3).forEach(function(w) { items.push('\u26A0 WARNING: ' + w.title); });
    }
    if (items.length === 0) return 'No critical risks or warnings found.';
    return 'Key risks and advisories:\n' + items.join('\n');
  }

  // Monthly trend / compare / growth
  if (msg.match(/trend|month|compare|growth|mom|month.over.month/)) {
    var trend = data.overview && data.overview.monthly_trend;
    if (!trend || trend.length < 2) return 'Monthly trend data is not available yet.';
    var last = trend[trend.length - 1];
    var prev = trend[trend.length - 2];
    var orderGrowth = prev.orders > 0 ? (((last.orders - prev.orders) / prev.orders) * 100).toFixed(1) : '—';
    var revenueGrowth = prev.gross_sales > 0 ? (((last.gross_sales - prev.gross_sales) / prev.gross_sales) * 100).toFixed(1) : '—';
    return 'Latest month: ' + fmtNum(last.orders) + ' orders, ' + fmtCrL(last.gross_sales) + ' gross sales.\nMoM growth: Orders ' + orderGrowth + '%, Revenue ' + revenueGrowth + '%.';
  }

  // AOV / average order value
  if (msg.match(/aov|average order|order value/)) {
    var kpis = data.overview && data.overview.kpis;
    if (!kpis) return 'KPI data is not available yet.';
    var aovKpi = kpis.find(function(k) { return k.label === 'Avg Order Value'; });
    return 'Average Order Value: ' + fmtCrL(aovKpi ? aovKpi.value : 0) + '. This reflects the average gross sale per order before discounts and returns.';
  }

  // Orders
  if (msg.match(/how many order|total order|order count|order volume/)) {
    var kpis = data.overview && data.overview.kpis;
    if (!kpis) return 'KPI data is not available yet.';
    var orderKpi = kpis.find(function(k) { return k.label === 'Total Orders'; });
    return 'Total orders: ' + fmtNum(orderKpi ? orderKpi.value : 0) + ' (' + (data.period || '') + ').';
  }

  // FY24 / P&L / pre-launch
  if (msg.match(/fy24|fy 24|p.?l|pre.?launch|spend|expense/)) {
    var fy = data.fy24_pl;
    if (!fy) return 'FY24-25 P&L data is not available yet.';
    return 'FY24-25 total pre-launch spend: ' + fmtCrL(fy.total_cost) + ' (' + (fy.period || '') + '). Breakdown: Marketing ' + fmtCrL(fy.breakdown && fy.breakdown.marketing ? fy.breakdown.marketing.total : 0) + ', Production ' + fmtCrL(fy.breakdown && fy.breakdown.production ? fy.breakdown.production.total : 0) + '.';
  }

  // Summary / overview / how is the business
  if (msg.match(/summary|overview|how.*business|performance|dashboard|key metric/)) {
    var kpis = data.overview && data.overview.kpis;
    if (!kpis) return 'Dashboard data is not available yet.';
    var lines = kpis.map(function(k) {
      var val = k.format === 'currency' ? fmtCrL(k.value) : k.format === 'percent' ? fmtPct(k.value) : fmtNum(k.value);
      return k.label + ': ' + val;
    });
    return 'Stan Edition Dashboard Summary (' + (data.period || '') + '):\n' + lines.join('\n');
  }

  // COD risk
  if (msg.match(/cod risk|cash on delivery|cod exposure/)) {
    var intel = data.intelligence;
    if (!intel || !intel.cod_risk) return 'COD risk data is not available.';
    var cod = intel.cod_risk;
    return 'COD Risk: COD share ' + fmtPct(cod.cod_share) + ', PPCOD share ' + fmtPct(cod.ppcod_share) + ', total COD exposure ' + fmtPct(cod.total_cod_exposure) + '. ' + (cod.note || '');
  }

  // Help / what can you do
  if (msg.match(/help|what can you|what do you|capability/)) {
    return 'I can help with:\n\u2022 Revenue & sales analysis\n\u2022 Top products & categories\n\u2022 Customer metrics & retention\n\u2022 Payment method breakdown\n\u2022 Geographic distribution\n\u2022 Discount analysis\n\u2022 Session & traffic data\n\u2022 Margin & unit economics\n\u2022 Risk & advisory insights\n\u2022 Monthly trends & growth\n\u2022 FY24-25 P&L\n\nTry: "What\'s the revenue?" or "Top products" or "Show me risks"';
  }

  // Default
  return 'I can help with: revenue, products, customers, payments, geography, discounts, sessions, margins, trends, risks, and more. Try asking something specific like "What\'s the revenue?" or "Top products".';
}

// ===== HANDLER =====
module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  // Verify JWT
  var user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    var body = req.body;
    if (!body || !body.message) {
      return res.status(400).json({ error: 'Missing required field: message' });
    }

    // Load dashboard data (DB first, then static)
    var dashboardData;
    try {
      var sql = getSQL();
      var rows = await sql`SELECT data_json FROM dashboard_data WHERE client_name = 'Stan Edition' ORDER BY created_at DESC LIMIT 1`;
      dashboardData = rows.length > 0 ? rows[0].data_json : staticDashboard;
    } catch (dbErr) {
      dashboardData = staticDashboard;
    }

    var reply = chatbotRespond(body.message, dashboardData);

    return res.status(200).json({ reply: reply });
  } catch (err) {
    console.error('[chat.js] Error:', err);
    return res.status(500).json({ error: 'Chat processing failed: ' + err.message });
  }
};
