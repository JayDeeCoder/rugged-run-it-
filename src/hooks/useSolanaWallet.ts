// src/hooks/useSolanaWallet.ts
import { useState, useEffect, useCallback } from 'react';
import { useSolanaWallets } from '@privy-io/react-auth/solana';
import { usePrivy } from '@privy-io/react-auth';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from '@solana/web3.js';
import { toast } from 'react-hot-toast';
import { safeCreatePublicKey, isValidSolanaAddress } from '../utils/walletUtils';

export interface SolanaWalletData {
  address: string | null;
  balance: string;
  isReady: boolean;
  isCreating: boolean;
  isConnected: boolean;
}

export const useSolanaWallet = () => {
  const { authenticated, ready } = usePrivy();
  const { wallets, createWallet } = useSolanaWallets();
  const [isCreating, setIsCreating] = useState(false);
  const [balance, setBalance] = useState<string>("0");
  const [isReady, setIsReady] = useState(false);
  
  // Get the first Solana wallet if available
  const solanaWallet = wallets[0];

  // Create a Solana wallet
  const createSolanaWallet = useCallback(async (options?: { createAdditional?: boolean, walletIndex?: number }) => {
    if (!authenticated) {
      toast.error('Please login first');
      return null;
    }
    
    setIsCreating(true);
    try {
      const wallet = await createWallet(options);
      toast.success('Solana wallet created successfully!');
      return wallet;
    } catch (error) {
      console.error('Failed to create Solana wallet:', error);
      toast.error('Failed to create Solana wallet. Please try again.');
      throw error;
    } finally {
      setIsCreating(false);
    }
  }, [authenticated, createWallet]);

  // Auto-create wallet effect
  useEffect(() => {
    const autoCreateWallet = async () => {
      if (ready && authenticated && wallets.length === 0 && !isCreating) {
        try {
          setIsCreating(true);
          await createWallet();
          toast.success('Solana wallet created automatically');
        } catch (error) {
          console.error('Auto Solana wallet creation failed:', error);
        } finally {
          setIsCreating(false);
        }
      }
    };
    
    autoCreateWallet();
  }, [ready, authenticated, wallets, isCreating, createWallet]);

  // Function to fetch wallet balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (solanaWallet?.address) {
        try {
          // Validate address before using
          if (!isValidSolanaAddress(solanaWallet.address)) {
            console.error('Invalid wallet address:', solanaWallet.address);
            setBalance("0");
            return;
          }

          // Setup connection with Alchemy RPC
          const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
          const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '6CqgIf5nqVF9rWeernULokib0PAr6yh3';
          
          const connection = new Connection(rpcUrl, {
            commitment: 'confirmed',
            httpHeaders: {
              'x-api-key': apiKey
            }
          });
          
          // Get the balance using the wallet address
          const publicKey = safeCreatePublicKey(solanaWallet.address);
          if (!publicKey) {
            console.error('Invalid address:', solanaWallet.address);
            setBalance("0");
            return;
          }

          const lamports = await connection.getBalance(publicKey);
          const solBalance = (lamports / LAMPORTS_PER_SOL).toFixed(6);
          
          setBalance(solBalance);
        } catch (error) {
          console.error('Error fetching Solana wallet balance:', error);
          setBalance("0");
        }
      }
    };

    fetchBalance();
    
    // Set up polling interval for balance updates
    const interval = setInterval(fetchBalance, 15000);
    
    return () => clearInterval(interval);
  }, [solanaWallet]);

  // Send SOL to another address
  const sendSol = async (to: string, amount: number) => {
    if (!solanaWallet) {
      throw new Error('Solana wallet not connected');
    }

    // Validate wallet address before using
    if (!isValidSolanaAddress(solanaWallet.address)) {
      console.error('Invalid wallet address:', solanaWallet.address);
      throw new Error('Invalid wallet address');
    }

    // Validate recipient address before using
    if (!isValidSolanaAddress(to)) {
      console.error('Invalid recipient address:', to);
      throw new Error('Invalid recipient address');
    }

    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3',
        {
          commitment: 'confirmed',
          httpHeaders: {
            'x-api-key': process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '6CqgIf5nqVF9rWeernULokib0PAr6yh3'
          }
        }
      );
      
      // Create transaction with safe PublicKey creation
      const fromPubkey = safeCreatePublicKey(solanaWallet.address);
      if (!fromPubkey) {
        console.error('Invalid address:', solanaWallet.address);
        throw new Error('Invalid wallet address');
      }

      const toPubkey = safeCreatePublicKey(to);
      if (!toPubkey) {
        console.error('Invalid address:', to);
        throw new Error('Invalid recipient address');
      }

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: Math.floor(amount * LAMPORTS_PER_SOL)
        })
      );
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey; // Reuse the same PublicKey instance
      
      // Sign and send transaction
      const signedTransaction = await solanaWallet.signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      await connection.confirmTransaction(signature);
      
      toast.success(`Sent ${amount} SOL to ${to.substring(0, 6)}...${to.substring(to.length - 4)}`);
      return { signature };
    } catch (error) {
      console.error('Transaction failed:', error);
      toast.error('Transaction failed');
      throw error;
    }
  };

  // Create wallet data object
  const walletData: SolanaWalletData = {
    address: solanaWallet?.address || null,
    balance,
    isReady: !!solanaWallet,
    isCreating,
    isConnected: !!solanaWallet
  };

  return {
    wallet: solanaWallet,
    wallets,
    walletData,
    createWallet: createSolanaWallet,
    sendTransaction: sendSol,
    balance
  };
};

export default useSolanaWallet;