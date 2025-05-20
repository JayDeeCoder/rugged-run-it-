import { useState, useEffect } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

export const useSmartWalletBalance = (refreshInterval = 15000) => {
  const { wallets } = useWallets();
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  // Get embedded wallet if available
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

  useEffect(() => {
    if (!embeddedWallet) {
      setLoading(false);
      return;
    }

    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl);

    const fetchBalance = async () => {
      try {
        setLoading(true);
        const publicKey = new PublicKey(embeddedWallet.address);
        const lamports = await connection.getBalance(publicKey);
        setBalance(lamports / LAMPORTS_PER_SOL);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch balance:', err);
        setError(err instanceof Error ? err : new Error('Failed to fetch balance'));
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();

    // Set up interval to refresh balance
    const intervalId = setInterval(fetchBalance, refreshInterval);
    
    return () => clearInterval(intervalId);
  }, [embeddedWallet, refreshInterval]);

  return { balance, loading, error };
};

export default useSmartWalletBalance;