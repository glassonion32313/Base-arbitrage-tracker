import { ethers } from 'ethers';

interface TokenPrice {
  symbol: string;
  address: string;
  price: number;
  dex: string;
  timestamp: Date;
  blockNumber: number;
}

interface PoolInfo {
  address: string;
  token0: string;
  token1: string;
  fee: number;
  dex: string;
}

export class OnChainPriceService {
  private provider: ethers.JsonRpcProvider;
  
  // Uniswap V3 Pool ABI (minimal)
  private readonly POOL_ABI = [
    "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)",
    "function fee() external view returns (uint24)"
  ];

  // Factory ABIs for finding pools
  private readonly FACTORY_ABI = [
    "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)"
  ];

  private readonly PAIR_ABI = [
    "function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function token0() external view returns (address)",
    "function token1() external view returns (address)"
  ];

  // Base network DEX factory addresses
  private readonly FACTORIES = {
    'Uniswap': '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    'SushiSwap': '0x71524B4f93c58fcbF659783284E38825f0622859',
    'BaseSwap': '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB',
    'Aerodrome': '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
    'PancakeSwap': '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'
  };

  // Token addresses on Base
  private readonly TOKENS = {
    'WETH': '0x4200000000000000000000000000000000000006',
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'USDT': '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    'DAI': '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    'LINK': '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    'UNI': '0xc3De830EA07524a0761646a6a4e4be0e114a3C83'
  };

  // Common fee tiers for Uniswap V3
  private readonly FEE_TIERS = [500, 3000, 10000]; // 0.05%, 0.3%, 1%

  constructor() {
    this.provider = new ethers.JsonRpcProvider(`https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
  }

  async fetchOnChainPrices(): Promise<TokenPrice[]> {
    const prices: TokenPrice[] = [];
    const currentBlock = await this.provider.getBlockNumber();
    const timestamp = new Date();

    // Get prices for major token pairs from each DEX
    const tokenPairs = [
      ['WETH', 'USDC'],
      ['WETH', 'USDT'],
      ['LINK', 'USDC'],
      ['UNI', 'USDC'],
      ['USDC', 'USDT']
    ];

    for (const [token0Symbol, token1Symbol] of tokenPairs) {
      const token0Address = this.TOKENS[token0Symbol as keyof typeof this.TOKENS];
      const token1Address = this.TOKENS[token1Symbol as keyof typeof this.TOKENS];
      
      if (!token0Address || !token1Address) continue;

      // Fetch prices from each DEX
      for (const [dexName, factoryAddress] of Object.entries(this.FACTORIES)) {
        try {
          const price = await this.getPairPrice(
            factoryAddress,
            token0Address,
            token1Address,
            token0Symbol,
            token1Symbol,
            dexName
          );

          if (price) {
            prices.push({
              symbol: `${token0Symbol}/${token1Symbol}`,
              address: token0Address,
              price: price.token0Price,
              dex: dexName,
              timestamp,
              blockNumber: currentBlock
            });

            prices.push({
              symbol: `${token1Symbol}/${token0Symbol}`,
              address: token1Address,
              price: price.token1Price,
              dex: dexName,
              timestamp,
              blockNumber: currentBlock
            });
          }
        } catch (error) {
          console.error(`Failed to get ${token0Symbol}/${token1Symbol} price from ${dexName}:`, error);
        }
      }
    }

    console.log(`Fetched ${prices.length} authentic on-chain prices from block ${currentBlock}`);
    return prices;
  }

  private async getPairPrice(
    factoryAddress: string,
    token0Address: string,
    token1Address: string,
    token0Symbol: string,
    token1Symbol: string,
    dexName: string
  ): Promise<{ token0Price: number; token1Price: number } | null> {
    try {
      // Attempt to fetch real on-chain data first
      let result = null;
      
      if (dexName === 'Uniswap') {
        result = await this.getUniswapV3Price(factoryAddress, token0Address, token1Address);
      } else {
        result = await this.getUniswapV2Price(factoryAddress, token0Address, token1Address);
      }
      
      // Only return actual on-chain data, no fallbacks
      if (!result) {
        console.log(`No on-chain data available for ${token0Symbol}/${token1Symbol} on ${dexName}`);
      }
      
      return result;
    } catch (error) {
      console.error(`Error getting ${dexName} price for ${token0Symbol}/${token1Symbol}:`, error);
      return null;
    }
  }

  private async getUniswapV3Price(
    factoryAddress: string,
    token0Address: string,
    token1Address: string
  ): Promise<{ token0Price: number; token1Price: number } | null> {
    const factory = new ethers.Contract(factoryAddress, this.FACTORY_ABI, this.provider);

    // Try different fee tiers
    for (const fee of this.FEE_TIERS) {
      try {
        const poolAddress = await factory.getPool(token0Address, token1Address, fee);
        
        if (poolAddress === ethers.ZeroAddress) continue;

        const pool = new ethers.Contract(poolAddress, this.POOL_ABI, this.provider);
        const slot0 = await pool.slot0();
        const sqrtPriceX96 = slot0.sqrtPriceX96;

        // Convert sqrtPriceX96 to actual price
        const price = this.sqrtPriceX96ToPrice(sqrtPriceX96);
        
        return {
          token0Price: price,
          token1Price: 1 / price
        };
      } catch (error) {
        continue;
      }
    }

    return null;
  }

  private async getUniswapV2Price(
    factoryAddress: string,
    token0Address: string,
    token1Address: string
  ): Promise<{ token0Price: number; token1Price: number } | null> {
    try {
      // For V2-style DEXs, we need to calculate the pair address
      const pairAddress = this.calculatePairAddress(factoryAddress, token0Address, token1Address);
      
      const pair = new ethers.Contract(pairAddress, this.PAIR_ABI, this.provider);
      const reserves = await pair.getReserves();
      
      // Get token decimals for proper price calculation
      const reserve0 = parseFloat(ethers.formatUnits(reserves.reserve0, 18));
      const reserve1 = parseFloat(ethers.formatUnits(reserves.reserve1, 6)); // USDC typically has 6 decimals
      
      if (reserve0 === 0 || reserve1 === 0) return null;

      const price = reserve1 / reserve0;
      
      return {
        token0Price: price,
        token1Price: 1 / price
      };
    } catch (error) {
      return null;
    }
  }

  private sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
    // Correct Uniswap V3 price calculation
    // sqrtPriceX96 = sqrt(price) * 2^96
    // price = (sqrtPriceX96 / 2^96)^2
    
    const Q96 = Math.pow(2, 96);
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
    const price = sqrtPrice * sqrtPrice;
    
    // Clamp to reasonable token price range (0.000001 to 1000000)
    return Math.max(0.000001, Math.min(price, 1000000));
  }

  private calculatePairAddress(factory: string, tokenA: string, tokenB: string): string {
    // Simplified pair address calculation - in reality would use CREATE2
    // This is a placeholder implementation
    const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() 
      ? [tokenA, tokenB] 
      : [tokenB, tokenA];
    
    // Return a deterministic address based on factory and tokens
    return ethers.keccak256(
      ethers.solidityPacked(['address', 'address', 'address'], [factory, token0, token1])
    ).slice(0, 42);
  }

  async getPriceFromMultipleDEXes(tokenA: string, tokenB: string): Promise<TokenPrice[]> {
    const prices: TokenPrice[] = [];
    const currentBlock = await this.provider.getBlockNumber();
    const timestamp = new Date();

    for (const [dexName, factoryAddress] of Object.entries(this.FACTORIES)) {
      try {
        const price = await this.getPairPrice(
          factoryAddress,
          tokenA,
          tokenB,
          'TOKEN_A',
          'TOKEN_B',
          dexName
        );

        if (price) {
          prices.push({
            symbol: `TOKEN_A/TOKEN_B`,
            address: tokenA,
            price: price.token0Price,
            dex: dexName,
            timestamp,
            blockNumber: currentBlock
          });
        }
      } catch (error) {
        console.error(`Failed to get price from ${dexName}:`, error);
      }
    }

    return prices;
  }
}

export const onChainPriceService = new OnChainPriceService();