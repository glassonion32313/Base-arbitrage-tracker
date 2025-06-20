import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Play, Square, Activity, TrendingUp, Clock, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useWebSocket, useWebSocketData } from "@/hooks/use-websocket";

interface MonitorStatus {
  monitoring: boolean;
  updateInterval: number;
  activeSources: number;
  totalSources: number;
}

export default function MonitoringDashboard() {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [contractInfo, setContractInfo] = useState<any>(null);
  const [gasPrices, setGasPrices] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchInitialData();
  }, []);

  // WebSocket connection for real-time updates
  const { isConnected, lastMessage, connectionStatus } = useWebSocket();

  // Listen for WebSocket updates
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'connected':
          if (lastMessage.contractAddress) {
            setContractInfo({ address: lastMessage.contractAddress, network: 'Base', chainId: 8453 });
          }
          break;
        case 'gas_update':
          if (lastMessage.data) {
            setGasPrices(lastMessage.data);
          }
          break;
        case 'monitor_status':
          if (lastMessage.data) {
            setStatus(lastMessage.data);
          }
          break;
      }
    }
  }, [lastMessage]);

  const fetchInitialData = async () => {
    // Fetch initial data only once on component mount
    try {
      const [statusResponse, contractResponse, gasResponse] = await Promise.all([
        fetch("/api/monitor/status"),
        fetch("/api/contract/address"),
        fetch("/api/contract/gas")
      ]);
      
      const statusData = await statusResponse.json();
      const contractData = await contractResponse.json();
      const gasData = await gasResponse.json();
      
      setStatus(statusData);
      setContractInfo(contractData);
      setGasPrices(gasData);
    } catch (error) {
      console.error("Failed to fetch initial data:", error);
    }
  };

  const startMonitoring = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/monitor/start", {
        method: "POST"
      });
      
      if (response.ok) {
        toast({
          title: "Monitoring Started",
          description: "Real-time price monitoring is now active",
          variant: "default"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start monitoring",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const stopMonitoring = async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/monitor/stop", {
        method: "POST"
      });
      
      if (response.ok) {
        toast({
          title: "Monitoring Stopped",
          description: "Price monitoring has been disabled",
          variant: "default"
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to stop monitoring",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Price Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-muted-foreground">Loading status...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Price Monitoring
            </div>
            <Badge 
              variant={status.monitoring ? "default" : "secondary"}
              className={status.monitoring ? "bg-green-600 hover:bg-green-700" : ""}
            >
              {status.monitoring ? "Active" : "Inactive"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Real-time arbitrage opportunity detection across multiple DEXs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Control Buttons */}
          <div className="flex gap-3">
            {!status.monitoring ? (
              <Button 
                onClick={startMonitoring} 
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <Play className="h-4 w-4" />
                Start Monitoring
              </Button>
            ) : (
              <Button 
                onClick={stopMonitoring} 
                disabled={isLoading}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Square className="h-4 w-4" />
                Stop Monitoring
              </Button>
            )}
            
            <div className="flex items-center space-x-2 ml-auto">
              <Switch
                id="auto-refresh"
                checked={autoRefresh}
                onCheckedChange={setAutoRefresh}
              />
              <Label htmlFor="auto-refresh" className="text-sm">
                Auto-refresh
              </Label>
            </div>
          </div>

          <Separator />

          {/* Status Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-medium">Update Interval</div>
                <div className="text-xs text-muted-foreground">
                  {status.updateInterval / 1000}s
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <div className="text-sm font-medium">Active Sources</div>
                <div className="text-xs text-muted-foreground">
                  {status.activeSources} of {status.totalSources}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <div className="text-sm font-medium">Gas Price</div>
                <div className="text-xs text-muted-foreground">
                  {gasPrices ? `${parseFloat(gasPrices.standard).toFixed(1)} Gwei` : 'Loading...'}
                </div>
              </div>
            </div>
          </div>

          {/* Contract Information */}
          {contractInfo && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-base font-semibold">ArbitrageBot Contract</h3>
                <div className="bg-muted/30 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Contract Address:</span>
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                      {contractInfo.address}
                    </code>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Network:</span>
                    <span className="text-sm">{contractInfo.network}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Chain ID:</span>
                    <span className="text-sm">{contractInfo.chainId}</span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Gas Price Details */}
          {gasPrices && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-base font-semibold">Current Gas Prices</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3 text-center">
                    <div className="text-sm text-green-600 dark:text-green-400 font-medium">Standard</div>
                    <div className="text-lg font-bold">{parseFloat(gasPrices.standard).toFixed(1)} Gwei</div>
                  </div>
                  <div className="bg-yellow-50 dark:bg-yellow-950 rounded-lg p-3 text-center">
                    <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Fast</div>
                    <div className="text-lg font-bold">{parseFloat(gasPrices.fast).toFixed(1)} Gwei</div>
                  </div>
                  <div className="bg-red-50 dark:bg-red-950 rounded-lg p-3 text-center">
                    <div className="text-sm text-red-600 dark:text-red-400 font-medium">Instant</div>
                    <div className="text-lg font-bold">{parseFloat(gasPrices.instant).toFixed(1)} Gwei</div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Monitoring Description */}
          {status.monitoring && (
            <div className="p-4 bg-muted rounded-lg">
              <div className="text-sm">
                <strong>Active Monitoring:</strong> Scanning prices across Uniswap V3, SushiSwap, and BaseSwap 
                every {status.updateInterval / 1000} seconds. New arbitrage opportunities are automatically 
                detected and added to your dashboard.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Monitoring Configuration</CardTitle>
          <CardDescription>
            Customize how the price monitoring system operates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Minimum Profit Threshold</Label>
              <div className="text-xs text-muted-foreground">$5.00 minimum net profit</div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Monitored Pairs</Label>
              <div className="text-xs text-muted-foreground">
                WETH/USDC, WBTC/USDT, LINK/USDT, UNI/USDC, AAVE/USDT
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Data Sources</Label>
              <div className="text-xs text-muted-foreground">
                Uniswap V3, SushiSwap, BaseSwap (Base Network)
              </div>
            </div>
            
            <div className="space-y-2">
              <Label className="text-sm font-medium">Stale Data Cleanup</Label>
              <div className="text-xs text-muted-foreground">
                Opportunities older than 5 minutes are automatically removed
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}