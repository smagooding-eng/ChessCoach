import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  chesscomUsername: string | null;
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

  useEffect(() => {
    const stored = localStorage.getItem('chessCoachUsername');
    if (stored) setUsername(stored);
    setIsLoaded(true);
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/user', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { user: AuthUser | null };
      setAuthUser(data.user ?? null);
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
    if (!authUser) return;

    fetch('/api/stripe/subscription', { credentials: 'include' })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          setSubscription({
            status: data.status || 'none',
            subscription: data.subscription,
            trialDaysLeft: data.trialDaysLeft,
            trialEndsAt: data.trialEndsAt,
          });
        }
      })
      .catch(() => {});
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
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    localStorage.removeItem('chessCoachUsername');
    setUsername(null);
    setAuthUser(null);
    setSubscription({ status: 'none', subscription: null });
  }, []);

  const isPremium = subscription.status === 'active' || subscription.status === 'trialing' || subscription.status === 'free_trial';

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
