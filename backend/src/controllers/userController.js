const bcrypt = require('bcrypt');
const pool   = require('../config/db');

const BCRYPT_COST = 12;

// ─── GET /api/users ───────────────────────────────────────────────────────────
const listUsers = async (_req, res, next) => {
  try {
    const { rows: users } = await pool.query(
      `SELECT u.id, u.name, u.email, u.role, u.is_active,
              u.must_change_password, u.last_login, u.created_at,
              up.can_upload, up.can_record, up.can_create_tags, up.can_delete_own,
              up.can_view_transcripts, up.can_download_files, up.can_view_chat
       FROM   users u
       LEFT   JOIN user_permissions up ON up.user_id = u.id
       ORDER  BY u.created_at DESC`
    );

    if (!users.length) return res.json({ users: [] });

    // Batch-load departments per user
    const ids = users.map((u) => u.id);
    const { rows: deptRows } = await pool.query(
      `SELECT ud.user_id, d.id, d.name, d.color
       FROM   user_departments ud
       JOIN   departments d ON d.id = ud.department_id
       WHERE  ud.user_id = ANY($1)`,
      [ids]
    );

    const deptMap = deptRows.reduce((acc, r) => {
      if (!acc[r.user_id]) acc[r.user_id] = [];
      acc[r.user_id].push({ id: r.id, name: r.name, color: r.color });
      return acc;
    }, {});

    // Batch-load direct tags per user
    const { rows: tagRows } = await pool.query(
      `SELECT ut.user_id, t.id, t.name
       FROM   user_tags ut
       JOIN   tags t ON t.id = ut.tag_id
       WHERE  ut.user_id = ANY($1)`,
      [ids]
    );
    const tagMap = tagRows.reduce((acc, r) => {
      if (!acc[r.user_id]) acc[r.user_id] = [];
      acc[r.user_id].push({ id: r.id, name: r.name });
      return acc;
    }, {});

    const result = users.map((u) => ({
      id:                  u.id,
      name:                u.name,
      email:               u.email,
      role:                u.role,
      is_active:           u.is_active,
      must_change_password: u.must_change_password,
      last_login:          u.last_login,
      created_at:          u.created_at,
      departments:         deptMap[u.id] || [],
      directTags:          tagMap[u.id]  || [],
      permissions: u.role === 'admin' ? null : {
        can_upload:           !!u.can_upload,
        can_record:           !!u.can_record,
        can_create_tags:      !!u.can_create_tags,
        can_delete_own:       !!u.can_delete_own,
        can_view_transcripts: u.can_view_transcripts !== null ? !!u.can_view_transcripts : true,
        can_download_files:   !!u.can_download_files,
        can_view_chat:        !!u.can_view_chat,
      },
    }));

    return res.json({ users: result });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/users ──────────────────────────────────────────────────────────
const createUser = async (req, res, next) => {
  const {
    name, email, password,
    role           = 'member',
    department_ids = [],
    permissions    = {},
  } = req.body;

  if (!name?.trim() || !email?.trim() || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'role must be admin or member' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existing } = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (existing.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Email already in use' });
    }

    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const { rows: [{ id: userId }] } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, must_change_password)
       VALUES ($1, $2, $3, $4, TRUE)
       RETURNING id`,
      [name.trim(), email.toLowerCase().trim(), hash, role]
    );

    // Insert permissions row for members
    if (role === 'member') {
      await client.query(
        `INSERT INTO user_permissions
           (user_id, can_upload, can_record, can_create_tags, can_delete_own,
            can_view_transcripts, can_download_files, can_view_chat, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          userId,
          !!permissions.can_upload,
          !!permissions.can_record,
          !!permissions.can_create_tags,
          !!permissions.can_delete_own,
          permissions.can_view_transcripts !== false,
          !!permissions.can_download_files,
          !!permissions.can_view_chat,
          req.user.id,
        ]
      );
    }

    // Assign departments
    for (const deptId of department_ids) {
      await client.query(
        'INSERT INTO user_departments (user_id, department_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [userId, deptId, req.user.id]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({
      message: 'User created successfully',
      user: { id: userId, name: name.trim(), email: email.toLowerCase().trim(), role },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── PATCH /api/users/:id ─────────────────────────────────────────────────────
const updateUser = async (req, res, next) => {
  const userId = Number(req.params.id);
  const { name, role, is_active, department_ids, permissions } = req.body;

  if (userId === req.user.id && is_active === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update base user fields
    const setClauses = [];
    const vals       = [];
    if (name      !== undefined) { setClauses.push(`name = $${vals.length + 1}`);      vals.push(name.trim()); }
    if (role      !== undefined) { setClauses.push(`role = $${vals.length + 1}`);      vals.push(role); }
    if (is_active !== undefined) { setClauses.push(`is_active = $${vals.length + 1}`); vals.push(!!is_active); }
    if (setClauses.length) {
      vals.push(userId);
      await client.query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${vals.length}`,
        vals
      );
    }

    // Kill sessions if deactivating
    if (is_active === false) {
      await client.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    }

    // Replace department assignments (full replace when provided)
    if (Array.isArray(department_ids)) {
      await client.query('DELETE FROM user_departments WHERE user_id = $1', [userId]);
      for (const deptId of department_ids) {
        await client.query(
          'INSERT INTO user_departments (user_id, department_id, assigned_by) VALUES ($1,$2,$3)',
          [userId, deptId, req.user.id]
        );
      }
    }

    // Partial permissions update
    if (permissions && typeof permissions === 'object') {
      const PERM_KEYS = [
        'can_upload','can_record','can_create_tags','can_delete_own',
        'can_view_transcripts','can_download_files','can_view_chat',
      ];
      const permSet  = [];
      const permVals = [];
      for (const key of PERM_KEYS) {
        if (permissions[key] !== undefined) {
          permSet.push(`${key} = $${permSet.length + 1}`);
          permVals.push(!!permissions[key]);
        }
      }
      if (permSet.length) {
        permVals.push(req.user.id, userId);
        // Upsert: ensure permission row exists first
        await client.query(
          `INSERT INTO user_permissions (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
          [userId]
        );
        await client.query(
          `UPDATE user_permissions SET ${permSet.join(', ')}, updated_by = $${permVals.length - 1}, updated_at = NOW()
           WHERE user_id = $${permVals.length}`,
          permVals
        );
      }
    }

    await client.query('COMMIT');
    return res.json({ message: 'User updated successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── DELETE /api/users/:id (soft delete / deactivate) ─────────────────────────
const deleteUser = async (req, res, next) => {
  const userId = Number(req.params.id);
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account' });
  }
  try {
    await pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [userId]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    return res.json({ message: 'User deactivated' });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/users/:id/reset-password ───────────────────────────────────────
const resetPassword = async (req, res, next) => {
  const userId      = Number(req.params.id);
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const hash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await pool.query(
      'UPDATE users SET password_hash = $1, must_change_password = TRUE WHERE id = $2',
      [hash, userId]
    );
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    return res.json({ message: 'Password reset. User must log in again.' });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/users/:id/tags ──────────────────────────────────────────────────
const getUserTags = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.name, t.is_predefined
       FROM   user_tags ut
       JOIN   tags t ON t.id = ut.tag_id
       WHERE  ut.user_id = $1
       ORDER  BY t.name`,
      [id]
    );
    return res.json({ tags: rows });
  } catch (err) { next(err); }
};

// ─── PUT /api/users/:id/tags ──────────────────────────────────────────────────
// Full replace — body: { tag_ids: number[] }
const setUserTags = async (req, res, next) => {
  const { id }       = req.params;
  const { tag_ids = [] } = req.body;
  const adminId      = req.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM user_tags WHERE user_id = $1', [id]);
    for (const tagId of tag_ids) {
      await client.query(
        'INSERT INTO user_tags (user_id, tag_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [id, tagId, adminId]
      );
    }
    await client.query('COMMIT');
    return res.json({ message: 'User tags updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

module.exports = { listUsers, createUser, updateUser, deleteUser, resetPassword, getUserTags, setUserTags };
