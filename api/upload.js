// Vercel Serverless Function — POST /api/upload
// Accepts JSON body with CSV text, processes it, merges into dashboard data
const { getSQL } = require('./lib/db');
const { setCors, verifyToken } = require('./lib/auth-middleware');
const staticDashboard = require('./_data/dashboard.json');

// ===== CSV PARSER (handles quoted fields) =====
function parseCSV(text) {
  if (!text || typeof text !== 'string') return [];
  var lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  var result = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    result.push(parseCSVLine(line));
  }
  return result;
}

function parseCSVLine(line) {
  var fields = [];
  var field = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(field.trim());
        field = '';
      } else {
        field += ch;
      }
    }
  }
  fields.push(field.trim());
  return fields;
}

// ===== NUMERIC PARSER =====
function toNum(val) {
  if (val === undefined || val === null || val === '') return 0;
  var cleaned = String(val).replace(/[₹$,\s]/g, '');
  var num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

// ===== FIND COLUMN INDEX (case-insensitive, partial match) =====
function findCol(headers, names) {
  for (var n = 0; n < names.length; n++) {
    var target = names[n].toLowerCase();
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].toLowerCase() === target) return i;
    }
    // Partial match
    for (var i = 0; i < headers.length; i++) {
      if (headers[i].toLowerCase().indexOf(target) >= 0) return i;
    }
  }
  return -1;
}

// ===== DEEP CLONE =====
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ===== PROCESS SALES CSV =====
function processSales(rows, dashboard) {
  var data = deepClone(dashboard);
  var headers = rows[0];
  var dayCol = findCol(headers, ['day', 'date']);
  var ordersCol = findCol(headers, ['orders']);
  var grossCol = findCol(headers, ['gross sales', 'gross_sales']);
  var discCol = findCol(headers, ['discounts', 'discount']);
  var retCol = findCol(headers, ['returns', 'return']);
  var netCol = findCol(headers, ['net sales', 'net_sales']);

  var totalOrders = 0, totalGross = 0, totalNet = 0, totalDisc = 0, totalRet = 0;
  var monthlyMap = {};

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 2) continue;

    var day = dayCol >= 0 ? row[dayCol] : '';
    var orders = ordersCol >= 0 ? toNum(row[ordersCol]) : 0;
    var gross = grossCol >= 0 ? toNum(row[grossCol]) : 0;
    var disc = discCol >= 0 ? Math.abs(toNum(row[discCol])) : 0;
    var ret = retCol >= 0 ? Math.abs(toNum(row[retCol])) : 0;
    var net = netCol >= 0 ? toNum(row[netCol]) : 0;

    totalOrders += orders;
    totalGross += gross;
    totalNet += net;
    totalDisc += disc;
    totalRet += ret;

    // Group by month
    if (day) {
      var monthKey = day.substring(0, 7); // "2025-04"
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { orders: 0, gross_sales: 0, net_sales: 0, discounts: 0, returns: 0 };
      }
      monthlyMap[monthKey].orders += orders;
      monthlyMap[monthKey].gross_sales += gross;
      monthlyMap[monthKey].net_sales += net;
      monthlyMap[monthKey].discounts += disc;
      monthlyMap[monthKey].returns += ret;
    }
  }

  // Update overview KPIs
  if (data.overview && data.overview.kpis) {
    data.overview.kpis.forEach(function(kpi) {
      if (kpi.label === 'Total Orders') kpi.value = totalOrders;
      if (kpi.label === 'Gross Sales') kpi.value = totalGross;
      if (kpi.label === 'Net Sales') kpi.value = totalNet;
      if (kpi.label === 'Total Returns') kpi.value = totalRet;
      if (kpi.label === 'Total Discounts') kpi.value = totalDisc;
      if (kpi.label === 'Avg Order Value' && totalOrders > 0) kpi.value = Math.round(totalGross / totalOrders);
    });
  }

  // Update revenue section
  if (data.revenue) {
    data.revenue.total_gross = totalGross;
    data.revenue.total_net = totalNet;
    data.revenue.total_discounts = totalDisc;
    data.revenue.total_returns = totalRet;
    data.revenue.discount_rate = totalGross > 0 ? (totalDisc / totalGross) * 100 : 0;
    data.revenue.return_rate = totalGross > 0 ? (totalRet / totalGross) * 100 : 0;
  }

  // Update monthly trend
  var monthKeys = Object.keys(monthlyMap).sort();
  if (monthKeys.length > 0 && data.overview) {
    data.overview.monthly_trend = monthKeys.map(function(mk) {
      var existing = null;
      if (data.overview.monthly_trend) {
        existing = data.overview.monthly_trend.find(function(t) { return t.month === mk; });
      }
      var m = monthlyMap[mk];
      return {
        month: mk,
        orders: m.orders,
        gross_sales: m.gross_sales,
        net_sales: m.net_sales,
        total_sales: m.net_sales,
        sessions: existing ? existing.sessions : 0,
        visitors: existing ? existing.visitors : 0,
        conversion_rate: existing && existing.sessions > 0 ? parseFloat(((m.orders / existing.sessions) * 100).toFixed(2)) : 0,
        aov: m.orders > 0 ? Math.round(m.gross_sales / m.orders) : 0,
        discounts: m.discounts,
        returns: m.returns
      };
    });
  }

  return {
    data: data,
    updates: ['overview.kpis', 'revenue', 'overview.monthly_trend'],
    rows_processed: rows.length - 1
  };
}

// ===== PROCESS ORDERS CSV (Shopify export) =====
function processOrders(rows, dashboard) {
  var data = deepClone(dashboard);
  var headers = rows[0];

  var nameCol = findCol(headers, ['name', 'order']);
  var emailCol = findCol(headers, ['email']);
  var totalCol = findCol(headers, ['total']);
  var subtotalCol = findCol(headers, ['subtotal']);
  var discAmtCol = findCol(headers, ['discount amount', 'discount_amount']);
  var discCodeCol = findCol(headers, ['discount code', 'discount_code']);
  var lineItemCol = findCol(headers, ['lineitem name', 'lineitem_name']);
  var lineQtyCol = findCol(headers, ['lineitem quantity', 'lineitem_quantity']);
  var linePriceCol = findCol(headers, ['lineitem price', 'lineitem_price']);
  var provCol = findCol(headers, ['billing province', 'province', 'billing state', 'state']);
  var cityCol = findCol(headers, ['billing city', 'city']);

  var productMap = {};
  var stateMap = {};
  var cityMap = {};
  var customerMap = {};
  var discountMap = {};
  var orderSet = {};
  var totalGross = 0, totalDisc = 0;

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 3) continue;

    var orderName = nameCol >= 0 ? row[nameCol] : '';
    var email = emailCol >= 0 ? (row[emailCol] || '').toLowerCase() : '';
    var total = totalCol >= 0 ? toNum(row[totalCol]) : 0;
    var subtotal = subtotalCol >= 0 ? toNum(row[subtotalCol]) : 0;
    var discAmt = discAmtCol >= 0 ? Math.abs(toNum(row[discAmtCol])) : 0;
    var discCode = discCodeCol >= 0 ? (row[discCodeCol] || '').trim() : '';
    var lineItem = lineItemCol >= 0 ? (row[lineItemCol] || '') : '';
    var lineQty = lineQtyCol >= 0 ? toNum(row[lineQtyCol]) : 1;
    var linePrice = linePriceCol >= 0 ? toNum(row[linePriceCol]) : 0;
    var province = provCol >= 0 ? (row[provCol] || '').trim() : '';
    var city = cityCol >= 0 ? (row[cityCol] || '').trim() : '';

    // Track unique orders
    if (orderName && !orderSet[orderName]) {
      orderSet[orderName] = true;
      totalGross += total || subtotal;
      totalDisc += discAmt;

      // Customer tracking
      if (email) {
        if (!customerMap[email]) customerMap[email] = { orders: 0, total_spent: 0 };
        customerMap[email].orders++;
        customerMap[email].total_spent += total || subtotal;
      }

      // Geography — state
      if (province) {
        if (!stateMap[province]) stateMap[province] = { orders: 0, revenue: 0 };
        stateMap[province].orders++;
        stateMap[province].revenue += total || subtotal;
      }

      // Geography — city
      if (city) {
        if (!cityMap[city]) cityMap[city] = { orders: 0, revenue: 0 };
        cityMap[city].orders++;
        cityMap[city].revenue += total || subtotal;
      }

      // Discount codes
      if (discCode) {
        if (!discountMap[discCode]) discountMap[discCode] = { orders: 0, amount: 0, gross: 0 };
        discountMap[discCode].orders++;
        discountMap[discCode].amount += discAmt;
        discountMap[discCode].gross += total || subtotal;
      }
    }

    // Product tracking (per line item)
    if (lineItem) {
      if (!productMap[lineItem]) productMap[lineItem] = { units: 0, gross: 0 };
      productMap[lineItem].units += lineQty || 1;
      productMap[lineItem].gross += linePrice * (lineQty || 1);
    }
  }

  var totalOrders = Object.keys(orderSet).length;

  // Update overview KPIs
  if (data.overview && data.overview.kpis) {
    data.overview.kpis.forEach(function(kpi) {
      if (kpi.label === 'Total Orders') kpi.value = totalOrders;
      if (kpi.label === 'Gross Sales') kpi.value = totalGross;
      if (kpi.label === 'Avg Order Value' && totalOrders > 0) kpi.value = Math.round(totalGross / totalOrders);
      if (kpi.label === 'Total Discounts') kpi.value = totalDisc;
    });
  }

  // Update products
  var prodKeys = Object.keys(productMap);
  prodKeys.sort(function(a, b) { return productMap[b].gross - productMap[a].gross; });
  if (prodKeys.length > 0 && data.products) {
    data.products.total_skus = prodKeys.length;
    data.products.products = prodKeys.slice(0, 50).map(function(name) {
      var p = productMap[name];
      var share = totalGross > 0 ? (p.gross / totalGross) * 100 : 0;
      return {
        name: name,
        units_sold: p.units,
        gross_sales: p.gross,
        discounts: 0,
        returns: 0,
        net_sales: p.gross,
        asp: p.units > 0 ? Math.round(p.gross / p.units) : 0,
        share_of_gross: parseFloat(share.toFixed(2))
      };
    });
  }

  // Update geography — states
  var stateKeys = Object.keys(stateMap);
  stateKeys.sort(function(a, b) { return stateMap[b].revenue - stateMap[a].revenue; });
  if (stateKeys.length > 0 && data.geography) {
    data.geography.states = stateKeys.slice(0, 30).map(function(s) {
      return {
        state: s,
        orders: stateMap[s].orders,
        revenue: stateMap[s].revenue,
        pct_revenue: totalGross > 0 ? parseFloat(((stateMap[s].revenue / totalGross) * 100).toFixed(1)) : 0
      };
    });
  }

  // Update geography — cities
  var cityKeys = Object.keys(cityMap);
  cityKeys.sort(function(a, b) { return cityMap[b].revenue - cityMap[a].revenue; });
  if (cityKeys.length > 0 && data.geography) {
    data.geography.cities = cityKeys.slice(0, 30).map(function(c) {
      return {
        city: c,
        orders: cityMap[c].orders,
        revenue: cityMap[c].revenue
      };
    });
  }

  // Update customers
  var emails = Object.keys(customerMap);
  if (emails.length > 0 && data.customers) {
    var totalCustomers = emails.length;
    var repeatCustomers = emails.filter(function(e) { return customerMap[e].orders > 1; }).length;
    var totalSpent = emails.reduce(function(s, e) { return s + customerMap[e].total_spent; }, 0);
    data.customers.total_customers = totalCustomers;
    data.customers.repeat_customers = repeatCustomers;
    data.customers.repeat_rate = totalCustomers > 0 ? parseFloat(((repeatCustomers / totalCustomers) * 100).toFixed(1)) : 0;
    data.customers.avg_ltv = totalCustomers > 0 ? Math.round(totalSpent / totalCustomers) : 0;
    data.customers.avg_orders_per_customer = totalCustomers > 0 ? parseFloat((totalOrders / totalCustomers).toFixed(2)) : 0;
  }

  // Update discounts
  var discKeys = Object.keys(discountMap);
  discKeys.sort(function(a, b) { return discountMap[b].orders - discountMap[a].orders; });
  if (discKeys.length > 0 && data.discounts) {
    data.discounts.total_codes_used = discKeys.length;
    data.discounts.total_discount_value = totalDisc;
    data.discounts.discount_rate = totalGross > 0 ? parseFloat(((totalDisc / totalGross) * 100).toFixed(1)) : 0;
    data.discounts.top_discounts = discKeys.slice(0, 20).map(function(code) {
      var d = discountMap[code];
      return {
        name: code,
        orders: d.orders,
        applied_amount: d.amount,
        gross_sales: d.gross,
        avg_discount_per_order: d.orders > 0 ? Math.round(d.amount / d.orders) : 0
      };
    });
  }

  return {
    data: data,
    updates: ['overview.kpis', 'products', 'geography', 'customers', 'discounts'],
    rows_processed: rows.length - 1
  };
}

// ===== PROCESS RETURNS CSV =====
function processReturns(rows, dashboard) {
  var data = deepClone(dashboard);
  var headers = rows[0];
  var dayCol = findCol(headers, ['day', 'date']);
  var retCol = findCol(headers, ['returns', 'return', 'amount']);

  var totalReturns = 0;
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 2) continue;
    totalReturns += retCol >= 0 ? Math.abs(toNum(row[retCol])) : 0;
  }

  if (data.overview && data.overview.kpis) {
    data.overview.kpis.forEach(function(kpi) {
      if (kpi.label === 'Total Returns') kpi.value = totalReturns;
    });
  }
  if (data.revenue) {
    data.revenue.total_returns = totalReturns;
    if (data.revenue.total_gross > 0) {
      data.revenue.return_rate = parseFloat(((totalReturns / data.revenue.total_gross) * 100).toFixed(2));
    }
  }

  return {
    data: data,
    updates: ['overview.kpis', 'revenue.return_rate'],
    rows_processed: rows.length - 1
  };
}

// ===== PROCESS PAYMENTS CSV =====
function processPayments(rows, dashboard) {
  var data = deepClone(dashboard);
  var headers = rows[0];
  var typeCol = findCol(headers, ['type', 'method', 'gateway']);
  var txnCol = findCol(headers, ['transactions', 'orders', 'count']);
  var grossCol = findCol(headers, ['gross payments', 'gross', 'amount']);
  var refundCol = findCol(headers, ['refunded', 'refund']);
  var netCol = findCol(headers, ['net payments', 'net']);

  var totalTxn = 0, totalGross = 0, totalRefund = 0, totalNet = 0;
  var byType = [];

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 2) continue;
    var type = typeCol >= 0 ? (row[typeCol] || '') : '';
    var txn = txnCol >= 0 ? toNum(row[txnCol]) : 0;
    var gross = grossCol >= 0 ? toNum(row[grossCol]) : 0;
    var refund = refundCol >= 0 ? Math.abs(toNum(row[refundCol])) : 0;
    var net = netCol >= 0 ? toNum(row[netCol]) : gross - refund;

    totalTxn += txn;
    totalGross += gross;
    totalRefund += refund;
    totalNet += net;

    if (type) {
      byType.push({ type: type, transactions: txn, gross: gross, refunded: refund, net: net });
    }
  }

  // Compute percentages
  byType.forEach(function(bt) {
    bt.pct_of_gross = totalGross > 0 ? parseFloat(((bt.gross / totalGross) * 100).toFixed(1)) : 0;
  });

  if (data.payments) {
    data.payments.gateway_summary = {
      total_transactions: totalTxn,
      gross_payments: totalGross,
      total_refunded: totalRefund,
      net_payments: totalNet,
      refund_rate_pct: totalGross > 0 ? parseFloat(((totalRefund / totalGross) * 100).toFixed(1)) : 0
    };
    data.payments.by_type = byType;
  }

  return {
    data: data,
    updates: ['payments'],
    rows_processed: rows.length - 1
  };
}

// ===== PROCESS SESSIONS CSV =====
function processSessions(rows, dashboard) {
  var data = deepClone(dashboard);
  var headers = rows[0];
  var dayCol = findCol(headers, ['day', 'date']);
  var sessCol = findCol(headers, ['sessions']);
  var visCol = findCol(headers, ['visitors']);

  var totalSessions = 0, totalVisitors = 0;
  var dailySessions = [];
  var monthlyMap = {};

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 2) continue;
    var day = dayCol >= 0 ? (row[dayCol] || '') : '';
    var sess = sessCol >= 0 ? toNum(row[sessCol]) : 0;
    var vis = visCol >= 0 ? toNum(row[visCol]) : 0;

    totalSessions += sess;
    totalVisitors += vis;
    if (day) {
      dailySessions.push({ date: day, sessions: sess, visitors: vis });
      var mk = day.substring(0, 7);
      if (!monthlyMap[mk]) monthlyMap[mk] = { sessions: 0, visitors: 0 };
      monthlyMap[mk].sessions += sess;
      monthlyMap[mk].visitors += vis;
    }
  }

  var dayCount = dailySessions.length || 1;

  if (data.sessions) {
    data.sessions.total_sessions = totalSessions;
    data.sessions.total_visitors = totalVisitors;
    data.sessions.avg_daily_sessions = Math.round(totalSessions / dayCount);
    data.sessions.avg_daily_visitors = Math.round(totalVisitors / dayCount);
    data.sessions.daily_sessions = dailySessions;
  }

  // Update monthly trend sessions
  if (data.overview && data.overview.monthly_trend) {
    data.overview.monthly_trend.forEach(function(t) {
      if (monthlyMap[t.month]) {
        t.sessions = monthlyMap[t.month].sessions;
        t.visitors = monthlyMap[t.month].visitors;
        if (t.sessions > 0 && t.orders > 0) {
          t.conversion_rate = parseFloat(((t.orders / t.sessions) * 100).toFixed(2));
        }
      }
    });
  }

  // Update overview KPI
  if (data.overview && data.overview.kpis) {
    data.overview.kpis.forEach(function(kpi) {
      if (kpi.label === 'Total Sessions') kpi.value = totalSessions;
    });
  }

  return {
    data: data,
    updates: ['sessions', 'overview.monthly_trend', 'overview.kpis'],
    rows_processed: rows.length - 1
  };
}

// ===== PROCESS TAXES CSV =====
function processTaxes(rows, dashboard) {
  var data = deepClone(dashboard);
  var headers = rows[0];
  var provCol = findCol(headers, ['province', 'state', 'region']);
  var amtCol = findCol(headers, ['tax amount', 'tax', 'amount']);

  var taxes = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 2) continue;
    var prov = provCol >= 0 ? (row[provCol] || '') : '';
    var amt = amtCol >= 0 ? toNum(row[amtCol]) : 0;
    if (prov) taxes.push({ province: prov, tax_amount: amt });
  }

  if (data.taxes) {
    data.taxes = taxes;
  }

  return {
    data: data,
    updates: ['taxes'],
    rows_processed: rows.length - 1
  };
}

// ===== PROCESS DISCOUNTS CSV =====
function processDiscounts(rows, dashboard) {
  var data = deepClone(dashboard);
  var headers = rows[0];
  var codeCol = findCol(headers, ['discount code', 'code', 'name']);
  var ordCol = findCol(headers, ['orders', 'count']);
  var amtCol = findCol(headers, ['amount', 'discount', 'value']);
  var typeCol = findCol(headers, ['type']);

  var totalDisc = 0, totalOrders = 0;
  var discounts = [];

  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (!row || row.length < 2) continue;
    var code = codeCol >= 0 ? (row[codeCol] || '') : '';
    var orders = ordCol >= 0 ? toNum(row[ordCol]) : 0;
    var amt = amtCol >= 0 ? Math.abs(toNum(row[amtCol])) : 0;

    totalDisc += amt;
    totalOrders += orders;

    if (code) {
      discounts.push({
        name: code,
        orders: orders,
        applied_amount: amt,
        gross_sales: 0,
        avg_discount_per_order: orders > 0 ? Math.round(amt / orders) : 0
      });
    }
  }

  discounts.sort(function(a, b) { return b.orders - a.orders; });

  if (data.discounts) {
    data.discounts.total_discount_value = totalDisc;
    data.discounts.total_codes_used = discounts.length;
    data.discounts.top_discounts = discounts.slice(0, 20);
  }

  return {
    data: data,
    updates: ['discounts'],
    rows_processed: rows.length - 1
  };
}

// ===== PROCESSOR MAP =====
var processors = {
  sales: processSales,
  orders: processOrders,
  returns: processReturns,
  payments: processPayments,
  sessions: processSessions,
  taxes: processTaxes,
  discounts: processDiscounts
};

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
    if (!body || !body.csvData || !body.type) {
      return res.status(400).json({ error: 'Missing required fields: csvData, type' });
    }

    var csvData = body.csvData;
    var type = body.type;
    var filename = body.filename || 'unknown.csv';

    if (!processors[type]) {
      return res.status(400).json({ error: 'Invalid type. Must be one of: ' + Object.keys(processors).join(', ') });
    }

    // Parse CSV
    var rows = parseCSV(csvData);
    if (rows.length < 2) {
      return res.status(400).json({ error: 'CSV must have at least a header row and one data row' });
    }

    // Fetch current dashboard data from DB (or fall back to static)
    var sql = getSQL();
    var currentData;
    try {
      var dbRows = await sql`SELECT data_json FROM dashboard_data WHERE client_name = 'Stan Edition' ORDER BY created_at DESC LIMIT 1`;
      currentData = dbRows.length > 0 ? dbRows[0].data_json : deepClone(staticDashboard);
    } catch (dbErr) {
      currentData = deepClone(staticDashboard);
    }

    // Process CSV and merge
    var result = processors[type](rows, currentData);
    var updatedData = result.data;
    updatedData.generated_at = new Date().toISOString();

    // Store updated JSON in DB
    await sql`
      INSERT INTO dashboard_data (client_name, data_json, uploaded_by, upload_source)
      VALUES ('Stan Edition', ${JSON.stringify(updatedData)}, ${user.email || 'unknown'}, ${'csv_upload_' + type})
    `;

    // Log audit
    try {
      await sql`
        INSERT INTO audit_log (action, email, details)
        VALUES ('data_uploaded', ${user.email || 'unknown'}, ${JSON.stringify({
          type: type,
          filename: filename,
          rows_processed: result.rows_processed,
          updates: result.updates
        })})
      `;
    } catch (auditErr) {
      console.error('[upload.js] Audit log failed:', auditErr.message);
    }

    return res.status(200).json({
      success: true,
      summary: {
        rows_processed: result.rows_processed,
        type: type,
        filename: filename,
        updates: result.updates
      }
    });

  } catch (err) {
    console.error('[upload.js] Error:', err);
    return res.status(500).json({ error: 'Upload processing failed: ' + err.message });
  }
};
