import { 
  arbitrageOpportunities, 
  transactions, 
  dexes, 
  settings,
  type ArbitrageOpportunity, 
  type InsertArbitrageOpportunity,
  type Transaction,
  type InsertTransaction,
  type Dex,
  type InsertDex,
  type Setting,
  type InsertSetting
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lt, desc } from "drizzle-orm";

export interface IStorage {
  // Arbitrage opportunities
  getArbitrageOpportunities(filters?: {
    minProfit?: number;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ArbitrageOpportunity[]>;
  createArbitrageOpportunity(opportunity: InsertArbitrageOpportunity): Promise<ArbitrageOpportunity>;
  updateArbitrageOpportunity(id: number, updates: Partial<InsertArbitrageOpportunity>): Promise<ArbitrageOpportunity | undefined>;
  deleteArbitrageOpportunity(id: number): Promise<boolean>;
  clearStaleOpportunities(olderThanMinutes: number): Promise<number>;

  // Transactions
  getTransactions(filters?: {
    userAddress?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Transaction[]>;
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  updateTransaction(id: number, updates: Partial<InsertTransaction>): Promise<Transaction | undefined>;
  getTransactionByHash(txHash: string): Promise<Transaction | undefined>;
  deleteTransaction(id: number): Promise<boolean>;
  clearAllTransactions(): Promise<number>;

  // DEXes
  getDexes(enabledOnly?: boolean): Promise<Dex[]>;
  createDex(dex: InsertDex): Promise<Dex>;
  updateDex(id: number, updates: Partial<InsertDex>): Promise<Dex | undefined>;

  // Settings
  getSetting(key: string): Promise<Setting | undefined>;
  setSetting(setting: InsertSetting): Promise<Setting>;

  // Stats
  getStats(): Promise<{
    totalOpportunities: number;
    bestProfit: number;
    avgGasFee: number;
    successRate: number;
    volume24h: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    this.initializeData();
  }

  private async initializeData() {
    try {
      const existingDexes = await db.select().from(dexes).limit(1);
      if (existingDexes.length === 0) {
        await this.initializeDefaultDexes();
        await this.initializeSampleOpportunities();
      }
    } catch (error) {
      console.error('Failed to initialize data:', error);
    }
  }

  private async initializeDefaultDexes() {
    const defaultDexes: InsertDex[] = [
      {
        name: "Uniswap V3",
        contractAddress: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
        routerAddress: "0x2626664c2603336E57B271c5C0b26F421741e481",
        factoryAddress: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
        isEnabled: true,
      },
      {
        name: "SushiSwap",
        contractAddress: "0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891",
        routerAddress: "0xFB7eF66a7e61224DD6FcD0D7d9C3be5C8B049b9f",
        factoryAddress: "0x71524B4f93c58fcbF659783284E38825f0622859",
        isEnabled: true,
      },
      {
        name: "BaseSwap",
        contractAddress: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",
        routerAddress: "0x327Df1E6de05895d2ab08513aaDD9313Fe505d86",
        factoryAddress: "0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB",
        isEnabled: true,
      },
    ];

    await db.insert(dexes).values(defaultDexes);
  }

  private async initializeSampleOpportunities() {
    const sampleOpportunities: InsertArbitrageOpportunity[] = [
      {
        tokenPair: "WBTC/USDT",
        token0Symbol: "WBTC",
        token1Symbol: "USDT", 
        token0Address: "0x4200000000000000000000000000000000000006",
        token1Address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        buyDex: "Uniswap V3",
        sellDex: "SushiSwap",
        buyPrice: "43250.50",
        sellPrice: "43305.25",
        priceDifference: "0.127",
        estimatedProfit: "54.75",
        gasCost: "12.30",
        netProfit: "42.45",
        isActive: true,
        liquidity: "2500000",
      },
      {
        tokenPair: "ETH/USDC",
        token0Symbol: "ETH",
        token1Symbol: "USDC",
        token0Address: "0x4200000000000000000000000000000000000006",
        token1Address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        buyDex: "BaseSwap",
        sellDex: "Uniswap V3",
        buyPrice: "2485.20",
        sellPrice: "2523.80",
        priceDifference: "1.55",
        estimatedProfit: "38.60",
        gasCost: "15.20",
        netProfit: "23.40",
        isActive: true,
        liquidity: "1850000",
      },
      {
        tokenPair: "LINK/USDT",
        token0Symbol: "LINK",
        token1Symbol: "USDT",
        token0Address: "0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196",
        token1Address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        buyDex: "SushiSwap",
        sellDex: "BaseSwap",
        buyPrice: "14.25",
        sellPrice: "14.45",
        priceDifference: "1.40",
        estimatedProfit: "20.00",
        gasCost: "8.50",
        netProfit: "11.50",
        isActive: true,
        liquidity: "750000",
      },
    ];

    await db.insert(arbitrageOpportunities).values(sampleOpportunities);
  }

  async getArbitrageOpportunities(filters?: {
    minProfit?: number;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ArbitrageOpportunity[]> {
    try {
      let query = db.select().from(arbitrageOpportunities);
      
      if (filters?.isActive !== undefined) {
        query = query.where(eq(arbitrageOpportunities.isActive, filters.isActive));
      }
      
      let results = await query.orderBy(desc(arbitrageOpportunities.estimatedProfit));
      
      if (filters?.minProfit !== undefined) {
        results = results.filter(op => parseFloat(op.estimatedProfit) >= filters.minProfit!);
      }
      
      if (filters?.offset) {
        results = results.slice(filters.offset);
      }
      
      if (filters?.limit) {
        results = results.slice(0, filters.limit);
      }
      
      return results;
    } catch (error) {
      console.error('Failed to fetch opportunities:', error);
      return [];
    }
  }

  async createArbitrageOpportunity(opportunity: InsertArbitrageOpportunity): Promise<ArbitrageOpportunity> {
    try {
      // First check if similar opportunity exists
      const existing = await db
        .select()
        .from(arbitrageOpportunities)
        .where(
          and(
            eq(arbitrageOpportunities.tokenPair, opportunity.tokenPair),
            eq(arbitrageOpportunities.buyDex, opportunity.buyDex),
            eq(arbitrageOpportunities.sellDex, opportunity.sellDex)
          )
        );

      if (existing.length > 0) {
        // Update existing opportunity to maintain ID consistency
        const [result] = await db
          .update(arbitrageOpportunities)
          .set({
            ...opportunity,
            lastUpdated: new Date()
          })
          .where(eq(arbitrageOpportunities.id, existing[0].id))
          .returning();
        return result;
      } else {
        // Create new opportunity
        const [result] = await db
          .insert(arbitrageOpportunities)
          .values({
            ...opportunity,
            lastUpdated: new Date()
          })
          .returning();
        return result;
      }
    } catch (error) {
      // Fallback to simple insert if upsert fails
      const [result] = await db.insert(arbitrageOpportunities).values(opportunity).returning();
      return result;
    }
  }

  async updateArbitrageOpportunity(id: number, updates: Partial<InsertArbitrageOpportunity>): Promise<ArbitrageOpportunity | undefined> {
    try {
      const [result] = await db
        .update(arbitrageOpportunities)
        .set({ ...updates, lastUpdated: new Date() })
        .where(eq(arbitrageOpportunities.id, id))
        .returning();
      return result;
    } catch (error) {
      console.error('Failed to update opportunity:', error);
      return undefined;
    }
  }

  async deleteArbitrageOpportunity(id: number): Promise<boolean> {
    try {
      await db
        .delete(arbitrageOpportunities)
        .where(eq(arbitrageOpportunities.id, id));
      return true;
    } catch (error) {
      console.error('Failed to delete opportunity:', error);
      return false;
    }
  }

  async clearStaleOpportunities(olderThanMinutes: number): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
      const staleOpportunities = await db
        .select()
        .from(arbitrageOpportunities)
        .where(lt(arbitrageOpportunities.lastUpdated, cutoff));
      
      if (staleOpportunities.length > 0) {
        await db
          .delete(arbitrageOpportunities)
          .where(lt(arbitrageOpportunities.lastUpdated, cutoff));
      }
      
      return staleOpportunities.length;
    } catch (error) {
      console.error('Failed to clear stale opportunities:', error);
      return 0;
    }
  }

  async getTransactions(filters?: {
    userAddress?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Transaction[]> {
    try {
      let query = db.select().from(transactions);
      
      if (filters?.userAddress) {
        query = query.where(eq(transactions.userAddress, filters.userAddress));
      }
      
      if (filters?.status) {
        query = query.where(eq(transactions.status, filters.status));
      }
      
      let results = await query.orderBy(desc(transactions.createdAt));
      
      if (filters?.offset) {
        results = results.slice(filters.offset);
      }
      
      if (filters?.limit) {
        results = results.slice(0, filters.limit);
      }
      
      return results;
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
      return [];
    }
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const [result] = await db.insert(transactions).values(transaction).returning();
    return result;
  }

  async updateTransaction(id: number, updates: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    try {
      const updateData = { ...updates };
      if (updates.status === "confirmed") {
        updateData.confirmedAt = new Date();
      }
      
      const [result] = await db
        .update(transactions)
        .set(updateData)
        .where(eq(transactions.id, id))
        .returning();
      return result;
    } catch (error) {
      console.error('Failed to update transaction:', error);
      return undefined;
    }
  }

  async getTransactionByHash(txHash: string): Promise<Transaction | undefined> {
    try {
      const [result] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.txHash, txHash))
        .limit(1);
      return result;
    } catch (error) {
      console.error('Failed to fetch transaction by hash:', error);
      return undefined;
    }
  }

  async deleteTransaction(id: number): Promise<boolean> {
    try {
      await db.delete(transactions).where(eq(transactions.id, id));
      return true;
    } catch (error) {
      console.error('Failed to delete transaction:', error);
      return false;
    }
  }

  async clearAllTransactions(): Promise<number> {
    try {
      const allTransactions = await db.select().from(transactions);
      const count = allTransactions.length;
      await db.delete(transactions);
      return count;
    } catch (error) {
      console.error('Failed to clear all transactions:', error);
      return 0;
    }
  }

  async getDexes(enabledOnly?: boolean): Promise<Dex[]> {
    try {
      let query = db.select().from(dexes);
      
      if (enabledOnly) {
        query = query.where(eq(dexes.isEnabled, true));
      }
      
      return await query;
    } catch (error) {
      console.error('Failed to fetch dexes:', error);
      return [];
    }
  }

  async createDex(dex: InsertDex): Promise<Dex> {
    const [result] = await db.insert(dexes).values(dex).returning();
    return result;
  }

  async updateDex(id: number, updates: Partial<InsertDex>): Promise<Dex | undefined> {
    try {
      const [result] = await db
        .update(dexes)
        .set(updates)
        .where(eq(dexes.id, id))
        .returning();
      return result;
    } catch (error) {
      console.error('Failed to update dex:', error);
      return undefined;
    }
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    try {
      const [result] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, key))
        .limit(1);
      return result;
    } catch (error) {
      console.error('Failed to fetch setting:', error);
      return undefined;
    }
  }

  async setSetting(setting: InsertSetting): Promise<Setting> {
    try {
      const [existing] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, setting.key))
        .limit(1);
      
      if (existing) {
        const [result] = await db
          .update(settings)
          .set({ value: setting.value })
          .where(eq(settings.key, setting.key))
          .returning();
        return result;
      } else {
        const [result] = await db.insert(settings).values(setting).returning();
        return result;
      }
    } catch (error) {
      console.error('Failed to set setting:', error);
      throw error;
    }
  }

  async getStats(): Promise<{
    totalOpportunities: number;
    bestProfit: number;
    avgGasFee: number;
    successRate: number;
    volume24h: number;
  }> {
    try {
      const activeOpportunities = await db
        .select()
        .from(arbitrageOpportunities)
        .where(eq(arbitrageOpportunities.isActive, true));
      
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentTransactions = await db
        .select()
        .from(transactions)
        .where(gte(transactions.createdAt, dayAgo));
      
      const successfulTxs = recentTransactions.filter(tx => tx.status === "confirmed");
      const totalGas = recentTransactions.reduce((sum, tx) => sum + parseFloat(tx.gasCost), 0);
      const totalVolume = recentTransactions.reduce((sum, tx) => {
        return sum + parseFloat(tx.amountIn);
      }, 0);
      
      const bestProfit = activeOpportunities.length > 0 
        ? Math.max(...activeOpportunities.map(op => parseFloat(op.estimatedProfit)))
        : 0;
      
      return {
        totalOpportunities: activeOpportunities.length,
        bestProfit,
        avgGasFee: recentTransactions.length > 0 ? totalGas / recentTransactions.length : 0,
        successRate: recentTransactions.length > 0 ? successfulTxs.length / recentTransactions.length : 0,
        volume24h: totalVolume,
      };
    } catch (error) {
      console.error('Failed to get stats:', error);
      return {
        totalOpportunities: 0,
        bestProfit: 0,
        avgGasFee: 0,
        successRate: 0,
        volume24h: 0,
      };
    }
  }
}

export const storage = new DatabaseStorage();