import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getApiBase, apiFetch } from '@/lib/api';

interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
}

interface SubscriptionInfo {
  status: 'none' | 'active' | 'trialing' | 'canceled' | 'past_due' | 'unpaid';
  subscription: any | null;
}

interface UserContextValue {
  username: string | null;
  isLoaded: boolean;
  login: (name: string) => void;
  logout: () => void;
  authUser: AuthUser | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  authLogin: () => void;
  authLogout: () => void;
  isReplit: boolean;
  subscription: SubscriptionInfo;
  refreshSubscription: () => void;
  isPremium: boolean;
}

const UserContext = createContext<UserContextValue>({
  username: null,
  isLoaded: false,
  login: () => {},
  logout: () => {},
  authUser: null,
  isAuthenticated: false,
  isAuthLoading: true,
  authLogin: () => {},
  authLogout: () => {},
  isReplit: false,
  subscription: { status: 'none', subscription: null },
  refreshSubscription: () => {},
  isPremium: false,
});

function isReplitHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host.includes('replit') || host === 'localhost';
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo>({ status: 'none', subscription: null });
  const isReplit = isReplitHost();

  useEffect(() => {
    const stored = localStorage.getItem('chessCoachUsername');
    if (stored) setUsername(stored);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isReplit) {
      setIsAuthLoading(false);
      return;
    }

    let cancelled = false;

    fetch('/api/auth/user', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setAuthUser(data.user ?? null);
          setIsAuthLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthUser(null);
          setIsAuthLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [isReplit]);

  const refreshSubscription = useCallback(() => {
    if (!isReplit || !authUser) return;

    fetch('/api/stripe/subscription', { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          setSubscription({
            status: data.status || 'none',
            subscription: data.subscription,
          });
        }
      })
      .catch(() => {});
  }, [isReplit, authUser]);

  useEffect(() => {
    refreshSubscription();
  }, [refreshSubscription]);

  const login = (name: string) => {
    localStorage.setItem('chessCoachUsername', name);
    setUsername(name);
  };

  const logout = () => {
    localStorage.removeItem('chessCoachUsername');
    setUsername(null);
  };

  const authLogin = useCallback(() => {
    const base = import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base)}`;
  }, []);

  const authLogout = useCallback(() => {
    localStorage.removeItem('chessCoachUsername');
    setUsername(null);
    window.location.href = '/api/logout';
  }, []);

  const isPremium = subscription.status === 'active' || subscription.status === 'trialing';

  return (
    <UserContext.Provider value={{
      username,
      isLoaded,
      login,
      logout,
      authUser,
      isAuthenticated: !!authUser,
      isAuthLoading,
      authLogin,
      authLogout,
      isReplit,
      subscription,
      refreshSubscription,
      isPremium,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
