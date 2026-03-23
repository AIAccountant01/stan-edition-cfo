// Vercel Serverless Function — GET /api/admin/audit
// Admin-only audit log viewer (Neon Postgres)
const { getAuditLog, getAuditCount } = require('../lib/db');
const { setCors, requireAdmin } = require('../lib/auth-middleware');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const admin = requireAdmin(req, res);
  if (!admin) return;

  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const [entries, total] = await Promise.all([
      getAuditLog(limit, offset),
      getAuditCount()
    ]);

    return res.status(200).json({ success: true, entries, total, limit, offset });
  } catch (err) {
    console.error('Audit log error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
