// Vercel Serverless Function — POST /api/migrate
// Creates tables + seeds initial users into Neon Postgres
const { getSQL, getUser } = require('./lib/db');
const { setCors } = require('./lib/auth-middleware');

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed. Use POST.' });

  // Require seed secret
  const seedSecret = process.env.SEED_SECRET || 'aia-seed-2026';
  const provided = req.body && req.body.secret;
  if (provided !== seedSecret) {
    return res.status(403).json({ success: false, error: 'Invalid seed secret' });
  }

  try {
    const sql = getSQL();

    // ===== CREATE TABLES =====
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        email       VARCHAR(255) PRIMARY KEY,
        password    VARCHAR(255) NOT NULL,
        name        VARCHAR(255) NOT NULL,
        role        VARCHAR(50)  NOT NULL DEFAULT 'Viewer',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          SERIAL PRIMARY KEY,
        action      VARCHAR(100) NOT NULL,
        email       VARCHAR(255) NOT NULL DEFAULT 'system',
        details     JSONB DEFAULT '{}',
        ip          VARCHAR(45)  DEFAULT '',
        user_agent  VARCHAR(200) DEFAULT '',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `;

    // Index for audit log queries
    await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_action  ON audit_log (action)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_audit_log_email   ON audit_log (email)`;

    // Dashboard data table — stores uploaded/processed dashboard JSON
    await sql`
      CREATE TABLE IF NOT EXISTS dashboard_data (
        id            SERIAL PRIMARY KEY,
        client_name   VARCHAR(255) NOT NULL DEFAULT 'Stan Edition',
        data_json     JSONB NOT NULL,
        uploaded_by   VARCHAR(255) NOT NULL,
        upload_source VARCHAR(100) DEFAULT 'manual',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_dashboard_data_client ON dashboard_data (client_name, created_at DESC)`;

    // ===== SEED USERS =====
    const seedUsers = [
      { email: 'help@aiaccountant.com', password: 'aiaccountant2026', name: 'Help', role: 'Admin' },
      { email: 'admin@aiaccountant.com', password: 'admin2026', name: 'Admin', role: 'Admin' },
      { email: 'ronit@aiaccountant.com', password: 'ronit@123', name: 'Ronit', role: 'Admin' },
      { email: 'shantanu@stanedition.com', password: 'stan2026', name: 'Shantanu', role: 'Viewer' },
      { email: 'demo@aiaccountant.com', password: 'demo2026', name: 'Demo', role: 'Viewer' }
    ];

    const results = [];
    for (const u of seedUsers) {
      const existing = await getUser(u.email);
      if (existing) {
        results.push({ email: u.email, status: 'already_exists', skipped: true });
      } else {
        await sql`
          INSERT INTO users (email, password, name, role)
          VALUES (${u.email}, ${u.password}, ${u.name}, ${u.role})
        `;
        results.push({ email: u.email, status: 'created', skipped: false });
      }
    }

    // Log the migration
    await sql`
      INSERT INTO audit_log (action, email, details)
      VALUES ('database_migrated', 'system', ${JSON.stringify({
        tablesCreated: ['users', 'audit_log', 'dashboard_data'],
        usersSeeded: results.filter(r => !r.skipped).length,
        usersSkipped: results.filter(r => r.skipped).length
      })})
    `;

    return res.status(200).json({
      success: true,
      message: 'Migration complete — tables created and users seeded',
      results
    });
  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({ success: false, error: 'Migration failed: ' + err.message });
  }
};
