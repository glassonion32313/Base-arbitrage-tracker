import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import WalletConnect from "@/components/wallet-connect";
import ArbitrageTable from "@/components/arbitrage-table";
import StatsCards from "@/components/stats-cards";
import FiltersSidebar from "@/components/filters-sidebar";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function ArbitrageScanner() {
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filters, setFilters] = useState({
    minProfit: 5,
    selectedDexes: ["Uniswap V3", "SushiSwap", "BaseSwap"],
    gasPrice: "standard",
  });
  const { toast } = useToast();

  const { data: opportunities = [], isLoading, refetch } = useQuery({
    queryKey: ["/api/opportunities", filters.minProfit],
    enabled: true,
    refetchInterval: autoRefresh ? 30000 : false,
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
    refetchInterval: autoRefresh ? 30000 : false,
  });

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
              <WalletConnect />
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
            {/* Stats Cards */}
            <StatsCards stats={stats} />

            {/* Opportunities Table */}
            <ArbitrageTable 
              opportunities={opportunities}
              isLoading={isLoading}
              onRefresh={handleRefresh}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
