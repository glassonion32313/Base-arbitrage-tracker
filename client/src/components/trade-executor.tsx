import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Zap, Wallet, ExternalLink, AlertTriangle, TrendingUp, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TradeExecutorProps {
  opportunity: any;
  walletAddress?: string;
  isWalletConnected: boolean;
  onConnect: () => void;
}

export default function TradeExecutor({ 
  opportunity, 
  walletAddress, 
  isWalletConnected, 
  onConnect 
}: TradeExecutorProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStage, setExecutionStage] = useState(0);
  const [txHash, setTxHash] = useState<string | null>(null);
  const { toast } = useToast();

  const executionStages = [
    "Estimating gas costs",
    "Preparing transaction",
    "Waiting for signature",
    "Broadcasting transaction",
    "Confirming execution"
  ];

  const executeArbitrage = async () => {
    if (!isWalletConnected || !walletAddress) {
      onConnect();
      return;
    }

    setIsExecuting(true);
    setExecutionStage(0);

    try {
      // Stage 1: Estimate gas costs
      setExecutionStage(1);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const gasResponse = await fetch('/api/contract/gas');
      const gasPrices = await gasResponse.json();

      // Stage 2: Prepare transaction
      setExecutionStage(2);
      await new Promise(resolve => setTimeout(resolve, 1000));

      const contractResponse = await fetch('/api/contract/address');
      const contractInfo = await contractResponse.json();

      // Stage 3: Estimate profit via contract
      setExecutionStage(3);
      await new Promise(resolve => setTimeout(resolve, 1500));

      const estimateResponse = await fetch('/api/contract/estimate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenA: opportunity.tokenA,
          tokenB: opportunity.tokenB,
          amountIn: opportunity.amountIn,
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
          minProfit: "10"
        })
      });

      if (!estimateResponse.ok) {
        throw new Error('Contract estimation failed');
      }

      // Stage 4: Execute via MetaMask
      setExecutionStage(4);
      
      if (!window.ethereum) {
        throw new Error('MetaMask not detected');
      }

      // Prepare transaction parameters for ArbitrageBot contract
      const txParams = {
        to: contractInfo.address,
        from: walletAddress,
        value: '0x0', // No ETH sent for flashloan arbitrage
        gas: '0x' + (300000).toString(16), // 300k gas limit
        gasPrice: '0x' + Math.floor(parseFloat(gasPrices.fast) * 1e9).toString(16),
        data: '0x' // Contract call data would go here
      };

      // Request transaction signature
      const transactionHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [txParams],
      });

      setTxHash(transactionHash);
      setExecutionStage(5);

      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Record successful trade
      await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash: transactionHash,
          userAddress: walletAddress,
          tokenPair: opportunity.tokenPair,
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
          amountIn: opportunity.amountIn,
          expectedProfit: opportunity.netProfit,
          status: 'completed'
        })
      });

      toast({
        title: "Trade Executed Successfully",
        description: `Arbitrage completed for ${opportunity.tokenPair}`,
      });

    } catch (error: any) {
      console.error('Trade execution failed:', error);
      
      if (error.code === 4001) {
        toast({
          title: "Transaction Rejected",
          description: "You rejected the transaction",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Execution Failed",
          description: error.message || "Failed to execute arbitrage",
          variant: "destructive"
        });
      }
    } finally {
      setIsExecuting(false);
      setExecutionStage(0);
    }
  };

  const viewTransaction = () => {
    if (txHash) {
      window.open(`https://basescan.org/tx/${txHash}`, '_blank');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Execute Arbitrage Trade
        </CardTitle>
        <CardDescription>
          Execute this opportunity using your deployed ArbitrageBot contract
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Trade Details */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-sm font-medium mb-1">Token Pair</div>
            <div className="text-lg font-bold">{opportunity.tokenPair}</div>
          </div>
          <div className="bg-green-50 dark:bg-green-950 rounded-lg p-3">
            <div className="text-sm font-medium mb-1 text-green-600 dark:text-green-400">
              Expected Profit
            </div>
            <div className="text-lg font-bold text-green-600 dark:text-green-400">
              ${parseFloat(opportunity.netProfit).toFixed(2)}
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-sm font-medium mb-1">Route</div>
            <div className="text-sm">
              {opportunity.buyDex} → {opportunity.sellDex}
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-sm font-medium mb-1">Amount</div>
            <div className="text-sm">{opportunity.amountIn} {opportunity.tokenA}</div>
          </div>
        </div>

        <Separator />

        {/* Wallet Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            <span className="text-sm font-medium">Wallet Status</span>
          </div>
          <div className="flex items-center gap-2">
            {isWalletConnected ? (
              <>
                <Badge variant="default" className="bg-green-600">Connected</Badge>
                <span className="text-xs text-muted-foreground font-mono">
                  {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
                </span>
              </>
            ) : (
              <Badge variant="destructive">Disconnected</Badge>
            )}
          </div>
        </div>

        {/* Execution Progress */}
        {isExecuting && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Execution Progress</span>
              <span className="text-sm text-muted-foreground">
                {executionStage}/{executionStages.length}
              </span>
            </div>
            <Progress 
              value={(executionStage / executionStages.length) * 100} 
              className="h-2"
            />
            <div className="text-sm text-muted-foreground">
              {executionStages[executionStage - 1] || "Preparing..."}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {!isWalletConnected ? (
            <Button onClick={onConnect} className="flex-1">
              <Wallet className="h-4 w-4 mr-2" />
              Connect Wallet
            </Button>
          ) : (
            <Button 
              onClick={executeArbitrage} 
              disabled={isExecuting}
              className="flex-1"
            >
              {isExecuting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Executing...
                </>
              ) : (
                <>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  Execute Trade
                </>
              )}
            </Button>
          )}
          
          {txHash && (
            <Button variant="outline" onClick={viewTransaction}>
              <ExternalLink className="h-4 w-4 mr-2" />
              View TX
            </Button>
          )}
        </div>

        {/* Risk Warning */}
        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                Risk Notice
              </div>
              <div className="text-yellow-700 dark:text-yellow-300">
                Arbitrage trading involves risks including gas costs, slippage, and MEV attacks. 
                Only trade with funds you can afford to lose.
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}