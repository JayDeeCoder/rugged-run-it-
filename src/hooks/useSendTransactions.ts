import { useWallets, usePrivy } from '@privy-io/react-auth';
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

export const useSendTransaction = () => {
  const { wallets } = useWallets();
  const { user } = usePrivy();
  
  // Get embedded wallet if exists
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  
  const sendSol = async (to: string, amount: number) => {
    if (!embeddedWallet) {
      throw new Error('Embedded wallet not connected');
    }
    
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'hhttps://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
    const connection = new Connection(rpcUrl);
    
    // Create transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(embeddedWallet.address),
        toPubkey: new PublicKey(to),
        lamports: amount * LAMPORTS_PER_SOL,
      })
    );
    
    // Get a recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = new PublicKey(embeddedWallet.address);
    
    try {
      // Since the specific API methods vary between versions,
      // use a more generic approach with type assertion
      const walletWithAnyMethods = embeddedWallet as any;
      
      // Check if the wallet has a sendTransaction method
      if (typeof walletWithAnyMethods.sendTransaction === 'function') {
        const serializedTx = transaction.serialize({ requireAllSignatures: false });
        const message = 'Please sign this transaction to send SOL';
        
        const signature = await walletWithAnyMethods.sendTransaction({
          transaction: serializedTx,
          message
        });
        
        return signature;
      }
      
      // Fallback to a simpler approach if no method is available
      console.warn('Cannot find appropriate transaction method on wallet. Using basic approach.');
      throw new Error('Wallet does not support transactions in the expected format.');
    } catch (error) {
      console.error('Transaction failed:', error);
      throw error;
    }
  };
  
  // Example function for placing a bet in your game
  const placeBet = async (amount: number, gameContractAddress: string) => {
    if (!embeddedWallet) {
      throw new Error('Embedded wallet not connected');
    }
    
    // Here you would implement the specific transaction for your game contract
    // This is a simplified example - you'd need to create the correct instruction
    // based on your game's smart contract
    
    try {
      // For now, we'll just simulate by sending SOL to the game contract address
      return await sendSol(gameContractAddress, amount);
    } catch (error) {
      console.error('Failed to place bet:', error);
      throw error;
    }
  };
  
  return { sendSol, placeBet, wallet: embeddedWallet };
};

export default useSendTransaction;