const pool                   = require('../config/db');
const { enqueueTranscription } = require('../utils/transcriptionQueue');

// ─── GET /api/transcription/:experienceId ─────────────────────────────────────
const getTranscriptionStatus = async (req, res, next) => {
  const { experienceId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT status, transcript, summary, chapters, key_phrases, entities,
              sentiment, confidence, audio_duration, error_message,
              started_at, completed_at
       FROM   transcription_jobs
       WHERE  experience_id = $1`,
      [experienceId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No transcription job found' });
    return res.status(200).json({ job: rows[0] });
  } catch (err) { next(err); }
};

// ─── POST /api/transcription/:experienceId/retry ──────────────────────────────
const retryTranscription = async (req, res, next) => {
  const { experienceId } = req.params;
  try {
    const { rows } = await pool.query(
      'SELECT id, status FROM transcription_jobs WHERE experience_id = $1',
      [experienceId]
    );
    if (!rows.length) return res.status(404).json({ error: 'No transcription job found' });
    if (rows[0].status === 'processing') {
      return res.status(400).json({ error: 'Transcription is currently processing — please wait' });
    }

    await pool.query(
      `UPDATE transcription_jobs
       SET    status='queued', error_message=NULL, assembly_id=NULL,
              summary=NULL, chapters=NULL, key_phrases=NULL, entities=NULL,
              sentiment=NULL, confidence=NULL, audio_duration=NULL,
              started_at=NULL, completed_at=NULL, updated_at=NOW()
       WHERE  experience_id = $1`,
      [experienceId]
    );

    enqueueTranscription(Number(experienceId));
    return res.status(200).json({ message: 'Re-queued for AssemblyAI processing' });
  } catch (err) { next(err); }
};

module.exports = { getTranscriptionStatus, retryTranscription };
