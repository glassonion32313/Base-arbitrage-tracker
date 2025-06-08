import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { TrendingUp, DollarSign, Clock, Shield, AlertTriangle, Zap } from 'lucide-react';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  opportunity: any;
}

export default function TradeModal({ isOpen, onClose, opportunity }: TradeModalProps) {
  const [tradeAmount, setTradeAmount] = useState('100');
  const [maxSlippage, setMaxSlippage] = useState('2');
  const [useFlashloan, setUseFlashloan] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const { toast } = useToast();

  if (!opportunity) return null;

  const handleExecuteTrade = async () => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      toast({
        title: "Authentication Required",
        description: "Please log in to execute trades",
        variant: "destructive",
      });
      return;
    }

    setIsExecuting(true);
    try {
      const response = await fetch('/api/trades/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          opportunityId: opportunity.id,
          tradeAmount: tradeAmount,
          maxSlippage: parseFloat(maxSlippage),
          useFlashloan: useFlashloan
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast({
          title: "Trade Executed Successfully",
          description: `Transaction Hash: ${result.txHash?.slice(0, 10)}...`,
        });
        onClose();
      } else {
        toast({
          title: "Trade Failed",
          description: result.message || "Trade execution failed",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Execution Error",
        description: error.message || "Failed to execute trade",
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const expectedProfit = (parseFloat(tradeAmount) * parseFloat(opportunity.priceDifference)) / 100;
  const estimatedGas = 0.002; // ETH
  const netProfit = expectedProfit - (estimatedGas * 3200); // Approximate gas cost in USD

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-dark-secondary border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <TrendingUp className="h-5 w-5 text-profit-green" />
            Execute Arbitrage Trade
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Review and execute this arbitrage opportunity
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Opportunity Summary */}
          <div className="p-4 bg-dark-tertiary rounded-lg border border-slate-600">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-white">{opportunity.tokenPair}</h3>
              <Badge variant="secondary" className="bg-profit-green/20 text-profit-green">
                +{opportunity.priceDifference}%
              </Badge>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-slate-400">Buy from</p>
                <p className="text-white font-medium">{opportunity.buyDex}</p>
                <p className="text-slate-300">${opportunity.buyPrice}</p>
              </div>
              <div>
                <p className="text-slate-400">Sell to</p>
                <p className="text-white font-medium">{opportunity.sellDex}</p>
                <p className="text-slate-300">${opportunity.sellPrice}</p>
              </div>
            </div>
          </div>

          {/* Trade Parameters */}
          <div className="space-y-3">
            <div>
              <Label htmlFor="amount" className="text-sm font-medium text-slate-300">
                Trade Amount (USD)
              </Label>
              <Input
                id="amount"
                type="number"
                value={tradeAmount}
                onChange={(e) => setTradeAmount(e.target.value)}
                className="mt-1 bg-dark-tertiary border-slate-600 text-white"
                placeholder="100"
              />
            </div>

            <div>
              <Label htmlFor="slippage" className="text-sm font-medium text-slate-300">
                Max Slippage (%)
              </Label>
              <Input
                id="slippage"
                type="number"
                value={maxSlippage}
                onChange={(e) => setMaxSlippage(e.target.value)}
                className="mt-1 bg-dark-tertiary border-slate-600 text-white"
                placeholder="2"
                step="0.1"
              />
            </div>

            {/* Flashloan Option */}
            <div className="flex items-center justify-between p-3 bg-blue-900/20 border border-blue-700/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-400" />
                <div>
                  <Label className="text-sm font-medium text-blue-200">Use Flashloan</Label>
                  <p className="text-xs text-blue-300">Execute without upfront capital</p>
                </div>
              </div>
              <Switch
                checked={useFlashloan}
                onCheckedChange={setUseFlashloan}
                className="data-[state=checked]:bg-blue-600"
              />
            </div>
          </div>

          {/* Profit Calculation */}
          <div className="p-4 bg-green-900/20 border border-green-700/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-profit-green" />
              <span className="text-sm font-medium text-profit-green">Estimated Profit</span>
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Gross Profit:</span>
                <span className="text-profit-green">+${expectedProfit.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Gas Costs:</span>
                <span className="text-red-400">-${(estimatedGas * 3200).toFixed(2)}</span>
              </div>
              <hr className="border-slate-600" />
              <div className="flex justify-between text-white font-medium">
                <span>Net Profit:</span>
                <span className={netProfit > 0 ? "text-profit-green" : "text-red-400"}>
                  ${netProfit.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Risk Warning */}
          <div className="p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
              <div className="text-xs">
                <p className="text-yellow-500 font-medium mb-1">Trading Risks</p>
                <p className="text-slate-300">
                  Arbitrage trades involve price volatility and gas fee risks. 
                  Ensure you have sufficient ETH balance for gas fees.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1 border-slate-600 text-slate-300 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExecuteTrade}
              disabled={isExecuting || netProfit <= 0}
              className="flex-1 bg-profit-green hover:bg-profit-green/90 text-white"
            >
              {isExecuting ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Executing...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Execute Trade
                </div>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}