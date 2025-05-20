// src/services/SolanaWalletService.ts
import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL, Commitment } from '@solana/web3.js';
import logger from '../utils/logger';

/**
 * Service for Solana wallet operations
 * Handles common operations like sending SOL, checking balances, etc.
 */
class SolanaWalletService {
  private rpcUrl: string;
  private apiKey: string;
  
  constructor() {
    this.rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3 ';
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
      
      // Create transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey instanceof PublicKey 
            ? wallet.publicKey 
            : new PublicKey(wallet.publicKey.toString()),
          toPubkey: new PublicKey(recipientAddress),
          lamports: Math.floor(amount * LAMPORTS_PER_SOL),
        })
      );
      
      // Set recent blockhash and fee payer
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey instanceof PublicKey 
        ? wallet.publicKey 
        : new PublicKey(wallet.publicKey.toString());
      
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
      const publicKey = typeof address === 'string' ? new PublicKey(address) : address;
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