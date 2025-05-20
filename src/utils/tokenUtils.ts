// src/utils/tokenUtils.ts
import { Connection, PublicKey } from '@solana/web3.js';

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
    // Use Tatum API endpoint for token accounts
    const endpoint = `${process.env.NEXT_PUBLIC_TATUM_API_ENDPOINT || 'https://api.tatum.io'}/v3/solana/account/tokenBalance/${tokenMint}/${owner.toString()}`;
    
    const response = await fetch(endpoint, {
      headers: {
        'x-api-key': process.env.NEXT_PUBLIC_TATUM_API_KEY || 't-682a1c08650ecaebde72d2aa-264faa21e495426f9a2eb26f'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch token balance');
    }
    
    const data = await response.json();
    return data.balance;
  } catch (error) {
    console.error('Error fetching token balance:', error);
    
    // Fallback to manual token account lookup if Tatum API fails
    try {
      // This is a simplified version - in production you would use
      // getParsedTokenAccountsByOwner and add proper error handling
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        owner,
        { mint: new PublicKey(tokenMint) }
      );
      
      // Get the first token account with this mint
      if (tokenAccounts.value.length > 0) {
        const tokenAccount = tokenAccounts.value[0];
        const parsedInfo = tokenAccount.account.data.parsed.info;
        const balance = parsedInfo.tokenAmount.uiAmount;
        return balance;
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
    const balance = await getTokenBalance(connection, owner, tokenMint);
    setRuggedBalance(balance);
  } catch (error) {
    console.error('Failed to update RUGGED token balance:', error);
    // Don't update the balance on error - keep the previous value
  }
};