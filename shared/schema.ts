import { pgTable, text, serial, decimal, timestamp, boolean, integer, varchar, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  walletAddress: varchar("wallet_address"),
  totalProfitUSD: decimal("total_profit_usd", { precision: 12, scale: 2 }).default("0"),
  totalTradesExecuted: integer("total_trades_executed").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

export const arbitrageOpportunities = pgTable("arbitrage_opportunities", {
  id: serial("id").primaryKey(),
  tokenPair: text("token_pair").notNull(),
  token0Symbol: text("token0_symbol").notNull(),
  token1Symbol: text("token1_symbol").notNull(),
  token0Address: text("token0_address").notNull(),
  token1Address: text("token1_address").notNull(),
  buyDex: text("buy_dex").notNull(),
  sellDex: text("sell_dex").notNull(),
  buyPrice: decimal("buy_price", { precision: 15, scale: 6 }).notNull(),
  sellPrice: decimal("sell_price", { precision: 15, scale: 6 }).notNull(),
  priceDifference: decimal("price_difference", { precision: 10, scale: 4 }).notNull(),
  estimatedProfit: decimal("estimated_profit", { precision: 15, scale: 6 }).notNull(),
  gasCost: decimal("gas_cost", { precision: 15, scale: 6 }).notNull(),
  netProfit: decimal("net_profit", { precision: 15, scale: 6 }).notNull(),
  liquidity: decimal("liquidity", { precision: 20, scale: 2 }),
  isActive: boolean("is_active").default(true),
  isBeingTraded: boolean("is_being_traded").default(false),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  txHash: text("tx_hash").unique(),
  userAddress: text("user_address").notNull(),
  tokenPair: text("token_pair").notNull(),
  buyDex: text("buy_dex").notNull(),
  sellDex: text("sell_dex").notNull(),
  amountIn: decimal("amount_in", { precision: 20, scale: 8 }).notNull(),
  expectedProfit: decimal("expected_profit", { precision: 10, scale: 2 }).notNull(),
  actualProfit: decimal("actual_profit", { precision: 10, scale: 2 }),
  gasCost: decimal("gas_cost", { precision: 10, scale: 2 }).notNull(),
  flashloanAmount: decimal("flashloan_amount", { precision: 20, scale: 8 }),
  flashloanFee: decimal("flashloan_fee", { precision: 10, scale: 8 }),
  isFlashloan: boolean("is_flashloan").default(false),
  status: text("status").notNull().default("pending"), // pending, confirmed, failed
  createdAt: timestamp("created_at").defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
});

export const dexes = pgTable("dexes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contractAddress: text("contract_address").notNull(),
  routerAddress: text("router_address").notNull(),
  factoryAddress: text("factory_address").notNull(),
  isEnabled: boolean("is_enabled").default(true),
});

export const settings = pgTable("settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
});

// User accounts for authentication and private key storage
export const userAccounts = pgTable("user_accounts", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  privateKeyEncrypted: text("private_key_encrypted"), // Encrypted private key
  walletAddress: text("wallet_address").unique(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

// User sessions for authentication
export const userSessions = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => userAccounts.id),
  sessionToken: text("session_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertArbitrageOpportunitySchema = createInsertSchema(arbitrageOpportunities).omit({
  id: true,
  lastUpdated: true,
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
  confirmedAt: true,
});

export const insertDexSchema = createInsertSchema(dexes).omit({
  id: true,
});

export const insertSettingSchema = createInsertSchema(settings).omit({
  id: true,
});

export const insertUserAccountSchema = createInsertSchema(userAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
});

export const insertUserSessionSchema = createInsertSchema(userSessions).omit({
  id: true,
  createdAt: true,
});

// Historical arbitrage executions
export const arbitrageHistory = pgTable("arbitrage_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  txHash: text("tx_hash").notNull().unique(),
  tokenPair: text("token_pair").notNull(),
  token0Symbol: text("token0_symbol").notNull(),
  token1Symbol: text("token1_symbol").notNull(),
  buyDex: text("buy_dex").notNull(),
  sellDex: text("sell_dex").notNull(),
  amountIn: decimal("amount_in", { precision: 20, scale: 8 }).notNull(),
  amountOut: decimal("amount_out", { precision: 20, scale: 8 }),
  grossProfit: decimal("gross_profit", { precision: 10, scale: 2 }).notNull(),
  gasCost: decimal("gas_cost", { precision: 10, scale: 6 }).notNull(),
  netProfit: decimal("net_profit", { precision: 10, scale: 2 }).notNull(),
  gasUsed: text("gas_used"),
  gasPrice: text("gas_price"),
  blockNumber: integer("block_number"),
  status: text("status").notNull().default('pending'),
  executedAt: timestamp("executed_at").defaultNow(),
  confirmedAt: timestamp("confirmed_at"),
});

// Daily analytics aggregates
export const dailyStats = pgTable("daily_stats", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  totalTrades: integer("total_trades").default(0),
  successfulTrades: integer("successful_trades").default(0),
  totalVolume: decimal("total_volume", { precision: 20, scale: 2 }).default('0'),
  totalGrossProfit: decimal("total_gross_profit", { precision: 15, scale: 2 }).default('0'),
  totalGasCost: decimal("total_gas_cost", { precision: 15, scale: 6 }).default('0'),
  totalNetProfit: decimal("total_net_profit", { precision: 15, scale: 2 }).default('0'),
  bestTrade: decimal("best_trade", { precision: 10, scale: 2 }).default('0'),
  avgTradeSize: decimal("avg_trade_size", { precision: 10, scale: 2 }).default('0'),
  avgProfit: decimal("avg_profit", { precision: 10, scale: 2 }).default('0'),
  successRate: decimal("success_rate", { precision: 5, scale: 2 }).default('0'),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Token pair performance analytics
export const tokenPairStats = pgTable("token_pair_stats", {
  id: serial("id").primaryKey(),
  tokenPair: text("token_pair").notNull().unique(),
  totalTrades: integer("total_trades").default(0),
  successfulTrades: integer("successful_trades").default(0),
  totalVolume: decimal("total_volume", { precision: 20, scale: 2 }).default('0'),
  totalProfit: decimal("total_profit", { precision: 15, scale: 2 }).default('0'),
  avgProfit: decimal("avg_profit", { precision: 10, scale: 2 }).default('0'),
  bestProfit: decimal("best_profit", { precision: 10, scale: 2 }).default('0'),
  successRate: decimal("success_rate", { precision: 5, scale: 2 }).default('0'),
  lastTradeAt: timestamp("last_trade_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertArbitrageHistorySchema = createInsertSchema(arbitrageHistory).omit({
  id: true,
  executedAt: true,
});

export const insertDailyStatsSchema = createInsertSchema(dailyStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTokenPairStatsSchema = createInsertSchema(tokenPairStats).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ArbitrageOpportunity = typeof arbitrageOpportunities.$inferSelect;
export type InsertArbitrageOpportunity = z.infer<typeof insertArbitrageOpportunitySchema>;
export type Transaction = typeof transactions.$inferSelect;
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Dex = typeof dexes.$inferSelect;
export type InsertDex = z.infer<typeof insertDexSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type UserAccount = typeof userAccounts.$inferSelect;
export type InsertUserAccount = z.infer<typeof insertUserAccountSchema>;
export type UserSession = typeof userSessions.$inferSelect;
export type InsertUserSession = z.infer<typeof insertUserSessionSchema>;
export type ArbitrageHistory = typeof arbitrageHistory.$inferSelect;
export type InsertArbitrageHistory = z.infer<typeof insertArbitrageHistorySchema>;
export type DailyStats = typeof dailyStats.$inferSelect;
export type InsertDailyStats = z.infer<typeof insertDailyStatsSchema>;
export type TokenPairStats = typeof tokenPairStats.$inferSelect;
export type InsertTokenPairStats = z.infer<typeof insertTokenPairStatsSchema>;
