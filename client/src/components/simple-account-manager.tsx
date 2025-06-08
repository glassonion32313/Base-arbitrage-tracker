import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { User, Wallet, Eye, EyeOff, Copy, Shield } from 'lucide-react';

export default function SimpleAccountManager() {
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [user, setUser] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const { toast } = useToast();

  // Load user data on component mount
  useEffect(() => {
    const loadUserData = async () => {
      const token = localStorage.getItem('auth_token');
      if (token) {
        try {
          const response = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.ok) {
            const userData = await response.json();
            setUser(userData.user);
            
            // Load balance if user has a wallet configured
            if (userData.user?.hasPrivateKey) {
              loadBalance();
            }
          }
        } catch (error) {
          console.error('Failed to fetch user data');
        }
      }
    };
    loadUserData();
  }, []);

  const loadBalance = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    
    setIsLoadingBalance(true);
    try {
      const response = await fetch('/api/auth/balance', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const balanceData = await response.json();
        setBalance(balanceData);
      }
    } catch (error) {
      console.error('Failed to fetch balance');
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const handlePrivateKeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!privateKeyInput.trim()) {
      toast({
        title: "Missing Private Key",
        description: "Please enter your private key",
        variant: "destructive",
      });
      return;
    }
    
    // Basic validation for Ethereum private key
    const cleanKey = privateKeyInput.replace('0x', '');
    if (cleanKey.length !== 64) {
      toast({
        title: "Invalid Private Key",
        description: "Private key must be 64 characters long (without 0x prefix)",
        variant: "destructive",
      });
      return;
    }
    
    setIsLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch('/api/auth/private-key', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ privateKey: cleanKey })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update private key');
      }
      
      const result = await response.json();
      
      toast({
        title: "Private Key Updated",
        description: `Wallet connected: ${result.walletAddress?.slice(0, 6)}...${result.walletAddress?.slice(-4)}`,
      });
      
      setPrivateKeyInput('');
      setUser({ ...user, walletAddress: result.walletAddress, hasPrivateKey: true });
      
      // Load balance after successful private key update
      loadBalance();
      
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update private key",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
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

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="space-y-6">
      {/* User Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Account Information
          </CardTitle>
          <CardDescription>
            Manage your account settings and wallet configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Username</Label>
              <p className="text-sm text-gray-600">{user?.username || 'Loading...'}</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Email</Label>
              <p className="text-sm text-gray-600">{user?.email || 'Loading...'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Wallet Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Configuration
            {user?.hasPrivateKey && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Connected
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Configure your private key for automated trade execution
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user?.walletAddress && (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <Label className="text-sm font-medium text-green-800">Connected Wallet</Label>
                  <p className="text-sm font-mono text-green-700">{formatAddress(user.walletAddress)}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyAddress}
                  className="border-green-300 text-green-700 hover:bg-green-100"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              
              {balance && (
                <div className="pt-3 border-t border-green-200">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <Label className="text-xs text-green-600">ETH Balance</Label>
                      <p className="font-mono text-green-800">{parseFloat(balance.eth).toFixed(4)} ETH</p>
                    </div>
                    <div>
                      <Label className="text-xs text-green-600">USD Value</Label>
                      <p className="font-mono text-green-800">${balance.usd}</p>
                    </div>
                  </div>
                  {parseFloat(balance.eth) < 0.01 && (
                    <p className="text-xs text-yellow-600 mt-2">
                      Low ETH balance. Add funds for gas fees.
                    </p>
                  )}
                </div>
              )}
              
              {isLoadingBalance && (
                <div className="pt-3 border-t border-green-200">
                  <p className="text-xs text-green-600">Loading balance...</p>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handlePrivateKeySubmit} className="space-y-4">
            <div>
              <Label htmlFor="privateKey" className="text-sm font-medium">
                Private Key
              </Label>
              <div className="relative">
                <Input
                  id="privateKey"
                  type={showPrivateKey ? "text" : "password"}
                  value={privateKeyInput}
                  onChange={(e) => setPrivateKeyInput(e.target.value)}
                  placeholder="Enter your private key (without 0x prefix)"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Your private key is encrypted and stored securely for trade execution
              </p>
            </div>

            <Button 
              type="submit" 
              disabled={isLoading}
              className="w-full"
            >
              {isLoading ? 'Updating...' : 'Update Private Key'}
            </Button>
          </form>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Shield className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-800">Security Notice</p>
                <p className="text-xs text-blue-600 mt-1">
                  Your private key is encrypted with AES encryption before storage. 
                  Only you can access your funds and execute trades.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}