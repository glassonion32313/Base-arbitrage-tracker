import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Bell, BellOff, Settings, TrendingUp, DollarSign, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useWebSocket } from "@/hooks/use-websocket";

interface NotificationSettings {
  enabled: boolean;
  minProfitThreshold: number;
  soundEnabled: boolean;
  desktopNotifications: boolean;
  emailAlerts: boolean;
}

interface ProfitAlert {
  id: string;
  tokenPair: string;
  profit: number;
  timestamp: Date;
  buyDex: string;
  sellDex: string;
}

export default function NotificationCenter() {
  const [settings, setSettings] = useState<NotificationSettings>({
    enabled: true,
    minProfitThreshold: 25,
    soundEnabled: true,
    desktopNotifications: true,
    emailAlerts: false
  });
  
  const [recentAlerts, setRecentAlerts] = useState<ProfitAlert[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>("default");
  const { toast } = useToast();

  useEffect(() => {
    // Check notification permission status
    if ('Notification' in window) {
      setPermissionStatus(Notification.permission);
    }

    // Load settings from localStorage
    const savedSettings = localStorage.getItem('arbitrage-notifications');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }

    // Load recent alerts from localStorage
    const savedAlerts = localStorage.getItem('arbitrage-alerts');
    if (savedAlerts) {
      const alerts = JSON.parse(savedAlerts).map((alert: any) => ({
        ...alert,
        timestamp: new Date(alert.timestamp)
      }));
      setRecentAlerts(alerts);
    }
  }, []);

  useEffect(() => {
    if (!settings.enabled) return;

    // Monitor for new opportunities and trigger alerts
    const checkForAlerts = async () => {
      try {
        const response = await fetch('/api/opportunities?limit=10');
        const opportunities = await response.json();
        
        const profitableOps = opportunities.filter((op: any) => 
          parseFloat(op.netProfit) >= settings.minProfitThreshold
        );
        
        profitableOps.forEach((op: any) => {
          const alertId = `${op.tokenPair}-${op.buyDex}-${op.sellDex}-${op.id}`;
          const existingAlert = recentAlerts.find(alert => alert.id === alertId);
          
          if (!existingAlert) {
            const newAlert: ProfitAlert = {
              id: alertId,
              tokenPair: op.tokenPair,
              profit: parseFloat(op.netProfit),
              timestamp: new Date(),
              buyDex: op.buyDex,
              sellDex: op.sellDex
            };
            
            triggerAlert(newAlert);
            setRecentAlerts(prev => {
              const updated = [newAlert, ...prev.slice(0, 9)];
              localStorage.setItem('arbitrage-alerts', JSON.stringify(updated));
              return updated;
            });
          }
        });
      } catch (error) {
        console.error('Failed to check for alerts:', error);
      }
    };

    const interval = setInterval(checkForAlerts, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [settings, recentAlerts]);

  const triggerAlert = (alert: ProfitAlert) => {
    // Toast notification
    toast({
      title: "🚨 Profitable Opportunity!",
      description: `${alert.tokenPair}: $${alert.profit.toFixed(2)} profit via ${alert.buyDex} → ${alert.sellDex}`,
      duration: 8000,
      variant: "default"
    });

    // Sound notification
    if (settings.soundEnabled) {
      playAlertSound();
    }

    // Desktop notification
    if (settings.desktopNotifications && permissionStatus === "granted") {
      new Notification("Arbitrage Opportunity Detected", {
        body: `${alert.tokenPair}: $${alert.profit.toFixed(2)} profit potential`,
        icon: "/favicon.ico",
        tag: alert.id
      });
    }
  };

  const playAlertSound = () => {
    // Create a simple beep sound using Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800; // 800 Hz tone
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setPermissionStatus(permission);
      
      if (permission === "granted") {
        toast({
          title: "Notifications Enabled",
          description: "You'll now receive desktop alerts for profitable opportunities",
          variant: "default"
        });
      }
    }
  };

  const updateSettings = (key: keyof NotificationSettings, value: any) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    localStorage.setItem('arbitrage-notifications', JSON.stringify(newSettings));
  };

  const formatTimeAgo = (timestamp: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - timestamp.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return "Just now";
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const hours = Math.floor(diffInMinutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Profit Alerts
            <Badge variant={settings.enabled ? "default" : "secondary"} className="ml-auto">
              {settings.enabled ? "Active" : "Disabled"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Get instant notifications when profitable arbitrage opportunities are detected
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Enable Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Turn on/off all profit alert notifications
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) => updateSettings('enabled', checked)}
            />
          </div>

          <Separator />

          {/* Profit Threshold */}
          <div className="space-y-3">
            <Label className="text-base font-medium">Minimum Profit Threshold</Label>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input
                type="number"
                value={settings.minProfitThreshold}
                onChange={(e) => updateSettings('minProfitThreshold', parseFloat(e.target.value) || 0)}
                className="w-32"
                min="1"
                step="1"
              />
              <span className="text-sm text-muted-foreground">minimum net profit</span>
            </div>
          </div>

          <Separator />

          {/* Notification Methods */}
          <div className="space-y-4">
            <Label className="text-base font-medium">Notification Methods</Label>
            
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  <span className="text-sm">Sound Alerts</span>
                </div>
                <Switch
                  checked={settings.soundEnabled}
                  onCheckedChange={(checked) => updateSettings('soundEnabled', checked)}
                  disabled={!settings.enabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  <span className="text-sm">Desktop Notifications</span>
                  {permissionStatus === "denied" && (
                    <Badge variant="destructive" className="text-xs">Blocked</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {permissionStatus !== "granted" && (
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={requestNotificationPermission}
                      disabled={!settings.enabled}
                    >
                      Enable
                    </Button>
                  )}
                  <Switch
                    checked={settings.desktopNotifications && permissionStatus === "granted"}
                    onCheckedChange={(checked) => updateSettings('desktopNotifications', checked)}
                    disabled={!settings.enabled || permissionStatus !== "granted"}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Alerts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Recent Alerts
            <Badge variant="outline" className="ml-auto">
              {recentAlerts.length}
            </Badge>
          </CardTitle>
          <CardDescription>
            Your latest profit opportunity notifications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentAlerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <BellOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No recent alerts</p>
              <p className="text-sm">Profitable opportunities will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAlerts.map((alert) => (
                <div 
                  key={alert.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <div className="font-medium">{alert.tokenPair}</div>
                    <div className="text-sm text-muted-foreground">
                      {alert.buyDex} → {alert.sellDex}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-green-600 dark:text-green-400">
                      +${alert.profit.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatTimeAgo(alert.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}