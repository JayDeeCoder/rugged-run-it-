// src/hooks/useEmbeddedGameWallet.ts
import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { safeCreatePublicKey, isValidSolanaAddress } from '../utils/walletUtils';

// Your Alchemy Solana RPC URL
const SOLANA_RPC_URL = 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';

interface GameWalletData {
  address: string;
  balance: string;
  isConnected: boolean;
}

export function useEmbeddedGameWallet() {
  const { authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
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
      // Since we're using useSolanaWallets(), all wallets are already Solana wallets
      // Just find the first embedded/privy wallet
      const privyWallet = wallets.find(w => w.walletClientType === 'privy');
      
      if (privyWallet) {
        console.log("Found Privy wallet:", privyWallet);
        
        // Validate the wallet address before setting it
        if (isValidSolanaAddress(privyWallet.address)) {
          setWallet(privyWallet);
          setWalletData({
            address: privyWallet.address,
            balance: '0', // Will be updated in the next effect
            isConnected: true
          });
        } else {
          console.error("Privy wallet has invalid Solana address:", privyWallet.address);
          setWalletData({
            address: '',
            balance: '0',
            isConnected: false
          });
        }
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
      if (wallet && wallet.address && isValidSolanaAddress(wallet.address)) {
        try {
          console.log("Fetching balance for", wallet.address, "using Alchemy RPC");
          
          // Create connection using your Alchemy RPC URL
          const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
          
          // Safe PublicKey creation
          const publicKey = safeCreatePublicKey(wallet.address);
          if (!publicKey) {
            console.error('Invalid wallet address - cannot create PublicKey:', wallet.address);
            return;
          }
          
          const lamports = await connection.getBalance(publicKey);
          const solBalance = (lamports / LAMPORTS_PER_SOL).toFixed(6);
          
          console.log("Balance retrieved:", solBalance, "SOL");
          
          setWalletData(prev => ({
            ...prev,
            balance: solBalance
          }));
        } catch (error) {
          console.error("Failed to fetch wallet balance:", error);
          // Don't update balance on error to preserve last known value
        }
      } else if (wallet && wallet.address) {
        console.error("Cannot fetch balance - invalid wallet address:", wallet.address);
      }
    };

    if (wallet?.address && isValidSolanaAddress(wallet.address)) {
      fetchBalance();
      const intervalId = setInterval(fetchBalance, 15000);
      return () => clearInterval(intervalId);
    }
  }, [wallet]);

  // Function to manually refresh balance
  const refreshBalance = async () => {
    if (!wallet || !wallet.address || !isValidSolanaAddress(wallet.address)) {
      console.error('Cannot refresh balance - invalid wallet or address');
      return;
    }
    
    try {
      // Use your Alchemy RPC URL for balance refresh
      const connection = new Connection(SOLANA_RPC_URL, 'confirmed');
      
      // Safe PublicKey creation
      const publicKey = safeCreatePublicKey(wallet.address);
      if (!publicKey) {
        console.error('Invalid wallet address - cannot create PublicKey:', wallet.address);
        throw new Error('Invalid wallet address - cannot create PublicKey');
      }
      
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