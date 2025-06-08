import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

interface FiltersProps {
  filters: {
    minProfit: number;
    selectedDexes: string[];
    gasPrice: string;
  };
  onFiltersChange: (filters: any) => void;
}

export default function FiltersSidebar({ filters, onFiltersChange }: FiltersProps) {
  const { data: transactions = [] } = useQuery({
    queryKey: ["/api/transactions"],
    select: (data) => data.slice(0, 3), // Get last 3 transactions
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/stats"],
  });

  const dexOptions = [
    { name: "Uniswap V3", enabled: true },
    { name: "SushiSwap", enabled: true },
    { name: "BaseSwap", enabled: true },
    { name: "PancakeSwap", enabled: false },
  ];

  const handleMinProfitChange = (value: string) => {
    onFiltersChange({
      ...filters,
      minProfit: parseFloat(value) || 0,
    });
  };

  const handleDexToggle = (dexName: string, checked: boolean) => {
    const newSelectedDexes = checked
      ? [...filters.selectedDexes, dexName]
      : filters.selectedDexes.filter(name => name !== dexName);
    
    onFiltersChange({
      ...filters,
      selectedDexes: newSelectedDexes,
    });
  };

  const handleGasPriceChange = (value: string) => {
    onFiltersChange({
      ...filters,
      gasPrice: value,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="bg-dark-secondary border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-white">Filters & Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Minimum Profit Filter */}
          <div>
            <Label htmlFor="minProfit" className="text-sm font-medium text-slate-300 mb-2 block">
              Minimum Profit (USD)
            </Label>
            <Input
              id="minProfit"
              type="number"
              value={filters.minProfit}
              onChange={(e) => handleMinProfitChange(e.target.value)}
              className="bg-dark-tertiary border-slate-600 text-white"
              placeholder="5.00"
            />
          </div>

          {/* DEX Selection */}
          <div>
            <Label className="text-sm font-medium text-slate-300 mb-2 block">DEX Sources</Label>
            <div className="space-y-2">
              {dexOptions.map((dex) => (
                <div key={dex.name} className="flex items-center space-x-2">
                  <Checkbox
                    id={dex.name}
                    checked={filters.selectedDexes.includes(dex.name)}
                    onCheckedChange={(checked) => handleDexToggle(dex.name, checked as boolean)}
                    className="border-slate-600 data-[state=checked]:bg-primary-blue"
                  />
                  <Label
                    htmlFor={dex.name}
                    className={`text-sm ${dex.enabled ? 'text-white' : 'text-slate-500'}`}
                  >
                    {dex.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Gas Settings */}
          <div>
            <Label className="text-sm font-medium text-slate-300 mb-2 block">Gas Price</Label>
            <Select value={filters.gasPrice} onValueChange={handleGasPriceChange}>
              <SelectTrigger className="bg-dark-tertiary border-slate-600 text-white">
                <SelectValue placeholder="Select gas price" />
              </SelectTrigger>
              <SelectContent className="bg-dark-tertiary border-slate-600">
                <SelectItem value="standard">Standard (12 Gwei)</SelectItem>
                <SelectItem value="fast">Fast (15 Gwei)</SelectItem>
                <SelectItem value="instant">Instant (20 Gwei)</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Quick Stats */}
          <div>
            <Separator className="bg-slate-600 mb-4" />
            <h3 className="text-sm font-medium text-slate-300 mb-3">Quick Stats</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Active Opportunities</span>
                <span className="text-profit-green font-medium">
                  {stats?.totalOpportunities || 0}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Avg. Profit</span>
                <span className="text-white font-medium">
                  ${(stats?.bestProfit || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">24h Volume</span>
                <span className="text-white font-medium">
                  ${((stats?.volume24h || 0) / 1000000).toFixed(1)}M
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card className="bg-dark-secondary border-slate-700">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-white">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {transactions.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">
                No recent transactions
              </p>
            ) : (
              transactions.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between p-3 bg-dark-tertiary rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${
                      tx.status === 'confirmed' ? 'bg-profit-green' : 
                      tx.status === 'pending' ? 'bg-warning-amber animate-pulse' : 
                      'bg-loss-red'
                    }`}></div>
                    <div>
                      <div className="text-sm font-medium text-white">{tx.tokenPair}</div>
                      <div className="text-xs text-slate-400">
                        {new Date(tx.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${
                      tx.status === 'confirmed' ? 'text-profit-green' : 'text-warning-amber'
                    }`}>
                      +${parseFloat(tx.expectedProfit).toFixed(2)}
                    </div>
                    <div className="text-xs text-slate-400 capitalize">{tx.status}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
