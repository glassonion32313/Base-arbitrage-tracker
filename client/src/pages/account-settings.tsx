import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, Key, User, Wallet, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function AccountSettings() {
  const [privateKey, setPrivateKey] = useState("");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updatePrivateKeyMutation = useMutation({
    mutationFn: async (privateKey: string) => {
      return await apiRequest("/api/auth/private-key", {
        method: "POST",
        body: { privateKey } as any,
      });
    },
    onSuccess: (response: any) => {
      toast({
        title: "Success",
        description: response.message || "Private key updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setPrivateKey("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update private key",
        variant: "destructive",
      });
    },
  });

  const handleUpdatePrivateKey = (e: React.FormEvent) => {
    e.preventDefault();
    if (!privateKey.trim()) {
      toast({
        title: "Error",
        description: "Please enter a private key",
        variant: "destructive",
      });
      return;
    }
    updatePrivateKeyMutation.mutate(privateKey);
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <User className="h-6 w-6" />
          <h1 className="text-3xl font-bold">Account Settings</h1>
        </div>
        <Link href="/">
          <Button variant="outline" className="flex items-center space-x-2">
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Trading</span>
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <User className="h-5 w-5" />
              <span>Account Information</span>
            </CardTitle>
            <CardDescription>
              Your account details and current status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Username</Label>
              <div className="mt-1 p-2 bg-gray-50 rounded border">
                {user.username}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Email</Label>
              <div className="mt-1 p-2 bg-gray-50 rounded border">
                {user.email}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Wallet Address</Label>
              <div className="mt-1 p-2 bg-gray-50 rounded border">
                {user.walletAddress || "Not configured"}
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Private Key Status</Label>
              <div className="mt-1 flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${user.hasPrivateKey ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className={user.hasPrivateKey ? 'text-green-700' : 'text-red-700'}>
                  {user.hasPrivateKey ? 'Configured' : 'Not configured'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Private Key Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Key className="h-5 w-5" />
              <span>Private Key</span>
            </CardTitle>
            <CardDescription>
              Add your private key to enable transaction execution
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdatePrivateKey} className="space-y-4">
              <div>
                <Label htmlFor="privateKey">Private Key</Label>
                <div className="mt-1 relative">
                  <Input
                    id="privateKey"
                    type={showPrivateKey ? "text" : "password"}
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="Enter your private key (0x...)"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                  >
                    {showPrivateKey ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Your private key is encrypted and stored securely
                </p>
              </div>
              <Button 
                type="submit" 
                className="w-full"
                disabled={updatePrivateKeyMutation.isPending}
              >
                {updatePrivateKeyMutation.isPending ? "Updating..." : "Update Private Key"}
              </Button>
            </form>

            {!user.hasPrivateKey && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <Wallet className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-800">Private Key Required</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      You need to add your private key to execute transactions. 
                      Without it, you can only view opportunities but cannot trade.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Security Notice */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-700">Security Notice</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-600 space-y-2">
            <p>
              <strong>Important:</strong> Your private key gives full access to your wallet. 
              Only use this application on trusted devices and networks.
            </p>
            <p>
              Private keys are encrypted before storage, but you should only use wallets 
              specifically created for trading with funds you can afford to lose.
            </p>
            <p>
              Never share your private key with anyone or enter it on untrusted websites.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}