import { useState, useEffect } from 'react';

export function useUser() {
  const [username, setUsername] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('chessCoachUsername');
    if (stored) {
      setUsername(stored);
    }
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

  return { username, login, logout, isLoaded };
}
