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

interface MonitorStatus {
  monitoring: boolean;
  updateInterval: number;
  activeSources: number;
  totalSources: number;
}

export default function MonitoringDashboard() {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchStatus();
    
    if (autoRefresh) {
      const interval = setInterval(fetchStatus, 5000); // Update every 5 seconds
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  const fetchStatus = async () => {
    try {
      const response = await fetch("/api/monitor/status");
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error("Failed to fetch monitor status:", error);
    }
  };

  const startMonitoring = async () => {
    setIsLoading(true);
    try {
      const response = await apiRequest("/api/monitor/start", {
        method: "POST"
      });
      
      toast({
        title: "Monitoring Started",
        description: "Real-time price monitoring is now active",
        variant: "default"
      });
      
      await fetchStatus();
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
      const response = await apiRequest("/api/monitor/stop", {
        method: "POST"
      });
      
      toast({
        title: "Monitoring Stopped",
        description: "Price monitoring has been disabled",
        variant: "default"
      });
      
      await fetchStatus();
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
                <div className="text-sm font-medium">Status</div>
                <div className={`text-xs ${status.monitoring ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}>
                  {status.monitoring ? 'Scanning...' : 'Stopped'}
                </div>
              </div>
            </div>
          </div>

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