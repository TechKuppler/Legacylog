'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import { StatusBadge, TypeBadge, Spinner, EmptyState, formatDate, formatFileSize } from '@/components/ui';
import { apiGet, apiDelete } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

// ─── Metric Card ──────────────────────────────────────────────────────────────
function MetricCard({ value, label, icon }) {
  return (
    <div className="metric-card">
      <div className="metric-icon">{icon}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}

// ─── Tag Chips (inline) ───────────────────────────────────────────────────────
function TagChips({ tags = [] }) {
  if (!tags.length) return <span style={{ color: 'var(--text-3)' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
      {tags.slice(0, 3).map((t) => (
        <span key={t.id} style={{
          fontSize: '0.68rem', padding: '0.15rem 0.5rem',
          borderRadius: '9999px',
          background: 'rgba(59,130,246,0.12)', color: '#58a6ff',
          border: '1px solid rgba(59,130,246,0.22)',
          fontWeight: 500,
        }}>
          {t.name}
        </span>
      ))}
      {tags.length > 3 && (
        <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>+{tags.length - 3}</span>
      )}
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { getToken } = useAuth();
  const router = useRouter();

  const [experiences, setExperiences] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [deleting,    setDeleting]    = useState(null);

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
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">All captured knowledge at a glance</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-ghost btn-sm" onClick={fetchExperiences} disabled={loading}>
            {loading ? <Spinner dark /> : '↻'} Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => router.push('/capture')}>
            + New Experience
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="alert-error" style={{ marginBottom: '1.25rem' }}>
          <span>⚠</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.75rem' }}>
        <MetricCard value={total}       label="Total Captures"    icon="📚" />
        <MetricCard value={transcribed} label="Transcribed"       icon="✓"  />
        <MetricCard value={audioCount}  label="Audio Files"       icon="🎙" />
        <MetricCard value={docCount}    label="Documents"         icon="📄" />
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)', overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {/* Table Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.875rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: 'var(--text-1)' }}>All Experiences</span>
          <span style={{
            fontSize: '0.68rem', color: 'var(--text-3)',
            fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.04em',
          }}>
            {total} item{total !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
            <Spinner dark />
          </div>
        ) : experiences.length === 0 ? (
          <EmptyState
            icon="📭"
            title="No experiences yet"
            description="Click '+ New Experience' to upload your first file."
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Date</th>
                  <th>Tags</th>
                  <th>Status</th>
                  <th>Size</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {experiences.map((exp) => (
                  <tr key={exp.id}>
                    <td><TypeBadge type={exp.type} /></td>
                    <td>
                      <span style={{ fontWeight: 500, color: 'var(--text-1)' }}>{exp.title}</span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>{exp.uploader_name}</div>
                    </td>
                    <td style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatDate(exp.created_at)}</td>
                    <td><TagChips tags={exp.tags} /></td>
                    <td>
                      {exp.type === 'audio'
                        ? <StatusBadge status={exp.transcription_status} />
                        : <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>—</span>}
                    </td>
                    <td style={{ color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{formatFileSize(exp.file_size_bytes)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => router.push(`/review?id=${exp.id}`)}
                        >
                          View
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDelete(exp.id, exp.title)}
                          disabled={deleting === exp.id}
                        >
                          {deleting === exp.id ? <Spinner /> : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
