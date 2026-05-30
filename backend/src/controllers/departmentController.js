const pool = require('../config/db');

// ─── GET /api/departments ─────────────────────────────────────────────────────
const listDepartments = async (_req, res, next) => {
  try {
    const { rows: depts } = await pool.query(
      `SELECT d.id, d.name, d.description, d.color, d.is_active, d.created_at,
              COUNT(DISTINCT ud.user_id)::int AS member_count
       FROM   departments d
       LEFT   JOIN user_departments ud ON ud.department_id = d.id
       WHERE  d.is_active = TRUE
       GROUP  BY d.id
       ORDER  BY d.name`
    );

    if (!depts.length) return res.json({ departments: [] });

    // Attach tags per department
    const ids = depts.map((d) => d.id);
    const { rows: tagRows } = await pool.query(
      `SELECT dt.department_id, t.id, t.name
       FROM   department_tags dt
       JOIN   tags t ON t.id = dt.tag_id
       WHERE  dt.department_id = ANY($1)
       ORDER  BY t.name`,
      [ids]
    );

    const tagMap = tagRows.reduce((acc, r) => {
      if (!acc[r.department_id]) acc[r.department_id] = [];
      acc[r.department_id].push({ id: r.id, name: r.name });
      return acc;
    }, {});

    const result = depts.map((d) => ({ ...d, tags: tagMap[d.id] || [] }));
    return res.json({ departments: result });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/departments ────────────────────────────────────────────────────
const createDepartment = async (req, res, next) => {
  const { name, description, color = '#185FA5', tag_ids = [] } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ error: 'Department name is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [{ id: deptId }] } = await client.query(
      `INSERT INTO departments (name, description, color, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [name.trim(), description || null, color, req.user.id]
    );

    for (const tagId of tag_ids) {
      await client.query(
        'INSERT INTO department_tags (department_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [deptId, tagId]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ department: { id: deptId, name: name.trim() } });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Department name already exists' });
    next(err);
  } finally {
    client.release();
  }
};

// ─── PATCH /api/departments/:id ───────────────────────────────────────────────
const updateDepartment = async (req, res, next) => {
  const deptId = Number(req.params.id);
  const { name, description, color, tag_ids, is_active } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const setClauses = [];
    const vals       = [];
    if (name        !== undefined) { setClauses.push(`name = $${vals.length + 1}`);        vals.push(name.trim()); }
    if (description !== undefined) { setClauses.push(`description = $${vals.length + 1}`); vals.push(description); }
    if (color       !== undefined) { setClauses.push(`color = $${vals.length + 1}`);       vals.push(color); }
    if (is_active   !== undefined) { setClauses.push(`is_active = $${vals.length + 1}`);   vals.push(!!is_active); }
    if (setClauses.length) {
      setClauses.push(`updated_at = NOW()`);
      vals.push(deptId);
      await client.query(
        `UPDATE departments SET ${setClauses.join(', ')} WHERE id = $${vals.length}`,
        vals
      );
    }

    // Full tag replacement when provided
    if (Array.isArray(tag_ids)) {
      await client.query('DELETE FROM department_tags WHERE department_id = $1', [deptId]);
      for (const tagId of tag_ids) {
        await client.query(
          'INSERT INTO department_tags (department_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [deptId, tagId]
        );
      }
    }

    await client.query('COMMIT');
    return res.json({ message: 'Department updated' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── DELETE /api/departments/:id (soft delete) ────────────────────────────────
const deleteDepartment = async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE departments SET is_active = FALSE, updated_at = NOW() WHERE id = $1',
      [req.params.id]
    );
    return res.json({ message: 'Department deactivated' });
  } catch (err) {
    next(err);
  }
};

module.exports = { listDepartments, createDepartment, updateDepartment, deleteDepartment };
