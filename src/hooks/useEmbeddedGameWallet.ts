// src/hooks/useEmbeddedGameWallet.ts
import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Your Alchemy Solana RPC URL
const SOLANA_RPC_URL = 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';

interface GameWalletData {
  address: string;
  balance: string;
  isConnected: boolean;
}

export function useEmbeddedGameWallet() {
  const { authenticated } = usePrivy();
  const { wallets } = useWallets();
  const [wallet, setWallet] = useState<any>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [walletData, setWalletData] = useState<GameWalletData>({
    address: '',
    balance: '0',
    isConnected: false
  });

  // Find and set the embedded wallet
  useEffect(() => {
    console.log("Finding embedded wallet, wallets:", wallets);
    
    if (authenticated && wallets.length > 0) {
      // First look for a Solana-specific Privy wallet
      let privyWallet = wallets.find(w => 
        w.walletClientType === 'privy' && w.chainId === 'solana'
      );
      
      // If not found, accept any Privy wallet
      if (!privyWallet) {
        privyWallet = wallets.find(w => w.walletClientType === 'privy');
      }
      
      if (privyWallet) {
        console.log("Found Privy wallet:", privyWallet);
        setWallet(privyWallet);
        setWalletData({
          address: privyWallet.address,
          balance: '0', // Will be updated in the next effect
          isConnected: true
        });
      } else {
        console.warn("No Privy wallet found among available wallets");
      }
      
      setIsLoading(false);
    } else if (authenticated) {
      console.log("No wallets available yet");
      setIsLoading(true);
    } else {
      console.log("Not authenticated");
      setWallet(undefined);
      setWalletData({
        address: '',
        balance: '0',
        isConnected: false
      });
      setIsLoading(false);
    }
  }, [authenticated, wallets]);

  // Fetch wallet balance using your Alchemy RPC URL
  useEffect(() => {
    const fetchBalance = async () => {
      if (wallet && wallet.address) {
        try {
          console.log("Fetching balance for", wallet.address, "using Alchemy RPC");
          
          // Create connection using your Alchemy RPC URL
          const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
          const publicKey = new PublicKey(wallet.address);
          const lamports = await connection.getBalance(publicKey);
          const solBalance = (lamports / LAMPORTS_PER_SOL).toFixed(6);
          
          console.log("Balance retrieved:", solBalance, "SOL");
          
          setWalletData(prev => ({
            ...prev,
            balance: solBalance
          }));
        } catch (error) {
          console.error("Failed to fetch wallet balance:", error);
        }
      }
    };

    if (wallet?.address) {
      fetchBalance();
      const intervalId = setInterval(fetchBalance, 15000);
      return () => clearInterval(intervalId);
    }
  }, [wallet]);

  // Function to manually refresh balance
  const refreshBalance = async () => {
    if (!wallet || !wallet.address) return;
    
    try {
      // Use your Alchemy RPC URL for balance refresh
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      const publicKey = new PublicKey(wallet.address);
      const lamports = await connection.getBalance(publicKey);
      const solBalance = (lamports / LAMPORTS_PER_SOL).toFixed(6);
      
      setWalletData(prev => ({
        ...prev,
        balance: solBalance
      }));
      
      return solBalance;
    } catch (error) {
      console.error("Failed to refresh balance:", error);
      throw error;
    }
  };

  return {
    wallet,
    walletData,
    isLoading,
    refreshBalance
  };
}

export default useEmbeddedGameWallet;