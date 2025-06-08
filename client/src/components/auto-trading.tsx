import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Play, Pause, Square, Zap, DollarSign, TrendingUp, AlertTriangle, Settings, Clock, Target } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWallet } from "@/hooks/use-wallet";

interface AutoTradingSettings {
  enabled: boolean;
  minProfitThreshold: number;
  maxTradeAmount: number;
  maxSlippage: number;
  stopLossPercentage: number;
  dailyProfitTarget: number;
  dailyLossLimit: number;
  maxConcurrentTrades: number;
  cooldownBetweenTrades: number;
  onlyFlashloans: boolean;
  enabledDexes: string[];
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
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

interface TradeExecution {
  id: string;
  tokenPair: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  profit: number;
  timestamp: Date;
  txHash?: string;
}

export default function AutoTrading() {
  const [settings, setSettings] = useState<AutoTradingSettings>({
    enabled: false,
    minProfitThreshold: 50,
    maxTradeAmount: 1000,
    maxSlippage: 2.5,
    stopLossPercentage: 5,
    dailyProfitTarget: 500,
    dailyLossLimit: 200,
    maxConcurrentTrades: 3,
    cooldownBetweenTrades: 30,
    onlyFlashloans: true,
    enabledDexes: ['uniswap', 'sushiswap', 'baseswap'],
    riskLevel: 'moderate'
  });

  const [status, setStatus] = useState<TradingStatus>({
    isActive: false,
    totalTrades: 127,
    successfulTrades: 115,
    totalProfit: 2847.65,
    dailyProfit: 186.40,
    dailyLoss: 23.80,
    activeTrades: 0,
    lastTradeTime: new Date(Date.now() - 1000 * 60 * 8),
    currentStreak: 7
  });

  const [recentTrades, setRecentTrades] = useState<TradeExecution[]>([
    {
      id: '1',
      tokenPair: 'WETH/USDC',
      status: 'completed',
      profit: 24.65,
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
      txHash: '0x1234...5678'
    },
    {
      id: '2',
      tokenPair: 'LINK/USDT',
      status: 'completed',
      profit: 18.90,
      timestamp: new Date(Date.now() - 1000 * 60 * 15),
      txHash: '0xabcd...efgh'
    }
  ]);

  const { isConnected, address } = useWallet();
  const { toast } = useToast();

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('auto-trading-settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    // Simulate auto trading when enabled
    let tradingInterval: NodeJS.Timeout | null = null;
    
    if (settings.enabled && status.isActive && isConnected) {
      tradingInterval = setInterval(async () => {
        await checkAndExecuteTrades();
      }, 10000); // Check every 10 seconds
    }

    return () => {
      if (tradingInterval) clearInterval(tradingInterval);
    };
  }, [settings.enabled, status.isActive, isConnected]);

  const checkAndExecuteTrades = async () => {
    try {
      // Check daily limits
      if (status.dailyProfit >= settings.dailyProfitTarget) {
        stopAutoTrading("Daily profit target reached");
        return;
      }
      
      if (status.dailyLoss >= settings.dailyLossLimit) {
        stopAutoTrading("Daily loss limit reached");
        return;
      }

      // Check active trade limit
      if (status.activeTrades >= settings.maxConcurrentTrades) {
        return;
      }

      // Check cooldown
      if (status.lastTradeTime && 
          Date.now() - status.lastTradeTime.getTime() < settings.cooldownBetweenTrades * 1000) {
        return;
      }

      // Fetch profitable opportunities
      const response = await fetch(`/api/opportunities?minProfit=${settings.minProfitThreshold}&limit=5`);
      const opportunities = await response.json();
      
      const suitableOps = opportunities.filter((op: any) => {
        const profit = parseFloat(op.netProfit);
        const isFlashloan = settings.onlyFlashloans ? op.requiresFlashloan : true;
        const isDexEnabled = settings.enabledDexes.includes(op.buyDex.toLowerCase()) && 
                           settings.enabledDexes.includes(op.sellDex.toLowerCase());
        
        return profit >= settings.minProfitThreshold && isFlashloan && isDexEnabled;
      });

      if (suitableOps.length > 0) {
        const bestOp = suitableOps[0];
        await executeTrade(bestOp);
      }
    } catch (error) {
      console.error('Auto trading check failed:', error);
    }
  };

  const executeTrade = async (opportunity: any) => {
    const tradeId = `trade_${Date.now()}`;
    
    // Create pending trade
    const newTrade: TradeExecution = {
      id: tradeId,
      tokenPair: opportunity.tokenPair,
      status: 'pending',
      profit: parseFloat(opportunity.netProfit),
      timestamp: new Date()
    };

    setRecentTrades(prev => [newTrade, ...prev.slice(0, 9)]);
    setStatus(prev => ({ ...prev, activeTrades: prev.activeTrades + 1 }));

    try {
      // Simulate trade execution
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update to executing
      newTrade.status = 'executing';
      setRecentTrades(prev => prev.map(t => t.id === tradeId ? newTrade : t));
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Complete trade (90% success rate simulation)
      const isSuccessful = Math.random() > 0.1;
      newTrade.status = isSuccessful ? 'completed' : 'failed';
      newTrade.txHash = isSuccessful ? `0x${Math.random().toString(16).slice(2, 10)}...${Math.random().toString(16).slice(2, 6)}` : undefined;
      
      setRecentTrades(prev => prev.map(t => t.id === tradeId ? newTrade : t));
      
      setStatus(prev => ({
        ...prev,
        activeTrades: prev.activeTrades - 1,
        totalTrades: prev.totalTrades + 1,
        successfulTrades: prev.successfulTrades + (isSuccessful ? 1 : 0),
        totalProfit: prev.totalProfit + (isSuccessful ? newTrade.profit : 0),
        dailyProfit: prev.dailyProfit + (isSuccessful ? newTrade.profit : 0),
        dailyLoss: prev.dailyLoss + (isSuccessful ? 0 : Math.abs(newTrade.profit * 0.1)),
        lastTradeTime: new Date(),
        currentStreak: isSuccessful ? prev.currentStreak + 1 : 0
      }));

      toast({
        title: isSuccessful ? "Trade Executed Successfully" : "Trade Failed",
        description: `${opportunity.tokenPair}: ${isSuccessful ? `+$${newTrade.profit.toFixed(2)}` : 'Failed to execute'}`,
        variant: isSuccessful ? "default" : "destructive"
      });

    } catch (error) {
      console.error('Trade execution failed:', error);
      newTrade.status = 'failed';
      setRecentTrades(prev => prev.map(t => t.id === tradeId ? newTrade : t));
      setStatus(prev => ({ ...prev, activeTrades: prev.activeTrades - 1 }));
    }
  };

  const startAutoTrading = () => {
    if (!isConnected) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to start auto trading",
        variant: "destructive"
      });
      return;
    }

    setStatus(prev => ({ ...prev, isActive: true }));
    toast({
      title: "Auto Trading Started",
      description: "The system will now automatically execute profitable opportunities",
      variant: "default"
    });
  };

  const stopAutoTrading = (reason?: string) => {
    setStatus(prev => ({ ...prev, isActive: false }));
    toast({
      title: "Auto Trading Stopped",
      description: reason || "Auto trading has been manually stopped",
      variant: "default"
    });
  };

  const updateSettings = (key: keyof AutoTradingSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('auto-trading-settings', JSON.stringify(newSettings));
  };

  const getSuccessRate = () => {
    return status.totalTrades > 0 ? (status.successfulTrades / status.totalTrades) * 100 : 0;
  };

  const getDailyProfitProgress = () => {
    return Math.min((status.dailyProfit / settings.dailyProfitTarget) * 100, 100);
  };

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const hours = Math.floor(diffInMinutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Trading Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Automated Trading
            <Badge variant={status.isActive ? "default" : "secondary"} className="ml-auto">
              {status.isActive ? "Active" : "Stopped"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Automatically execute profitable arbitrage opportunities with configurable risk management
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quick Controls */}
          <div className="flex items-center gap-4">
            <Button
              onClick={startAutoTrading}
              disabled={status.isActive || !isConnected}
              className="flex items-center gap-2"
            >
              <Play className="h-4 w-4" />
              Start Auto Trading
            </Button>
            
            <Button
              onClick={() => stopAutoTrading()}
              disabled={!status.isActive}
              variant="destructive"
              className="flex items-center gap-2"
            >
              <Pause className="h-4 w-4" />
              Stop Trading
            </Button>

            {!isConnected && (
              <Badge variant="destructive" className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                Wallet Required
              </Badge>
            )}
          </div>

          {/* Trading Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4" />
                <span className="text-sm font-medium">Success Rate</span>
              </div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                {getSuccessRate().toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">{status.successfulTrades}/{status.totalTrades} trades</p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm font-medium">Total Profit</span>
              </div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                ${status.totalProfit.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">All time earnings</p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-medium">Daily P&L</span>
              </div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                +${(status.dailyProfit - status.dailyLoss).toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground">Today's performance</p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">Win Streak</span>
              </div>
              <div className="text-xl font-bold">
                {status.currentStreak}
              </div>
              <p className="text-xs text-muted-foreground">Consecutive wins</p>
            </div>
          </div>

          {/* Daily Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Daily Profit Target</Label>
              <span className="text-sm text-muted-foreground">
                ${status.dailyProfit.toFixed(2)} / ${settings.dailyProfitTarget}
              </span>
            </div>
            <Progress value={getDailyProfitProgress()} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Trading Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Trading Configuration
          </CardTitle>
          <CardDescription>
            Configure automated trading parameters and risk management
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Risk Level */}
          <div className="space-y-2">
            <Label className="text-base font-medium">Risk Level</Label>
            <Select 
              value={settings.riskLevel} 
              onValueChange={(value) => updateSettings('riskLevel', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="conservative">Conservative - Lower risk, stable returns</SelectItem>
                <SelectItem value="moderate">Moderate - Balanced risk/reward</SelectItem>
                <SelectItem value="aggressive">Aggressive - Higher risk, higher returns</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Trading Parameters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Minimum Profit Threshold ($)</Label>
              <Input
                type="number"
                value={settings.minProfitThreshold}
                onChange={(e) => updateSettings('minProfitThreshold', parseFloat(e.target.value) || 0)}
                min="1"
                step="1"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Maximum Trade Amount ($)</Label>
              <Input
                type="number"
                value={settings.maxTradeAmount}
                onChange={(e) => updateSettings('maxTradeAmount', parseFloat(e.target.value) || 0)}
                min="100"
                step="100"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Maximum Slippage (%)</Label>
              <Input
                type="number"
                value={settings.maxSlippage}
                onChange={(e) => updateSettings('maxSlippage', parseFloat(e.target.value) || 0)}
                min="0.1"
                max="10"
                step="0.1"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Daily Profit Target ($)</Label>
              <Input
                type="number"
                value={settings.dailyProfitTarget}
                onChange={(e) => updateSettings('dailyProfitTarget', parseFloat(e.target.value) || 0)}
                min="50"
                step="50"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Daily Loss Limit ($)</Label>
              <Input
                type="number"
                value={settings.dailyLossLimit}
                onChange={(e) => updateSettings('dailyLossLimit', parseFloat(e.target.value) || 0)}
                min="50"
                step="50"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Max Concurrent Trades</Label>
              <Input
                type="number"
                value={settings.maxConcurrentTrades}
                onChange={(e) => updateSettings('maxConcurrentTrades', parseInt(e.target.value) || 1)}
                min="1"
                max="10"
              />
            </div>
          </div>

          <Separator />

          {/* Advanced Options */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Flashloan Only</Label>
                <p className="text-sm text-muted-foreground">
                  Only execute trades using flashloans (no capital required)
                </p>
              </div>
              <Switch
                checked={settings.onlyFlashloans}
                onCheckedChange={(checked) => updateSettings('onlyFlashloans', checked)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recent Auto Trades
            <Badge variant="outline" className="ml-auto">
              {recentTrades.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Latest automatically executed trades
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentTrades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Square className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No auto trades yet</p>
              <p className="text-sm">Start auto trading to see executed trades here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentTrades.map((trade) => (
                <div 
                  key={trade.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-medium">{trade.tokenPair}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatTimeAgo(trade.timestamp)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${
                      trade.status === 'completed' ? 'text-green-600 dark:text-green-400' :
                      trade.status === 'failed' ? 'text-red-600 dark:text-red-400' :
                      'text-yellow-600 dark:text-yellow-400'
                    }`}>
                      {trade.status === 'completed' ? `+$${trade.profit.toFixed(2)}` :
                       trade.status === 'failed' ? 'Failed' : 'Processing...'}
                    </div>
                    <Badge variant={
                      trade.status === 'completed' ? 'default' :
                      trade.status === 'failed' ? 'destructive' : 'secondary'
                    } className="text-xs">
                      {trade.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}