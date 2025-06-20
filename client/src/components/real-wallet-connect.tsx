import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, ExternalLink, AlertTriangle, Copy, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

declare global {
  interface Window {
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, handler: (...args: any[]) => void) => void;
      removeListener: (event: string, handler: (...args: any[]) => void) => void;
      removeAllListeners?: () => void;
      selectedAddress?: string;
      chainId?: string;
    };
  }
}

interface WalletState {
  isConnected: boolean;
  address: string | null;
  balance: string | null;
  chainId: string | null;
  isConnecting: boolean;
}

const BASE_CHAIN_ID = "0x2105"; // Base mainnet
const BASE_NETWORK = {
  chainId: BASE_CHAIN_ID,
  chainName: "Base",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: ["https://mainnet.base.org"],
  blockExplorerUrls: ["https://basescan.org"],
};

export default function RealWalletConnect() {
  const [wallet, setWallet] = useState<WalletState>({
    isConnected: false,
    address: null,
    balance: null,
    chainId: null,
    isConnecting: false,
  });
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Wait for page to fully load before checking MetaMask
    const initWallet = async () => {
      // Wait for MetaMask to inject
      if (typeof window !== 'undefined') {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      await checkConnection();
      setupEventListeners();
    };
    
    initWallet();
    
    return () => {
      if (window.ethereum?.removeAllListeners) {
        window.ethereum.removeAllListeners();
      }
    };
  }, []);

  const checkConnection = async () => {
    // Wait for MetaMask to load
    if (typeof window !== 'undefined') {
      // Check if MetaMask is still loading
      let attempts = 0;
      while (!window.ethereum && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
    }
    
    if (!window.ethereum) {
      console.log('MetaMask not detected after waiting');
      return;
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      
      if (accounts && accounts.length > 0) {
        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        const balance = await getBalance(accounts[0]);
        
        setWallet({
          isConnected: true,
          address: accounts[0],
          balance,
          chainId,
          isConnecting: false,
        });
        
        console.log('Wallet connected:', accounts[0]);
      } else {
        console.log('No accounts found');
      }
    } catch (error) {
      console.error('Failed to check connection:', error);
      setWallet(prev => ({ ...prev, isConnecting: false }));
    }
  };

  const setupEventListeners = () => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      console.log('Accounts changed:', accounts);
      if (accounts.length === 0) {
        disconnect();
      } else {
        checkConnection();
      }
    };

    const handleChainChanged = (chainId: string) => {
      console.log('Chain changed:', chainId);
      checkConnection();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
  };

  const getBalance = async (address: string): Promise<string> => {
    if (!window.ethereum) return '0.0000';
    
    try {
      const balance = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });
      
      const balanceInWei = parseInt(balance, 16);
      const balanceInEth = balanceInWei / Math.pow(10, 18);
      return balanceInEth.toFixed(4);
    } catch (error) {
      console.error('Failed to get balance:', error);
      return '0.0000';
    }
  };

  const connect = async () => {
    // Enhanced MetaMask detection
    if (!window.ethereum) {
      // Wait a bit more and try again
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!window.ethereum) {
        toast({
          title: "MetaMask Required",
          description: "Please install MetaMask extension and refresh the page",
          variant: "destructive",
        });
        return;
      }
    }

    setWallet(prev => ({ ...prev, isConnecting: true }));

    try {
      console.log('Requesting MetaMask connection...');
      
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      console.log('Accounts received:', accounts);

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found - please unlock MetaMask');
      }

      console.log('Switching to Base network...');
      await switchToBase();
      
      console.log('Getting balance...');
      const balance = await getBalance(accounts[0]);
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });

      setWallet({
        isConnected: true,
        address: accounts[0],
        balance,
        chainId,
        isConnecting: false,
      });

      console.log('Wallet connected successfully:', accounts[0]);

      toast({
        title: "Wallet Connected",
        description: `Connected to ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`,
      });
    } catch (error: any) {
      console.error('Connection failed:', error);
      setWallet(prev => ({ ...prev, isConnecting: false }));
      
      if (error.code === 4001) {
        toast({
          title: "Connection Rejected",
          description: "Please approve the connection request in MetaMask",
          variant: "destructive",
        });
      } else if (error.code === -32002) {
        toast({
          title: "Connection Pending",
          description: "Please check MetaMask for pending connection request",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: error.message || "Failed to connect wallet - please try again",
          variant: "destructive",
        });
      }
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
      description: "Your wallet has been disconnected",
    });
  };

  const switchToBase = async () => {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_CHAIN_ID }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [BASE_NETWORK],
          });
        } catch (addError) {
          throw new Error('Failed to add Base network');
        }
      } else {
        throw switchError;
      }
    }
  };

  const copyAddress = async () => {
    if (wallet.address) {
      await navigator.clipboard.writeText(wallet.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      
      toast({
        title: "Address Copied",
        description: "Wallet address copied to clipboard",
      });
    }
  };

  const isOnBase = wallet.chainId === BASE_CHAIN_ID;

  if (!wallet.isConnected) {
    return (
      <Button
        onClick={connect}
        disabled={wallet.isConnecting}
        className="flex items-center gap-2"
      >
        <Wallet className="w-4 h-4" />
        {wallet.isConnecting ? "Connecting..." : "Connect Wallet"}
      </Button>
    );
  }

  return (
    <div className="flex items-center space-x-3">
      {!isOnBase && (
        <Button
          onClick={switchToBase}
          variant="destructive"
          size="sm"
          className="flex items-center gap-1"
        >
          <AlertTriangle className="w-3 h-3" />
          Switch to Base
        </Button>
      )}
      
      <div className="flex items-center space-x-2 px-3 py-2 bg-dark-secondary rounded-lg border border-slate-600">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-profit-green rounded-full"></div>
          <span className="text-sm font-medium text-white">
            {wallet.balance} ETH
          </span>
        </div>
        
        <div className="h-4 w-px bg-slate-600"></div>
        
        <button
          onClick={copyAddress}
          className="flex items-center space-x-1 text-sm text-slate-300 hover:text-white transition-colors"
        >
          <span className="font-mono">
            {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
          </span>
          {copied ? (
            <CheckCircle className="w-3 h-3 text-profit-green" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </button>
        
        <a
          href={`https://basescan.org/address/${wallet.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-400 hover:text-white transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
      
      <Button
        onClick={disconnect}
        variant="ghost"
        size="sm"
        className="text-slate-400 hover:text-white"
      >
        Disconnect
      </Button>
    </div>
  );
}