import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Wallet, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

export default function WalletConnect() {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState("");
  const { toast } = useToast();

  const connectWallet = async () => {
    try {
      if (typeof window.ethereum !== 'undefined') {
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts' 
        });
        
        if (accounts.length > 0) {
          setIsConnected(true);
          setAddress(accounts[0]);
          toast({
            title: "Wallet connected",
            description: `Connected to ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`,
          });
        }
      } else {
        toast({
          title: "Wallet not found",
          description: "Please install MetaMask or another Web3 wallet",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Connection failed",
        description: "Failed to connect wallet",
        variant: "destructive",
      });
    }
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setAddress("");
    toast({
      title: "Wallet disconnected",
      description: "Your wallet has been disconnected",
    });
  };

  if (isConnected) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="bg-primary-blue hover:bg-blue-600 text-white flex items-center space-x-2">
            <Wallet className="w-4 h-4" />
            <span>{address.slice(0, 6)}...{address.slice(-4)}</span>
            <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-dark-secondary border-slate-700">
          <DropdownMenuItem 
            className="text-slate-300 hover:text-white hover:bg-dark-tertiary cursor-pointer"
            onClick={() => navigator.clipboard.writeText(address)}
          >
            Copy Address
          </DropdownMenuItem>
          <DropdownMenuItem 
            className="text-slate-300 hover:text-white hover:bg-dark-tertiary cursor-pointer"
            onClick={disconnectWallet}
          >
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button 
      onClick={connectWallet}
      className="bg-primary-blue hover:bg-blue-600 text-white flex items-center space-x-2"
    >
      <Wallet className="w-4 h-4" />
      <span>Connect Wallet</span>
    </Button>
  );
}
