// Vercel Serverless Function — /api/admin/users
// Admin-only CRUD for user management (Neon Postgres)
// GET = list | POST = create | PUT = update | DELETE = delete
const { getUser, listUsers, createUser, updateUser, deleteUser, logAudit } = require('../lib/db');
const { setCors, requireAdmin } = require('../lib/auth-middleware');

module.exports = async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const admin = requireAdmin(req, res);
  if (!admin) return;

  const ip = req.headers['x-forwarded-for'] || '';
  const ua = req.headers['user-agent'] || '';

  try {
    // ===== LIST =====
    if (req.method === 'GET') {
      const users = await listUsers();
      return res.status(200).json({ success: true, users });
    }

    // ===== CREATE =====
    if (req.method === 'POST') {
      const { email, password, name, role } = req.body || {};
      if (!email || !password || !name) {
        return res.status(400).json({ success: false, error: 'Email, password, and name are required' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ success: false, error: 'Invalid email format' });
      }
      if (password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }

      const existing = await getUser(email);
      if (existing) {
        return res.status(409).json({ success: false, error: 'User with this email already exists' });
      }

      const validRoles = ['Admin', 'Viewer'];
      const userRole = validRoles.includes(role) ? role : 'Viewer';
      const newUser = await createUser(email, { password, name, role: userRole });

      await logAudit({ action: 'user_created', email: admin.email, details: { targetUser: email, name, role: userRole }, ip, userAgent: ua });
      return res.status(201).json({ success: true, user: newUser });
    }

    // ===== UPDATE =====
    if (req.method === 'PUT') {
      const { email, name, role, password } = req.body || {};
      if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

      const existing = await getUser(email);
      if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

      if (password && password.length < 6) {
        return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
      }

      const updated = await updateUser(email, { password: password || null, name: name || null, role: role || null });

      const changes = [];
      if (name && name !== existing.name) changes.push('name');
      if (role && role !== existing.role) changes.push('role');
      if (password) changes.push('password');

      await logAudit({ action: 'user_updated', email: admin.email, details: { targetUser: email, fieldsChanged: changes }, ip, userAgent: ua });
      return res.status(200).json({ success: true, user: updated });
    }

    // ===== DELETE =====
    if (req.method === 'DELETE') {
      const { email } = req.body || {};
      if (!email) return res.status(400).json({ success: false, error: 'Email is required' });

      if (email.toLowerCase() === admin.email.toLowerCase()) {
        return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
      }

      const existing = await getUser(email);
      if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

      await deleteUser(email);
      await logAudit({ action: 'user_deleted', email: admin.email, details: { targetUser: email, name: existing.name, role: existing.role }, ip, userAgent: ua });
      return res.status(200).json({ success: true, message: `User ${email} deleted` });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
