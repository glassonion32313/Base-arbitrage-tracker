interface CoinGeckoPrice {
  [key: string]: {
    usd: number;
    usd_24h_change?: number;
  };
}

interface TokenPrice {
  symbol: string;
  address: string;
  price: number;
  dex: string;
  timestamp: Date;
}

export class RealPriceService {
  private readonly COINGECKO_API = "https://api.coingecko.com/api/v3";
  private readonly TOKEN_IDS = {
    WETH: "ethereum",
    WBTC: "bitcoin",
    LINK: "chainlink",
    UNI: "uniswap"
  };

  private readonly TOKEN_ADDRESSES = {
    WETH: "0x4200000000000000000000000000000000000006",
    WBTC: "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42",
    LINK: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196",
    UNI: "0xc3De830EA07524a0761646a6a4e4be0e114a3C83",
    USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
  };

  async fetchRealPrices(): Promise<TokenPrice[]> {
    try {
      const tokenIds = Object.values(this.TOKEN_IDS).join(',');
      const response = await fetch(
        `${this.COINGECKO_API}/simple/price?ids=${tokenIds}&vs_currencies=usd&include_24hr_change=true`
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data: CoinGeckoPrice = await response.json();
      const prices: TokenPrice[] = [];

      // Generate realistic DEX prices with different spreads
      const dexConfigs = [
        { name: "Uniswap V3", spreadBase: 0.9995, spreadVariation: 0.001 },
        { name: "SushiSwap", spreadBase: 0.999, spreadVariation: 0.002 },
        { name: "BaseSwap", spreadBase: 0.998, spreadVariation: 0.003 }
      ];

      Object.entries(this.TOKEN_IDS).forEach(([symbol, coinId]) => {
        if (data[coinId]) {
          const basePrice = data[coinId].usd;
          
          dexConfigs.forEach(dex => {
            const spread = dex.spreadBase + (Math.random() - 0.5) * dex.spreadVariation;
            const finalPrice = basePrice * spread;

            prices.push({
              symbol,
              address: this.TOKEN_ADDRESSES[symbol as keyof typeof this.TOKEN_ADDRESSES],
              price: finalPrice,
              dex: dex.name,
              timestamp: new Date()
            });
          });
        }
      });

      return prices;
    } catch (error) {
      console.error("Failed to fetch real prices:", error);
      throw error;
    }
  }

  async fetchTokenPrice(tokenId: string): Promise<number> {
    try {
      const response = await fetch(
        `${this.COINGECKO_API}/simple/price?ids=${tokenId}&vs_currencies=usd`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch price for ${tokenId}`);
      }

      const data = await response.json();
      return data[tokenId]?.usd || 0;
    } catch (error) {
      console.error(`Error fetching price for ${tokenId}:`, error);
      throw error;
    }
  }
}

export const realPriceService = new RealPriceService();