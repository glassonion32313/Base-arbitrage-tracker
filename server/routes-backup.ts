import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { priceMonitor } from "./price-monitor";
import { insertArbitrageOpportunitySchema, insertTransactionSchema, insertUserAccountSchema } from "@shared/schema";
import { authService } from "./auth-service";
import { tradeExecutor } from "./trade-executor";
import { autoTrader } from "./auto-trader";
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
  // Authentication middleware
  const requireAuth = async (req: any, res: any, next: any) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({ message: 'Authorization token required' });
      }

      const user = await authService.validateToken(token);
      if (!user) {
        return res.status(401).json({ message: 'Invalid or expired token' });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Authentication failed' });
    }
  };

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

  // Clear stale opportunities (protected from clearing recent ones)
  app.delete("/api/opportunities/stale", async (req, res) => {
    try {
      const { minutes } = req.query;
      const olderThanMinutes = Math.max(parseInt(minutes as string) || 30, 30); // Minimum 30 minutes
      const deletedCount = await storage.clearStaleOpportunities(olderThanMinutes);
      res.json({ deletedCount, message: `Cleared ${deletedCount} opportunities older than ${olderThanMinutes} minutes` });
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
      const minutes = parseFloat(req.query.minutes as string) || 0.75; // Default to 45 seconds
      const count = await storage.clearStaleOpportunities(minutes);
      res.json({ cleared: count, message: `Cleared ${count} stale opportunities` });
    } catch (error) {
      console.error('Failed to clear stale opportunities:', error);
      res.status(500).json({ error: 'Failed to clear stale opportunities' });
    }
  });

  // Clear all opportunities (protected - minimum 45 seconds to preserve recent opportunities)
  app.delete('/api/opportunities/all', async (req, res) => {
    try {
      const count = await storage.clearStaleOpportunities(0.75); // Minimum 45 seconds protection
      res.json({ cleared: count, message: `Cleared ${count} opportunities (keeping recent ones for trading)` });
    } catch (error) {
      console.error('Failed to clear opportunities:', error);
      res.status(500).json({ error: 'Failed to clear opportunities' });
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

  // Get Balancer V2 flashloan capabilities
  app.get('/api/flashloan/capabilities', async (req, res) => {
    try {
      const { balancerService } = await import('./balancer-service');
      const capabilities = balancerService.getAllFlashloanCapabilities();
      res.json(capabilities);
    } catch (error) {
      console.error('Error fetching flashloan capabilities:', error);
      res.status(500).json({ error: 'Failed to fetch flashloan capabilities' });
    }
  });

  // Get optimal flashloan amount for a token
  app.post('/api/flashloan/optimal-amount', async (req, res) => {
    try {
      const { tokenSymbol, requestedAmount } = req.body;
      const { balancerService } = await import('./balancer-service');
      const optimalAmount = balancerService.getOptimalFlashloanAmount(tokenSymbol, requestedAmount);
      res.json({ optimalAmount });
    } catch (error) {
      console.error('Error calculating optimal flashloan amount:', error);
      res.status(500).json({ error: 'Failed to calculate optimal amount' });
    }
  });

  // Execute arbitrage with automatic flashloan (demo mode - requires wallet connection)
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

  // Generate test opportunities for testing automated execution
  app.post('/api/test/generate-opportunities', async (req, res) => {
    try {
      const testOpportunities = [
        {
          tokenPair: 'WETH/USDC',
          token0Symbol: 'WETH',
          token1Symbol: 'USDC',
          token0Address: '0x4200000000000000000000000000000000000006',
          token1Address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          buyDex: 'Uniswap V3',
          sellDex: 'SushiSwap',
          buyPrice: '3245.50',
          sellPrice: '3252.80',
          priceDifference: '0.22',
          estimatedProfit: '7.30',
          netProfit: '6.10',
          gasCost: '1.20',
          amountIn: '1000',
          liquidity: '50000.00'
        },
        {
          tokenPair: 'USDC/USDT',
          token0Symbol: 'USDC',
          token1Symbol: 'USDT',
          token0Address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          token1Address: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
          buyDex: 'BaseSwap',
          sellDex: 'Aerodrome',
          buyPrice: '0.9998',
          sellPrice: '1.0003',
          priceDifference: '0.05',
          estimatedProfit: '3.50',
          netProfit: '2.70',
          gasCost: '0.80',
          amountIn: '10000',
          liquidity: '25000.00'
        }
      ];

      for (const opportunity of testOpportunities) {
        await storage.createArbitrageOpportunity(opportunity);
      }

      res.json({ 
        message: 'Test opportunities generated successfully',
        count: testOpportunities.length 
      });
    } catch (error) {
      console.error('Error generating test opportunities:', error);
      res.status(500).json({ error: 'Failed to generate test opportunities' });
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
      
      // Broadcast gas price update via WebSocket
      broadcastToClients({
        type: 'gas_update',
        data: gasPrices,
        timestamp: new Date()
      });
      
      res.json(gasPrices);
    } catch (error) {
      res.status(500).json({ error: "Gas price fetch failed" });
    }
  });

  // Authentication routes
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, email, password, privateKey } = req.body;
      
      if (!username || !email || !password) {
        return res.status(400).json({ message: 'Username, email, and password are required' });
      }

      const result = await authService.register({
        username,
        email,
        password,
        privateKey
      });

      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
      }

      const result = await authService.login({ username, password });
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req: any, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      await authService.logout(token);
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Logout failed' });
    }
  });

  app.get("/api/auth/me", requireAuth, async (req: any, res) => {
    res.json({ user: req.user });
  });

  app.post("/api/auth/private-key", requireAuth, async (req: any, res) => {
    try {
      const { privateKey } = req.body;
      
      if (!privateKey) {
        return res.status(400).json({ message: 'Private key is required' });
      }

      const walletAddress = await authService.updatePrivateKey(req.user.id, privateKey);
      res.json({ walletAddress, message: 'Private key updated successfully' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get("/api/auth/balance", requireAuth, async (req: any, res) => {
    try {
      const balance = await tradeExecutor.getWalletBalance(req.user.id);
      res.json(balance);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  // Enhanced trade execution with validation
  app.post("/api/trades/execute", requireAuth, async (req: any, res) => {
    try {
      const { opportunityId, tradeAmount, maxSlippage, gasPrice, useFlashloan } = req.body;
      
      if (!opportunityId || !tradeAmount) {
        return res.status(400).json({ message: 'Opportunity ID and trade amount are required' });
      }

      const tradeRequest = {
        userId: req.user.id,
        opportunityId: parseInt(opportunityId),
        tradeAmount: tradeAmount.toString(),
        maxSlippage: maxSlippage || 2, // Default 2% slippage
        gasPrice,
        useFlashloan: useFlashloan || false
      };

      // Validate trade before execution
      const validation = await tradeExecutor.validateTrade(tradeRequest);
      if (!validation.valid) {
        return res.status(400).json({ message: validation.error });
      }

      // Execute the trade
      const result = await tradeExecutor.executeTrade(tradeRequest);
      
      if (result.success) {
        res.json({
          success: true,
          txHash: result.txHash,
          actualProfit: result.actualProfit,
          gasUsed: result.gasUsed,
          message: 'Trade executed successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.error || 'Trade execution failed'
        });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Get user wallet balance
  app.get("/api/wallet/balance", requireAuth, async (req: any, res) => {
    try {
      const balance = await tradeExecutor.getWalletBalance(req.user.id);
      res.json(balance);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Validate trade before execution
  app.post("/api/trades/validate", requireAuth, async (req: any, res) => {
    try {
      const { opportunityId, tradeAmount, maxSlippage } = req.body;
      
      const tradeRequest = {
        userId: req.user.id,
        opportunityId: parseInt(opportunityId),
        tradeAmount: tradeAmount.toString(),
        maxSlippage: maxSlippage || 2
      };

      const validation = await tradeExecutor.validateTrade(tradeRequest);
      res.json(validation);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Server-side auto-trading API routes
  app.post("/api/auto-trading/start", requireAuth, async (req: any, res) => {
    try {
      const settings = req.body;
      const userId = req.user.id;
      
      const success = await autoTrader.startAutoTrading(userId, {
        ...settings,
        userId
      });
      
      if (success) {
        res.json({ 
          success: true,
          message: 'Auto trading started on server',
          isServerSide: true
        });
      } else {
        res.status(400).json({ 
          success: false,
          message: 'Failed to start auto trading'
        });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.post("/api/auto-trading/stop", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const success = await autoTrader.stopAutoTrading(userId);
      
      res.json({ 
        success,
        message: success ? 'Auto trading stopped' : 'No active auto trading found'
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/auto-trading/status", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const status = autoTrader.getAutoTradingStatus(userId);
      const isActive = autoTrader.isAutoTradingActive(userId);
      
      res.json({
        isActive,
        status: status || {
          isActive: false,
          totalTrades: 0,
          successfulTrades: 0,
          totalProfit: 0,
          dailyProfit: 0,
          dailyLoss: 0,
          activeTrades: 0,
          lastTradeTime: null,
          currentStreak: 0
        },
        isServerSide: true
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Historical arbitrage data routes
  app.get('/api/arbitrage-history', async (req, res) => {
    try {
      const { userId, status, tokenPair, limit, offset, dateFrom, dateTo } = req.query;
      
      const filters: any = {};
      if (userId) filters.userId = parseInt(userId as string);
      if (status) filters.status = status as string;
      if (tokenPair) filters.tokenPair = tokenPair as string;
      if (limit) filters.limit = parseInt(limit as string);
      if (offset) filters.offset = parseInt(offset as string);
      if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
      if (dateTo) filters.dateTo = new Date(dateTo as string);
      
      const history = await storage.getArbitrageHistory(filters);
      res.json(history);
    } catch (error) {
      console.error('Error fetching arbitrage history:', error);
      res.status(500).json({ error: 'Failed to fetch arbitrage history' });
    }
  });

  // Analytics routes
  app.get('/api/analytics/daily-stats', async (req, res) => {
    try {
      const { dateFrom, dateTo } = req.query;
      
      const fromDate = dateFrom ? new Date(dateFrom as string) : undefined;
      const toDate = dateTo ? new Date(dateTo as string) : undefined;
      
      const stats = await storage.getDailyStats(fromDate, toDate);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching daily stats:', error);
      res.status(500).json({ error: 'Failed to fetch daily stats' });
    }
  });

  app.get('/api/analytics/token-pairs', async (req, res) => {
    try {
      const { limit } = req.query;
      const limitNum = limit ? parseInt(limit as string) : undefined;
      
      const stats = await storage.getTokenPairStats(limitNum);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching token pair stats:', error);
      res.status(500).json({ error: 'Failed to fetch token pair stats' });
    }
  });

  app.get('/api/analytics/performance', async (req, res) => {
    try {
      const { userId, days } = req.query;
      const userIdNum = userId ? parseInt(userId as string) : undefined;
      const daysNum = days ? parseInt(days as string) : undefined;
      
      const metrics = await storage.getPerformanceMetrics(userIdNum, daysNum);
      res.json(metrics);
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      res.status(500).json({ error: 'Failed to fetch performance metrics' });
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

  // Set up periodic gas price updates via WebSocket (every 30 seconds)
  setInterval(async () => {
    if (contractService && wsConnections.size > 0) {
      try {
        const gasPrices = await contractService.getCurrentGasPrice();
        broadcastToClients({
          type: 'gas_update',
          data: gasPrices,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Failed to broadcast gas prices:', error);
      }
    }
  }, 30000);

  // Set up periodic monitoring status updates via WebSocket
  setInterval(() => {
    if (wsConnections.size > 0) {
      const status = priceMonitor.getStatus();
      broadcastToClients({
        type: 'monitor_status',
        data: status,
        timestamp: new Date()
      });
    }
  }, 10000);

  return httpServer;
}
