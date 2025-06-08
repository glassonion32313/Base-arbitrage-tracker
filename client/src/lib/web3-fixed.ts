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

export const BASE_NETWORK_CONFIG = {
  chainId: "0x2105", // 8453 in decimal
  chainName: "Base",
  nativeCurrency: {
    name: "Ethereum",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: ["https://mainnet.base.org"],
  blockExplorerUrls: ["https://basescan.org"],
};

export const DEX_CONTRACTS = {
  UNISWAP_V3_ROUTER: "0x2626664c2603336E57B271c5C0b26F421741e481",
  SUSHISWAP_ROUTER: "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891", 
  BASESWAP_ROUTER: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",
};

export const TOKEN_ADDRESSES = {
  WETH: "0x4200000000000000000000000000000000000006",
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  WBTC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
  LINK: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196",
  UNI: "0xc3De830EA07524a0761646a6a4e4be0e114a3C83",
};

export class Web3Service {
  private provider: Window['ethereum'] | null = null;

  async connect(): Promise<string> {
    if (!window.ethereum) {
      throw new Error("MetaMask is not installed. Please install MetaMask to continue.");
    }

    try {
      // Request account access
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found. Please connect your MetaMask wallet.");
      }

      this.provider = window.ethereum;

      // Switch to Base network
      await this.switchToBaseNetwork();

      return accounts[0];
    } catch (error: any) {
      console.error("Failed to connect wallet:", error);
      if (error.code === 4001) {
        throw new Error("User rejected the connection request");
      }
      throw error;
    }
  }

  async switchToBaseNetwork(): Promise<void> {
    if (!window.ethereum) return;

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_NETWORK_CONFIG.chainId }],
      });
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [BASE_NETWORK_CONFIG],
          });
        } catch (addError) {
          throw new Error("Failed to add Base network to MetaMask");
        }
      } else if (switchError.code === 4001) {
        throw new Error("User rejected network switch");
      } else {
        throw switchError;
      }
    }
  }

  async getBalance(address: string): Promise<string> {
    if (!this.provider) throw new Error("Provider not initialized");
    
    try {
      const balance = await this.provider.request({
        method: "eth_getBalance",
        params: [address, "latest"],
      });
      
      const balanceInWei = parseInt(balance, 16);
      const balanceInEth = balanceInWei / Math.pow(10, 18);
      return balanceInEth.toFixed(6);
    } catch (error) {
      console.error("Failed to get balance:", error);
      return "0";
    }
  }

  async getTokenBalance(tokenAddress: string, userAddress: string): Promise<string> {
    if (!this.provider) throw new Error("Provider not initialized");

    try {
      const data = "0x70a08231" + userAddress.slice(2).padStart(64, "0");
      
      const balance = await this.provider.request({
        method: "eth_call",
        params: [
          {
            to: tokenAddress,
            data: data,
          },
          "latest",
        ],
      });

      const balanceInWei = parseInt(balance, 16);
      const balanceFormatted = balanceInWei / Math.pow(10, 18);
      return balanceFormatted.toFixed(6);
    } catch (error) {
      console.error("Failed to get token balance:", error);
      return "0";
    }
  }

  async executeSwap(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    amountOutMin: string,
    dexRouter: string
  ): Promise<string> {
    if (!this.provider) throw new Error("Provider not initialized");

    try {
      const accounts = await this.provider.request({ method: "eth_accounts" });
      if (!accounts || accounts.length === 0) {
        throw new Error("No connected accounts");
      }

      const txParams = {
        from: accounts[0],
        to: dexRouter,
        value: "0x0",
        data: "0x",
        gas: "0x5208",
      };

      const txHash = await this.provider.request({
        method: "eth_sendTransaction",
        params: [txParams],
      });

      return txHash;
    } catch (error) {
      console.error("Failed to execute swap:", error);
      throw error;
    }
  }

  async getCurrentAccount(): Promise<string | null> {
    if (!this.provider) return null;

    try {
      const accounts = await this.provider.request({ method: "eth_accounts" });
      return accounts && accounts.length > 0 ? accounts[0] : null;
    } catch (error) {
      console.error("Failed to get current account:", error);
      return null;
    }
  }

  async getChainId(): Promise<string | null> {
    if (!this.provider) return null;

    try {
      const chainId = await this.provider.request({ method: "eth_chainId" });
      return chainId;
    } catch (error) {
      console.error("Failed to get chain ID:", error);
      return null;
    }
  }

  getProvider(): any {
    return this.provider;
  }
}

export const web3Service = new Web3Service();