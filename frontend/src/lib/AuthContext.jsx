'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from './api';

const TOKEN_STORAGE_KEY = 'legacylog_token';

const AuthContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  const initAuth = useCallback(async () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) { setLoading(false); return; }
    try {
      const data = await apiGet('/auth/me', token);
      setUser(data.user);
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { initAuth(); }, [initAuth]);

  const login = async (email, password) => {
    const data = await apiPost('/auth/login', { email, password });
    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) {
      try { await apiPost('/auth/logout', {}, token); } catch { /* ignore */ }
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
    setUser(null);
  };

  const getToken = () => localStorage.getItem(TOKEN_STORAGE_KEY);

  // Refresh user from server (used after changePassword)
  const refreshUser = async () => {
    try {
      const data = await apiGet('/auth/me', getToken());
      setUser(data.user);
    } catch { /* ignore */ }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, getToken, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── useAuth ──────────────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

// ─── usePermissions ───────────────────────────────────────────────────────────
// Returns { isAdmin, can(flag), departments }
export function usePermissions() {
  const { user } = useAuth();
  if (!user) return { isAdmin: false, can: () => false, departments: [] };
  if (user.role === 'admin') return { isAdmin: true, can: () => true, departments: [] };
  return {
    isAdmin:     false,
    can:         (flag) => !!user.permissions?.[flag],
    departments: user.departments || [],
  };
}
