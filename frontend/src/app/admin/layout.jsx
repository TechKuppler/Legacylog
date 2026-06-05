'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import { usePermissions } from '@/lib/AuthContext';

const ADMIN_TABS = [
  { href: '/admin/users',       label: 'Users'       },
  { href: '/admin/departments', label: 'Departments' },
  { href: '/admin/tags',        label: 'Tags'        },
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
      <div style={{ maxWidth: '1100px', width: '100%' }}>

        {/* Page header */}
        <div className="page-header" style={{ marginBottom: '0', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)' }}>
          <div className="page-header-left">
            <h1 className="page-title">Admin Panel</h1>
            <p className="page-subtitle">Manage users, departments, and tag assignments</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="tab-bar" style={{ marginBottom: '1.5rem' }}>
          {ADMIN_TABS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`tab-btn ${pathname === href ? 'active' : ''}`}
              style={{ textDecoration: 'none' }}
            >
              {label}
            </Link>
          ))}
        </div>

        {children}
      </div>
    </AppLayout>
  );
}
