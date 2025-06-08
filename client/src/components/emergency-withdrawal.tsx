import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

export function EmergencyWithdrawal() {
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const withdrawMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/emergency-withdraw', {
        method: 'POST'
      });
    },
    onSuccess: (data) => {
      setResult(data);
      if (data.success) {
        toast({
          title: "Withdrawal Successful",
          description: `Recovered ${data.recovered} ETH from contract`,
        });
      } else {
        toast({
          title: "Withdrawal Failed",
          description: data.message || data.error,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Withdrawal Error",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  const handleWithdraw = async () => {
    setIsWithdrawing(true);
    try {
      await withdrawMutation.mutateAsync();
    } finally {
      setIsWithdrawing(false);
    }
  };

  return (
    <Card className="max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-red-600">Emergency ETH Recovery</CardTitle>
        <CardDescription>
          Recover 0.0003 ETH stuck in contract
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            Contract: 0x675f26375aB7E5a35279CF3AE37C26a3004b9ae4
            <br />
            Your Wallet: 0xa4Cadc8C3b9Ec33E1053F3309A4bAABc2c8a8895
            <br />
            Recoverable: ~0.0003 ETH (~$0.80)
          </AlertDescription>
        </Alert>

        {result && (
          <Alert className={result.success ? "border-green-500" : "border-red-500"}>
            <AlertDescription>
              {result.success ? (
                <div>
                  <div>✅ Recovered: {result.recovered} ETH</div>
                  <div>💰 New Balance: {result.newWalletBalance} ETH</div>
                  <div>🔗 <a href={result.basescan} target="_blank" rel="noopener noreferrer" 
                           className="text-blue-600 underline">View on BaseScan</a></div>
                </div>
              ) : (
                <div>❌ {result.message || result.error}</div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <Button 
          onClick={handleWithdraw}
          disabled={isWithdrawing || withdrawMutation.isPending}
          className="w-full"
          variant={result?.success ? "outline" : "default"}
        >
          {isWithdrawing || withdrawMutation.isPending ? 'Withdrawing...' : 'Recover ETH from Contract'}
        </Button>

        <div className="text-sm text-gray-600">
          <p>⚠️ Requires minimal gas in wallet to execute withdrawal</p>
          <p>💡 Add ~0.0002 ETH to wallet first if transaction fails</p>
        </div>
      </CardContent>
    </Card>
  );
}