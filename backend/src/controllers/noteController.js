const pool = require('../config/db');

// ─── GET /api/experiences/:id/notes ──────────────────────────────────────────
const getNotes = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT n.id, n.content, n.created_at, u.name AS author_name
       FROM   experience_notes n
       JOIN   users u ON u.id = n.user_id
       WHERE  n.experience_id = $1
       ORDER  BY n.created_at ASC`,
      [id]
    );
    return res.json({ notes: rows });
  } catch (err) { next(err); }
};

// ─── POST /api/experiences/:id/notes ─────────────────────────────────────────
const addNote = async (req, res, next) => {
  const { id }       = req.params;
  const { content }  = req.body;

  if (!content?.trim()) return res.status(400).json({ error: 'Note content is required' });

  try {
    const { rows: [note] } = await pool.query(
      `INSERT INTO experience_notes (experience_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, content, created_at`,
      [id, req.user.id, content.trim()]
    );
    return res.status(201).json({ note: { ...note, author_name: req.user.name } });
  } catch (err) { next(err); }
};

// ─── DELETE /api/experiences/:expId/notes/:noteId ─────────────────────────────
const deleteNote = async (req, res, next) => {
  const { expId, noteId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT user_id FROM experience_notes WHERE id = $1 AND experience_id = $2',
      [noteId, expId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Note not found' });
    if (req.user.role !== 'admin' && rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Cannot delete another user\'s note' });
    }
    await pool.query('DELETE FROM experience_notes WHERE id = $1', [noteId]);
    return res.json({ message: 'Note deleted' });
  } catch (err) { next(err); }
};

module.exports = { getNotes, addNote, deleteNote };
