import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { analytics } from '@heycatch/sdk';
import { apiFetch, setAuthToken, getAuthToken } from '@/lib/api';

interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  chesscomUsername: string | null;
  lichessUsername: string | null;
  isAdmin: boolean;
  emailVerified?: boolean;
}

interface SubscriptionInfo {
  status: 'none' | 'active' | 'trialing' | 'canceled' | 'past_due' | 'unpaid' | 'free_trial';
  subscription: any | null;
  trialDaysLeft?: number;
  trialEndsAt?: string;
}

interface UserContextValue {
  username: string | null;
  isLoaded: boolean;
  login: (name: string) => void;
  logout: () => void;
  authUser: AuthUser | null;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  authLogout: () => void;
  subscription: SubscriptionInfo;
  isSubscriptionLoaded: boolean;
  refreshSubscription: () => void;
  isPremium: boolean;
  refreshAuth: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  username: null,
  isLoaded: false,
  login: () => {},
  logout: () => {},
  authUser: null,
  isAuthenticated: false,
  isAuthLoading: true,
  authLogout: () => {},
  subscription: { status: 'none', subscription: null },
  isSubscriptionLoaded: false,
  refreshSubscription: () => {},
  isPremium: false,
  refreshAuth: async () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo>({ status: 'none', subscription: null });
  const [isSubscriptionLoaded, setIsSubscriptionLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('chessCoachUsername');
    if (stored) setUsername(stored);
    setIsLoaded(true);
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      if (typeof window !== 'undefined' && window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const hashToken = hashParams.get('token');
        if (hashToken) {
          setAuthToken(hashToken);
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }

      const res = await apiFetch('/api/auth/user', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { user: AuthUser | null };
      setAuthUser(data.user ?? null);
      if (data.user) {
        // HeyCatch identity -- id is the stable internal user id, never
        // an email/token. Email and name live in properties so the
        // dashboard can show a real name instead of an opaque id.
        analytics.setIdentity(
          data.user.id,
          {
            email: data.user.email ?? undefined,
            name: data.user.firstName ?? data.user.chesscomUsername ?? undefined,
            plan: 'free',
          },
        );
      }
      if (data.user?.chesscomUsername && !localStorage.getItem('chessCoachUsername')) {
        localStorage.setItem('chessCoachUsername', data.user.chesscomUsername);
        setUsername(data.user.chesscomUsername);
      }
    } catch {
      setAuthUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const refreshSubscription = useCallback(() => {
    if (!authUser) {
      setIsSubscriptionLoaded(true);
      return;
    }

    apiFetch('/api/stripe/subscription', { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          setSubscription({
            status: data.status || 'none',
            subscription: data.subscription,
            trialDaysLeft: data.trialDaysLeft,
            trialEndsAt: data.trialEndsAt,
          });
          if (data.status === 'active' || data.status === 'trialing') {
            analytics.setPersonProperties({ plan: data.status === 'trialing' ? 'trial' : 'pro' });
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        setIsSubscriptionLoaded(true);
      });
  }, [authUser]);

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

  const authLogout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    analytics.resetIdentity();
    setAuthToken(null);
    localStorage.removeItem('chessCoachUsername');
    setUsername(null);
    setAuthUser(null);
    setSubscription({ status: 'none', subscription: null });
  }, []);

  const isPremium = !!authUser?.isAdmin || subscription.status === 'active' || subscription.status === 'trialing' || subscription.status === 'free_trial';

  return (
    <UserContext.Provider value={{
      username,
      isLoaded,
      login,
      logout,
      authUser,
      isAuthenticated: !!authUser,
      isAuthLoading,
      authLogout,
      subscription,
      isSubscriptionLoaded,
      refreshSubscription,
      isPremium,
      refreshAuth,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
