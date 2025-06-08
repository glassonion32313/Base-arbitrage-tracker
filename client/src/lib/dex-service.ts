import { ethers } from "ethers";
import { TOKEN_ADDRESSES, DEX_CONTRACTS } from "./web3";

export interface TokenPrice {
  token0: string;
  token1: string;
  price: string;
  dex: string;
  liquidity?: string;
}

export interface ArbitrageOpportunity {
  tokenPair: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Address: string;
  token1Address: string;
  buyDex: string;
  sellDex: string;
  buyPrice: string;
  sellPrice: string;
  priceDifference: string;
  estimatedProfit: string;
  gasCost: string;
  netProfit: string;
  liquidity?: string;
}

export class DexService {
  private provider: ethers.providers.JsonRpcProvider;

  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
  }

  async fetchPrices(tokenPairs: string[]): Promise<TokenPrice[]> {
    const prices: TokenPrice[] = [];
    
    // In a real implementation, you would fetch actual prices from DEX contracts
    // For now, we'll simulate price fetching with mock data
    for (const pair of tokenPairs) {
      const [token0Symbol, token1Symbol] = pair.split('/');
      
      // Mock price data with small variations
      const basePrice = this.getMockPrice(pair);
      
      for (const dex of ['Uniswap V3', 'SushiSwap', 'BaseSwap']) {
        const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
        const price = (basePrice * (1 + variation)).toFixed(8);
        
        prices.push({
          token0: token0Symbol,
          token1: token1Symbol,
          price,
          dex,
          liquidity: (Math.random() * 1000000 + 100000).toFixed(2),
        });
      }
    }

    return prices;
  }

  private getMockPrice(pair: string): number {
    const mockPrices: Record<string, number> = {
      'WETH/USDC': 1847.23,
      'WBTC/USDT': 28543.21,
      'DAI/USDC': 1.0003,
      'AAVE/USDC': 78.45,
      'UNI/USDC': 8.92,
      'LINK/USDC': 11.34,
    };

    return mockPrices[pair] || 100;
  }

  async findArbitrageOpportunities(
    prices: TokenPrice[],
    minProfitThreshold: number = 5
  ): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    const pricesByPair = this.groupPricesByPair(prices);

    for (const [pair, pairPrices] of Object.entries(pricesByPair)) {
      const arbitrageOps = this.findArbitrageInPair(pair, pairPrices, minProfitThreshold);
      opportunities.push(...arbitrageOps);
    }

    return opportunities.sort((a, b) => 
      parseFloat(b.estimatedProfit) - parseFloat(a.estimatedProfit)
    );
  }

  private groupPricesByPair(prices: TokenPrice[]): Record<string, TokenPrice[]> {
    const grouped: Record<string, TokenPrice[]> = {};

    for (const price of prices) {
      const pair = `${price.token0}/${price.token1}`;
      if (!grouped[pair]) {
        grouped[pair] = [];
      }
      grouped[pair].push(price);
    }

    return grouped;
  }

  private findArbitrageInPair(
    pair: string,
    prices: TokenPrice[],
    minProfitThreshold: number
  ): ArbitrageOpportunity[] {
    const opportunities: ArbitrageOpportunity[] = [];

    for (let i = 0; i < prices.length; i++) {
      for (let j = i + 1; j < prices.length; j++) {
        const price1 = prices[i];
        const price2 = prices[j];

        const buyPrice = parseFloat(price1.price);
        const sellPrice = parseFloat(price2.price);

        if (sellPrice > buyPrice) {
          const priceDifference = ((sellPrice - buyPrice) / buyPrice) * 100;
          const estimatedProfit = this.calculateProfit(buyPrice, sellPrice, 1000); // Assume $1000 trade
          const gasCost = this.estimateGasCost();
          const netProfit = estimatedProfit - gasCost;

          if (netProfit >= minProfitThreshold) {
            opportunities.push({
              tokenPair: pair,
              token0Symbol: price1.token0,
              token1Symbol: price1.token1,
              token0Address: this.getTokenAddress(price1.token0),
              token1Address: this.getTokenAddress(price1.token1),
              buyDex: price1.dex,
              sellDex: price2.dex,
              buyPrice: price1.price,
              sellPrice: price2.price,
              priceDifference: priceDifference.toFixed(4),
              estimatedProfit: estimatedProfit.toFixed(2),
              gasCost: gasCost.toFixed(2),
              netProfit: netProfit.toFixed(2),
              liquidity: price1.liquidity,
            });
          }
        }
      }
    }

    return opportunities;
  }

  private calculateProfit(buyPrice: number, sellPrice: number, tradeAmount: number): number {
    const tokens = tradeAmount / buyPrice;
    const sellValue = tokens * sellPrice;
    return sellValue - tradeAmount;
  }

  private estimateGasCost(): number {
    // Estimate gas cost for arbitrage transaction
    const gasPrice = 12; // Gwei
    const gasLimit = 250000; // Estimated gas for arbitrage
    const ethPrice = 1847; // Mock ETH price
    
    return (gasPrice * gasLimit * ethPrice) / 1e9;
  }

  private getTokenAddress(symbol: string): string {
    const addresses: Record<string, string> = {
      WETH: TOKEN_ADDRESSES.WETH,
      USDC: TOKEN_ADDRESSES.USDC,
      USDT: TOKEN_ADDRESSES.USDT,
      DAI: TOKEN_ADDRESSES.DAI,
      WBTC: TOKEN_ADDRESSES.WBTC,
    };

    return addresses[symbol] || ethers.constants.AddressZero;
  }

  async getTokenInfo(address: string): Promise<{ symbol: string; decimals: number; name: string }> {
    try {
      const tokenContract = new ethers.Contract(
        address,
        [
          'function symbol() view returns (string)',
          'function decimals() view returns (uint8)',
          'function name() view returns (string)',
        ],
        this.provider
      );

      const [symbol, decimals, name] = await Promise.all([
        tokenContract.symbol(),
        tokenContract.decimals(),
        tokenContract.name(),
      ]);

      return { symbol, decimals, name };
    } catch (error) {
      console.error('Failed to fetch token info:', error);
      return { symbol: 'UNKNOWN', decimals: 18, name: 'Unknown Token' };
    }
  }
}

export const dexService = new DexService();
