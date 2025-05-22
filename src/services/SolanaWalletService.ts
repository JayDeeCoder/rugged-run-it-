// src/services/SolanaWalletService.ts
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Commitment } from '@solana/web3.js';
import { safeCreatePublicKey, isValidSolanaAddress } from '../utils/walletUtils';
import logger from '../utils/logger';

/**
 * Service for Solana wallet operations
 * Handles common operations like sending SOL, checking balances, etc.
 */
class SolanaWalletService {
  private rpcUrl: string;
  private apiKey: string;
  
  constructor() {
    this.rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
    this.apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '6CqgIf5nqVF9rWeernULokib0PAr6yh3';
  }
  
  /**
   * Get a connection to the Solana network
   */
  async getConnection(): Promise<Connection> {
    return new Connection(this.rpcUrl, {
      commitment: 'confirmed' as Commitment,
      httpHeaders: {
        'x-api-key': this.apiKey
      }
    });
  }
  
  /**
   * Send SOL from a wallet to a recipient
   * @param wallet The wallet object with signTransaction method
   * @param recipientAddress Recipient's Solana address
   * @param amount Amount of SOL to send
   * @returns Transaction signature
   */
  async sendSol(wallet: any, recipientAddress: string, amount: number): Promise<string> {
    try {
      const connection = await this.getConnection();
      
      // Validate inputs
      if (!wallet || !wallet.publicKey) {
        throw new Error('Invalid wallet');
      }
      
      if (!recipientAddress) {
        throw new Error('Invalid recipient address');
      }
      
      if (amount <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      
      // Validate recipient address before using
      if (!isValidSolanaAddress(recipientAddress)) {
        console.error('Invalid recipient address:', recipientAddress);
        throw new Error('Invalid recipient address provided');
      }
      
      // Create PublicKey instances with safe creation
      let fromPubkey: PublicKey;
      if (wallet.publicKey instanceof PublicKey) {
        fromPubkey = wallet.publicKey;
      } else {
        const walletAddressString = wallet.publicKey.toString();
        if (!isValidSolanaAddress(walletAddressString)) {
          console.error('Invalid wallet address:', walletAddressString);
          throw new Error('Invalid wallet address');
        }
        
        const safeFromPubkey = safeCreatePublicKey(walletAddressString);
        if (!safeFromPubkey) {
          console.error('Failed to create wallet PublicKey:', walletAddressString);
          throw new Error('Failed to create wallet PublicKey');
        }
        fromPubkey = safeFromPubkey;
      }
      
      const toPubkey = safeCreatePublicKey(recipientAddress);
      if (!toPubkey) {
        console.error('Failed to create recipient PublicKey:', recipientAddress);
        throw new Error('Failed to create recipient PublicKey');
      }
      
      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: Math.floor(amount * LAMPORTS_PER_SOL),
        })
      );
      
      // Set recent blockhash and fee payer
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;
      
      // Sign transaction
      if (!wallet.signTransaction) {
        throw new Error('Wallet does not support signTransaction');
      }
      
      const signedTransaction = await wallet.signTransaction(transaction);
      
      // Send transaction
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      // Wait for confirmation
      await connection.confirmTransaction(signature);
      
      logger.info(`SOL transfer completed: ${amount} SOL to ${recipientAddress.substring(0, 8)}...`);
      return signature;
    } catch (error) {
      logger.error('Error sending SOL:', error);
      throw error;
    }
  }
  
  /**
   * Get SOL balance for an address
   * @param address Solana address or PublicKey
   * @returns Balance in SOL
   */
  async getBalance(address: string | PublicKey): Promise<number> {
    try {
      const connection = await this.getConnection();
      
      let publicKey: PublicKey;
      if (typeof address === 'string') {
        // Validate address before using
        if (!isValidSolanaAddress(address)) {
          console.error('Invalid wallet address:', address);
          return 0;
        }
        
        const safePublicKey = safeCreatePublicKey(address);
        if (!safePublicKey) {
          console.error('Failed to create PublicKey:', address);
          return 0;
        }
        publicKey = safePublicKey;
      } else {
        publicKey = address;
      }
      
      const lamports = await connection.getBalance(publicKey);
      return lamports / LAMPORTS_PER_SOL;
    } catch (error) {
      logger.error('Error getting balance:', error);
      return 0;
    }
  }
  
  /**
   * Get transaction details
   * @param signature Transaction signature
   * @returns Transaction details
   */
  async getTransaction(signature: string): Promise<any> {
    try {
      const connection = await this.getConnection();
      return await connection.getTransaction(signature);
    } catch (error) {
      logger.error('Error getting transaction:', error);
      return null;
    }
  }
}

export const solanaWalletService = new SolanaWalletService();
export default solanaWalletService;