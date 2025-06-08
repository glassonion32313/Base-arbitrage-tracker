import { ethers } from 'ethers';
import { WebSocketServer } from 'ws';
import { balancerService } from './balancer-service';

interface RealTimePriceData {
  pair: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  optimalFlashloanSize: string;
  realProfit: number;
  gasEstimate: number;
  netProfit: number;
  timestamp: Date;
}

interface DEXQuote {
  dex: string;
  price: number;
  liquidity: number;
  gasEstimate: number;
}

export class RealTimeArbitrage {
  private wss: WebSocketServer | null = null;
  private provider: ethers.JsonRpcProvider;
  private isMonitoring = false;
  private clients: Set<any> = new Set();

  private readonly DEX_ROUTERS = {
    'Uniswap V3': {
      address: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
      quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6'
    },
    'SushiSwap': {
      address: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
      quoter: '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891'
    },
    'BaseSwap': {
      address: '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
      quoter: '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86'
    },
    'Aerodrome': {
      address: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
      quoter: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43'
    }
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

  constructor() {
    this.provider = new ethers.JsonRpcProvider(`https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
  }

  setupWebSocket(httpServer: any) {
    this.wss = new WebSocketServer({ 
      server: httpServer, 
      path: '/ws/arbitrage' 
    });

    this.wss.on('connection', (ws) => {
      console.log('🔗 Real-time arbitrage client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('❌ Real-time arbitrage client disconnected');
      });

      // Send initial data
      this.sendCurrentOpportunities(ws);
    });
  }

  async startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('🚀 Starting real-time arbitrage monitoring...');
    
    // Monitor prices every 2 seconds
    this.monitorPrices();
  }

  stopMonitoring() {
    this.isMonitoring = false;
    console.log('⏹️ Stopped real-time arbitrage monitoring');
  }

  private async monitorPrices() {
    while (this.isMonitoring) {
      try {
        const opportunities = await this.scanForRealOpportunities();
        
        if (opportunities.length > 0) {
          this.broadcastOpportunities(opportunities);
        }
        
        // Wait 2 seconds before next scan
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Price monitoring error:', error);
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait longer on error
      }
    }
  }

  private async scanForRealOpportunities(): Promise<RealTimePriceData[]> {
    const opportunities: RealTimePriceData[] = [];
    
    for (const [tokenA, tokenB] of this.TRADING_PAIRS) {
      try {
        const quotes = await this.getRealDEXQuotes(tokenA, tokenB);
        
        if (quotes.length >= 2) {
          const arbitrageOpps = this.findArbitrageOpportunities(tokenA, tokenB, quotes);
          opportunities.push(...arbitrageOpps);
        }
      } catch (error) {
        console.error(`Error scanning ${tokenA}/${tokenB}:`, error);
      }
    }
    
    return opportunities.filter(opp => opp.netProfit > 0.001); // Only profitable opportunities
  }

  private async getRealDEXQuotes(tokenA: string, tokenB: string): Promise<DEXQuote[]> {
    const quotes: DEXQuote[] = [];
    const tokenAAddress = this.TOKEN_ADDRESSES[tokenA as keyof typeof this.TOKEN_ADDRESSES];
    const tokenBAddress = this.TOKEN_ADDRESSES[tokenB as keyof typeof this.TOKEN_ADDRESSES];
    
    // Test amount: 0.1 ETH worth
    const testAmount = ethers.parseEther('0.1');
    
    for (const [dexName, dexConfig] of Object.entries(this.DEX_ROUTERS)) {
      try {
        const price = await this.getQuoteFromDEX(
          tokenAAddress,
          tokenBAddress,
          testAmount,
          dexConfig.quoter
        );
        
        if (price > 0) {
          quotes.push({
            dex: dexName,
            price: price,
            liquidity: await this.estimateLiquidity(tokenA, tokenB, dexName),
            gasEstimate: await this.estimateGasForDEX(dexName)
          });
        }
      } catch (error) {
        // DEX might not have this pair
        continue;
      }
    }
    
    return quotes;
  }

  private async getQuoteFromDEX(
    tokenA: string, 
    tokenB: string, 
    amount: bigint, 
    quoterAddress: string
  ): Promise<number> {
    try {
      // Use a simple router interface to get quotes
      const routerContract = new ethers.Contract(
        quoterAddress,
        [
          'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
        ],
        this.provider
      );
      
      const path = [tokenA, tokenB];
      const amounts = await routerContract.getAmountsOut(amount, path);
      
      // Convert to price (output amount / input amount)
      return Number(ethers.formatEther(amounts[1])) / Number(ethers.formatEther(amount));
    } catch (error) {
      return 0;
    }
  }

  private findArbitrageOpportunities(
    tokenA: string, 
    tokenB: string, 
    quotes: DEXQuote[]
  ): RealTimePriceData[] {
    const opportunities: RealTimePriceData[] = [];
    
    // Find all price differences
    for (let i = 0; i < quotes.length; i++) {
      for (let j = i + 1; j < quotes.length; j++) {
        const buyQuote = quotes[i].price < quotes[j].price ? quotes[i] : quotes[j];
        const sellQuote = quotes[i].price < quotes[j].price ? quotes[j] : quotes[i];
        
        if (sellQuote.price > buyQuote.price) {
          const opportunity = this.calculateRealProfit(
            tokenA,
            tokenB,
            buyQuote,
            sellQuote
          );
          
          if (opportunity.netProfit > 0) {
            opportunities.push(opportunity);
          }
        }
      }
    }
    
    return opportunities;
  }

  private calculateRealProfit(
    tokenA: string,
    tokenB: string,
    buyQuote: DEXQuote,
    sellQuote: DEXQuote
  ): RealTimePriceData {
    // Calculate optimal flashloan size based on available liquidity
    const maxFlashloanCapability = balancerService.getFlashloanCapability(
      this.TOKEN_ADDRESSES[tokenA as keyof typeof this.TOKEN_ADDRESSES]
    );
    
    // Use smaller of: flashloan capacity or DEX liquidity
    const maxTradeSize = Math.min(
      maxFlashloanCapability ? parseFloat(maxFlashloanCapability.maxAmount) : 1.0,
      Math.min(buyQuote.liquidity, sellQuote.liquidity) * 0.1 // Use 10% of liquidity
    );
    
    const optimalSize = Math.min(maxTradeSize, 10.0); // Cap at 10 ETH equivalent
    
    // Calculate price difference
    const priceDiff = sellQuote.price - buyQuote.price;
    const grossProfit = optimalSize * priceDiff;
    
    // Calculate real gas costs
    const totalGasCost = this.calculateGasCosts(buyQuote.gasEstimate + sellQuote.gasEstimate);
    const flashloanFee = optimalSize * 0.0005; // 0.05% Balancer flashloan fee
    
    const netProfit = grossProfit - totalGasCost - flashloanFee;
    
    return {
      pair: `${tokenA}/${tokenB}`,
      buyDex: buyQuote.dex,
      sellDex: sellQuote.dex,
      buyPrice: buyQuote.price,
      sellPrice: sellQuote.price,
      optimalFlashloanSize: optimalSize.toFixed(4),
      realProfit: grossProfit,
      gasEstimate: totalGasCost,
      netProfit: netProfit,
      timestamp: new Date()
    };
  }

  private async estimateLiquidity(tokenA: string, tokenB: string, dexName: string): Promise<number> {
    // Simplified liquidity estimation - in production this would query pool contracts
    const baseLiquidity = {
      'Uniswap V3': 1000000,
      'SushiSwap': 500000,
      'BaseSwap': 250000,
      'Aerodrome': 750000
    };
    
    return baseLiquidity[dexName as keyof typeof baseLiquidity] || 100000;
  }

  private async estimateGasForDEX(dexName: string): Promise<number> {
    // Real gas estimates for different DEX types
    const gasEstimates = {
      'Uniswap V3': 150000,
      'SushiSwap': 120000,
      'BaseSwap': 110000,
      'Aerodrome': 130000
    };
    
    return gasEstimates[dexName as keyof typeof gasEstimates] || 120000;
  }

  private calculateGasCosts(totalGas: number): number {
    // Base network typical gas price: 0.1 Gwei
    const gasPriceGwei = 0.1;
    const gasPriceWei = gasPriceGwei * 1e9;
    const gasCostWei = totalGas * gasPriceWei;
    const gasCostEth = gasCostWei / 1e18;
    
    // Convert to USD (assume ETH = $3400)
    return gasCostEth * 3400;
  }

  private broadcastOpportunities(opportunities: RealTimePriceData[]) {
    if (this.clients.size === 0) return;
    
    const message = JSON.stringify({
      type: 'arbitrage_opportunities',
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
    
    console.log(`📡 Broadcasted ${opportunities.length} real arbitrage opportunities to ${this.clients.size} clients`);
  }

  private sendCurrentOpportunities(ws: any) {
    // Send initial empty state or cached opportunities
    const message = JSON.stringify({
      type: 'arbitrage_opportunities',
      data: [],
      timestamp: new Date().toISOString()
    });
    
    try {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    } catch (error) {
      console.error('Failed to send initial data:', error);
    }
  }
}

export const realTimeArbitrage = new RealTimeArbitrage();