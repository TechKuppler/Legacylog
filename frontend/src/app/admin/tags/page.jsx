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
  const [saving,     setSaving]     = useState(null); // deptId being saved
  const [deleting,   setDeleting]   = useState(null); // tagId being deleted

  // New tag form state
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

  // Toggle a tag's membership in a department (full replace approach)
  const toggleTagInDept = async (dept, tagId) => {
    const currentTagIds = (dept.tags || []).map((t) => t.id);
    const newTagIds = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId];

    setSaving(dept.id);
    try {
      await adminUpdateDept(dept.id, { tag_ids: newTagIds }, getToken());
      setDepts((prev) => prev.map((d) =>
        d.id === dept.id
          ? { ...d, tags: tags.filter((t) => newTagIds.includes(t.id)) }
          : d
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
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
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTag = async (tag) => {
    if (!confirm(`Delete tag "${tag.name}"? It will be removed from all departments and experiences.`)) return;
    setDeleting(tag.id); setError('');
    try {
      await adminDeleteTag(tag.id, getToken());
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
      // Also remove from dept tag lists
      setDepts((prev) => prev.map((d) => ({
        ...d, tags: (d.tags || []).filter((t) => t.id !== tag.id),
      })));
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleting(null);
    }
  };

  // Build a map: tagId → dept names for the "assigned to" column
  const tagDeptMap = depts.reduce((acc, d) => {
    (d.tags || []).forEach((t) => {
      if (!acc[t.id]) acc[t.id] = [];
      acc[t.id].push(d);
    });
    return acc;
  }, {});

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><Spinner dark /></div>;
  }

  return (
    <div>
      {error && (
        <div className="alert-error" style={{ marginBottom: '1rem' }}>
          <span>⚠</span><span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.25rem', alignItems: 'start' }}>
        {/* Tag list */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>
          <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>All Tags ({tags.length})</span>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => { setShowForm((v) => !v); setNewTagName(''); }}
            >
              {showForm ? '✕ Cancel' : '+ New Tag'}
            </button>
          </div>

          {/* Inline create form */}
          {showForm && (
            <form onSubmit={handleCreateTag} style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
              <input
                className="input"
                style={{ flex: 1, fontSize: '0.8125rem' }}
                placeholder="Tag name…"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                autoFocus
                disabled={creating}
                maxLength={80}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !newTagName.trim()}>
                {creating ? <Spinner /> : 'Create'}
              </button>
            </form>
          )}

          <div style={{ overflowY: 'auto', maxHeight: '520px' }}>
            {tags.map((t) => {
              const assignedTo = tagDeptMap[t.id] || [];
              const isDeleting = deleting === t.id;
              return (
                <div key={t.id} style={{ padding: '0.625rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{t.name}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>
                      {t.is_predefined ? 'Predefined' : 'Custom'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', justifyContent: 'flex-end', maxWidth: '140px' }}>
                      {assignedTo.map((d) => (
                        <span key={d.id} style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem', borderRadius: '9999px', background: d.color + '20', color: d.color, fontWeight: 600 }}>
                          {d.name}
                        </span>
                      ))}
                      {!assignedTo.length && <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Unassigned</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteTag(t)}
                      disabled={isDeleting}
                      title="Delete tag"
                      style={{
                        background: 'none', border: 'none', cursor: isDeleting ? 'default' : 'pointer',
                        color: 'var(--text-3)', fontSize: '0.85rem', padding: '0.2rem 0.3rem',
                        borderRadius: '4px', lineHeight: 1,
                        transition: 'color 0.12s',
                      }}
                      onMouseEnter={(e) => { if (!isDeleting) e.currentTarget.style.color = 'var(--error)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-3)'; }}
                    >
                      {isDeleting ? <Spinner /> : '✕'}
                    </button>
                  </div>
                </div>
              );
            })}
            {!tags.length && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)', fontSize: '0.85rem' }}>No tags yet</div>
            )}
          </div>
        </div>

        {/* Department ↔ Tag matrix */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {depts.map((dept) => (
            <div key={dept.id} style={{ background: 'var(--surface)', border: `1px solid ${dept.color}40`, borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>
              <div style={{ padding: '0.75rem 1rem', borderBottom: `1px solid ${dept.color}40`, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: '0.6rem', height: '0.6rem', borderRadius: '50%', background: dept.color }} />
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: dept.color }}>{dept.name}</span>
                {saving === dept.id && <Spinner />}
              </div>
              <div style={{ padding: '0.625rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
                {tags.map((t) => {
                  const inDept = (dept.tags || []).some((dt) => dt.id === t.id);
                  return (
                    <button key={t.id} type="button"
                      onClick={() => toggleTagInDept(dept, t.id)}
                      disabled={saving === dept.id}
                      style={{
                        padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem',
                        border: `1px solid ${inDept ? dept.color : 'var(--border)'}`,
                        background: inDept ? dept.color + '20' : 'transparent',
                        color: inDept ? dept.color : 'var(--text-3)',
                        cursor: saving === dept.id ? 'default' : 'pointer',
                        fontWeight: inDept ? 600 : 400,
                        transition: 'all 0.12s',
                      }}
                    >{t.name}</button>
                  );
                })}
                {!tags.length && <span style={{ fontSize: '0.8rem', color: 'var(--text-3)' }}>No tags available</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
