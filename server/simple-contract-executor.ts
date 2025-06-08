import { ethers } from 'ethers';
import fs from 'fs';

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

export class SimpleContractExecutor {
  private provider: ethers.JsonRpcProvider;
  private contract: ethers.Contract;
  private contractAddress: string;

  private readonly TOKEN_ADDRESSES = {
    'WETH': '0x4200000000000000000000000000000000000006',
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'USDT': '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    'LINK': '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    'UNI': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
  };

  private readonly DEX_ROUTERS = {
    'Uniswap V3': '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    'SushiSwap': '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
    'BaseSwap': '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
    'Aerodrome': '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43'
  };

  constructor() {
    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(`https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
    
    // Load deployment info
    const deploymentInfo: DeploymentInfo = JSON.parse(fs.readFileSync('deployment.json', 'utf8'));
    this.contractAddress = deploymentInfo.address;
    
    // Load contract ABI
    const contractABI = JSON.parse(fs.readFileSync('arbitragebot_abi.json', 'utf8'));
    
    // Initialize contract
    this.contract = new ethers.Contract(this.contractAddress, contractABI, this.provider);
  }

  async executeArbitrage(params: ArbitrageParams, privateKey: string): Promise<string> {
    try {
      // Create wallet from private key
      const wallet = new ethers.Wallet(privateKey, this.provider);
      const contractWithSigner = this.contract.connect(wallet);

      // Convert token symbols to addresses
      const tokenAAddress = this.getTokenAddress(params.tokenA);
      const tokenBAddress = this.getTokenAddress(params.tokenB);
      const buyDexAddress = this.getDexRouter(params.buyDex);
      const sellDexAddress = this.getDexRouter(params.sellDex);

      // Convert amounts to wei
      const amountInWei = ethers.parseEther(params.amountIn);
      const minProfitWei = ethers.parseEther(params.minProfit);

      // Prepare transaction parameters
      const arbitrageParams = {
        tokenA: tokenAAddress,
        tokenB: tokenBAddress,
        amountIn: amountInWei,
        buyDex: buyDexAddress,
        sellDex: sellDexAddress,
        minProfit: minProfitWei
      };

      console.log('🚀 EXECUTING REAL ARBITRAGE TRANSACTION:');
      console.log(`   Contract: ${this.contractAddress}`);
      console.log(`   Token A: ${params.tokenA} (${tokenAAddress})`);
      console.log(`   Token B: ${params.tokenB} (${tokenBAddress})`);
      console.log(`   Amount: ${params.amountIn} ETH`);
      console.log(`   Buy DEX: ${params.buyDex}`);
      console.log(`   Sell DEX: ${params.sellDex}`);
      console.log(`   Min Profit: ${params.minProfit} ETH`);

      // Get current gas price
      const gasPrice = await this.provider.getFeeData();
      
      // Execute the arbitrage transaction
      const tx = await contractWithSigner.getFunction("executeArbitrage")(arbitrageParams, {
        gasLimit: 800000,
        gasPrice: gasPrice.gasPrice
      });

      console.log(`✅ TRANSACTION SUBMITTED: ${tx.hash}`);
      console.log(`   Gas Price: ${ethers.formatUnits(gasPrice.gasPrice || 0, 'gwei')} Gwei`);
      console.log(`   Gas Limit: 800,000`);

      // Wait for confirmation
      console.log('⏳ Waiting for blockchain confirmation...');
      const receipt = await tx.wait();

      console.log(`🎉 ARBITRAGE COMPLETED SUCCESSFULLY!`);
      console.log(`   Block Number: ${receipt?.blockNumber}`);
      console.log(`   Gas Used: ${receipt?.gasUsed}`);
      console.log(`   Status: ${receipt?.status === 1 ? 'SUCCESS' : 'FAILED'}`);

      return tx.hash;

    } catch (error: any) {
      console.error('❌ ARBITRAGE EXECUTION FAILED:', error.message);
      
      if (error.message.includes('insufficient funds')) {
        throw new Error('INSUFFICIENT FUNDS: Add more ETH to wallet for gas fees');
      } else if (error.message.includes('Insufficient profit')) {
        throw new Error('INSUFFICIENT PROFIT: Market conditions changed');
      } else if (error.message.includes('execution reverted')) {
        throw new Error('TRANSACTION REVERTED: Check liquidity and slippage');
      } else {
        throw new Error(`EXECUTION FAILED: ${error.message}`);
      }
    }
  }

  async estimateProfit(params: ArbitrageParams): Promise<string> {
    try {
      const tokenAAddress = this.getTokenAddress(params.tokenA);
      const tokenBAddress = this.getTokenAddress(params.tokenB);
      const buyDexAddress = this.getDexRouter(params.buyDex);
      const sellDexAddress = this.getDexRouter(params.sellDex);
      const amountInWei = ethers.parseEther(params.amountIn);
      const minProfitWei = ethers.parseEther(params.minProfit);

      const arbitrageParams = {
        tokenA: tokenAAddress,
        tokenB: tokenBAddress,
        amountIn: amountInWei,
        buyDex: buyDexAddress,
        sellDex: sellDexAddress,
        minProfit: minProfitWei
      };

      const estimatedProfit = await this.contract.estimateProfit(arbitrageParams);
      return ethers.formatEther(estimatedProfit);
    } catch (error: any) {
      console.error('Profit estimation failed:', error.message);
      return '0';
    }
  }

  async getContractBalance(tokenSymbol: string): Promise<string> {
    try {
      const tokenAddress = this.getTokenAddress(tokenSymbol);
      
      if (tokenSymbol === 'ETH') {
        const balance = await this.provider.getBalance(this.contractAddress);
        return ethers.formatEther(balance);
      } else {
        const tokenContract = new ethers.Contract(
          tokenAddress,
          ['function balanceOf(address) view returns (uint256)'],
          this.provider
        );
        const balance = await tokenContract.balanceOf(this.contractAddress);
        return ethers.formatEther(balance);
      }
    } catch (error) {
      console.error(`Failed to get contract balance for ${tokenSymbol}:`, error);
      return '0';
    }
  }

  private getTokenAddress(symbol: string): string {
    const address = this.TOKEN_ADDRESSES[symbol as keyof typeof this.TOKEN_ADDRESSES];
    if (!address) {
      throw new Error(`Unsupported token: ${symbol}`);
    }
    return address;
  }

  private getDexRouter(dexName: string): string {
    const router = this.DEX_ROUTERS[dexName as keyof typeof this.DEX_ROUTERS];
    if (!router) {
      throw new Error(`Unsupported DEX: ${dexName}`);
    }
    return router;
  }

  getContractAddress(): string {
    return this.contractAddress;
  }
}

export const simpleContractExecutor = new SimpleContractExecutor();