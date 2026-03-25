// ===== AI ACCOUNTANT — STAN EDITION DASHBOARD APP ===== //
// Fetches data from /api/data and populates the entire dashboard

// ===== API BASE PATH =====
// Auto-detect base path so API calls work behind Cloudflare proxy
// e.g. on Vercel: '' → fetch('/api/data')
// e.g. on aiaccountant.com/stanedition/: '/stanedition' → fetch('/stanedition/api/data')
var API_BASE = (function() {
  var path = window.location.pathname;
  // Find the directory containing index.html/login.html
  var lastSlash = path.lastIndexOf('/');
  var dir = path.substring(0, lastSlash); // e.g. '/stanedition' or ''
  // If we're at root, return ''
  return dir === '' ? '' : dir;
})();

// ===== CHART DEFAULTS =====
Chart.defaults.font.family = "'Inter', sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.color = '#6b7280';
Chart.defaults.plugins.legend.labels.usePointStyle = true;
Chart.defaults.plugins.legend.labels.pointStyleWidth = 8;
Chart.defaults.plugins.legend.labels.padding = 16;
Chart.defaults.plugins.tooltip.backgroundColor = '#1f2937';
Chart.defaults.plugins.tooltip.titleFont = { size: 12, weight: '600' };
Chart.defaults.plugins.tooltip.bodyFont = { size: 11 };
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 6;
Chart.defaults.plugins.tooltip.displayColors = true;
Chart.defaults.elements.bar.borderRadius = 4;
Chart.defaults.elements.point.radius = 3;
Chart.defaults.elements.point.hoverRadius = 5;
Chart.defaults.scale.grid.color = '#f3f4f6';

// ===== COLORS =====
var C = {
  teal: '#01696F',
  tealLight: 'rgba(1,105,111,0.12)',
  orange: '#f59e0b',
  orangeLight: 'rgba(245,158,11,0.12)',
  red: '#ef4444',
  redLight: 'rgba(239,68,68,0.12)',
  green: '#10b981',
  greenLight: 'rgba(16,185,129,0.12)',
  blue: '#3b82f6',
  blueLight: 'rgba(59,130,246,0.12)',
  gray: '#9ca3af',
  grayLight: 'rgba(156,163,175,0.12)',
  purple: '#8b5cf6',
  pink: '#ec4899',
};

// ===== HELPER: Format INR (Indian number system) =====
function fmtCrL(val) {
  if (val === null || val === undefined || typeof val !== 'number') return '—';
  var abs = Math.abs(val);
  var sign = val < 0 ? '-' : '';
  if (abs >= 10000000) return sign + '\u20B9' + (abs / 10000000).toFixed(2) + ' Cr';
  if (abs >= 100000) return sign + '\u20B9' + (abs / 100000).toFixed(1) + 'L';
  if (abs >= 1000) return sign + '\u20B9' + abs.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return sign + '\u20B9' + abs.toLocaleString('en-IN');
}

function fmtINR(val) {
  if (val === null || val === undefined || typeof val !== 'number') return '—';
  var abs = Math.abs(val);
  var sign = val < 0 ? '-' : '';
  if (abs >= 100000) return sign + '\u20B9' + (abs / 100000).toFixed(1) + 'L';
  if (abs >= 1000) return sign + '\u20B9' + (abs / 1000).toFixed(1) + 'K';
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

// Short month label from "2025-04" => "Apr '25"
function shortMonth(m) {
  if (!m) return '—';
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var parts = m.split('-');
  if (parts.length < 2) return m;
  return months[parseInt(parts[1], 10) - 1] + " '" + parts[0].slice(2);
}

// Safe accessor — returns fallback if path doesn't resolve
function safe(obj, path, fallback) {
  if (fallback === undefined) fallback = null;
  try {
    var keys = path.split('.');
    var cur = obj;
    for (var i = 0; i < keys.length; i++) {
      if (cur === null || cur === undefined) return fallback;
      cur = cur[keys[i]];
    }
    return cur !== undefined && cur !== null ? cur : fallback;
  } catch (e) {
    return fallback;
  }
}

// ===== SECTION LABEL MAP (for breadcrumb) =====
var sectionLabels = {
  overview: 'Overview',
  revenue: 'Revenue',
  products: 'Products',
  payments: 'Payments',
  customers: 'Customers',
  geography: 'Geography',
  discounts: 'Discounts',
  sessions: 'Sessions',
  profitloss: 'Profit & Loss',
  fy24: 'FY24-25 P&L',
  intelligence: 'Intelligence',
  advisory: 'Advisory',
  datastatus: 'Data Status',
  upload: 'Upload Data',
};

// ===== NAV LOGIC =====
document.addEventListener('DOMContentLoaded', function() {
  var navLinks = document.querySelectorAll('#sidebarNav a');
  var sections = document.querySelectorAll('.section');

  navLinks.forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var target = this.dataset.section;

      navLinks.forEach(function(l) { l.classList.remove('active'); });
      this.classList.add('active');

      sections.forEach(function(s) { s.classList.remove('active'); });
      document.getElementById('sec-' + target).classList.add('active');

      // Update breadcrumb
      var bc = document.getElementById('breadcrumbSection');
      if (bc) bc.textContent = sectionLabels[target] || target;

      setTimeout(function() {
        var sec = document.getElementById('sec-' + target);
        if (sec) {
          sec.querySelectorAll('canvas').forEach(function(c) {
            var chart = Chart.getChart(c);
            if (chart) { chart.resize(); chart.update(); }
          });
        }
      }, 50);

      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // Fetch dashboard data
  fetchDashboardData();
});

// ===== FETCH DATA =====
function fetchDashboardData() {
  var token = window.AIA && window.AIA.Session.getToken();
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  fetch(API_BASE + '/api/data', {
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    }
  })
  .then(function(res) {
    if (res.status === 401) {
      window.location.href = 'login.html';
      throw new Error('Unauthorized');
    }
    return res.json();
  })
  .then(function(data) {
    renderDashboard(data);
  })
  .catch(function(err) {
    if (err.message !== 'Unauthorized') {
      console.error('Failed to load dashboard data:', err);
    }
    // Always hide loading overlay even on error
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
  });
}

// ===== RENDER DASHBOARD =====
function renderDashboard(data) {
  // Store data globally for chatbot
  window._dashData = data;

  // Show all sections briefly for chart init
  var sections = document.querySelectorAll('.section');
  sections.forEach(function(s) { s.style.display = 'block'; });

  var renderFns = [
    { name: 'Overview', fn: renderOverview },
    { name: 'Revenue', fn: renderRevenue },
    { name: 'Products', fn: renderProducts },
    { name: 'Payments', fn: renderPayments },
    { name: 'Customers', fn: renderCustomers },
    { name: 'Geography', fn: renderGeography },
    { name: 'Discounts', fn: renderDiscounts },
    { name: 'Sessions', fn: renderSessions },
    { name: 'ProfitLoss', fn: renderProfitLoss },
    { name: 'FY24', fn: renderFY24 },
    { name: 'Intelligence', fn: renderIntelligence },
    { name: 'Advisory', fn: renderAdvisory },
    { name: 'DataStatus', fn: renderDataStatus },
  ];

  renderFns.forEach(function(r) {
    try {
      r.fn(data);
    } catch (err) {
      console.error('[Dashboard] Error rendering ' + r.name + ':', err);
    }
  });

  // Restore section visibility
  sections.forEach(function(s) { s.style.display = ''; });

  // Force resize overview charts
  document.querySelectorAll('#sec-overview canvas').forEach(function(c) {
    var chart = Chart.getChart(c);
    if (chart) chart.resize();
  });

  // Hide loading overlay
  var overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ===== BUILD KPI CARD HTML =====
function buildKpiCard(label, value, sub, cls, smallValue) {
  return '<div class="kpi-card' + (cls ? ' ' + cls : '') + '">' +
    '<div class="kpi-label">' + label + '</div>' +
    '<div class="kpi-value' + (smallValue ? ' kpi-value-sm' : '') + '">' + value + '</div>' +
    (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') +
    '</div>';
}

// ===== 1. OVERVIEW =====
function renderOverview(data) {
  var ov = data.overview;
  if (!ov) return;

  var kpis = ov.kpis || [];
  var html = '';
  kpis.forEach(function(kpi) {
    var val = '—';
    if (kpi.format === 'currency') val = fmtCrL(kpi.value);
    else if (kpi.format === 'percent') val = fmtPct(kpi.value);
    else if (kpi.format === 'number') val = fmtNum(kpi.value);
    var cls = '';
    if (kpi.label === 'Gross Sales' || kpi.label === 'Net Sales') cls = 'kpi-highlight';
    html += buildKpiCard(kpi.label, val, kpi.delta || '', cls);
  });
  document.getElementById('overview-kpis').innerHTML = html;

  // Monthly Revenue Trend chart
  var trend = ov.monthly_trend || [];
  if (!trend.length) return;

  var months = trend.map(function(t) { return shortMonth(t.month); });
  var grossArr = trend.map(function(t) { return t.gross_sales || 0; });
  var netArr = trend.map(function(t) { return t.net_sales || 0; });
  var discArr = trend.map(function(t) { return t.discounts || 0; });

  new Chart(document.getElementById('overviewRevenueChart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Gross Sales',
          data: grossArr,
          borderColor: C.teal,
          backgroundColor: C.tealLight,
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
        },
        {
          label: 'Net Sales',
          data: netArr,
          borderColor: C.blue,
          backgroundColor: C.blueLight,
          fill: true,
          tension: 0.35,
          borderWidth: 2,
          borderDash: [4, 3],
        },
        {
          label: 'Discounts',
          type: 'bar',
          data: discArr,
          backgroundColor: C.orangeLight,
          borderColor: C.orange,
          borderWidth: 1,
          barPercentage: 0.4,
          yAxisID: 'y',
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + fmtINR(ctx.raw); } } }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: function(v) { return fmtINR(v); } }
        }
      }
    }
  });

  // Monthly Orders & Sessions chart
  var ordersArr = trend.map(function(t) { return t.orders || 0; });
  var sessionsArr = trend.map(function(t) { return t.sessions || 0; });

  new Chart(document.getElementById('overviewOrdersChart'), {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        {
          label: 'Orders',
          data: ordersArr,
          backgroundColor: C.teal,
          yAxisID: 'y',
          barPercentage: 0.6,
        },
        {
          label: 'Sessions',
          data: sessionsArr,
          type: 'line',
          borderColor: C.orange,
          backgroundColor: 'transparent',
          yAxisID: 'y1',
          tension: 0.35,
          borderWidth: 2,
          pointBackgroundColor: C.orange,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + fmtNum(ctx.raw); } } }
      },
      scales: {
        y: { beginAtZero: true, position: 'left', title: { display: true, text: 'Orders' } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'Sessions' }, ticks: { callback: function(v) { return (v/1000).toFixed(0) + 'K'; } } }
      }
    }
  });
}

// ===== 2. REVENUE =====
function renderRevenue(data) {
  var rev = data.revenue;
  var ov = data.overview;
  if (!rev) return;

  var kpiHtml = '';
  kpiHtml += buildKpiCard('Gross Sales', fmtCrL(rev.total_gross), 'Total before discounts/returns', 'kpi-highlight');
  kpiHtml += buildKpiCard('Net Sales', fmtCrL(rev.total_net), 'After discounts & returns', 'kpi-highlight');
  kpiHtml += buildKpiCard('Discount Rate', fmtPct(rev.discount_rate), fmtCrL(rev.total_discounts) + ' total discounts', 'kpi-warning');
  kpiHtml += buildKpiCard('Return Rate', fmtPct(rev.return_rate), fmtCrL(rev.total_returns) + ' total returns', '');
  document.getElementById('revenue-kpis').innerHTML = kpiHtml;

  // Channel note
  var channelNote = document.getElementById('revenue-channelNote');
  if (channelNote) channelNote.textContent = rev.channel_note || '—';

  // Daily Sales Chart (sampled for performance — every 3rd day)
  var daily = rev.daily_sales || [];
  if (daily.length) {
    var sampleDays = [];
    var sampleGross = [];
    var sampleNet = [];
    for (var i = 0; i < daily.length; i += 3) {
      sampleDays.push(daily[i].date.slice(5)); // MM-DD
      sampleGross.push(daily[i].gross_sales || 0);
      sampleNet.push(daily[i].net_sales || 0);
    }

    new Chart(document.getElementById('revenueDailyChart'), {
      type: 'line',
      data: {
        labels: sampleDays,
        datasets: [
          {
            label: 'Gross Sales',
            data: sampleGross,
            borderColor: C.teal,
            backgroundColor: C.tealLight,
            fill: true,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: 0,
          },
          {
            label: 'Net Sales',
            data: sampleNet,
            borderColor: C.blue,
            backgroundColor: 'transparent',
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: 0,
            borderDash: [3, 2],
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + fmtINRFull(ctx.raw); } } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: function(v) { return fmtINR(v); } } },
          x: { ticks: { maxTicksLimit: 15, font: { size: 10 } } }
        }
      }
    });
  }

  // Monthly Revenue Table
  var trend = (ov && ov.monthly_trend) ? ov.monthly_trend : [];
  var tbody = document.querySelector('#revenueMonthlyTable tbody');
  if (tbody && trend.length) {
    tbody.innerHTML = '';
    trend.forEach(function(m) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + shortMonth(m.month) + '</td>' +
        '<td class="text-right">' + fmtNum(m.orders) + '</td>' +
        '<td class="text-right">' + fmtINRFull(m.gross_sales) + '</td>' +
        '<td class="text-right">' + fmtINRFull(m.net_sales) + '</td>' +
        '<td class="text-right">' + fmtINRFull(m.discounts) + '</td>' +
        '<td class="text-right">' + fmtINRFull(m.returns) + '</td>' +
        '<td class="text-right">' + fmtNum(m.sessions) + '</td>' +
        '<td class="text-right">' + fmtPct(m.conversion_rate) + '</td>';
      tbody.appendChild(tr);
    });
  }
}

// ===== 3. PRODUCTS =====
function renderProducts(data) {
  var prod = data.products;
  if (!prod) return;

  var cats = prod.categories || [];
  var products = prod.products || [];

  // KPIs
  var topProduct = products[0];
  var topShare = topProduct && typeof topProduct.share_of_gross === 'number' ? topProduct.share_of_gross.toFixed(1) + '%' : '—';
  var totalUnits = products.reduce(function(s, p) { return s + (p.units_sold || 0); }, 0);

  var kpiHtml = '';
  kpiHtml += buildKpiCard('Total SKUs', fmtNum(prod.total_skus), 'Active products', '');
  kpiHtml += buildKpiCard('Total Units Sold', fmtNum(totalUnits), 'Across all products', '');
  kpiHtml += buildKpiCard('Top Product Share', topShare, topProduct ? topProduct.name.slice(0, 30) : '', 'kpi-warning');
  kpiHtml += buildKpiCard('Categories', cats.length.toString(), cats.map(function(c) { return c.category; }).join(', '), '');
  document.getElementById('products-kpis').innerHTML = kpiHtml;

  // Category doughnut — categories use "revenue" not "gross_sales", compute share from total
  var totalCatRevenue = cats.reduce(function(s, c) { return s + (c.revenue || 0); }, 0);
  var catLabels = cats.map(function(c) {
    var share = totalCatRevenue > 0 ? ((c.revenue / totalCatRevenue) * 100).toFixed(1) : '0';
    return c.category + ' (' + share + '%)';
  });

  new Chart(document.getElementById('productCategoryChart'), {
    type: 'doughnut',
    data: {
      labels: catLabels,
      datasets: [{
        data: cats.map(function(c) { return c.revenue || 0; }),
        backgroundColor: [C.teal, C.blue, C.orange, C.purple, C.pink, C.green, C.gray],
        borderWidth: 2,
        borderColor: '#fff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        tooltip: { callbacks: { label: function(ctx) { return ctx.label + ': ' + fmtCrL(ctx.raw); } } }
      }
    }
  });

  // Concentration risk
  var risk = prod.concentration_risk;
  if (risk) {
    var concSub = document.getElementById('products-concentrationSub');
    if (concSub) {
      concSub.textContent = 'Top product: ' + (risk.top_product || '—') + ' — ' +
        (typeof risk.top_product_share === 'number' ? risk.top_product_share.toFixed(1) : '—') + '% of gross';
    }
    var concAlert = document.getElementById('products-concentration-alert');
    if (concAlert) {
      concAlert.innerHTML =
        '<div class="concentration-alert"><div class="alert-title">\u26A0 Concentration Risk</div><div class="alert-body">' + (risk.alert || 'N/A') + '</div></div>';
    }
  }

  // Top 20 Products Table
  var tbody = document.querySelector('#productsTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    products.slice(0, 20).forEach(function(p, i) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td' + (i === 0 ? ' class="font-bold"' : '') + '>' + (p.name || '—') + '</td>' +
        '<td class="text-right">' + fmtNum(p.units_sold) + '</td>' +
        '<td class="text-right">' + fmtINRFull(p.gross_sales) + '</td>' +
        '<td class="text-right">' + fmtINRFull(p.discounts) + '</td>' +
        '<td class="text-right">' + fmtINRFull(p.returns) + '</td>' +
        '<td class="text-right">' + fmtINRFull(p.net_sales) + '</td>' +
        '<td class="text-right">' + fmtINRFull(p.asp) + '</td>' +
        '<td class="text-right font-bold">' + (typeof p.share_of_gross === 'number' ? p.share_of_gross.toFixed(1) + '%' : '—') + '</td>';
      tbody.appendChild(tr);
    });
  }
}

// ===== 4. PAYMENTS =====
function renderPayments(data) {
  var pay = data.payments;
  if (!pay) return;

  var gw = pay.gateway_summary || {};
  var byType = pay.by_type || [];

  // KPIs from gateway_summary
  var kpiHtml = '';
  kpiHtml += buildKpiCard('Total Transactions', fmtNum(gw.total_transactions), 'All payment methods', 'kpi-highlight');
  kpiHtml += buildKpiCard('Gross Payments', fmtCrL(gw.gross_payments), 'Before refunds', '');
  kpiHtml += buildKpiCard('Total Refunded', fmtCrL(gw.total_refunded), fmtPct(gw.refund_rate_pct) + ' refund rate', 'kpi-warning');
  kpiHtml += buildKpiCard('Net Payments', fmtCrL(gw.net_payments), 'After refunds', 'kpi-highlight');
  document.getElementById('payments-kpis').innerHTML = kpiHtml;

  // Payment note
  var noteEl = document.getElementById('payments-note');
  if (noteEl) noteEl.textContent = pay.note || '—';

  // Payment doughnut — by_type for distribution
  if (byType.length) {
    new Chart(document.getElementById('paymentDoughnutChart'), {
      type: 'doughnut',
      data: {
        labels: byType.map(function(m) { return m.type + ' (' + (typeof m.pct_of_gross === 'number' ? m.pct_of_gross.toFixed(1) : '—') + '%)'; }),
        datasets: [{
          data: byType.map(function(m) { return m.transactions || 0; }),
          backgroundColor: [C.teal, C.orange, C.blue, C.green, C.purple, C.pink, C.gray, C.red],
          borderWidth: 2,
          borderColor: '#fff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: function(ctx) { return ctx.label + ': ' + fmtNum(ctx.raw) + ' txns'; } } }
        }
      }
    });
  }

  // Payment methods table — by_type with transactions, pct_of_gross, gross
  // Table header: Method | Orders | Share % | Revenue
  var tbody = document.querySelector('#paymentMethodsTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    byType.forEach(function(m) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (m.type || '—') + '</td>' +
        '<td class="text-right">' + fmtNum(m.transactions) + '</td>' +
        '<td class="text-right">' + fmtPct(m.pct_of_gross) + '</td>' +
        '<td class="text-right">' + fmtINRFull(m.gross) + '</td>';
      tbody.appendChild(tr);
    });
  }
}

// ===== 5. CUSTOMERS =====
function renderCustomers(data) {
  var cust = data.customers;
  if (!cust) return;

  var kpiHtml = '';
  kpiHtml += buildKpiCard('Total Customers', fmtNum(cust.total_customers), 'Unique buyers', 'kpi-highlight');
  kpiHtml += buildKpiCard('Repeat Rate', fmtPct(cust.repeat_rate), (cust.repeat_customers || 0) + ' repeat customers', '');
  kpiHtml += buildKpiCard('Avg LTV', fmtINRFull(cust.avg_ltv), 'Lifetime value per customer', '');
  kpiHtml += buildKpiCard('Avg Orders/Customer', typeof cust.avg_orders_per_customer === 'number' ? cust.avg_orders_per_customer.toFixed(2) : '—', '', '');
  document.getElementById('customers-kpis').innerHTML = kpiHtml;

  // Customer note
  var noteEl = document.getElementById('customers-note');
  if (noteEl) noteEl.textContent = cust.note || '—';

  // Order frequency chart
  var freq = cust.frequency_distribution || [];
  if (freq.length) {
    new Chart(document.getElementById('orderFreqChart'), {
      type: 'bar',
      data: {
        labels: freq.map(function(f) { return f.orders + ' order' + (f.orders > 1 ? 's' : ''); }),
        datasets: [{
          data: freq.map(function(f) { return f.customers || 0; }),
          backgroundColor: freq.map(function(f, i) { return i === 0 ? C.gray : i < 2 ? C.teal : C.green; }),
          barPercentage: 0.55,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx) { return fmtNum(ctx.raw) + ' customers'; } } }
        },
        scales: {
          y: { ticks: { callback: function(v) { return fmtNum(v); } } }
        }
      }
    });
  }

  // Marketing opt-in chart
  var optIn = cust.marketing_opt_in || 0;
  var totalCust = cust.total_customers || 1;
  var optOut = totalCust - optIn;
  var optInRate = typeof cust.marketing_opt_in_rate === 'number' ? cust.marketing_opt_in_rate : 0;

  new Chart(document.getElementById('optInChart'), {
    type: 'doughnut',
    data: {
      labels: ['Opted In (' + optInRate + '%)', 'Not Opted (' + (100 - optInRate).toFixed(1) + '%)'],
      datasets: [{
        data: [optIn, optOut],
        backgroundColor: [C.teal, C.grayLight],
        borderWidth: 2,
        borderColor: '#fff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: function(ctx) { return ctx.label + ': ' + ctx.raw + ' customers'; } } }
      }
    }
  });
}

// ===== 6. GEOGRAPHY =====
function renderGeography(data) {
  var geo = data.geography;
  if (!geo) return;

  var noteEl = document.getElementById('geography-note');
  if (noteEl) noteEl.textContent = geo.note || '—';

  // States table — JSON uses geo.states (not geo.top_states), with pct_revenue (not share)
  var states = geo.states || [];
  var stBody = document.querySelector('#geoStatesTable tbody');
  if (stBody) {
    stBody.innerHTML = '';
    states.slice(0, 15).forEach(function(s, i) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td' + (i === 0 ? ' class="font-bold"' : '') + '>' + (s.state || '—') + '</td>' +
        '<td class="text-right">' + fmtNum(s.orders) + '</td>' +
        '<td class="text-right">' + fmtINRFull(s.revenue) + '</td>' +
        '<td class="text-right font-bold">' + fmtPct(s.pct_revenue) + '</td>';
      stBody.appendChild(tr);
    });
  }

  // Cities table — JSON uses geo.cities (not geo.top_cities)
  var cities = geo.cities || [];
  var ctBody = document.querySelector('#geoCitiesTable tbody');
  if (ctBody) {
    ctBody.innerHTML = '';
    cities.slice(0, 15).forEach(function(c, i) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td' + (i === 0 ? ' class="font-bold"' : '') + '>' + (c.city || '—') + '</td>' +
        '<td class="text-right">' + fmtNum(c.orders) + '</td>' +
        '<td class="text-right">' + fmtINRFull(c.revenue) + '</td>';
      ctBody.appendChild(tr);
    });
  }
}

// ===== 7. DISCOUNTS =====
function renderDiscounts(data) {
  var disc = data.discounts;
  if (!disc) return;

  var topDiscount = (disc.top_discounts && disc.top_discounts[0]) ? disc.top_discounts[0] : null;

  var kpiHtml = '';
  kpiHtml += buildKpiCard('Total Discount Value', fmtCrL(disc.total_discount_value), 'Total discounts given', 'kpi-danger');
  kpiHtml += buildKpiCard('Discount Rate', fmtPct(disc.discount_rate), 'Of gross sales', 'kpi-warning');
  kpiHtml += buildKpiCard('Codes Used', fmtNum(disc.total_codes_used), 'Unique discount codes', '');
  kpiHtml += buildKpiCard('Top Code', topDiscount ? topDiscount.name : '—', topDiscount ? (topDiscount.orders + ' orders') : '', 'kpi-highlight', true);
  document.getElementById('discounts-kpis').innerHTML = kpiHtml;

  // Top 15 Discount Codes Table
  var topDiscounts = disc.top_discounts || [];
  var tbody = document.querySelector('#discountsTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    topDiscounts.slice(0, 15).forEach(function(d) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="font-bold">' + (d.name || '—') + '</td>' +
        '<td class="text-right">' + fmtNum(d.orders) + '</td>' +
        '<td class="text-right">' + fmtINRFull(d.applied_amount) + '</td>' +
        '<td class="text-right">' + fmtINRFull(d.gross_sales) + '</td>' +
        '<td class="text-right">' + fmtINRFull(d.avg_discount_per_order) + '</td>';
      tbody.appendChild(tr);
    });
  }

  // Insights
  var insightsEl = document.getElementById('discounts-insights');
  if (insightsEl && disc.insights && disc.insights.length) {
    insightsEl.innerHTML = '';
    disc.insights.forEach(function(ins) {
      var card = document.createElement('div');
      card.className = 'advisory-card border-orange';
      card.innerHTML =
        '<div class="advisory-icon orange">\uD83D\uDCA1</div>' +
        '<div class="advisory-content">' +
          '<div class="advisory-label orange">Insight</div>' +
          '<p>' + ins + '</p>' +
        '</div>';
      insightsEl.appendChild(card);
    });
  }
}

// ===== 8. SESSIONS =====
function renderSessions(data) {
  var sess = data.sessions;
  if (!sess) return;

  var kpiHtml = '';
  kpiHtml += buildKpiCard('Total Sessions', fmtNum(sess.total_sessions), (sess.total_visitors || 0).toLocaleString('en-IN') + ' unique visitors', 'kpi-highlight');
  kpiHtml += buildKpiCard('Avg Daily Sessions', fmtNum(sess.avg_daily_sessions), fmtNum(sess.avg_daily_visitors) + ' avg daily visitors', '');
  kpiHtml += buildKpiCard('Conversion Rate', fmtPct(sess.overall_conversion), 'Orders / Sessions', '');
  // Total orders from overview kpis — safely access
  var totalOrders = safe(data, 'overview.kpis.0.value', '—');
  kpiHtml += buildKpiCard('Total Orders', typeof totalOrders === 'number' ? fmtNum(totalOrders) : totalOrders, '', '');
  document.getElementById('sessions-kpis').innerHTML = kpiHtml;

  // Daily sessions chart (sampled)
  var daily = sess.daily_sessions || [];
  if (daily.length) {
    var sampleDates = [];
    var sampleSessions = [];
    var sampleVisitors = [];
    for (var i = 0; i < daily.length; i += 3) {
      sampleDates.push(daily[i].date.slice(5));
      sampleSessions.push(daily[i].sessions || 0);
      sampleVisitors.push(daily[i].visitors || 0);
    }

    new Chart(document.getElementById('sessionsDailyChart'), {
      type: 'line',
      data: {
        labels: sampleDates,
        datasets: [
          {
            label: 'Sessions',
            data: sampleSessions,
            borderColor: C.teal,
            backgroundColor: C.tealLight,
            fill: true,
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: 0,
          },
          {
            label: 'Visitors',
            data: sampleVisitors,
            borderColor: C.blue,
            backgroundColor: 'transparent',
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: 0,
            borderDash: [3, 2],
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + fmtNum(ctx.raw); } } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: function(v) { return fmtNum(v); } } },
          x: { ticks: { maxTicksLimit: 15, font: { size: 10 } } }
        }
      }
    });
  }

  // Monthly Conversion Table
  var convData = sess.monthly_conversion || [];
  var tbody = document.querySelector('#sessionsConvTable tbody');
  if (tbody && convData.length) {
    tbody.innerHTML = '';
    convData.forEach(function(m) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + shortMonth(m.month) + '</td>' +
        '<td class="text-right">' + fmtNum(m.sessions) + '</td>' +
        '<td class="text-right">' + fmtNum(m.orders) + '</td>' +
        '<td class="text-right font-bold">' + fmtPct(m.conversion) + '</td>';
      tbody.appendChild(tr);
    });
  }
}

// ===== P&L STATEMENT =====
function renderProfitLoss(data) {
  var pl = data.profit_loss;
  if (!pl) return;

  var s = pl.summary;
  if (!s) return;

  // Period
  var periodEl = document.getElementById('pl-period');
  if (periodEl) periodEl.textContent = (pl.period || '') + ' | Stan Edition';

  // Note
  var noteEl = document.getElementById('pl-note');
  if (noteEl && pl.note) noteEl.textContent = pl.note;

  // KPIs
  var kpiHtml = '';
  kpiHtml += buildKpiCard('Net Sales', fmtCrL(s.net_sales), 'After discounts & returns', 'kpi-highlight');
  kpiHtml += buildKpiCard('Gross Profit', fmtCrL(s.gross_profit), fmtPct(s.gross_margin_pct) + ' margin', 'kpi-highlight');
  kpiHtml += buildKpiCard('EBITDA', fmtCrL(s.ebitda), fmtPct(s.ebitda_margin_pct) + ' margin', 'kpi-highlight');
  kpiHtml += buildKpiCard('COGS', fmtCrL(s.cogs), 'Cost of goods sold', 'kpi-warning');
  document.getElementById('pl-kpis').innerHTML = kpiHtml;

  // P&L Summary Table
  var tbody = document.querySelector('#plSummaryTable tbody');
  if (tbody) {
    var ns = s.net_sales || 1;
    function plRow(label, val, cls, indent, showPct) {
      var pctStr = showPct !== false ? (val / ns * 100).toFixed(1) + '%' : '';
      var prefix = indent ? '<span style="padding-left:' + (indent * 16) + 'px">' + label + '</span>' : label;
      return '<tr class="' + (cls || '') + '">' +
        '<td>' + prefix + '</td>' +
        '<td class="text-right">' + fmtINRFull(val) + '</td>' +
        '<td class="text-right">' + pctStr + '</td></tr>';
    }
    function plHeaderRow(label, val, cls, showPct) {
      var pctStr = showPct !== false ? (val / ns * 100).toFixed(1) + '%' : '';
      return '<tr class="pl-row-header ' + (cls || '') + '">' +
        '<td class="font-bold">' + label + '</td>' +
        '<td class="text-right font-bold">' + fmtINRFull(val) + '</td>' +
        '<td class="text-right font-bold">' + pctStr + '</td></tr>';
    }
    function plDivider() {
      return '<tr class="pl-divider"><td colspan="3"></td></tr>';
    }

    tbody.innerHTML = '';
    tbody.innerHTML +=
      plRow('Gross Sales', s.gross_sales, '', 0, false) +
      plRow('(\u2212) Discounts', -s.discounts, 'text-red', 1) +
      plRow('(\u2212) Returns', -s.returns, 'text-red', 1) +
      plDivider() +
      plHeaderRow('Net Sales', s.net_sales, 'pl-net') +
      plDivider() +
      plRow('(\u2212) COGS', -s.cogs, 'text-red', 1) +
      plDivider() +
      plHeaderRow('Gross Profit', s.gross_profit, 'pl-gp') +
      plDivider() +
      plRow('(\u2212) Shipping (est.)', -s.shipping, '', 1) +
      plRow('(\u2212) Payment Gateway Fees (est.)', -s.payment_gateway_fees, '', 1) +
      plRow('(\u2212) Packaging (est.)', -s.packaging, '', 1) +
      plDivider() +
      plHeaderRow('EBITDA', s.ebitda, 'pl-ebitda') +
      plDivider() +
      plHeaderRow('Net Profit (Before Tax)', s.net_profit_before_tax, s.net_profit_before_tax >= 0 ? 'pl-profit' : 'pl-loss');
  }

  // Monthly P&L Charts
  var monthly = pl.monthly || [];
  if (monthly.length) {
    var months = monthly.map(function(m) { return shortMonth(m.month); });

    // Gross Profit Chart
    new Chart(document.getElementById('plMonthlyChart'), {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Net Sales',
            data: monthly.map(function(m) { return m.net_sales || 0; }),
            backgroundColor: C.tealLight,
            borderColor: C.teal,
            borderWidth: 1,
            barPercentage: 0.7,
          },
          {
            label: 'COGS',
            data: monthly.map(function(m) { return m.cogs || 0; }),
            backgroundColor: C.redLight,
            borderColor: C.red,
            borderWidth: 1,
            barPercentage: 0.7,
          },
          {
            label: 'Gross Profit',
            type: 'line',
            data: monthly.map(function(m) { return m.gross_profit || 0; }),
            borderColor: C.green,
            backgroundColor: 'transparent',
            tension: 0.35,
            borderWidth: 2.5,
            pointBackgroundColor: C.green,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + fmtINR(ctx.raw); } } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: function(v) { return fmtINR(v); } } }
        }
      }
    });

    // EBITDA Margin Chart
    new Chart(document.getElementById('plEbitdaChart'), {
      type: 'line',
      data: {
        labels: months,
        datasets: [
          {
            label: 'Gross Margin %',
            data: monthly.map(function(m) { return m.gross_margin_pct || 0; }),
            borderColor: C.teal,
            backgroundColor: C.tealLight,
            fill: true,
            tension: 0.35,
            borderWidth: 2,
          },
          {
            label: 'EBITDA Margin %',
            data: monthly.map(function(m) { return m.ebitda_margin_pct || 0; }),
            borderColor: C.green,
            backgroundColor: 'rgba(16,185,129,0.08)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            borderDash: [4, 3],
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + ctx.raw.toFixed(1) + '%'; } } }
        },
        scales: {
          y: { min: 0, max: 100, ticks: { callback: function(v) { return v + '%'; } } }
        }
      }
    });
  }

  // Category Margin Chart
  var cats = pl.by_category || [];
  if (cats.length) {
    var catColors = [C.teal, C.blue, C.orange, C.purple, C.pink, C.green, C.gray];
    new Chart(document.getElementById('plCategoryChart'), {
      type: 'bar',
      data: {
        labels: cats.map(function(c) { return c.category; }),
        datasets: [
          {
            label: 'Revenue',
            data: cats.map(function(c) { return c.revenue || 0; }),
            backgroundColor: catColors.map(function(c) { return c + '40'; }),
            borderColor: catColors,
            borderWidth: 1,
          },
          {
            label: 'COGS',
            data: cats.map(function(c) { return c.cogs || 0; }),
            backgroundColor: C.redLight,
            borderColor: C.red,
            borderWidth: 1,
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: { callbacks: { label: function(ctx) { return ctx.dataset.label + ': ' + fmtCrL(ctx.raw); } } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: function(v) { return fmtINR(v); } } }
        }
      }
    });

    // Category Table
    var ctbody = document.querySelector('#plCategoryTable tbody');
    if (ctbody) {
      ctbody.innerHTML = '';
      cats.forEach(function(c) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td class="font-bold">' + c.category + '</td>' +
          '<td class="text-right">' + fmtINRFull(c.revenue) + '</td>' +
          '<td class="text-right">' + fmtINRFull(c.cogs) + '</td>' +
          '<td class="text-right">' + fmtINRFull(c.gross_profit) + '</td>' +
          '<td class="text-right font-bold">' + fmtPct(c.gross_margin_pct) + '</td>';
        ctbody.appendChild(tr);
      });
    }
  }

  // Monthly P&L Table
  if (monthly.length) {
    var mtbody = document.querySelector('#plMonthlyTable tbody');
    if (mtbody) {
      mtbody.innerHTML = '';
      monthly.forEach(function(m) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' + shortMonth(m.month) + '</td>' +
          '<td class="text-right">' + fmtINRFull(m.net_sales) + '</td>' +
          '<td class="text-right">' + fmtINRFull(m.cogs) + '</td>' +
          '<td class="text-right">' + fmtINRFull(m.gross_profit) + '</td>' +
          '<td class="text-right font-bold">' + fmtPct(m.gross_margin_pct) + '</td>' +
          '<td class="text-right">' + fmtINRFull(m.total_opex) + '</td>' +
          '<td class="text-right">' + fmtINRFull(m.ebitda) + '</td>' +
          '<td class="text-right font-bold">' + fmtPct(m.ebitda_margin_pct) + '</td>';
        mtbody.appendChild(tr);
      });
      // Add total row
      var totNet = monthly.reduce(function(s, m) { return s + (m.net_sales || 0); }, 0);
      var totCogs = monthly.reduce(function(s, m) { return s + (m.cogs || 0); }, 0);
      var totGP = monthly.reduce(function(s, m) { return s + (m.gross_profit || 0); }, 0);
      var totOpex = monthly.reduce(function(s, m) { return s + (m.total_opex || 0); }, 0);
      var totEbitda = monthly.reduce(function(s, m) { return s + (m.ebitda || 0); }, 0);
      var totTr = document.createElement('tr');
      totTr.className = 'pl-total-row';
      totTr.innerHTML =
        '<td class="font-bold">Total</td>' +
        '<td class="text-right font-bold">' + fmtINRFull(totNet) + '</td>' +
        '<td class="text-right font-bold">' + fmtINRFull(totCogs) + '</td>' +
        '<td class="text-right font-bold">' + fmtINRFull(totGP) + '</td>' +
        '<td class="text-right font-bold">' + (totNet > 0 ? fmtPct(totGP / totNet * 100) : '—') + '</td>' +
        '<td class="text-right font-bold">' + fmtINRFull(totOpex) + '</td>' +
        '<td class="text-right font-bold">' + fmtINRFull(totEbitda) + '</td>' +
        '<td class="text-right font-bold">' + (totNet > 0 ? fmtPct(totEbitda / totNet * 100) : '—') + '</td>';
      mtbody.appendChild(totTr);
    }
  }
}

// ===== 9. FY24-25 P&L =====
function renderFY24(data) {
  var fy = data.fy24_pl;
  if (!fy) return;

  var noteEl = document.getElementById('fy24-note');
  if (noteEl) noteEl.textContent = fy.note || '—';

  var bd = fy.breakdown || {};
  var marketing = bd.marketing || {};
  var production = bd.production || {};
  var tech = bd.tech || {};
  var misc = bd.miscellaneous || {};

  var kpiHtml = '';
  kpiHtml += buildKpiCard('Total Pre-Launch Spend', fmtCrL(fy.total_cost), fy.period || '', 'kpi-danger');
  kpiHtml += buildKpiCard('Marketing', fmtCrL(marketing.total), 'Meta Ads + Shoots + SEO', 'kpi-warning');
  kpiHtml += buildKpiCard('Production', fmtCrL(production.total), 'Product development', '');
  kpiHtml += buildKpiCard('Tech + Misc', fmtCrL((tech.total || 0) + (misc.total || 0)), 'Tech: ' + fmtCrL(tech.total) + ' | Misc: ' + fmtCrL(misc.total), '');
  document.getElementById('fy24-kpis').innerHTML = kpiHtml;

  // Monthly Meta Ads chart
  var metaAds = fy.monthly_meta_ads || [];
  if (metaAds.length) {
    var metaMonths = metaAds.map(function(m) { return m.month; });
    var metaSpend = metaAds.map(function(m) { return m.spend || 0; });

    new Chart(document.getElementById('fy24MetaChart'), {
      type: 'bar',
      data: {
        labels: metaMonths,
        datasets: [{
          label: 'Meta Ads Spend',
          data: metaSpend,
          backgroundColor: metaSpend.map(function(v) { return v > 0 ? C.blue : C.grayLight; }),
          barPercentage: 0.6,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: function(ctx) { return fmtINRFull(ctx.raw); } } }
        },
        scales: {
          y: { beginAtZero: true, ticks: { callback: function(v) { return fmtINR(v); } } }
        }
      }
    });
  }

  // Cost breakdown doughnut
  var breakdownLabels = ['Marketing', 'Production', 'Tech', 'Miscellaneous'];
  var breakdownData = [marketing.total || 0, production.total || 0, tech.total || 0, misc.total || 0];

  new Chart(document.getElementById('fy24BreakdownChart'), {
    type: 'doughnut',
    data: {
      labels: breakdownLabels.map(function(l, i) { return l + ' (' + fmtCrL(breakdownData[i]) + ')'; }),
      datasets: [{
        data: breakdownData,
        backgroundColor: [C.blue, C.teal, C.purple, C.gray],
        borderWidth: 2,
        borderColor: '#fff',
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: function(ctx) { return ctx.label + ': ' + fmtINRFull(ctx.raw); } } }
      }
    }
  });

  // Insights
  var insightsEl = document.getElementById('fy24-insights');
  if (insightsEl && fy.insights && fy.insights.length) {
    insightsEl.innerHTML = '';
    fy.insights.forEach(function(ins) {
      var card = document.createElement('div');
      card.className = 'advisory-card border-teal';
      card.innerHTML =
        '<div class="advisory-icon teal">\uD83D\uDCA1</div>' +
        '<div class="advisory-content">' +
          '<div class="advisory-label teal">Insight</div>' +
          '<p>' + ins + '</p>' +
        '</div>';
      insightsEl.appendChild(card);
    });
  }
}

// ===== 10. INTELLIGENCE =====
function renderIntelligence(data) {
  var intel = data.intelligence;
  if (!intel) return;

  // Funnel
  var funnel = intel.funnel;
  var funnelEl = document.getElementById('intelFunnel');
  if (funnelEl && funnel) {
    var stages = [
      { label: 'Sessions', value: fmtNum(funnel.sessions) },
      { label: 'Orders', value: fmtNum(funnel.orders) },
      { label: 'Gross Sales', value: fmtCrL(funnel.gross_sales) },
      { label: 'Discounts Given', value: '-' + fmtCrL(funnel.discounts_given) },
      { label: 'Returns', value: '-' + fmtCrL(funnel.returns) },
      { label: 'Net Sales', value: fmtCrL(funnel.net_sales) },
    ];

    var html = '<div class="funnel-stages">';
    stages.forEach(function(stage, i) {
      var widthPct = 100 - (i * 14);
      html += '<div class="funnel-stage" style="width:' + widthPct + '%">' +
        '<div class="funnel-stage-bar">' +
          '<span class="funnel-stage-label">' + stage.label + '</span>' +
          '<span class="funnel-stage-value">' + stage.value + '</span>' +
        '</div></div>';
      if (i === 0) {
        html += '<div class="funnel-dropoff"><span class="funnel-drop-arrow">\u2193</span><span class="funnel-drop-text">' + fmtPct(funnel.conversion_rate) + ' conversion rate</span></div>';
      }
    });
    html += '</div>';
    if (funnel.note) {
      html += '<div style="font-size:12px;color:#6b7280;margin-top:12px;text-align:center;">' + funnel.note + '</div>';
    }
    funnelEl.innerHTML = html;
  }

  // Unit Economics — handle STRING values like "PENDING — need COGS data"
  var ue = intel.unit_economics;
  var ueGrid = document.getElementById('unitEconGrid');
  if (ueGrid && ue) {
    // Helper: format value that might be string or number
    function fmtUE(val, label) {
      if (val === null || val === undefined) return '—';
      if (typeof val === 'string') return val; // "PENDING" etc
      return fmtINRFull(val);
    }

    var items = [
      { label: 'Avg Order Value', value: fmtUE(ue.avg_order_value), sub: 'Before discounts' },
      { label: 'Avg Discount/Order', value: fmtUE(ue.avg_discount_per_order), sub: 'Discount per order', cls: 'text-orange' },
      { label: 'Avg Net/Order', value: fmtUE(ue.avg_net_per_order), sub: 'After discount + returns', cls: 'text-teal' },
      { label: 'COGS/Order', value: fmtUE(ue.cogs_per_order), sub: 'Cost of goods', cls: typeof ue.cogs_per_order === 'string' ? 'text-orange' : '' },
      { label: 'Shipping/Order', value: fmtUE(ue.shipping_per_order), sub: 'Estimated shipping', cls: typeof ue.shipping_per_order === 'string' ? 'text-orange' : '' },
      { label: 'Contribution Margin', value: fmtUE(ue.contribution_margin), sub: 'Net after all costs', cls: typeof ue.contribution_margin === 'string' ? 'text-orange' : '' },
    ];

    ueGrid.innerHTML = '';
    items.forEach(function(item) {
      ueGrid.innerHTML += '<div class="unit-econ-card">' +
        '<div class="unit-econ-label">' + item.label + '</div>' +
        '<div class="unit-econ-value ' + (item.cls || '') + '">' + item.value + '</div>' +
        '<div class="unit-econ-sub">' + item.sub + '</div>' +
      '</div>';
    });
  }

  // COD Risk
  var cod = intel.cod_risk;
  var codCard = document.getElementById('codRiskCard');
  if (codCard && cod) {
    codCard.innerHTML =
      '<div class="intel-stat-row"><span>COD Share</span><strong class="text-orange">' + fmtPct(cod.cod_share) + '</strong></div>' +
      '<div class="intel-stat-row"><span>PPCOD Share</span><strong>' + fmtPct(cod.ppcod_share) + '</strong></div>' +
      '<div class="intel-stat-row"><span>Total COD Exposure</span><strong class="text-red">' + fmtPct(cod.total_cod_exposure) + '</strong></div>' +
      '<div class="intel-signal-text mt-16">' + (cod.note || '') + '</div>';
  }

  // Discount Dependency
  var dd = intel.discount_dependency;
  var ddCard = document.getElementById('discountDependencyCard');
  if (ddCard && dd) {
    ddCard.innerHTML =
      '<div class="intel-stat-row"><span>Overall Discount Rate</span><strong class="text-orange">' + fmtPct(dd.discount_rate) + '</strong></div>' +
      '<div class="intel-stat-row"><span>FIRST15 Share of Orders</span><strong>' + fmtPct(dd.first15_share) + '</strong></div>' +
      '<div class="intel-signal-text mt-16">\u26A0 ' + (dd.alert || '') + '</div>';
  }

  // Product Concentration
  var pc = intel.product_concentration;
  var pcCard = document.getElementById('productConcentrationCard');
  if (pcCard && pc) {
    pcCard.innerHTML =
      '<div class="intel-stat-row"><span>Top Product</span><strong>' + (pc.top_product || '—') + '</strong></div>' +
      '<div class="intel-stat-row"><span>Top Product Share</span><strong class="text-orange">' + fmtPct(pc.top_product_share) + '</strong></div>' +
      '<div class="intel-stat-row"><span>Top 3 Products Share</span><strong>' + fmtPct(pc.top3_share) + '</strong></div>' +
      '<div class="intel-signal-text mt-16">\u26A0 ' + (pc.alert || '') + '</div>';
  }
}

// ===== 11. ADVISORY =====
function renderAdvisory(data) {
  var adv = data.advisory;
  if (!adv) return;

  var container = document.getElementById('advisoryContainer');
  if (!container) return;
  container.innerHTML = '';

  // Helper to render a category
  function renderCategory(items, label, emoji, colorClass, badgeText) {
    if (!items || !items.length) return;
    container.innerHTML += '<h2 style="margin:24px 0 16px;color:var(--' + colorClass + ');font-size:16px;font-weight:700;">' + emoji + ' ' + label + '</h2>';
    items.forEach(function(item, i) {
      container.innerHTML +=
        '<div class="insight-card border-' + colorClass + '">' +
          '<div class="insight-number ' + colorClass + '">' + (i + 1) + '</div>' +
          '<div class="insight-content">' +
            '<div class="insight-header"><span class="insight-title">' + (item.title || '') + '</span><span class="badge badge-' + colorClass + '">' + badgeText + '</span></div>' +
            '<div class="insight-body">' + (item.detail || '') + '</div>' +
            (item.action ? '<div class="insight-action" style="margin-top:8px;font-size:13px;color:var(--' + colorClass + ');font-weight:600;">\u2192 ' + item.action + '</div>' : '') +
          '</div>' +
        '</div>';
    });
  }

  renderCategory(adv.critical, 'Critical', '\uD83D\uDEA8', 'red', 'CRITICAL');
  renderCategory(adv.warnings, 'Warnings', '\u26A0', 'orange', 'WARNING');
  renderCategory(adv.opportunities, 'Opportunities', '\u2705', 'green', 'OPPORTUNITY');
}

// ===== 12. DATA STATUS =====
function renderDataStatus(data) {
  var ds = data.data_status;
  if (!ds) return;

  // Available data table
  // JSON: { source, period, records, status }
  // HTML thead: Data Source | Source | Period | Records
  // Map: col1="source" (as data source name), col2=status, col3=period, col4=records
  var availItems = ds.available || [];
  var availBody = document.querySelector('#dataAvailableTable tbody');
  if (availBody) {
    availBody.innerHTML = '';
    availItems.forEach(function(item) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span class="status-dot green" style="display:inline-block;vertical-align:middle;margin-right:8px;"></span>' + (item.source || '—') + '</td>' +
        '<td>' + (item.status || '—') + '</td>' +
        '<td>' + (item.period || '—') + '</td>' +
        '<td class="text-right">' + (item.records || '—') + '</td>';
      availBody.appendChild(tr);
    });
  }

  // Pending data table
  // JSON: { source, period, priority }
  // HTML thead: Data Item | Priority | Note
  // Map: col1=source, col2=priority badge, col3=period (as note)
  var pendItems = ds.pending || [];
  var pendBody = document.querySelector('#dataPendingTable tbody');
  if (pendBody) {
    pendBody.innerHTML = '';
    pendItems.forEach(function(item) {
      var priority = item.priority || 'MEDIUM';
      var prClass = priority === 'CRITICAL' ? 'critical' :
                    priority === 'HIGH' ? 'high' :
                    priority === 'MEDIUM' ? 'medium' : 'low';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (item.source || '—') + '</td>' +
        '<td><span class="priority-badge ' + prClass + '">' + priority + '</span></td>' +
        '<td>' + (item.period || '—') + '</td>';
      pendBody.appendChild(tr);
    });
  }
}

// ===== UPLOAD DATA — UI Logic =====
(function() {
  var dropzone = document.getElementById('uploadDropzone');
  var fileInput = document.getElementById('uploadFileInput');
  var fileList = document.getElementById('uploadFileList');
  var fileName = document.getElementById('uploadFileName');
  var fileRemove = document.getElementById('uploadFileRemove');
  var uploadBtn = document.getElementById('uploadBtn');
  var uploadType = document.getElementById('uploadType');
  var uploadStatus = document.getElementById('uploadStatus');
  var selectedFile = null;

  if (!dropzone) return;

  // Drag & drop
  dropzone.addEventListener('dragover', function(e) {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  });
  dropzone.addEventListener('drop', function(e) {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    var files = e.dataTransfer.files;
    if (files.length > 0) selectFile(files[0]);
  });

  // Click to browse
  dropzone.addEventListener('click', function() { fileInput.click(); });
  fileInput.addEventListener('change', function() {
    if (fileInput.files.length > 0) selectFile(fileInput.files[0]);
  });

  // Remove file
  fileRemove.addEventListener('click', function() {
    selectedFile = null;
    fileList.style.display = 'none';
    uploadBtn.disabled = true;
    fileInput.value = '';
  });

  function selectFile(file) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      showStatus('error', 'Only CSV files are supported. Please select a .csv file.');
      return;
    }
    selectedFile = file;
    fileName.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
    fileList.style.display = 'block';
    uploadBtn.disabled = false;
    uploadStatus.style.display = 'none';
  }

  // Upload
  uploadBtn.addEventListener('click', function() {
    if (!selectedFile) return;
    var token = window.AIA && window.AIA.Session.getToken();
    if (!token) { window.location.href = 'login.html'; return; }

    uploadBtn.disabled = true;
    showStatus('processing', 'Reading file and uploading...');

    var reader = new FileReader();
    reader.onload = function(e) {
      var csvData = e.target.result;
      var type = uploadType.value;

      fetch(API_BASE + '/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ csvData: csvData, type: type, filename: selectedFile.name })
      })
      .then(function(res) {
        if (res.status === 401) { window.location.href = 'login.html'; throw new Error('Unauthorized'); }
        return res.json();
      })
      .then(function(data) {
        if (data.success) {
          showStatus('success', 'Upload successful! Processed ' + data.summary.rows_processed + ' rows (' + data.summary.type + '). Dashboard is refreshing...');
          selectedFile = null;
          fileList.style.display = 'none';
          fileInput.value = '';
          // Refresh dashboard data
          fetchDashboardData();
          // Refresh upload history
          loadUploadHistory();
        } else {
          showStatus('error', 'Upload failed: ' + (data.error || 'Unknown error'));
          uploadBtn.disabled = false;
        }
      })
      .catch(function(err) {
        if (err.message !== 'Unauthorized') {
          showStatus('error', 'Upload failed: ' + err.message);
          uploadBtn.disabled = false;
        }
      });
    };
    reader.onerror = function() {
      showStatus('error', 'Failed to read file.');
      uploadBtn.disabled = false;
    };
    reader.readAsText(selectedFile);
  });

  function showStatus(type, message) {
    uploadStatus.style.display = 'block';
    uploadStatus.className = 'upload-status ' + type;
    uploadStatus.textContent = message;
  }

  // Load upload history
  function loadUploadHistory() {
    var token = window.AIA && window.AIA.Session.getToken();
    if (!token) return;
    var historyEl = document.getElementById('uploadHistoryList');
    if (!historyEl) return;

    fetch(API_BASE + '/api/upload-history', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (!data.success || !data.history || data.history.length === 0) {
        historyEl.innerHTML = '<p style="font-size:13px;color:#9ca3af;">No uploads yet.</p>';
        return;
      }
      var html = '<table class="upload-history-table"><thead><tr><th>Date</th><th>Uploaded By</th><th>Source</th></tr></thead><tbody>';
      data.history.forEach(function(h) {
        var date = new Date(h.created_at);
        var dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        html += '<tr><td>' + dateStr + '</td><td>' + (h.uploaded_by || '—') + '</td><td>' + (h.upload_source || '—') + '</td></tr>';
      });
      html += '</tbody></table>';
      historyEl.innerHTML = html;
    })
    .catch(function() {
      historyEl.innerHTML = '<p style="font-size:13px;color:#9ca3af;">Could not load history.</p>';
    });
  }

  // Load history on page load (with slight delay)
  setTimeout(loadUploadHistory, 1500);
})();

// ===== CHATBOT — Client-side Logic =====
(function() {
  var widget = document.getElementById('chatWidget');
  var toggleBtn = document.getElementById('chatToggleBtn');
  var minimizeBtn = document.getElementById('chatMinimize');
  var messagesEl = document.getElementById('chatMessages');
  var inputEl = document.getElementById('chatInput');
  var sendBtn = document.getElementById('chatSend');
  var suggestionsEl = document.getElementById('chatSuggestions');

  if (!widget || !toggleBtn) return;

  // Toggle widget
  toggleBtn.addEventListener('click', function() {
    widget.classList.toggle('open');
    toggleBtn.classList.toggle('hidden');
    if (widget.classList.contains('open')) {
      inputEl.focus();
    }
  });

  minimizeBtn.addEventListener('click', function() {
    widget.classList.remove('open');
    toggleBtn.classList.remove('hidden');
  });

  // Suggestion chips
  var chips = document.querySelectorAll('.chat-chip');
  chips.forEach(function(chip) {
    chip.addEventListener('click', function() {
      var msg = chip.getAttribute('data-msg');
      if (msg) sendMessage(msg);
    });
  });

  // Send on Enter
  inputEl.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); sendMessage(inputEl.value); }
  });

  // Send on click
  sendBtn.addEventListener('click', function() { sendMessage(inputEl.value); });

  function sendMessage(text) {
    text = (text || '').trim();
    if (!text) return;
    inputEl.value = '';

    // Add user message
    addMessage(text, 'user');

    // Hide suggestions after first message
    if (suggestionsEl) suggestionsEl.style.display = 'none';

    // Show typing indicator
    var typingEl = addMessage('Thinking...', 'typing');

    // Try client-side first
    var data = window._dashData;
    if (data) {
      setTimeout(function() {
        var reply = chatbotRespond(text, data);
        typingEl.remove();
        addMessage(reply, 'bot');
      }, 300 + Math.random() * 400);
    } else {
      // Fallback to server
      var token = window.AIA && window.AIA.Session.getToken();
      fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      })
      .then(function(res) { return res.json(); })
      .then(function(resp) {
        typingEl.remove();
        addMessage(resp.reply || 'Sorry, I could not process that.', 'bot');
      })
      .catch(function() {
        typingEl.remove();
        addMessage('Sorry, something went wrong. Please try again.', 'bot');
      });
    }
  }

  function addMessage(text, type) {
    var div = document.createElement('div');
    div.className = 'chat-msg ' + type;
    div.innerHTML = '<div class="chat-msg-content">' + escapeHtml(text) + '</div>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  // ===== Client-side chatbot response engine =====
  function chatbotRespond(message, data) {
    var msg = message.toLowerCase().trim();

    // Greeting
    if (msg.match(/^(hi|hello|hey|good morning|good afternoon|good evening)/)) {
      return "Hello! I'm your CFO Assistant for Stan Edition. I can help with revenue, products, customers, payments, geography, discounts, sessions, margins, and risks. What would you like to know?";
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
      var lines = top5.map(function(p, i) { return (i + 1) + '. ' + p.name + ' \u2014 ' + fmtINRFull(p.gross_sales) + ' (' + (p.share_of_gross || 0).toFixed(1) + '% share)'; });
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
      var reply = 'Top 5 states by revenue:\n' + states.map(function(s, i) { return (i + 1) + '. ' + s.state + ' \u2014 ' + fmtINRFull(s.revenue) + ' (' + fmtPct(s.pct_revenue) + ')'; }).join('\n');
      var cities = (geo.cities || []).slice(0, 5);
      if (cities.length > 0) {
        reply += '\n\nTop 5 cities:\n' + cities.map(function(c, i) { return (i + 1) + '. ' + c.city + ' \u2014 ' + fmtNum(c.orders) + ' orders'; }).join('\n');
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
    if (msg.match(/margin|profit|cogs|cost|unit economic|contribution|p.?l|ebitda/)) {
      var pl = data.profit_loss;
      if (pl && pl.summary) {
        var s = pl.summary;
        return 'P&L Summary (' + (pl.period || '') + '):\n' +
          '\u2022 Gross Sales: ' + fmtCrL(s.gross_sales) + '\n' +
          '\u2022 Net Sales: ' + fmtCrL(s.net_sales) + '\n' +
          '\u2022 COGS: ' + fmtCrL(s.cogs) + '\n' +
          '\u2022 Gross Profit: ' + fmtCrL(s.gross_profit) + ' (' + fmtPct(s.gross_margin_pct) + ' margin)\n' +
          '\u2022 EBITDA: ' + fmtCrL(s.ebitda) + ' (' + fmtPct(s.ebitda_margin_pct) + ' margin)\n' +
          '\u2022 Net Profit (pre-tax): ' + fmtCrL(s.net_profit_before_tax) + '\n\n' +
          'Category margins: ' + (pl.by_category || []).map(function(c) { return c.category + ' ' + fmtPct(c.gross_margin_pct); }).join(', ');
      }
      var intel = data.intelligence;
      if (intel && intel.unit_economics) {
        var ue = intel.unit_economics;
        return 'Unit economics: AOV ' + (typeof ue.avg_order_value === 'number' ? fmtINRFull(ue.avg_order_value) : ue.avg_order_value) +
          ', COGS/order ' + (typeof ue.cogs_per_order === 'number' ? fmtINRFull(ue.cogs_per_order) : ue.cogs_per_order) +
          ', Contribution margin ' + (typeof ue.contribution_margin === 'number' ? fmtINRFull(ue.contribution_margin) : ue.contribution_margin) + '.';
      }
      return 'P&L data is being compiled. COGS per unit: Linen Shirts \u20B91,450, Linen Pants \u20B91,380, T-Shirts \u20B9420, Oxford \u20B9800.';
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
      if (adv.opportunities) {
        adv.opportunities.slice(0, 2).forEach(function(o) { items.push('\u2705 OPPORTUNITY: ' + o.title); });
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
      var orderGrowth = prev.orders > 0 ? (((last.orders - prev.orders) / prev.orders) * 100).toFixed(1) : '\u2014';
      var revenueGrowth = prev.gross_sales > 0 ? (((last.gross_sales - prev.gross_sales) / prev.gross_sales) * 100).toFixed(1) : '\u2014';
      return 'Latest month: ' + fmtNum(last.orders) + ' orders, ' + fmtCrL(last.gross_sales) + ' gross sales.\nMoM growth: Orders ' + orderGrowth + '%, Revenue ' + revenueGrowth + '%.';
    }

    // AOV / average order value
    if (msg.match(/aov|average order|order value/)) {
      var kpis = data.overview && data.overview.kpis;
      if (!kpis) return 'KPI data is not available yet.';
      var aovKpi = kpis.find(function(k) { return k.label === 'Avg Order Value'; });
      return 'Average Order Value: ' + fmtCrL(aovKpi ? aovKpi.value : 0) + '. This reflects the average gross sale per order before discounts and returns.';
    }

    // Total orders
    if (msg.match(/how many order|total order|order count|order volume/)) {
      var kpis = data.overview && data.overview.kpis;
      if (!kpis) return 'KPI data is not available yet.';
      var orderKpi = kpis.find(function(k) { return k.label === 'Total Orders'; });
      return 'Total orders: ' + fmtNum(orderKpi ? orderKpi.value : 0) + ' (' + (data.period || '') + ').';
    }

    // Pre-launch spend
    if (msg.match(/pre.?launch|fy24|fy 24/)) {
      var fy = data.fy24_pl;
      if (!fy) return 'FY24-25 pre-launch data is not loaded in this dashboard. The current P&L covers FY25-26 (Apr 2025 - Feb 2026).';
      return 'FY24-25 pre-launch spend: ' + fmtCrL(fy.total_cost) + '. Note: This is excluded from the current P&L which covers FY25-26 only.';
    }

    // Summary / overview
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

    // Product concentration
    if (msg.match(/concentration|diversif/)) {
      var intel = data.intelligence;
      if (!intel || !intel.product_concentration) return 'Product concentration data is not available.';
      var pc = intel.product_concentration;
      return 'Product Concentration: Top product (' + (pc.top_product || '\u2014') + ') holds ' + fmtPct(pc.top_product_share) + ' share. Top 3 products: ' + fmtPct(pc.top3_share) + '. ' + (pc.alert || '');
    }

    // SKUs / categories
    if (msg.match(/sku|categor|how many product/)) {
      var prod = data.products;
      if (!prod) return 'Product data is not available yet.';
      var cats = prod.categories || [];
      return 'Total SKUs: ' + fmtNum(prod.total_skus) + '. Categories: ' + cats.map(function(c) { return c.category; }).join(', ') + '.';
    }

    // Help
    if (msg.match(/help|what can you|what do you|capability/)) {
      return "I can help with:\n\u2022 Revenue & sales analysis\n\u2022 Top products & categories\n\u2022 Customer metrics & retention\n\u2022 Payment method breakdown\n\u2022 Geographic distribution\n\u2022 Discount analysis\n\u2022 Session & traffic data\n\u2022 P&L, margins & unit economics\n\u2022 Risk & advisory insights\n\u2022 Monthly trends & growth\n\nTry: \"What's the revenue?\" or \"Top products\" or \"Show me risks\"";
    }

    // Default
    return "I can help with: revenue, products, customers, payments, geography, discounts, sessions, margins, trends, risks, and more. Try asking something specific like \"What's the revenue?\" or \"Top products\".";
  }
})();
