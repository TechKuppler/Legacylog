'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { apiGet, getDepartments, adminUpdateDept, adminCreateTag, adminDeleteTag } from '@/lib/api';
import { Spinner } from '@/components/ui';

export default function AdminTagsPage() {
  const { getToken }  = useAuth();
  const [tags,       setTags]       = useState([]);
  const [depts,      setDepts]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [saving,     setSaving]     = useState(null);
  const [deleting,   setDeleting]   = useState(null);
  const [showForm,   setShowForm]   = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [creating,   setCreating]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [td, dd] = await Promise.all([
        apiGet('/tags', getToken()),
        getDepartments(getToken()),
      ]);
      setTags(td.tags || []);
      setDepts(dd.departments || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  const toggleTagInDept = async (dept, tagId) => {
    const currentTagIds = (dept.tags || []).map((t) => t.id);
    const newTagIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId];
    setSaving(dept.id);
    try {
      await adminUpdateDept(dept.id, { tag_ids: newTagIds }, getToken());
      setDepts((prev) => prev.map((d) =>
        d.id === dept.id ? { ...d, tags: tags.filter((t) => newTagIds.includes(t.id)) } : d
      ));
    } catch (err) { setError(err.message); }
    finally { setSaving(null); }
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;
    setCreating(true); setError('');
    try {
      const data = await adminCreateTag({ name: newTagName.trim() }, getToken());
      setTags((prev) => [...prev, data.tag].sort((a, b) => {
        if (a.is_predefined !== b.is_predefined) return b.is_predefined - a.is_predefined;
        return a.name.localeCompare(b.name);
      }));
      setNewTagName(''); setShowForm(false);
    } catch (err) { setError(err.message); }
    finally { setCreating(false); }
  };

  const handleDeleteTag = async (tag) => {
    if (!confirm(`Delete "${tag.name}"? It will be removed from all departments and experiences.`)) return;
    setDeleting(tag.id); setError('');
    try {
      await adminDeleteTag(tag.id, getToken());
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
      setDepts((prev) => prev.map((d) => ({ ...d, tags: (d.tags || []).filter((t) => t.id !== tag.id) })));
    } catch (err) { setError(err.message); }
    finally { setDeleting(null); }
  };

  const tagDeptCount = depts.reduce((acc, d) => {
    (d.tags || []).forEach((t) => { acc[t.id] = (acc[t.id] || 0) + 1; });
    return acc;
  }, {});

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
      <Spinner dark />
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {error && (
        <div className="alert-error">
          <span>⚠</span>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      {/* ── Tag Library ── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-2xl)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--surface-2)' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-1)' }}>Tag Library</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>{tags.length} tag{tags.length !== 1 ? 's' : ''} total</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowForm((v) => !v); setNewTagName(''); }}>
            {showForm ? '✕ Cancel' : '+ New Tag'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={handleCreateTag} style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem', background: 'var(--surface-2)' }}>
            <input
              className="input" style={{ flex: 1 }}
              placeholder="Tag name…"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              autoFocus disabled={creating} maxLength={80}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !newTagName.trim()}>
              {creating ? <Spinner /> : 'Create'}
            </button>
          </form>
        )}

        {/* Tag rows */}
        {!tags.length ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>No tags yet — create one above</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            {tags.map((t, i) => {
              const deptCount = tagDeptCount[t.id] || 0;
              const isDeleting = deleting === t.id;
              const isLast = i === tags.length - 1;
              return (
                <div key={t.id} style={{
                  padding: '0.875rem 1.25rem',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem',
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.name}
                    </div>
                    <div style={{ fontSize: '0.67rem', color: 'var(--text-3)', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ color: t.is_predefined ? 'var(--accent)' : 'var(--text-3)' }}>
                        {t.is_predefined ? 'Predefined' : 'Custom'}
                      </span>
                      {deptCount > 0 && (
                        <>
                          <span style={{ opacity: 0.3 }}>·</span>
                          <span>{deptCount} dept{deptCount !== 1 ? 's' : ''}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    type="button" onClick={() => handleDeleteTag(t)} disabled={isDeleting}
                    style={{ background: 'none', border: 'none', cursor: isDeleting ? 'default' : 'pointer', color: 'var(--text-3)', fontSize: '0.875rem', padding: '0.25rem', borderRadius: 'var(--r-md)', lineHeight: 1, flexShrink: 0, transition: 'color 0.12s' }}
                    onMouseEnter={(e) => { if (!isDeleting) e.currentTarget.style.color = 'var(--error)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; }}
                  >
                    {isDeleting ? <Spinner /> : '✕'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Department ↔ Tag Assignment ── */}
      {depts.length > 0 && (
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-3)', marginBottom: '0.875rem' }}>
            Assign Tags to Departments
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {depts.map((dept) => (
              <div key={dept.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-2xl)', overflow: 'hidden' }}>
                {/* Dept header */}
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.625rem', background: 'var(--surface-2)' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dept.color, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--text-1)', flex: 1 }}>{dept.name}</span>
                  {saving === dept.id && <Spinner />}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-3)' }}>
                    {(dept.tags || []).length} / {tags.length} assigned
                  </span>
                </div>

                {/* Tag toggles */}
                <div style={{ padding: '0.875rem 1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {!tags.length && <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>No tags available</span>}
                  {tags.map((t) => {
                    const active = (dept.tags || []).some((dt) => dt.id === t.id);
                    return (
                      <button key={t.id} type="button"
                        onClick={() => toggleTagInDept(dept, t.id)}
                        disabled={saving === dept.id}
                        style={{
                          padding: '0.3rem 0.75rem',
                          borderRadius: '9999px',
                          fontSize: '0.78rem',
                          fontWeight: active ? 600 : 400,
                          fontFamily: 'inherit',
                          border: `1px solid ${active ? 'var(--brand)' : 'var(--border-strong)'}`,
                          background: active ? 'var(--brand-light)' : 'transparent',
                          color: active ? 'var(--brand-hover)' : 'var(--text-3)',
                          cursor: saving === dept.id ? 'default' : 'pointer',
                          transition: 'all 0.15s',
                          opacity: saving === dept.id ? 0.6 : 1,
                        }}
                      >
                        {active && <span style={{ marginRight: '0.25rem', fontSize: '0.65rem' }}>✓</span>}
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
