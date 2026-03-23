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
  var abs = Math.abs(val);
  var sign = val < 0 ? '-' : '';
  if (abs >= 10000000) return sign + '\u20B9' + (abs / 10000000).toFixed(2) + ' Cr';
  if (abs >= 100000) return sign + '\u20B9' + (abs / 100000).toFixed(1) + 'L';
  if (abs >= 1000) return sign + '\u20B9' + abs.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return sign + '\u20B9' + abs.toLocaleString('en-IN');
}

function fmtINR(val) {
  if (val === null || val === undefined) return '—';
  var abs = Math.abs(val);
  var sign = val < 0 ? '-' : '';
  if (abs >= 100000) return sign + '\u20B9' + (abs / 100000).toFixed(1) + 'L';
  if (abs >= 1000) return sign + '\u20B9' + (abs / 1000).toFixed(1) + 'K';
  return sign + '\u20B9' + abs.toLocaleString('en-IN');
}

function fmtINRFull(val) {
  if (val === null || val === undefined) return '—';
  return '\u20B9' + Math.round(val).toLocaleString('en-IN');
}

function fmtNum(val) {
  if (val === null || val === undefined) return '—';
  return val.toLocaleString('en-IN');
}

function fmtPct(val) {
  if (val === null || val === undefined) return '—';
  return val.toFixed(1) + '%';
}

// Short month label from "2025-04" => "Apr '25"
function shortMonth(m) {
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var parts = m.split('-');
  return months[parseInt(parts[1], 10) - 1] + " '" + parts[0].slice(2);
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
        sec.querySelectorAll('canvas').forEach(function(c) {
          var chart = Chart.getChart(c);
          if (chart) { chart.resize(); chart.update(); }
        });
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
  });
}

// ===== RENDER DASHBOARD =====
function renderDashboard(data) {
  // Show all sections briefly for chart init
  var sections = document.querySelectorAll('.section');
  sections.forEach(function(s) { s.style.display = 'block'; });

  renderOverview(data);
  renderRevenue(data);
  renderProducts(data);
  renderPayments(data);
  renderCustomers(data);
  renderGeography(data);
  renderDiscounts(data);
  renderSessions(data);
  renderFY24(data);
  renderIntelligence(data);
  renderAdvisory(data);
  renderDataStatus(data);

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
  var kpis = ov.kpis;
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
  var trend = ov.monthly_trend;
  var months = trend.map(function(t) { return shortMonth(t.month); });
  var grossArr = trend.map(function(t) { return t.gross_sales; });
  var netArr = trend.map(function(t) { return t.net_sales; });
  var discArr = trend.map(function(t) { return t.discounts; });

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
  var ordersArr = trend.map(function(t) { return t.orders; });
  var sessionsArr = trend.map(function(t) { return t.sessions; });

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

  var kpiHtml = '';
  kpiHtml += buildKpiCard('Gross Sales', fmtCrL(rev.total_gross), 'Total before discounts/returns', 'kpi-highlight');
  kpiHtml += buildKpiCard('Net Sales', fmtCrL(rev.total_net), 'After discounts & returns', 'kpi-highlight');
  kpiHtml += buildKpiCard('Discount Rate', fmtPct(rev.discount_rate), fmtCrL(rev.total_discounts) + ' total discounts', 'kpi-warning');
  kpiHtml += buildKpiCard('Return Rate', fmtPct(rev.return_rate), fmtCrL(rev.total_returns) + ' total returns', '');
  document.getElementById('revenue-kpis').innerHTML = kpiHtml;

  // Channel note
  document.getElementById('revenue-channelNote').textContent = rev.channel_note;

  // Daily Sales Chart (sampled for performance — every 3rd day)
  var daily = rev.daily_sales;
  var sampleDays = [];
  var sampleGross = [];
  var sampleNet = [];
  for (var i = 0; i < daily.length; i += 3) {
    sampleDays.push(daily[i].date.slice(5)); // MM-DD
    sampleGross.push(daily[i].gross_sales);
    sampleNet.push(daily[i].net_sales);
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

  // Monthly Revenue Table
  var trend = ov.monthly_trend;
  var tbody = document.querySelector('#revenueMonthlyTable tbody');
  if (tbody) {
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
  var cats = prod.categories;

  // KPIs
  var topProduct = prod.products[0];
  var topShare = topProduct ? topProduct.share_of_gross.toFixed(1) + '%' : '—';
  var totalUnits = prod.products.reduce(function(s, p) { return s + p.units_sold; }, 0);

  var kpiHtml = '';
  kpiHtml += buildKpiCard('Total SKUs', fmtNum(prod.total_skus), 'Active products', '');
  kpiHtml += buildKpiCard('Total Units Sold', fmtNum(totalUnits), 'Across all products', '');
  kpiHtml += buildKpiCard('Top Product Share', topShare, topProduct ? topProduct.name.slice(0, 30) : '', 'kpi-warning');
  kpiHtml += buildKpiCard('Categories', cats.length.toString(), cats.map(function(c) { return c.category; }).join(', '), '');
  document.getElementById('products-kpis').innerHTML = kpiHtml;

  // Category doughnut
  new Chart(document.getElementById('productCategoryChart'), {
    type: 'doughnut',
    data: {
      labels: cats.map(function(c) { return c.category + ' (' + c.share + '%)'; }),
      datasets: [{
        data: cats.map(function(c) { return c.gross_sales; }),
        backgroundColor: [C.teal, C.blue, C.orange, C.purple, C.pink],
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
  document.getElementById('products-concentrationSub').textContent =
    'Top product: ' + risk.top_product + ' — ' + risk.top_product_share.toFixed(1) + '% of gross';
  document.getElementById('products-concentration-alert').innerHTML =
    '<div class="concentration-alert"><div class="alert-title">⚠ Concentration Risk</div><div class="alert-body">' + risk.alert + '</div></div>';

  // Top 20 Products Table
  var tbody = document.querySelector('#productsTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    prod.products.slice(0, 20).forEach(function(p, i) {
      var asp = p.units_sold > 0 ? Math.round(p.gross_sales / p.units_sold) : 0;
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td' + (i === 0 ? ' class="font-bold"' : '') + '>' + p.name + '</td>' +
        '<td class="text-right">' + fmtNum(p.units_sold) + '</td>' +
        '<td class="text-right">' + fmtINRFull(p.gross_sales) + '</td>' +
        '<td class="text-right">' + fmtINRFull(p.discounts) + '</td>' +
        '<td class="text-right">' + fmtINRFull(p.returns) + '</td>' +
        '<td class="text-right">' + fmtINRFull(p.net_sales) + '</td>' +
        '<td class="text-right">' + fmtINRFull(asp) + '</td>' +
        '<td class="text-right font-bold">' + p.share_of_gross.toFixed(1) + '%</td>';
      tbody.appendChild(tr);
    });
  }
}

// ===== 4. PAYMENTS =====
function renderPayments(data) {
  var pay = data.payments;

  var kpiHtml = '';
  kpiHtml += buildKpiCard('COD Share', fmtPct(pay.cod_share), pay.cod_orders + ' COD orders', 'kpi-warning');
  kpiHtml += buildKpiCard('Prepaid Share', fmtPct(pay.prepaid_share), pay.prepaid_orders + ' prepaid orders', 'kpi-success');
  kpiHtml += buildKpiCard('PPCOD Share', fmtPct(pay.ppcod_share), pay.ppcod_orders + ' PPCOD orders', '');
  kpiHtml += buildKpiCard('Gateway', pay.gateway, pay.total_orders_sampled + ' orders sampled', '', true);
  document.getElementById('payments-kpis').innerHTML = kpiHtml;

  // Payment note
  document.getElementById('payments-note').textContent = pay.note;

  // Payment doughnut
  var methods = pay.payment_methods;
  new Chart(document.getElementById('paymentDoughnutChart'), {
    type: 'doughnut',
    data: {
      labels: methods.map(function(m) { return m.method + ' (' + m.share + '%)'; }),
      datasets: [{
        data: methods.map(function(m) { return m.orders; }),
        backgroundColor: [C.orange, C.teal, C.blue, C.green, C.purple, C.pink, C.gray],
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
        tooltip: { callbacks: { label: function(ctx) { return ctx.label + ': ' + ctx.raw + ' orders'; } } }
      }
    }
  });

  // Payment methods table
  var tbody = document.querySelector('#paymentMethodsTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    methods.forEach(function(m) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + m.method + '</td>' +
        '<td class="text-right">' + fmtNum(m.orders) + '</td>' +
        '<td class="text-right">' + fmtPct(m.share) + '</td>' +
        '<td class="text-right">' + fmtINRFull(m.revenue) + '</td>';
      tbody.appendChild(tr);
    });
  }
}

// ===== 5. CUSTOMERS =====
function renderCustomers(data) {
  var cust = data.customers;

  var kpiHtml = '';
  kpiHtml += buildKpiCard('Total Customers', fmtNum(cust.total_customers), 'Unique buyers', 'kpi-highlight');
  kpiHtml += buildKpiCard('Repeat Rate', fmtPct(cust.repeat_rate), cust.repeat_customers + ' repeat customers', '');
  kpiHtml += buildKpiCard('Avg LTV', fmtINRFull(cust.avg_ltv), 'Lifetime value per customer', '');
  kpiHtml += buildKpiCard('Avg Orders/Customer', cust.avg_orders_per_customer.toFixed(2), '', '');
  document.getElementById('customers-kpis').innerHTML = kpiHtml;

  // Customer note
  document.getElementById('customers-note').textContent = cust.note;

  // Order frequency chart
  var freq = cust.frequency_distribution;
  new Chart(document.getElementById('orderFreqChart'), {
    type: 'bar',
    data: {
      labels: freq.map(function(f) { return f.orders + ' order' + (f.orders > 1 ? 's' : ''); }),
      datasets: [{
        data: freq.map(function(f) { return f.customers; }),
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

  // Marketing opt-in chart
  var optIn = cust.marketing_opt_in;
  var optOut = cust.total_customers - optIn;
  new Chart(document.getElementById('optInChart'), {
    type: 'doughnut',
    data: {
      labels: ['Opted In (' + cust.marketing_opt_in_rate + '%)', 'Not Opted (' + (100 - cust.marketing_opt_in_rate).toFixed(1) + '%)'],
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

  document.getElementById('geography-note').textContent = geo.note;

  // States table
  var stBody = document.querySelector('#geoStatesTable tbody');
  if (stBody) {
    stBody.innerHTML = '';
    geo.top_states.forEach(function(s, i) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td' + (i === 0 ? ' class="font-bold"' : '') + '>' + s.state + '</td>' +
        '<td class="text-right">' + fmtNum(s.orders) + '</td>' +
        '<td class="text-right">' + fmtINRFull(s.revenue) + '</td>' +
        '<td class="text-right font-bold">' + fmtPct(s.share) + '</td>';
      stBody.appendChild(tr);
    });
  }

  // Cities table
  var ctBody = document.querySelector('#geoCitiesTable tbody');
  if (ctBody) {
    ctBody.innerHTML = '';
    geo.top_cities.forEach(function(c, i) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td' + (i === 0 ? ' class="font-bold"' : '') + '>' + c.city + '</td>' +
        '<td class="text-right">' + fmtNum(c.orders) + '</td>' +
        '<td class="text-right">' + fmtINRFull(c.revenue) + '</td>';
      ctBody.appendChild(tr);
    });
  }
}

// ===== 7. DISCOUNTS =====
function renderDiscounts(data) {
  var disc = data.discounts;

  var kpiHtml = '';
  kpiHtml += buildKpiCard('Total Discount Value', fmtCrL(disc.total_discount_value), 'Total discounts given', 'kpi-danger');
  kpiHtml += buildKpiCard('Discount Rate', fmtPct(disc.discount_rate), 'Of gross sales', 'kpi-warning');
  kpiHtml += buildKpiCard('Codes Used', fmtNum(disc.total_codes_used), 'Unique discount codes', '');
  kpiHtml += buildKpiCard('Top Code', disc.top_discounts[0].name, disc.top_discounts[0].orders + ' orders', 'kpi-highlight', true);
  document.getElementById('discounts-kpis').innerHTML = kpiHtml;

  // Top 15 Discount Codes Table
  var tbody = document.querySelector('#discountsTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    disc.top_discounts.slice(0, 15).forEach(function(d) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="font-bold">' + d.name + '</td>' +
        '<td class="text-right">' + fmtNum(d.orders) + '</td>' +
        '<td class="text-right">' + fmtINRFull(d.applied_amount) + '</td>' +
        '<td class="text-right">' + fmtINRFull(d.gross_sales) + '</td>' +
        '<td class="text-right">' + fmtINRFull(d.avg_discount_per_order) + '</td>';
      tbody.appendChild(tr);
    });
  }

  // Insights
  var insightsEl = document.getElementById('discounts-insights');
  if (insightsEl && disc.insights) {
    insightsEl.innerHTML = '';
    disc.insights.forEach(function(ins) {
      var card = document.createElement('div');
      card.className = 'advisory-card border-orange';
      card.innerHTML =
        '<div class="advisory-icon orange">💡</div>' +
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

  var kpiHtml = '';
  kpiHtml += buildKpiCard('Total Sessions', fmtNum(sess.total_sessions), sess.total_visitors.toLocaleString('en-IN') + ' unique visitors', 'kpi-highlight');
  kpiHtml += buildKpiCard('Avg Daily Sessions', fmtNum(sess.avg_daily_sessions), fmtNum(sess.avg_daily_visitors) + ' avg daily visitors', '');
  kpiHtml += buildKpiCard('Conversion Rate', fmtPct(sess.overall_conversion), 'Orders / Sessions', '');
  kpiHtml += buildKpiCard('Total Orders', fmtNum(data.overview.kpis[0].value), '', '');
  document.getElementById('sessions-kpis').innerHTML = kpiHtml;

  // Daily sessions chart (sampled)
  var daily = sess.daily_sessions;
  var sampleDates = [];
  var sampleSessions = [];
  var sampleVisitors = [];
  for (var i = 0; i < daily.length; i += 3) {
    sampleDates.push(daily[i].date.slice(5));
    sampleSessions.push(daily[i].sessions);
    sampleVisitors.push(daily[i].visitors);
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

  // Monthly Conversion Table
  var tbody = document.querySelector('#sessionsConvTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    sess.monthly_conversion.forEach(function(m) {
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

  document.getElementById('fy24-note').textContent = fy.note;

  var bd = fy.breakdown;
  var kpiHtml = '';
  kpiHtml += buildKpiCard('Total Pre-Launch Spend', fmtCrL(fy.total_cost), fy.period, 'kpi-danger');
  kpiHtml += buildKpiCard('Marketing', fmtCrL(bd.marketing.total), 'Meta Ads + Shoots + SEO', 'kpi-warning');
  kpiHtml += buildKpiCard('Production', fmtCrL(bd.production.total), 'Product development', '');
  kpiHtml += buildKpiCard('Tech + Misc', fmtCrL(bd.tech.total + bd.miscellaneous.total), 'Tech: ' + fmtCrL(bd.tech.total) + ' | Misc: ' + fmtCrL(bd.miscellaneous.total), '');
  document.getElementById('fy24-kpis').innerHTML = kpiHtml;

  // Monthly Meta Ads chart
  var metaMonths = fy.monthly_meta_ads.map(function(m) { return m.month; });
  var metaSpend = fy.monthly_meta_ads.map(function(m) { return m.spend; });

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

  // Cost breakdown doughnut
  var breakdownLabels = ['Marketing', 'Production', 'Tech', 'Miscellaneous'];
  var breakdownData = [bd.marketing.total, bd.production.total, bd.tech.total, bd.miscellaneous.total];

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
  if (insightsEl && fy.insights) {
    insightsEl.innerHTML = '';
    fy.insights.forEach(function(ins) {
      var card = document.createElement('div');
      card.className = 'advisory-card border-teal';
      card.innerHTML =
        '<div class="advisory-icon teal">💡</div>' +
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

  // Funnel
  var funnel = intel.funnel;
  var funnelEl = document.getElementById('intelFunnel');
  if (funnelEl) {
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
        html += '<div class="funnel-dropoff"><span class="funnel-drop-arrow">↓</span><span class="funnel-drop-text">' + fmtPct(funnel.conversion_rate) + ' conversion rate</span></div>';
      }
    });
    html += '</div>';
    if (funnel.note) {
      html += '<div style="font-size:12px;color:#6b7280;margin-top:12px;text-align:center;">' + funnel.note + '</div>';
    }
    funnelEl.innerHTML = html;
  }

  // Unit Economics
  var ue = intel.unit_economics;
  var ueGrid = document.getElementById('unitEconGrid');
  if (ueGrid) {
    var items = [
      { label: 'Avg Order Value', value: fmtINRFull(ue.avg_order_value), sub: 'Before discounts' },
      { label: 'Avg Discount/Order', value: fmtINRFull(ue.avg_discount_per_order), sub: 'Discount per order', cls: 'text-orange' },
      { label: 'Avg Net/Order', value: fmtINRFull(ue.avg_net_per_order), sub: 'After discount + returns', cls: 'text-teal' },
      { label: 'COGS/Order (est.)', value: ue.cogs_per_order, sub: 'Cost of goods', cls: '' },
      { label: 'Shipping/Order (est.)', value: ue.shipping_per_order, sub: 'Estimated shipping', cls: '' },
      { label: 'Contribution Margin', value: ue.contribution_margin, sub: 'Net after all costs', cls: '' },
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
  if (codCard) {
    codCard.innerHTML =
      '<div class="intel-stat-row"><span>COD Share</span><strong class="text-orange">' + fmtPct(cod.cod_share) + '</strong></div>' +
      '<div class="intel-stat-row"><span>PPCOD Share</span><strong>' + fmtPct(cod.ppcod_share) + '</strong></div>' +
      '<div class="intel-stat-row"><span>Total COD Exposure</span><strong class="text-red">' + fmtPct(cod.total_cod_exposure) + '</strong></div>' +
      '<div class="intel-signal-text mt-16">' + cod.note + '</div>';
  }

  // Discount Dependency
  var dd = intel.discount_dependency;
  var ddCard = document.getElementById('discountDependencyCard');
  if (ddCard) {
    ddCard.innerHTML =
      '<div class="intel-stat-row"><span>Overall Discount Rate</span><strong class="text-orange">' + fmtPct(dd.discount_rate) + '</strong></div>' +
      '<div class="intel-stat-row"><span>FIRST15 Share of Orders</span><strong>' + fmtPct(dd.first15_share) + '</strong></div>' +
      '<div class="intel-signal-text mt-16">⚠ ' + dd.alert + '</div>';
  }

  // Product Concentration
  var pc = intel.product_concentration;
  var pcCard = document.getElementById('productConcentrationCard');
  if (pcCard) {
    pcCard.innerHTML =
      '<div class="intel-stat-row"><span>Top Product</span><strong>' + pc.top_product + '</strong></div>' +
      '<div class="intel-stat-row"><span>Top Product Share</span><strong class="text-orange">' + fmtPct(pc.top_product_share) + '</strong></div>' +
      '<div class="intel-stat-row"><span>Top 3 Products Share</span><strong>' + fmtPct(pc.top3_share) + '</strong></div>' +
      '<div class="intel-signal-text mt-16">⚠ ' + pc.alert + '</div>';
  }
}

// ===== 11. ADVISORY =====
function renderAdvisory(data) {
  var adv = data.advisory;
  var container = document.getElementById('advisoryContainer');
  if (!container) return;
  container.innerHTML = '';

  // Critical alerts (red)
  if (adv.critical && adv.critical.length) {
    container.innerHTML += '<h2 style="margin-bottom:16px;color:var(--red);font-size:16px;font-weight:700;">🚨 Critical</h2>';
    adv.critical.forEach(function(item, i) {
      container.innerHTML +=
        '<div class="insight-card border-red">' +
          '<div class="insight-number red">' + (i + 1) + '</div>' +
          '<div class="insight-content">' +
            '<div class="insight-header"><span class="insight-title">' + item.title + '</span><span class="badge badge-red">CRITICAL</span></div>' +
            '<div class="insight-body">' + item.detail + '</div>' +
          '</div>' +
        '</div>';
    });
  }

  // Warnings (orange)
  if (adv.warnings && adv.warnings.length) {
    container.innerHTML += '<h2 style="margin:24px 0 16px;color:var(--orange);font-size:16px;font-weight:700;">⚠ Warnings</h2>';
    adv.warnings.forEach(function(item, i) {
      container.innerHTML +=
        '<div class="insight-card border-orange">' +
          '<div class="insight-number orange">' + (i + 1) + '</div>' +
          '<div class="insight-content">' +
            '<div class="insight-header"><span class="insight-title">' + item.title + '</span><span class="badge badge-orange">WARNING</span></div>' +
            '<div class="insight-body">' + item.detail + '</div>' +
          '</div>' +
        '</div>';
    });
  }

  // Opportunities (green)
  if (adv.opportunities && adv.opportunities.length) {
    container.innerHTML += '<h2 style="margin:24px 0 16px;color:var(--green);font-size:16px;font-weight:700;">✅ Opportunities</h2>';
    adv.opportunities.forEach(function(item, i) {
      container.innerHTML +=
        '<div class="insight-card border-green">' +
          '<div class="insight-number green">' + (i + 1) + '</div>' +
          '<div class="insight-content">' +
            '<div class="insight-header"><span class="insight-title">' + item.title + '</span><span class="badge badge-green">OPPORTUNITY</span></div>' +
            '<div class="insight-body">' + item.detail + '</div>' +
          '</div>' +
        '</div>';
    });
  }
}

// ===== 12. DATA STATUS =====
function renderDataStatus(data) {
  var ds = data.data_status;

  // Available data table
  var availBody = document.querySelector('#dataAvailableTable tbody');
  if (availBody) {
    availBody.innerHTML = '';
    ds.available.forEach(function(item) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span class="status-dot green" style="display:inline-block;vertical-align:middle;margin-right:8px;"></span>' + item.item + '</td>' +
        '<td>' + item.source + '</td>' +
        '<td>' + item.period + '</td>' +
        '<td class="text-right">' + (item.rows ? fmtNum(item.rows) : '—') + '</td>';
      availBody.appendChild(tr);
    });
  }

  // Pending data table
  var pendBody = document.querySelector('#dataPendingTable tbody');
  if (pendBody) {
    pendBody.innerHTML = '';
    ds.pending.forEach(function(item) {
      var prClass = item.priority === 'CRITICAL' ? 'critical' :
                    item.priority === 'HIGH' ? 'high' :
                    item.priority === 'MEDIUM' ? 'medium' : 'low';
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + item.item + '</td>' +
        '<td><span class="priority-badge ' + prClass + '">' + item.priority + '</span></td>' +
        '<td>' + item.note + '</td>';
      pendBody.appendChild(tr);
    });
  }
}
