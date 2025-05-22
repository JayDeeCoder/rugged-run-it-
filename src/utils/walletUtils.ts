// src/utils/walletUtils.ts
import { PublicKey } from '@solana/web3.js';

/**
 * Validates if a string is a valid Solana address
 */
export const isValidSolanaAddress = (address: string): boolean => {
  try {
    // Check if address exists and is a string
    if (!address || typeof address !== 'string') {
      return false;
    }
    
    // Check length (Solana addresses are typically 32-44 characters)
    if (address.length < 32 || address.length > 44) {
      return false;
    }
    
    // Check if it contains only valid base58 characters
    const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    if (!base58Regex.test(address)) {
      return false;
    }
    
    // Try to create a PublicKey instance
    new PublicKey(address);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Safely creates a PublicKey from a string address
 */
export const safeCreatePublicKey = (address: string): PublicKey | null => {
  try {
    if (!isValidSolanaAddress(address)) {
      return null;
    }
    return new PublicKey(address);
  } catch (error) {
    console.warn('Failed to create PublicKey:', error);
    return null;
  }
};

/**
 * Formats a wallet address for display
 */
export const formatWalletAddress = (address: string, chars: number = 4): string => {
  if (!address || !isValidSolanaAddress(address)) {
    return 'Invalid Address';
  }
  
  if (address.length <= chars * 2) {
    return address;
  }
  
  return `${address.substring(0, chars)}...${address.substring(address.length - chars)}`;
};

/**
 * Checks if a wallet is a valid Solana embedded wallet
 */
export const isValidSolanaWallet = (wallet: any): boolean => {
  return (
    wallet &&
    wallet.walletClientType === 'privy' &&
    wallet.address &&
    isValidSolanaAddress(wallet.address)
  );
};