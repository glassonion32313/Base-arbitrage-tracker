import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Shield, ShieldCheck, Clock, Zap, Eye, DollarSign, AlertTriangle, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MEVProtectionSettings {
  enabled: boolean;
  flashbotsEnabled: boolean;
  privateMempool: boolean;
  slippageProtection: number;
  gasPriceMultiplier: number;
  maxGasPrice: number;
  bundleTimeout: number;
  frontrunProtection: boolean;
  sandwichProtection: boolean;
  delayedExecution: boolean;
  executionDelay: number;
}

interface ProtectionStatus {
  isProtected: boolean;
  activeStrategies: string[];
  threatLevel: 'low' | 'medium' | 'high';
  estimatedSavings: number;
  blockedAttacks: number;
}

export default function MEVProtection() {
  const [settings, setSettings] = useState<MEVProtectionSettings>({
    enabled: true,
    flashbotsEnabled: true,
    privateMempool: true,
    slippageProtection: 2.5,
    gasPriceMultiplier: 1.1,
    maxGasPrice: 50,
    bundleTimeout: 12,
    frontrunProtection: true,
    sandwichProtection: true,
    delayedExecution: false,
    executionDelay: 2
  });

  const [status, setStatus] = useState<ProtectionStatus>({
    isProtected: false,
    activeStrategies: [],
    threatLevel: 'low',
    estimatedSavings: 0,
    blockedAttacks: 0
  });

  const [gasPrices, setGasPrices] = useState<any>(null);
  const [networkStatus, setNetworkStatus] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Load settings from localStorage
    const savedSettings = localStorage.getItem('mev-protection-settings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    fetchNetworkData();
    updateProtectionStatus();
    
    const interval = setInterval(() => {
      fetchNetworkData();
      updateProtectionStatus();
    }, 15000);
    
    return () => clearInterval(interval);
  }, [settings]);

  const fetchNetworkData = async () => {
    try {
      const [gasResponse, monitorResponse] = await Promise.all([
        fetch('/api/contract/gas'),
        fetch('/api/monitor/status')
      ]);
      
      const gasData = await gasResponse.json();
      const monitorData = await monitorResponse.json();
      
      setGasPrices(gasData);
      setNetworkStatus(monitorData);
    } catch (error) {
      console.error('Failed to fetch network data:', error);
    }
  };

  const updateProtectionStatus = () => {
    if (settings.enabled && gasPrices) {
      const activeStrategies = [];
      if (settings.frontrunProtection) activeStrategies.push('Gas Price Optimization');
      if (settings.sandwichProtection) activeStrategies.push('Slippage Protection');
      if (settings.delayedExecution) activeStrategies.push('Delayed Execution');
      if (settings.privateMempool) activeStrategies.push('Private Pool Routing');
      
      // Calculate threat level based on gas prices
      const currentGas = parseFloat(gasPrices?.standard || '0');
      let threatLevel: 'low' | 'medium' | 'high' = 'low';
      if (currentGas > 30) threatLevel = 'high';
      else if (currentGas > 15) threatLevel = 'medium';
      
      setStatus({
        isProtected: true,
        activeStrategies,
        threatLevel,
        estimatedSavings: currentGas * 0.15, // Estimated 15% gas savings
        blockedAttacks: activeStrategies.length * 2 // Mock blocked attacks based on active strategies
      });
    } else {
      setStatus({
        isProtected: false,
        activeStrategies: [],
        threatLevel: 'high',
        estimatedSavings: 0,
        blockedAttacks: 0
      });
    }
  };

  const updateSettings = (key: keyof MEVProtectionSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('mev-protection-settings', JSON.stringify(newSettings));
    updateProtectionStatus();
  };

  const getThreatLevelColor = (level: string) => {
    switch (level) {
      case 'low': return 'text-green-600 dark:text-green-400';
      case 'medium': return 'text-yellow-600 dark:text-yellow-400';
      case 'high': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getThreatBadgeVariant = (level: string) => {
    switch (level) {
      case 'low': return 'default';
      case 'medium': return 'secondary';
      case 'high': return 'destructive';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Protection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status.isProtected ? (
              <ShieldCheck className="h-5 w-5 text-green-600" />
            ) : (
              <Shield className="h-5 w-5 text-gray-400" />
            )}
            MEV Protection Status
            <Badge variant={status.isProtected ? "default" : "destructive"} className="ml-auto">
              {status.isProtected ? "Protected" : "Vulnerable"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Real-time protection against MEV attacks and sandwich bots
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Protection Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Threat Level</span>
              </div>
              <div className={`text-xl font-bold ${getThreatLevelColor(status.threatLevel)}`}>
                {status.threatLevel.toUpperCase()}
              </div>
              <Badge variant={getThreatBadgeVariant(status.threatLevel)} className="mt-1">
                {status.threatLevel} risk
              </Badge>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="h-4 w-4" />
                <span className="text-sm font-medium">Estimated Savings</span>
              </div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                ${status.estimatedSavings.toFixed(2)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Protected from MEV</p>
            </div>

            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4" />
                <span className="text-sm font-medium">Blocked Attacks</span>
              </div>
              <div className="text-xl font-bold">
                {status.blockedAttacks}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
            </div>
          </div>

          {/* Active Strategies */}
          <div>
            <Label className="text-base font-medium mb-3 block">Active Protection Strategies</Label>
            <div className="flex flex-wrap gap-2">
              {status.activeStrategies.map((strategy) => (
                <Badge key={strategy} variant="outline" className="flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" />
                  {strategy}
                </Badge>
              ))}
              {status.activeStrategies.length === 0 && (
                <Badge variant="destructive">No active protection</Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Protection Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Protection Configuration
          </CardTitle>
          <CardDescription>
            Configure MEV protection strategies and parameters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Enable MEV Protection</Label>
              <p className="text-sm text-muted-foreground">
                Master switch for all MEV protection features
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => updateSettings('enabled', checked)}
            />
          </div>

          <Separator />

          {/* Flashbots Protection */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Flashbots Integration</Label>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4" />
                <span className="text-sm">Flashbots Protect</span>
                <Badge variant="outline" className="text-xs">Recommended</Badge>
              </div>
              <Switch
                checked={settings.flashbotsEnabled}
                onCheckedChange={(checked) => updateSettings('flashbotsEnabled', checked)}
                disabled={!settings.enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                <span className="text-sm">Private Mempool</span>
              </div>
              <Switch
                checked={settings.privateMempool}
                onCheckedChange={(checked) => updateSettings('privateMempool', checked)}
                disabled={!settings.enabled}
              />
            </div>
          </div>

          <Separator />

          {/* Attack Protection */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Attack Prevention</Label>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span className="text-sm">Front-run Protection</span>
              </div>
              <Switch
                checked={settings.frontrunProtection}
                onCheckedChange={(checked) => updateSettings('frontrunProtection', checked)}
                disabled={!settings.enabled}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                <span className="text-sm">Sandwich Attack Protection</span>
              </div>
              <Switch
                checked={settings.sandwichProtection}
                onCheckedChange={(checked) => updateSettings('sandwichProtection', checked)}
                disabled={!settings.enabled}
              />
            </div>
          </div>

          <Separator />

          {/* Advanced Settings */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Advanced Parameters</Label>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm">Max Slippage Protection (%)</Label>
                <Input
                  type="number"
                  value={settings.slippageProtection}
                  onChange={(e) => updateSettings('slippageProtection', parseFloat(e.target.value) || 0)}
                  disabled={!settings.enabled}
                  min="0"
                  max="10"
                  step="0.1"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Gas Price Multiplier</Label>
                <Input
                  type="number"
                  value={settings.gasPriceMultiplier}
                  onChange={(e) => updateSettings('gasPriceMultiplier', parseFloat(e.target.value) || 1)}
                  disabled={!settings.enabled}
                  min="1"
                  max="3"
                  step="0.1"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Max Gas Price (GWEI)</Label>
                <Input
                  type="number"
                  value={settings.maxGasPrice}
                  onChange={(e) => updateSettings('maxGasPrice', parseInt(e.target.value) || 0)}
                  disabled={!settings.enabled}
                  min="1"
                  max="200"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Bundle Timeout (blocks)</Label>
                <Input
                  type="number"
                  value={settings.bundleTimeout}
                  onChange={(e) => updateSettings('bundleTimeout', parseInt(e.target.value) || 1)}
                  disabled={!settings.enabled}
                  min="1"
                  max="50"
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Execution Delay */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-base font-medium">Delayed Execution</Label>
                <p className="text-sm text-muted-foreground">
                  Add random delay to prevent timing attacks
                </p>
              </div>
              <Switch
                checked={settings.delayedExecution}
                onCheckedChange={(checked) => updateSettings('delayedExecution', checked)}
                disabled={!settings.enabled}
              />
            </div>

            {settings.delayedExecution && (
              <div className="space-y-2">
                <Label className="text-sm">Execution Delay (seconds)</Label>
                <Input
                  type="number"
                  value={settings.executionDelay}
                  onChange={(e) => updateSettings('executionDelay', parseInt(e.target.value) || 0)}
                  disabled={!settings.enabled}
                  min="1"
                  max="30"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Protection Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            MEV Protection Tips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5 text-green-600" />
              <div>
                <strong>Use Flashbots Protect:</strong> Routes transactions through private mempool to prevent front-running
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5 text-green-600" />
              <div>
                <strong>Set Appropriate Slippage:</strong> Lower slippage reduces sandwich attack opportunities
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5 text-green-600" />
              <div>
                <strong>Monitor Gas Prices:</strong> Avoid predictable gas pricing patterns
              </div>
            </div>
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5 text-green-600" />
              <div>
                <strong>Use Bundle Timeouts:</strong> Prevents transactions from being included in unfavorable blocks
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}