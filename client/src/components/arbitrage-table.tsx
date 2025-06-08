import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ArrowUpDown, ExternalLink, Trash2, Zap, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { ArbitrageOpportunity } from "@shared/schema";

interface ArbitrageTableProps {
  opportunities: ArbitrageOpportunity[];
  isLoading: boolean;
  onRefresh: () => void;
}

export default function ArbitrageTable({ opportunities, isLoading, onRefresh }: ArbitrageTableProps) {
  const [sortField, setSortField] = useState<keyof ArbitrageOpportunity>("estimatedProfit");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [isClearing, setIsClearing] = useState(false);
  const [flashloanEnabled, setFlashloanEnabled] = useState(true);
  const [executingOpportunities, setExecutingOpportunities] = useState<Set<number>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSort = (field: keyof ArbitrageOpportunity) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedOpportunities = [...opportunities].sort((a, b) => {
    const aValue = parseFloat(a[sortField] as string) || 0;
    const bValue = parseFloat(b[sortField] as string) || 0;
    return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
  });

  const getProfitBadgeVariant = (profit: string) => {
    const value = parseFloat(profit);
    if (value >= 30) return "profit-high";
    if (value >= 15) return "profit-medium";
    return "profit-low";
  };

  const getProfitBadgeClass = (profit: string) => {
    const value = parseFloat(profit);
    if (value >= 30) return "bg-profit-green bg-opacity-20 text-profit-green";
    if (value >= 15) return "bg-warning-amber bg-opacity-20 text-warning-amber";
    return "bg-slate-600 bg-opacity-20 text-slate-400";
  };

  const getProfitBadgeText = (profit: string) => {
    const value = parseFloat(profit);
    if (value >= 30) return "High";
    if (value >= 15) return "Medium";
    return "Low";
  };

  // Auto-execute arbitrage mutation - REAL BLOCKCHAIN TRANSACTIONS
  const executeArbitrageMutation = useMutation({
    mutationFn: async ({ opportunityId, useFlashloan }: { opportunityId: number; useFlashloan: boolean }) => {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        throw new Error('Authentication required');
      }
      
      const response = await fetch('/api/arbitrage/execute-auto', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ opportunityId, useFlashloan })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: (data, { opportunityId }) => {
      toast({
        title: "Real Blockchain Transaction Submitted",
        description: `Transaction Hash: ${data.txHash}. View on BaseScan: ${data.explorerUrl}`,
      });
      setExecutingOpportunities(prev => {
        const next = new Set(prev);
        next.delete(opportunityId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['/api/opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['/api/transactions'] });
    },
    onError: (error: any, { opportunityId }) => {
      const errorMessage = error.message || "Failed to execute arbitrage trade";
      
      if (errorMessage.includes("Private key not configured")) {
        toast({
          title: "Private Key Required",
          description: "Please add your private key in Account Settings first",
          variant: "destructive",
        });
      } else if (errorMessage.includes("No arbitrage opportunities")) {
        toast({
          title: "Opportunity Expired",
          description: "This opportunity is no longer available. New ones are detected every few seconds.",
          variant: "default",
        });
      } else {
        toast({
          title: "Execution Failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
      
      setExecutingOpportunities(prev => {
        const next = new Set(prev);
        next.delete(opportunityId);
        return next;
      });
    }
  });

  const handleExecuteArbitrage = async (opportunity: ArbitrageOpportunity) => {
    // Check authentication
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast({
        title: "Authentication Required",
        description: "Please log in to execute trades",
        variant: "destructive",
      });
      return;
    }

    setExecutingOpportunities(prev => new Set(prev).add(opportunity.id));
    executeArbitrageMutation.mutate({
      opportunityId: opportunity.id,
      useFlashloan: flashloanEnabled
    });
  };

  const handleClearStale = async () => {
    setIsClearing(true);
    try {
      const response = await fetch('/api/opportunities/stale?minutes=2', {
        method: 'DELETE'
      });
      const result = await response.json();
      
      toast({
        title: "Stale Opportunities Cleared",
        description: result.message,
        variant: "default"
      });
      
      onRefresh();
    } catch (error) {
      toast({
        title: "Clear Failed",
        description: "Failed to clear stale opportunities",
        variant: "destructive"
      });
    } finally {
      setIsClearing(false);
    }
  };

  const handleClearAll = async () => {
    setIsClearing(true);
    try {
      const response = await fetch('/api/opportunities/all', {
        method: 'DELETE'
      });
      const result = await response.json();
      
      toast({
        title: "All Opportunities Cleared",
        description: result.message,
        variant: "default"
      });
      
      onRefresh();
    } catch (error) {
      toast({
        title: "Clear Failed",
        description: "Failed to clear all opportunities",
        variant: "destructive"
      });
    } finally {
      setIsClearing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-dark-secondary rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-6 w-24" />
          </div>
        </div>
        <div className="p-6">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center space-x-4 py-4">
              <Skeleton className="h-12 w-16" />
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bg-dark-secondary rounded-xl border border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Arbitrage Opportunities</h2>
          <div className="flex items-center space-x-4">
            {/* Flashloan Control */}
            <div className="flex items-center space-x-2 px-3 py-1 bg-slate-800 rounded-lg">
              <Zap className="w-4 h-4 text-primary-blue" />
              <span className="text-sm text-slate-300">Flashloan</span>
              <Switch
                checked={flashloanEnabled}
                onCheckedChange={setFlashloanEnabled}
              />
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearStale}
              disabled={isClearing}
              className="text-xs"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear Stale
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleClearAll}
              disabled={isClearing}
              className="text-xs"
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear All
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-dark-tertiary">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Token Pair
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort("buyDex")}
                >
                  <div className="flex items-center">
                    Buy DEX
                    <ArrowUpDown className="ml-1 w-3 h-3" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort("sellDex")}
                >
                  <div className="flex items-center">
                    Sell DEX
                    <ArrowUpDown className="ml-1 w-3 h-3" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort("priceDifference")}
                >
                  <div className="flex items-center">
                    Price Diff
                    <ArrowUpDown className="ml-1 w-3 h-3" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort("estimatedProfit")}
                >
                  <div className="flex items-center">
                    Est. Profit
                    <ArrowUpDown className="ml-1 w-3 h-3" />
                  </div>
                </th>
                <th 
                  className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                  onClick={() => handleSort("gasCost")}
                >
                  <div className="flex items-center">
                    Gas Cost
                    <ArrowUpDown className="ml-1 w-3 h-3" />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {sortedOpportunities.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-slate-400">
                    No arbitrage opportunities found. Try adjusting your filters.
                  </td>
                </tr>
              ) : (
                sortedOpportunities.map((opportunity, index) => (
                  <tr key={`${opportunity.id}-${opportunity.lastUpdated}-${index}`} className="hover:bg-dark-tertiary transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex -space-x-2">
                          <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full border-2 border-dark-bg flex items-center justify-center text-xs font-bold text-white">
                            {opportunity.token0Symbol[0]}
                          </div>
                          <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-600 rounded-full border-2 border-dark-bg flex items-center justify-center text-xs font-bold text-white">
                            {opportunity.token1Symbol[0]}
                          </div>
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium text-white">{opportunity.tokenPair}</div>
                          <div className="text-xs text-slate-400">${opportunity.buyPrice}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-6 h-6 bg-pink-500 rounded-full flex items-center justify-center text-xs font-bold text-white mr-2">
                          {opportunity.buyDex[0]}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{opportunity.buyDex}</div>
                          <div className="text-xs text-slate-400">${opportunity.buyPrice}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-xs font-bold text-white mr-2">
                          {opportunity.sellDex[0]}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{opportunity.sellDex}</div>
                          <div className="text-xs text-slate-400">${opportunity.sellPrice}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-profit-green">+{opportunity.priceDifference}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <span className="text-sm font-medium text-profit-green">${opportunity.estimatedProfit}</span>
                        <Badge className={`ml-2 ${getProfitBadgeClass(opportunity.estimatedProfit)}`}>
                          {getProfitBadgeText(opportunity.estimatedProfit)}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-white">${opportunity.gasCost}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Button 
                        onClick={() => handleExecuteArbitrage(opportunity)}
                        disabled={executingOpportunities.has(opportunity.id)}
                        className="bg-primary-blue hover:bg-blue-600 text-white disabled:opacity-50"
                        size="sm"
                      >
                        {executingOpportunities.has(opportunity.id) ? (
                          <>
                            <Zap className="w-3 h-3 mr-1 animate-pulse" />
                            Executing
                          </>
                        ) : (
                          <>
                            <DollarSign className="w-3 h-3 mr-1" />
                            Execute
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-slate-400">Showing {sortedOpportunities.length} opportunities</span>
          </div>
        </div>
      </div>

      {/* Flashloan Status Footer */}
      <div className="px-6 py-3 bg-slate-800 border-t border-slate-700 rounded-b-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-primary-blue" />
            <span className="text-sm text-slate-300">
              Flashloan: {flashloanEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <div className="text-xs text-slate-500">
            System auto-optimizes trade amounts and flashloan sizes
          </div>
        </div>
      </div>
    </>
  );
}
