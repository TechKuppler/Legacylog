'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth, usePermissions } from '@/lib/AuthContext';
import { apiGet } from '@/lib/api';

const TYPE_ICON = { audio: '🎙', pdf: '📄', doc: '📝', txt: '📃' };

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, size = '1.875rem', fontSize = '0.7rem' }) {
  const initials = (name || 'U').split(' ').slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize, fontWeight: 700, flexShrink: 0,
      boxShadow: '0 0 10px rgba(59,130,246,0.35)',
      fontFamily: "'DM Sans', sans-serif",
    }}>{initials}</div>
  );
}

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({ href, label, icon, active, onClick }) {
  return (
    <Link href={href} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '0.625rem',
      padding: '0.45rem 0.625rem', borderRadius: 'var(--r-md)',
      fontSize: '0.8125rem', fontWeight: active ? 600 : 500,
      color: active ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
      background: active ? 'var(--sidebar-active-bg)' : 'transparent',
      textDecoration: 'none', marginBottom: '0.125rem',
      borderLeft: active ? '2px solid var(--brand)' : '2px solid transparent',
      boxShadow: active ? '0 0 12px rgba(59,130,246,0.15)' : 'none',
      transition: 'all 0.15s',
    }}
    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.background = 'var(--sidebar-hover-bg)'; e.currentTarget.style.color = 'var(--sidebar-text-hover)'; e.currentTarget.style.borderLeftColor = 'rgba(59,130,246,0.3)'; } }}
    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sidebar-text)'; e.currentTarget.style.borderLeftColor = 'transparent'; } }}
    >
      <span style={{ fontSize: '0.9rem', width: '1.1rem', textAlign: 'center', opacity: active ? 1 : 0.7 }}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ open, onClose }) {
  const { user, logout, getToken } = useAuth();
  const { isAdmin, can }           = usePermissions();
  const pathname                   = usePathname();
  const searchParams               = useSearchParams();
  const router                     = useRouter();

  const [experiences,  setExperiences]  = useState([]);
  const [allTags,      setAllTags]      = useState([]);
  const [activeTagId,  setActiveTagId]  = useState(null);

  const NAV_ITEMS = [
    { href: '/dashboard', label: 'Dashboard',          icon: '⊞', show: true },
    { href: '/capture',   label: 'Capture Experience', icon: '⊕', show: isAdmin || can('can_upload') || can('can_record') },
    { href: '/review',    label: 'Review Files',       icon: '◫', show: true },
    { href: '/admin',     label: 'Admin Panel',        icon: '⚙', show: isAdmin, divider: true },
  ].filter((i) => i.show);

  const loadSidebar = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const [expData, tagData] = await Promise.all([
      apiGet('/experiences', token).catch(() => ({ experiences: [] })),
      apiGet('/tags', token).catch(() => ({ tags: [] })),
    ]);
    setExperiences(expData.experiences || []);
    setAllTags(tagData.tags || []);
  }, [getToken]);

  useEffect(() => { loadSidebar(); }, [loadSidebar]);
  useEffect(() => {
    if (pathname !== '/capture') loadSidebar();
  }, [pathname, loadSidebar]);

  const handleLogout = async () => { await logout(); router.push('/auth/login'); };

  const selectedId = pathname === '/review' ? searchParams.get('id') : null;

  const filteredExps = activeTagId
    ? experiences.filter((e) => (e.tags || []).some((t) => t.id === activeTagId))
    : experiences;

  const handleExpClick = (id) => {
    router.push(`/review?id=${id}`);
    onClose?.();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0, zIndex: 99,
          background: 'rgba(0,0,0,0.55)',
        }} className="sidebar-backdrop" />
      )}

      <aside className={`sidebar${open ? ' sidebar-open' : ''}`} suppressHydrationWarning>
        {/* Brand */}
        <div style={{ padding: '1.125rem 1rem 1rem', borderBottom: '1px solid var(--sidebar-border)', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{
              fontFamily: 'DM Serif Display, serif', fontSize: '1.15rem', fontWeight: 400, letterSpacing: '-0.01em',
              background: 'linear-gradient(135deg,#3b82f6,#06b6d4)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>LegacyLog</div>
            <div style={{ fontSize: '0.65rem', color: 'var(--sidebar-text)', marginTop: '0.15rem' }}>Kuppler Knowledge Base</div>
          </div>
          {/* Close button — mobile only */}
          <button onClick={onClose} className="sidebar-close-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sidebar-text)', fontSize: '1.1rem', display: 'none' }}>✕</button>
        </div>

        {/* Nav */}
        <nav style={{ padding: '0.5rem', flexShrink: 0 }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--sidebar-text)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.75rem 0.625rem 0.4rem', fontFamily: "'JetBrains Mono', monospace" }}>
            Menu
          </div>
          {NAV_ITEMS.map(({ href, label, icon, divider }) => {
            const active = pathname === href || (pathname.startsWith(href + '/') && href !== '/review');
            return (
              <div key={href}>
                {divider && <div style={{ height: '1px', background: 'var(--sidebar-border)', margin: '0.4rem 0.5rem' }} />}
                <NavItem href={href} label={label} icon={icon} active={active} onClick={onClose} />
              </div>
            );
          })}
        </nav>

        {/* Experiences + tag filter */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.5rem', borderTop: '1px solid var(--sidebar-border)' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--sidebar-text)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '0.75rem 0.625rem 0.4rem', fontFamily: "'JetBrains Mono', monospace" }}>
            Experiences
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', padding: '0 0.25rem 0.5rem' }}>
              {allTags.slice(0, 8).map((t) => (
                <button key={t.id} onClick={() => setActiveTagId(activeTagId === t.id ? null : t.id)} style={{
                  padding: '0.15rem 0.5rem', borderRadius: '9999px', fontSize: '0.65rem',
                  background: activeTagId === t.id ? 'rgba(59,130,246,0.2)' : 'transparent',
                  color: activeTagId === t.id ? '#58a6ff' : 'var(--sidebar-text)',
                  border: `1px solid ${activeTagId === t.id ? 'rgba(59,130,246,0.4)' : 'var(--sidebar-border)'}`,
                  cursor: 'pointer', fontWeight: activeTagId === t.id ? 600 : 400,
                  transition: 'all 0.15s',
                }}>{t.name}</button>
              ))}
              {activeTagId && (
                <button onClick={() => setActiveTagId(null)} style={{ fontSize: '0.62rem', color: 'var(--sidebar-text)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: '0.1rem 0.25rem' }}>
                  clear
                </button>
              )}
            </div>
          )}

          {!filteredExps.length && (
            <p style={{ fontSize: '0.72rem', color: 'var(--sidebar-text)', padding: '0.25rem 0.625rem', opacity: 0.5 }}>
              {activeTagId ? 'No matches for this tag' : 'No experiences yet'}
            </p>
          )}
          {filteredExps.map((exp) => {
            const isActive = selectedId && String(selectedId) === String(exp.id);
            return (
              <button key={exp.id} onClick={() => handleExpClick(exp.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.4rem 0.625rem', borderRadius: 'var(--r-md)',
                background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                borderLeft: isActive ? '2px solid var(--brand)' : '2px solid transparent',
                boxShadow: isActive ? '0 0 10px rgba(59,130,246,0.12)' : 'none',
                marginBottom: '0.1rem', transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--sidebar-hover-bg)'; e.currentTarget.style.borderLeftColor = 'rgba(59,130,246,0.25)'; } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeftColor = 'transparent'; } }}
              >
                <span style={{ fontSize: '0.75rem', flexShrink: 0, opacity: 0.7 }}>{TYPE_ICON[exp.type] || '📄'}</span>
                <span style={{ fontSize: '0.77rem', fontWeight: 500, color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {exp.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* User Footer */}
        <div style={{ padding: '0.75rem', borderTop: '1px solid var(--sidebar-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem', padding: '0 0.125rem' }}>
            <Avatar name={user?.name} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#e6edf3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
              <div style={{ fontSize: '0.62rem', color: 'var(--sidebar-text)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: "'JetBrains Mono', monospace" }}>{user?.role}</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.4rem 0.625rem', borderRadius: 'var(--r-md)',
            background: 'transparent', border: '1px solid transparent', cursor: 'pointer',
            fontSize: '0.77rem', color: 'var(--sidebar-text)', transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,81,73,0.08)'; e.currentTarget.style.color = '#f85149'; e.currentTarget.style.borderColor = 'rgba(248,81,73,0.2)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--sidebar-text)'; e.currentTarget.style.borderColor = 'transparent'; }}
          >
            <span style={{ fontSize: '0.85rem' }}>↩</span><span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── AppLayout ────────────────────────────────────────────────────────────────
export default function AppLayout({ children }) {
  const { user, loading } = useAuth();
  const router            = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/auth/login'); return; }
    if (user.mustChangePassword) router.replace('/change-password');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
        <span className="spinner spinner-dark" style={{ width: '1.5rem', height: '1.5rem' }} />
      </div>
    );
  }

  if (!user || user.mustChangePassword) return null;

  return (
    <div className="app-layout">
      <Suspense fallback={null}><Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} /></Suspense>
      <main className="main-content">
        {/* Mobile top bar */}
        <div className="mobile-topbar">
          <button onClick={() => setSidebarOpen(true)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-2)', fontSize: '1.2rem', padding: '0.25rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>☰</button>
          <span style={{
            fontFamily: 'DM Serif Display, serif', fontSize: '1rem',
            background: 'linear-gradient(135deg,#3b82f6,#06b6d4)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>LegacyLog</span>
          <div style={{ width: '1.75rem' }} />
        </div>
        {children}
      </main>
    </div>
  );
}
