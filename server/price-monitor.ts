import { storage } from "./storage";
import { type InsertArbitrageOpportunity } from "@shared/schema";

interface TokenPrice {
  symbol: string;
  address: string;
  price: number;
  dex: string;
  timestamp: Date;
}

interface PriceSource {
  name: string;
  enabled: boolean;
  fetchPrices: () => Promise<TokenPrice[]>;
}

export class PriceMonitor {
  private sources: PriceSource[] = [];
  private monitoring = false;
  private interval: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL = 30000; // 30 seconds
  private readonly MIN_PROFIT_THRESHOLD = 5; // Minimum $5 profit

  constructor() {
    this.initializePriceSources();
  }

  private initializePriceSources() {
    this.sources = [
      {
        name: "Uniswap V3",
        enabled: true,
        fetchPrices: this.fetchUniswapPrices.bind(this)
      },
      {
        name: "SushiSwap", 
        enabled: true,
        fetchPrices: this.fetchSushiSwapPrices.bind(this)
      },
      {
        name: "BaseSwap",
        enabled: true,
        fetchPrices: this.fetchBaseSwapPrices.bind(this)
      }
    ];
  }

  async startMonitoring() {
    if (this.monitoring) return;
    
    console.log("Starting price monitoring...");
    this.monitoring = true;
    
    // Initial scan
    await this.scanForOpportunities();
    
    // Set up recurring scans
    this.interval = setInterval(() => {
      this.scanForOpportunities().catch(console.error);
    }, this.UPDATE_INTERVAL);
  }

  stopMonitoring() {
    if (!this.monitoring) return;
    
    console.log("Stopping price monitoring...");
    this.monitoring = false;
    
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async scanForOpportunities() {
    try {
      console.log("Scanning for arbitrage opportunities...");
      
      // Clear stale opportunities first (older than 2 minutes)
      await storage.clearStaleOpportunities(2);
      
      // Fetch prices from all sources
      const allPrices: TokenPrice[] = [];
      
      for (const source of this.sources.filter(s => s.enabled)) {
        try {
          const prices = await source.fetchPrices();
          allPrices.push(...prices);
        } catch (error) {
          console.error(`Failed to fetch prices from ${source.name}:`, error);
        }
      }

      // Group prices by token pair
      const pricesByPair = this.groupPricesByPair(allPrices);
      
      // Find arbitrage opportunities
      const opportunities: InsertArbitrageOpportunity[] = [];
      
      for (const [pair, prices] of Object.entries(pricesByPair)) {
        if (prices.length < 2) continue;
        
        const arbitrageOps = await this.findArbitrageInPair(pair, prices);
        opportunities.push(...arbitrageOps);
      }

      // Clear old opportunities and add new ones
      await storage.clearStaleOpportunities(5); // Clear opportunities older than 5 minutes
      
      // Save new opportunities
      for (const opportunity of opportunities) {
        try {
          await storage.createArbitrageOpportunity(opportunity);
        } catch (error) {
          console.error("Failed to save opportunity:", error);
        }
      }

      console.log(`Found ${opportunities.length} arbitrage opportunities`);
      
    } catch (error) {
      console.error("Error in price monitoring:", error);
    }
  }

  private groupPricesByPair(prices: TokenPrice[]): Record<string, TokenPrice[]> {
    const grouped: Record<string, TokenPrice[]> = {};
    
    for (const price of prices) {
      if (!grouped[price.symbol]) {
        grouped[price.symbol] = [];
      }
      grouped[price.symbol].push(price);
    }
    
    return grouped;
  }

  private async findArbitrageInPair(pair: string, prices: TokenPrice[]): Promise<InsertArbitrageOpportunity[]> {
    const opportunities: InsertArbitrageOpportunity[] = [];
    
    // Sort prices to find best buy/sell opportunities
    const sortedPrices = prices.sort((a, b) => a.price - b.price);
    const lowestPrice = sortedPrices[0];
    const highestPrice = sortedPrices[sortedPrices.length - 1];
    
    if (lowestPrice.dex === highestPrice.dex) return opportunities;
    
    // Calculate profit potential
    const priceDiff = highestPrice.price - lowestPrice.price;
    const priceDiffPercent = (priceDiff / lowestPrice.price) * 100;
    
    // Estimate gas cost (Base network average)
    const gasCost = this.estimateGasCost();
    const tradeAmount = 1000; // $1000 trade size for calculation
    const estimatedProfit = (priceDiff / lowestPrice.price) * tradeAmount;
    const netProfit = estimatedProfit - gasCost;
    
    // Only create opportunity if profitable
    if (netProfit > this.MIN_PROFIT_THRESHOLD) {
      const [token0, token1] = this.parseTokenPair(pair);
      
      opportunities.push({
        tokenPair: pair,
        token0Symbol: token0,
        token1Symbol: token1,
        token0Address: this.getTokenAddress(token0),
        token1Address: this.getTokenAddress(token1),
        buyDex: lowestPrice.dex,
        sellDex: highestPrice.dex,
        buyPrice: lowestPrice.price.toFixed(6),
        sellPrice: highestPrice.price.toFixed(6),
        priceDifference: priceDiffPercent.toFixed(3),
        estimatedProfit: estimatedProfit.toFixed(2),
        gasCost: gasCost.toFixed(2),
        netProfit: netProfit.toFixed(2),
        isActive: true,
        liquidity: this.estimateLiquidity(pair).toString()
      });
    }
    
    return opportunities;
  }

  private parseTokenPair(pair: string): [string, string] {
    // Handle common pair formats
    if (pair.includes('/')) {
      const parts = pair.split('/');
      return [parts[0], parts[1]];
    }
    
    // Default parsing for single token symbols
    const commonPairs: Record<string, [string, string]> = {
      'WETH': ['WETH', 'USDC'],
      'WBTC': ['WBTC', 'USDT'],
      'LINK': ['LINK', 'USDT'],
      'UNI': ['UNI', 'USDC'],
      'AAVE': ['AAVE', 'USDT']
    };
    
    return commonPairs[pair] || [pair, 'USDC'];
  }

  private getTokenAddress(symbol: string): string {
    const addresses: Record<string, string> = {
      'WETH': '0x4200000000000000000000000000000000000006',
      'WBTC': '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
      'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      'USDT': '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      'LINK': '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
      'DAI': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
      'UNI': '0xc3De830EA07524a0761646a6a4e4be0e114a3C83',
      'AAVE': '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'
    };
    
    return addresses[symbol] || '0x0000000000000000000000000000000000000000';
  }

  private estimateGasCost(): number {
    // Base network typical gas costs for DEX operations
    return Math.random() * 10 + 3; // $3-13 range
  }

  private estimateLiquidity(pair: string): number {
    // Simulate liquidity based on pair popularity
    const liquidityMap: Record<string, number> = {
      'WETH/USDC': 5000000,
      'WBTC/USDT': 3000000,
      'LINK/USDT': 1500000,
      'UNI/USDC': 2000000,
      'AAVE/USDT': 800000
    };
    
    return liquidityMap[pair] || 500000;
  }

  // Simulated price fetchers (in production, these would call real APIs)
  private async fetchUniswapPrices(): Promise<TokenPrice[]> {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,chainlink,uniswap&vs_currencies=usd');
      if (!response.ok) throw new Error(`CoinGecko API error: ${response.status}`);
      
      const data = await response.json();
      const prices: TokenPrice[] = [];
      
      const tokens = [
        { symbol: 'WETH', coinId: 'ethereum' },
        { symbol: 'WBTC', coinId: 'bitcoin' },
        { symbol: 'LINK', coinId: 'chainlink' },
        { symbol: 'UNI', coinId: 'uniswap' }
      ];
      
      tokens.forEach(token => {
        if (data[token.coinId]) {
          prices.push({
            symbol: `${token.symbol}/USDC`,
            address: this.getTokenAddress(token.symbol),
            price: data[token.coinId].usd * (0.9995 + Math.random() * 0.001),
            dex: "Uniswap V3",
            timestamp: new Date()
          });
        }
      });
      
      return prices;
    } catch (error) {
      console.error('Failed to fetch Uniswap prices:', error);
      return [];
    }
  }

  private async fetchSushiSwapPrices(): Promise<TokenPrice[]> {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,chainlink,uniswap&vs_currencies=usd');
      if (!response.ok) throw new Error(`CoinGecko API error: ${response.status}`);
      
      const data = await response.json();
      const prices: TokenPrice[] = [];
      
      const tokens = [
        { symbol: 'WETH', coinId: 'ethereum' },
        { symbol: 'WBTC', coinId: 'bitcoin' },
        { symbol: 'LINK', coinId: 'chainlink' },
        { symbol: 'UNI', coinId: 'uniswap' }
      ];
      
      tokens.forEach(token => {
        if (data[token.coinId]) {
          prices.push({
            symbol: `${token.symbol}/USDC`,
            address: this.getTokenAddress(token.symbol),
            price: data[token.coinId].usd * (0.998 + Math.random() * 0.004),
            dex: "SushiSwap",
            timestamp: new Date()
          });
        }
      });
      
      return prices;
    } catch (error) {
      console.error('Failed to fetch SushiSwap prices:', error);
      return [];
    }
  }

  private async fetchBaseSwapPrices(): Promise<TokenPrice[]> {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,chainlink,uniswap&vs_currencies=usd');
      if (!response.ok) throw new Error(`CoinGecko API error: ${response.status}`);
      
      const data = await response.json();
      const prices: TokenPrice[] = [];
      
      const tokens = [
        { symbol: 'WETH', coinId: 'ethereum' },
        { symbol: 'WBTC', coinId: 'bitcoin' },
        { symbol: 'LINK', coinId: 'chainlink' },
        { symbol: 'UNI', coinId: 'uniswap' }
      ];
      
      tokens.forEach(token => {
        if (data[token.coinId]) {
          prices.push({
            symbol: `${token.symbol}/USDC`,
            address: this.getTokenAddress(token.symbol),
            price: data[token.coinId].usd * (0.996 + Math.random() * 0.008),
            dex: "BaseSwap",
            timestamp: new Date()
          });
        }
      });
      
      return prices;
    } catch (error) {
      console.error('Failed to fetch BaseSwap prices:', error);
      return [];
    }
  }

  isMonitoring(): boolean {
    return this.monitoring;
  }

  getStatus() {
    return {
      monitoring: this.monitoring,
      updateInterval: this.UPDATE_INTERVAL,
      activeSources: this.sources.filter(s => s.enabled).length,
      totalSources: this.sources.length
    };
  }
}

export const priceMonitor = new PriceMonitor();