import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import RealWalletConnect from "@/components/real-wallet-connect";
import ArbitrageTable from "@/components/arbitrage-table";
import StatsCards from "@/components/stats-cards";
import FiltersSidebar from "@/components/filters-sidebar";
import MonitoringDashboard from "@/components/monitoring-dashboard";
import NotificationCenter from "@/components/notification-center";
import MEVProtection from "@/components/mev-protection";
import AutoTrading from "@/components/auto-trading";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, TrendingUp, Activity, Bell, Shield, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWebSocketOpportunities } from "@/hooks/use-websocket";

export default function ArbitrageScanner() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filters, setFilters] = useState({
    minProfit: 5,
    selectedDexes: ["Uniswap V3", "SushiSwap", "BaseSwap"],
    gasPrice: "standard",
  });
  const { toast } = useToast();

  // WebSocket connection for real-time opportunities
  const { opportunities: wsOpportunities, newOpportunityCount, isConnected, lastMessage } = useWebSocketOpportunities();

  // Use WebSocket data when available, fallback to HTTP for initial load
  const { data: httpOpportunities = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/opportunities", filters.minProfit],
    enabled: !isConnected, // Only use HTTP when WebSocket not connected
    refetchInterval: false, // Disable polling in favor of WebSocket
  });

  // Use WebSocket for real-time stats updates
  const [stats, setStats] = useState<any>(null);
  
  const { data: initialStats } = useQuery<any>({
    queryKey: ["/api/stats"],
    enabled: !isConnected, // Only fetch initially when WebSocket not connected
    refetchInterval: false, // Disable polling
  });

  // Listen for WebSocket stats updates
  useEffect(() => {
    if (lastMessage) {
      if (lastMessage.type === 'stats_updated' && lastMessage.data) {
        setStats(lastMessage.data);
      }
    }
  }, [lastMessage]);

  // Use initial stats if WebSocket stats not available
  useEffect(() => {
    if (initialStats && !stats) {
      setStats(initialStats);
    }
  }, [initialStats, stats]);

  // Combine WebSocket and HTTP data
  const opportunities = isConnected && wsOpportunities.length > 0 ? wsOpportunities : httpOpportunities;

  const handleRefresh = async () => {
    await refetch();
    toast({
      title: "Data refreshed",
      description: "Arbitrage opportunities updated successfully",
    });
  };

  const handleAutoRefreshToggle = () => {
    setAutoRefresh(!autoRefresh);
    toast({
      title: autoRefresh ? "Auto-refresh disabled" : "Auto-refresh enabled",
      description: autoRefresh 
        ? "Manual refresh only" 
        : "Data will update every 30 seconds",
    });
  };

  return (
    <div className="min-h-screen bg-dark-bg text-slate-100">
      {/* Header */}
      <header className="bg-dark-secondary border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-primary-blue rounded-lg flex items-center justify-center">
                  <TrendingUp className="text-white w-4 h-4" />
                </div>
                <h1 className="text-xl font-bold text-white">Base Arbitrage Scanner</h1>
              </div>
              
              {/* Network Status */}
              <div className="flex items-center space-x-2 px-3 py-1 bg-dark-tertiary rounded-lg">
                <div className="w-2 h-2 bg-profit-green rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">Base Network</span>
                <span className="text-xs text-slate-400">Connected</span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              {/* Auto Refresh Toggle */}
              <div className="flex items-center space-x-2">
                <span className="text-sm text-slate-400">Auto-refresh</span>
                <Switch
                  checked={autoRefresh}
                  onCheckedChange={handleAutoRefreshToggle}
                />
                <span className="text-xs text-slate-400">30s</span>
              </div>

              {/* Manual Refresh */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>

              {/* Wallet Connection */}
              <RealWalletConnect />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Filters */}
          <div className="lg:col-span-1">
            <FiltersSidebar 
              filters={filters} 
              onFiltersChange={setFilters}
            />
          </div>

          {/* Main Content Area */}
          <div className="lg:col-span-3">
            <Tabs defaultValue="opportunities" className="space-y-6">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="opportunities" className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Opportunities
                </TabsTrigger>
                <TabsTrigger value="monitoring" className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Live Monitoring
                </TabsTrigger>
                <TabsTrigger value="alerts" className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  Alerts
                </TabsTrigger>
                <TabsTrigger value="protection" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  MEV Protection
                </TabsTrigger>
                <TabsTrigger value="auto" className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Auto Mode
                </TabsTrigger>
              </TabsList>

              <TabsContent value="opportunities" className="space-y-6">
                {/* Stats Cards */}
                <StatsCards stats={stats as any} />

                {/* Opportunities Table */}
                <ArbitrageTable 
                  opportunities={opportunities as any}
                  isLoading={isLoading}
                  onRefresh={handleRefresh}
                />
              </TabsContent>

              <TabsContent value="monitoring" className="space-y-6">
                <MonitoringDashboard />
              </TabsContent>

              <TabsContent value="alerts" className="space-y-6">
                <NotificationCenter />
              </TabsContent>

              <TabsContent value="protection" className="space-y-6">
                <MEVProtection />
              </TabsContent>

              <TabsContent value="auto" className="space-y-6">
                <AutoTrading />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}
