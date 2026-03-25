// ===== EXPRESS SERVER — ECS DEPLOYMENT ===== //
// Wraps Vercel serverless functions into a standard Express app
// for containerized deployment on AWS ECS Fargate

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== MIDDLEWARE =====
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ===== HEALTH CHECK (for ALB target group) =====
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ===== API ROUTES =====
// Each Vercel serverless function exports: module.exports = async function(req, res)
// Express is compatible — just require and mount them

const authHandler = require('./api/auth');
const dataHandler = require('./api/data');
const chatHandler = require('./api/chat');
const uploadHandler = require('./api/upload');
const uploadHistoryHandler = require('./api/upload-history');
const migrateHandler = require('./api/migrate');
const changePasswordHandler = require('./api/change-password');
const adminUsersHandler = require('./api/admin/users');
const adminAuditHandler = require('./api/admin/audit');

// Mount API routes — Vercel handlers use (req, res) signature, compatible with Express
app.all('/api/auth', authHandler);
app.all('/api/data', dataHandler);
app.all('/api/chat', chatHandler);
app.all('/api/upload', uploadHandler);
app.all('/api/upload-history', uploadHistoryHandler);
app.all('/api/migrate', migrateHandler);
app.all('/api/change-password', changePasswordHandler);
app.all('/api/admin/users', adminUsersHandler);
app.all('/api/admin/audit', adminAuditHandler);

// ===== STATIC FILES =====
// Serve HTML, CSS, JS from project root
app.use(express.static(path.join(__dirname), {
  extensions: ['html'],
  index: false  // We handle root redirect below
}));

// Root → login page (matches Vercel routing: "^/$" → "/login.html")
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// ===== START SERVER =====
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[AIA] Stan Edition CFO Dashboard running on port ${PORT}`);
  console.log(`[AIA] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[AIA] Database: ${process.env.DATABASE_URL ? 'configured' : 'NOT SET'}`);
});
