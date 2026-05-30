const crypto = require('crypto');
const bcrypt  = require('bcrypt');
const pool    = require('../config/db');

// ─── Constants ────────────────────────────────────────────────────────────────
const SESSION_EXPIRY_HOURS = parseInt(process.env.SESSION_EXPIRY_HOURS || '24', 10);
const TOKEN_BYTES          = 32;
const BCRYPT_COST          = 12;

const ADMIN_PERMISSIONS = {
  can_upload: true, can_record: true, can_create_tags: true,
  can_delete_own: true, can_view_transcripts: true,
  can_download_files: true, can_view_chat: true,
};

// ─── Helper: build full user payload (permissions + departments) ───────────────
async function buildUserPayload(user) {
  const isAdmin = user.role === 'admin';

  // Permissions
  let permissions;
  if (isAdmin) {
    permissions = ADMIN_PERMISSIONS;
  } else {
    const { rows: [perm] } = await pool.query(
      'SELECT * FROM user_permissions WHERE user_id = $1',
      [user.id]
    );
    const p = perm || {};
    permissions = {
      can_upload:           !!p.can_upload,
      can_record:           !!p.can_record,
      can_create_tags:      !!p.can_create_tags,
      can_delete_own:       !!p.can_delete_own,
      can_view_transcripts: p.can_view_transcripts !== null ? !!p.can_view_transcripts : true,
      can_download_files:   !!p.can_download_files,
      can_view_chat:        !!p.can_view_chat,
    };
  }

  // Departments
  const { rows: departments } = await pool.query(
    `SELECT d.id, d.name, d.color
     FROM   user_departments ud
     JOIN   departments d ON d.id = ud.department_id
     WHERE  ud.user_id = $1
     ORDER  BY d.name`,
    [user.id]
  );

  return {
    id:                 user.id,
    name:               user.name,
    email:              user.email,
    role:               user.role,
    mustChangePassword: !!user.must_change_password,
    permissions,
    departments,
  };
}

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
const login = async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const { rows: users } = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = TRUE',
      [email.toLowerCase().trim()]
    );

    if (!users.length) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = users[0];
    if (!await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token     = crypto.randomBytes(TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, user.id, expiresAt]
    );

    // Update last_login
    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const payload = await buildUserPayload(user);

    return res.status(200).json({ token, expiresAt: expiresAt.toISOString(), user: payload });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
const logout = async (req, res, next) => {
  const token = req.headers['authorization']?.slice(7);
  try {
    await pool.query('DELETE FROM sessions WHERE id = $1', [token]);
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────
const me = async (req, res, next) => {
  try {
    // Reload from DB so permissions/departments are always fresh
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const payload = await buildUserPayload(rows[0]);
    return res.status(200).json({ user: payload });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/auth/change-password ──────────────────────────────────────────
const changePassword = async (req, res, next) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2',
      [hash, req.user.id]
    );
    return res.status(200).json({ message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = { login, logout, me, changePassword };
