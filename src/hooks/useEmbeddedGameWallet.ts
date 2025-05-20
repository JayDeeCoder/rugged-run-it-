// src/hooks/useEmbeddedGameWallet.ts
import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

interface GameWalletData {
  address: string;
  balance: string;
  isConnected: boolean;
}

export function useEmbeddedGameWallet() {
  const { authenticated, ready } = usePrivy();
  const { wallets } = useWallets();
  const [wallet, setWallet] = useState<any>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [walletData, setWalletData] = useState<GameWalletData>({
    address: '',
    balance: '0',
    isConnected: false
  });

  // Find the embedded wallet
  useEffect(() => {
    if (ready && authenticated && wallets.length > 0) {
      // Look for embedded wallet from Privy
      const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
      
      if (embeddedWallet) {
        setWallet(embeddedWallet);
        
        // Set basic wallet data
        setWalletData({
          address: embeddedWallet.address,
          balance: '0', // Will be updated in the next effect
          isConnected: true
        });
      } else {
        setWallet(undefined);
        setWalletData({
          address: '',
          balance: '0',
          isConnected: false
        });
      }
      
      setIsLoading(false);
    } else if (ready) {
      setWallet(undefined);
      setWalletData({
        address: '',
        balance: '0',
        isConnected: false
      });
      setIsLoading(false);
    }
  }, [ready, authenticated, wallets]);

  // Fetch and update the wallet balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (wallet && wallet.address) {
        try {
          // This is a simplified example - in a real app you'd use the Solana connection
          // to get the balance from the blockchain
          const fakeBalance = Math.random() * 10; // For demonstration only
          setWalletData(prev => ({
            ...prev,
            balance: fakeBalance.toFixed(4)
          }));
        } catch (error) {
          console.error('Failed to fetch wallet balance:', error);
        }
      }
    };

    if (wallet) {
      fetchBalance();
      // Refresh balance every 15 seconds
      const intervalId = setInterval(fetchBalance, 15000);
      return () => clearInterval(intervalId);
    }
  }, [wallet]);

  return {
    wallet,
    walletData,
    isLoading
  };
}

export default useEmbeddedGameWallet;