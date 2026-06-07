'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { StatusBadge, TypeBadge, Spinner, EmptyState, formatDate, formatFileSize } from '@/components/ui';
import { apiGet, apiDelete } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { subscribe as subscribeUploads, getPendingCount } from '@/lib/uploadQueue';

// ─── Metric Tile ──────────────────────────────────────────────────────────────
function MetricTile({ value, label, accent }) {
  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-xl)',
      padding: '1rem 1.125rem',
      position: 'relative',
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '2px',
        background: accent || 'var(--brand-gradient)',
      }} />
      <div style={{
        fontSize: '2rem',
        fontWeight: 800,
        color: 'var(--text-1)',
        lineHeight: 1,
        letterSpacing: '-0.04em',
        fontFamily: "'Open Sans', sans-serif",
      }}>{value}</div>
      <div style={{
        fontSize: '0.63rem',
        fontWeight: 700,
        color: 'var(--text-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.09em',
        marginTop: '0.375rem',
      }}>{label}</div>
    </div>
  );
}

// ─── Tag Chips ────────────────────────────────────────────────────────────────
function TagChips({ tags = [] }) {
  if (!tags.length) return <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
      {tags.slice(0, 2).map((t) => (
        <span key={t.id} style={{
          fontSize: '0.65rem', padding: '0.15rem 0.5rem', borderRadius: '9999px',
          background: 'rgba(224,50,40,0.10)', color: '#F04039',
          border: '1px solid rgba(224,50,40,0.20)', fontWeight: 600,
        }}>{t.name}</span>
      ))}
      {tags.length > 2 && (
        <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', alignSelf: 'center' }}>+{tags.length - 2}</span>
      )}
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
          : <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>—</span>}
      </td>
      <td style={{ color: 'var(--text-2)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{formatFileSize(exp.file_size_bytes)}</td>
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
    <div style={{
      padding: '1rem',
      borderBottom: '1px solid var(--border)',
    }}>
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

  // Auto-refresh list when background upload finishes
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
          <button className="btn btn-ghost btn-sm" onClick={fetchExperiences} disabled={loading} aria-label="Refresh">
            {loading ? <Spinner dark /> : '↻'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => router.push('/capture')}>
            + New
          </button>
        </div>
      </div>

      {/* Background upload banner */}
      {(showUploading || pendingUploads > 0) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.875rem 1rem', marginBottom: '1rem',
          background: 'rgba(224,50,40,0.07)', border: '1px solid rgba(224,50,40,0.25)',
          borderRadius: 'var(--r-lg)',
        }}>
          <Spinner dark />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-1)' }}>
              {pendingUploads > 0 ? 'Uploading in the background…' : 'Processing your upload…'}
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>
              {pendingUploads > 0
                ? 'Your file is being uploaded. The dashboard will refresh automatically when done.'
                : 'Upload complete — refreshing the list now.'}
            </p>
          </div>
          {pendingUploads === 0 && (
            <button onClick={() => router.replace('/dashboard', { scroll: false })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: '1rem' }}>✕</button>
          )}
        </div>
      )}

      {error && (
        <div className="alert-error" style={{ marginBottom: '1rem' }}>
          <span>⚠</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      {/* Metric tiles — 4 columns desktop, 2×2 mobile */}
      <div className="grid-metrics">
        <MetricTile value={total}       label="Total Captures" accent="var(--brand-gradient)" />
        <MetricTile value={transcribed} label="Transcribed"    accent="linear-gradient(135deg,#2DB56A,#1a8a4a)" />
        <MetricTile value={audioCount}  label="Audio Files"    accent="linear-gradient(135deg,#00C5C8,#007b7d)" />
        <MetricTile value={docCount}    label="Documents"      accent="linear-gradient(135deg,#F5C200,#b88e00)" />
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
          <span style={{ fontWeight: 700, fontSize: '0.8125rem', color: 'var(--text-1)' }}>All Experiences</span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-3)', fontWeight: 600 }}>
            {total} item{total !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '3.5rem' }}>
            <Spinner dark />
          </div>
        ) : experiences.length === 0 ? (
          <EmptyState icon="📭" title="No experiences yet" description="Tap '+ New' to upload or record your first experience." />
        ) : (
          <>
            {/* Desktop: table */}
            <div className="dash-table">
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
