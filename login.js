// ===== AI ACCOUNTANT — LOGIN PAGE ===== //

(function() {
  'use strict';

  // Auto-detect base path for API calls (works behind Cloudflare proxy)
  var API_BASE = (function() {
    var path = window.location.pathname;
    var lastSlash = path.lastIndexOf('/');
    var dir = path.substring(0, lastSlash);
    return dir === '' ? '' : dir;
  })();

  // ===== DOM REFS =====
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const signInBtn = document.getElementById('signInBtn');
  const formError = document.getElementById('formError');
  const errorMsg = document.getElementById('errorMsg');
  const togglePassword = document.getElementById('togglePassword');
  const termsLink = document.getElementById('termsLink');
  const privacyLink = document.getElementById('privacyLink');
  const modalOverlay = document.getElementById('modalOverlay');
  const modalClose = document.getElementById('modalClose');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');

  // ===== PASSWORD TOGGLE =====
  togglePassword.addEventListener('click', function() {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;
    const eyeOpen = this.querySelector('.eye-open');
    const eyeClosed = this.querySelector('.eye-closed');
    if (type === 'text') {
      eyeOpen.style.display = 'none';
      eyeClosed.style.display = 'block';
      this.setAttribute('aria-label', 'Hide password');
    } else {
      eyeOpen.style.display = 'block';
      eyeClosed.style.display = 'none';
      this.setAttribute('aria-label', 'Show password');
    }
  });

  // ===== FORM SUBMISSION =====
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    hideError();

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    // Validate
    if (!email) {
      showError('Please enter your email address.');
      emailInput.focus();
      return;
    }
    if (!isValidEmail(email)) {
      showError('Please enter a valid email address.');
      emailInput.focus();
      return;
    }
    if (!password) {
      showError('Please enter your password.');
      passwordInput.focus();
      return;
    }

    // Show loading
    setLoading(true);

    // Authenticate via API
    fetch(API_BASE + '/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      if (data.success && data.token) {
        if (window.AIA) {
          window.AIA.Audit.logLoginAttempt(email, true);
          window.AIA.Session.create(email, data.token);
          window.AIA.Audit.log('login_success', { email: email });
        }
        window.location.href = 'index.html';
      } else {
        if (window.AIA) {
          window.AIA.Audit.logLoginAttempt(email, false);
        }
        setLoading(false);
        showError(data.error || 'Invalid email or password. Please try again.');
        passwordInput.value = '';
        passwordInput.focus();
      }
    })
    .catch(function() {
      setLoading(false);
      showError('Network error. Please try again.');
      passwordInput.value = '';
      passwordInput.focus();
    });
  });

  // ===== HELPERS =====
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    formError.style.display = 'flex';
  }

  function hideError() {
    formError.style.display = 'none';
  }

  function setLoading(loading) {
    const btnText = signInBtn.querySelector('.btn-text');
    const btnLoader = signInBtn.querySelector('.btn-loader');
    if (loading) {
      btnText.style.display = 'none';
      btnLoader.style.display = 'flex';
      signInBtn.disabled = true;
    } else {
      btnText.style.display = 'inline';
      btnLoader.style.display = 'none';
      signInBtn.disabled = false;
    }
  }

  // Clear error on input
  emailInput.addEventListener('input', hideError);
  passwordInput.addEventListener('input', hideError);

  // ===== MODAL — TERMS & PRIVACY =====
  const termsContent = `
    <h4>Terms of Service</h4>
    <p>These Terms of Service ("Terms") govern your use of the AI Accountant platform and services provided by Korefi Business Solutions Private Limited ("Company", "we", "us").</p>
    
    <h4>1. Acceptance of Terms</h4>
    <p>By accessing or using our services, you agree to be bound by these Terms. If you do not agree, you may not use our services.</p>
    
    <h4>2. Services</h4>
    <p>AI Accountant provides virtual accounting, bookkeeping, tax compliance, and financial advisory services through a combination of dedicated CA teams and AI-powered technology.</p>
    <ul>
      <li>Virtual Accounting & Bookkeeping</li>
      <li>GST Filing & TDS Returns</li>
      <li>ROC Compliance & Payroll Management</li>
      <li>Financial Advisory & CFO Dashboard</li>
    </ul>
    
    <h4>3. User Obligations</h4>
    <p>You agree to provide accurate and complete financial information, maintain the confidentiality of your login credentials, and use the platform only for lawful business purposes.</p>
    
    <h4>4. Data Security</h4>
    <p>We employ SOC 2 Type II and ISO certified security measures to protect your financial data. All data is encrypted using 256-bit SSL during transmission and AES-256 at rest.</p>
    
    <h4>5. Limitation of Liability</h4>
    <p>While we strive for accuracy, AI Accountant provides insights and reports as advisory tools. Final financial decisions remain the responsibility of the client and their authorized representatives.</p>
    
    <h4>6. Contact</h4>
    <p>Korefi Business Solutions Private Limited<br>
    Ground Floor, 326 Slate House, Indiranagar, Bengaluru, Karnataka, India<br>
    Email: help@aiaccountant.com</p>
  `;

  const privacyContent = `
    <h4>Privacy Policy</h4>
    <p>Korefi Business Solutions Private Limited ("AI Accountant") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information.</p>
    
    <h4>1. Information We Collect</h4>
    <ul>
      <li><strong>Account Information:</strong> Name, email, phone number, business details</li>
      <li><strong>Financial Data:</strong> Bank statements, P&L statements, invoices, tax records</li>
      <li><strong>Usage Data:</strong> Dashboard interaction patterns, feature usage metrics</li>
    </ul>
    
    <h4>2. How We Use Your Information</h4>
    <p>Your data is used exclusively to provide accounting services, generate financial insights, ensure tax compliance, and improve our AI-powered analytics.</p>
    
    <h4>3. Data Protection</h4>
    <ul>
      <li>SOC 2 Type II certified infrastructure</li>
      <li>ISO 27001 certified processes</li>
      <li>256-bit SSL encryption for all data in transit</li>
      <li>AES-256 encryption for data at rest</li>
      <li>Regular third-party security audits</li>
    </ul>
    
    <h4>4. Data Sharing</h4>
    <p>We do not sell your data. Information is shared only with authorized CA professionals assigned to your account and with regulatory bodies as required by law.</p>
    
    <h4>5. Your Rights</h4>
    <p>You have the right to access, correct, delete, or export your data at any time. Contact us at help@aiaccountant.com for any data-related requests.</p>
    
    <h4>6. Data Retention</h4>
    <p>Financial records are retained for the statutory period required by Indian tax law (typically 8 years). Upon account termination, non-statutory data is deleted within 90 days.</p>
    
    <h4>7. Contact</h4>
    <p>Data Protection Officer<br>
    Korefi Business Solutions Private Limited<br>
    Ground Floor, 326 Slate House, Indiranagar, Bengaluru, Karnataka, India<br>
    Email: help@aiaccountant.com</p>
  `;

  termsLink.addEventListener('click', function(e) {
    e.preventDefault();
    openModal('Terms of Service', termsContent);
  });

  privacyLink.addEventListener('click', function(e) {
    e.preventDefault();
    openModal('Privacy Policy', privacyContent);
  });

  function openModal(title, content) {
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
    modalClose.focus();
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', function(e) {
    if (e.target === modalOverlay) closeModal();
  });

  // ESC key closes modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
      closeModal();
    }
  });

  // ===== AUTO-FOCUS =====
  emailInput.focus();

})();
