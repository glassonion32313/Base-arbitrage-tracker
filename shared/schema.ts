import { pgTable, text, serial, decimal, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const arbitrageOpportunities = pgTable("arbitrage_opportunities", {
  id: serial("id").primaryKey(),
  tokenPair: text("token_pair").notNull(),
  token0Symbol: text("token0_symbol").notNull(),
  token1Symbol: text("token1_symbol").notNull(),
  token0Address: text("token0_address").notNull(),
  token1Address: text("token1_address").notNull(),
  buyDex: text("buy_dex").notNull(),
  sellDex: text("sell_dex").notNull(),
  buyPrice: decimal("buy_price", { precision: 20, scale: 8 }).notNull(),
  sellPrice: decimal("sell_price", { precision: 20, scale: 8 }).notNull(),
  priceDifference: decimal("price_difference", { precision: 10, scale: 4 }).notNull(),
  estimatedProfit: decimal("estimated_profit", { precision: 10, scale: 2 }).notNull(),
  gasCost: decimal("gas_cost", { precision: 10, scale: 2 }).notNull(),
  netProfit: decimal("net_profit", { precision: 10, scale: 2 }).notNull(),
  liquidity: decimal("liquidity", { precision: 20, scale: 2 }),
  isActive: boolean("is_active").default(true),
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
