import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { dexService } from "@/lib/dex-service";
import { apiRequest } from "@/lib/queryClient";
import type { ArbitrageOpportunity } from "@shared/schema";

export function useArbitrageOpportunities(
  filters: {
    minProfit?: number;
    selectedDexes?: string[];
  } = {}
) {
  return useQuery({
    queryKey: ["/api/opportunities", filters],
    queryFn: async () => {
      // Fetch opportunities from API or generate them
      const tokenPairs = ['WETH/USDC', 'WBTC/USDT', 'DAI/USDC', 'AAVE/USDC'];
      const prices = await dexService.fetchPrices(tokenPairs);
      const opportunities = await dexService.findArbitrageOpportunities(
        prices,
        filters.minProfit || 0
      );

      // Store opportunities in backend
      for (const opportunity of opportunities) {
        try {
          await apiRequest("POST", "/api/opportunities", {
            ...opportunity,
            isActive: true,
          });
        } catch (error) {
          console.warn("Failed to store opportunity:", error);
        }
      }

      return opportunities;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 25000, // Consider data stale after 25 seconds
  });
}

export function useArbitrageStats() {
  return useQuery({
    queryKey: ["/api/stats"],
    refetchInterval: 30000,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transactionData: any) => {
      return apiRequest("POST", "/api/transactions", transactionData);
    },
    onSuccess: () => {
      // Invalidate and refetch transaction queries
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      return apiRequest("PATCH", `/api/transactions/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
    },
  });
}

export function useRecentTransactions(userAddress?: string) {
  return useQuery({
    queryKey: ["/api/transactions", { userAddress, limit: 10 }],
    enabled: !!userAddress,
    refetchInterval: 15000,
  });
}

export function useDexes() {
  return useQuery({
    queryKey: ["/api/dexes"],
    queryFn: async () => {
      const response = await fetch("/api/dexes?enabledOnly=true");
      if (!response.ok) {
        throw new Error("Failed to fetch DEXes");
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
