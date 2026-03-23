// Vercel Serverless Function — GET /api/upload-history
// Returns recent upload history for the dashboard
const { getSQL } = require('./lib/db');
const { setCors, verifyToken } = require('./lib/auth-middleware');

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed. Use GET.' });

  // Verify JWT
  var user = verifyToken(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    var sql = getSQL();
    var rows = await sql`
      SELECT id, uploaded_by, upload_source, created_at
      FROM dashboard_data
      WHERE client_name = 'Stan Edition'
      ORDER BY created_at DESC
      LIMIT 20
    `;

    return res.status(200).json({ success: true, history: rows });
  } catch (err) {
    console.error('[upload-history.js] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch upload history: ' + err.message });
  }
};
