import { ethers } from "ethers";

// Base network configuration
export const BASE_NETWORK_CONFIG = {
  chainId: '0x2105', // 8453 in hex
  chainName: 'Base',
  nativeCurrency: {
    name: 'Ethereum',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: ['https://mainnet.base.org'],
  blockExplorerUrls: ['https://basescan.org'],
};

// DEX contract addresses on Base
export const DEX_CONTRACTS = {
  UNISWAP_V3: {
    router: '0x2626664c2603336E57B271c5C0b26F421741e481',
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    quoter: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
  },
  SUSHISWAP: {
    router: '0xFB7eF66a7e61224DD6FcD0D7d9C3be5C8B049b9f',
    factory: '0x71524B4f93c58fcbF659783284E38825f0622859',
  },
  BASESWAP: {
    router: '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
    factory: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB',
  },
};

// Common token addresses on Base
export const TOKEN_ADDRESSES = {
  WETH: '0x4200000000000000000000000000000000000006',
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
  WBTC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
};

export class Web3Service {
  private provider: ethers.providers.Web3Provider | null = null;
  private signer: ethers.Signer | null = null;

  async connect(): Promise<string> {
    if (typeof window.ethereum === 'undefined') {
      throw new Error('MetaMask not installed');
    }

    // Request account access
    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });

    if (accounts.length === 0) {
      throw new Error('No accounts found');
    }

    // Switch to Base network if needed
    await this.switchToBaseNetwork();

    this.provider = new ethers.providers.Web3Provider(window.ethereum);
    this.signer = this.provider.getSigner();

    return accounts[0];
  }

  async switchToBaseNetwork(): Promise<void> {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_NETWORK_CONFIG.chainId }],
      });
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask.
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [BASE_NETWORK_CONFIG],
          });
        } catch (addError) {
          throw new Error('Failed to add Base network to MetaMask');
        }
      } else {
        throw new Error('Failed to switch to Base network');
      }
    }
  }

  async getBalance(address: string): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const balance = await this.provider.getBalance(address);
    return ethers.utils.formatEther(balance);
  }

  async getTokenBalance(tokenAddress: string, userAddress: string): Promise<string> {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }

    const tokenContract = new ethers.Contract(
      tokenAddress,
      ['function balanceOf(address) view returns (uint256)'],
      this.provider
    );

    const balance = await tokenContract.balanceOf(userAddress);
    return ethers.utils.formatUnits(balance, 18);
  }

  async executeSwap(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    amountOutMin: string,
    recipient: string,
    deadline: number
  ): Promise<string> {
    if (!this.signer) {
      throw new Error('Signer not initialized');
    }

    // This is a simplified swap function
    // In production, you would use the actual DEX router contracts
    const routerContract = new ethers.Contract(
      DEX_CONTRACTS.UNISWAP_V3.router,
      [
        'function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) external returns (uint256)',
      ],
      this.signer
    );

    const params = {
      tokenIn,
      tokenOut,
      fee: 3000, // 0.3%
      recipient,
      deadline,
      amountIn: ethers.utils.parseUnits(amountIn, 18),
      amountOutMinimum: ethers.utils.parseUnits(amountOutMin, 18),
      sqrtPriceLimitX96: 0,
    };

    const tx = await routerContract.exactInputSingle(params);
    return tx.hash;
  }

  getProvider(): ethers.providers.Web3Provider | null {
    return this.provider;
  }

  getSigner(): ethers.Signer | null {
    return this.signer;
  }
}

export const web3Service = new Web3Service();
