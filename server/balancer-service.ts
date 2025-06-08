import { ethers } from 'ethers';

interface BalancerPool {
  id: string;
  address: string;
  tokens: string[];
  balances: string[];
  weights: string[];
  swapFee: string;
  totalSupply: string;
}

interface FlashloanCapability {
  token: string;
  symbol: string;
  maxAmount: string;
  poolId: string;
  poolAddress: string;
  lastUpdated: Date;
}

export class BalancerService {
  private provider: ethers.JsonRpcProvider;
  private flashloanCapabilities: Map<string, FlashloanCapability> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  
  // Balancer V2 Vault address on Base
  private readonly VAULT_ADDRESS = '0xBA12222222228d8Ba445958a75a0704d566BF2C8';
  
  // Balancer V2 Vault ABI (minimal)
  private readonly VAULT_ABI = [
    "function getPoolTokens(bytes32 poolId) external view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)",
    "function flashLoan(address recipient, address[] tokens, uint256[] amounts, bytes userData) external"
  ];

  // Pool Registry ABI
  private readonly POOL_REGISTRY_ABI = [
    "function getPools() external view returns (address[] pools)"
  ];

  // ERC20 ABI for token info
  private readonly ERC20_ABI = [
    "function symbol() external view returns (string)",
    "function decimals() external view returns (uint8)",
    "function balanceOf(address) external view returns (uint256)"
  ];

  // Base network Balancer pools (major ones)
  private readonly KNOWN_POOLS = [
    {
      id: '0x4fd63966879300cafafbb35d157dc5229278ed23000200000000000000000169',
      address: '0x4fd63966879300cafafbb35d157dc5229278ed23',
      tokens: ['WETH', 'USDC']
    },
    {
      id: '0x39965c9dab5448482cf7e002f583c812ceb53046000100000000000000000003',
      address: '0x39965c9dab5448482cf7e002f583c812ceb53046',
      tokens: ['WETH', 'cbETH']
    }
  ];

  // Token addresses on Base
  private readonly TOKEN_ADDRESSES = {
    'WETH': '0x4200000000000000000000000000000000000006',
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'USDT': '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    'DAI': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    'LINK': '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    'UNI': '0xc3De830EA07524a0761646a6a4e4be0e114a3C83',
    'cbETH': '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22'
  };

  constructor() {
    this.provider = new ethers.JsonRpcProvider(`https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
  }

  async startMonitoring(): Promise<void> {
    console.log('Starting Balancer V2 flashloan capability monitoring...');
    
    // Initial scan
    await this.discoverFlashloanCapabilities();
    
    // Set up 7-minute interval
    this.monitoringInterval = setInterval(() => {
      this.discoverFlashloanCapabilities().catch(error => {
        console.error('Error in Balancer flashloan discovery:', error);
      });
    }, 7 * 60 * 1000); // 7 minutes
  }

  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  private async discoverFlashloanCapabilities(): Promise<void> {
    console.log('Discovering Balancer V2 flashloan capabilities...');
    
    const vault = new ethers.Contract(this.VAULT_ADDRESS, this.VAULT_ABI, this.provider);
    
    for (const pool of this.KNOWN_POOLS) {
      try {
        const poolTokens = await vault.getPoolTokens(pool.id);
        const tokens = poolTokens.tokens;
        const balances = poolTokens.balances;
        
        for (let i = 0; i < tokens.length; i++) {
          const tokenAddress = tokens[i];
          const balance = balances[i];
          
          // Get token symbol
          const tokenSymbol = await this.getTokenSymbol(tokenAddress);
          if (!tokenSymbol) continue;
          
          // Calculate maximum flashloan amount (typically 100% of pool balance)
          const maxFlashloanAmount = balance.toString();
          
          const capability: FlashloanCapability = {
            token: tokenAddress,
            symbol: tokenSymbol,
            maxAmount: maxFlashloanAmount,
            poolId: pool.id,
            poolAddress: pool.address,
            lastUpdated: new Date()
          };
          
          this.flashloanCapabilities.set(tokenAddress, capability);
        }
        
        console.log(`Updated flashloan capabilities for pool ${pool.address}`);
      } catch (error) {
        console.error(`Error processing pool ${pool.address}:`, error);
      }
    }
    
    console.log(`Discovered flashloan capabilities for ${this.flashloanCapabilities.size} tokens`);
  }

  private async getTokenSymbol(tokenAddress: string): Promise<string | null> {
    try {
      // Check if it's a known token first
      for (const [symbol, address] of Object.entries(this.TOKEN_ADDRESSES)) {
        if (address.toLowerCase() === tokenAddress.toLowerCase()) {
          return symbol;
        }
      }
      
      // Query the contract
      const token = new ethers.Contract(tokenAddress, this.ERC20_ABI, this.provider);
      return await token.symbol();
    } catch (error) {
      return null;
    }
  }

  getFlashloanCapability(tokenAddress: string): FlashloanCapability | null {
    return this.flashloanCapabilities.get(tokenAddress.toLowerCase()) || null;
  }

  getAllFlashloanCapabilities(): FlashloanCapability[] {
    return Array.from(this.flashloanCapabilities.values());
  }

  getOptimalFlashloanAmount(tokenSymbol: string, requestedAmount?: string): string {
    const tokenAddress = this.TOKEN_ADDRESSES[tokenSymbol as keyof typeof this.TOKEN_ADDRESSES];
    if (!tokenAddress) return '0';
    
    const capability = this.getFlashloanCapability(tokenAddress);
    if (!capability) return '0';
    
    const maxAmount = ethers.formatEther(capability.maxAmount);
    
    if (requestedAmount) {
      const requested = parseFloat(requestedAmount);
      const maximum = parseFloat(maxAmount);
      return Math.min(requested, maximum).toString();
    }
    
    // Return optimal amount based on token type
    const symbol = tokenSymbol.toLowerCase();
    if (symbol.includes('weth') || symbol.includes('eth')) {
      return Math.min(parseFloat(maxAmount), 50).toString(); // Max 50 WETH
    } else if (symbol.includes('usdc') || symbol.includes('usdt') || symbol.includes('dai')) {
      return Math.min(parseFloat(maxAmount), 100000).toString(); // Max 100K stablecoin
    } else if (symbol.includes('link')) {
      return Math.min(parseFloat(maxAmount), 5000).toString(); // Max 5K LINK
    } else if (symbol.includes('uni')) {
      return Math.min(parseFloat(maxAmount), 2000).toString(); // Max 2K UNI
    }
    
    // Conservative default
    return Math.min(parseFloat(maxAmount), 10).toString();
  }

  async executeFlashloan(
    recipient: string,
    tokens: string[],
    amounts: string[],
    userData: string
  ): Promise<string> {
    const vault = new ethers.Contract(this.VAULT_ADDRESS, this.VAULT_ABI, this.provider);
    
    const tx = await vault.flashLoan(recipient, tokens, amounts, userData);
    return tx.hash;
  }

  getBalancerVaultAddress(): string {
    return this.VAULT_ADDRESS;
  }

  isFlashloanAvailable(tokenSymbol: string, amount: string): boolean {
    const tokenAddress = this.TOKEN_ADDRESSES[tokenSymbol as keyof typeof this.TOKEN_ADDRESSES];
    if (!tokenAddress) return false;
    
    const capability = this.getFlashloanCapability(tokenAddress);
    if (!capability) return false;
    
    const maxAmount = parseFloat(ethers.formatEther(capability.maxAmount));
    const requestedAmount = parseFloat(amount);
    
    return requestedAmount <= maxAmount;
  }
}

export const balancerService = new BalancerService();