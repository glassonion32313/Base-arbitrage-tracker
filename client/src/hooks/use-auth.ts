import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface User {
  id: number;
  username: string;
  email: string;
  walletAddress: string | null;
  hasPrivateKey: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  updatePrivateKey: (privateKey: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('auth_token');
  });
  const queryClient = useQueryClient();

  // Query for current user
  const { data: user, isLoading } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      if (!token) return null;
      return await apiRequest('/api/auth/me', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).then(data => data.user);
    },
    enabled: !!token,
    retry: false,
  });

  // Update private key mutation
  const updatePrivateKeyMutation = useMutation({
    mutationFn: async (privateKey: string) => {
      return await apiRequest('/api/auth/private-key', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ privateKey }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
  });

  // Logout mutation
  const logoutMutation = useMutation({
    mutationFn: async () => {
      if (!token) return;
      return await apiRequest('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    },
    onSettled: () => {
      setToken(null);
      localStorage.removeItem('auth_token');
      queryClient.clear();
    },
  });

  const login = (user: User, newToken: string) => {
    setToken(newToken);
    localStorage.setItem('auth_token', newToken);
    queryClient.setQueryData(['/api/auth/me'], user);
  };

  const logout = () => {
    logoutMutation.mutate();
  };

  const updatePrivateKey = async (privateKey: string) => {
    await updatePrivateKeyMutation.mutateAsync(privateKey);
  };

  // Clear token if user query fails with 401
  useEffect(() => {
    if (token && user === undefined && !isLoading) {
      // Token is invalid
      setToken(null);
      localStorage.removeItem('auth_token');
    }
  }, [token, user, isLoading]);

  const value: AuthContextType = {
    user: user || null,
    token,
    isAuthenticated: !!user,
    isLoading: isLoading && !!token,
    login,
    logout,
    updatePrivateKey,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}