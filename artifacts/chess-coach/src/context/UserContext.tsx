import React, { createContext, useContext, useState, useEffect } from 'react';

interface UserContextValue {
  username: string | null;
  isLoaded: boolean;
  login: (name: string) => void;
  logout: () => void;
}

const UserContext = createContext<UserContextValue>({
  username: null,
  isLoaded: false,
  login: () => {},
  logout: () => {},
});

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('chessCoachUsername');
    if (stored) setUsername(stored);
    setIsLoaded(true);
  }, []);

  const login = (name: string) => {
    localStorage.setItem('chessCoachUsername', name);
    setUsername(name);
  };

  const logout = () => {
    localStorage.removeItem('chessCoachUsername');
    setUsername(null);
  };

  return (
    <UserContext.Provider value={{ username, isLoaded, login, logout }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
