// Vercel Serverless Function — POST /api/change-password
// Persists password changes to Neon Postgres
const { getUser, updatePassword, logAudit } = require('./lib/db');
const { JWT_SECRET, setCors, verifyToken } = require('./lib/auth-middleware');
const jwt = require('jsonwebtoken');

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const payload = verifyToken(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });

  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Current password and new password are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ success: false, error: 'New password must be different from current password' });
  }

  try {
    const email = payload.email;
    const user = await getUser(email);

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (user.password !== currentPassword) {
      await logAudit({
        action: 'password_change_failed', email,
        details: { reason: 'wrong_current_password' },
        ip: req.headers['x-forwarded-for'] || '', userAgent: req.headers['user-agent'] || ''
      });
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    await updatePassword(email, newPassword);

    await logAudit({
      action: 'password_changed', email,
      details: { changedBy: 'self' },
      ip: req.headers['x-forwarded-for'] || '', userAgent: req.headers['user-agent'] || ''
    });

    const newToken = jwt.sign(
      { email, name: user.name, role: user.role },
      JWT_SECRET, { expiresIn: '30m' }
    );

    return res.status(200).json({ success: true, message: 'Password changed successfully', token: newToken });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
