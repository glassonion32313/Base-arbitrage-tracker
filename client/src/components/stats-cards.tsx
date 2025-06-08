import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, DollarSign, Fuel, CheckCircle, ArrowUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatsCardsProps {
  stats?: {
    totalOpportunities: number;
    bestProfit: number;
    avgGasFee: number;
    successRate: number;
    volume24h: number;
  };
}

export default function StatsCards({ stats }: StatsCardsProps) {
  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="bg-dark-secondary border-slate-700">
            <CardContent className="p-4">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <Card className="bg-dark-secondary border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Opportunities</p>
              <p className="text-2xl font-bold text-white">{stats.totalOpportunities}</p>
            </div>
            <div className="w-10 h-10 bg-primary-blue bg-opacity-20 rounded-lg flex items-center justify-center">
              <TrendingUp className="text-primary-blue w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center mt-2">
            <span className="text-xs text-profit-green flex items-center">
              <ArrowUp className="w-3 h-3 mr-1" />
              +12.5%
            </span>
            <span className="text-xs text-slate-400 ml-2">vs last hour</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-dark-secondary border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Best Profit</p>
              <p className="text-2xl font-bold text-profit-green">${stats.bestProfit.toFixed(2)}</p>
            </div>
            <div className="w-10 h-10 bg-profit-green bg-opacity-20 rounded-lg flex items-center justify-center">
              <DollarSign className="text-profit-green w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center mt-2">
            <span className="text-xs text-slate-300">WETH/USDC</span>
            <span className="text-xs text-slate-400 ml-2">pair</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-dark-secondary border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Avg Gas Fee</p>
              <p className="text-2xl font-bold text-white">${stats.avgGasFee.toFixed(2)}</p>
            </div>
            <div className="w-10 h-10 bg-warning-amber bg-opacity-20 rounded-lg flex items-center justify-center">
              <Fuel className="text-warning-amber w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center mt-2">
            <span className="text-xs text-slate-300">12.5 Gwei</span>
            <span className="text-xs text-slate-400 ml-2">current</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-dark-secondary border-slate-700">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Success Rate</p>
              <p className="text-2xl font-bold text-white">{stats.successRate.toFixed(1)}%</p>
            </div>
            <div className="w-10 h-10 bg-profit-green bg-opacity-20 rounded-lg flex items-center justify-center">
              <CheckCircle className="text-profit-green w-5 h-5" />
            </div>
          </div>
          <div className="flex items-center mt-2">
            <span className="text-xs text-profit-green flex items-center">
              <ArrowUp className="w-3 h-3 mr-1" />
              +2.1%
            </span>
            <span className="text-xs text-slate-400 ml-2">this week</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
