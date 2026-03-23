// Shared JWT verification + CORS helper for all API endpoints
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'aia-cfo-2026-sk';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

/**
 * Verify JWT from Authorization header.
 * Returns decoded payload or null.
 */
function verifyToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Require Admin role — returns decoded payload or sends 403.
 */
function requireAdmin(req, res) {
  const payload = verifyToken(req);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
    return null;
  }
  if (payload.role !== 'Admin') {
    res.status(403).json({ error: 'Forbidden — admin access required' });
    return null;
  }
  return payload;
}

module.exports = { JWT_SECRET, setCors, verifyToken, requireAdmin };
