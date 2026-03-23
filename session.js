// ===== AI ACCOUNTANT — SESSION & AUDIT SYSTEM ===== //
// Shared across login.html and index.html (dashboard)
// In-memory session management — sandbox safe

(function() {
  'use strict';

  // ===== SESSION CONFIG =====
  const SESSION_TIMEOUT_MINUTES = 30;
  const SESSION_KEY = '__aia_session';
  const AUDIT_KEY = '__aia_audit';

  // ===== IN-MEMORY STORE (survives within same page, not across tabs) =====
  // We use window-level variables for cross-page persistence
  if (!window.__aiaStore) {
    window.__aiaStore = {
      session: null,
      token: null,
      auditLog: [],
      loginAttempts: []
    };
  }

  const store = window.__aiaStore;

  // ===== SESSION MANAGEMENT =====
  const SessionManager = {
    create(email, token) {
      const session = {
        email: email,
        displayName: email.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        loginTime: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        sessionId: 'sess_' + Math.random().toString(36).substring(2, 15),
        isActive: true
      };
      store.session = session;
      if (token) store.token = token;
      this._persist();
      return session;
    },

    setToken(token) {
      store.token = token;
      this._persist();
    },

    getToken() {
      if (!store.token && window.name) {
        try {
          const data = JSON.parse(window.name);
          if (data && data.token) store.token = data.token;
        } catch(e) {}
      }
      return store.token;
    },

    get() {
      // Try to restore from window.name (survives navigation)
      if (!store.session && window.name) {
        try {
          const data = JSON.parse(window.name);
          if (data && data.session && data.session.isActive) {
            store.session = data.session;
            store.token = data.token || null;
            store.auditLog = data.auditLog || [];
            store.loginAttempts = data.loginAttempts || [];
          }
        } catch(e) {}
      }
      return store.session;
    },

    isValid() {
      const session = this.get();
      if (!session || !session.isActive) return false;
      
      // Check timeout
      const lastActivity = new Date(session.lastActivity);
      const now = new Date();
      const diffMinutes = (now - lastActivity) / (1000 * 60);
      if (diffMinutes > SESSION_TIMEOUT_MINUTES) {
        this.destroy('timeout');
        return false;
      }
      return true;
    },

    touch() {
      if (store.session) {
        store.session.lastActivity = new Date().toISOString();
        this._persist();
      }
    },

    destroy(reason) {
      if (store.session) {
        AuditLog.log('logout', { reason: reason || 'manual', email: store.session.email });
        store.session.isActive = false;
        store.session = null;
        store.token = null;
        this._persist();
      }
    },

    _persist() {
      try { window.name = JSON.stringify({ session: store.session, token: store.token, auditLog: store.auditLog, loginAttempts: store.loginAttempts }); } catch(e) {}
    },

    getTimeRemaining() {
      const session = this.get();
      if (!session) return 0;
      const lastActivity = new Date(session.lastActivity);
      const now = new Date();
      const elapsed = (now - lastActivity) / (1000 * 60);
      return Math.max(0, SESSION_TIMEOUT_MINUTES - elapsed);
    }
  };

  // ===== AUDIT LOG =====
  const AuditLog = {
    log(action, details) {
      const entry = {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
        timestamp: new Date().toISOString(),
        action: action,
        email: (details && details.email) || (store.session && store.session.email) || 'anonymous',
        details: details || {},
        userAgent: navigator.userAgent.substring(0, 100),
        page: window.location.pathname.split('/').pop() || 'index.html'
      };
      store.auditLog.push(entry);
      
      // Keep max 500 entries
      if (store.auditLog.length > 500) {
        store.auditLog = store.auditLog.slice(-500);
      }
      
      SessionManager._persist();
      return entry;
    },

    getAll() {
      // Restore from window.name if needed
      SessionManager.get();
      return store.auditLog || [];
    },

    getByAction(action) {
      return this.getAll().filter(e => e.action === action);
    },

    getLoginAttempts() {
      return store.loginAttempts || [];
    },

    logLoginAttempt(email, success) {
      const attempt = {
        timestamp: new Date().toISOString(),
        email: email,
        success: success,
        userAgent: navigator.userAgent.substring(0, 100)
      };
      store.loginAttempts.push(attempt);
      
      // Keep max 100 attempts
      if (store.loginAttempts.length > 100) {
        store.loginAttempts = store.loginAttempts.slice(-100);
      }
      
      // Also log to audit
      this.log(success ? 'login_success' : 'login_failed', { email: email, success: success });
      SessionManager._persist();
      return attempt;
    },

    getStats() {
      const attempts = this.getLoginAttempts();
      const logs = this.getAll();
      return {
        totalLogins: attempts.filter(a => a.success).length,
        failedAttempts: attempts.filter(a => !a.success).length,
        totalAttempts: attempts.length,
        totalActions: logs.length,
        lastLogin: attempts.filter(a => a.success).slice(-1)[0] || null,
        pageViews: logs.filter(e => e.action === 'page_view').length,
        sectionViews: logs.filter(e => e.action === 'section_view').length
      };
    },

    clear() {
      store.auditLog = [];
      store.loginAttempts = [];
      SessionManager._persist();
    }
  };

  // ===== EXPORT GLOBALLY =====
  window.AIA = {
    Session: SessionManager,
    Audit: AuditLog
  };

})();
