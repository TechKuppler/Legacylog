'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter }    from 'next/navigation';
import AppLayout        from '@/components/layout/AppLayout';
import { TagPicker, LanguageSelect, formatFileSize, formatTime } from '@/components/ui';
import { apiGet, apiUpload, apiPost, getDepartments } from '@/lib/api';
import { startUpload } from '@/lib/uploadQueue';
import { useAuth, usePermissions } from '@/lib/AuthContext';

// ─── Recording State Machine ──────────────────────────────────────────────────
const REC = { IDLE: 'idle', RECORDING: 'recording', PREVIEW: 'preview' };

// ─── Section wrapper ──────────────────────────────────────────────────────────
function FormSection({ label, children, style }) {
  return (
    <div className="form-section" style={style}>
      <div className="form-section-title">{label}</div>
      {children}
    </div>
  );
}

// ─── Capture Page ─────────────────────────────────────────────────────────────
export default function CapturePage() {
  const { getToken }     = useAuth();
  const { isAdmin, can, departments: myDepts } = usePermissions();
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
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getToken();
    apiGet('/tags', token).then((d) => setAllTags(d.tags || [])).catch(() => {});
    if (isAdmin) {
      getDepartments(token).then((d) => setAllDepts(d.departments || [])).catch(() => {});
    } else {
      setAllDepts(myDepts || []);
    }
  }, [getToken, isAdmin, myDepts]);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  // ── File selection ──
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

  // ── Recording ──
  const startRecording = async () => {
    setMicError(''); chunksRef.current = [];
    setLanguage('mixed');
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
      setFile(null);
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

  // ── Submit ──
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file && !audioBlob) { setError('Please upload a file or record audio first.'); return; }
    if (!title.trim())       { setError('Please enter a title.'); return; }
    if (file      && !isAdmin && !can('can_upload')) { setError('You don\'t have permission to upload files.'); return; }
    if (audioBlob && !isAdmin && !can('can_record')) { setError('You don\'t have permission to record audio.'); return; }

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

    const uploadPromise = apiUpload('/experiences', fd, getToken());
    startUpload(uploadPromise);
    router.push('/dashboard?uploading=1');
  };

  const hasSource = !!(file || audioBlob);

  return (
    <AppLayout>
      <div style={{ maxWidth: '720px', width: '100%' }}>

        {/* Header */}
        <div className="page-header">
          <div className="page-header-left">
            <h1 className="page-title">Capture Experience</h1>
            <p className="page-subtitle">Upload a file or record audio directly in the browser</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Alerts */}
          {(error || micError) && (
            <div className="alert-error">
              <span>⚠</span>
              <span style={{ flex: 1 }}>{error || micError}</span>
              <button type="button" onClick={() => { setError(''); setMicError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
            </div>
          )}

          {/* ── Section 1: Source ── */}
          <FormSection label="Source">
            <div className="source-row">

              {/* Upload Panel */}
              <div>
                <p className="field-label" style={{ marginBottom: '0.5rem' }}>Upload File</p>
                <div
                  className={`drop-zone ${dragOver ? 'dragover' : ''}`}
                  style={{
                    minHeight: '190px', cursor: 'pointer',
                    outline: file ? '2px solid var(--brand)' : undefined,
                    outlineOffset: '-2px',
                    borderRadius: 'var(--r-xl)',
                  }}
                  onClick={() => fileInputRef.current?.click()}
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
                      <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>📎</div>
                      <p style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '0.85rem', marginBottom: '0.25rem', wordBreak: 'break-all', lineHeight: 1.3 }}>
                        {file.name}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '0.5rem' }}>
                        {formatFileSize(file.size)}
                      </p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--brand)' }}>Click to change file</p>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '2rem', marginBottom: '0.625rem' }}>📤</div>
                      <p style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-1)', marginBottom: '0.3rem' }}>
                        Drop file here
                      </p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginBottom: '0.625rem' }}>
                        or click to browse
                      </p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', lineHeight: 1.7 }}>
                        MP3 · WAV · M4A · WEBM<br />PDF · DOC · DOCX · TXT<br />Max 200 MB
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Record Panel */}
              <div>
                <p className="field-label" style={{ marginBottom: '0.5rem' }}>Record Audio</p>
                <div className="card" style={{
                  minHeight: '190px', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                  outline: audioBlob ? '2px solid var(--brand)' : undefined,
                  outlineOffset: '-2px',
                  borderRadius: 'var(--r-xl)',
                }}>
                  {recState === REC.PREVIEW ? (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      <audio src={audioUrl} controls style={{ width: '100%', borderRadius: '0.5rem' }} />
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-2)', textAlign: 'center' }}>
                        {formatTime(elapsed)} recorded
                      </p>
                      <button
                        type="button" className="btn btn-danger btn-sm"
                        onClick={discardRecording}
                        style={{ alignSelf: 'center' }}
                      >
                        ✕ Discard &amp; Re-record
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{
                        fontFamily: "'Open Sans', sans-serif",
                        fontSize: '2rem', fontWeight: 800, lineHeight: 1,
                        color: recState === REC.RECORDING ? 'var(--error)' : 'var(--text-3)',
                        letterSpacing: '-0.02em',
                      }}>
                        {formatTime(elapsed)}
                      </div>

                      <button
                        type="button"
                        onClick={recState === REC.IDLE ? startRecording : stopRecording}
                        className={recState === REC.RECORDING ? 'record-pulse' : ''}
                        style={{
                          width: '3.75rem', height: '3.75rem', borderRadius: '50%',
                          background: recState === REC.RECORDING
                            ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                            : 'linear-gradient(135deg, #f87171, #ef4444)',
                          border: 'none', cursor: 'pointer',
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
          </FormSection>

          {/* ── Section 2: Information ── */}
          <FormSection label="Information">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              <div>
                <label className="field-label">
                  Title <span style={{ color: 'var(--error)', fontWeight: 700 }}>*</span>
                </label>
                <input
                  type="text" className="input"
                  placeholder="Give this capture a descriptive title"
                  value={title} onChange={(e) => setTitle(e.target.value)}
                  maxLength={255}
                />
              </div>

              <div>
                <label className="field-label">Language</label>
                {audioBlob || recState !== REC.IDLE ? (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                    padding: '0.75rem 1rem',
                    background: 'rgba(0,197,200,0.06)',
                    border: '1px solid rgba(0,197,200,0.20)',
                    borderRadius: 'var(--r-xl)',
                    fontSize: '0.82rem', color: 'var(--text-2)',
                  }}>
                    <span style={{ fontSize: '1.1rem' }}>🌐</span>
                    <span>
                      Auto-detecting language —{' '}
                      <span style={{ color: 'var(--text-1)', fontWeight: 600 }}>
                        English, Hindi, Gujarati &amp; Marathi
                      </span>
                    </span>
                  </div>
                ) : (
                  <LanguageSelect value={language} onChange={setLanguage} />
                )}
              </div>

              {allDepts.length > 0 && (
                <div>
                  <label className="field-label">Department</label>
                  <select
                    className="select"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                  >
                    <option value="">— No department —</option>
                    {allDepts.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  {isAdmin && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.375rem' }}>
                      Manage departments in the <a href="/admin/departments" style={{ color: 'var(--brand)' }}>Admin Panel</a>.
                    </p>
                  )}
                </div>
              )}

            </div>
          </FormSection>

          {/* ── Section 3: Classification ── */}
          <FormSection label="Classification">
            <label className="field-label">Tags</label>
            <TagPicker
              allTags={allTags} selectedIds={selectedTagIds}
              onChange={setSelectedTagIds} onCreateTag={handleCreateTag}
              canCreateTags={isAdmin || can('can_create_tags')}
            />
          </FormSection>

          {/* ── Actions ── */}
          <div style={{
            display: 'flex', gap: '0.75rem', paddingTop: '0.25rem',
            alignItems: 'center',
          }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!hasSource}
              style={{ minWidth: '160px' }}
            >
              {audioBlob ? '💾 Save & Transcribe' : '⬆ Upload & Save'}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => router.push('/dashboard')}
            >
              Cancel
            </button>
          </div>

        </form>
      </div>
    </AppLayout>
  );
}
