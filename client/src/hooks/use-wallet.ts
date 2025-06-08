import { useState, useEffect, useCallback } from "react";
import { web3Service } from "@/lib/web3-fixed";
import { useToast } from "@/hooks/use-toast";

export interface WalletState {
  isConnected: boolean;
  address: string | null;
  balance: string | null;
  chainId: string | null;
  isConnecting: boolean;
}

export function useWallet() {
  const [walletState, setWalletState] = useState<WalletState>({
    isConnected: false,
    address: null,
    balance: null,
    chainId: null,
    isConnecting: false,
  });

  const { toast } = useToast();

  const updateWalletState = useCallback(async () => {
    if (typeof window.ethereum === 'undefined') return;

    try {
      const account = await web3Service.getCurrentAccount();
      const chainId = await web3Service.getChainId();

      if (account) {
        const balance = await web3Service.getBalance(account);
        setWalletState({
          isConnected: true,
          address: account,
          balance,
          chainId,
          isConnecting: false,
        });
      } else {
        setWalletState({
          isConnected: false,
          address: null,
          balance: null,
          chainId,
          isConnecting: false,
        });
      }
    } catch (error) {
      console.error('Failed to update wallet state:', error);
      setWalletState(prev => ({ ...prev, isConnecting: false }));
    }
  }, []);

  const connectWallet = useCallback(async () => {
    setWalletState(prev => ({ ...prev, isConnecting: true }));

    try {
      const address = await web3Service.connect();
      await updateWalletState();
      
      toast({
        title: "Wallet connected",
        description: `Connected to ${address.slice(0, 6)}...${address.slice(-4)}`,
      });
    } catch (error: any) {
      console.error('Failed to connect wallet:', error);
      setWalletState(prev => ({ ...prev, isConnecting: false }));
      
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect wallet",
        variant: "destructive",
      });
    }
  }, [updateWalletState, toast]);

  const disconnectWallet = useCallback(() => {
    setWalletState({
      isConnected: false,
      address: null,
      balance: null,
      chainId: null,
      isConnecting: false,
    });

    toast({
      title: "Wallet disconnected",
      description: "Your wallet has been disconnected",
    });
  }, [toast]);

  const switchToBaseNetwork = useCallback(async () => {
    try {
      await web3Service.switchToBaseNetwork();
      await updateWalletState();
      
      toast({
        title: "Network switched",
        description: "Successfully switched to Base network",
      });
    } catch (error: any) {
      toast({
        title: "Network switch failed",
        description: error.message || "Failed to switch to Base network",
        variant: "destructive",
      });
    }
  }, [updateWalletState, toast]);

  // Set up event listeners
  useEffect(() => {
    if (typeof window.ethereum === 'undefined') return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnectWallet();
      } else {
        updateWalletState();
      }
    };

    const handleChainChanged = () => {
      updateWalletState();
    };

    const handleConnect = () => {
      updateWalletState();
    };

    const handleDisconnect = () => {
      disconnectWallet();
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);
    window.ethereum.on('connect', handleConnect);
    window.ethereum.on('disconnect', handleDisconnect);

    // Initial state update
    updateWalletState();

    return () => {
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
        window.ethereum.removeListener('connect', handleConnect);
        window.ethereum.removeListener('disconnect', handleDisconnect);
      }
    };
  }, [updateWalletState, disconnectWallet]);

  return {
    ...walletState,
    connectWallet,
    disconnectWallet,
    switchToBaseNetwork,
  };
}
