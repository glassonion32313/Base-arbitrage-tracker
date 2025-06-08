import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { User, Wallet, Settings, LogOut, Copy } from 'lucide-react';
import AuthModal from './auth-modal';
import SimpleAccountManager from './simple-account-manager';

interface User {
  id: number;
  username: string;
  email: string;
  walletAddress: string | null;
  hasPrivateKey: boolean;
}

export default function SimpleAuthHeader() {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showAccountSettings, setShowAccountSettings] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth_token'));
  const { toast } = useToast();

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const copyAddress = () => {
    if (user?.walletAddress) {
      navigator.clipboard.writeText(user.walletAddress);
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard",
      });
    }
  };

  const handleLogin = (userData: User, authToken: string) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('auth_token', authToken);
    setShowAuthModal(false);
    
    toast({
      title: "Welcome!",
      description: `Successfully logged in as ${userData.username}`,
    });
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('auth_token');
    
    toast({
      title: "Logged Out",
      description: "You have been successfully logged out",
    });
  };

  const isAuthenticated = !!user && !!token;

  if (!isAuthenticated) {
    return (
      <>
        <Button 
          onClick={() => setShowAuthModal(true)}
          className="flex items-center gap-2"
        >
          <User className="h-4 w-4" />
          Sign In
        </Button>
        
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleLogin}
        />
      </>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Wallet Address Display */}
      {user?.hasPrivateKey && user?.walletAddress && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <Wallet className="h-4 w-4 text-green-600" />
          <div className="text-sm">
            <span className="font-semibold text-green-900">{formatAddress(user.walletAddress)}</span>
            <Badge variant="outline" className="ml-2 bg-green-100 text-green-800 border-green-200">
              Connected
            </Badge>
          </div>
        </div>
      )}

      {/* User Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            <span className="hidden sm:inline">{user?.username}</span>
            {user?.hasPrivateKey && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Wallet
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-3 py-2">
            <p className="text-sm font-medium">{user?.username}</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          
          <DropdownMenuSeparator />
          
          {user?.walletAddress && (
            <>
              <div className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Wallet</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyAddress}
                    className="h-6 w-6 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-sm font-mono">{formatAddress(user.walletAddress)}</p>
              </div>
              <DropdownMenuSeparator />
            </>
          )}
          
          <DropdownMenuItem 
            onClick={() => setShowAccountSettings(true)}
            className="cursor-pointer"
          >
            <Settings className="h-4 w-4 mr-2" />
            Account Settings
          </DropdownMenuItem>
          
          <DropdownMenuSeparator />
          
          <DropdownMenuItem 
            onClick={handleLogout}
            className="cursor-pointer text-red-600 focus:text-red-600"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Account Settings Modal */}
      {showAccountSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Account Settings</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAccountSettings(false)}
                className="h-8 w-8 p-0"
              >
                ✕
              </Button>
            </div>
            <SimpleAccountManager />
          </div>
        </div>
      )}
    </div>
  );
}