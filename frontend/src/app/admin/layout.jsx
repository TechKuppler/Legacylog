'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import { usePermissions } from '@/lib/AuthContext';

const ADMIN_TABS = [
  { href: '/admin/users',       label: 'Users',       icon: '👤' },
  { href: '/admin/departments', label: 'Departments', icon: '🏢' },
  { href: '/admin/tags',        label: 'Tags',        icon: '🏷' },
];

export default function AdminLayout({ children }) {
  const { isAdmin } = usePermissions();
  const router      = useRouter();
  const pathname    = usePathname();

  useEffect(() => {
    if (!isAdmin) router.replace('/dashboard');
  }, [isAdmin, router]);

  if (!isAdmin) return null;

  return (
    <AppLayout>
      <div style={{ maxWidth: '1100px' }}>
        {/* Header */}
        <div className="page-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1.25rem', marginBottom: '0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.2rem' }}>
            <div style={{
              width: '2rem', height: '2rem', borderRadius: 'var(--r-md)',
              background: 'linear-gradient(135deg,#3b82f6,#06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', boxShadow: '0 0 12px rgba(59,130,246,0.4)',
            }}>⚙</div>
            <h1 className="page-title" style={{ fontSize: '1.35rem' }}>Admin Panel</h1>
          </div>
          <p className="page-subtitle" style={{ paddingLeft: '2.75rem' }}>
            Manage users, departments, and tag assignments
          </p>
        </div>

        {/* Tab bar */}
        <div className="tab-bar" style={{ marginBottom: '1.75rem' }}>
          {ADMIN_TABS.map(({ href, label, icon }) => (
            <Link key={href} href={href}
              className={`tab-btn ${pathname === href ? 'active' : ''}`}
              style={{ textDecoration: 'none', gap: '0.35rem' }}
            >
              <span style={{ fontSize: '0.85rem' }}>{icon}</span>
              {label}
            </Link>
          ))}
        </div>

        {children}
      </div>
    </AppLayout>
  );
}
