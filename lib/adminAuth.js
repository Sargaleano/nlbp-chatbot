'use strict';

// Deliberately minimal: a single shared admin credential, no roles, no
// multi-user support, no password reset flow. This is an intentional
// simplification appropriate to the single-laptop, single-custodian (PI)
// deployment described in the spec -- not an oversight. Do not extend
// this into a general-purpose auth system.

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  // Fail loudly at startup rather than silently accepting any password.
  throw new Error(
    'ADMIN_PASSWORD is not set. Copy .env.example to .env and set a real admin password before starting the server.'
  );
}

function login(password) {
  return typeof password === 'string' && password === ADMIN_PASSWORD;
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated' });
}

module.exports = { login, requireAdmin };
