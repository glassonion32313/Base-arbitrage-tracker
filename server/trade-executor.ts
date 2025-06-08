import { ethers } from 'ethers';
import { authService } from './auth-service';
import { storage } from './storage';
import { getContractIntegration } from './contract-integration';

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
    this.contractService = getContractIntegration();
  }

  async executeTrade(request: TradeRequest): Promise<TradeResult> {
    try {
      // Get user's private key
      const privateKey = await authService.getPrivateKey(request.userId);
      const wallet = new ethers.Wallet(privateKey, this.provider);

      // Get arbitrage opportunity by ID with direct database query
      const opportunity = await storage.getArbitrageOpportunityById(request.opportunityId);
      
      if (!opportunity) {
        const availableOpportunities = await storage.getArbitrageOpportunities({ limit: 10 });
        const availableIds = availableOpportunities.map(o => o.id).join(', ');
        console.log(`Opportunity ${request.opportunityId} not found. Available IDs: ${availableIds}`);
        return { 
          success: false, 
          error: `Opportunity ${request.opportunityId} not found. Try using one of these IDs: ${availableIds}` 
        };
      }

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

      // Prepare transaction parameters
      const arbitrageParams = {
        tokenA: opportunity.token0Address,
        tokenB: opportunity.token1Address,
        amountIn,
        buyDex: opportunity.buyDex,
        sellDex: opportunity.sellDex,
        minProfit: ethers.parseEther('0.01').toString() // Minimum $0.01 profit
      };

      // Execute through contract service
      const txHash = await this.contractService.executeArbitrage(arbitrageParams, wallet.privateKey);

      // Wait for transaction confirmation
      const receipt = await this.provider.waitForTransaction(txHash, 2); // Wait for 2 confirmations

      if (receipt?.status === 1) {
        // Calculate actual profit from transaction logs
        const actualProfit = await this.calculateActualProfit(receipt, opportunity);
        const gasUsed = (receipt.gasUsed * (gasPrice || BigInt(0))).toString();

        return {
          success: true,
          txHash,
          actualProfit: actualProfit.toString(),
          gasUsed: ethers.formatEther(gasUsed)
        };
      } else {
        return {
          success: false,
          error: 'Transaction failed on blockchain'
        };
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
      // Parse transaction logs to calculate actual profit
      // This would involve analyzing the DEX swap events and calculating
      // the difference between tokens received and tokens spent
      
      // For now, return estimated profit as approximation
      return parseFloat(opportunity.estimatedProfit);
    } catch (error) {
      console.error('Profit calculation failed:', error);
      return 0;
    }
  }

  // Get user's wallet balance
  async getWalletBalance(userId: number): Promise<{ eth: string; usd: string }> {
    try {
      const privateKey = await authService.getPrivateKey(userId);
      const wallet = new ethers.Wallet(privateKey, this.provider);
      
      const balance = await this.provider.getBalance(wallet.address);
      const ethBalance = ethers.formatEther(balance);
      
      // Convert to USD (approximate)
      const ethPriceUSD = 2650; // This would come from a price feed in production
      const usdBalance = (parseFloat(ethBalance) * ethPriceUSD).toFixed(2);

      return {
        eth: ethBalance,
        usd: usdBalance
      };
    } catch (error) {
      console.error('Balance fetch failed:', error);
      return { eth: '0', usd: '0' };
    }
  }

  // Validate trade before execution
  async validateTrade(request: TradeRequest): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check if user has private key by attempting to retrieve it
      try {
        await authService.getPrivateKey(request.userId);
      } catch (error) {
        return { valid: false, error: 'No wallet configured' };
      }

      // Check wallet balance (different requirements for flashloan vs regular trades)
      const balance = await this.getWalletBalance(request.userId);
      
      if (request.useFlashloan) {
        // For flashloans, only need gas fees (0.005 ETH minimum)
        if (parseFloat(balance.eth) < 0.005) {
          return { valid: false, error: 'Insufficient ETH for gas fees (need ~0.005 ETH for flashloan)' };
        }
      } else {
        // For regular trades, need full trade amount + gas fees
        const requiredEth = parseFloat(request.tradeAmount) / 2650; // Approximate ETH needed
        if (parseFloat(balance.eth) < requiredEth) {
          return { valid: false, error: 'Insufficient ETH balance' };
        }
      }

      // Validate opportunity exists and is profitable
      const opportunities = await storage.getArbitrageOpportunities({ 
        limit: 1, 
        offset: request.opportunityId - 1 
      });

      if (opportunities.length === 0) {
        return { valid: false, error: 'Opportunity not found' };
      }

      const opportunity = opportunities[0];
      if (!opportunity.isActive || parseFloat(opportunity.netProfit) <= 0) {
        return { valid: false, error: 'Opportunity no longer profitable' };
      }

      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }
}

export const tradeExecutor = new TradeExecutor();