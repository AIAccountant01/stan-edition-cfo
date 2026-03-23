// Vercel Serverless Function — POST /api/auth
// Authenticates user against Neon Postgres database
const jwt = require('jsonwebtoken');
const { getUser, logAudit } = require('./lib/db');
const { JWT_SECRET, setCors } = require('./lib/auth-middleware');

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '';
  const ua = req.headers['user-agent'] || '';

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    const user = await getUser(email);

    if (!user || user.password !== password) {
      await logAudit({
        action: 'login_failed',
        email: email.toLowerCase(),
        details: { reason: !user ? 'user_not_found' : 'wrong_password' },
        ip, userAgent: ua
      });
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '30m' }
    );

    await logAudit({
      action: 'login_success',
      email: user.email,
      details: { name: user.name, role: user.role },
      ip, userAgent: ua
    });

    return res.status(200).json({
      success: true,
      token: token,
      user: { email: user.email, name: user.name, role: user.role }
    });
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
};
