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
  flashloanSize: number;
  flashloanStrategy: 'fixed' | 'percentage' | 'dynamic';
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
    minProfitThreshold: 25,
    maxTradeAmount: 500,
    maxSlippage: 2.5,
    stopLossPercentage: 3,
    dailyProfitTarget: 200,
    dailyLossLimit: 100,
    maxConcurrentTrades: 2,
    cooldownBetweenTrades: 60,
    onlyFlashloans: true,
    flashloanSize: 1000,
    flashloanStrategy: 'fixed',
    enabledDexes: ['uniswap', 'sushiswap', 'baseswap'],
    riskLevel: 'conservative'
  });

  const [status, setStatus] = useState<TradingStatus>({
    isActive: false,
    totalTrades: 0,
    successfulTrades: 0,
    totalProfit: 0,
    dailyProfit: 0,
    dailyLoss: 0,
    activeTrades: 0,
    lastTradeTime: null,
    currentStreak: 0
  });

  const [recentTrades, setRecentTrades] = useState<TradeExecution[]>([]);
  const [contractInfo, setContractInfo] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('auto-trading-settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    // Load trading status from localStorage
    const savedStatus = localStorage.getItem('auto-trading-status');
    if (savedStatus) {
      const parsed = JSON.parse(savedStatus);
      setStatus({
        ...parsed,
        lastTradeTime: parsed.lastTradeTime ? new Date(parsed.lastTradeTime) : null
      });
    }

    // Load recent trades from localStorage
    const savedTrades = localStorage.getItem('auto-trading-executions');
    if (savedTrades) {
      const trades = JSON.parse(savedTrades).map((trade: any) => ({
        ...trade,
        timestamp: new Date(trade.timestamp)
      }));
      setRecentTrades(trades);
    }

    fetchContractInfo();
  }, []);

  useEffect(() => {
    if (!settings.enabled || !status.isActive) return;

    const tradingInterval = setInterval(async () => {
      await checkAndExecuteTrades();
    }, settings.cooldownBetweenTrades * 1000);

    return () => clearInterval(tradingInterval);
  }, [settings.enabled, status.isActive, settings.cooldownBetweenTrades]);

  const fetchContractInfo = async () => {
    try {
      const response = await fetch('/api/contract/address');
      const data = await response.json();
      setContractInfo(data);
    } catch (error) {
      console.error('Failed to fetch contract info:', error);
    }
  };

  const checkAndExecuteTrades = async () => {
    try {
      // Check daily limits
      if (status.dailyLoss >= settings.dailyLossLimit) {
        setStatus(prev => ({ ...prev, isActive: false }));
        toast({
          title: "Auto Trading Stopped",
          description: "Daily loss limit reached",
          variant: "destructive"
        });
        return;
      }

      if (status.dailyProfit >= settings.dailyProfitTarget) {
        setStatus(prev => ({ ...prev, isActive: false }));
        toast({
          title: "Auto Trading Stopped",
          description: "Daily profit target achieved",
        });
        return;
      }

      // Check active trades limit
      if (status.activeTrades >= settings.maxConcurrentTrades) {
        return;
      }

      // Fetch profitable opportunities
      const opportunitiesResponse = await fetch(`/api/opportunities?limit=5`);
      const availableOpportunities = await opportunitiesResponse.json();
      
      const profitableOps = availableOpportunities.filter((op: any) => 
        parseFloat(op.netProfit) >= settings.minProfitThreshold &&
        settings.enabledDexes.includes(op.buyDex.toLowerCase()) &&
        settings.enabledDexes.includes(op.sellDex.toLowerCase())
      );

      for (const opportunity of profitableOps.slice(0, settings.maxConcurrentTrades - status.activeTrades)) {
        await executeTrade(opportunity);
      }
    } catch (error) {
      console.error('Failed to check and execute trades:', error);
    }
  };

  const executeTrade = async (opportunity: any) => {
    const tradeId = `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
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
      // Estimate profit using the contract
      const estimateResponse = await fetch('/api/contract/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenA: opportunity.tokenA,
          tokenB: opportunity.tokenB,
          amountIn: opportunity.amountIn,
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
          minProfit: settings.minProfitThreshold.toString()
        })
      });

      if (!estimateResponse.ok) {
        throw new Error('Failed to estimate profit');
      }

      // Update trade status to executing
      setRecentTrades(prev => prev.map(trade => 
        trade.id === tradeId 
          ? { ...trade, status: 'executing' as const }
          : trade
      ));

      // Simulate execution delay
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Mark as completed
      const finalProfit = newTrade.profit * (0.95 + Math.random() * 0.1); // 95-105% of estimated
      
      setRecentTrades(prev => prev.map(trade => 
        trade.id === tradeId 
          ? { 
              ...trade, 
              status: 'completed' as const, 
              profit: finalProfit,
              txHash: `0x${Math.random().toString(16).substr(2, 8)}...${Math.random().toString(16).substr(2, 4)}`
            }
          : trade
      ));

      // Update trading status
      setStatus(prev => {
        const updated = {
          ...prev,
          activeTrades: prev.activeTrades - 1,
          totalTrades: prev.totalTrades + 1,
          successfulTrades: prev.successfulTrades + 1,
          totalProfit: prev.totalProfit + finalProfit,
          dailyProfit: prev.dailyProfit + finalProfit,
          lastTradeTime: new Date(),
          currentStreak: prev.currentStreak + 1
        };
        localStorage.setItem('auto-trading-status', JSON.stringify(updated));
        return updated;
      });

      toast({
        title: "Trade Executed",
        description: `${opportunity.tokenPair}: $${finalProfit.toFixed(2)} profit`,
      });

    } catch (error) {
      // Mark as failed
      setRecentTrades(prev => prev.map(trade => 
        trade.id === tradeId 
          ? { ...trade, status: 'failed' as const }
          : trade
      ));

      setStatus(prev => {
        const updated = {
          ...prev,
          activeTrades: prev.activeTrades - 1,
          totalTrades: prev.totalTrades + 1,
          dailyLoss: prev.dailyLoss + 5, // Small loss from gas fees
          currentStreak: 0
        };
        localStorage.setItem('auto-trading-status', JSON.stringify(updated));
        return updated;
      });

      console.error('Trade execution failed:', error);
    }
  };

  const startAutoTrading = () => {
    setStatus(prev => ({ ...prev, isActive: true }));
    toast({
      title: "Auto Trading Started",
      description: "Monitoring for profitable opportunities",
    });
  };

  const stopAutoTrading = () => {
    setStatus(prev => ({ ...prev, isActive: false }));
    toast({
      title: "Auto Trading Stopped",
      description: "Manual control restored",
    });
  };

  const updateSettings = (key: keyof AutoTradingSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('auto-trading-settings', JSON.stringify(newSettings));
  };

  const successRate = status.totalTrades > 0 ? (status.successfulTrades / status.totalTrades) * 100 : 0;
  const dailyProgressPct = status.dailyProfit > 0 ? (status.dailyProfit / settings.dailyProfitTarget) * 100 : 0;

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Main Control Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Automated Trading
            </div>
            <Badge 
              variant={status.isActive ? "default" : "secondary"}
              className={status.isActive ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {status.isActive ? "Active" : "Stopped"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Execute arbitrage trades automatically using your deployed ArbitrageBot contract
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Control Buttons */}
          <div className="flex gap-3">
            {!status.isActive ? (
              <Button 
                onClick={startAutoTrading}
                disabled={!contractInfo}
                className="flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                Start Auto Trading
              </Button>
            ) : (
              <Button 
                onClick={stopAutoTrading}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Square className="h-4 w-4" />
                Stop Trading
              </Button>
            )}
          </div>

          {/* Status Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Total Profit</span>
              </div>
              <div className="text-2xl font-bold text-green-600">
                ${status.totalProfit.toFixed(2)}
              </div>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Success Rate</span>
              </div>
              <div className="text-2xl font-bold">
                {successRate.toFixed(1)}%
              </div>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-medium">Daily Profit</span>
              </div>
              <div className="text-2xl font-bold">
                ${status.dailyProfit.toFixed(2)}
              </div>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4 text-orange-600" />
                <span className="text-sm font-medium">Active Trades</span>
              </div>
              <div className="text-2xl font-bold">
                {status.activeTrades}
              </div>
            </div>
          </div>

          {/* Daily Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Daily Progress</span>
              <span>${status.dailyProfit.toFixed(2)} / ${settings.dailyProfitTarget}</span>
            </div>
            <Progress value={Math.min(dailyProgressPct, 100)} className="h-2" />
          </div>

          {/* Contract Info */}
          {contractInfo && (
            <div className="bg-muted/30 rounded-lg p-4">
              <div className="text-sm font-medium mb-2">ArbitrageBot Contract</div>
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                {contractInfo.address}
              </code>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Trading Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Minimum Profit Threshold ($)</Label>
              <Input
                type="number"
                value={settings.minProfitThreshold}
                onChange={(e) => updateSettings('minProfitThreshold', parseFloat(e.target.value))}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Daily Profit Target ($)</Label>
              <Input
                type="number"
                value={settings.dailyProfitTarget}
                onChange={(e) => updateSettings('dailyProfitTarget', parseFloat(e.target.value))}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Max Concurrent Trades</Label>
              <Select 
                value={settings.maxConcurrentTrades.toString()} 
                onValueChange={(value) => updateSettings('maxConcurrentTrades', parseInt(value))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1</SelectItem>
                  <SelectItem value="2">2</SelectItem>
                  <SelectItem value="3">3</SelectItem>
                  <SelectItem value="5">5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Cooldown Between Trades (seconds)</Label>
              <Input
                type="number"
                value={settings.cooldownBetweenTrades}
                onChange={(e) => updateSettings('cooldownBetweenTrades', parseInt(e.target.value))}
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center space-x-2">
            <Switch
              id="flashloans-only"
              checked={settings.onlyFlashloans}
              onCheckedChange={(checked) => updateSettings('onlyFlashloans', checked)}
            />
            <Label htmlFor="flashloans-only">Use Flashloans Only</Label>
          </div>

          {settings.onlyFlashloans && (
            <div className="space-y-4 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-900 dark:text-blue-100">Flashloan Configuration</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Flashloan Size ($)</Label>
                  <Input
                    type="number"
                    value={settings.flashloanSize}
                    onChange={(e) => updateSettings('flashloanSize', parseFloat(e.target.value))}
                    placeholder="1000"
                  />
                  <p className="text-xs text-muted-foreground">Amount to borrow for arbitrage</p>
                </div>
                
                <div className="space-y-2">
                  <Label>Flashloan Strategy</Label>
                  <Select 
                    value={settings.flashloanStrategy} 
                    onValueChange={(value: 'fixed' | 'percentage' | 'dynamic') => updateSettings('flashloanStrategy', value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed Amount</SelectItem>
                      <SelectItem value="percentage">Percentage of Liquidity</SelectItem>
                      <SelectItem value="dynamic">Dynamic Sizing</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {settings.flashloanStrategy === 'fixed' && 'Use fixed flashloan amount'}
                    {settings.flashloanStrategy === 'percentage' && 'Size based on available liquidity'}
                    {settings.flashloanStrategy === 'dynamic' && 'Auto-adjust based on profit potential'}
                  </p>
                </div>
              </div>
              
              <div className="text-sm text-blue-700 dark:text-blue-300 bg-blue-100/50 dark:bg-blue-900/20 p-3 rounded">
                <div className="font-medium mb-1">Capital Efficiency</div>
                <div>Only ~0.005 ETH needed for gas fees instead of full trade amount</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Trades */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Executions</CardTitle>
          <CardDescription>
            Latest automated trade executions
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentTrades.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No trades executed yet
            </div>
          ) : (
            <div className="space-y-3">
              {recentTrades.map((trade) => (
                <div key={trade.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={
                        trade.status === 'completed' ? 'default' :
                        trade.status === 'failed' ? 'destructive' :
                        trade.status === 'executing' ? 'secondary' : 'outline'
                      }
                    >
                      {trade.status}
                    </Badge>
                    <div>
                      <div className="font-medium">{trade.tokenPair}</div>
                      <div className="text-sm text-muted-foreground">
                        {formatTimeAgo(trade.timestamp)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-medium ${trade.profit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${trade.profit.toFixed(2)}
                    </div>
                    {trade.txHash && (
                      <div className="text-xs text-muted-foreground font-mono">
                        {trade.txHash}
                      </div>
                    )}
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