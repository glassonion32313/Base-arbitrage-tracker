import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { User, Wallet, Eye, EyeOff, Copy, Shield, LogOut } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';

export default function AccountManager() {
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [user, setUser] = useState<any>(null);
  const { toast } = useToast();

  // Get current user from localStorage
  useState(async () => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      try {
        const response = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (response.ok) {
          const userData = await response.json();
          setUser(userData.user);
        }
      } catch (error) {
        console.error('Failed to fetch user data');
      }
    }
  });

  const updatePrivateKeyMutation = useMutation({
    mutationFn: async (privateKey: string) => {
      const token = localStorage.getItem('auth_token');
      if (!token) throw new Error('Not authenticated');
      
      const response = await fetch('/api/auth/private-key', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ privateKey })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update private key');
      }
      
      return await response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Private Key Updated",
        description: `Wallet connected: ${data.walletAddress?.slice(0, 6)}...${data.walletAddress?.slice(-4)}`,
      });
      setPrivateKeyInput('');
      setUser({ ...user, walletAddress: data.walletAddress, hasPrivateKey: true });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update private key",
        variant: "destructive",
      });
    }
  });

  const handlePrivateKeySubmit = (e: React.FormEvent) => {
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
    if (privateKeyInput.length !== 64 && privateKeyInput.length !== 66) {
      toast({
        title: "Invalid Private Key",
        description: "Private key must be 64 characters long (without 0x prefix)",
        variant: "destructive",
      });
      return;
    }
    
    updatePrivateKeyMutation.mutate(privateKeyInput);
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

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Username</Label>
              <div className="p-3 bg-muted rounded-md">
                <span className="font-mono">{user.username}</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Email</Label>
              <div className="p-3 bg-muted rounded-md">
                <span className="font-mono">{user.email}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={logout}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Wallet Configuration
          </CardTitle>
          <CardDescription>
            Securely store your private key for automated trading
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {user.walletAddress ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-100 rounded-full">
                    <Shield className="h-4 w-4 text-green-600" />
                  </div>
                  <div>
                    <p className="font-medium text-green-900">Wallet Connected</p>
                    <p className="text-sm text-green-700">
                      {formatAddress(user.walletAddress)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Active
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyAddress}
                    className="h-8 w-8 p-0"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Security Information</h4>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Your private key is encrypted and stored securely</li>
                  <li>• It's only decrypted when executing trades</li>
                  <li>• You can update it anytime using the form below</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-full">
                  <Wallet className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <p className="font-medium text-yellow-900">No Wallet Connected</p>
                  <p className="text-sm text-yellow-700">
                    Add your private key to enable automated trading
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handlePrivateKeySubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="private-key">
                {user.walletAddress ? 'Update Private Key' : 'Add Private Key'}
              </Label>
              <div className="relative">
                <Input
                  id="private-key"
                  type={showPrivateKey ? "text" : "password"}
                  placeholder="Enter your wallet private key"
                  className="pr-10"
                  value={privateKeyInput}
                  onChange={(e) => setPrivateKeyInput(e.target.value)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                >
                  {showPrivateKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Your private key will be encrypted and stored securely. It's only used for trade execution.
              </p>
            </div>

            <Button
              type="submit"
              disabled={updatePrivateKeyMutation.isPending || !privateKeyInput.trim()}
              className="w-full"
            >
              {updatePrivateKeyMutation.isPending 
                ? 'Updating...' 
                : user.walletAddress 
                  ? 'Update Private Key'
                  : 'Add Private Key'
              }
            </Button>
          </form>

          <div className="pt-4 border-t">
            <div className="p-3 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2 text-sm">Security Best Practices</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>• Never share your private key with anyone</li>
                <li>• Use a dedicated wallet for trading with limited funds</li>
                <li>• Regularly monitor your account activity</li>
                <li>• Enable strong password protection on your account</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}