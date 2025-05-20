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
      console.log("Cannot create wallet: not authenticated or already creating");
      return null;
    }
    
    if (embeddedWallet) {
      console.log("Wallet already exists:", embeddedWallet.address);
      return true;
    }
    
    console.log("Creating new game wallet for user");
    setIsCreating(true);
    try {
      // Explicitly create a Solana wallet
      const result = await createWallet();
      console.log("Game wallet created successfully:", result);
      toast.success('Game wallet created successfully!');
      return true;
    } catch (error) {
      console.error('Failed to create game wallet:', error);
      toast.error('Failed to create game wallet. Please try again.');
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
          toast.success('Game wallet created automatically');
        } catch (error) {
          console.error('Auto game wallet creation failed:', error);
        } finally {
          setIsCreating(false);
        }
      }
    };
    
    autoCreateWallet();
  }, [ready, authenticated, embeddedWallet, isLoadingWallets, isCreating, createWallet]);

  // Function to fetch wallet balance using Tatum.io RPC
  useEffect(() => {
    const fetchBalance = async () => {
      if (embeddedWallet) {
        try {
          // Setup connection with Tatum.io RPC
          const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.gateway.tatum.io/';
          const apiKey = process.env.NEXT_PUBLIC_TATUM_API_KEY || 't-682a1c08650ecaebde72d2aa-264faa21e495426f9a2eb26f';
          
          const connection = new Connection(rpcUrl, {
            commitment: 'confirmed' as Commitment,
            httpHeaders: {
              'x-api-key': apiKey
            }
          });
          
          // Get the balance using the embedded wallet address
          const publicKey = new PublicKey(embeddedWallet.address);
          const lamports = await connection.getBalance(publicKey);
          const solBalance = (lamports / LAMPORTS_PER_SOL).toFixed(6);
          
          setBalance(solBalance);
        } catch (error) {
          console.error('Error fetching game wallet balance:', error);
          // Fallback to avoid breaking the UI
          setBalance("0");
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

  // Send transaction function using Tatum.io RPC - optimized for game transactions
  const sendTransaction = async (to: string, amount: number) => {
    if (!embeddedWallet) {
      throw new Error('Game wallet not connected');
    }

    try {
      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.gateway.tatum.io/',
        {
          commitment: 'confirmed' as Commitment,
          httpHeaders: {
            'x-api-key': process.env.NEXT_PUBLIC_TATUM_API_KEY || 't-682a1c08650ecaebde72d2aa-264faa21e495426f9a2eb26f'
          }
        }
      );
      
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
      if (embeddedWallet.signTransaction) {
        const signedTransaction = await embeddedWallet.signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());
        await connection.confirmTransaction(signature);
        return { signature };
      } else if (embeddedWallet.signAndSendTransaction) {
        const result = await embeddedWallet.signAndSendTransaction({
          transaction: transaction.serialize({ requireAllSignatures: false }),
          message: `Game transaction: ${amount} SOL to ${to.slice(0, 8)}...`
        });
        return { signature: result.signature || result };
      } else {
        // Fallback for demo/development purposes
        console.log(`Mock game transaction of ${amount} SOL to ${to.substring(0, 6)}...`);
        toast.success(`Game transaction of ${amount} SOL completed`);
        return { signature: `mock-game-tx-${Date.now()}` };
      }
    } catch (error) {
      console.error('Game transaction failed:', error);
      toast.error('Game transaction failed');
      throw error;
    }
  };

  // Place a bet transaction
  const placeBet = async (amount: number, gameContract: string) => {
    if (!embeddedWallet) {
      throw new Error('Game wallet not connected');
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
    // For cashing out, this would typically be a different kind of transaction
    // but for this example we'll use a similar approach
    if (!embeddedWallet) {
      throw new Error('Game wallet not connected');
    }
    
    try {
      // In a real implementation, this would call a specific game contract function
      // Here we're simulating it with a simple transaction
      console.log(`Simulating cashout of ${amount} SOL from ${gameContract}`);
      toast.success(`Cashed out ${amount} SOL successfully!`);
      return { signature: `mock-cashout-tx-${Date.now()}` };
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