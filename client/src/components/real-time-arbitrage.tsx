import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Zap, DollarSign } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface RealTimePriceData {
  pair: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  optimalFlashloanSize: string;
  realProfit: number;
  gasEstimate: number;
  netProfit: number;
  timestamp: Date;
}

export function RealTimeArbitrage() {
  const [opportunities, setOpportunities] = useState<RealTimePriceData[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/arbitrage`;
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      console.log('Connected to real-time arbitrage feed');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'arbitrage_opportunities') {
          setOpportunities(message.data);
          setLastUpdate(new Date(message.timestamp));
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('Disconnected from real-time arbitrage feed');
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    return () => {
      ws.close();
    };
  }, []);

  const executeArbitrage = async (opportunity: RealTimePriceData) => {
    try {
      const response = await fetch('/api/contract/execute-arbitrage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tokenA: opportunity.pair.split('/')[0],
          tokenB: opportunity.pair.split('/')[1],
          amountIn: opportunity.optimalFlashloanSize,
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
          minProfit: opportunity.netProfit.toString()
        })
      });

      const result = await response.json();
      
      if (result.success) {
        toast({
          title: "Arbitrage Executed!",
          description: `Transaction: ${result.txHash}`,
        });
      } else {
        toast({
          title: "Execution Failed",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatUSD = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (buyPrice: number, sellPrice: number) => {
    const diff = ((sellPrice - buyPrice) / buyPrice) * 100;
    return diff.toFixed(3) + '%';
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Real-Time Arbitrage Scanner</h1>
          <p className="text-muted-foreground">
            Live DEX price feeds with optimal flashloan calculations
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className={`flex items-center space-x-2 px-3 py-1 rounded-full ${
            isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          
          {lastUpdate && (
            <div className="text-sm text-muted-foreground">
              Last update: {lastUpdate.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>

      {opportunities.length === 0 ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="text-center">
              <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">
                Scanning for opportunities...
              </h3>
              <p className="text-sm text-muted-foreground mt-2">
                {isConnected ? 'Monitoring live DEX prices' : 'Connecting to price feed...'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {opportunities.map((opportunity, index) => (
            <Card key={index} className="border border-green-200 bg-green-50">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold text-green-800">
                    {opportunity.pair}
                  </CardTitle>
                  
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="bg-green-100 text-green-800">
                      {formatPercentage(opportunity.buyPrice, opportunity.sellPrice)} spread
                    </Badge>
                    <Badge className="bg-green-600 text-white">
                      <DollarSign className="w-3 h-3 mr-1" />
                      {formatUSD(opportunity.netProfit)} profit
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Buy from</p>
                    <p className="text-lg font-semibold text-blue-600">
                      {opportunity.buyDex}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      ${opportunity.buyPrice.toFixed(6)}
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Sell to</p>
                    <p className="text-lg font-semibold text-orange-600">
                      {opportunity.sellDex}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      ${opportunity.sellPrice.toFixed(6)}
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Flashloan Size</p>
                    <p className="text-lg font-semibold">
                      {opportunity.optimalFlashloanSize} ETH
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Optimized amount
                    </p>
                  </div>
                  
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">Net Profit</p>
                    <p className="text-lg font-semibold text-green-600">
                      {formatUSD(opportunity.netProfit)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      After gas: {formatUSD(opportunity.gasEstimate)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-3 border-t">
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                    <span>Gross: {formatUSD(opportunity.realProfit)}</span>
                    <span>Gas: {formatUSD(opportunity.gasEstimate)}</span>
                    <span>Updated: {new Date(opportunity.timestamp).toLocaleTimeString()}</span>
                  </div>
                  
                  <Button 
                    onClick={() => executeArbitrage(opportunity)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Zap className="w-4 h-4 mr-2" />
                    Execute Trade
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}