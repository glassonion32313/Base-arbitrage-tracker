import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertArbitrageOpportunitySchema, insertTransactionSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get arbitrage opportunities with optional filters
  app.get("/api/opportunities", async (req, res) => {
    try {
      const { minProfit, isActive, limit, offset } = req.query;
      
      const filters = {
        minProfit: minProfit ? parseFloat(minProfit as string) : undefined,
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      };

      const opportunities = await storage.getArbitrageOpportunities(filters);
      res.json(opportunities);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch opportunities" });
    }
  });

  // Create new arbitrage opportunity
  app.post("/api/opportunities", async (req, res) => {
    try {
      const validatedData = insertArbitrageOpportunitySchema.parse(req.body);
      const opportunity = await storage.createArbitrageOpportunity(validatedData);
      res.status(201).json(opportunity);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create opportunity" });
      }
    }
  });

  // Update arbitrage opportunity
  app.patch("/api/opportunities/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const opportunity = await storage.updateArbitrageOpportunity(id, updates);
      
      if (!opportunity) {
        return res.status(404).json({ message: "Opportunity not found" });
      }
      
      res.json(opportunity);
    } catch (error) {
      res.status(500).json({ message: "Failed to update opportunity" });
    }
  });

  // Clear stale opportunities
  app.delete("/api/opportunities/stale", async (req, res) => {
    try {
      const { minutes } = req.query;
      const olderThanMinutes = minutes ? parseInt(minutes as string) : 5;
      const deletedCount = await storage.clearStaleOpportunities(olderThanMinutes);
      res.json({ deletedCount });
    } catch (error) {
      res.status(500).json({ message: "Failed to clear stale opportunities" });
    }
  });

  // Get transactions with optional filters
  app.get("/api/transactions", async (req, res) => {
    try {
      const { userAddress, status, limit, offset } = req.query;
      
      const filters = {
        userAddress: userAddress as string,
        status: status as string,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
      };

      const transactions = await storage.getTransactions(filters);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Create new transaction
  app.post("/api/transactions", async (req, res) => {
    try {
      const validatedData = insertTransactionSchema.parse(req.body);
      const transaction = await storage.createTransaction(validatedData);
      res.status(201).json(transaction);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Invalid data", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create transaction" });
      }
    }
  });

  // Update transaction status
  app.patch("/api/transactions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const transaction = await storage.updateTransaction(id, updates);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ message: "Failed to update transaction" });
    }
  });

  // Get transaction by hash
  app.get("/api/transactions/hash/:txHash", async (req, res) => {
    try {
      const { txHash } = req.params;
      const transaction = await storage.getTransactionByHash(txHash);
      
      if (!transaction) {
        return res.status(404).json({ message: "Transaction not found" });
      }
      
      res.json(transaction);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch transaction" });
    }
  });

  // Get DEXes
  app.get("/api/dexes", async (req, res) => {
    try {
      const { enabledOnly } = req.query;
      const dexes = await storage.getDexes(enabledOnly === "true");
      res.json(dexes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch DEXes" });
    }
  });

  // Get statistics
  app.get("/api/stats", async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  });

  // Get settings
  app.get("/api/settings/:key", async (req, res) => {
    try {
      const { key } = req.params;
      const setting = await storage.getSetting(key);
      
      if (!setting) {
        return res.status(404).json({ message: "Setting not found" });
      }
      
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch setting" });
    }
  });

  // Set setting
  app.post("/api/settings", async (req, res) => {
    try {
      const { key, value } = req.body;
      const setting = await storage.setSetting({ key, value });
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to set setting" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
