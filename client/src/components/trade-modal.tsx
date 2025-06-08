import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { ArbitrageOpportunity } from "@shared/schema";

interface TradeModalProps {
  opportunity: ArbitrageOpportunity;
  isOpen: boolean;
  onClose: () => void;
}

export default function TradeModal({ opportunity, isOpen, onClose }: TradeModalProps) {
  const [amount, setAmount] = useState("1000");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const executeTradeMutation = useMutation({
    mutationFn: async (tradeData: any) => {
      return apiRequest("POST", "/api/transactions", tradeData);
    },
    onSuccess: () => {
      toast({
        title: "Trade executed",
        description: "Your arbitrage trade has been submitted to the blockchain",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Trade failed",
        description: error.message || "Failed to execute arbitrage trade",
        variant: "destructive",
      });
    },
  });

  const handleExecuteTrade = async () => {
    try {
      // Check if wallet is connected
      if (typeof window.ethereum === 'undefined') {
        toast({
          title: "Wallet required",
          description: "Please connect your wallet to execute trades",
          variant: "destructive",
        });
        return;
      }

      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      if (accounts.length === 0) {
        toast({
          title: "Wallet not connected",
          description: "Please connect your wallet first",
          variant: "destructive",
        });
        return;
      }

      const tradeData = {
        userAddress: accounts[0],
        tokenPair: opportunity.tokenPair,
        buyDex: opportunity.buyDex,
        sellDex: opportunity.sellDex,
        amountIn: amount,
        expectedProfit: opportunity.estimatedProfit,
        gasCost: opportunity.gasCost,
        txHash: `0x${Math.random().toString(16).substr(2, 64)}`, // Mock tx hash
        status: "pending",
      };

      executeTradeMutation.mutate(tradeData);
    } catch (error) {
      console.error("Trade execution error:", error);
      toast({
        title: "Trade failed",
        description: "An error occurred while executing the trade",
        variant: "destructive",
      });
    }
  };

  const estimatedAmountOut = parseFloat(amount) * (1 + parseFloat(opportunity.priceDifference) / 100);
  const netProfit = parseFloat(opportunity.estimatedProfit) * (parseFloat(amount) / 1000);
  const totalGasCost = parseFloat(opportunity.gasCost);
  const finalProfit = netProfit - totalGasCost;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-dark-secondary border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Execute Arbitrage Trade</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Trade Details */}
          <div className="bg-dark-tertiary rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Token Pair</span>
              <span className="text-sm font-medium text-white">{opportunity.tokenPair}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Buy from</span>
              <span className="text-sm font-medium text-white">{opportunity.buyDex}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Sell to</span>
              <span className="text-sm font-medium text-white">{opportunity.sellDex}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Price Difference</span>
              <Badge className="bg-profit-green bg-opacity-20 text-profit-green">
                +{opportunity.priceDifference}%
              </Badge>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-sm font-medium">
              Trade Amount (USDC)
            </Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-dark-tertiary border-slate-600 text-white"
              placeholder="1000"
            />
          </div>

          {/* Profit Calculation */}
          <div className="bg-dark-tertiary rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Amount Out</span>
              <span className="text-sm font-medium text-white">${estimatedAmountOut.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Gross Profit</span>
              <span className="text-sm font-medium text-profit-green">${netProfit.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Gas Fee</span>
              <span className="text-sm font-medium text-white">${totalGasCost.toFixed(2)}</span>
            </div>
            <Separator className="my-2 bg-slate-600" />
            <div className="flex items-center justify-between text-lg font-semibold">
              <span className="text-white">Net Profit</span>
              <span className={finalProfit > 0 ? "text-profit-green" : "text-loss-red"}>
                ${finalProfit.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Warning */}
          {finalProfit <= 0 && (
            <div className="flex items-center space-x-2 p-3 bg-warning-amber bg-opacity-10 border border-warning-amber rounded-lg">
              <AlertTriangle className="w-4 h-4 text-warning-amber" />
              <span className="text-sm text-warning-amber">
                This trade may result in a loss due to gas costs
              </span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-4">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1 border-slate-600 text-slate-300 hover:bg-slate-700"
              disabled={executeTradeMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleExecuteTrade}
              disabled={executeTradeMutation.isPending || finalProfit <= 0}
              className="flex-1 bg-profit-green hover:bg-green-600 text-white"
            >
              {executeTradeMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                "Confirm Trade"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
