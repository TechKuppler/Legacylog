'use client';

import { useState } from 'react';

// ─── Status Badge ─────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const MAP = {
    done:       { label: 'Transcribed', cls: 'badge-done'       },
    processing: { label: 'Processing',  cls: 'badge-processing' },
    queued:     { label: 'Queued',      cls: 'badge-queued'     },
    failed:     { label: 'Failed',      cls: 'badge-failed'     },
  };
  const cfg = MAP[status] || { label: '—', cls: 'badge-none' };
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>;
}

// ─── File Type Badge ──────────────────────────────────────────────────────────
export function TypeBadge({ type }) {
  const MAP = {
    audio: { label: 'Audio',    cls: 'badge-audio' },
    pdf:   { label: 'PDF',      cls: 'badge-pdf'   },
    doc:   { label: 'Document', cls: 'badge-doc'   },
    txt:   { label: 'Text',     cls: 'badge-txt'   },
  };
  const cfg = MAP[type] || { label: type, cls: 'badge-none' };
  return <span className={`badge ${cfg.cls}`}>{cfg.label}</span>;
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ dark = false }) {
  return <span className={dark ? 'spinner spinner-dark' : 'spinner'} />;
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ icon, title, description, actionLabel, onAction }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <p className="empty-state-title">{title}</p>
      {description && <p className="empty-state-desc">{description}</p>}
      {actionLabel && onAction && (
        <div className="empty-state-action">
          <button className="btn btn-primary btn-sm" onClick={onAction}>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tag Picker ───────────────────────────────────────────────────────────────
export function TagPicker({ allTags = [], selectedIds = [], onChange, onCreateTag, canCreateTags = true }) {
  const [customInput, setCustomInput] = useState('');
  const [creating,    setCreating]    = useState(false);
  const [createError, setCreateError] = useState('');

  const toggle = (id) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const handleCreate = async () => {
    const name = customInput.trim();
    if (!name) return;
    setCreating(true); setCreateError('');
    try {
      const tag = await onCreateTag(name);
      onChange([...selectedIds, tag.id]);
      setCustomInput('');
    } catch (err) {
      const msg = err.message || '';
      setCreateError(
        msg.toLowerCase().includes('permission')
          ? "Permission denied: You don't have access to create custom tags."
          : msg
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
        {allTags.map((tag) => (
          <button
            key={tag.id} type="button"
            className={`tag-pill ${selectedIds.includes(tag.id) ? 'selected' : ''}`}
            onClick={() => toggle(tag.id)}
          >
            {tag.name}
            {selectedIds.includes(tag.id) && <span style={{ opacity: 0.7, marginLeft: '0.1rem' }}>×</span>}
          </button>
        ))}
      </div>

      {canCreateTags && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text" className="input"
              placeholder="Add custom tag…"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleCreate())}
              maxLength={80}
            />
            <button
              type="button" className="btn btn-secondary"
              onClick={handleCreate}
              disabled={creating || !customInput.trim()}
              style={{ whiteSpace: 'nowrap' }}
            >
              {creating ? <Spinner /> : 'Add'}
            </button>
          </div>
          {createError && <p style={{ fontSize: '0.75rem', color: 'var(--error)' }}>{createError}</p>}
        </>
      )}
    </div>
  );
}

// ─── Language Selector ────────────────────────────────────────────────────────
export function LanguageSelect({ value, onChange, disabled = false }) {
  const OPTIONS = [
    { value: 'en', label: 'English'  },
    { value: 'hi', label: 'Hindi'    },
    { value: 'gu', label: 'Gujarati' },
    { value: 'mr', label: 'Marathi'  },
  ];
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Format Helpers ───────────────────────────────────────────────────────────
export const formatFileSize = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024)               return `${bytes} B`;
  if (bytes < 1024 ** 2)          return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3)          return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

export const formatDate = (str) => {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const formatTime = (secs) => {
  if (!isFinite(secs) || isNaN(secs) || secs == null) return '--:--';
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};
