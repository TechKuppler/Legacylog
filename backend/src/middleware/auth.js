const pool = require('../config/db');

// ─── Token Constants ──────────────────────────────────────────────────────────
const TOKEN_LENGTH  = 64;
const BEARER_PREFIX = 'Bearer ';

// ─── Admin permission set (always full) ──────────────────────────────────────
const ADMIN_PERMISSIONS = {
  can_upload: true, can_record: true, can_create_tags: true,
  can_delete_own: true, can_view_transcripts: true,
  can_download_files: true, can_view_chat: true,
};

// ─── requireAuth ──────────────────────────────────────────────────────────────
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers['authorization'];

  // Accept token from Authorization header OR query param (needed for iframe/PDF embeds)
  let token;
  if (authHeader && authHeader.startsWith(BEARER_PREFIX)) {
    token = authHeader.slice(BEARER_PREFIX.length);
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token || token.length !== TOKEN_LENGTH) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { rows } = await pool.query(
      `SELECT s.expires_at,
              u.id, u.name, u.email, u.role, u.is_active, u.must_change_password,
              up.can_upload, up.can_record, up.can_create_tags, up.can_delete_own,
              up.can_view_transcripts, up.can_download_files, up.can_view_chat
       FROM   sessions s
       JOIN   users    u  ON u.id  = s.user_id
       LEFT   JOIN user_permissions up ON up.user_id = u.id
       WHERE  s.id = $1 AND s.expires_at > NOW()`,
      [token]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ error: 'Session expired or user inactive' });
    }

    const u       = rows[0];
    const isAdmin = u.role === 'admin';

    req.user = {
      id:                 u.id,
      name:               u.name,
      email:              u.email,
      role:               u.role,
      mustChangePassword: !!u.must_change_password,
      permissions: isAdmin
        ? ADMIN_PERMISSIONS
        : {
            can_upload:           !!u.can_upload,
            can_record:           !!u.can_record,
            can_create_tags:      !!u.can_create_tags,
            can_delete_own:       !!u.can_delete_own,
            can_view_transcripts: u.can_view_transcripts !== null ? !!u.can_view_transcripts : true,
            can_download_files:   !!u.can_download_files,
            can_view_chat:        !!u.can_view_chat,
          },
    };

    next();
  } catch (err) {
    next(err);
  }
};

// ─── requirePermission (flag-based) ──────────────────────────────────────────
const requirePermission = (flag) => (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  if (!req.user?.permissions?.[flag]) {
    return res.status(403).json({ error: `Permission denied: ${flag} required` });
  }
  next();
};

// ─── requireAdmin ─────────────────────────────────────────────────────────────
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

module.exports = { requireAuth, requirePermission, requireAdmin };
