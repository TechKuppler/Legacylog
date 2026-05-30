'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import {
  StatusBadge, TypeBadge, Spinner, EmptyState,
  formatDate, formatFileSize, formatTime,
} from '@/components/ui';
import { apiGet, apiPost, apiPatch, downloadFile, getFileStreamUrl, getNotes, addNote, deleteNote, replaceExperienceFile } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

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
          onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
          onEnded={() => setPlaying(false)}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        <button onClick={toggle} disabled={!blobUrl} style={{
          width: '2.25rem', height: '2.25rem', borderRadius: '50%', flexShrink: 0,
          background: blobUrl ? 'var(--brand-gradient)' : 'var(--surface-3)',
          border: 'none', cursor: blobUrl ? 'pointer' : 'default',
          color: '#fff', fontSize: '0.875rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: blobUrl ? '0 0 10px rgba(59,130,246,0.4)' : 'none',
        }}>
          {!blobUrl ? <span className="spinner" style={{ width: '0.8rem', height: '0.8rem' }} />
          : playing ? '⏸' : '▶'}
        </button>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-2)', minWidth: '4.5rem', fontFamily: "'JetBrains Mono', monospace" }}>
          {formatTime(current)} / {formatTime(duration)}
        </span>
        <input type="range" className="seek-bar" min={0} max={duration || 100} step={0.1} value={current}
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

        {/* Confidence + Duration badges */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 1rem', flexShrink: 0 }}>
          {job.confidence != null && (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontFamily: "'JetBrains Mono', monospace" }}>
              {Math.round(job.confidence * 100)}% conf.
            </span>
          )}
          {job.audio_duration && (
            <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontFamily: "'JetBrains Mono', monospace" }}>
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
                  <span style={{ fontSize: '0.68rem', color: 'var(--brand-hover)', fontFamily: "'JetBrains Mono', monospace" }}>
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
                background: `rgba(59,130,246,${Math.max(0.08, p.rank * 0.2)})`,
                color: '#58a6ff',
                border: '1px solid rgba(59,130,246,0.25)',
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
                  <p style={{ fontSize: '0.65rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.35rem', fontFamily: "'JetBrains Mono', monospace" }}>
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
                    <span style={{ fontSize: '0.7rem', color, fontFamily: "'JetBrains Mono', monospace" }}>{pct}%</span>
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
                  <span style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem', borderRadius: '9999px', background: `${sentColor(s.sentiment)}20`, color: sentColor(s.sentiment), fontWeight: 700, flexShrink: 0, marginTop: '0.1rem', fontFamily: "'JetBrains Mono', monospace" }}>
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
function NotesPanel({ experienceId, token, userName }) {
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
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {formatDate(n.created_at)}
                  </span>
                  <button onClick={() => handleDelete(n.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '0.75rem', padding: '0 0.2rem', lineHeight: 1 }}
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

// ─── Edit + Replace-File Panel ────────────────────────────────────────────────
function EditPanel({ experience, token, onSaved }) {
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
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-1)', fontFamily: "'JetBrains Mono', monospace", textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          ✏ Edit / Add Content
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
                        background: active ? 'rgba(59,130,246,0.22)' : 'var(--surface-2)',
                        color: active ? '#58a6ff' : 'var(--text-3)',
                        border: `1px solid ${active ? 'rgba(59,130,246,0.45)' : 'var(--border)'}`,
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

          {/* Replace File */}
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
        </div>
      )}
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────
function ExperienceDetail({ experience, onBack, token, onRefresh }) {
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
        <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: '1.4rem', marginBottom: '0.5rem',
          background: 'linear-gradient(135deg,#e6edf3,#8b949e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
          {experience.title}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <TypeBadge type={experience.type} />
          <span style={{ fontSize: '0.75rem', color: 'var(--text-3)', fontFamily: "'JetBrains Mono', monospace" }}>
            {formatDate(experience.created_at)} · {experience.uploader_name} · {formatFileSize(experience.file_size_bytes)}
          </span>
        </div>
        {experience.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.625rem' }}>
            {experience.tags.map((t) => (
              <span key={t.id} style={{ fontSize: '0.72rem', padding: '0.15rem 0.55rem', borderRadius: '9999px',
                background: 'rgba(59,130,246,0.12)', color: '#58a6ff', border: '1px solid rgba(59,130,246,0.22)', fontWeight: 500 }}>
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
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          <iframe src={`${fileUrl}?token=${token}`} style={{ width: '100%', height: '600px', border: 'none' }} title={experience.original_name} />
        </div>
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

      {!experience.file_missing && (
        <button className="btn btn-ghost btn-sm" onClick={handleDownload} style={{ alignSelf: 'flex-start' }}>
          ↓ Download {experience.original_name}
        </button>
      )}

      {/* Edit / Add Content panel */}
      <EditPanel experience={experience} token={token} onSaved={onRefresh} />

      {/* Report (audio only) */}
      {experience.type === 'audio' && (
        <TranscriptPanel
          experienceId={experience.id}
          initialJob={{
            status:         experience.transcription_status,
            transcript:     experience.transcript,
            summary:        experience.summary,
            chapters:       experience.chapters,
            key_phrases:    experience.key_phrases,
            entities:       experience.entities,
            sentiment:      experience.sentiment,
            confidence:     experience.confidence,
            audio_duration: experience.audio_duration,
            error_message:  experience.error_message,
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
              <td><span style={{ fontWeight: 500, color: 'var(--brand-hover)' }}>{exp.title}</span></td>
              <td style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(exp.created_at)}</td>
              <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                  {(exp.tags || []).slice(0, 3).map((t) => (
                    <span key={t.id} style={{ fontSize: '0.68rem', padding: '0.15rem 0.5rem', borderRadius: '9999px', background: 'rgba(59,130,246,0.12)', color: '#58a6ff', border: '1px solid rgba(59,130,246,0.2)', fontWeight: 500 }}>{t.name}</span>
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
  const { getToken } = useAuth();
  const searchParams = useSearchParams();
  const router       = useRouter();
  const selectedId   = searchParams.get('id');

  const [experiences, setExperiences] = useState([]);
  const [detail,      setDetail]      = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [detailLoad,  setDetailLoad]  = useState(false);
  const [error,       setError]       = useState('');
  const [tagFilter,   setTagFilter]   = useState(null); // tag id or null

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiGet('/experiences', getToken());
      setExperiences(d.experiences || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => { fetchList(); }, [fetchList]);

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
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Review Files</h1>
          <p className="page-subtitle">{detail ? 'Viewing experience' : 'All captured experiences'}</p>
        </div>
        {!detail && (
          <button className="btn btn-ghost btn-sm" onClick={fetchList} disabled={loading}>
            {loading ? <Spinner dark /> : '↻'} Refresh
          </button>
        )}
      </div>

      {error && (
        <div className="alert-error" style={{ marginBottom: '1.25rem' }}>
          <span>⚠</span><span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      {/* Tag filter bar — list view only */}
      {!detail && allTags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: "'JetBrains Mono', monospace", marginRight: '0.25rem' }}>Filter:</span>
          {allTags.map((t) => (
            <button key={t.id} onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)} style={{
              padding: '0.2rem 0.65rem', borderRadius: '9999px', fontSize: '0.75rem', border: 'none', cursor: 'pointer',
              background: tagFilter === t.id ? 'rgba(59,130,246,0.22)' : 'var(--surface-2)',
              color: tagFilter === t.id ? '#58a6ff' : 'var(--text-3)',
              border: `1px solid ${tagFilter === t.id ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
              fontWeight: tagFilter === t.id ? 600 : 400,
              transition: 'all 0.15s',
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
