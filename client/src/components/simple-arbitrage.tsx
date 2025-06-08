import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ArbitrageParams {
  tokenA: string;
  tokenB: string;
  amountIn: string;
  buyDex: string;
  sellDex: string;
  minProfit: string;
}

export function SimpleArbitrage() {
  const { toast } = useToast();
  const [params, setParams] = useState<ArbitrageParams>({
    tokenA: 'WETH',
    tokenB: 'USDC', 
    amountIn: '0.001',
    buyDex: 'Aerodrome',
    sellDex: 'Uniswap V3',
    minProfit: '0.0001'
  });
  const [isExecuting, setIsExecuting] = useState(false);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimatedProfit, setEstimatedProfit] = useState<string>('');
  const [txHash, setTxHash] = useState<string>('');

  const tokens = ['WETH', 'USDC', 'USDT', 'LINK', 'UNI'];
  const dexes = ['Uniswap V3', 'SushiSwap', 'BaseSwap', 'Aerodrome'];

  const handleEstimateProfit = async () => {
    setIsEstimating(true);
    try {
      const result = await apiRequest('/api/contract/estimate-profit', {
        method: 'POST',
        body: JSON.stringify(params)
      });
      setEstimatedProfit(result.estimatedProfit);
      toast({
        title: "Profit Estimated",
        description: `Expected profit: ${result.estimatedProfit} ETH`,
      });
    } catch (error: any) {
      toast({
        title: "Estimation Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsEstimating(false);
    }
  };

  const handleExecuteArbitrage = async () => {
    setIsExecuting(true);
    setTxHash('');
    try {
      const result = await apiRequest('/api/contract/execute-arbitrage', {
        method: 'POST',
        body: JSON.stringify(params)
      });
      
      setTxHash(result.txHash);
      toast({
        title: "Arbitrage Executed!",
        description: `Transaction: ${result.txHash}`,
      });
    } catch (error: any) {
      toast({
        title: "Execution Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Direct Smart Contract Arbitrage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tokenA">Token A</Label>
              <Select value={params.tokenA} onValueChange={(value) => setParams({...params, tokenA: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tokens.map(token => (
                    <SelectItem key={token} value={token}>{token}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="tokenB">Token B</Label>
              <Select value={params.tokenB} onValueChange={(value) => setParams({...params, tokenB: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tokens.map(token => (
                    <SelectItem key={token} value={token}>{token}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="amountIn">Amount In (ETH)</Label>
            <Input
              id="amountIn"
              type="number"
              step="0.0001"
              value={params.amountIn}
              onChange={(e) => setParams({...params, amountIn: e.target.value})}
              placeholder="0.001"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="buyDex">Buy DEX</Label>
              <Select value={params.buyDex} onValueChange={(value) => setParams({...params, buyDex: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dexes.map(dex => (
                    <SelectItem key={dex} value={dex}>{dex}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="sellDex">Sell DEX</Label>
              <Select value={params.sellDex} onValueChange={(value) => setParams({...params, sellDex: value})}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {dexes.map(dex => (
                    <SelectItem key={dex} value={dex}>{dex}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="minProfit">Minimum Profit (ETH)</Label>
            <Input
              id="minProfit"
              type="number"
              step="0.0001"
              value={params.minProfit}
              onChange={(e) => setParams({...params, minProfit: e.target.value})}
              placeholder="0.0001"
            />
          </div>

          {estimatedProfit && (
            <div className="p-3 bg-green-100 dark:bg-green-900 rounded">
              <p className="text-sm">Estimated Profit: <strong>{estimatedProfit} ETH</strong></p>
            </div>
          )}

          <div className="flex space-x-3">
            <Button 
              onClick={handleEstimateProfit} 
              disabled={isEstimating}
              variant="outline"
              className="flex-1"
            >
              {isEstimating ? 'Estimating...' : 'Estimate Profit'}
            </Button>
            
            <Button 
              onClick={handleExecuteArbitrage} 
              disabled={isExecuting || !estimatedProfit}
              className="flex-1"
            >
              {isExecuting ? 'Executing...' : 'Execute Arbitrage'}
            </Button>
          </div>

          {txHash && (
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded">
              <p className="text-sm">Transaction Hash:</p>
              <p className="font-mono text-xs break-all">{txHash}</p>
              <a 
                href={`https://basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                View on BaseScan
              </a>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}