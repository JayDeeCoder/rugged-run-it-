// src/utils/walletUtils.ts
import { PublicKey } from '@solana/web3.js';

/**
 * Validates if a string is a valid Solana address
 * @param address The address string to validate
 * @returns boolean indicating if the address is valid
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
    
    // Try to create a PublicKey instance - this will throw if invalid
    new PublicKey(address);
    return true;
  } catch (error) {
    // Log the error for debugging but don't throw
    console.warn('Invalid Solana address validation failed:', address, error);
    return false;
  }
};

/**
 * Safely creates a PublicKey instance with proper error handling
 * @param address The address string to convert to PublicKey
 * @returns PublicKey instance or null if invalid
 */
export const safeCreatePublicKey = (address: string): PublicKey | null => {
  try {
    // First validate the address
    if (!isValidSolanaAddress(address)) {
      return null;
    }
    
    // Create and return the PublicKey
    return new PublicKey(address);
  } catch (error) {
    console.error('Failed to create PublicKey:', address, error);
    return null;
  }
};

/**
 * Validates wallet object and its address
 * @param wallet The wallet object to validate
 * @returns boolean indicating if the wallet is valid and has a valid address
 */
export const isValidWallet = (wallet: any): boolean => {
  if (!wallet) {
    return false;
  }
  
  if (!wallet.address || typeof wallet.address !== 'string') {
    return false;
  }
  
  return isValidSolanaAddress(wallet.address);
};

/**
 * Safely gets wallet address with validation
 * @param wallet The wallet object
 * @returns The wallet address if valid, null otherwise
 */
export const getValidWalletAddress = (wallet: any): string | null => {
  if (!isValidWallet(wallet)) {
    return null;
  }
  
  return wallet.address;
};