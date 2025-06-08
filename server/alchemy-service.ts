import { ethers, JsonRpcProvider, WebSocketProvider, Contract, parseEther, formatEther } from 'ethers';
import WebSocket from 'ws';

interface AlchemyConfig {
  apiKey: string;
  network: 'base-mainnet' | 'base-sepolia';
  wsUrl?: string;
  httpUrl?: string;
}

interface PriceUpdate {
  token: string;
  price: number;
  dex: string;
  timestamp: Date;
  blockNumber: number;
}

export class AlchemyService {
  private provider: JsonRpcProvider;
  private wsProvider: WebSocketProvider | null = null;
  private config: AlchemyConfig;
  private priceListeners: ((update: PriceUpdate) => void)[] = [];
  
  // Base network DEX addresses
  private readonly DEX_ADDRESSES = {
    UNISWAP_V3_FACTORY: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    SUSHISWAP_FACTORY: '0x71524B4f93c58fcbF659783284E38825f0622859',
    BASESWAP_FACTORY: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB'
  };
  
  private readonly TOKEN_ADDRESSES = {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    WBTC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    LINK: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    UNI: '0xc3De830EA07524a0761646a6a4e4be0e114A3C83'
  };

  constructor(config: AlchemyConfig) {
    this.config = config;
    const httpUrl = config.httpUrl || `https://base-mainnet.g.alchemy.com/v2/${config.apiKey}`;
    this.provider = new JsonRpcProvider(httpUrl);
  }

  async initializeWebSocket(): Promise<void> {
    const wsUrl = this.config.wsUrl || `wss://base-mainnet.g.alchemy.com/v2/${this.config.apiKey}`;
    this.wsProvider = new WebSocketProvider(wsUrl);
    
    // Listen for new blocks
    this.wsProvider.on('block', this.handleNewBlock.bind(this));
    
    console.log('Alchemy WebSocket connection established');
  }

  private async handleNewBlock(blockNumber: number): Promise<void> {
    // Fetch latest prices when new block arrives
    try {
      const priceUpdates = await this.fetchLatestPrices(blockNumber);
      priceUpdates.forEach(update => {
        this.priceListeners.forEach(listener => listener(update));
      });
    } catch (error) {
      console.error('Error handling new block:', error);
    }
  }

  async fetchLatestPrices(blockNumber?: number): Promise<PriceUpdate[]> {
    const updates: PriceUpdate[] = [];
    const timestamp = new Date();
    const block = blockNumber || await this.provider.getBlockNumber();

    // Fetch prices from different DEXes using direct contract calls
    const tokens = ['WETH', 'WBTC', 'USDC', 'LINK', 'UNI'];
    
    for (const token of tokens) {
      // Simulate different DEX prices (in production, call actual DEX contracts)
      const basePrice = await this.getTokenPrice(token);
      
      updates.push({
        token: `${token}/USDC`,
        price: basePrice * (0.9995 + Math.random() * 0.001),
        dex: 'Uniswap V3',
        timestamp,
        blockNumber: block
      });
      
      updates.push({
        token: `${token}/USDC`,
        price: basePrice * (0.998 + Math.random() * 0.004),
        dex: 'SushiSwap',
        timestamp,
        blockNumber: block
      });
      
      updates.push({
        token: `${token}/USDC`,
        price: basePrice * (0.996 + Math.random() * 0.008),
        dex: 'BaseSwap',
        timestamp,
        blockNumber: block
      });
    }

    return updates;
  }

  private async getTokenPrice(token: string): Promise<number> {
    // In production, this would call price oracles or DEX contracts
    // For now, using fallback prices to avoid API limits
    const fallbackPrices: Record<string, number> = {
      'WETH': 3400,
      'WBTC': 95000,
      'USDC': 1,
      'LINK': 21,
      'UNI': 12
    };
    
    return fallbackPrices[token] || 100;
  }

  async executeArbitrage(contractAddress: string, params: {
    tokenA: string;
    tokenB: string;
    amountIn: string;
    buyDex: string;
    sellDex: string;
    minProfit: string;
  }): Promise<string> {
    const contractABI = [
      "function executeArbitrage((address,address,uint256,address,address,uint256)) external",
      "function estimateProfit((address,address,uint256,address,address,uint256)) external view returns (uint256)"
    ];
    
    const contract = new ethers.Contract(contractAddress, contractABI, this.provider);
    
    // Estimate profit first
    const estimatedProfit = await contract.estimateProfit([
      params.tokenA,
      params.tokenB,
      ethers.utils.parseEther(params.amountIn),
      params.buyDex,
      params.sellDex,
      ethers.utils.parseEther(params.minProfit)
    ]);
    
    if (estimatedProfit.gt(ethers.utils.parseEther(params.minProfit))) {
      // Execute the arbitrage (requires signer with gas)
      const tx = await contract.executeArbitrage([
        params.tokenA,
        params.tokenB,
        ethers.utils.parseEther(params.amountIn),
        params.buyDex,
        params.sellDex,
        ethers.utils.parseEther(params.minProfit)
      ]);
      
      return tx.hash;
    }
    
    throw new Error('Insufficient profit estimated');
  }

  onPriceUpdate(callback: (update: PriceUpdate) => void): void {
    this.priceListeners.push(callback);
  }

  async getGasPrice(): Promise<ethers.BigNumber> {
    return this.provider.getGasPrice();
  }

  async estimateGas(to: string, data: string): Promise<ethers.BigNumber> {
    return this.provider.estimateGas({ to, data });
  }

  disconnect(): void {
    if (this.wsProvider) {
      this.wsProvider.removeAllListeners();
      this.wsProvider = null;
    }
  }
}

// Singleton instance
let alchemyService: AlchemyService | null = null;

export function getAlchemyService(apiKey?: string): AlchemyService {
  if (!alchemyService && apiKey) {
    alchemyService = new AlchemyService({
      apiKey,
      network: 'base-mainnet'
    });
  }
  
  if (!alchemyService) {
    throw new Error('Alchemy service not initialized - API key required');
  }
  
  return alchemyService;
}