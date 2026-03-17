"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";

interface User {
  id: string;
  plaud_user_id?: string;
  name?: string;
  avatar_url?: string;
  authenticated: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth
      .me()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async () => {
    const { url } = await api.auth.login();
    window.location.href = url;
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
    window.location.href = "/login";
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
