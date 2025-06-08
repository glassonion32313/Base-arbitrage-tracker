import { ethers } from 'ethers';
import { WebSocketServer } from 'ws';

interface ArbitrageOpportunity {
  tokenA: string;
  tokenB: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  profitUSD: number;
  flashloanAmount: string;
  gasEstimate: number;
  blockNumber: number;
  timestamp: Date;
}

interface ExecutionResult {
  success: boolean;
  txHash?: string;
  profit?: number;
  error?: string;
}

export class AutomatedArbitrage {
  private provider: ethers.JsonRpcProvider;
  private wsProvider: ethers.WebSocketProvider;
  private wallet: ethers.Wallet;
  private isRunning = false;
  private wss: WebSocketServer | null = null;
  private clients: Set<any> = new Set();
  private contractAddress = '0x675f26375aB7E5a35279CF3AE37C26a3004b9ae4';

  // Real DEX router addresses on Base
  private readonly DEX_ROUTERS = {
    'Uniswap V3': '0x2626664c2603336E57B271c5C0b26F421741e481',
    'SushiSwap': '0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891', 
    'BaseSwap': '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
    'Aerodrome': '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43'
  };

  private readonly TOKEN_ADDRESSES = {
    'WETH': '0x4200000000000000000000000000000000000006',
    'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    'USDT': '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    'LINK': '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
    'UNI': '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359'
  };

  private readonly ROUTER_ABI = [
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
  ];

  private readonly CONTRACT_ABI = [
    'function executeArbitrage(address tokenA, address tokenB, uint256 amountIn, address buyDex, address sellDex, uint256 minProfit) external payable'
  ];

  // Trading configuration
  private readonly MIN_PROFIT_USD = 5.0;
  private readonly MAX_GAS_PRICE_GWEI = 1.0;
  private readonly MIN_FLASHLOAN_ETH = 0.1;
  private readonly MAX_FLASHLOAN_ETH = 10.0;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(`https://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
    this.wsProvider = new ethers.WebSocketProvider(`wss://base-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`);
    
    // Initialize wallet from environment
    const privateKey = process.env.TRADING_WALLET_PRIVATE_KEY || ethers.Wallet.createRandom().privateKey;
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }

  setupWebSocket(httpServer: any) {
    this.wss = new WebSocketServer({ 
      server: httpServer, 
      path: '/ws/automated' 
    });

    this.wss.on('connection', (ws) => {
      console.log('🤖 Automated arbitrage client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('❌ Automated arbitrage client disconnected');
      });
    });
  }

  async startAutomation() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🚀 Starting fully automated arbitrage trading...');
    
    // Check wallet balance
    const balance = await this.wallet.provider.getBalance(this.wallet.address);
    console.log(`💰 Trading wallet: ${this.wallet.address}`);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance < ethers.parseEther('0.001')) {
      console.log('⚠️ Warning: Low ETH balance, may not be able to execute trades');
    }
    
    // Listen for new blocks and scan for opportunities
    this.wsProvider.on('block', async (blockNumber) => {
      if (this.isRunning) {
        await this.scanAndExecute(blockNumber);
      }
    });
    
    this.broadcastStatus('started', { wallet: this.wallet.address, balance: ethers.formatEther(balance) });
  }

  async stopAutomation() {
    this.isRunning = false;
    this.wsProvider.removeAllListeners('block');
    console.log('⏹️ Stopped automated arbitrage trading');
    this.broadcastStatus('stopped', {});
  }

  private async scanAndExecute(blockNumber: number) {
    try {
      console.log(`🔍 Block ${blockNumber}: Scanning for arbitrage opportunities...`);
      
      const opportunities = await this.findArbitrageOpportunities(blockNumber);
      
      if (opportunities.length > 0) {
        console.log(`💡 Found ${opportunities.length} potential opportunities`);
        
        // Sort by profitability
        opportunities.sort((a, b) => b.profitUSD - a.profitUSD);
        
        // Execute the most profitable opportunity
        const best = opportunities[0];
        if (best.profitUSD >= this.MIN_PROFIT_USD) {
          console.log(`🎯 Executing best opportunity: ${best.profitUSD.toFixed(2)} USD profit`);
          const result = await this.executeArbitrage(best);
          
          this.broadcastOpportunity(best, result);
          
          if (result.success) {
            console.log(`✅ Trade executed successfully: ${result.txHash}`);
            console.log(`💰 Profit: $${result.profit?.toFixed(2)}`);
          } else {
            console.log(`❌ Trade failed: ${result.error}`);
          }
        }
      }
      
    } catch (error) {
      console.error(`Error in block ${blockNumber}:`, error);
    }
  }

  private async findArbitrageOpportunities(blockNumber: number): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];
    
    // Check all token pairs across all DEXes
    const tokens = Object.keys(this.TOKEN_ADDRESSES);
    
    for (let i = 0; i < tokens.length; i++) {
      for (let j = i + 1; j < tokens.length; j++) {
        const tokenA = tokens[i];
        const tokenB = tokens[j];
        
        try {
          const prices = await this.fetchDEXPrices(tokenA, tokenB, blockNumber);
          
          if (prices.length >= 2) {
            const arb = this.calculateArbitrage(tokenA, tokenB, prices, blockNumber);
            if (arb && arb.profitUSD > 0) {
              opportunities.push(arb);
            }
          }
        } catch (error) {
          // Skip pairs that don't exist on DEXes
          continue;
        }
      }
    }
    
    return opportunities;
  }

  private async fetchDEXPrices(tokenA: string, tokenB: string, blockNumber: number): Promise<Array<{dex: string, price: number}>> {
    const prices: Array<{dex: string, price: number}> = [];
    const tokenAAddress = this.TOKEN_ADDRESSES[tokenA as keyof typeof this.TOKEN_ADDRESSES];
    const tokenBAddress = this.TOKEN_ADDRESSES[tokenB as keyof typeof this.TOKEN_ADDRESSES];
    
    const testAmount = ethers.parseUnits('1', 18);
    
    for (const [dexName, routerAddress] of Object.entries(this.DEX_ROUTERS)) {
      try {
        const router = new ethers.Contract(routerAddress, this.ROUTER_ABI, this.provider);
        const path = [tokenAAddress, tokenBAddress];
        
        const amounts = await router.getAmountsOut(testAmount, path, { blockTag: blockNumber });
        const price = Number(ethers.formatUnits(amounts[1], 18));
        
        if (price > 0) {
          prices.push({ dex: dexName, price });
        }
      } catch (error) {
        // DEX doesn't have this pair
        continue;
      }
    }
    
    return prices;
  }

  private calculateArbitrage(
    tokenA: string, 
    tokenB: string, 
    prices: Array<{dex: string, price: number}>, 
    blockNumber: number
  ): ArbitrageOpportunity | null {
    
    // Find best buy and sell prices
    let buyQuote = prices[0];
    let sellQuote = prices[0];
    
    for (const quote of prices) {
      if (quote.price < buyQuote.price) buyQuote = quote;
      if (quote.price > sellQuote.price) sellQuote = quote;
    }
    
    const priceDiff = sellQuote.price - buyQuote.price;
    const percentDiff = (priceDiff / buyQuote.price) * 100;
    
    // Only consider opportunities with > 0.1% price difference
    if (percentDiff <= 0.1) return null;
    
    // Calculate optimal flashloan amount
    const flashloanETH = Math.min(this.MAX_FLASHLOAN_ETH, Math.max(this.MIN_FLASHLOAN_ETH, priceDiff * 100));
    
    // Calculate profit
    const grossProfitETH = flashloanETH * priceDiff;
    const ethPriceUSD = 3400; // Could fetch live price
    const grossProfitUSD = grossProfitETH * ethPriceUSD;
    
    // Calculate costs
    const gasUnits = 350000;
    const gasPriceGwei = 0.1; // Base network
    const gasCostETH = (gasUnits * gasPriceGwei * 1e9) / 1e18;
    const gasCostUSD = gasCostETH * ethPriceUSD;
    
    const flashloanFeeUSD = flashloanETH * 0.0005 * ethPriceUSD; // 0.05% fee
    
    const netProfitUSD = grossProfitUSD - gasCostUSD - flashloanFeeUSD;
    
    return {
      tokenA,
      tokenB,
      buyDex: buyQuote.dex,
      sellDex: sellQuote.dex,
      buyPrice: buyQuote.price,
      sellPrice: sellQuote.price,
      profitUSD: netProfitUSD,
      flashloanAmount: flashloanETH.toFixed(4),
      gasEstimate: gasUnits,
      blockNumber,
      timestamp: new Date()
    };
  }

  private async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<ExecutionResult> {
    try {
      // Check gas price
      const gasPrice = await this.provider.getFeeData();
      const gasPriceGwei = Number(ethers.formatUnits(gasPrice.gasPrice || 0n, 'gwei'));
      
      if (gasPriceGwei > this.MAX_GAS_PRICE_GWEI) {
        return { success: false, error: `Gas price too high: ${gasPriceGwei} gwei` };
      }
      
      // Check wallet balance
      const balance = await this.wallet.provider.getBalance(this.wallet.address);
      const requiredETH = ethers.parseEther('0.001'); // Minimum for gas
      
      if (balance < requiredETH) {
        return { success: false, error: `Insufficient ETH balance: ${ethers.formatEther(balance)}` };
      }
      
      // Execute arbitrage transaction
      const contract = new ethers.Contract(this.contractAddress, this.CONTRACT_ABI, this.wallet);
      
      const tokenAAddress = this.TOKEN_ADDRESSES[opportunity.tokenA as keyof typeof this.TOKEN_ADDRESSES];
      const tokenBAddress = this.TOKEN_ADDRESSES[opportunity.tokenB as keyof typeof this.TOKEN_ADDRESSES];
      const amountIn = ethers.parseEther(opportunity.flashloanAmount);
      const buyDexAddress = this.DEX_ROUTERS[opportunity.buyDex as keyof typeof this.DEX_ROUTERS];
      const sellDexAddress = this.DEX_ROUTERS[opportunity.sellDex as keyof typeof this.DEX_ROUTERS];
      const minProfit = ethers.parseEther((opportunity.profitUSD / 3400).toFixed(6)); // Convert USD to ETH
      
      const tx = await contract.executeArbitrage(
        tokenAAddress,
        tokenBAddress,
        amountIn,
        buyDexAddress,
        sellDexAddress,
        minProfit,
        {
          gasLimit: opportunity.gasEstimate,
          gasPrice: gasPrice.gasPrice
        }
      );
      
      console.log(`📤 Transaction submitted: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait();
      
      if (receipt && receipt.status === 1) {
        return {
          success: true,
          txHash: tx.hash,
          profit: opportunity.profitUSD
        };
      } else {
        return { success: false, error: 'Transaction reverted' };
      }
      
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  private broadcastOpportunity(opportunity: ArbitrageOpportunity, result: ExecutionResult) {
    if (this.clients.size === 0) return;
    
    const message = JSON.stringify({
      type: 'arbitrage_execution',
      data: {
        opportunity,
        result,
        timestamp: new Date().toISOString()
      }
    });
    
    this.clients.forEach(client => {
      try {
        if (client.readyState === 1) {
          client.send(message);
        }
      } catch (error) {
        this.clients.delete(client);
      }
    });
  }

  private broadcastStatus(status: string, data: any) {
    if (this.clients.size === 0) return;
    
    const message = JSON.stringify({
      type: 'automation_status',
      status,
      data,
      timestamp: new Date().toISOString()
    });
    
    this.clients.forEach(client => {
      try {
        if (client.readyState === 1) {
          client.send(message);
        }
      } catch (error) {
        this.clients.delete(client);
      }
    });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      wallet: this.wallet.address,
      contractAddress: this.contractAddress
    };
  }
}

export const automatedArbitrage = new AutomatedArbitrage();