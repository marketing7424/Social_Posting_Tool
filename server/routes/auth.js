const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { getDb } = require('../services/db');
const { authenticate, requireAdmin, generateTokens, JWT_SECRET, ADMIN_EMAILS } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const tokens = generateTokens(user);
  res.json({
    user: { id: user.id, email: user.email, displayName: user.display_name, role: user.role || 'user' },
    ...tokens,
  });
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const tokens = generateTokens(user);
    res.json(tokens);
  } catch (_) {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, display_name, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, email: user.email, displayName: user.display_name, role: user.role || 'user', createdAt: user.created_at });
});

// ── Admin-only user management ──────────────────────────

// GET /api/auth/users — list all users
router.get('/users', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const users = db.prepare('SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users.map(u => ({
    id: u.id,
    email: u.email,
    displayName: u.display_name || '',
    role: u.role || 'user',
    createdAt: u.created_at,
  })));
});

// POST /api/auth/users — admin creates a new user
router.post('/users', authenticate, requireAdmin, (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const db = getDb();
  const normalizedEmail = email.toLowerCase();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const id = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);
  const role = ADMIN_EMAILS.includes(normalizedEmail) ? 'admin' : 'user';

  db.prepare(
    'INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)'
  ).run(id, normalizedEmail, passwordHash, displayName || null, role);

  res.status(201).json({ id, email: normalizedEmail, displayName: displayName || '', role });
});

// PATCH /api/auth/users/:id — admin resets password or updates user
router.patch('/users/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { password, displayName } = req.body;
  const updates = [];
  const values = [];

  if (password) {
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    updates.push('password_hash = ?');
    values.push(bcrypt.hashSync(password, 10));
  }
  if (displayName !== undefined) {
    updates.push('display_name = ?');
    values.push(displayName);
  }

  if (updates.length > 0) {
    values.push(req.params.id);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = db.prepare('SELECT id, email, display_name, role, created_at FROM users WHERE id = ?').get(req.params.id);
  res.json({
    id: updated.id,
    email: updated.email,
    displayName: updated.display_name || '',
    role: updated.role || 'user',
    createdAt: updated.created_at,
  });
});

// DELETE /api/auth/users/:id — admin deletes a user
router.delete('/users/:id', authenticate, requireAdmin, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (ADMIN_EMAILS.includes(user.email)) {
    return res.status(403).json({ error: 'Cannot delete admin accounts' });
  }

  try {
    const tx = db.transaction(() => {
      db.prepare('UPDATE posts SET created_by = NULL WHERE created_by = ?').run(user.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    });
    tx();
    res.json({ success: true });
  } catch (err) {
    console.error('Delete user failed:', err);
    res.status(500).json({ error: err.message || 'Failed to delete user' });
  }
});

module.exports = router;
