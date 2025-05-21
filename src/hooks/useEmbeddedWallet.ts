// useEmbeddedWallet.ts
import { useState, useEffect, useCallback } from 'react';
import { useWallets, usePrivy, ConnectedWallet } from '@privy-io/react-auth';
import { Connection, PublicKey, LAMPORTS_PER_SOL, Commitment, Transaction, SystemProgram } from '@solana/web3.js';
import { toast } from 'react-hot-toast';

interface ExtendedConnectedWallet extends ConnectedWallet {
  signTransaction?: (transaction: any) => Promise<any>;
  signAndSendTransaction?: (options: any) => Promise<any>;
}

export interface WalletData {
  address: string | null;
  balance: string;
  isReady: boolean;
  isCreating: boolean;
  isConnected: boolean;
}

export const useEmbeddedWallet = () => {
  const { wallets } = useWallets();
  const { authenticated, createWallet, ready } = usePrivy();
  const [isCreating, setIsCreating] = useState(false);
  const [balance, setBalance] = useState<string>("0");
  const [isReady, setIsReady] = useState(false);
  const [isLoadingWallets, setIsLoadingWallets] = useState(true);

  // Find only Solana embedded wallets
  const embeddedWallet = wallets.find(wallet => 
    wallet.walletClientType === 'privy' && 
    wallet.chainId === 'solana'
  ) as ExtendedConnectedWallet | undefined;

  // Update loading state when wallets are loaded
  useEffect(() => {
    if (ready && wallets) {
      setIsLoadingWallets(false);
    }
  }, [ready, wallets]);

  // Create a Solana wallet if it doesn't exist
  const createEmbeddedWallet = useCallback(async () => {
    if (!authenticated || isCreating) {
      return null;
    }
    
    if (embeddedWallet) {
      return true;
    }
    
    setIsCreating(true);
    try {
      // Explicitly create a Solana wallet
      await createWallet();
      toast.success('Wallet created successfully');
      return true;
    } catch (error) {
      console.error('Failed to create wallet:', error);
      toast.error('Failed to create wallet. Please try again.');
      throw error;
    } finally {
      setIsCreating(false);
    }
  }, [authenticated, embeddedWallet, createWallet, isCreating]);

  // Auto-create wallet effect
  useEffect(() => {
    const autoCreateWallet = async () => {
      if (ready && authenticated && !embeddedWallet && !isLoadingWallets && !isCreating) {
        try {
          setIsCreating(true);
          await createWallet();
          toast.success('Wallet created automatically');
        } catch (error) {
          console.error('Auto wallet creation failed:', error);
        } finally {
          setIsCreating(false);
        }
      }
    };
    
    autoCreateWallet();
  }, [ready, authenticated, embeddedWallet, isLoadingWallets, isCreating, createWallet]);

  // Function to fetch wallet balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (embeddedWallet) {
        try {
          // Use environment variables for production endpoints
          const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
          const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
          
          const connection = new Connection(rpcUrl, {
            commitment: 'confirmed' as Commitment,
            httpHeaders: apiKey ? {
              'x-api-key': apiKey
            } : undefined
          });
          
          // Get the balance using the embedded wallet address
          const publicKey = new PublicKey(embeddedWallet.address);
          const lamports = await connection.getBalance(publicKey);
          const solBalance = (lamports / LAMPORTS_PER_SOL).toFixed(6);
          
          setBalance(solBalance);
        } catch (error) {
          console.error('Error fetching wallet balance:', error);
          // Don't update balance on error to keep last known value
        }
      }
    };

    fetchBalance();
    
    // Set up polling interval for balance updates
    const interval = setInterval(fetchBalance, 15000);
    
    return () => clearInterval(interval);
  }, [embeddedWallet]);

  // Update ready state
  useEffect(() => {
    setIsReady(ready && !isLoadingWallets && !!embeddedWallet);
  }, [ready, isLoadingWallets, embeddedWallet]);

  // Send transaction function for transactions
  const sendTransaction = async (to: string, amount: number) => {
    if (!embeddedWallet) {
      throw new Error('Wallet not connected');
    }

    try {
      const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
      const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '';
      
      const connection = new Connection(rpcUrl, {
        commitment: 'confirmed' as Commitment,
        httpHeaders: apiKey ? {
          'x-api-key': apiKey
        } : undefined
      });
      
      // Get sender public key
      const fromPubkey = new PublicKey(embeddedWallet.address);
      const toPubkey = new PublicKey(to);
      
      // Create transaction
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
      transaction.feePayer = fromPubkey;
      
      // Handle different wallet signing methods
      if (embeddedWallet.signAndSendTransaction) {
        const result = await embeddedWallet.signAndSendTransaction({
          transaction: transaction.serialize({ requireAllSignatures: false }),
          message: `Transaction: ${amount} SOL to ${to.slice(0, 8)}...`
        });
        return { signature: result.signature || result };
      } else if (embeddedWallet.signTransaction) {
        const signedTransaction = await embeddedWallet.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());
        await connection.confirmTransaction(signature);
        return { signature };
      } else {
        throw new Error('Wallet does not support required transaction methods');
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      toast.error('Transaction failed');
      throw error;
    }
  };

  // Place a bet transaction
  const placeBet = async (amount: number, gameContract: string) => {
    if (!embeddedWallet) {
      throw new Error('Wallet not connected');
    }
    
    try {
      const result = await sendTransaction(gameContract, amount);
      toast.success(`Bet of ${amount} SOL placed successfully!`);
      return result;
    } catch (error) {
      console.error('Error placing bet:', error);
      toast.error('Failed to place bet');
      throw error;
    }
  };
  
  // Cashout transaction
  const cashout = async (gameContract: string, amount: number) => {
    if (!embeddedWallet) {
      throw new Error('Wallet not connected');
    }
    
    try {
      // In production, this would call the game contract's cashout function
      // For now, we just log the intent since we don't have the actual contract implementation
      const result = await sendTransaction(gameContract, 0.00001); // Minimal transaction to trigger the cashout
      toast.success(`Cashout successful`);
      return result;
    } catch (error) {
      console.error('Error cashing out:', error);
      toast.error('Failed to cash out');
      throw error;
    }
  };

  // Get wallet data
  const walletData: WalletData = {
    address: embeddedWallet?.address || null,
    balance,
    isReady,
    isCreating,
    isConnected: !!embeddedWallet
  };

  return {
    wallet: embeddedWallet,
    walletData,
    createWallet: createEmbeddedWallet,
    sendTransaction,
    placeBet,
    cashout,
    balance
  };
};

export default useEmbeddedWallet;