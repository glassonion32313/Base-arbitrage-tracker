import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Zap, AlertTriangle } from 'lucide-react';

interface LiveDEXPrice {
  pair: string;
  tokenA: string;
  tokenB: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  priceDiff: number;
  blockNumber: number;
  realProfitUSD: number;
  gasEstimateUSD: number;
  netProfitUSD: number;
  flashloanAmount: string;
  timestamp: string;
}

export function RealTimeArbitrage() {
  const [opportunities, setOpportunities] = useState<LiveDEXPrice[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [lastBlockNumber, setLastBlockNumber] = useState<number>(0);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws/live-dex`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('Connected to live DEX monitor');
      setConnectionStatus('connected');
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'live_dex_opportunities') {
          setOpportunities(message.data);
          if (message.data.length > 0) {
            setLastBlockNumber(message.data[0].blockNumber);
          }
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from live DEX monitor');
      setConnectionStatus('disconnected');
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnectionStatus('disconnected');
    };

    return () => {
      socket.close();
    };
  }, []);

  const executeArbitrage = async (opportunity: LiveDEXPrice) => {
    try {
      const response = await fetch('/api/execute-arbitrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenA: opportunity.tokenA,
          tokenB: opportunity.tokenB,
          amountIn: opportunity.flashloanAmount,
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
          minProfit: opportunity.netProfitUSD.toString()
        })
      });

      const result = await response.json();
      if (result.success) {
        alert(`Transaction submitted: ${result.txHash}`);
      } else {
        alert(`Execution failed: ${result.error}`);
      }
    } catch (error) {
      alert('Failed to execute arbitrage');
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'disconnected': return 'bg-red-500';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Live DEX Arbitrage Scanner</h1>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
          <span className="text-sm font-medium capitalize">{connectionStatus}</span>
          {lastBlockNumber > 0 && (
            <Badge variant="outline">Block #{lastBlockNumber}</Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Real-Time Blockchain Price Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
            <div>
              <span className="font-medium">Data Source:</span>
              <p className="text-muted-foreground">Live DEX smart contracts on Base</p>
            </div>
            <div>
              <span className="font-medium">Update Frequency:</span>
              <p className="text-muted-foreground">Every new block (~2 seconds)</p>
            </div>
            <div>
              <span className="font-medium">Price Method:</span>
              <p className="text-muted-foreground">Direct router.getAmountsOut() calls</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {connectionStatus === 'disconnected' && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              <span>Connection lost. Attempting to reconnect...</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">
          Live Arbitrage Opportunities ({opportunities.length})
        </h2>
        
        {opportunities.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-muted-foreground">
                {connectionStatus === 'connected' 
                  ? 'Scanning for profitable opportunities...' 
                  : 'Waiting for connection...'
                }
              </div>
            </CardContent>
          </Card>
        ) : (
          opportunities.map((opp, index) => (
            <Card key={index} className="border-l-4 border-l-green-500">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{opp.pair}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={opp.netProfitUSD > 0 ? 'default' : 'destructive'}>
                      ${opp.netProfitUSD.toFixed(2)} Profit
                    </Badge>
                    <Badge variant="outline">Block #{opp.blockNumber}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="h-4 w-4 text-red-500" />
                      <span className="font-medium">Buy from {opp.buyDex}</span>
                    </div>
                    <div className="text-2xl font-bold text-red-600">
                      ${opp.buyPrice.toFixed(6)}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      <span className="font-medium">Sell to {opp.sellDex}</span>
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                      ${opp.sellPrice.toFixed(6)}
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <span className="font-medium">Price Difference</span>
                    <div className="text-2xl font-bold">
                      ${opp.priceDiff.toFixed(6)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {((opp.priceDiff / opp.buyPrice) * 100).toFixed(3)}%
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
                  <div>
                    <span className="text-sm font-medium">Flashloan Amount</span>
                    <div className="text-lg">{opp.flashloanAmount} ETH</div>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Gross Profit</span>
                    <div className="text-lg text-green-600">
                      ${opp.realProfitUSD.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Gas + Fees</span>
                    <div className="text-lg text-red-600">
                      ${opp.gasEstimateUSD.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm font-medium">Net Profit</span>
                    <div className={`text-lg font-bold ${opp.netProfitUSD > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      ${opp.netProfitUSD.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button 
                    onClick={() => executeArbitrage(opp)}
                    disabled={opp.netProfitUSD <= 0}
                    className="w-full"
                  >
                    Execute Arbitrage (Net: ${opp.netProfitUSD.toFixed(2)})
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}