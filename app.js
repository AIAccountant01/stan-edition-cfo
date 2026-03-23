// ===== AI ACCOUNTANT — STAN EDITION DASHBOARD APP ===== //
// Fetches data from /api/data and populates the entire dashboard

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
  fy24: 'FY24-25 P&L',
  intelligence: 'Intelligence',
  advisory: 'Advisory',
  datastatus: 'Data Status',
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

  fetch('/api/data', {
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
