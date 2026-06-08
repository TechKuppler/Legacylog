'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import {
  StatusBadge, TypeBadge, Spinner, EmptyState,
  formatDate, formatFileSize, formatTime,
} from '@/components/ui';
import { apiGet, apiPost, apiPatch, downloadFile, getFileStreamUrl, getNotes, addNote, deleteNote, replaceExperienceFile, getAttachments, addAttachment, deleteAttachment, getAttachmentUrl } from '@/lib/api';
import { subscribe as subscribeUploads, getPendingCount } from '@/lib/uploadQueue';
import { useAuth, usePermissions } from '@/lib/AuthContext';

// ─── Inline PDF Viewer (pdfjs-dist, mobile-friendly) ─────────────────────────
function PDFViewer({ src, token }) {
  const containerRef  = useRef(null);
  const [pdfDoc,      setPdfDoc]      = useState(null);
  const [numPages,    setNumPages]    = useState(0);
  const [scale,       setScale]       = useState(1.2);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const canvasRefs    = useRef([]);

  // Load PDF.js lazily (avoids SSR issues)
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const res = await fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) throw new Error(`Failed to load PDF (HTTP ${res.status})`);
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;

        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [src, token]);

  // Re-render all pages when doc or scale changes
  useEffect(() => {
    if (!pdfDoc) return;
    (async () => {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const canvas = canvasRefs.current[i - 1];
        if (!canvas) continue;
        const page     = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale });
        canvas.width   = viewport.width;
        canvas.height  = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      }
    })();
  }, [pdfDoc, scale]);

  const zoomIn  = () => setScale((s) => Math.min(s + 0.25, 3));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.5rem 0.875rem', borderBottom: '1px solid var(--border)',
        background: 'var(--surface-2)',
      }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600, flex: 1 }}>
          {numPages > 0 ? `${numPages} page${numPages > 1 ? 's' : ''}` : 'PDF'}
        </span>
        <button onClick={zoomOut} disabled={scale <= 0.5} style={{
          padding: '0.25rem 0.6rem', borderRadius: 'var(--r-sm)',
          background: 'var(--surface-3)', border: '1px solid var(--border)',
          color: 'var(--text-2)', cursor: 'pointer', fontSize: '0.85rem',
        }}>−</button>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-2)', minWidth: '3rem', textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </span>
        <button onClick={zoomIn} disabled={scale >= 3} style={{
          padding: '0.25rem 0.6rem', borderRadius: 'var(--r-sm)',
          background: 'var(--surface-3)', border: '1px solid var(--border)',
          color: 'var(--text-2)', cursor: 'pointer', fontSize: '0.85rem',
        }}>+</button>
      </div>

      {/* Canvas scroll area */}
      <div ref={containerRef} style={{
        overflowX: 'auto', overflowY: 'auto',
        maxHeight: '70vh', padding: '1rem',
        touchAction: 'pan-x pan-y',
        background: '#525659',
        display: 'flex', flexDirection: 'column', gap: '0.75rem', alignItems: 'center',
      }}>
        {loading && (
          <div style={{ padding: '3rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ccc' }}>
            <Spinner /> Loading PDF…
          </div>
        )}
        {error && (
          <p style={{ color: '#f85149', padding: '2rem', fontSize: '0.85rem' }}>⚠ {error}</p>
        )}
        {!loading && !error && Array.from({ length: numPages }, (_, i) => (
          <canvas
            key={i}
            ref={(el) => { canvasRefs.current[i] = el; }}
            style={{ maxWidth: '100%', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', borderRadius: '2px' }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Custom Audio Player ──────────────────────────────────────────────────────
function AudioPlayer({ src, token }) {
  const audioRef  = useRef(null);
  const [playing,  setPlaying]  = useState(false);
  const [current,  setCurrent]  = useState(0);
  const [duration, setDuration] = useState(0);
  const [blobUrl,  setBlobUrl]  = useState('');

  useEffect(() => {
    let url;
    fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.blob())
      .then((blob) => { url = URL.createObjectURL(blob); setBlobUrl(url); })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [src, token]);

  // WebM/Ogg from MediaRecorder has no duration header — seek to Infinity
  // to force the browser to scan the file and report the real duration.
  const handleLoadedMetadata = () => {
    const a = audioRef.current; if (!a) return;
    const d = a.duration;
    if (isFinite(d) && d > 0) { setDuration(d); return; }
    // Duration is Infinity — trigger browser scan
    a.currentTime = 1e101;
  };
  const handleDurationChange = () => {
    const a = audioRef.current; if (!a) return;
    const d = a.duration;
    if (isFinite(d) && d > 0) {
      setDuration(d);
      // Reset playhead to beginning after the scan seek
      if (a.currentTime > d) a.currentTime = 0;
    }
  };

  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else a.play().then(() => setPlaying(true)).catch(() => {});
  };
  const pct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="card">
      <p className="section-label" style={{ marginBottom: '0.875rem' }}>Audio Player</p>
      {blobUrl && (
        <audio ref={audioRef} src={blobUrl} preload="metadata"
          onTimeUpdate={() => setCurrent(audioRef.current?.currentTime || 0)}
          onLoadedMetadata={handleLoadedMetadata}
          onDurationChange={handleDurationChange}
          onEnded={() => { setPlaying(false); setCurrent(0); }}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        <button onClick={toggle} disabled={!blobUrl} style={{
          width: '2.25rem', height: '2.25rem', borderRadius: '50%', flexShrink: 0,
          background: blobUrl ? 'var(--brand-gradient)' : 'var(--surface-3)',
          border: 'none', cursor: blobUrl ? 'pointer' : 'default',
          color: '#fff', fontSize: '0.875rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: blobUrl ? '0 0 8px rgba(224,50,40,0.35)' : 'none',
        }}>
          {!blobUrl ? <span className="spinner" style={{ width: '0.8rem', height: '0.8rem' }} />
          : playing ? '⏸' : '▶'}
        </button>
        <span style={{ fontSize: '0.78rem', color: 'var(--text-2)', minWidth: '4.5rem', fontWeight: 600 }}>
          {formatTime(current)} / {duration > 0 ? formatTime(duration) : '--:--'}
        </span>
        <input type="range" className="seek-bar" min={0} max={duration > 0 ? duration : 100} step={0.1} value={current}
          disabled={duration === 0}
          onChange={(e) => { if (audioRef.current) audioRef.current.currentTime = Number(e.target.value); setCurrent(Number(e.target.value)); }}
          style={{ background: `linear-gradient(to right, var(--brand) ${pct}%, var(--surface-3) ${pct}%)` }}
        />
      </div>
    </div>
  );
}

// ─── AssemblyAI Report ────────────────────────────────────────────────────────
function AssemblyReport({ job }) {
  const [tab, setTab] = useState('summary');
  if (!job || job.status !== 'done') return null;

  const chapters   = job.chapters    || [];
  const phrases    = job.key_phrases || [];
  const entities   = job.entities    || [];
  const sentiment  = job.sentiment   || {};
  const sentences  = sentiment.sentences || [];

  const tabs = [
    { id: 'summary',    label: '📋 Summary'    },
    { id: 'chapters',   label: '📖 Chapters',  hide: !chapters.length },
    { id: 'phrases',    label: '🔑 Key Topics', hide: !phrases.length },
    { id: 'entities',   label: '👥 Entities',  hide: !entities.length },
    { id: 'sentiment',  label: '💬 Sentiment', hide: !sentences.length },
    { id: 'transcript', label: '📝 Full Transcript' },
  ].filter((t) => !t.hide);

  const msToTime = (ms) => {
    const s = Math.round(ms / 1000);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  };

  const sentColor = (s) => s === 'POSITIVE' ? '#3fb950' : s === 'NEGATIVE' ? '#f85149' : '#8b949e';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexShrink: 0 }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '0.625rem 0.875rem', background: 'none', border: 'none',
            fontSize: '0.78rem', fontWeight: tab === t.id ? 600 : 400,
            color: tab === t.id ? 'var(--brand-hover)' : 'var(--text-3)',
            borderBottom: `2px solid ${tab === t.id ? 'var(--brand)' : 'transparent'}`,
            cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: '-1px',
            transition: 'color 0.15s',
          }}>{t.label}</button>
        ))}

        {/* Language + Confidence + Duration badges */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 1rem', flexShrink: 0 }}>
          {job.detected_language && (
            <span style={{
              fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.03em',
              padding: '0.15rem 0.5rem', borderRadius: '9999px',
              background: 'rgba(224,50,40,0.10)', color: '#F04039',
              border: '1px solid rgba(224,50,40,0.22)',
            }}>
              🌐 {{ en: 'English', hi: 'Hindi', gu: 'Gujarati', mr: 'Marathi' }[job.detected_language] || job.detected_language.toUpperCase()}
            </span>
          )}
          {job.confidence != null && (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.03em' }}>
              {Math.round(job.confidence * 100)}% conf.
            </span>
          )}
          {job.audio_duration && (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 600 }}>
              {formatTime(job.audio_duration)}
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '1.25rem' }}>
        {/* Summary */}
        {tab === 'summary' && (
          <div>
            {job.summary ? (
              <div style={{ fontSize: '0.875rem', color: 'var(--text-1)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                {job.summary}
              </div>
            ) : (
              <p style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>No summary generated.</p>
            )}
          </div>
        )}

        {/* Chapters */}
        {tab === 'chapters' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {chapters.map((c, i) => (
              <div key={i} style={{ borderLeft: '3px solid var(--brand)', paddingLeft: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.3rem' }}>
                  <span style={{ fontSize: '0.68rem', color: 'var(--brand-hover)', fontWeight: 600, letterSpacing: '0.02em' }}>
                    {msToTime(c.start)} – {msToTime(c.end)}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-1)' }}>{c.headline}</span>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '0.35rem', fontStyle: 'italic' }}>{c.gist}</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.7 }}>{c.summary}</p>
              </div>
            ))}
          </div>
        )}

        {/* Key phrases */}
        {tab === 'phrases' && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {phrases.map((p, i) => (
              <span key={i} style={{
                padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.78rem',
                background: `rgba(224,50,40,${Math.max(0.08, p.rank * 0.18)})`,
                color: '#F04039',
                border: '1px solid rgba(224,50,40,0.22)',
                fontWeight: p.rank > 0.7 ? 600 : 400,
              }}>
                {p.text}
                {p.count > 1 && <span style={{ marginLeft: '0.35rem', fontSize: '0.65rem', opacity: 0.7 }}>×{p.count}</span>}
              </span>
            ))}
          </div>
        )}

        {/* Entities */}
        {tab === 'entities' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {['person', 'organization', 'location', 'date', 'money', 'event', 'medical_process', 'blood_type'].map((type) => {
              const group = entities.filter((e) => e.type === type);
              if (!group.length) return null;
              return (
                <div key={type}>
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem', fontWeight: 700 }}>
                    {type.replace('_', ' ')}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                    {group.map((e, i) => (
                      <span key={i} style={{ padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.78rem', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-1)' }}>
                        {e.text}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Sentiment */}
        {tab === 'sentiment' && (
          <div>
            {/* Bar */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
              {[['Positive', sentiment.positive, '#3fb950'], ['Neutral', sentiment.neutral, '#8b949e'], ['Negative', sentiment.negative, '#f85149']].map(([label, pct, color]) => (
                <div key={label} style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.7rem', color }}>{label}</span>
                    <span style={{ fontSize: '0.7rem', color, fontWeight: 700 }}>{pct}%</span>
                  </div>
                  <div style={{ height: '4px', borderRadius: '2px', background: 'var(--surface-3)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '2px', transition: 'width 0.4s' }} />
                  </div>
                </div>
              ))}
            </div>
            {/* Sentences */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '300px', overflowY: 'auto' }}>
              {sentences.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.4rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem', borderRadius: '9999px', background: `${sentColor(s.sentiment)}20`, color: sentColor(s.sentiment), fontWeight: 700, flexShrink: 0, marginTop: '0.1rem', letterSpacing: '0.04em' }}>
                    {s.sentiment[0]}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{s.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Full Transcript */}
        {tab === 'transcript' && (
          <div className="transcript-box">{job.transcript || '(Empty transcript)'}</div>
        )}
      </div>
    </div>
  );
}

// ─── Transcript Panel (status wrapper) ───────────────────────────────────────
function TranscriptPanel({ experienceId, initialJob, token }) {
  const [job,      setJob]      = useState(initialJob);
  const [retrying, setRetrying] = useState(false);
  const [retErr,   setRetErr]   = useState('');

  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'failed') return;
    const iv = setInterval(async () => {
      try {
        const d = await apiGet(`/transcription/${experienceId}`, token);
        setJob(d.job);
        if (d.job.status === 'done' || d.job.status === 'failed') clearInterval(iv);
      } catch {}
    }, 4000);
    return () => clearInterval(iv);
  }, [job, experienceId, token]);

  const handleRetry = async () => {
    setRetrying(true); setRetErr('');
    try {
      await apiPost(`/transcription/${experienceId}/retry`, {}, token);
      setJob((p) => ({ ...p, status: 'queued' }));
    } catch (err) { setRetErr(err.message); }
    finally { setRetrying(false); }
  };

  if (!job) return null;

  if (job.status === 'done') return <AssemblyReport job={job} />;

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
        <p className="section-label">Transcription</p>
        <StatusBadge status={job.status} />
      </div>
      {job.status === 'processing' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-2)' }}>
          <Spinner dark /> Processing via AssemblyAI — chapters, summary & entities being extracted…
        </div>
      )}
      {job.status === 'queued' && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)' }}>⏳ Queued — will start shortly</p>
      )}
      {job.status === 'failed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          <p style={{ fontSize: '0.8125rem', color: 'var(--error)' }}>✕ {job.error_message || 'Transcription failed'}</p>
          {retErr && <p style={{ fontSize: '0.75rem', color: 'var(--error)' }}>{retErr}</p>}
          <button className="btn btn-secondary btn-sm" onClick={handleRetry} disabled={retrying} style={{ alignSelf: 'flex-start' }}>
            {retrying ? <><Spinner /> Retrying…</> : '↺ Retry'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Notes Panel ──────────────────────────────────────────────────────────────
function NotesPanel({ experienceId, token }) {
  const [notes,   setNotes]   = useState([]);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    getNotes(experienceId, token)
      .then((d) => setNotes(d.notes || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [experienceId, token]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true); setError('');
    try {
      const d = await addNote(experienceId, { content }, token);
      setNotes((prev) => [...prev, d.note]);
      setContent('');
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async (noteId) => {
    try {
      await deleteNote(experienceId, noteId, token);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="card">
      <p className="section-label" style={{ marginBottom: '0.875rem' }}>Notes &amp; Annotations</p>
      {error && <p style={{ fontSize: '0.78rem', color: 'var(--error)', marginBottom: '0.5rem' }}>{error}</p>}

      {loading ? <Spinner dark /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
          {notes.map((n) => (
            <div key={n.id} style={{ padding: '0.75rem', background: 'var(--surface-2)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--brand-hover)' }}>{n.author_name}</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', fontWeight: 500 }}>
                    {formatDate(n.created_at)}
                  </span>
                  <button onClick={() => handleDelete(n.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.75rem', padding: '0 0.2rem', lineHeight: 1 }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}>✕</button>
                </div>
              </div>
              <p style={{ fontSize: '0.825rem', color: 'var(--text-1)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{n.content}</p>
            </div>
          ))}
          {!notes.length && <p style={{ color: 'var(--text-3)', fontSize: '0.82rem' }}>No notes yet. Add one below.</p>}
        </div>
      )}

      <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <textarea
          className="input"
          rows={3}
          placeholder="Add a note, observation, or follow-up action…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={saving}
          style={{ resize: 'vertical', minHeight: '80px' }}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !content.trim()} style={{ alignSelf: 'flex-end' }}>
          {saving ? <><Spinner /> Saving…</> : '+ Add Note'}
        </button>
      </form>
         </div>
  );
}

// ─── Attachments Panel ────────────────────────────────────────────────────────
const REC_A = { IDLE: 'idle', RECORDING: 'recording', PREVIEW: 'preview' };

function AttachmentsPanel({ experienceId, token, canUpload, canRecord }) {
  const [attachments, setAttachments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [file,        setFile]        = useState(null);
  const [uploading,   setUploading]   = useState(false);
  const [error,       setError]       = useState('');

  // Recording state
  const [recState,  setRecState]  = useState(REC_A.IDLE);
  const [elapsed,   setElapsed]   = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl,  setAudioUrl]  = useState('');
  const [micError,  setMicError]  = useState('');
  const mediaRecRef = useRef(null);
  const chunksRef   = useRef([]);
  const timerRef    = useRef(null);
  const streamRef   = useRef(null);

  useEffect(() => {
    getAttachments(experienceId, token)
      .then((d) => setAttachments(d.attachments || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [experienceId, token]);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const uploadFile = async (fileToUpload) => {
    setUploading(true); setError('');
    try {
      const d = await addAttachment(experienceId, fileToUpload, token);
      setAttachments((prev) => [...prev, d.attachment]);
      setFile(null); setAudioBlob(null);
      if (audioUrl) { URL.revokeObjectURL(audioUrl); setAudioUrl(''); }
      setRecState(REC_A.IDLE); setElapsed(0);
    } catch (err) { setError(err.message); }
    finally { setUploading(false); }
  };

  const handleUploadFile  = () => { if (file)      uploadFile(file); };
  const handleUploadAudio = () => {
    if (!audioBlob) return;
    const ext  = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
    const blob = new File([audioBlob], `recording_${Date.now()}.${ext}`, { type: audioBlob.type });
    uploadFile(blob);
  };

  const handleDelete = async (attachId) => {
    try {
      await deleteAttachment(experienceId, attachId, token);
      setAttachments((prev) => prev.filter((a) => a.id !== attachId));
    } catch (err) { setError(err.message); }
  };

  const startRecording = async () => {
    setMicError(''); chunksRef.current = [];
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (err) {
      setMicError(err.name === 'NotAllowedError'
        ? 'Microphone access denied.' : `Mic error: ${err.message}`);
      return;
    }
    streamRef.current = stream;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
                   : MediaRecorder.isTypeSupported('audio/mp4')  ? 'audio/mp4' : '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    mediaRecRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
      const url  = URL.createObjectURL(blob);
      setAudioBlob(blob); setAudioUrl(url); setRecState(REC_A.PREVIEW);
      setFile(null);
    };
    recorder.start(250);
    setElapsed(0); setRecState(REC_A.RECORDING);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    mediaRecRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const discardRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null); setAudioUrl('');
    setElapsed(0); setRecState(REC_A.IDLE);
  };

  return (
    <div style={{ border: '2px dashed rgba(224,50,40,0.35)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        padding: '0.625rem 0.875rem',
        background: 'rgba(224,50,40,0.06)',
        borderBottom: '1px solid rgba(224,50,40,0.18)',
        display: 'flex', alignItems: 'center', gap: '0.5rem',
      }}>
        <span style={{ fontSize: '1rem' }}>📂</span>
        <div>
          <p style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-1)' }}>Add More Files</p>
          <p style={{ fontSize: '0.68rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>
            Attach additional docs, audio, or recorded voice without replacing the original
          </p>
        </div>
      </div>

      <div style={{ padding: '0.75rem 0.875rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {(error || micError) && (
          <p style={{ fontSize: '0.75rem', color: 'var(--error)' }}>⚠ {error || micError}</p>
        )}

        {/* Existing attachments list */}
        {!loading && attachments.map((a) => (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.45rem 0.75rem', background: 'var(--surface-2)',
            borderRadius: 'var(--r-md)', border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: '0.85rem' }}>📎</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.original_name}
              </p>
              <p style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>
                {formatFileSize(a.file_size_bytes)} · {formatDate(a.created_at)}
              </p>
            </div>
            <a href={`${getAttachmentUrl(experienceId, a.id)}?token=${token}`} download={a.original_name}
              style={{ fontSize: '0.75rem', color: 'var(--brand)', textDecoration: 'none', flexShrink: 0 }}>↓</a>
            <button onClick={() => handleDelete(a.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', fontSize: '0.75rem', padding: '0 0.2rem', lineHeight: 1, flexShrink: 0,
            }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--error)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-3)')}
            >✕</button>
          </div>
        ))}

        {/* ── Upload a file ── */}
        {canUpload && (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{
              cursor: 'pointer', padding: '0.5rem 1rem',
              borderRadius: 'var(--r-md)', fontSize: '0.82rem', fontWeight: 600,
              background: 'rgba(224,50,40,0.10)', color: '#F04039',
              border: '1px solid rgba(224,50,40,0.35)', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: '0.35rem',
            }}>
              <span>＋</span>
              {file ? file.name : 'Choose File to Add'}
              <input type="file" hidden accept=".mp3,.wav,.m4a,.ogg,.webm,.pdf,.doc,.docx,.txt"
                onChange={(e) => { setFile(e.target.files[0] || null); discardRecording(); }} />
            </label>
            {file && (
              <button className="btn btn-primary btn-sm" onClick={handleUploadFile} disabled={uploading}>
                {uploading ? <><Spinner /> Uploading…</> : '↑ Upload'}
              </button>
            )}
            {file && (
              <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>✕</button>
            )}
          </div>
        )}

        {/* ── OR: record audio ── */}
        {canRecord && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {recState === REC_A.IDLE && (
              <button onClick={startRecording} style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.5rem 1rem', borderRadius: 'var(--r-md)',
                fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                background: 'var(--surface-2)', color: 'var(--text-2)',
                border: '1px solid var(--border)', transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'; e.currentTarget.style.color = '#ef4444'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)'; }}
              >
                <span style={{ fontSize: '0.9rem' }}>⏺</span> Record Audio
              </button>
            )}

            {recState === REC_A.RECORDING && (
              <>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--error)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>
                  ● {formatTime(elapsed)}
                </span>
                <button onClick={stopRecording} style={{
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                  padding: '0.5rem 1rem', borderRadius: 'var(--r-md)',
                  fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                  background: 'rgba(239,68,68,0.12)', color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.35)',
                }}>
                  <span>⏹</span> Stop Recording
                </button>
              </>
            )}

            {recState === REC_A.PREVIEW && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
                <audio src={audioUrl} controls style={{ width: '100%', borderRadius: '0.375rem' }} />
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary btn-sm" onClick={handleUploadAudio} disabled={uploading}>
                    {uploading ? <><Spinner /> Uploading…</> : '↑ Attach Recording'}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={discardRecording}>✕ Discard</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit + Replace-File Panel ────────────────────────────────────────────────
function EditPanel({ experience, token, onSaved, experienceId, canUpload, canRecord }) {
  const [open,       setOpen]       = useState(false);
  const [title,      setTitle]      = useState(experience.title);
  const [allTags,    setAllTags]    = useState([]);
  const [tagIds,     setTagIds]     = useState((experience.tags || []).map((t) => t.id));
  const [file,       setFile]       = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [error,      setError]      = useState('');
  const [success,    setSuccess]    = useState('');

  useEffect(() => {
    if (!open) return;
    apiGet('/tags', token).then((d) => setAllTags(d.tags || [])).catch(() => {});
  }, [open, token]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      await apiPatch(`/experiences/${experience.id}`, { title: title.trim(), tag_ids: tagIds }, token);
      setSuccess('Saved!');
      onSaved?.();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };

  const handleReplaceFile = async () => {
    if (!file) return;
    setUploading(true); setError(''); setSuccess('');
    try {
      await replaceExperienceFile(experience.id, file, token);
      setFile(null);
      setSuccess('File replaced! Reload to view updated content.');
      onSaved?.();
    } catch (err) { setError(err.message); }
    finally { setUploading(false); }
  };

  const toggleTag = (id) =>
    setTagIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header toggle */}
      <button onClick={() => setOpen((v) => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1.125rem', background: 'none', border: 'none', cursor: 'pointer',
        borderBottom: open ? '1px solid var(--border)' : 'none',
      }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Edit / Add Content
        </span>
        <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '1rem 1.125rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error   && <p style={{ fontSize: '0.78rem', color: 'var(--error)' }}>{error}</p>}
          {success && <p style={{ fontSize: '0.78rem', color: '#3fb950' }}>{success}</p>}

          {/* Title + Tags */}
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label className="field-label">Title</label>
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} style={{ marginTop: '0.3rem' }} />
            </div>

            {allTags.length > 0 && (
              <div>
                <label className="field-label">Tags</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.4rem' }}>
                  {allTags.map((t) => {
                    const active = tagIds.includes(t.id);
                    return (
                      <button key={t.id} type="button" onClick={() => toggleTag(t.id)} style={{
                        padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', cursor: 'pointer',
                        background: active ? 'rgba(224,50,40,0.12)' : 'var(--surface-2)',
                        color: active ? '#F04039' : 'var(--text-3)',
                        border: `1px solid ${active ? 'rgba(224,50,40,0.38)' : 'var(--border)'}`,
                        fontWeight: active ? 600 : 400, transition: 'all 0.12s',
                      }}>{t.name}</button>
                    );
                  })}
                </div>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ alignSelf: 'flex-start' }}>
              {saving ? <><Spinner /> Saving…</> : '✓ Save Changes'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ height: '1px', background: 'var(--border)' }} />

          {/* Attachments */}
          <AttachmentsPanel experienceId={experienceId || experience.id} token={token} canUpload={canUpload} canRecord={canRecord} />

          {/* Replace File */}
          {canUpload && (
            <>
              <div style={{ height: '1px', background: 'var(--border)' }} />
              <div>
                <label className="field-label" style={{ display: 'block', marginBottom: '0.4rem' }}>
                  {experience.file_missing ? '⚠ File missing — re-upload below' : 'Replace File'}
                </label>
                {experience.file_missing && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: '0.5rem' }}>
                    The original file was removed from disk. Upload the file again to restore it.
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  <label style={{
                    cursor: 'pointer', padding: '0.4rem 0.875rem',
                    border: `1px dashed ${experience.file_missing ? 'rgba(248,81,73,0.5)' : 'var(--border)'}`,
                    borderRadius: 'var(--r-md)', fontSize: '0.8rem',
                    color: experience.file_missing ? '#f85149' : 'var(--text-2)',
                    background: 'var(--surface-2)', flexShrink: 0,
                  }}>
                    {file ? `📎 ${file.name}` : '+ Choose file'}
                    <input type="file" hidden accept=".mp3,.wav,.m4a,.ogg,.webm,.pdf,.doc,.docx,.txt"
                      onChange={(e) => setFile(e.target.files[0] || null)} />
                  </label>
                  {file && (
                    <button className="btn btn-primary btn-sm" onClick={handleReplaceFile} disabled={uploading}>
                      {uploading ? <><Spinner /> Uploading…</> : '↑ Upload & Replace'}
                    </button>
                  )}
                  {file && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>✕</button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────
function ExperienceDetail({ experience, onBack, token, onRefresh, canDownload, canViewTranscripts, canUpload, canRecord }) {
  const fileUrl = getFileStreamUrl(experience.id);
  const handleDownload = async () => {
    try { await downloadFile(`/experiences/${experience.id}/file`, experience.original_name, token); }
    catch (err) { alert(`Download failed: ${err.message}`); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '780px' }}>
      {/* Back + Meta */}
      <div>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginBottom: '1rem' }}>← Back</button>
        <h2 style={{ fontFamily: "'Open Sans', sans-serif", fontSize: '1.375rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
          {experience.title}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <TypeBadge type={experience.type} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontWeight: 500 }}>
            {formatDate(experience.created_at)} · {experience.uploader_name} · {formatFileSize(experience.file_size_bytes)}
          </span>
        </div>
        {experience.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.625rem' }}>
            {experience.tags.map((t) => (
              <span key={t.id} style={{ fontSize: '0.7rem', padding: '0.15rem 0.55rem', borderRadius: '9999px',
                background: 'rgba(224,50,40,0.10)', color: '#F04039', border: '1px solid rgba(224,50,40,0.22)', fontWeight: 600 }}>
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* File-missing banner */}
      {experience.file_missing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.75rem 1rem', background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)', borderRadius: 'var(--r-md)' }}>
          <span style={{ fontSize: '1rem' }}>⚠</span>
          <span style={{ fontSize: '0.82rem', color: '#f85149' }}>
            Original file is missing from disk. Use <strong>Edit / Add Content</strong> below to re-upload it.
          </span>
        </div>
      )}

      {/* File Viewer (only when file exists) */}
      {!experience.file_missing && experience.type === 'audio' && <AudioPlayer src={fileUrl} token={token} />}
      {!experience.file_missing && experience.type === 'pdf' && (
        <PDFViewer src={fileUrl} token={token} />
      )}
      {!experience.file_missing && (experience.type === 'doc' || experience.type === 'txt') && (
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ fontSize: '2rem' }}>{experience.type === 'doc' ? '📝' : '📃'}</span>
          <div>
            <p style={{ fontWeight: 500, marginBottom: '0.2rem' }}>{experience.original_name}</p>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>Inline preview not available — download to view.</p>
          </div>
        </div>
      )}

      {!experience.file_missing && canDownload && (
        <button className="btn btn-ghost btn-sm" onClick={handleDownload} style={{ alignSelf: 'flex-start' }}>
          ↓ Download {experience.original_name}
        </button>
      )}

      {/* Edit / Add Content panel */}
      <EditPanel experience={experience} token={token} onSaved={onRefresh} canUpload={canUpload} canRecord={canRecord} />

      {/* Report (audio only) */}
      {experience.type === 'audio' && canViewTranscripts && (
        <TranscriptPanel
          experienceId={experience.id}
          initialJob={{
            status:            experience.transcription_status,
            transcript:        experience.transcript,
            summary:           experience.summary,
            chapters:          experience.chapters,
            key_phrases:       experience.key_phrases,
            entities:          experience.entities,
            sentiment:         experience.sentiment,
            confidence:        experience.confidence,
            audio_duration:    experience.audio_duration,
            detected_language: experience.detected_language,
            error_message:     experience.error_message,
          }}
          token={token}
        />
      )}

      {/* Notes */}
      <NotesPanel experienceId={experience.id} token={token} />
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────
function ExperienceList({ experiences, onSelect }) {
  if (!experiences.length) {
    return <EmptyState icon="📭" title="No experiences yet" description="Upload a file from the Capture Experience page." />;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr><th>Type</th><th>Title</th><th>Date</th><th>Tags</th><th>Status</th></tr>
        </thead>
        <tbody>
          {experiences.map((exp) => (
            <tr key={exp.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(exp.id)}>
              <td><TypeBadge type={exp.type} /></td>
              <td><span style={{ fontWeight: 600, color: 'var(--text-1)' }}>{exp.title}</span></td>
              <td style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(exp.created_at)}</td>
              <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {(exp.tags || []).slice(0, 3).map((t) => (
                    <span key={t.id} style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'rgba(224,50,40,0.10)', color: '#F04039', border: '1px solid rgba(224,50,40,0.20)', fontWeight: 600 }}>{t.name}</span>
                  ))}
                </div>
              </td>
              <td>
                {exp.type === 'audio'
                  ? <StatusBadge status={exp.transcription_status} />
                  : <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Review Page ──────────────────────────────────────────────────────────────
export default function ReviewPage() {
  return (
    <Suspense fallback={null}>
      <ReviewContent />
    </Suspense>
  );
}

function ReviewContent() {
  const { getToken }       = useAuth();
  const { isAdmin, can }   = usePermissions();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const selectedId   = searchParams.get('id');
  const showUploading = searchParams.get('uploading') === '1';

  const [experiences,    setExperiences]    = useState([]);
  const [detail,         setDetail]         = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [detailLoad,     setDetailLoad]     = useState(false);
  const [error,          setError]          = useState('');
  const [tagFilter,      setTagFilter]      = useState(null);
  const [pendingUploads, setPendingUploads] = useState(getPendingCount);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet('/experiences', getToken());
      setExperiences(d.experiences || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // Subscribe to background upload queue — refresh list when uploads finish
  useEffect(() => {
    let prev = getPendingCount();
    return subscribeUploads((count) => {
      setPendingUploads(count);
      // When count drops to 0 (all done), refresh the list so new items appear
      if (count === 0 && prev > 0) fetchList();
      prev = count;
    });
  }, [fetchList]);

  useEffect(() => {
    const numId = selectedId ? Number(selectedId) : null;
    if (!numId) return;
    if (detail?.id === numId) return; // already showing this one
    if (detailLoad) return;           // already in flight
    handleSelect(numId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  const handleSelect = async (id) => {
    setDetailLoad(true); setError('');
    try {
      const d = await apiGet(`/experiences/${id}`, getToken());
      setDetail(d.experience);
      router.replace(`/review?id=${id}`, { scroll: false });
    } catch (err) { setError(err.message); }
    finally { setDetailLoad(false); }
  };

  const handleBack = () => { setDetail(null); router.replace('/review', { scroll: false }); };

  // Collect all tags from experiences for the filter row
  const allTags = [...new Map(
    experiences.flatMap((e) => e.tags || []).map((t) => [t.id, t])
  ).values()];

  const filtered = tagFilter
    ? experiences.filter((e) => (e.tags || []).some((t) => t.id === tagFilter))
    : experiences;

  return (
    <AppLayout>
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Review Files</h1>
          <p className="page-subtitle">{detail ? 'Viewing experience' : 'All captured experiences'}</p>
        </div>
        {!detail && (
          <div className="page-actions">
            <button className="btn btn-ghost btn-sm" onClick={fetchList} disabled={loading}>
              {loading ? <Spinner dark /> : '↻'} Refresh
            </button>
          </div>
        )}
      </div>

      {/* Background upload banner */}
      {(showUploading || pendingUploads > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.625rem',
          padding: '0.75rem 1rem', marginBottom: '1rem',
          background: 'rgba(224,50,40,0.07)', border: '1px solid rgba(224,50,40,0.22)',
          borderRadius: 'var(--r-md)',
        }}>
          <Spinner dark />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-1)', flex: 1 }}>
            {pendingUploads > 0
              ? `Uploading ${pendingUploads > 1 ? `${pendingUploads} files` : 'your file'} in the background — it will appear here when ready.`
              : 'Processing your upload — refreshing shortly…'}
          </span>
          {pendingUploads === 0 && (
            <button onClick={() => router.replace('/review', { scroll: false })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.75rem' }}>✕</button>
          )}
        </div>
      )}

      {error && (
        <div className="alert-error" style={{ marginBottom: '1.25rem' }}>
          <span>⚠</span><span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      {/* Tag filter bar — list view only */}
      {!detail && allTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.63rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.09em', fontWeight: 700, marginRight: '0.25rem' }}>Filter:</span>
          {allTags.map((t) => (
            <button key={t.id} onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)} style={{
              padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', cursor: 'pointer',
              background: tagFilter === t.id ? 'rgba(224,50,40,0.12)' : 'var(--surface-2)',
              color: tagFilter === t.id ? '#F04039' : 'var(--text-3)',
              border: `1px solid ${tagFilter === t.id ? 'rgba(224,50,40,0.38)' : 'var(--border)'}`,
              fontWeight: tagFilter === t.id ? 600 : 400,
              transition: 'all 0.15s', fontFamily: 'inherit',
            }}>{t.name}</button>
          ))}
          {tagFilter && (
            <button onClick={() => setTagFilter(null)} style={{ fontSize: '0.72rem', color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Clear
            </button>
          )}
        </div>
      )}

      {detailLoad && <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><Spinner dark /></div>}

      {!detailLoad && detail && (
        <ExperienceDetail
          experience={detail}
          onBack={handleBack}
          token={getToken()}
          onRefresh={() => handleSelect(detail.id)}
          canDownload={isAdmin || can('can_download_files')}
          canViewTranscripts={isAdmin || can('can_view_transcripts')}
          canUpload={isAdmin || can('can_upload')}
          canRecord={isAdmin || can('can_record')}
        />
      )}

      {!detailLoad && !detail && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
          {loading
            ? <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><Spinner dark /></div>
            : <ExperienceList experiences={filtered} onSelect={handleSelect} />}
        </div>
      )}
    </AppLayout>
  );
}
