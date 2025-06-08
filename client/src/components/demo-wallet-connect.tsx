import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Wallet, Copy, ExternalLink, Zap } from 'lucide-react';

interface DemoWalletState {
  isConnected: boolean;
  address: string | null;
  balance: string | null;
  chainId: string | null;
  isConnecting: boolean;
}

export default function DemoWalletConnect() {
  const { toast } = useToast();
  const [wallet, setWallet] = useState<DemoWalletState>({
    isConnected: false,
    address: null,
    balance: null,
    chainId: null,
    isConnecting: false,
  });

  // Demo wallet addresses for simulation
  const demoAddresses = [
    '0x742d35Cc6634C0532925a3b8D3aC3e1C5d7fe6d',
    '0x8ba1f109551bD432803012645Hac136c82C',
    '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5',
    '0x40305C36Bf9d5242D73b78346a5b9A3732D7A5B7'
  ];

  const connectDemo = async () => {
    setWallet(prev => ({ ...prev, isConnecting: true }));

    try {
      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      const randomAddress = demoAddresses[Math.floor(Math.random() * demoAddresses.length)];
      const randomBalance = (Math.random() * 5 + 0.1).toFixed(4); // 0.1 to 5 ETH

      setWallet({
        isConnected: true,
        address: randomAddress,
        balance: randomBalance,
        chainId: '0x2105', // Base network
        isConnecting: false,
      });

      toast({
        title: "Demo Wallet Connected",
        description: `Connected to ${randomAddress.slice(0, 6)}...${randomAddress.slice(-4)}`,
      });
    } catch (error) {
      console.error('Demo connection failed:', error);
      setWallet(prev => ({ ...prev, isConnecting: false }));
      
      toast({
        title: "Connection Failed",
        description: "Failed to connect demo wallet",
        variant: "destructive",
      });
    }
  };

  const disconnect = () => {
    setWallet({
      isConnected: false,
      address: null,
      balance: null,
      chainId: null,
      isConnecting: false,
    });

    toast({
      title: "Wallet Disconnected",
      description: "Demo wallet has been disconnected",
    });
  };

  const copyAddress = () => {
    if (wallet.address) {
      navigator.clipboard.writeText(wallet.address);
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard",
      });
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (wallet.isConnected && wallet.address) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Wallet className="h-5 w-5" />
              Demo Wallet
            </div>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2" />
              Connected
            </Badge>
          </div>
          <CardDescription>
            Simulated wallet for testing arbitrage platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Address</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{formatAddress(wallet.address)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyAddress}
                  className="h-6 w-6 p-0"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Balance</span>
              <span className="font-semibold">{wallet.balance} ETH</span>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Network</span>
              <Badge variant="secondary">Base</Badge>
            </div>
          </div>

          <div className="pt-2 border-t">
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open('https://basescan.org/', '_blank')}
                className="flex items-center gap-2"
              >
                <ExternalLink className="h-3 w-3" />
                Explorer
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={disconnect}
                className="text-red-600 hover:text-red-700"
              >
                Disconnect
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          Demo Wallet
        </CardTitle>
        <CardDescription>
          Connect a simulated wallet to test the arbitrage platform
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-blue-900">Demo Mode</h4>
                <p className="text-sm text-blue-700 mt-1">
                  This is a simulated wallet for testing. No real transactions will be made.
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={connectDemo}
            disabled={wallet.isConnecting}
            className="w-full"
          >
            {wallet.isConnecting ? 'Connecting...' : 'Connect Demo Wallet'}
          </Button>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              For real trading, install MetaMask and refresh the page
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}