const pool = require('../config/db');

const MAX_TAG_NAME_LENGTH = 80;

// ─── GET /api/tags ────────────────────────────────────────────────────────────
// Admin: all tags. Member: only tags belonging to their departments.
const listTags = async (req, res, next) => {
  try {
    if (req.user.role === 'admin') {
      const { rows: tags } = await pool.query(
        'SELECT id, name, is_predefined FROM tags ORDER BY is_predefined DESC, name ASC'
      );
      return res.status(200).json({ tags });
    }

    // Member: find their departments, then return tags linked to those departments
    const { rows: depts } = await pool.query(
      'SELECT department_id FROM user_departments WHERE user_id = $1',
      [req.user.id]
    );
    const deptIds = depts.map((d) => d.department_id);

    if (!deptIds.length) return res.status(200).json({ tags: [] });

    const { rows: tags } = await pool.query(
      `SELECT DISTINCT t.id, t.name, t.is_predefined
       FROM   tags t
       JOIN   department_tags dt ON dt.tag_id = t.id
       WHERE  dt.department_id = ANY($1)
       ORDER  BY t.is_predefined DESC, t.name ASC`,
      [deptIds]
    );

    return res.status(200).json({ tags });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/tags ───────────────────────────────────────────────────────────
// Admin: creates tag globally. Member (if can_create_tags): creates tag and
// links it to one of their departments (department_id must be provided).
const createTag = async (req, res, next) => {
  const { name, department_id } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: 'Tag name is required' });
  const trimmedName = name.trim();
  if (trimmedName.length > MAX_TAG_NAME_LENGTH) {
    return res.status(400).json({ error: `Tag name cannot exceed ${MAX_TAG_NAME_LENGTH} characters` });
  }

  try {
    // For members, verify they belong to the given department
    if (req.user.role !== 'admin' && department_id) {
      const { rows: check } = await pool.query(
        'SELECT 1 FROM user_departments WHERE user_id = $1 AND department_id = $2',
        [req.user.id, department_id]
      );
      if (!check.length) {
        return res.status(403).json({ error: 'You cannot create tags for that department' });
      }
    }

    const { rows: existing } = await pool.query(
      'SELECT id, name, is_predefined FROM tags WHERE name = $1',
      [trimmedName]
    );

    let tag;
    if (existing.length) {
      tag = existing[0];
    } else {
      const { rows: [newTag] } = await pool.query(
        'INSERT INTO tags (name, is_predefined, created_by) VALUES ($1, FALSE, $2) RETURNING id, name, is_predefined',
        [trimmedName, req.user.id]
      );
      tag = newTag;

      // Link new tag to department if provided
      if (department_id) {
        await pool.query(
          'INSERT INTO department_tags (department_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [department_id, tag.id]
        );
      }
    }

    return res.status(201).json({ tag });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/tags/:id (admin only) ───────────────────────────────────────
const deleteTag = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query('SELECT id FROM tags WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Tag not found' });
    await pool.query('DELETE FROM tags WHERE id = $1', [id]);
    return res.status(200).json({ message: 'Tag deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { listTags, createTag, deleteTag };
