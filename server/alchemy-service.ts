import { ethers, JsonRpcProvider, WebSocketProvider } from 'ethers';

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

  private readonly DEX_ADDRESSES = {
    uniswapV3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    sushiswapFactory: '0x71524B4f93c58fcbF659783284E38825f0622859',
    baseswapFactory: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB'
  };

  private readonly TOKEN_ADDRESSES = {
    WETH: '0x4200000000000000000000000000000000000006',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    WBTC: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    LINK: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196'
  };

  constructor(config: AlchemyConfig) {
    this.config = config;
    const baseUrl = config.httpUrl || `https://${config.network}.g.alchemy.com/v2/${config.apiKey}`;
    this.provider = new JsonRpcProvider(baseUrl);
  }

  async initializeWebSocket(): Promise<void> {
    if (!this.config.wsUrl) {
      this.config.wsUrl = `wss://${this.config.network}.g.alchemy.com/v2/${this.config.apiKey}`;
    }
    
    this.wsProvider = new WebSocketProvider(this.config.wsUrl);
    
    this.wsProvider.on('block', (blockNumber: number) => {
      this.handleNewBlock(blockNumber);
    });
  }

  private async handleNewBlock(blockNumber: number): Promise<void> {
    try {
      // Only log block updates, no synthetic price generation
      console.log(`New block detected: ${blockNumber}`);
    } catch (error) {
      console.error('Error handling new block:', error);
    }
  }

  async fetchLatestPrices(blockNumber?: number): Promise<PriceUpdate[]> {
    // Disabled synthetic price generation - only return authentic blockchain data
    console.log('Alchemy synthetic price generation disabled - using only authentic blockchain data');
    return [];
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
      params.amountIn,
      params.buyDex,
      params.sellDex,
      params.minProfit
    ]);
    
    if (estimatedProfit > BigInt(params.minProfit)) {
      const transaction = await contract.executeArbitrage([
        params.tokenA,
        params.tokenB,
        params.amountIn,
        params.buyDex,
        params.sellDex,
        params.minProfit
      ]);
      
      return transaction.hash;
    }
    
    throw new Error('Insufficient profit for arbitrage execution');
  }

  onPriceUpdate(callback: (update: PriceUpdate) => void): void {
    this.priceListeners.push(callback);
  }

  async getGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    return feeData.gasPrice || BigInt(0);
  }

  async estimateGas(to: string, data: string): Promise<bigint> {
    return await this.provider.estimateGas({ to, data });
  }

  disconnect(): void {
    if (this.wsProvider) {
      this.wsProvider.destroy();
    }
  }
}

export function getAlchemyService(apiKey?: string): AlchemyService {
  const alchemyApiKey = apiKey || process.env.ALCHEMY_API_KEY;
  if (!alchemyApiKey) {
    throw new Error('Alchemy API key is required');
  }
  
  return new AlchemyService({
    apiKey: alchemyApiKey,
    network: 'base-mainnet'
  });
}