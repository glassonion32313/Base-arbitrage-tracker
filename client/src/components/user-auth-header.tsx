import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import AccountManager from './account-manager';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { User, Wallet, Settings, LogOut, Copy } from 'lucide-react';

export default function UserAuthHeader() {
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const { user, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();

  if (isLoading) {
    return (
      <Button disabled className="flex items-center gap-2">
        <User className="h-4 w-4" />
        Loading...
      </Button>
    );
  }

  if (!isAuthenticated) {
    return (
      <Button 
        onClick={() => window.location.href = '/api/login'}
        className="flex items-center gap-2"
      >
        <User className="h-4 w-4" />
        Sign In
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">
              {user?.firstName || user?.email || 'User'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-3 py-2">
            <p className="text-sm font-medium">
              {user?.firstName && user?.lastName 
                ? `${user.firstName} ${user.lastName}`
                : user?.firstName || 'User'}
            </p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={() => window.location.href = '/api/logout'}
            className="cursor-pointer text-red-600 focus:text-red-600"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}