const path = require('path');
const pool = require('../config/db');

const MIME_TYPES = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',  '.webm': 'audio/webm',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
};

const getMimeType = (filename, fallback) => {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || fallback || 'application/octet-stream';
};

// ─── GET /api/experiences/:id/attachments ─────────────────────────────────────
const listAttachments = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT a.id, a.original_name, a.file_size_bytes, a.mime_type, a.created_at,
              u.name AS uploader_name
       FROM   experience_attachments a
       JOIN   users u ON u.id = a.uploaded_by
       WHERE  a.experience_id = $1
       ORDER  BY a.created_at ASC`,
      [id]
    );
    return res.status(200).json({ attachments: rows });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/experiences/:id/attachments ────────────────────────────────────
const addAttachment = async (req, res, next) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'A file is required' });

  try {
    const { rows: expRows } = await pool.query(
      'SELECT id FROM experiences WHERE id = $1', [id]
    );
    if (!expRows.length) return res.status(404).json({ error: 'Experience not found' });

    const mimeType = getMimeType(req.file.originalname, req.file.mimetype);

    const { rows: [attachment] } = await pool.query(
      `INSERT INTO experience_attachments
         (experience_id, original_name, file_size_bytes, mime_type, file_data, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, original_name, file_size_bytes, mime_type, created_at`,
      [id, req.file.originalname, req.file.size, mimeType, req.file.buffer, req.user.id]
    );

    return res.status(201).json({ attachment: { ...attachment, uploader_name: req.user.name } });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/experiences/:id/attachments/:attachId/file ──────────────────────
const streamAttachment = async (req, res, next) => {
  const { id, attachId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT file_data, mime_type, original_name FROM experience_attachments WHERE id=$1 AND experience_id=$2',
      [attachId, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Attachment not found' });

    const { file_data, mime_type, original_name } = rows[0];
    res.writeHead(200, {
      'Content-Length':      file_data.length,
      'Content-Type':        mime_type || getMimeType(original_name),
      'Content-Disposition': `attachment; filename="${original_name}"`,
    });
    res.end(file_data);
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/experiences/:id/attachments/:attachId ───────────────────────
const deleteAttachment = async (req, res, next) => {
  const { id, attachId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT uploaded_by FROM experience_attachments WHERE id=$1 AND experience_id=$2',
      [attachId, id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Attachment not found' });

    const isOwn  = rows[0].uploaded_by === req.user.id;
    const canDel = req.user.role === 'admin' || isOwn;
    if (!canDel) return res.status(403).json({ error: 'Permission denied' });

    await pool.query('DELETE FROM experience_attachments WHERE id=$1', [attachId]);
    return res.status(200).json({ message: 'Attachment deleted' });
  } catch (err) {
    next(err);
  }
};

module.exports = { listAttachments, addAttachment, streamAttachment, deleteAttachment };
