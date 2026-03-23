// ===== AI ACCOUNTANT — SaaS FEATURES ===== //
// Topbar, user profile, logout, notifications, activity log, command palette, WhatsApp widget

(function() {
  'use strict';

  // ===== POPULATE USER INFO FROM SESSION =====
  const session = window.AIA ? window.AIA.Session.get() : null;
  if (session) {
    const initials = session.displayName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    // Avatar & name
    document.querySelectorAll('#userAvatar, #dropdownAvatar').forEach(el => el.textContent = initials);
    document.querySelectorAll('#userName, #dropdownName').forEach(el => el.textContent = session.displayName);
    const emailEl = document.getElementById('dropdownEmail');
    if (emailEl) emailEl.textContent = session.email;
    
    // Last login
    const stats = window.AIA.Audit.getStats();
    const lastLoginEl = document.getElementById('lastLoginTime');
    if (lastLoginEl && stats.lastLogin) {
      const d = new Date(stats.lastLogin.timestamp);
      lastLoginEl.textContent = formatRelative(d);
    }
  }

  // ===== SESSION TIMER =====
  function updateSessionTimer() {
    if (!window.AIA) return;
    const remaining = window.AIA.Session.getTimeRemaining();
    const el = document.getElementById('sessionTime');
    if (el) {
      el.textContent = Math.round(remaining) + 'm';
      if (remaining < 5) el.style.color = '#ef4444';
    }
    // Auto-logout if expired
    if (remaining <= 0 && window.AIA.Session.get()) {
      window.AIA.Session.destroy('timeout');
      window.location.href = 'login.html';
    }
  }
  updateSessionTimer();
  setInterval(updateSessionTimer, 30000);

  // Touch session on any interaction
  document.addEventListener('click', function() {
    if (window.AIA) window.AIA.Session.touch();
  });

  // ===== LOGOUT =====
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      if (window.AIA) {
        window.AIA.Session.destroy('manual');
      }
      window.location.href = 'login.html';
    });
  }

  // ===== USER DROPDOWN =====
  const userProfile = document.getElementById('userProfile');
  const userDropdown = document.getElementById('userDropdown');
  if (userProfile && userDropdown) {
    userProfile.addEventListener('click', function(e) {
      e.stopPropagation();
      closeAllPanels();
      userDropdown.classList.toggle('active');
    });
  }

  // ===== NOTIFICATION PANEL =====
  const notifBtn = document.getElementById('notifBtn');
  const notifPanel = document.getElementById('notifPanel');
  const notifClose = document.getElementById('notifClose');
  if (notifBtn && notifPanel) {
    notifBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      closeAllPanels();
      notifPanel.classList.toggle('active');
      if (window.AIA) window.AIA.Audit.log('notification_view', {});
    });
  }
  if (notifClose) notifClose.addEventListener('click', function() { notifPanel.classList.remove('active'); });

  // ===== ACTIVITY LOG PANEL =====
  const activityLogBtn = document.getElementById('activityLogBtn');
  const activityPanel = document.getElementById('activityPanel');
  const activityClose = document.getElementById('activityClose');
  const viewActivityBtn = document.getElementById('viewActivityBtn');
  const clearLogBtn = document.getElementById('clearLogBtn');

  function openActivityPanel() {
    closeAllPanels();
    activityPanel.classList.add('active');
    renderActivityLog();
  }

  if (activityLogBtn) activityLogBtn.addEventListener('click', function(e) { e.stopPropagation(); openActivityPanel(); });
  if (viewActivityBtn) viewActivityBtn.addEventListener('click', openActivityPanel);
  if (activityClose) activityClose.addEventListener('click', function() { activityPanel.classList.remove('active'); });
  if (clearLogBtn) clearLogBtn.addEventListener('click', function() {
    if (window.AIA) { window.AIA.Audit.clear(); renderActivityLog(); }
  });

  function renderActivityLog() {
    if (!window.AIA) return;
    const stats = window.AIA.Audit.getStats();
    const logs = window.AIA.Audit.getAll().slice().reverse().slice(0, 50);

    // Stats
    const statsEl = document.getElementById('activityStats');
    if (statsEl) {
      statsEl.innerHTML = `
        <div class="stat-card"><div class="stat-value">${stats.totalLogins}</div><div class="stat-label">Logins</div></div>
        <div class="stat-card"><div class="stat-value">${stats.failedAttempts}</div><div class="stat-label">Failed</div></div>
        <div class="stat-card"><div class="stat-value">${stats.totalActions}</div><div class="stat-label">Actions</div></div>
      `;
    }

    // List
    const listEl = document.getElementById('activityList');
    if (!listEl) return;

    if (logs.length === 0) {
      listEl.innerHTML = '<div class="activity-empty">No activity recorded yet</div>';
      return;
    }

    listEl.innerHTML = logs.map(function(log) {
      const dotClass = getDotClass(log.action);
      const desc = getActionDescription(log);
      const time = formatRelative(new Date(log.timestamp));
      return `<div class="activity-item">
        <div class="activity-dot ${dotClass}"></div>
        <div>
          <div class="activity-text">${desc}</div>
          <div class="activity-time">${time}</div>
        </div>
      </div>`;
    }).join('');
  }

  function getDotClass(action) {
    if (action.includes('login_success')) return 'login';
    if (action.includes('login_failed') || action.includes('failed')) return 'failed';
    if (action.includes('logout')) return 'logout';
    return 'view';
  }

  function getActionDescription(log) {
    const email = log.email || 'Unknown';
    switch(log.action) {
      case 'login_success': return `<strong>${email}</strong> signed in`;
      case 'login_failed': return `Failed sign-in attempt for <strong>${email}</strong>`;
      case 'logout': return `<strong>${email}</strong> signed out (${log.details.reason || 'manual'})`;
      case 'page_view': return `<strong>${email}</strong> viewed ${log.details.page || 'dashboard'}`;
      case 'section_view': return `<strong>${email}</strong> navigated to <strong>${log.details.section || 'section'}</strong>`;
      case 'notification_view': return `<strong>${email}</strong> opened notifications`;
      default: return `<strong>${email}</strong> performed: ${log.action}`;
    }
  }

  // ===== TRACK SECTION VIEWS =====
  // Hook into the existing sidebar nav
  document.querySelectorAll('.sidebar-nav a[data-section]').forEach(function(link) {
    link.addEventListener('click', function() {
      const section = this.getAttribute('data-section');
      if (window.AIA) window.AIA.Audit.log('section_view', { section: section });
      // Update breadcrumb
      const bc = document.getElementById('breadcrumbSection');
      if (bc) bc.textContent = this.textContent.trim();
    });
  });

  // ===== COMMAND PALETTE =====
  const cmdOverlay = document.getElementById('cmdOverlay');
  const cmdInput = document.getElementById('cmdInput');
  const cmdResults = document.getElementById('cmdResults');

  const commands = [
    { group: 'Sections', items: [
      { label: 'Overview', icon: 'grid', section: 'overview' },
      { label: 'Profitability', icon: 'trending-up', section: 'profitability' },
      { label: 'Revenue', icon: 'dollar', section: 'revenue' },
      { label: 'Products', icon: 'list', section: 'products' },
      { label: 'Payments', icon: 'credit-card', section: 'payments' },
      { label: 'Marketing', icon: 'megaphone', section: 'marketing' },
      { label: 'Customers', icon: 'users', section: 'customers' },
      { label: 'Geography', icon: 'globe', section: 'geography' },
      { label: 'Cashflow', icon: 'bank', section: 'cashflow' },
      { label: 'Insights', icon: 'brain', section: 'insights' },
      { label: 'Data Status', icon: 'check', section: 'datastatus' }
    ]},
    { group: 'Actions', items: [
      { label: 'Sign Out', icon: 'logout', action: 'logout' },
      { label: 'WhatsApp Support', icon: 'help', action: 'whatsapp' },
      { label: 'Activity Log', icon: 'log', action: 'activity' },
      { label: 'Notifications', icon: 'bell', action: 'notifications' }
    ]}
  ];

  // Ctrl+K / Cmd+K
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
    if (e.key === 'Escape') {
      closeCommandPalette();
      closeAllPanels();
    }
  });

  // Shortcut hint click
  const shortcutHint = document.querySelector('.shortcut-hint');
  if (shortcutHint) shortcutHint.addEventListener('click', openCommandPalette);

  function openCommandPalette() {
    closeAllPanels();
    cmdOverlay.classList.add('active');
    cmdInput.value = '';
    renderCommands('');
    cmdInput.focus();
  }

  function closeCommandPalette() {
    cmdOverlay.classList.remove('active');
  }

  cmdOverlay.addEventListener('click', function(e) {
    if (e.target === cmdOverlay) closeCommandPalette();
  });

  cmdInput.addEventListener('input', function() {
    renderCommands(this.value.toLowerCase().trim());
  });

  function renderCommands(query) {
    let html = '';
    commands.forEach(function(group) {
      const filtered = group.items.filter(function(item) {
        return !query || item.label.toLowerCase().includes(query);
      });
      if (filtered.length === 0) return;
      html += `<div class="cmd-result-group"><div class="cmd-group-title">${group.group}</div>`;
      filtered.forEach(function(item) {
        html += `<div class="cmd-item" data-section="${item.section || ''}" data-action="${item.action || ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="12" cy="12" r="1"/></svg>
          ${item.label}
        </div>`;
      });
      html += '</div>';
    });
    if (!html) html = '<div class="activity-empty">No results found</div>';
    cmdResults.innerHTML = html;

    // Bind clicks
    cmdResults.querySelectorAll('.cmd-item').forEach(function(el) {
      el.addEventListener('click', function() {
        const section = this.getAttribute('data-section');
        const action = this.getAttribute('data-action');
        closeCommandPalette();
        if (section) {
          const nav = document.querySelector(`.sidebar-nav a[data-section="${section}"]`);
          if (nav) nav.click();
        }
        if (action === 'logout') document.getElementById('logoutBtn').click();
        if (action === 'whatsapp') openWhatsApp();
        if (action === 'activity') openActivityPanel();
        if (action === 'notifications') {
          closeAllPanels();
          notifPanel.classList.add('active');
        }
      });
    });
  }

  // ===== WHATSAPP =====
  const helpBtnDropdown = document.getElementById('helpBtnDropdown');

  function openWhatsApp() {
    window.open('https://chat.whatsapp.com/DzwI005mqevJ4heDodeM0e?mode=gi_t', '_blank');
  }

  if (helpBtnDropdown) helpBtnDropdown.addEventListener('click', function() {
    closeAllPanels();
    openWhatsApp();
  });

  // ===== CLOSE ALL PANELS ON OUTSIDE CLICK =====
  function closeAllPanels() {
    if (userDropdown) userDropdown.classList.remove('active');
    if (notifPanel) notifPanel.classList.remove('active');
    if (activityPanel) activityPanel.classList.remove('active');
  }

  document.addEventListener('click', function(e) {
    // Don't close if clicking inside a panel
    if (e.target.closest('.user-dropdown, .notif-panel, .activity-panel')) return;
    if (!e.target.closest('.user-profile')) userDropdown.classList.remove('active');
    if (!e.target.closest('#notifBtn')) notifPanel.classList.remove('active');
    if (!e.target.closest('#activityLogBtn, #viewActivityBtn')) activityPanel.classList.remove('active');
  });

  // ===== KEYBOARD SHORTCUTS =====
  document.addEventListener('keydown', function(e) {
    // Don't trigger if typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    // Number keys 1-9 for sections
    if (e.key >= '1' && e.key <= '9' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const sections = ['overview','profitability','revenue','products','payments','marketing','customers','geography','cashflow','insights','datastatus'];
      const idx = parseInt(e.key) - 1;
      if (idx < sections.length) {
        const nav = document.querySelector(`.sidebar-nav a[data-section="${sections[idx]}"]`);
        if (nav) nav.click();
      }
    }

    // ? for help
    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
      openWhatsApp();
    }
  });

  // ===== CHANGE PASSWORD =====
  var cpOverlay = document.getElementById('changePwdOverlay');
  var cpForm = document.getElementById('changePwdForm');
  var cpClose = document.getElementById('changePwdClose');
  var cpBtn = document.getElementById('changePasswordBtn');
  var cpError = document.getElementById('cpError');
  var cpErrorMsg = document.getElementById('cpErrorMsg');
  var cpSuccess = document.getElementById('cpSuccess');

  function openChangePwd() {
    if (cpOverlay) {
      cpOverlay.style.display = 'flex';
      cpError.style.display = 'none';
      cpSuccess.style.display = 'none';
      cpForm.reset();
    }
  }
  function closeChangePwd() {
    if (cpOverlay) cpOverlay.style.display = 'none';
  }

  if (cpBtn) cpBtn.addEventListener('click', openChangePwd);
  if (cpClose) cpClose.addEventListener('click', closeChangePwd);
  if (cpOverlay) cpOverlay.addEventListener('click', function(e) {
    if (e.target === cpOverlay) closeChangePwd();
  });

  if (cpForm) {
    cpForm.addEventListener('submit', function(e) {
      e.preventDefault();
      cpError.style.display = 'none';
      cpSuccess.style.display = 'none';

      var currentPwd = document.getElementById('cpCurrentPwd').value;
      var newPwd = document.getElementById('cpNewPwd').value;
      var confirmPwd = document.getElementById('cpConfirmPwd').value;

      if (!currentPwd || !newPwd || !confirmPwd) {
        cpErrorMsg.textContent = 'All fields are required.';
        cpError.style.display = 'block';
        return;
      }
      if (newPwd.length < 6) {
        cpErrorMsg.textContent = 'New password must be at least 6 characters.';
        cpError.style.display = 'block';
        return;
      }
      if (newPwd !== confirmPwd) {
        cpErrorMsg.textContent = 'New passwords do not match.';
        cpError.style.display = 'block';
        return;
      }

      var token = window.AIA && window.AIA.Session.getToken();
      var submitBtn = document.getElementById('cpSubmitBtn');
      submitBtn.textContent = 'Updating...';
      submitBtn.disabled = true;

      fetch('/api/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
      })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        submitBtn.textContent = 'Update Password';
        submitBtn.disabled = false;
        if (data.success) {
          cpSuccess.style.display = 'block';
          cpForm.reset();
          if (data.token && window.AIA) {
            window.AIA.Session.setToken(data.token);
          }
          if (window.AIA) window.AIA.Audit.log('password_changed', {});
          setTimeout(closeChangePwd, 2000);
        } else {
          cpErrorMsg.textContent = data.error || 'Failed to change password.';
          cpError.style.display = 'block';
        }
      })
      .catch(function() {
        submitBtn.textContent = 'Update Password';
        submitBtn.disabled = false;
        cpErrorMsg.textContent = 'Network error. Please try again.';
        cpError.style.display = 'block';
      });
    });
  }

  // ===== HELPER: RELATIVE TIME =====
  function formatRelative(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return minutes + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days < 7) return days + 'd ago';
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

})();
