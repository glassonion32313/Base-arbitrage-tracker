import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { priceMonitor } from "./price-monitor";
import { insertArbitrageOpportunitySchema, insertTransactionSchema } from "@shared/schema";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { tradeExecutor } from "./trade-executor";
import { autoTrader } from "./auto-trader";
import { z } from "zod";
import { getContractService } from "./contract-service";

// Initialize contract service for real blockchain transactions
const contractService = getContractService();

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
  // Set up Replit Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Get arbitrage opportunities with optional filters
  app.get("/api/opportunities", async (req, res) => {
    try {
      // Disable caching for real-time data
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });

      const { minProfit, isActive, limit, offset } = req.query;
      
      const filters = {
        minProfit: minProfit ? parseFloat(minProfit as string) : undefined,
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        limit: limit ? parseInt(limit as string) : 50,
        offset: offset ? parseInt(offset as string) : 0
      };

      const opportunities = await storage.getArbitrageOpportunities(filters);
      console.log(`API returning ${opportunities.length} opportunities`);
      res.json(opportunities);
    } catch (error) {
      console.error('Error fetching opportunities:', error);
      res.status(500).json({ error: 'Failed to fetch opportunities' });
    }
  });

  // Execute arbitrage with automatic flashloan - REAL BLOCKCHAIN TRANSACTIONS
  app.post('/api/arbitrage/execute-auto', async (req: any, res) => {
    try {
      const { opportunityId, useFlashloan, privateKey } = req.body;
      
      // Get opportunity details
      const opportunities = await storage.getArbitrageOpportunities();
      const opportunity = opportunities.find(op => op.id === opportunityId);
      if (!opportunity) {
        return res.status(404).json({ error: 'Opportunity not found' });
      }

      // For demo purposes, require private key in request body
      if (!privateKey) {
        return res.status(400).json({ 
          error: 'Private key required for transaction execution. This is a demo - in production, use secure wallet integration.' 
        });
      }

      let flashloanAmount = '0.1'; // Demo amount
      if (useFlashloan) {
        const { balancerService } = await import('./balancer-service');
        flashloanAmount = balancerService.getOptimalFlashloanAmount(
          opportunity.token0Symbol,
          opportunity.estimatedProfit
        );
      }

      // Execute real blockchain transaction
      if (!contractService) {
        return res.status(503).json({ error: 'Contract service not available' });
      }

      try {
        // Prepare arbitrage parameters for real transaction
        const arbitrageParams = {
          tokenA: opportunity.token0Address,
          tokenB: opportunity.token1Address,
          amountIn: flashloanAmount,
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
          minProfit: '0.001'
        };

        // Execute real blockchain transaction
        const txHash = await contractService.executeArbitrage(arbitrageParams, privateKey);
        
        // Record transaction in database
        await storage.createTransaction({
          txHash,
          userAddress: 'demo-user',
          tokenPair: opportunity.tokenPair,
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
          amountIn: flashloanAmount,
          expectedProfit: opportunity.estimatedProfit,
          actualProfit: '0', // Will be updated when transaction confirms
          gasCost: '0.002',
          isFlashloan: useFlashloan,
          status: 'pending'
        });

        res.json({
          success: true,
          txHash,
          flashloanAmount,
          message: 'Real blockchain transaction submitted to Base network',
          explorerUrl: `https://basescan.org/tx/${txHash}`,
          opportunity: {
            tokenPair: opportunity.tokenPair,
            profit: opportunity.estimatedProfit,
            buyDex: opportunity.buyDex,
            sellDex: opportunity.sellDex
          }
        });

      } catch (contractError: any) {
        console.error('Contract execution error:', contractError);
        res.status(400).json({
          success: false,
          error: `Transaction failed: ${contractError.message}`,
          details: 'Check wallet balance, gas fees, and network connectivity'
        });
      }
    } catch (error) {
      console.error('Error executing automated arbitrage:', error);
      res.status(500).json({ error: 'Failed to execute arbitrage' });
    }
  });

  // Protected route example
  app.get("/api/protected", isAuthenticated, async (req, res) => {
    const userId = req.user?.claims?.sub;
    res.json({ message: "Protected route accessed", userId });
  });

  // Start price monitoring
  if (!priceMonitor.isMonitoring()) {
    priceMonitor.startMonitoring();
  }

  // WebSocket server setup
  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws'
  });

  wss.on('connection', (ws) => {
    console.log('New WebSocket connection established');
    wsConnections.add(ws);

    ws.on('close', () => {
      console.log('WebSocket connection closed');
      wsConnections.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      wsConnections.delete(ws);
    });

    // Send initial data
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'Connected to arbitrage scanner'
    }));
  });

  return httpServer;
}