import { storage } from './storage';
import { tradeExecutor } from './trade-executor';
import { authService } from './auth-service';

interface AutoTradingSettings {
  enabled: boolean;
  userId: number;
  minProfitThreshold: number;
  maxTradeAmount: number;
  maxSlippage: number;
  maxConcurrentTrades: number;
  cooldownBetweenTrades: number;
  onlyFlashloans: boolean;
  flashloanSize: number;
  flashloanStrategy: 'fixed' | 'percentage' | 'dynamic';
  dailyProfitTarget: number;
  dailyLossLimit: number;
  stopLossPercentage: number;
}

interface TradingStatus {
  isActive: boolean;
  totalTrades: number;
  successfulTrades: number;
  totalProfit: number;
  dailyProfit: number;
  dailyLoss: number;
  activeTrades: number;
  lastTradeTime: Date | null;
  currentStreak: number;
}

export class AutoTrader {
  private activeTraders: Map<number, {
    settings: AutoTradingSettings;
    status: TradingStatus;
    interval: NodeJS.Timeout;
  }> = new Map();

  async startAutoTrading(userId: number, settings: AutoTradingSettings): Promise<boolean> {
    try {
      // Stop existing auto trading for this user
      this.stopAutoTrading(userId);

      // Validate user has private key
      const privateKey = await authService.getPrivateKey(userId);
      if (!privateKey) {
        throw new Error('User private key not configured');
      }

      const status: TradingStatus = {
        isActive: true,
        totalTrades: 0,
        successfulTrades: 0,
        totalProfit: 0,
        dailyProfit: 0,
        dailyLoss: 0,
        activeTrades: 0,
        lastTradeTime: null,
        currentStreak: 0
      };

      // Start trading interval
      const interval = setInterval(async () => {
        await this.executeAutoTrades(userId, settings, status);
      }, settings.cooldownBetweenTrades * 1000);

      this.activeTraders.set(userId, {
        settings: { ...settings, userId },
        status,
        interval
      });

      console.log(`Auto trading started for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Failed to start auto trading:', error);
      return false;
    }
  }

  async stopAutoTrading(userId: number): Promise<boolean> {
    const trader = this.activeTraders.get(userId);
    if (trader) {
      clearInterval(trader.interval);
      trader.status.isActive = false;
      this.activeTraders.delete(userId);
      console.log(`Auto trading stopped for user ${userId}`);
      return true;
    }
    return false;
  }

  private async executeAutoTrades(userId: number, settings: AutoTradingSettings, status: TradingStatus) {
    try {
      // Check if trading should continue
      if (!status.isActive || status.activeTrades >= settings.maxConcurrentTrades) {
        return;
      }

      // Check daily limits
      if (status.dailyProfit >= settings.dailyProfitTarget) {
        console.log(`Daily profit target reached for user ${userId}`);
        return;
      }

      if (status.dailyLoss >= settings.dailyLossLimit) {
        console.log(`Daily loss limit reached for user ${userId}`);
        await this.stopAutoTrading(userId);
        return;
      }

      // Get profitable opportunities
      const opportunities = await storage.getArbitrageOpportunities({
        minProfit: settings.minProfitThreshold,
        isActive: true,
        limit: 5
      });

      if (opportunities.length === 0) {
        return;
      }

      // Select best opportunity
      const opportunity = opportunities[0];
      const netProfit = parseFloat(opportunity.netProfit);

      if (netProfit < settings.minProfitThreshold) {
        return;
      }

      // Determine trade amount based on flashloan strategy
      let tradeAmount = settings.maxTradeAmount;
      if (settings.onlyFlashloans) {
        switch (settings.flashloanStrategy) {
          case 'fixed':
            tradeAmount = settings.flashloanSize;
            break;
          case 'percentage':
            const liquidity = parseFloat(opportunity.liquidity);
            tradeAmount = Math.min(liquidity * 0.1, settings.flashloanSize); // 10% of liquidity
            break;
          case 'dynamic':
            // Scale based on profit potential
            const profitRatio = netProfit / settings.minProfitThreshold;
            tradeAmount = Math.min(settings.flashloanSize * profitRatio, settings.maxTradeAmount);
            break;
        }
      }

      // Execute trade
      status.activeTrades++;
      const tradeResult = await tradeExecutor.executeTrade({
        userId,
        opportunityId: opportunity.id,
        tradeAmount: tradeAmount.toString(),
        maxSlippage: settings.maxSlippage,
        useFlashloan: settings.onlyFlashloans
      });

      status.activeTrades--;
      status.totalTrades++;
      status.lastTradeTime = new Date();

      if (tradeResult.success) {
        const profit = parseFloat(tradeResult.actualProfit || '0');
        status.successfulTrades++;
        status.totalProfit += profit;
        status.dailyProfit += profit;
        status.currentStreak++;
        
        console.log(`Auto trade success for user ${userId}: $${profit.toFixed(2)} profit`);
      } else {
        status.dailyLoss += 5; // Estimated gas cost loss
        status.currentStreak = 0;
        
        console.log(`Auto trade failed for user ${userId}: ${tradeResult.error}`);
      }

      // Update stored status
      const trader = this.activeTraders.get(userId);
      if (trader) {
        trader.status = status;
      }

    } catch (error) {
      console.error(`Auto trading error for user ${userId}:`, error);
      status.activeTrades = Math.max(0, status.activeTrades - 1);
    }
  }

  getAutoTradingStatus(userId: number): TradingStatus | null {
    const trader = this.activeTraders.get(userId);
    return trader ? trader.status : null;
  }

  isAutoTradingActive(userId: number): boolean {
    return this.activeTraders.has(userId);
  }

  getAllActiveTraders(): number[] {
    return Array.from(this.activeTraders.keys());
  }

  // Reset daily stats at midnight
  resetDailyStats() {
    for (const [userId, trader] of this.activeTraders) {
      trader.status.dailyProfit = 0;
      trader.status.dailyLoss = 0;
    }
  }
}

export const autoTrader = new AutoTrader();

// Reset daily stats at midnight
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    autoTrader.resetDailyStats();
  }
}, 60000); // Check every minute