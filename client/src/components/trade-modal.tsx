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
import { Switch } from "@/components/ui/switch";
import { Loader2, AlertTriangle, Zap, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { flashloanService } from "@/lib/flashloan-service";
import type { ArbitrageOpportunity } from "@shared/schema";

interface TradeModalProps {
  opportunity: ArbitrageOpportunity;
  isOpen: boolean;
  onClose: () => void;
}

export default function TradeModal({ opportunity, isOpen, onClose }: TradeModalProps) {
  const [amount, setAmount] = useState("1000");
  const [useFlashloan, setUseFlashloan] = useState(true);
  const [flashloanFee, setFlashloanFee] = useState("0");
  const [flashloanGas, setFlashloanGas] = useState("0");
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
      if (typeof (window as any).ethereum === 'undefined') {
        toast({
          title: "Wallet required",
          description: "Please connect your wallet to execute trades",
          variant: "destructive",
        });
        return;
      }

      const accounts = await (window as any).ethereum.request({ method: 'eth_accounts' });
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
        gasCost: useFlashloan ? flashloanGas : opportunity.gasCost,
        flashloanAmount: useFlashloan ? amount : null,
        flashloanFee: useFlashloan ? flashloanFee : null,
        isFlashloan: useFlashloan,
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

  // Update flashloan calculations when amount or flashloan toggle changes
  const updateFlashloanCalculations = async () => {
    if (useFlashloan) {
      try {
        const fee = await flashloanService.calculateFlashloanFee(amount);
        const gas = await flashloanService.estimateFlashloanGas({
          tokenAddress: opportunity.token0Address,
          amount,
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
          minProfit: opportunity.estimatedProfit,
        });
        setFlashloanFee(fee);
        setFlashloanGas(gas);
      } catch (error) {
        console.error('Failed to calculate flashloan costs:', error);
      }
    }
  };

  // Calculate profit based on trade type
  const estimatedAmountOut = parseFloat(amount) * (1 + parseFloat(opportunity.priceDifference) / 100);
  const grossProfit = parseFloat(opportunity.estimatedProfit) * (parseFloat(amount) / 1000);
  const regularGasCost = parseFloat(opportunity.gasCost);
  const flashloanGasCost = parseFloat(flashloanGas) || 0;
  const flashloanFeeCost = parseFloat(flashloanFee) || 0;
  
  const totalCost = useFlashloan 
    ? flashloanGasCost + flashloanFeeCost 
    : regularGasCost;
  
  const finalProfit = grossProfit - totalCost;

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

          {/* Flashloan Toggle */}
          <div className="bg-dark-tertiary rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-primary-blue" />
                <span className="text-sm font-medium">Use Balancer Flashloan</span>
              </div>
              <Switch
                checked={useFlashloan}
                onCheckedChange={(checked) => {
                  setUseFlashloan(checked);
                  if (checked) updateFlashloanCalculations();
                }}
              />
            </div>
            <div className="flex items-start space-x-2 text-xs text-slate-400">
              <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
              <span>
                {useFlashloan 
                  ? "Execute arbitrage without upfront capital using Balancer's 0% fee flashloans"
                  : "Use your own capital for the arbitrage trade"
                }
              </span>
            </div>
          </div>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-sm font-medium">
              {useFlashloan ? "Flashloan Amount (USDC)" : "Trade Amount (USDC)"}
            </Label>
            <Input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (useFlashloan) updateFlashloanCalculations();
              }}
              className="bg-dark-tertiary border-slate-600 text-white"
              placeholder="1000"
            />
            {useFlashloan && (
              <div className="text-xs text-slate-400">
                No upfront capital required - funds borrowed temporarily via flashloan
              </div>
            )}
          </div>

          {/* Profit Calculation */}
          <div className="bg-dark-tertiary rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Amount Out</span>
              <span className="text-sm font-medium text-white">${estimatedAmountOut.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Gross Profit</span>
              <span className="text-sm font-medium text-profit-green">${grossProfit.toFixed(2)}</span>
            </div>
            {useFlashloan ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Flashloan Fee</span>
                  <span className="text-sm font-medium text-white">${flashloanFeeCost.toFixed(4)}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-slate-400">Flashloan Gas</span>
                  <span className="text-sm font-medium text-white">${flashloanGasCost.toFixed(2)}</span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-400">Gas Fee</span>
                <span className="text-sm font-medium text-white">${regularGasCost.toFixed(2)}</span>
              </div>
            )}
            <Separator className="my-2 bg-slate-600" />
            <div className="flex items-center justify-between text-lg font-semibold">
              <span className="text-white">Net Profit</span>
              <span className={finalProfit > 0 ? "text-profit-green" : "text-loss-red"}>
                ${finalProfit.toFixed(2)}
              </span>
            </div>
            {useFlashloan && (
              <div className="mt-2 text-xs text-slate-400">
                Capital efficiency: {((finalProfit / parseFloat(amount)) * 100).toFixed(1)}% ROI with 0 upfront capital
              </div>
            )}
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
