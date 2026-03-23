// Shared Postgres helper — @neondatabase/serverless (HTTP mode)
// Reads DATABASE_URL env var (set in Vercel project settings)
const { neon } = require('@neondatabase/serverless');

function getSQL() {
  const url = process.env.POSTGRES_URL
    || process.env.DATABASE_URL
    || process.env.POSTGRES_URL_NON_POOLING
    || process.env.NEON_DATABASE_URL;
  if (!url) {
    throw new Error('POSTGRES_URL or DATABASE_URL environment variable is not set. Available env keys: ' + Object.keys(process.env).filter(k => k.includes('POSTGRES') || k.includes('DATABASE') || k.includes('NEON') || k.includes('PG')).join(', '));
  }
  return neon(url);
}

// ===== USER OPERATIONS =====

async function getUser(email) {
  const sql = getSQL();
  const rows = await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`;
  return rows[0] || null;
}

async function listUsers() {
  const sql = getSQL();
  const rows = await sql`SELECT email, name, role, created_at, updated_at FROM users ORDER BY name ASC`;
  return rows;
}

async function createUser(email, data) {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO users (email, password, name, role)
    VALUES (${email.toLowerCase()}, ${data.password}, ${data.name}, ${data.role || 'Viewer'})
    RETURNING email, name, role, created_at, updated_at
  `;
  return rows[0];
}

async function updateUser(email, data) {
  const sql = getSQL();
  const fields = [];
  const lower = email.toLowerCase();

  // Build dynamic update — only update provided fields
  if (data.password) {
    const rows = await sql`
      UPDATE users SET password = ${data.password}, name = COALESCE(${data.name || null}, name),
      role = COALESCE(${data.role || null}, role), updated_at = NOW()
      WHERE email = ${lower}
      RETURNING email, name, role, created_at, updated_at
    `;
    return rows[0];
  } else {
    const rows = await sql`
      UPDATE users SET name = COALESCE(${data.name || null}, name),
      role = COALESCE(${data.role || null}, role), updated_at = NOW()
      WHERE email = ${lower}
      RETURNING email, name, role, created_at, updated_at
    `;
    return rows[0];
  }
}

async function deleteUser(email) {
  const sql = getSQL();
  await sql`DELETE FROM users WHERE email = ${email.toLowerCase()}`;
}

async function updatePassword(email, newPassword) {
  const sql = getSQL();
  await sql`UPDATE users SET password = ${newPassword}, updated_at = NOW() WHERE email = ${email.toLowerCase()}`;
}

// ===== AUDIT LOG OPERATIONS =====

async function logAudit(entry) {
  const sql = getSQL();
  const rows = await sql`
    INSERT INTO audit_log (action, email, details, ip, user_agent)
    VALUES (${entry.action}, ${entry.email || 'system'}, ${JSON.stringify(entry.details || {})}, ${(entry.ip || '').substring(0, 45)}, ${(entry.userAgent || '').substring(0, 200)})
    RETURNING id, action, email, details, ip, user_agent, created_at
  `;
  return rows[0];
}

async function getAuditLog(limit = 50, offset = 0) {
  const sql = getSQL();
  const rows = await sql`
    SELECT id, action, email, details, ip, user_agent, created_at
    FROM audit_log
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows;
}

async function getAuditCount() {
  const sql = getSQL();
  const rows = await sql`SELECT COUNT(*)::int AS count FROM audit_log`;
  return rows[0].count;
}

module.exports = {
  getSQL,
  getUser,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  updatePassword,
  logAudit,
  getAuditLog,
  getAuditCount
};
