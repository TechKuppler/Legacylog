'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, CirclePlus, FileSearch, ShieldCheck,
  FileText, LogOut, X, ChevronRight, Mic, FileStack,
} from 'lucide-react';
import { useAuth, usePermissions } from '@/lib/AuthContext';
import { apiGet } from '@/lib/api';

const TYPE_ICON = {
  audio: <Mic size={13} />,
  pdf:   <FileText size={13} />,
  doc:   <FileText size={13} />,
  txt:   <FileText size={13} />,
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, size = '2rem', fontSize = '0.7rem' }) {
  const initials = (name || 'U').split(' ').slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'linear-gradient(135deg, #D94A44, #B93A34)',
      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize, fontWeight: 700, flexShrink: 0,
      fontFamily: "'Open Sans', sans-serif",
      boxShadow: '0 0 0 2px rgba(217,74,68,0.22)',
    }}>{initials}</div>
  );
}

// ─── NavItem ──────────────────────────────────────────────────────────────────
function NavItem({ href, label, icon, active, onClick }) {
  return (
    <Link href={href} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '0.625rem',
      padding: '0.5rem 0.75rem', borderRadius: '0.625rem',
      fontSize: '0.8125rem', fontWeight: active ? 600 : 400,
      color: active ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
      background: active ? 'var(--sidebar-active-bg)' : 'transparent',
      textDecoration: 'none', marginBottom: '0.1rem',
      transition: 'all 120ms ease',
    }}
    onMouseEnter={(e) => {
      if (!active) {
        e.currentTarget.style.background = 'var(--sidebar-hover-bg)';
        e.currentTarget.style.color = 'var(--sidebar-text-hover)';
      }
    }}
    onMouseLeave={(e) => {
      if (!active) {
        e.currentTarget.style.background = 'transparent';
        e.currentTarget.style.color = 'var(--sidebar-text)';
      }
    }}
    >
      <span style={{
        color: active ? 'var(--sidebar-active-text)' : 'var(--sidebar-text)',
        display: 'flex', alignItems: 'center', flexShrink: 0,
        opacity: active ? 1 : 0.65,
      }}>{icon}</span>
      <span style={{ flex: 1, lineHeight: 1.3 }}>{label}</span>
      {active && <ChevronRight size={12} style={{ color: 'var(--sidebar-active-text)', opacity: 0.5 }} />}
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

  const navItems = [
    { href: '/dashboard', label: 'Dashboard',          icon: <LayoutDashboard size={16} />, show: true },
    { href: '/capture',   label: 'Capture Experience', icon: <CirclePlus size={16} />,      show: isAdmin || can('can_upload') || can('can_record') },
    { href: '/review',    label: 'Review Files',       icon: <FileSearch size={16} />,      show: true },
  ].filter((i) => i.show);

  return (
    <>
      {open && (
        <div onClick={onClose} style={{
          position: 'fixed', inset: 0, zIndex: 199,
          background: 'rgba(0,0,0,0.70)',
          backdropFilter: 'blur(2px)',
        }} />
      )}

      <aside className={`sidebar${open ? ' sidebar-open' : ''}`} suppressHydrationWarning>

        {/* Brand header */}
        <div style={{
          padding: '1.125rem 1rem 1rem',
          borderBottom: '1px solid var(--sidebar-border)',
          flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: '1.75rem', height: '1.75rem', borderRadius: '7px',
              background: 'linear-gradient(135deg, #D94A44, #B93A34)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.65rem', color: '#fff', fontWeight: 800, flexShrink: 0,
              boxShadow: '0 2px 8px rgba(217,74,68,0.35)',
            }}>LL</div>
            <div>
              <div style={{
                fontFamily: "'Open Sans', sans-serif",
                fontSize: '0.9375rem', fontWeight: 800,
                letterSpacing: '-0.03em', color: 'var(--text-1)',
              }}>LegacyLog</div>
              <div style={{ fontSize: '0.575rem', color: 'var(--text-4)', fontWeight: 500, letterSpacing: '0.02em', marginTop: '0.05rem' }}>
                Kuppler Knowledge Base
              </div>
            </div>
          </div>
          <button onClick={onClose} className="sidebar-close-btn" style={{
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            cursor: 'pointer', color: 'var(--text-3)',
            display: 'none', width: '1.875rem', height: '1.875rem',
            borderRadius: '0.5rem', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={14} />
          </button>
        </div>

        {/* Navigation */}
        <nav style={{ padding: '0.625rem 0.625rem 0', flexShrink: 0 }}>
          <div className="sidebar-group-label">Navigation</div>
          {navItems.map(({ href, label, icon }) => {
            const active = pathname === href || (pathname.startsWith(href + '/') && href !== '/review');
            return <NavItem key={href} href={href} label={label} icon={icon} active={active} onClick={onClose} />;
          })}

          {isAdmin && (
            <>
              <div className="sidebar-group-label" style={{ marginTop: '0.75rem' }}>Workspace</div>
              <NavItem
                href="/admin" label="Admin Panel"
                icon={<ShieldCheck size={16} />}
                active={pathname === '/admin' || pathname.startsWith('/admin/')}
                onClick={onClose}
              />
            </>
          )}
        </nav>

        {/* Recent Captures */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 0.625rem', borderTop: '1px solid var(--sidebar-border)', marginTop: '0.5rem' }}>
          <div className="sidebar-group-label">Recent Captures</div>

          {allTags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', paddingBottom: '0.5rem' }}>
              {allTags.slice(0, 8).map((t) => (
                <button key={t.id} onClick={() => setActiveTagId(activeTagId === t.id ? null : t.id)} style={{
                  padding: '0.15rem 0.5rem', borderRadius: '9999px', fontSize: '0.595rem',
                  background: activeTagId === t.id ? 'rgba(217,74,68,0.12)' : 'transparent',
                  color: activeTagId === t.id ? '#D94A44' : 'var(--sidebar-text)',
                  border: `1px solid ${activeTagId === t.id ? 'rgba(217,74,68,0.3)' : 'var(--sidebar-border)'}`,
                  cursor: 'pointer', fontWeight: activeTagId === t.id ? 600 : 400,
                  transition: 'all 120ms ease', fontFamily: 'inherit',
                }}>{t.name}</button>
              ))}
              {activeTagId && (
                <button onClick={() => setActiveTagId(null)} style={{
                  fontSize: '0.595rem', color: 'var(--text-4)', background: 'none',
                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: '0.1rem',
                }}>clear</button>
              )}
            </div>
          )}

          {!filteredExps.length && (
            <div style={{ padding: '1.5rem 0.5rem', textAlign: 'center' }}>
              <FileStack size={20} style={{ color: 'var(--text-4)', opacity: 0.35, display: 'block', margin: '0 auto 0.5rem' }} />
              <p style={{ fontSize: '0.7rem', color: 'var(--text-4)', lineHeight: 1.5 }}>
                {activeTagId ? 'No matches for this tag' : 'No captures yet'}
              </p>
            </div>
          )}

          {filteredExps.slice(0, 20).map((exp) => {
            const isActive = selectedId && String(selectedId) === String(exp.id);
            return (
              <button key={exp.id} onClick={() => handleExpClick(exp.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.45rem 0.75rem', borderRadius: '0.625rem',
                background: isActive ? 'var(--sidebar-active-bg)' : 'transparent',
                border: 'none', cursor: 'pointer', textAlign: 'left',
                marginBottom: '0.05rem', transition: 'all 120ms ease', fontFamily: 'inherit',
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--sidebar-hover-bg)'; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ color: isActive ? 'var(--sidebar-active-text)' : 'var(--text-4)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  {TYPE_ICON[exp.type] || <FileText size={13} />}
                </span>
                <span style={{
                  fontSize: '0.775rem', fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--sidebar-active-text)' : 'var(--sidebar-text-hover)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, lineHeight: 1.35,
                }}>{exp.title}</span>
              </button>
            );
          })}
        </div>

        {/* Account footer */}
        <div style={{
          padding: '0.75rem 0.875rem',
          borderTop: '1px solid var(--sidebar-border)',
          flexShrink: 0,
        }}>
          <div className="sidebar-group-label">Account</div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem',
            padding: '0.5rem 0.5rem', borderRadius: '0.625rem',
            background: 'var(--sidebar-hover-bg)', border: '1px solid var(--sidebar-border)',
          }}>
            <Avatar name={user?.name} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
              <div style={{ fontSize: '0.595rem', color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginTop: '0.1rem' }}>{user?.role}</div>
            </div>
          </div>
          <button onClick={handleLogout} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.45rem 0.75rem', borderRadius: '0.625rem',
            background: 'rgba(217,74,68,0.06)',
            border: '1px solid rgba(217,74,68,0.16)',
            cursor: 'pointer',
            fontSize: '0.78rem', color: '#D94A44', transition: 'all 120ms ease', fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(217,74,68,0.12)'; e.currentTarget.style.borderColor = 'rgba(217,74,68,0.30)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(217,74,68,0.06)'; e.currentTarget.style.borderColor = 'rgba(217,74,68,0.16)'; }}
          >
            <LogOut size={14} style={{ flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>Sign out</span>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)', flexDirection: 'column', gap: '1rem' }}>
        <div style={{
          width: '2.5rem', height: '2.5rem', borderRadius: '10px',
          background: 'linear-gradient(135deg, #D94A44, #B93A34)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.85rem', color: '#fff', fontWeight: 800,
          boxShadow: '0 4px 16px rgba(217,74,68,0.35)',
        }}>LL</div>
        <span className="spinner spinner-dark" style={{ width: '1.25rem', height: '1.25rem' }} />
      </div>
    );
  }

  if (!user || user.mustChangePassword) return null;

  return (
    <div className="app-layout">
      <Suspense fallback={null}>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      </Suspense>
      <main className="main-content">
        <div className="mobile-topbar">
          <button
            onClick={() => setSidebarOpen(true)}
            style={{
              background: 'var(--surface-2)', border: '1px solid var(--border)',
              cursor: 'pointer', color: 'var(--text-2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '2.25rem', height: '2.25rem', borderRadius: '0.625rem',
            }}
            aria-label="Open menu"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M2 3.5h11M2 7.5h11M2 11.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
          <span style={{
            fontFamily: "'Open Sans', sans-serif",
            fontSize: '1rem', fontWeight: 800,
            letterSpacing: '-0.03em', color: 'var(--text-1)',
          }}>LegacyLog</span>
          <div style={{ width: '2.25rem' }} />
        </div>
        <div className="page-wrap">
          {children}
        </div>
      </main>
    </div>
  );
}
