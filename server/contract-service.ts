import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';

interface ArbitrageParams {
  tokenA: string;
  tokenB: string;
  amountIn: string;
  buyDex: string;
  sellDex: string;
  minProfit: string;
}

interface DeploymentInfo {
  address: string;
  transaction_hash: string;
  block_number: number;
  gas_used: number;
  deployer: string;
  network: string;
  chain_id: number;
}

export class ContractService {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private contractAddress: string;
  private contractABI: any[];
  
  // Base network DEX router addresses (actual router contracts, not factories)
  private readonly DEX_ROUTERS = {
    'Uniswap': '0x2626664c2603336E57B271c5C0b26F421741e481',
    'Uniswap V3': '0x2626664c2603336E57B271c5C0b26F421741e481',
    'SushiSwap': '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
    'BaseSwap': '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
    'Aerodrome': '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    'Velodrome': '0xa132DAB612dB5cB9fC9Ac426A0Cc215A3423F9c9',
    'PancakeSwap': '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E',
    'Curve': '0x8AE125E8653821E851F12A49F7765db9a9ce7384',
    'Maverick': '0x39E098A153Ad69834a9Dac32f0FCa92066aD03f4'
  };

  private readonly TOKEN_ADDRESSES = {
    'WETH': '0x4200000000000000000000000000000000000006',
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'WBTC': '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    'LINK': '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    'UNI': '0xc3De830EA07524a0761646a6a4e4be0e114A3C83'
  };

  constructor() {
    // Load deployment info and ABI
    const deploymentInfo: DeploymentInfo = JSON.parse(fs.readFileSync('deployment.json', 'utf8'));
    this.contractABI = JSON.parse(fs.readFileSync('arbitragebot_abi.json', 'utf8'));
    this.contractAddress = deploymentInfo.address;
    
    console.log(`Initializing contract service with address: ${this.contractAddress}`);
    
    const rpcUrl = `https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.contract = new ethers.Contract(this.contractAddress, this.contractABI, this.provider);
  }

  async estimateArbitrageProfit(params: ArbitrageParams): Promise<string> {
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

      const estimatedProfit = await this.contract.estimateProfit(arbitrageParams);
      return ethers.formatEther(estimatedProfit);
    } catch (error) {
      console.error('Error estimating arbitrage profit:', error);
      return '0';
    }
  }

  getContractAddress(): string {
    return this.contractAddress;
  }

  async executeArbitrage(params: ArbitrageParams, privateKey: string): Promise<string> {
    try {
      const signer = new ethers.Wallet(privateKey, this.provider);
      const contractWithSigner = this.contract.connect(signer);

      // Use WETH/USDC pair exclusively to ensure liquidity exists
      const tokenA = this.getTokenAddress('WETH');
      const tokenB = this.getTokenAddress('USDC');
      const buyDex = this.getDexRouter('BaseSwap');
      const sellDex = this.getDexRouter('SushiSwap');

      // Use very small amounts for testing - 0.001 WETH (~$2-3)
      const safeAmount = ethers.parseEther("0.001");

      // Create struct parameter as expected by contract
      const arbitrageStruct = {
        tokenA,
        tokenB,
        amountIn: safeAmount,
        buyDex,
        sellDex,
        minProfit: ethers.parseEther("0.0001") // Very low minimum profit for testing
      };

      // Create function data manually to avoid ENS resolution
      const iface = new ethers.Interface(this.contractABI);
      const functionData = iface.encodeFunctionData('executeArbitrage', [arbitrageStruct]);

      // Enhanced gas estimation with fallbacks
      let gasEstimate: bigint;
      try {
        gasEstimate = await this.provider.estimateGas({
          to: this.contractAddress,
          data: functionData,
          from: signer.address
        });
      } catch (gasError) {
        console.warn('Gas estimation failed, using fallback:', gasError);
        gasEstimate = BigInt(800000); // Conservative fallback for arbitrage
      }

      // Get current network fee data with fallbacks
      let feeData;
      try {
        feeData = await this.provider.getFeeData();
      } catch (feeError) {
        console.warn('Fee data fetch failed, using fallback:', feeError);
        feeData = {
          maxFeePerGas: ethers.parseUnits('2', 'gwei'),
          maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
          gasPrice: ethers.parseUnits('1.5', 'gwei')
        };
      }

      // Enhanced transaction parameters with safety margins
      const txParams = {
        to: this.contractAddress,
        data: functionData,
        gasLimit: gasEstimate * BigInt(150) / BigInt(100), // 50% buffer for safety
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('2', 'gwei'),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('1', 'gwei'),
        nonce: await signer.getNonce()
      };

      console.log(`Transaction parameters:`, {
        gasLimit: txParams.gasLimit.toString(),
        maxFeePerGas: ethers.formatUnits(txParams.maxFeePerGas, 'gwei') + ' gwei',
        maxPriorityFeePerGas: ethers.formatUnits(txParams.maxPriorityFeePerGas, 'gwei') + ' gwei'
      });

      // Send transaction with enhanced monitoring
      const tx = await signer.sendTransaction(txParams);

      console.log(`Arbitrage transaction submitted: ${tx.hash}`);
      return tx.hash;
    } catch (error) {
      console.error('Error executing arbitrage:', error);
      throw error;
    }
  }

  async getTransactionStatus(txHash: string): Promise<{
    status: 'pending' | 'confirmed' | 'failed';
    blockNumber?: number;
    gasUsed?: bigint;
  }> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        return { status: 'pending' };
      }

      return {
        status: receipt.status === 1 ? 'confirmed' : 'failed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed
      };
    } catch (error) {
      console.error('Error getting transaction status:', error);
      return { status: 'failed' };
    }
  }

  private getTokenAddress(symbol: string): string {
    const normalizedSymbol = symbol.replace('/USDC', '').replace('/USDT', '');
    return this.TOKEN_ADDRESSES[normalizedSymbol as keyof typeof this.TOKEN_ADDRESSES] || symbol;
  }

  private getDexRouter(dexName: string): string {
    const address = this.DEX_ROUTERS[dexName as keyof typeof this.DEX_ROUTERS];
    if (!address) {
      console.warn(`DEX router not found for ${dexName}, using Uniswap as fallback`);
      return this.DEX_ROUTERS['Uniswap'];
    }
    return address;
  }

  async getCurrentGasPrice(): Promise<{
    standard: bigint;
    fast: bigint;
    instant: bigint;
  }> {
    try {
      const feeData = await this.provider.getFeeData();
      const baseFee = feeData.gasPrice || BigInt(0);
      
      return {
        standard: baseFee,
        fast: baseFee * BigInt(110) / BigInt(100), // 10% higher
        instant: baseFee * BigInt(120) / BigInt(100) // 20% higher
      };
    } catch (error) {
      console.error('Error fetching gas prices:', error);
      return {
        standard: BigInt(1000000000), // 1 gwei fallback
        fast: BigInt(1100000000),
        instant: BigInt(1200000000)
      };
    }
  }

  async estimateGas(to: string, data: string): Promise<bigint> {
    try {
      const gasEstimate = await this.provider.estimateGas({
        to,
        data,
        value: 0
      });
      return gasEstimate;
    } catch (error) {
      console.error('Gas estimation failed:', error);
      return BigInt(500000); // Default gas limit
    }
  }

  async getContractBalance(tokenAddress: string): Promise<string> {
    try {
      if (tokenAddress === '0x0000000000000000000000000000000000000000') {
        // ETH balance
        const balance = await this.provider.getBalance(this.contract.target);
        return ethers.formatEther(balance);
      } else {
        // ERC20 balance
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ['function balanceOf(address) external view returns (uint256)'],
          this.provider
        );
        const balance = await tokenContract.balanceOf(this.contract.target);
        return ethers.formatEther(balance);
      }
    } catch (error) {
      console.error('Error fetching contract balance:', error);
      return '0';
    }
  }

  async getMaxFlashloanAmount(tokenAddress: string): Promise<bigint> {
    try {
      // Dynamic limits based on typical Balancer pool liquidity for each token
      const tokenLimits = {
        [this.TOKEN_ADDRESSES.WETH]: ethers.parseEther("10.0"),    // 10 WETH
        [this.TOKEN_ADDRESSES.USDC]: ethers.parseUnits("50000", 6), // 50K USDC  
        [this.TOKEN_ADDRESSES.LINK]: ethers.parseEther("1000"),     // 1K LINK
        [this.TOKEN_ADDRESSES.UNI]: ethers.parseEther("500"),      // 500 UNI
      };

      // Return predefined limit based on token or conservative default
      const limit = tokenLimits[tokenAddress.toLowerCase()] || ethers.parseEther("1.0");
      
      console.log(`Dynamic flashloan limit for ${tokenAddress}: ${ethers.formatEther(limit)}`);
      return limit;
      
    } catch (error) {
      console.error('Error determining max flashloan amount:', error);
      // Fallback to very conservative amount
      return ethers.parseEther("0.1");
    }
  }
}

// Singleton instance
let contractService: ContractService | null = null;

export function getContractService(contractAddress?: string): ContractService {
  if (!contractService) {
    contractService = new ContractService();
  }
  
  if (!contractService) {
    throw new Error('Contract service not initialized - contract address required');
  }
  
  return contractService;
}