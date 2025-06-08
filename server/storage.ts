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

export class MemStorage implements IStorage {
  private opportunities: Map<number, ArbitrageOpportunity>;
  private transactionsList: Map<number, Transaction>;
  private dexesList: Map<number, Dex>;
  private settingsList: Map<string, Setting>;
  private currentOpportunityId: number;
  private currentTransactionId: number;
  private currentDexId: number;

  constructor() {
    this.opportunities = new Map();
    this.transactionsList = new Map();
    this.dexesList = new Map();
    this.settingsList = new Map();
    this.currentOpportunityId = 1;
    this.currentTransactionId = 1;
    this.currentDexId = 1;

    // Initialize with some Base network DEXes
    this.initializeDefaultDexes();
  }

  private initializeDefaultDexes() {
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

    defaultDexes.forEach(dex => {
      const id = this.currentDexId++;
      this.dexesList.set(id, { ...dex, id });
    });
  }

  async getArbitrageOpportunities(filters?: {
    minProfit?: number;
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<ArbitrageOpportunity[]> {
    let opportunities = Array.from(this.opportunities.values());

    if (filters) {
      if (filters.minProfit !== undefined) {
        opportunities = opportunities.filter(op => 
          parseFloat(op.estimatedProfit) >= filters.minProfit!
        );
      }
      if (filters.isActive !== undefined) {
        opportunities = opportunities.filter(op => op.isActive === filters.isActive);
      }
      if (filters.offset) {
        opportunities = opportunities.slice(filters.offset);
      }
      if (filters.limit) {
        opportunities = opportunities.slice(0, filters.limit);
      }
    }

    return opportunities.sort((a, b) => 
      parseFloat(b.estimatedProfit) - parseFloat(a.estimatedProfit)
    );
  }

  async createArbitrageOpportunity(opportunity: InsertArbitrageOpportunity): Promise<ArbitrageOpportunity> {
    const id = this.currentOpportunityId++;
    const newOpportunity: ArbitrageOpportunity = {
      ...opportunity,
      id,
      lastUpdated: new Date(),
    };
    this.opportunities.set(id, newOpportunity);
    return newOpportunity;
  }

  async updateArbitrageOpportunity(id: number, updates: Partial<InsertArbitrageOpportunity>): Promise<ArbitrageOpportunity | undefined> {
    const opportunity = this.opportunities.get(id);
    if (!opportunity) return undefined;

    const updated = { ...opportunity, ...updates, lastUpdated: new Date() };
    this.opportunities.set(id, updated);
    return updated;
  }

  async deleteArbitrageOpportunity(id: number): Promise<boolean> {
    return this.opportunities.delete(id);
  }

  async clearStaleOpportunities(olderThanMinutes: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    const initialSize = this.opportunities.size;
    
    for (const [id, opportunity] of this.opportunities.entries()) {
      if (opportunity.lastUpdated && opportunity.lastUpdated < cutoff) {
        this.opportunities.delete(id);
      }
    }
    
    return initialSize - this.opportunities.size;
  }

  async getTransactions(filters?: {
    userAddress?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Transaction[]> {
    let transactions = Array.from(this.transactionsList.values());

    if (filters) {
      if (filters.userAddress) {
        transactions = transactions.filter(tx => 
          tx.userAddress.toLowerCase() === filters.userAddress!.toLowerCase()
        );
      }
      if (filters.status) {
        transactions = transactions.filter(tx => tx.status === filters.status);
      }
      if (filters.offset) {
        transactions = transactions.slice(filters.offset);
      }
      if (filters.limit) {
        transactions = transactions.slice(0, filters.limit);
      }
    }

    return transactions.sort((a, b) => 
      new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime()
    );
  }

  async createTransaction(transaction: InsertTransaction): Promise<Transaction> {
    const id = this.currentTransactionId++;
    const newTransaction: Transaction = {
      ...transaction,
      id,
      createdAt: new Date(),
      confirmedAt: null,
    };
    this.transactionsList.set(id, newTransaction);
    return newTransaction;
  }

  async updateTransaction(id: number, updates: Partial<InsertTransaction>): Promise<Transaction | undefined> {
    const transaction = this.transactionsList.get(id);
    if (!transaction) return undefined;

    const updated = { ...transaction, ...updates };
    if (updates.status === "confirmed" && !transaction.confirmedAt) {
      updated.confirmedAt = new Date();
    }
    this.transactionsList.set(id, updated);
    return updated;
  }

  async getTransactionByHash(txHash: string): Promise<Transaction | undefined> {
    return Array.from(this.transactionsList.values()).find(tx => tx.txHash === txHash);
  }

  async getDexes(enabledOnly?: boolean): Promise<Dex[]> {
    let dexes = Array.from(this.dexesList.values());
    if (enabledOnly) {
      dexes = dexes.filter(dex => dex.isEnabled);
    }
    return dexes;
  }

  async createDex(dex: InsertDex): Promise<Dex> {
    const id = this.currentDexId++;
    const newDex: Dex = { ...dex, id };
    this.dexesList.set(id, newDex);
    return newDex;
  }

  async updateDex(id: number, updates: Partial<InsertDex>): Promise<Dex | undefined> {
    const dex = this.dexesList.get(id);
    if (!dex) return undefined;

    const updated = { ...dex, ...updates };
    this.dexesList.set(id, updated);
    return updated;
  }

  async getSetting(key: string): Promise<Setting | undefined> {
    return this.settingsList.get(key);
  }

  async setSetting(setting: InsertSetting): Promise<Setting> {
    const newSetting: Setting = { ...setting, id: Date.now() };
    this.settingsList.set(setting.key, newSetting);
    return newSetting;
  }

  async getStats(): Promise<{
    totalOpportunities: number;
    bestProfit: number;
    avgGasFee: number;
    successRate: number;
    volume24h: number;
  }> {
    const opportunities = Array.from(this.opportunities.values()).filter(op => op.isActive);
    const recentTransactions = Array.from(this.transactionsList.values()).filter(tx => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      return tx.createdAt && tx.createdAt > dayAgo;
    });

    const confirmedTransactions = recentTransactions.filter(tx => tx.status === "confirmed");
    const successRate = recentTransactions.length > 0 
      ? (confirmedTransactions.length / recentTransactions.length) * 100 
      : 0;

    const volume24h = confirmedTransactions.reduce((sum, tx) => 
      sum + parseFloat(tx.amountIn), 0
    );

    const avgGasFee = opportunities.length > 0
      ? opportunities.reduce((sum, op) => sum + parseFloat(op.gasCost), 0) / opportunities.length
      : 0;

    const bestProfit = opportunities.length > 0
      ? Math.max(...opportunities.map(op => parseFloat(op.estimatedProfit)))
      : 0;

    return {
      totalOpportunities: opportunities.length,
      bestProfit,
      avgGasFee,
      successRate,
      volume24h,
    };
  }
}

export const storage = new MemStorage();
