// Vercel Serverless Function — GET /api/data
// Returns dashboard data: static JSON as source of truth, DB as override when uploads happen
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
    // Check DB for user-uploaded data (takes priority if uploaded after deploy)
    var sql = getSQL();
    var rows = await sql`SELECT data_json, created_at FROM dashboard_data WHERE client_name = 'Stan Edition' AND upload_source = 'csv_upload' ORDER BY created_at DESC LIMIT 1`;
    if (rows.length > 0) {
      return res.status(200).json(rows[0].data_json);
    }
  } catch (err) {
    console.error('[data.js] DB read failed, using static JSON:', err.message);
  }

  // Static JSON is the canonical source (updated with each deploy)
  return res.status(200).json(dashboardData);
};
