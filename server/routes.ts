import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { priceMonitor } from "./price-monitor";
import { insertArbitrageOpportunitySchema, insertTransactionSchema } from "@shared/schema";
import { z } from "zod";

import { getContractIntegration } from "./contract-integration";

// Initialize contract integration
const contractService = getContractIntegration();

// WebSocket connections tracking
const wsConnections = new Set<WebSocket>();

// Broadcast to all connected WebSocket clients
function broadcastToClients(data: any) {
  const message = JSON.stringify(data);
  wsConnections.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

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

  // Clear all transactions
  app.delete("/api/transactions/all", async (req, res) => {
    try {
      const deletedCount = await storage.clearAllTransactions();
      res.json({ cleared: deletedCount, message: `Cleared ${deletedCount} transactions` });
    } catch (error) {
      console.error('Failed to clear transactions:', error);
      res.status(500).json({ error: 'Failed to clear transactions' });
    }
  });

  // Clear stale opportunities (older than specified minutes)
  app.delete('/api/opportunities/stale', async (req, res) => {
    try {
      const minutes = parseInt(req.query.minutes as string) || 5;
      const count = await storage.clearStaleOpportunities(minutes);
      res.json({ cleared: count, message: `Cleared ${count} stale opportunities` });
    } catch (error) {
      console.error('Failed to clear stale opportunities:', error);
      res.status(500).json({ error: 'Failed to clear stale opportunities' });
    }
  });

  // Clear all opportunities
  app.delete('/api/opportunities/all', async (req, res) => {
    try {
      const count = await storage.clearStaleOpportunities(0); // Clear all
      res.json({ cleared: count, message: `Cleared all ${count} opportunities` });
    } catch (error) {
      console.error('Failed to clear all opportunities:', error);
      res.status(500).json({ error: 'Failed to clear all opportunities' });
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

  // Price monitoring control
  app.get("/api/monitor/status", (req, res) => {
    res.json(priceMonitor.getStatus());
  });

  app.post("/api/monitor/start", (req, res) => {
    try {
      priceMonitor.startMonitoring();
      res.json({ message: "Price monitoring started", status: priceMonitor.getStatus() });
    } catch (error) {
      res.status(500).json({ message: "Failed to start monitoring" });
    }
  });

  app.post("/api/monitor/stop", (req, res) => {
    try {
      priceMonitor.stopMonitoring();
      res.json({ message: "Price monitoring stopped", status: priceMonitor.getStatus() });
    } catch (error) {
      res.status(500).json({ message: "Failed to stop monitoring" });
    }
  });

  // Contract integration endpoints
  app.get("/api/contract/address", (req, res) => {
    if (contractService) {
      res.json({ 
        address: contractService.getContractAddress(),
        network: "Base Mainnet",
        chainId: 8453
      });
    } else {
      res.status(503).json({ error: "Contract service not available" });
    }
  });

  app.post("/api/contract/estimate", async (req, res) => {
    if (!contractService) {
      return res.status(503).json({ error: "Contract service not available" });
    }

    try {
      const { tokenA, tokenB, amountIn, buyDex, sellDex, minProfit } = req.body;
      const estimatedProfit = await contractService.estimateProfit({
        tokenA, tokenB, amountIn, buyDex, sellDex, minProfit
      });
      res.json({ estimatedProfit });
    } catch (error) {
      res.status(500).json({ error: "Estimation failed" });
    }
  });

  app.get("/api/contract/gas", async (req, res) => {
    if (!contractService) {
      return res.status(503).json({ error: "Contract service not available" });
    }

    try {
      const gasPrices = await contractService.getCurrentGasPrice();
      res.json(gasPrices);
    } catch (error) {
      res.status(500).json({ error: "Gas price fetch failed" });
    }
  });

  // Start price monitoring automatically
  priceMonitor.startMonitoring();

  const httpServer = createServer(app);
  
  // Setup WebSocket server on /ws path
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    wsConnections.add(ws);
    
    // Send initial data to new client
    ws.send(JSON.stringify({ 
      type: 'connected', 
      message: 'Connected to arbitrage scanner',
      contractAddress: contractService?.getContractAddress()
    }));
    
    ws.on('close', () => {
      console.log('WebSocket client disconnected');
      wsConnections.delete(ws);
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      wsConnections.delete(ws);
    });
  });

  // Export broadcast function for use by other modules
  (global as any).broadcastToClients = broadcastToClients;

  return httpServer;
}
