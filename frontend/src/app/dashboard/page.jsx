'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Mic, FileText, LayoutGrid, List, CheckCircle, Files } from 'lucide-react';
import AppLayout from '@/components/layout/AppLayout';
import { StatusBadge, TypeBadge, Spinner, EmptyState, formatDate, formatFileSize } from '@/components/ui';
import { apiGet, apiDelete } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { subscribe as subscribeUploads, getPendingCount } from '@/lib/uploadQueue';

// ─── Metric Tile ──────────────────────────────────────────────────────────────
function MetricTile({ value, label, icon, accent, iconBg }) {
  return (
    <div className="metric-card">
      <div className="metric-card-accent" style={{ background: accent }} />
      <div className="metric-card-body">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="metric-value">{value}</div>
          <div className="metric-label">{label}</div>
        </div>
        <div className="metric-card-icon" style={{ background: iconBg }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Tag Chips ────────────────────────────────────────────────────────────────
function TagChips({ tags = [] }) {
  if (!tags.length) return <span style={{ color: 'var(--text-4)', fontSize: '0.75rem' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
      {tags.slice(0, 2).map((t) => (
        <span key={t.id} style={{
          fontSize: '0.65rem', padding: '0.15rem 0.5rem', borderRadius: '9999px',
          background: 'var(--surface-3)', color: 'var(--text-2)',
          border: '1px solid var(--border-strong)', fontWeight: 500,
        }}>{t.name}</span>
      ))}
      {tags.length > 2 && (
        <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', alignSelf: 'center' }}>+{tags.length - 2}</span>
      )}
    </div>
  );
}

// ─── Experience Card (card-grid layout) ───────────────────────────────────────
function ExperienceGridCard({ exp, onView, onDelete, deleting }) {
  return (
    <div className="exp-card-item" onClick={onView}>
      {/* Type + Status row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <TypeBadge type={exp.type} />
        {exp.type === 'audio'
          ? <StatusBadge status={exp.transcription_status} />
          : <span style={{ fontSize: '0.65rem', color: 'var(--text-4)' }}>{formatFileSize(exp.file_size_bytes)}</span>}
      </div>

      {/* Title */}
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-1)', lineHeight: 1.35, marginBottom: '0.2rem' }}>
          {exp.title}
        </div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
          {exp.uploader_name} · {formatDate(exp.created_at)}
        </div>
      </div>

      {/* Tags */}
      {exp.tags?.length > 0 && <TagChips tags={exp.tags} />}

      {/* Actions — stop propagation so card click doesn't trigger */}
      <div style={{ display: 'flex', gap: '0.375rem', marginTop: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onView}>View</button>
        <button className="btn btn-danger btn-sm" style={{ flex: 1 }} onClick={onDelete} disabled={deleting}>
          {deleting ? <Spinner /> : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ─── Experience Row (desktop table row) ───────────────────────────────────────
function ExperienceRow({ exp, onView, onDelete, deleting }) {
  return (
    <tr>
      <td><TypeBadge type={exp.type} /></td>
      <td>
        <div style={{ fontWeight: 600, color: 'var(--text-1)', fontSize: '0.8125rem' }}>{exp.title}</div>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>{exp.uploader_name}</div>
      </td>
      <td style={{ color: 'var(--text-2)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{formatDate(exp.created_at)}</td>
      <td><TagChips tags={exp.tags} /></td>
      <td>
        {exp.type === 'audio'
          ? <StatusBadge status={exp.transcription_status} />
          : <span style={{ color: 'var(--text-4)', fontSize: '0.75rem' }}>—</span>}
      </td>
      <td style={{ color: 'var(--text-3)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{formatFileSize(exp.file_size_bytes)}</td>
      <td>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={onView}>View</button>
          <button className="btn btn-danger btn-sm" onClick={onDelete} disabled={deleting}>
            {deleting ? <Spinner /> : 'Delete'}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Experience Card (mobile list item) ───────────────────────────────────────
function ExperienceCard({ exp, onView, onDelete, deleting }) {
  return (
    <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.625rem' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
            <TypeBadge type={exp.type} />
            {exp.type === 'audio' && <StatusBadge status={exp.transcription_status} />}
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-1)', lineHeight: 1.3 }}>{exp.title}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '0.2rem' }}>
            {exp.uploader_name} · {formatDate(exp.created_at)} · {formatFileSize(exp.file_size_bytes)}
          </div>
        </div>
      </div>
      {exp.tags?.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <TagChips tags={exp.tags} />
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-secondary btn-sm" onClick={onView} style={{ flex: 1 }}>View</button>
        <button className="btn btn-danger btn-sm" onClick={onDelete} disabled={deleting} style={{ flex: 1 }}>
          {deleting ? <Spinner /> : 'Delete'}
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}

function DashboardContent() {
  const { getToken }  = useAuth();
  const router        = useRouter();
  const searchParams  = useSearchParams();
  const showUploading = searchParams.get('uploading') === '1';

  const [experiences,    setExperiences]    = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [deleting,       setDeleting]       = useState(null);
  const [pendingUploads, setPendingUploads] = useState(getPendingCount);
  const [viewMode,       setViewMode]       = useState('grid'); // 'grid' | 'table'

  const fetchExperiences = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const data = await apiGet('/experiences', getToken());
      setExperiences(data.experiences || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { fetchExperiences(); }, [fetchExperiences]);

  useEffect(() => {
    let prev = getPendingCount();
    return subscribeUploads((count) => {
      setPendingUploads(count);
      if (count === 0 && prev > 0) fetchExperiences();
      prev = count;
    });
  }, [fetchExperiences]);

  const handleDelete = async (id, title) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await apiDelete(`/experiences/${id}`, getToken());
      setExperiences((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  const total       = experiences.length;
  const transcribed = experiences.filter((e) => e.transcription_status === 'done').length;
  const audioCount  = experiences.filter((e) => e.type === 'audio').length;
  const docCount    = experiences.filter((e) => e.type !== 'audio').length;

  return (
    <AppLayout>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">All captured knowledge at a glance</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={fetchExperiences} disabled={loading} aria-label="Refresh"
            title="Refresh">
            {loading ? <Spinner dark /> : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12.5 7A5.5 5.5 0 1 1 7 1.5c1.8 0 3.4.86 4.4 2.2M12.5 1.5v3h-3" />
              </svg>
            )}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => router.push('/capture')}>
            + New Capture
          </button>
        </div>
      </div>

      {/* Background upload banner */}
      {(showUploading || pendingUploads > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.875rem',
          padding: '1rem 1.125rem', marginBottom: '1.25rem',
          background: 'rgba(59,158,255,0.06)', border: '1px solid rgba(59,158,255,0.20)',
          borderRadius: 'var(--r-lg)',
        }}>
          <Spinner dark />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>
              {pendingUploads > 0 ? 'Uploading in background…' : 'Processing your upload…'}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>
              {pendingUploads > 0
                ? 'Your file is uploading. The list refreshes automatically when done.'
                : 'Upload complete — refreshing now.'}
            </p>
          </div>
          {pendingUploads === 0 && (
            <button onClick={() => router.replace('/dashboard', { scroll: false })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '1.1rem', lineHeight: 1 }}>✕</button>
          )}
        </div>
      )}

      {error && (
        <div className="alert-error" style={{ marginBottom: '1.25rem' }}>
          <span>⚠</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      {/* Metric tiles */}
      <div className="grid-metrics">
        <MetricTile
          value={total} label="Total Captures"
          accent="linear-gradient(90deg, #D94A44, #E65A54)"
          icon={<Files size={16} color="#D94A44" />}
          iconBg="rgba(217,74,68,0.10)"
        />
        <MetricTile
          value={transcribed} label="Transcribed"
          accent="linear-gradient(90deg, #2DB56A, #38d67c)"
          icon={<CheckCircle size={16} color="#2DB56A" />}
          iconBg="rgba(45,181,106,0.10)"
        />
        <MetricTile
          value={audioCount} label="Audio Files"
          accent="linear-gradient(90deg, #00C5C8, #00e5e8)"
          icon={<Mic size={16} color="#00C5C8" />}
          iconBg="rgba(0,197,200,0.10)"
        />
        <MetricTile
          value={docCount} label="Documents"
          accent="linear-gradient(90deg, #E8A838, #f5c64a)"
          icon={<FileText size={16} color="#E8A838" />}
          iconBg="rgba(232,168,56,0.10)"
        />
      </div>

      {/* Experiences list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-2xl)', overflow: 'hidden' }}>

        {/* Panel header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.875rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--text-1)' }}>All Experiences</span>
            <span style={{
              fontSize: '0.6rem', fontWeight: 700, padding: '0.15rem 0.5rem',
              borderRadius: '9999px', background: 'var(--surface-3)',
              color: 'var(--text-3)', border: '1px solid var(--border)',
              letterSpacing: '0.04em',
            }}>{total}</span>
          </div>
          {/* Desktop view toggle */}
          <div className="dash-table" style={{ display: 'flex', gap: '0.25rem' }}>
            <button
              className={`btn btn-icon btn-sm ${viewMode === 'grid' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setViewMode('grid')} title="Card view"
              style={{ minHeight: '28px', padding: '0.25rem 0.4rem' }}
            >
              <LayoutGrid size={13} />
            </button>
            <button
              className={`btn btn-icon btn-sm ${viewMode === 'table' ? 'btn-secondary' : 'btn-ghost'}`}
              onClick={() => setViewMode('table')} title="Table view"
              style={{ minHeight: '28px', padding: '0.25rem 0.4rem' }}
            >
              <List size={13} />
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
            <Spinner dark />
          </div>
        ) : experiences.length === 0 ? (
          <EmptyState
            icon="📭"
            title="No experiences yet"
            description="Start by uploading a document or recording knowledge from your team."
            actionLabel="+ New Capture"
            onAction={() => router.push('/capture')}
          />
        ) : (
          <>
            {/* Desktop: card grid or table */}
            <div className="dash-table">
              {viewMode === 'grid' ? (
                <div className="exp-grid">
                  {experiences.map((exp) => (
                    <ExperienceGridCard
                      key={exp.id} exp={exp}
                      onView={() => router.push(`/review?id=${exp.id}`)}
                      onDelete={() => handleDelete(exp.id, exp.title)}
                      deleting={deleting === exp.id}
                    />
                  ))}
                </div>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Type</th><th>Title</th><th>Date</th>
                        <th>Tags</th><th>Status</th><th>Size</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {experiences.map((exp) => (
                        <ExperienceRow
                          key={exp.id} exp={exp}
                          onView={() => router.push(`/review?id=${exp.id}`)}
                          onDelete={() => handleDelete(exp.id, exp.title)}
                          deleting={deleting === exp.id}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Mobile: card list */}
            <div className="dash-cards">
              {experiences.map((exp) => (
                <ExperienceCard
                  key={exp.id} exp={exp}
                  onView={() => router.push(`/review?id=${exp.id}`)}
                  onDelete={() => handleDelete(exp.id, exp.title)}
                  deleting={deleting === exp.id}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
