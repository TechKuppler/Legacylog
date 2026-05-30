const path = require('path');

const pool                       = require('../config/db');
const { enqueueTranscription }   = require('../utils/transcriptionQueue');
const { getContentFilter, canAccessExperience } = require('../utils/contentFilter');

// ─── File-type Constants ──────────────────────────────────────────────────────
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.webm']);
const WHISPER_MODEL    = 'whisper-1';

const MIME_TYPES = {
  '.mp3':  'audio/mpeg',
  '.wav':  'audio/wav',
  '.m4a':  'audio/mp4',
  '.ogg':  'audio/ogg',
  '.webm': 'audio/webm',
  '.pdf':  'application/pdf',
  '.doc':  'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt':  'text/plain',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const detectFileType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (AUDIO_EXTENSIONS.has(ext))         return 'audio';
  if (ext === '.pdf')                    return 'pdf';
  if (ext === '.doc' || ext === '.docx') return 'doc';
  if (ext === '.txt')                    return 'txt';
  return null;
};

const getMimeType = (filename, fallback) => {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || fallback || 'application/octet-stream';
};

const parseTagIds = (rawTagIds) => {
  if (!rawTagIds) return [];
  try {
    const ids = typeof rawTagIds === 'string' ? JSON.parse(rawTagIds) : rawTagIds;
    return Array.isArray(ids) ? ids.map(Number).filter(Boolean) : [];
  } catch {
    return [];
  }
};

// ─── GET /api/experiences ─────────────────────────────────────────────────────
const listExperiences = async (req, res, next) => {
  try {
    const { whereClause, params } = await getContentFilter(req.user);

    const { rows: experiences } = await pool.query(
      `SELECT e.id, e.title, e.type, e.original_name, e.file_size_bytes,
              e.language, e.created_at, e.updated_at, e.department_id,
              u.name      AS uploader_name,
              d.name      AS department_name,
              d.color     AS department_color,
              tj.status   AS transcription_status
       FROM   experiences e
       JOIN   users       u  ON u.id  = e.uploaded_by
       LEFT   JOIN departments      d  ON d.id  = e.department_id
       LEFT   JOIN transcription_jobs tj ON tj.experience_id = e.id
       WHERE  ${whereClause}
       ORDER  BY e.created_at DESC`,
      params
    );

    let tagsMap = {};
    if (experiences.length) {
      const ids = experiences.map((e) => e.id);
      const { rows: tagRows } = await pool.query(
        `SELECT et.experience_id, t.id, t.name
         FROM   experience_tags et
         JOIN   tags t ON t.id = et.tag_id
         WHERE  et.experience_id = ANY($1)`,
        [ids]
      );
      tagsMap = tagRows.reduce((acc, r) => {
        if (!acc[r.experience_id]) acc[r.experience_id] = [];
        acc[r.experience_id].push({ id: r.id, name: r.name });
        return acc;
      }, {});
    }

    const result = experiences.map((e) => ({ ...e, tags: tagsMap[e.id] || [] }));
    return res.status(200).json({ experiences: result });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/experiences/:id ─────────────────────────────────────────────────
const getExperience = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.title, e.type, e.original_name, e.file_size_bytes,
              e.language, e.created_at, e.updated_at, e.department_id,
              u.name      AS uploader_name,
              d.name      AS department_name,
              d.color     AS department_color,
              tj.status   AS transcription_status,
              tj.transcript,    tj.summary,       tj.chapters,
              tj.key_phrases,   tj.entities,      tj.sentiment,
              tj.confidence,    tj.audio_duration,tj.error_message,
              (e.file_data IS NOT NULL) AS has_file
       FROM   experiences e
       JOIN   users u ON u.id = e.uploaded_by
       LEFT   JOIN departments d ON d.id = e.department_id
       LEFT   JOIN transcription_jobs tj ON tj.experience_id = e.id
       WHERE  e.id = $1`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Experience not found' });

    if (req.user.role !== 'admin') {
      const ok = await canAccessExperience(req.user.id, Number(id));
      if (!ok) return res.status(404).json({ error: 'Experience not found' });
    }

    const { rows: tagRows } = await pool.query(
      `SELECT t.id, t.name FROM experience_tags et
       JOIN tags t ON t.id = et.tag_id WHERE et.experience_id = $1`,
      [id]
    );

    const exp = rows[0];
    return res.status(200).json({
      experience: {
        ...exp,
        tags:         tagRows,
        file_missing: !exp.has_file,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── POST /api/experiences ────────────────────────────────────────────────────
const createExperience = async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'A file is required' });

  const { title, language = 'en', tag_ids, department_id } = req.body;
  const file     = req.file;
  const fileType = detectFileType(file.originalname);

  if (!fileType) {
    return res.status(400).json({ error: 'Unsupported file type' });
  }

  const experienceTitle = (title || file.originalname).trim();
  const languageHint    = language === 'mixed' ? null : language;
  const tagIds          = parseTagIds(tag_ids);
  const deptId          = department_id ? Number(department_id) : null;
  const mimeType        = getMimeType(file.originalname, file.mimetype);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [{ id: experienceId }] } = await client.query(
      `INSERT INTO experiences
         (title, type, original_name, file_size_bytes, language, uploaded_by, department_id, file_data, mime_type)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [experienceTitle, fileType, file.originalname, file.size, language, req.user.id, deptId, file.buffer, mimeType]
    );

    for (const tid of tagIds) {
      await client.query(
        'INSERT INTO experience_tags (experience_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [experienceId, tid]
      );
    }

    if (fileType === 'audio') {
      await client.query(
        `INSERT INTO transcription_jobs (experience_id, status, whisper_model, language_hint)
         VALUES ($1,'queued',$2,$3)`,
        [experienceId, WHISPER_MODEL, languageHint]
      );
    }

    await client.query('COMMIT');
    if (fileType === 'audio') enqueueTranscription(experienceId);

    return res.status(201).json({ id: experienceId, message: 'Experience created successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
};

// ─── PATCH /api/experiences/:id ───────────────────────────────────────────────
const updateExperience = async (req, res, next) => {
  const { id }             = req.params;
  const { title, tag_ids } = req.body;

  try {
    const { rows: existing } = await pool.query(
      'SELECT id FROM experiences WHERE id = $1', [id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Experience not found' });

    if (title?.trim()) {
      await pool.query(
        'UPDATE experiences SET title = $1, updated_at = NOW() WHERE id = $2',
        [title.trim(), id]
      );
    }

    if (Array.isArray(tag_ids)) {
      await pool.query('DELETE FROM experience_tags WHERE experience_id = $1', [id]);
      for (const tid of tag_ids) {
        await pool.query(
          'INSERT INTO experience_tags (experience_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [id, tid]
        );
      }
    }

    return res.status(200).json({ message: 'Experience updated successfully' });
  } catch (err) {
    next(err);
  }
};

// ─── DELETE /api/experiences/:id ──────────────────────────────────────────────
const deleteExperience = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT uploaded_by FROM experiences WHERE id = $1', [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Experience not found' });

    const isOwn  = rows[0].uploaded_by === req.user.id;
    const canDel = req.user.role === 'admin' ||
                   (req.user.permissions?.can_delete_own && isOwn);
    if (!canDel) {
      return res.status(403).json({ error: 'You do not have permission to delete this experience' });
    }

    // Cascade handles experience_tags, transcription_jobs, experience_notes
    // file_data (BYTEA) is part of the row — deleted automatically
    await pool.query('DELETE FROM experiences WHERE id = $1', [id]);

    return res.status(200).json({ message: 'Experience deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// ─── GET /api/experiences/:id/file ────────────────────────────────────────────
const streamFile = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT file_data, mime_type, original_name, type FROM experiences WHERE id = $1', [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Experience not found' });

    const { file_data, mime_type, original_name, type } = rows[0];

    if (!file_data) return res.status(404).json({ error: 'File not found' });

    const buffer      = file_data; // Buffer returned by pg for BYTEA
    const fileSize    = buffer.length;
    const contentType = mime_type || getMimeType(original_name);
    const rangeHeader = req.headers['range'];

    if (type === 'audio' && rangeHeader) {
      const [startStr, endStr] = rangeHeader.replace(/bytes=/, '').split('-');
      const start     = parseInt(startStr, 10);
      const end       = endStr ? parseInt(endStr, 10) : fileSize - 1;
      const chunk     = buffer.slice(start, end + 1);
      res.writeHead(206, {
        'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges':  'bytes',
        'Content-Length': chunk.length,
        'Content-Type':   contentType,
      });
      res.end(chunk);
    } else {
      const disposition = (type === 'audio' || type === 'pdf')
        ? `inline; filename="${original_name}"`
        : `attachment; filename="${original_name}"`;
      res.writeHead(200, {
        'Content-Length':      fileSize,
        'Content-Type':        contentType,
        'Content-Disposition': disposition,
        'Accept-Ranges':       'bytes',
      });
      res.end(buffer);
    }
  } catch (err) {
    next(err);
  }
};

// ─── PUT /api/experiences/:id/file ───────────────────────────────────────────
const replaceFile = async (req, res, next) => {
  const { id } = req.params;
  if (!req.file) return res.status(400).json({ error: 'A file is required' });

  try {
    const { rows } = await pool.query('SELECT * FROM experiences WHERE id = $1', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Experience not found' });

    const exp = rows[0];
    if (req.user.role !== 'admin' && exp.uploaded_by !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const fileType = detectFileType(req.file.originalname);
    if (!fileType) return res.status(400).json({ error: 'Unsupported file type' });

    const mimeType = getMimeType(req.file.originalname, req.file.mimetype);

    await pool.query(
      `UPDATE experiences
       SET original_name=$1, file_size_bytes=$2, type=$3,
           file_data=$4, mime_type=$5, updated_at=NOW()
       WHERE id=$6`,
      [req.file.originalname, req.file.size, fileType, req.file.buffer, mimeType, id]
    );

    if (fileType === 'audio') {
      const langHint = exp.language !== 'mixed' ? exp.language : null;
      await pool.query(
        `INSERT INTO transcription_jobs (experience_id, status, whisper_model, language_hint)
         VALUES ($1,'queued',$2,$3)
         ON CONFLICT (experience_id) DO UPDATE
           SET status='queued', transcript=NULL, summary=NULL, chapters=NULL,
               key_phrases=NULL, entities=NULL, sentiment=NULL, confidence=NULL,
               audio_duration=NULL, error_message=NULL, assembly_id=NULL, updated_at=NOW()`,
        [id, WHISPER_MODEL, langHint]
      );
      enqueueTranscription(id);
    }

    return res.status(200).json({ message: 'File replaced successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  listExperiences, getExperience, createExperience,
  updateExperience, deleteExperience, streamFile, replaceFile,
};
