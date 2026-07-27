'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import logger from '@/lib/logger';

import type { AuthUser, LocalUser } from '../types';
import { AuthContext } from './AuthProvider';

export function LocalProviderWrapper({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [loading, setLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const initializeAuth = async () => {
      try {
        const response = await fetch('/api/auth/oss');
        if (response.ok) {
          const data = await response.json();
          tokenRef.current = data.token;
          
          try {
            const authUserRes = await fetch('/api/v1/user/auth/user', {
              headers: { Authorization: `Bearer ${data.token}` }
            });
            if (authUserRes.ok) {
              const authUserData = await authUserRes.json();
              const updatedUser = {
                ...data.user,
                ...authUserData,
                organizationId: authUserData.organization_id ? String(authUserData.organization_id) : data.user.organizationId
              };
              setUser(updatedUser);
              logger.info('OSS auth initialized from backend', { user: updatedUser });
            } else {
              setUser(data.user);
              logger.info('OSS auth initialized from cookie fallback', { user: data.user });
            }
          } catch (err) {
            setUser(data.user);
            logger.info('OSS auth initialized from cookie fallback (error)', { user: data.user });
          }
        } else if (response.status === 401) {
          // No token - redirect to login (but not if already on auth pages)
          if (!window.location.pathname.startsWith('/auth/')) {
            window.location.href = '/auth/login';
            return;
          }
        } else {
          logger.error('Failed to initialize OSS auth');
        }
      } catch (error) {
        logger.error('Error initializing OSS auth', error);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();
  }, []);

  const getAccessToken = React.useCallback(async () => {
    if (typeof window === 'undefined') {
      return 'ssr-placeholder-token';
    }
    if (!tokenRef.current) {
      logger.warn('No OSS token available after initialization');
      return '';
    }
    return tokenRef.current;
  }, []);

  const redirectToLogin = React.useCallback(() => {
    window.location.href = '/auth/login';
  }, []);

  const logout = React.useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      logger.error('Error during logout', error);
    }
    setUser(null);
    tokenRef.current = null;
    window.location.href = '/auth/login';
  }, []);

  const contextValue = useMemo(() => ({
    user: user as AuthUser,
    isAuthenticated: !!user,
    loading,
    getAccessToken,
    redirectToLogin,
    logout,
    provider: 'local' as const,
  }), [user, loading, getAccessToken, redirectToLogin, logout]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
