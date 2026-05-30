'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter }    from 'next/navigation';
import AppLayout        from '@/components/layout/AppLayout';
import { TagPicker, LanguageSelect, formatFileSize, formatTime } from '@/components/ui';
import { apiGet, apiUpload, apiPost, getDepartments } from '@/lib/api';
import { useAuth, usePermissions } from '@/lib/AuthContext';

// ─── Recording State Machine ──────────────────────────────────────────────────
const REC = { IDLE: 'idle', RECORDING: 'recording', PREVIEW: 'preview' };

// ─── Capture Page (unified upload + recorder) ─────────────────────────────────
export default function CapturePage() {
  const { getToken }     = useAuth();
  const { isAdmin, departments: myDepts } = usePermissions();
  const router           = useRouter();

  // ── Shared form fields ──
  const [title,          setTitle]          = useState('');
  const [language,       setLanguage]       = useState('en');
  const [departmentId,   setDepartmentId]   = useState('');
  const [allDepts,       setAllDepts]       = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [allTags,        setAllTags]        = useState([]);

  // ── Upload source ──
  const [file,     setFile]     = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef             = useRef(null);

  // ── Record source ──
  const [recState,  setRecState]  = useState(REC.IDLE);
  const [elapsed,   setElapsed]   = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl,  setAudioUrl]  = useState('');
  const [micError,  setMicError]  = useState('');
  const mediaRecorderRef          = useRef(null);
  const chunksRef                 = useRef([]);
  const timerRef                  = useRef(null);
  const streamRef                 = useRef(null);

  // ── Submission ──
  const [submitting, setSubmitting] = useState(false);
  const [progress,   setProgress]   = useState(0);
  const [success,    setSuccess]    = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    const token = getToken();
    apiGet('/tags', token).then((d) => setAllTags(d.tags || [])).catch(() => {});
    // Admin loads all departments; members use their own dept list from context
    if (isAdmin) {
      getDepartments(token).then((d) => setAllDepts(d.departments || [])).catch(() => {});
    } else {
      setAllDepts(myDepts || []);
    }
  }, [getToken, isAdmin, myDepts]);

  // Cleanup blob URL and mic stream on unmount
  useEffect(() => () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  // ── File selection (clears any recording) ──
  const handleFileSelect = useCallback((selected) => {
    if (!selected) return;
    setFile(selected);
    setTitle(selected.name.replace(/\.[^.]+$/, ''));
    setError('');
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null); setAudioUrl('');
    setRecState(REC.IDLE); setElapsed(0);
  }, [audioUrl]);

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  };

  // ── Recording (clears any file) ──
  const startRecording = async () => {
    setMicError(''); chunksRef.current = [];
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setMicError(
        err.name === 'NotAllowedError'
          ? 'Microphone access denied — allow it in browser settings and try again.'
          : `Could not access microphone: ${err.message}`
      );
      return;
    }
    streamRef.current = stream;
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
                   : MediaRecorder.isTypeSupported('audio/mp4')  ? 'audio/mp4' : '';
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
      const url  = URL.createObjectURL(blob);
      setAudioBlob(blob); setAudioUrl(url);
      setRecState(REC.PREVIEW);
      setTitle(`Recording ${new Date().toLocaleString('en-IN')}`);
      setFile(null); // recording wins over file
    };
    recorder.start(250);
    setElapsed(0); setRecState(REC.RECORDING);
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  };

  const stopRecording = () => {
    clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  const discardRecording = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null); setAudioUrl('');
    setElapsed(0); setRecState(REC.IDLE);
  };

  // ── Tags ──
  const handleCreateTag = async (name) => {
    const data = await apiPost('/tags', { name }, getToken());
    setAllTags((prev) => [...prev, data.tag]);
    return data.tag;
  };

  // ── Submit (unified) ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file && !audioBlob) { setError('Please upload a file or record audio first.'); return; }
    if (!title.trim())       { setError('Please enter a title.'); return; }

    setSubmitting(true); setError(''); setProgress(15);

    const fd = new FormData();
    fd.append('title',    title.trim());
    fd.append('language', language);
    fd.append('tag_ids',  JSON.stringify(selectedTagIds));
    if (departmentId) fd.append('department_id', departmentId);

    if (file) {
      fd.append('file', file);
    } else {
      const ext  = audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
      const blob = new File([audioBlob], `recording_${Date.now()}.${ext}`, { type: audioBlob.type });
      fd.append('file', blob);
    }

    try {
      setProgress(50);
      await apiUpload('/experiences', fd, getToken());
      setProgress(100); setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 1400);
    } catch (err) {
      setError(err.message || 'Save failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasSource = !!(file || audioBlob);

  return (
    <AppLayout>
      <div style={{ maxWidth: '760px' }}>
        {/* Header */}
        <div className="page-header">
          <h1 className="page-title">Capture Experience</h1>
          <p className="page-subtitle">Upload a file or record audio directly in the browser</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>

          {/* Alerts */}
          {success && <div className="alert-success">✓ Saved successfully — redirecting…</div>}
          {(error || micError) && (
            <div className="alert-error">
              <span>⚠</span>
              <span style={{ flex: 1 }}>{error || micError}</span>
              <button type="button" onClick={() => { setError(''); setMicError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
            </div>
          )}

          {/* ── Source Row: Upload | Record ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'start' }}>

            {/* Upload Panel */}
            <div>
              <p className="section-label" style={{ marginBottom: '0.5rem' }}>📤 Upload File</p>
              <div
                className={`drop-zone ${dragOver ? 'dragover' : ''}`}
                style={{
                  minHeight: '180px', cursor: submitting ? 'default' : 'pointer',
                  outline: file ? '2px solid var(--brand)' : undefined,
                  outlineOffset: '-2px',
                }}
                onClick={() => !submitting && fileInputRef.current?.click()}
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
              >
                <input
                  ref={fileInputRef} type="file"
                  accept=".mp3,.wav,.m4a,.ogg,.webm,.pdf,.doc,.docx,.txt"
                  style={{ display: 'none' }}
                  onChange={(e) => handleFileSelect(e.target.files?.[0])}
                />
                {file ? (
                  <div>
                    <div style={{ fontSize: '1.75rem', marginBottom: '0.4rem' }}>📎</div>
                    <p style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '0.85rem', marginBottom: '0.2rem', wordBreak: 'break-all' }}>
                      {file.name}
                    </p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.4rem' }}>
                      {formatFileSize(file.size)}
                    </p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--brand)', textDecoration: 'underline' }}>Click to change</p>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📤</div>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '0.25rem' }}>
                      Drop file here
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '0.5rem' }}>
                      or click to browse
                    </p>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.6 }}>
                      MP3 · WAV · M4A · WEBM<br />PDF · DOC · DOCX · TXT<br />max 200 MB
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Record Panel */}
            <div>
              <p className="section-label" style={{ marginBottom: '0.5rem' }}>🎙 Record Audio</p>
              <div className="card" style={{
                minHeight: '180px', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                outline: audioBlob ? '2px solid var(--brand)' : undefined,
                outlineOffset: '-2px',
              }}>
                {recState === REC.PREVIEW ? (
                  <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <audio src={audioUrl} controls style={{ width: '100%', borderRadius: '0.375rem' }} />
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', textAlign: 'center' }}>
                      {formatTime(elapsed)} recorded
                    </p>
                    <button
                      type="button" className="btn btn-ghost btn-sm"
                      onClick={discardRecording} disabled={submitting}
                      style={{ alignSelf: 'center' }}
                    >
                      ✕ Discard &amp; Re-record
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '2rem', fontWeight: 500, lineHeight: 1,
                      color: recState === REC.RECORDING ? 'var(--error)' : 'var(--text-3)',
                      letterSpacing: '0.05em',
                    }}>
                      {formatTime(elapsed)}
                    </div>

                    <button
                      type="button"
                      onClick={recState === REC.IDLE ? startRecording : stopRecording}
                      className={recState === REC.RECORDING ? 'record-pulse' : ''}
                      disabled={submitting}
                      style={{
                        width: '3.75rem', height: '3.75rem', borderRadius: '50%',
                        background: recState === REC.RECORDING
                          ? 'linear-gradient(135deg,#ef4444,#dc2626)'
                          : 'linear-gradient(135deg,#f87171,#ef4444)',
                        border: 'none',
                        cursor: submitting ? 'default' : 'pointer',
                        color: '#fff', fontSize: '1.375rem',
                        boxShadow: recState === REC.RECORDING
                          ? '0 0 24px rgba(239,68,68,0.6), 0 4px 12px rgba(0,0,0,0.4)'
                          : '0 4px 18px rgba(239,68,68,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'box-shadow 0.3s',
                      }}
                    >
                      {recState === REC.IDLE ? '⏺' : '⏹'}
                    </button>

                    <p style={{
                      fontSize: '0.8rem',
                      color: recState === REC.RECORDING ? 'var(--error)' : 'var(--text-2)',
                      fontWeight: recState === REC.RECORDING ? 500 : 400,
                    }}>
                      {recState === REC.IDLE ? 'Click to start recording' : 'Recording — click to stop'}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Divider with label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.25rem 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Details
            </span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>

          {/* Shared fields */}
          <div>
            <label className="field-label">
              Title <span style={{ color: 'var(--error)' }}>*</span>
            </label>
            <input
              type="text" className="input"
              placeholder="Give this capture a descriptive title"
              value={title} onChange={(e) => setTitle(e.target.value)}
              maxLength={255} disabled={submitting}
            />
          </div>

          <div>
            <label className="field-label">Language</label>
            <LanguageSelect value={language} onChange={setLanguage} disabled={submitting} />
          </div>

          {allDepts.length > 0 && (
            <div>
              <label className="field-label">Department</label>
              <select
                className="select"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                disabled={submitting}
              >
                <option value="">— No department —</option>
                {allDepts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              {isAdmin && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.3rem' }}>
                  Manage departments in the <a href="/admin/departments" style={{ color: 'var(--brand)' }}>Admin Panel</a>.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="field-label">Tags</label>
            <TagPicker
              allTags={allTags} selectedIds={selectedTagIds}
              onChange={setSelectedTagIds} onCreateTag={handleCreateTag}
            />
          </div>

          {/* Progress bar */}
          {submitting && (
            <div style={{ height: '3px', borderRadius: '2px', background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress}%`, background: 'var(--brand)', transition: 'width 0.4s' }} />
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.625rem', paddingTop: '0.25rem' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting || success || !hasSource}>
              {submitting
                ? <><span className="spinner" /> Saving…</>
                : audioBlob ? '💾 Save & Transcribe' : 'Upload & Save'}
            </button>
            <button type="button" className="btn btn-ghost"
              onClick={() => router.push('/dashboard')} disabled={submitting}>
              Cancel
            </button>
          </div>

        </form>
      </div>
    </AppLayout>
  );
}
