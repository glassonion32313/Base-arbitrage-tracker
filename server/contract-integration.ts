import { ethers } from 'ethers';
import * as fs from 'fs';

interface ArbitrageParams {
  tokenA: string;
  tokenB: string;
  amountIn: string;
  buyDex: string;
  sellDex: string;
  minProfit: string;
}

export class ContractIntegration {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private contractAddress: string;
  
  private readonly DEX_ROUTERS = {
    'Uniswap V3': '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    'SushiSwap': '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
    'BaseSwap': '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86'
  };

  private readonly TOKEN_ADDRESSES = {
    'WETH': '0x4200000000000000000000000000000000000006',
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'WBTC': '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    'LINK': '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    'UNI': '0xc3De830EA07524a0761646a6a4e4be0e114A3C83'
  };

  constructor() {
    const deploymentInfo = JSON.parse(fs.readFileSync('deployment.json', 'utf8'));
    const contractABI = JSON.parse(fs.readFileSync('arbitragebot_abi.json', 'utf8'));
    this.contractAddress = deploymentInfo.address;
    
    const rpcUrl = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(this.contractAddress, contractABI, this.provider);
    
    console.log(`Contract integrated: ${this.contractAddress}`);
  }

  getContractAddress(): string {
    return this.contractAddress;
  }

  async estimateProfit(params: ArbitrageParams): Promise<string> {
    try {
      const tokenA = this.getTokenAddress(params.tokenA);
      const tokenB = this.getTokenAddress(params.tokenB);
      const buyDex = this.getDexRouter(params.buyDex);
      const sellDex = this.getDexRouter(params.sellDex);
      
      const arbitrageParams = {
        tokenA,
        tokenB,
        amountIn: ethers.parseEther(params.amountIn),
        buyDex,
        sellDex,
        minProfit: ethers.parseEther(params.minProfit)
      };

      const result = await this.contract.estimateProfit(arbitrageParams);
      return ethers.formatEther(result);
    } catch (error) {
      console.error('Profit estimation error:', error);
      return '0';
    }
  }

  async getCurrentGasPrice(): Promise<{
    standard: string;
    fast: string;
    instant: string;
  }> {
    try {
      const feeData = await this.provider.getFeeData();
      const gasPrice = feeData.gasPrice || ethers.parseUnits('1', 'gwei');
      
      return {
        standard: ethers.formatUnits(gasPrice, 'gwei'),
        fast: ethers.formatUnits(gasPrice * BigInt(110) / BigInt(100), 'gwei'),
        instant: ethers.formatUnits(gasPrice * BigInt(120) / BigInt(100), 'gwei')
      };
    } catch (error) {
      console.error('Gas price fetch error:', error);
      return {
        standard: '1',
        fast: '1.1',
        instant: '1.2'
      };
    }
  }

  private getTokenAddress(symbol: string): string {
    const cleanSymbol = symbol.replace('/USDC', '').replace('/USDT', '');
    return this.TOKEN_ADDRESSES[cleanSymbol as keyof typeof this.TOKEN_ADDRESSES] || symbol;
  }

  private getDexRouter(dexName: string): string {
    return this.DEX_ROUTERS[dexName as keyof typeof this.DEX_ROUTERS] || dexName;
  }
}

let contractIntegration: ContractIntegration | null = null;

export function getContractIntegration(): ContractIntegration | null {
  try {
    if (!contractIntegration) {
      contractIntegration = new ContractIntegration();
    }
    return contractIntegration;
  } catch (error) {
    console.error('Contract integration failed:', error);
    return null;
  }
}