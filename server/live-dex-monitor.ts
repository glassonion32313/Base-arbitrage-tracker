import { ethers } from 'ethers';
import { WebSocketServer } from 'ws';

interface LiveDEXPrice {
  pair: string;
  tokenA: string;
  tokenB: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  priceDiff: number;
  blockNumber: number;
  realProfitUSD: number;
  gasEstimateUSD: number;
  netProfitUSD: number;
  flashloanAmount: string;
  timestamp: Date;
}

export class LiveDEXMonitor {
  private provider: ethers.JsonRpcProvider;
  private wsProvider: ethers.WebSocketProvider;
  private wss: WebSocketServer | null = null;
  private clients: Set<any> = new Set();
  private isMonitoring = false;
  private lastBlockNumber = 0;

  // Real DEX router addresses on Base
  private readonly DEX_ROUTERS = {
    'Uniswap V3': '0x2626664c2603336E57B271c5C0b26F421741e481',
    'SushiSwap': '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
    'BaseSwap': '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
    'Aerodrome': '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43'
  };

  private readonly TOKEN_ADDRESSES = {
    'WETH': '0x4200000000000000000000000000000000000006',
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'USDT': '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    'LINK': '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    'UNI': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
  };

  private readonly TRADING_PAIRS = [
    ['WETH', 'USDC'],
    ['WETH', 'USDT'],
    ['USDC', 'USDT'],
    ['LINK', 'USDC'],
    ['UNI', 'USDC']
  ];

  // Real Uniswap V2 ABI for getting amounts out
  private readonly ROUTER_ABI = [
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
  ];

  constructor() {
    this.provider = new ethers.JsonRpcProvider(`https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
    this.wsProvider = new ethers.WebSocketProvider(`wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
  }

  setupWebSocket(httpServer: any) {
    this.wss = new WebSocketServer({ 
      server: httpServer, 
      path: '/ws/live-dex' 
    });

    this.wss.on('connection', (ws) => {
      console.log('🔗 Live DEX monitor client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('❌ Live DEX monitor client disconnected');
      });
    });
  }

  async startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('🚀 Starting live DEX price monitoring on new blocks...');
    
    // Listen for new blocks
    this.wsProvider.on('block', async (blockNumber) => {
      if (blockNumber > this.lastBlockNumber) {
        this.lastBlockNumber = blockNumber;
        console.log(`🔗 New block ${blockNumber} - Scanning DEX prices...`);
        await this.scanDEXPricesOnBlock(blockNumber);
      }
    });
  }

  stopMonitoring() {
    this.isMonitoring = false;
    this.wsProvider.removeAllListeners('block');
    console.log('⏹️ Stopped live DEX monitoring');
  }

  private async scanDEXPricesOnBlock(blockNumber: number) {
    try {
      const opportunities: LiveDEXPrice[] = [];
      
      for (const [tokenA, tokenB] of this.TRADING_PAIRS) {
        const prices = await this.getRealDEXPrices(tokenA, tokenB, blockNumber);
        
        if (prices.length >= 2) {
          const arbs = this.calculateRealArbitrage(tokenA, tokenB, prices, blockNumber);
          opportunities.push(...arbs);
        }
      }
      
      // Only broadcast profitable opportunities
      const profitable = opportunities.filter(opp => opp.netProfitUSD > 1.0);
      
      if (profitable.length > 0) {
        console.log(`💰 Found ${profitable.length} profitable opportunities on block ${blockNumber}`);
        this.broadcastOpportunities(profitable);
      }
      
    } catch (error) {
      console.error(`Error scanning block ${blockNumber}:`, error);
    }
  }

  private async getRealDEXPrices(tokenA: string, tokenB: string, blockNumber: number): Promise<Array<{dex: string, price: number}>> {
    const prices: Array<{dex: string, price: number}> = [];
    const tokenAAddress = this.TOKEN_ADDRESSES[tokenA as keyof typeof this.TOKEN_ADDRESSES];
    const tokenBAddress = this.TOKEN_ADDRESSES[tokenB as keyof typeof this.TOKEN_ADDRESSES];
    
    // Use 1 unit of tokenA as test amount
    const testAmount = ethers.parseUnits('1', 18);
    
    for (const [dexName, routerAddress] of Object.entries(this.DEX_ROUTERS)) {
      try {
        const router = new ethers.Contract(routerAddress, this.ROUTER_ABI, this.provider);
        const path = [tokenAAddress, tokenBAddress];
        
        // Get the actual price at this block
        const amounts = await router.getAmountsOut(testAmount, path, { blockTag: blockNumber });
        const price = Number(ethers.formatUnits(amounts[1], 18));
        
        if (price > 0) {
          prices.push({ dex: dexName, price });
        }
      } catch (error) {
        // DEX might not have this pair or liquidity
        continue;
      }
    }
    
    return prices;
  }

  private calculateRealArbitrage(
    tokenA: string, 
    tokenB: string, 
    prices: Array<{dex: string, price: number}>, 
    blockNumber: number
  ): LiveDEXPrice[] {
    const opportunities: LiveDEXPrice[] = [];
    
    // Find price differences between DEXes
    for (let i = 0; i < prices.length; i++) {
      for (let j = i + 1; j < prices.length; j++) {
        const buyQuote = prices[i].price < prices[j].price ? prices[i] : prices[j];
        const sellQuote = prices[i].price < prices[j].price ? prices[j] : prices[i];
        
        if (sellQuote.price > buyQuote.price) {
          const priceDiff = sellQuote.price - buyQuote.price;
          const percentDiff = (priceDiff / buyQuote.price) * 100;
          
          // Only consider opportunities with > 0.1% price difference
          if (percentDiff > 0.1) {
            const opportunity = this.calculateProfitability(
              tokenA, tokenB, buyQuote, sellQuote, priceDiff, blockNumber
            );
            
            if (opportunity.netProfitUSD > 0) {
              opportunities.push(opportunity);
            }
          }
        }
      }
    }
    
    return opportunities;
  }

  private calculateProfitability(
    tokenA: string,
    tokenB: string,
    buyQuote: {dex: string, price: number},
    sellQuote: {dex: string, price: number},
    priceDiff: number,
    blockNumber: number
  ): LiveDEXPrice {
    // Calculate optimal flashloan amount based on price difference
    // Higher price difference = larger profitable trade size
    const maxFlashloanETH = Math.min(10, priceDiff * 1000); // Cap at 10 ETH
    const flashloanAmount = Math.max(0.1, maxFlashloanETH); // Minimum 0.1 ETH
    
    // Calculate gross profit in USD
    const grossProfitETH = flashloanAmount * priceDiff;
    const ethPriceUSD = 3400; // Current ETH price - could be fetched live
    const grossProfitUSD = grossProfitETH * ethPriceUSD;
    
    // Calculate real gas costs
    const gasUnitsRequired = 350000; // Flashloan + 2 swaps
    const gasPriceGwei = 0.1; // Base network typical gas price
    const gasCostETH = (gasUnitsRequired * gasPriceGwei * 1e9) / 1e18;
    const gasCostUSD = gasCostETH * ethPriceUSD;
    
    // Balancer flashloan fee (0.05%)
    const flashloanFeeETH = flashloanAmount * 0.0005;
    const flashloanFeeUSD = flashloanFeeETH * ethPriceUSD;
    
    // Net profit calculation
    const netProfitUSD = grossProfitUSD - gasCostUSD - flashloanFeeUSD;
    
    return {
      pair: `${tokenA}/${tokenB}`,
      tokenA,
      tokenB,
      buyDex: buyQuote.dex,
      sellDex: sellQuote.dex,
      buyPrice: buyQuote.price,
      sellPrice: sellQuote.price,
      priceDiff,
      blockNumber,
      realProfitUSD: grossProfitUSD,
      gasEstimateUSD: gasCostUSD + flashloanFeeUSD,
      netProfitUSD,
      flashloanAmount: flashloanAmount.toFixed(4),
      timestamp: new Date()
    };
  }

  private broadcastOpportunities(opportunities: LiveDEXPrice[]) {
    if (this.clients.size === 0) return;
    
    const message = JSON.stringify({
      type: 'live_dex_opportunities',
      data: opportunities,
      timestamp: new Date().toISOString()
    });
    
    this.clients.forEach(client => {
      try {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(message);
        }
      } catch (error) {
        this.clients.delete(client);
      }
    });
    
    console.log(`📡 Broadcasted ${opportunities.length} live opportunities to ${this.clients.size} clients`);
  }
}

export const liveDEXMonitor = new LiveDEXMonitor();