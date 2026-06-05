const fetch = require('node-fetch');
const pool  = require('../config/db');

const BASE     = 'https://api.assemblyai.com/v2';
const getKey   = () => process.env.ASSEMBLYAI_API_KEY;
const authHdr  = () => ({ authorization: getKey() });

// ─── In-Memory Queue ──────────────────────────────────────────────────────────
const queue        = [];
let   isProcessing = false;

const enqueueTranscription = (experienceId) => {
  if (!queue.includes(experienceId)) {
    queue.push(experienceId);
    console.log(`[Queue] Enqueued experience #${experienceId} — depth: ${queue.length}`);
  }
  if (!isProcessing) processNext();
};

// ─── Upload file buffer to AssemblyAI ────────────────────────────────────────
async function uploadAudio(fileBuffer) {
  const res = await fetch(`${BASE}/upload`, {
    method:  'POST',
    headers: { ...authHdr(), 'Content-Type': 'application/octet-stream' },
    body:    fileBuffer,
  });
  if (!res.ok) throw new Error(`AssemblyAI upload error ${res.status}: ${await res.text()}`);
  const { upload_url } = await res.json();
  return upload_url;
}

// ─── Submit transcription job ─────────────────────────────────────────────────
async function submitTranscription(audioUrl, languageHint) {
  // For 'mixed' or 'gu' (Gujarati) let AssemblyAI auto-detect
  const useDetection = !languageHint || languageHint === 'mixed' || languageHint === 'gu';

  const body = {
    audio_url:          audioUrl,
    auto_chapters:      true,   // provides per-chapter gist/headline/summary
    auto_highlights:    true,
    entity_detection:   true,
    sentiment_analysis: true,
    // summarization is mutually exclusive with auto_chapters — omitted
  };

  if (useDetection) {
    body.language_detection = true;
  } else {
    body.language_code = languageHint; // 'en' or 'hi'
  }

  const res = await fetch(`${BASE}/transcript`, {
    method:  'POST',
    headers: { ...authHdr(), 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AssemblyAI submit error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

// ─── Poll until done ──────────────────────────────────────────────────────────
async function pollUntilDone(assemblyId) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const res = await fetch(`${BASE}/transcript/${assemblyId}`, { headers: authHdr() });
    if (!res.ok) throw new Error(`AssemblyAI poll error ${res.status}`);
    const data = await res.json();
    if (data.status === 'completed' || data.status === 'error') return data;
  }
}

// ─── Extract key phrases from auto_highlights ─────────────────────────────────
function extractKeyPhrases(result) {
  const items = result.auto_highlights_result?.results || [];
  return items
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 20)
    .map((h) => ({ text: h.text, count: h.count, rank: h.rank }));
}

// ─── Extract entities ─────────────────────────────────────────────────────────
function extractEntities(result) {
  const raw = result.entities || [];
  // Deduplicate by text + type
  const seen = new Set();
  return raw.filter((e) => {
    const key = `${e.entity_type}::${e.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((e) => ({ type: e.entity_type, text: e.text }));
}

// ─── Sentiment summary ────────────────────────────────────────────────────────
function summariseSentiment(result) {
  const raw = result.sentiment_analysis_results || [];
  const counts = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0 };
  raw.forEach((s) => { counts[s.sentiment] = (counts[s.sentiment] || 0) + 1; });
  const total = raw.length || 1;
  return {
    positive: Math.round((counts.POSITIVE / total) * 100),
    neutral:  Math.round((counts.NEUTRAL  / total) * 100),
    negative: Math.round((counts.NEGATIVE / total) * 100),
    sentences: raw.slice(0, 30).map((s) => ({ text: s.text, sentiment: s.sentiment })),
  };
}

// ─── Process Loop ─────────────────────────────────────────────────────────────
const processNext = async () => {
  if (!queue.length) { isProcessing = false; return; }
  isProcessing       = true;
  const experienceId = queue.shift();
  console.log(`[Queue] Transcribing experience #${experienceId} via AssemblyAI`);

  try {
    const { rows } = await pool.query(
      `SELECT tj.id, tj.language_hint, e.file_data
       FROM   transcription_jobs tj
       JOIN   experiences e ON e.id = tj.experience_id
       WHERE  tj.experience_id = $1`,
      [experienceId]
    );

    if (!rows.length) {
      console.warn(`[Queue] No job found for experience #${experienceId} – skipping`);
      return processNext();
    }

    const { id: jobId, language_hint, file_data } = rows[0];

    await pool.query(
      `UPDATE transcription_jobs SET status='processing', started_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [jobId]
    );

    if (!file_data) throw new Error('Audio file data not found in database');

    // 1. Upload audio buffer to AssemblyAI
    const uploadUrl   = await uploadAudio(file_data);

    // 2. Submit transcription with all features
    const assemblyId  = await submitTranscription(uploadUrl, language_hint);

    // 3. Store the AssemblyAI job ID immediately
    await pool.query(
      `UPDATE transcription_jobs SET assembly_id=$1, updated_at=NOW() WHERE id=$2`,
      [assemblyId, jobId]
    );

    // 4. Poll until done
    const result      = await pollUntilDone(assemblyId);

    if (result.status === 'error') {
      throw new Error(result.error || 'AssemblyAI transcription error');
    }

    const transcript  = result.text || '';
    const chapters    = (result.chapters  || []).map((c) => ({
      gist:     c.gist,
      headline: c.headline,
      summary:  c.summary,
      start:    c.start,
      end:      c.end,
    }));
    const keyPhrases  = extractKeyPhrases(result);
    const entities    = extractEntities(result);
    const sentiment   = summariseSentiment(result);
    const summary     = result.summary || '';
    const confidence  = result.confidence != null ? Math.round(result.confidence * 100) / 100 : null;
    const duration    = result.audio_duration != null ? Math.round(result.audio_duration / 1000) : null;

    await pool.query(
      `UPDATE transcription_jobs
       SET    status='done', transcript=$1, summary=$2, chapters=$3,
              key_phrases=$4, entities=$5, sentiment=$6, confidence=$7,
              audio_duration=$8, completed_at=NOW(), updated_at=NOW()
       WHERE  id=$9`,
      [
        transcript,
        summary,
        JSON.stringify(chapters),
        JSON.stringify(keyPhrases),
        JSON.stringify(entities),
        JSON.stringify(sentiment),
        confidence,
        duration,
        jobId,
      ]
    );

    // Update experience duration
    if (duration) {
      await pool.query(`UPDATE experiences SET duration_secs=$1 WHERE id=$2`, [duration, experienceId]);
    }

    console.log(`[Queue] Experience #${experienceId} done — ${transcript.length} chars, ${chapters.length} chapters`);
  } catch (err) {
    console.error(`[Queue] Failed for experience #${experienceId}: ${err.message}`);
    await pool.query(
      `UPDATE transcription_jobs SET status='failed', error_message=$1, updated_at=NOW() WHERE experience_id=$2`,
      [err.message, experienceId]
    ).catch((e) => console.error('[Queue] DB error marking failed:', e.message));
  }

  processNext();
};

module.exports = { enqueueTranscription };
