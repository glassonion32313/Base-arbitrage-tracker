import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Wallet, ExternalLink, AlertTriangle, Copy, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
    checkConnection();
    setupEventListeners();
    
    return () => {
      if (window.ethereum) {
        window.ethereum.removeAllListeners?.();
      }
    };
  }, []);

  const checkConnection = async () => {
    if (!window.ethereum) return;

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });

      if (accounts.length > 0) {
        const balance = await getBalance(accounts[0]);
        setWallet({
          isConnected: true,
          address: accounts[0],
          balance,
          chainId,
          isConnecting: false,
        });
      }
    } catch (error) {
      console.error('Failed to check connection:', error);
    }
  };

  const setupEventListeners = () => {
    if (!window.ethereum) return;

    window.ethereum.on('accountsChanged', (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        checkConnection();
      }
    });

    window.ethereum.on('chainChanged', () => {
      checkConnection();
    });
  };

  const getBalance = async (address: string): Promise<string> => {
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
    if (!window.ethereum) {
      toast({
        title: "MetaMask Required",
        description: "Please install MetaMask to connect your wallet",
        variant: "destructive",
      });
      return;
    }

    setWallet(prev => ({ ...prev, isConnecting: true }));

    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      await switchToBase();
      
      const balance = await getBalance(accounts[0]);
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });

      setWallet({
        isConnected: true,
        address: accounts[0],
        balance,
        chainId,
        isConnecting: false,
      });

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
          description: "Please approve the connection request",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Connection Failed",
          description: error.message || "Failed to connect wallet",
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