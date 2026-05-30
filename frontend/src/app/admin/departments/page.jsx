'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getDepartments, adminCreateDept, adminUpdateDept, adminDeleteDept, apiGet } from '@/lib/api';
import { Spinner } from '@/components/ui';

const PRESET_COLORS = ['#185FA5','#7C3AED','#0891B2','#059669','#D97706','#DC2626','#DB2777','#B45309','#2563EB','#16A34A'];

// ─── Department Drawer ────────────────────────────────────────────────────────
function DeptDrawer({ mode, initial, allTags, onSave, onClose, getToken }) {
  const isEdit = mode === 'edit';
  const [name,    setName]    = useState(initial?.name        || '');
  const [desc,    setDesc]    = useState(initial?.description || '');
  const [color,   setColor]   = useState(initial?.color       || '#185FA5');
  const [tagIds,  setTagIds]  = useState((initial?.tags || []).map((t) => t.id));
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');

  const toggleTag = (id) =>
    setTagIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body = { name, description: desc, color, tag_ids: tagIds };
      if (isEdit) await adminUpdateDept(initial.id, body, getToken());
      else        await adminCreateDept(body, getToken());
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{ width: '400px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: 'DM Serif Display, serif', fontSize: '1.1rem' }}>
            {isEdit ? 'Edit Department' : 'New Department'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', fontSize: '1.1rem' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
          {error && <div className="alert-error"><span>⚠</span><span>{error}</span></div>}
          <div>
            <label className="field-label">Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} placeholder="e.g. Export Documentation" />
          </div>
          <div>
            <label className="field-label">Description</label>
            <input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} disabled={busy} placeholder="Optional description" />
          </div>
          <div>
            <label className="field-label" style={{ marginBottom: '0.5rem' }}>Color</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center' }}>
              {PRESET_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} style={{
                  width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: c, border: color === c ? '2px solid var(--text-1)' : '2px solid transparent', cursor: 'pointer',
                }} />
              ))}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                style={{ width: '1.5rem', height: '1.5rem', border: 'none', cursor: 'pointer', background: 'none', padding: 0 }} />
            </div>
          </div>
          <div>
            <label className="field-label" style={{ marginBottom: '0.5rem' }}>Tags in this department</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', maxHeight: '180px', overflowY: 'auto' }}>
              {allTags.map((t) => {
                const sel = tagIds.includes(t.id);
                return (
                  <button key={t.id} type="button" onClick={() => toggleTag(t.id)} style={{
                    padding: '0.25rem 0.625rem', borderRadius: '9999px', fontSize: '0.78rem',
                    border: `1px solid ${sel ? color : 'var(--border)'}`,
                    background: sel ? color + '20' : 'transparent',
                    color: sel ? color : 'var(--text-2)', cursor: 'pointer',
                  }}>{t.name}</button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.625rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={busy} style={{ flex: 1 }}>
              {busy ? <><Spinner /> Saving…</> : isEdit ? 'Save Changes' : 'Create Department'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Departments Page ─────────────────────────────────────────────────────────
export default function AdminDepartmentsPage() {
  const { getToken } = useAuth();
  const [depts,   setDepts]   = useState([]);
  const [tags,    setTags]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [drawer,  setDrawer]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [dd, td] = await Promise.all([
        getDepartments(getToken()),
        apiGet('/tags', getToken()),
      ]);
      setDepts(dd.departments || []);
      setTags(td.tags || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  const handleDeactivate = async (dept) => {
    if (!confirm(`Deactivate "${dept.name}"? Users in this department will lose access.`)) return;
    try { await adminDeleteDept(dept.id, getToken()); load(); }
    catch (err) { setError(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setDrawer({ mode: 'create' })}>
          + New Department
        </button>
      </div>
      {error && (
        <div className="alert-error" style={{ marginBottom: '1rem' }}>
          <span>⚠</span><span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><Spinner dark /></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr><th>Department</th><th>Tags</th><th>Members</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {depts.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: '0.75rem', height: '0.75rem', borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600 }}>{d.name}</span>
                      </div>
                      {d.description && <div style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginTop: '0.1rem' }}>{d.description}</div>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {(d.tags || []).slice(0, 4).map((t) => (
                          <span key={t.id} style={{ fontSize: '0.68rem', padding: '0.1rem 0.45rem', borderRadius: '9999px', background: d.color + '20', color: d.color, fontWeight: 500 }}>{t.name}</span>
                        ))}
                        {(d.tags || []).length > 4 && <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>+{d.tags.length - 4}</span>}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-2)', textAlign: 'center' }}>{d.member_count}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setDrawer({ mode: 'edit', dept: d })}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeactivate(d)}>Deactivate</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!depts.length && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-3)' }}>No departments yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawer && (
        <DeptDrawer
          mode={drawer.mode}
          initial={drawer.dept}
          allTags={tags}
          getToken={getToken}
          onSave={() => { setDrawer(null); load(); }}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}
