'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { adminGetUsers, adminCreateUser, adminUpdateUser, adminResetPwd, getDepartments, apiGet, adminSetUserTags } from '@/lib/api';
import { Spinner } from '@/components/ui';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PERM_FLAGS = [
  { key: 'can_upload',           label: 'Upload files & experiences' },
  { key: 'can_record',           label: 'Record audio in browser'    },
  { key: 'can_create_tags',      label: 'Create custom tags'         },
  { key: 'can_delete_own',       label: 'Delete own experiences'     },
  { key: 'can_view_transcripts', label: 'View transcripts'           },
  { key: 'can_download_files',   label: 'Download original files'    },
  { key: 'can_view_chat',        label: 'Access AI chatbot'          },
];

const DEFAULT_PERMS = {
  can_upload: false, can_record: false, can_create_tags: false,
  can_delete_own: false, can_view_transcripts: true,
  can_download_files: false, can_view_chat: false,
};

function relativeTime(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Drawer ───────────────────────────────────────────────────────────────────
function UserDrawer({ mode, initial, allDepts, allTags, onSave, onClose, getToken }) {
  const isEdit = mode === 'edit';

  const [name,       setName]       = useState(initial?.name       || '');
  const [email,      setEmail]      = useState(initial?.email      || '');
  const [password,   setPassword]   = useState('');
  const [role,       setRole]       = useState(initial?.role       || 'member');
  const [deptIds,    setDeptIds]    = useState((initial?.departments || []).map((d) => d.id));
  const [tagIds,     setTagIds]     = useState((initial?.directTags || []).map((t) => t.id));
  const [perms,      setPerms]      = useState(initial?.permissions || { ...DEFAULT_PERMS });
  const [busy,       setBusy]       = useState(false);
  const [error,      setError]      = useState('');

  const toggleDept = (id) =>
    setDeptIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleTag = (id) =>
    setTagIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const togglePerm = (key) =>
    setPerms((prev) => ({ ...prev, [key]: !prev[key] }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (isEdit) {
        const body = { name, role, department_ids: deptIds };
        if (role === 'member') body.permissions = perms;
        await adminUpdateUser(initial.id, body, getToken());
        await adminSetUserTags(initial.id, tagIds, getToken());
      } else {
        const created = await adminCreateUser({
          name, email, password, role,
          department_ids: deptIds,
          permissions: perms,
        }, getToken());
        if (tagIds.length && created?.user?.id) {
          await adminSetUserTags(created.user.id, tagIds, getToken());
        }
      }
      onSave();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex' }}>
      {/* Overlay */}
      <div onClick={onClose} style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }} />
      {/* Panel */}
      <div className="drawer-panel" style={{
        width: '420px', background: 'var(--surface)', borderLeft: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontFamily: "'Open Sans', sans-serif", fontWeight: 700, fontSize: '1.1rem' }}>
            {isEdit ? 'Edit User' : 'Create New User'}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--text-2)' }}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
          {error && <div className="alert-error"><span>⚠</span><span style={{ flex: 1 }}>{error}</span></div>}

          <div>
            <label className="field-label">Full Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} placeholder="Ravi Kumar" />
          </div>

          {!isEdit && (
            <>
              <div>
                <label className="field-label">Email Address</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={busy} placeholder="ravi@kuppler.in" />
              </div>
              <div>
                <label className="field-label">Temporary Password</label>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} placeholder="Min 8 characters" />
              </div>
            </>
          )}

          <div>
            <label className="field-label">Role</label>
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)} disabled={busy}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <label className="field-label" style={{ marginBottom: '0.5rem' }}>Departments</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {allDepts.map((d) => {
                const sel = deptIds.includes(d.id);
                return (
                  <button key={d.id} type="button"
                    onClick={() => toggleDept(d.id)}
                    style={{
                      padding: '0.25rem 0.75rem', borderRadius: '9999px', fontSize: '0.78rem',
                      border: `1px solid ${sel ? d.color : 'var(--border)'}`,
                      background: sel ? d.color + '20' : 'transparent',
                      color: sel ? d.color : 'var(--text-2)', cursor: 'pointer', fontWeight: sel ? 600 : 400,
                    }}
                  >{sel ? '✓ ' : ''}{d.name}</button>
                );
              })}
              {!allDepts.length && <p style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>No departments yet</p>}
            </div>
          </div>

          <div>
            <label className="field-label" style={{ marginBottom: '0.5rem' }}>Direct Tag Access</label>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', marginBottom: '0.5rem' }}>
              Tags this user can always see, independent of departments.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', maxHeight: '120px', overflowY: 'auto' }}>
              {allTags.map((t) => {
                const sel = tagIds.includes(t.id);
                return (
                  <button key={t.id} type="button" onClick={() => toggleTag(t.id)} style={{
                    padding: '0.2rem 0.6rem', borderRadius: '9999px', fontSize: '0.75rem',
                    border: `1px solid ${sel ? 'rgba(224,50,40,0.40)' : 'var(--border)'}`,
                    background: sel ? 'rgba(224,50,40,0.12)' : 'transparent',
                    color: sel ? '#F04039' : 'var(--text-2)', cursor: 'pointer',
                    fontWeight: sel ? 600 : 400, transition: 'all 0.12s',
                  }}>{sel ? '✓ ' : ''}{t.name}</button>
                );
              })}
              {!allTags.length && <p style={{ fontSize: '0.78rem', color: 'var(--text-3)' }}>No tags available</p>}
            </div>
          </div>

          {role === 'member' && (
            <div>
              <label className="field-label" style={{ marginBottom: '0.5rem' }}>Permissions</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {PERM_FLAGS.map(({ key, label }) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem' }}>
                    <input type="checkbox" checked={!!perms[key]} onChange={() => togglePerm(key)} style={{ width: '1rem', height: '1rem', accentColor: 'var(--brand)' }} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.625rem', marginTop: 'auto', paddingTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={busy} style={{ flex: 1 }}>
              {busy ? <><Spinner /> Saving…</> : isEdit ? 'Save Changes' : 'Create User →'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Reset Password Modal ─────────────────────────────────────────────────────
function ResetModal({ user: target, onDone, onClose, getToken }) {
  const [newPassword, setNewPassword] = useState('');
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await adminResetPwd(target.id, { newPassword }, getToken());
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '1.5rem', width: '360px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontFamily: "'Open Sans', sans-serif", fontWeight: 700 }}>Reset Password</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)' }}>✕</button>
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-2)', marginBottom: '1rem' }}>
          Resetting password for <strong>{target.name}</strong>. They will be logged out and must sign in with the new credentials.
        </p>
        {error && <div className="alert-error" style={{ marginBottom: '0.75rem' }}><span>⚠</span><span>{error}</span></div>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <input className="input" type="password" placeholder="New password (min 8 chars)"
            value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoFocus />
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" disabled={busy} style={{ flex: 1 }}>
              {busy ? <Spinner /> : 'Reset Password'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Users Page ───────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const { getToken } = useAuth();
  const [users,    setUsers]    = useState([]);
  const [depts,    setDepts]    = useState([]);
  const [allTags,  setAllTags]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [drawer,   setDrawer]   = useState(null);
  const [resetFor, setResetFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [ud, dd, td] = await Promise.all([
        adminGetUsers(getToken()),
        getDepartments(getToken()),
        apiGet('/tags', getToken()),
      ]);
      setUsers(ud.users || []);
      setDepts(dd.departments || []);
      setAllTags(td.tags || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  const handleDeactivate = async (user) => {
    if (!confirm(`${user.is_active ? 'Deactivate' : 'Reactivate'} "${user.name}"?`)) return;
    try {
      await adminUpdateUser(user.id, { is_active: !user.is_active }, getToken());
      load();
    } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setDrawer({ mode: 'create' })}>
          + Create User
        </button>
      </div>

      {error && (
        <div className="alert-error" style={{ marginBottom: '1rem' }}>
          <span>⚠</span><span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>✕</button>
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-2xl)', overflow: 'hidden', boxShadow: 'var(--shadow-xs)' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><Spinner dark /></div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr><th>User</th><th>Role</th><th>Departments</th><th>Status</th><th>Last Login</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{u.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{u.email}</div>
                    </td>
                    <td>
                      <span style={{
                        fontSize: '0.72rem', padding: '0.2rem 0.6rem', borderRadius: '9999px', fontWeight: 600,
                        background: u.role === 'admin' ? '#7C3AED20' : 'var(--brand-light)',
                        color: u.role === 'admin' ? '#7C3AED' : 'var(--brand)',
                      }}>{u.role}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {(u.departments || []).slice(0, 3).map((d) => (
                          <span key={d.id} style={{ fontSize: '0.68rem', padding: '0.1rem 0.5rem', borderRadius: '9999px', background: d.color + '20', color: d.color, fontWeight: 600 }}>{d.name}</span>
                        ))}
                        {(u.departments || []).length > 3 && <span style={{ fontSize: '0.68rem', color: 'var(--text-3)' }}>+{u.departments.length - 3}</span>}
                        {u.role !== 'admin' && !u.departments?.length && <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>—</span>}
                      </div>
                    </td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8rem' }}>
                        <span style={{ width: '0.5rem', height: '0.5rem', borderRadius: '50%', background: u.is_active ? '#10b981' : '#ef4444', display: 'inline-block' }} />
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-2)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>{relativeTime(u.last_login)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setDrawer({ mode: 'edit', user: u })}>Edit</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setResetFor(u)}>Reset Pwd</button>
                        {u.role !== 'admin' && (
                          <button className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-secondary'}`} onClick={() => handleDeactivate(u)}>
                            {u.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawer && (
        <UserDrawer
          mode={drawer.mode}
          initial={drawer.user}
          allDepts={depts}
          allTags={allTags}
          getToken={getToken}
          onSave={() => { setDrawer(null); load(); }}
          onClose={() => setDrawer(null)}
        />
      )}

      {resetFor && (
        <ResetModal
          user={resetFor}
          getToken={getToken}
          onDone={() => { setResetFor(null); load(); }}
          onClose={() => setResetFor(null)}
        />
      )}
    </div>
  );
}
