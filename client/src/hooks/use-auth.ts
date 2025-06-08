import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: number;
  username: string;
  email: string;
  walletAddress: string | null;
  hasPrivateKey: boolean;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => 
    localStorage.getItem('auth_token')
  );
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const currentToken = token || localStorage.getItem('auth_token');
      if (!currentToken) return null;
      
      try {
        const response = await fetch("/api/auth/user", {
          headers: {
            'Authorization': `Bearer ${currentToken}`
          }
        });
        
        if (!response.ok) {
          if (response.status === 401) {
            // Token is invalid, clear it
            localStorage.removeItem('auth_token');
            setToken(null);
            return null;
          }
          throw new Error('Failed to fetch user');
        }
        
        return await response.json();
      } catch (error) {
        console.error('Auth error:', error);
        localStorage.removeItem('auth_token');
        setToken(null);
        return null;
      }
    },
    retry: false,
  });

  const logout = async () => {
    try {
      if (token) {
        await apiRequest("/api/auth/logout", {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('auth_token');
      setToken(null);
      queryClient.clear();
      toast({
        title: "Signed out",
        description: "You have been successfully signed out",
      });
    }
  };

  // Update token in localStorage when it changes and invalidate queries
  useEffect(() => {
    if (token) {
      localStorage.setItem('auth_token', token);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    } else {
      localStorage.removeItem('auth_token');
      queryClient.clear();
    }
  }, [token, queryClient]);

  // Listen for successful login
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_token') {
        setToken(e.newValue);
        if (e.newValue) {
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [queryClient]);

  return {
    user: user as User | null,
    isLoading,
    isAuthenticated: !!user && !!token,
    logout,
    setToken, // Expose for login components
  };
}