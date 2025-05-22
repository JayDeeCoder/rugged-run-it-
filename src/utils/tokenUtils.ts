// src/utils/tokenUtils.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { safeCreatePublicKey, isValidSolanaAddress } from './walletUtils';

/**
 * Fetches the balance of an SPL token for a given wallet address
 * @param connection Solana connection
 * @param owner Wallet public key
 * @param tokenMint Token mint address
 * @returns Token balance as a number
 */
export const getTokenBalance = async (
  connection: Connection, 
  owner: PublicKey, 
  tokenMint: string
): Promise<number> => {
  try {
    // Validate token mint address
    if (!isValidSolanaAddress(tokenMint)) {
      console.error('Invalid token mint address:', tokenMint);
      return 0;
    }

    // Use Alchemy API endpoint for token accounts
    const endpoint = `${process.env.NEXT_PUBLIC_ALCHEMY_API_ENDPOINT || 'https://solana-mainnet.g.alchemy.com'}/v2/solana/account/tokenBalance/${tokenMint}/${owner.toString()}`;
    
    const response = await fetch(endpoint, {
      headers: {
        'x-api-key': process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '6CqgIf5nqVF9rWeernULokib0PAr6yh3'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch token balance');
    }
    
    const data = await response.json();
    return data.balance || 0;
  } catch (error) {
    console.error('Error fetching token balance:', error);
    
    // Fallback to manual token account lookup if API fails
    try {
      // Safely create the token mint PublicKey
      const tokenMintPubkey = safeCreatePublicKey(tokenMint);
      if (!tokenMintPubkey) {
        console.error('Failed to create PublicKey for token mint:', tokenMint);
        return 0;
      }

      // This is a simplified version - in production you would use
      // getParsedTokenAccountsByOwner and add proper error handling
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        owner,
        { mint: tokenMintPubkey }
      );
      
      // Get the first token account with this mint
      if (tokenAccounts.value.length > 0) {
        const tokenAccount = tokenAccounts.value[0];
        const parsedInfo = tokenAccount.account.data.parsed.info;
        const balance = parsedInfo.tokenAmount.uiAmount;
        return balance || 0;
      }
      
      return 0; // No accounts found
    } catch (fallbackError) {
      console.error('Fallback token balance check failed:', fallbackError);
      return 0;
    }
  }
};

/**
 * Updates the TokenContext with the current RUGGED token balance
 * @param connection Solana connection
 * @param owner Wallet public key
 * @param tokenMint RUGGED token mint address
 * @param setRuggedBalance Function to update the balance state
 */
export const updateRuggedTokenBalance = async (
  connection: Connection,
  owner: PublicKey,
  tokenMint: string,
  setRuggedBalance: (balance: number) => void
): Promise<void> => {
  try {
    // Validate inputs
    if (!connection) {
      console.error('Connection is required');
      return;
    }

    if (!owner) {
      console.error('Owner PublicKey is required');
      return;
    }

    if (!isValidSolanaAddress(tokenMint)) {
      console.error('Invalid token mint address:', tokenMint);
      return;
    }

    if (typeof setRuggedBalance !== 'function') {
      console.error('setRuggedBalance must be a function');
      return;
    }

    const balance = await getTokenBalance(connection, owner, tokenMint);
    setRuggedBalance(balance);
  } catch (error) {
    console.error('Failed to update RUGGED token balance:', error);
    // Don't update the balance on error - keep the previous value
  }
};