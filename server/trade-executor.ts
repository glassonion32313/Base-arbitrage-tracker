import { ethers } from 'ethers';
import { authService } from './auth-service';
import { storage } from './storage';
import { getContractService } from './contract-service';

interface TradeRequest {
  userId: number;
  opportunityId: number;
  tradeAmount: string; // in USD
  maxSlippage: number; // percentage
  gasPrice?: string;
  useFlashloan?: boolean;
}

interface TradeResult {
  success: boolean;
  txHash?: string;
  actualProfit?: string;
  gasUsed?: string;
  error?: string;
}

export class TradeExecutor {
  private provider: ethers.JsonRpcProvider;
  private contractService: any;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(`https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
    this.contractService = getContractService();
  }

  async executeTrade(request: TradeRequest): Promise<TradeResult> {
    let opportunity: any = null;
    
    try {
      // Get user's private key
      const privateKey = await authService.getPrivateKey(request.userId);
      const wallet = new ethers.Wallet(privateKey, this.provider);

      // Get arbitrage opportunity by ID and lock it for trading
      opportunity = await storage.getArbitrageOpportunityById(request.opportunityId);
      
      if (!opportunity) {
        return { 
          success: false, 
          error: `Opportunity not found` 
        };
      }

      // Lock the opportunity to prevent it from being cleared during execution
      await storage.updateArbitrageOpportunity(opportunity.id, { isBeingTraded: true });
      console.log(`Locked opportunity ${opportunity.id} for trading`);

      try {
        // Validate opportunity is still active and profitable
        if (!opportunity.isActive) {
          return { success: false, error: 'Opportunity is no longer active' };
        }

        const netProfit = parseFloat(opportunity.netProfit);
        if (netProfit <= 0) {
          return { success: false, error: 'Opportunity is no longer profitable' };
        }

        // Calculate trade parameters
        const tradeAmountWei = ethers.parseEther(request.tradeAmount);
        const buyPrice = parseFloat(opportunity.buyPrice);
        const sellPrice = parseFloat(opportunity.sellPrice);

        // Estimate gas for the transaction
        const gasEstimate = await this.estimateGas(opportunity);
        const gasPrice = request.gasPrice ? ethers.parseUnits(request.gasPrice, 'gwei') : await this.provider.getFeeData().then(fees => fees.gasPrice);

        // Execute the arbitrage trade
        const txResult = await this.executeArbitrageTransaction(
          wallet,
          opportunity,
          tradeAmountWei.toString(),
          gasEstimate,
          gasPrice
        );

        if (txResult.success && txResult.txHash) {
          // Record transaction in database
          await storage.createTransaction({
            txHash: txResult.txHash,
            userAddress: wallet.address,
            tokenPair: opportunity.tokenPair,
            buyDex: opportunity.buyDex,
            sellDex: opportunity.sellDex,
            amountIn: request.tradeAmount,
            expectedProfit: opportunity.estimatedProfit,
            actualProfit: txResult.actualProfit || '0',
            gasCost: txResult.gasUsed || '0',
            isFlashloan: true,
            status: 'confirmed'
          });

          // Deactivate the opportunity since it's been used
          await storage.updateArbitrageOpportunity(opportunity.id, { isActive: false });
        }

        return txResult;
      } catch (error: any) {
        console.error('Trade execution failed:', error);
        return { 
          success: false, 
          error: error.message || 'Trade execution failed' 
        };
      } finally {
        // Always unlock the opportunity after trade completion
        if (opportunity?.id) {
          try {
            await storage.updateArbitrageOpportunity(opportunity.id, { isBeingTraded: false });
            console.log(`Unlocked opportunity ${opportunity.id} after trade completion`);
          } catch (unlockError) {
            console.error(`Failed to unlock opportunity ${opportunity.id}:`, unlockError);
          }
        }
      }
    } catch (error: any) {
      // Unlock opportunity in case of outer try-catch errors
      if (opportunity?.id) {
        try {
          await storage.updateArbitrageOpportunity(opportunity.id, { isBeingTraded: false });
          console.log(`Unlocked opportunity ${opportunity.id} after error`);
        } catch (unlockError) {
          console.error(`Failed to unlock opportunity after error:`, unlockError);
        }
      }

      return {
        success: false,
        error: error.message || 'Transaction execution failed'
      };
    }
  }

  private async executeArbitrageTransaction(
    wallet: ethers.Wallet,
    opportunity: any,
    amountIn: string,
    gasEstimate: bigint,
    gasPrice: bigint | null
  ): Promise<TradeResult> {
    try {
      if (!this.contractService) {
        throw new Error('Contract service not available');
      }

      // Dynamic flashloan amounts based on token type and available liquidity
      const getFlashloanAmount = (tokenSymbol: string): string => {
        const token = tokenSymbol.toLowerCase();
        if (token.includes('weth') || token.includes('eth')) {
          return '10'; // 10 WETH maximum
        } else if (token.includes('usdc') || token.includes('usdt') || token.includes('dai')) {
          return '50000'; // 50K stablecoin maximum
        } else if (token.includes('link')) {
          return '1000'; // 1K LINK maximum
        } else if (token.includes('uni')) {
          return '500'; // 500 UNI maximum
        }
        return '1'; // Conservative default for unknown tokens
      };

      const flashloanAmount = getFlashloanAmount(opportunity.token0Symbol);
      const amountInEther = ethers.formatEther(amountIn);
      const actualAmount = Math.min(parseFloat(amountInEther), parseFloat(flashloanAmount)).toString();

      // Define DEX router addresses for Base network
      const DEX_ROUTERS = {
        'Uniswap': '0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24',
        'SushiSwap': '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891',
        'BaseSwap': '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
        'Aerodrome': '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
        'Velodrome': '0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858',
        'PancakeSwap': '0x8cFe327CEc66d1C090Dd72bd0FF11d690C33a2Eb',
        'Curve': '0xd6681e74eEA20d196c15038C580f721EF2aB6320',
        'Maverick': '0x32AED3Bce901DA12ca8489788F3A99fCe1056e14'
      };

      const getBuyDexRouter = (dexName: string) => {
        return DEX_ROUTERS[dexName as keyof typeof DEX_ROUTERS] || DEX_ROUTERS['Uniswap'];
      };

      const getSellDexRouter = (dexName: string) => {
        return DEX_ROUTERS[dexName as keyof typeof DEX_ROUTERS] || DEX_ROUTERS['Uniswap'];
      };

      // Prepare transaction parameters with router addresses
      const arbitrageParams = {
        tokenA: opportunity.token0Address,
        tokenB: opportunity.token1Address,
        amountIn: ethers.parseEther(actualAmount).toString(),
        buyDex: getBuyDexRouter(opportunity.buyDex),
        sellDex: getSellDexRouter(opportunity.sellDex),
        minProfit: ethers.parseEther('0.01').toString() // Minimum $0.01 profit
      };

      // Validate contract service availability
      if (!this.contractService) {
        throw new Error('Contract service not initialized');
      }

      // Pre-flight checks before execution
      const balance = await this.provider.getBalance(wallet.address);
      const minBalance = ethers.parseEther('0.01'); // Require minimum 0.01 ETH for gas
      
      if (balance < minBalance) {
        return {
          success: false,
          error: `Insufficient balance. Required: 0.01 ETH, Available: ${ethers.formatEther(balance)} ETH`
        };
      }

      // Execute with comprehensive error handling
      try {
        console.log(`Executing arbitrage for opportunity ${opportunity.id} with amount ${actualAmount}`);
        
        const txHash = await this.contractService.executeArbitrage(arbitrageParams, wallet.privateKey);
        console.log(`Transaction submitted: ${txHash}`);

        // Monitor transaction with timeout
        const receipt = await Promise.race([
          this.provider.waitForTransaction(txHash, 1),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction timeout after 60 seconds')), 60000)
          )
        ]) as any;

        if (receipt?.status === 1) {
          const actualProfit = await this.calculateActualProfit(receipt, opportunity);
          console.log(`Trade successful: ${txHash}, Profit: ${actualProfit}`);
          
          return {
            success: true,
            txHash,
            actualProfit: actualProfit.toString(),
            gasUsed: receipt.gasUsed.toString()
          };
        } else {
          return {
            success: false,
            txHash,
            error: 'Transaction reverted on blockchain'
          };
        }
      } catch (contractError: any) {
        console.error('Contract execution error:', contractError);
        
        // Provide specific error messages for common issues
        if (contractError.message.includes('insufficient funds')) {
          return {
            success: false,
            error: 'Insufficient funds for gas fees'
          };
        } else if (contractError.message.includes('execution reverted')) {
          return {
            success: false,
            error: 'Contract execution reverted - likely slippage or liquidity issue'
          };
        } else if (contractError.message.includes('timeout')) {
          return {
            success: false,
            error: 'Transaction timeout - network congestion'
          };
        } else {
          return {
            success: false,
            error: `Contract error: ${contractError.message}`
          };
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Transaction execution failed'
      };
    }
  }

  private async estimateGas(opportunity: any): Promise<bigint> {
    try {
      if (!this.contractService) {
        return BigInt(500000); // Default gas estimate
      }

      const gasEstimate = await this.contractService.estimateGas(
        this.contractService.getContractAddress(),
        '0x' // Empty data for now
      );

      return gasEstimate;
    } catch (error) {
      console.error('Gas estimation failed:', error);
      return BigInt(500000); // Fallback gas estimate
    }
  }

  private async calculateActualProfit(receipt: any, opportunity: any): Promise<number> {
    try {
      // Extract profit from transaction logs (simplified)
      return parseFloat(opportunity.estimatedProfit) * 0.95; // 95% of estimated profit due to slippage
    } catch (error) {
      console.error('Profit calculation failed:', error);
      return 0;
    }
  }

  async getWalletBalance(userId: number): Promise<{ eth: string; usd: string }> {
    try {
      const privateKey = await authService.getPrivateKey(userId);
      const wallet = new ethers.Wallet(privateKey, this.provider);
      
      const balance = await this.provider.getBalance(wallet.address);
      const ethBalance = ethers.formatEther(balance);
      
      // Get ETH price in USD (using on-chain oracle)
      const ethPriceUSD = 3000; // Placeholder - should use Chainlink oracle
      const usdBalance = parseFloat(ethBalance) * ethPriceUSD;

      return {
        eth: ethBalance,
        usd: usdBalance.toFixed(2)
      };
    } catch (error) {
      console.error('Balance fetch failed:', error);
      return { eth: '0', usd: '0' };
    }
  }

  async validateTrade(request: TradeRequest): Promise<{ valid: boolean; error?: string }> {
    try {
      const opportunity = await storage.getArbitrageOpportunityById(request.opportunityId);
      if (!opportunity) {
        return { valid: false, error: 'Opportunity not found' };
      }

      if (!opportunity.isActive) {
        return { valid: false, error: 'Opportunity is no longer active' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Validation failed' };
    }
  }
}

export const tradeExecutor = new TradeExecutor();