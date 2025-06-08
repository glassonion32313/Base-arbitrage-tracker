import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import SimpleLogin from "@/components/simple-login";
import { User, LogOut } from 'lucide-react';

export default function WorkingAuthHeader() {
  const [showLogin, setShowLogin] = useState(false);
  const { user, isAuthenticated, isLoading, logout } = useAuth();
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
      <>
        <Button 
          onClick={() => setShowLogin(true)}
          className="flex items-center gap-2"
        >
          <User className="h-4 w-4" />
          Sign In
        </Button>
        
        {showLogin && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLogin(false)}
                className="absolute -top-2 -right-2 h-8 w-8 p-0 z-10 bg-white text-black hover:bg-gray-100"
              >
                ✕
              </Button>
              <SimpleLogin onSuccess={() => setShowLogin(false)} />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">
              {user?.username || 'User'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-3 py-2">
            <p className="text-sm font-medium">{user?.username}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={logout}
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