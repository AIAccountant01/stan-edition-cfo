// Vercel Serverless Function — GET /api/data
// Returns dashboard data from DB first, falls back to static JSON
const { getSQL } = require('./lib/db');
const { setCors, verifyToken } = require('./lib/auth-middleware');
const dashboardData = require('./_data/dashboard.json');

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify JWT
  var user = verifyToken(req);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Try DB first
    var sql = getSQL();
    var rows = await sql`SELECT data_json FROM dashboard_data WHERE client_name = 'Stan Edition' ORDER BY created_at DESC LIMIT 1`;
    if (rows.length > 0) {
      return res.status(200).json(rows[0].data_json);
    }
  } catch (err) {
    // DB read failed — fall back to static JSON
    console.error('[data.js] DB read failed, using static JSON:', err.message);
  }

  // Fall back to static JSON
  return res.status(200).json(dashboardData);
};
