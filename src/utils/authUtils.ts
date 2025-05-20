// src/utils/authUtils.ts
import jwt from 'jsonwebtoken';
import jwksClient, { JwksClient } from 'jwks-rsa';
import logger from './logger';

/**
 * JWT Secret key for token generation and verification
 * Should be stored in environment variables in production
 */
const JWT_SECRET = process.env.JWT_SECRET || 'ttbZZS58TolPppZKYOoRlMzk7crD8H4zaB7n8wprsuY=';

/**
 * Token expiration time (in seconds)
 * Default: 7 days
 */
const TOKEN_EXPIRATION = process.env.TOKEN_EXPIRATION 
  ? parseInt(process.env.TOKEN_EXPIRATION) 
  : 60 * 60 * 24 * 7; // 7 days

/**
 * JWKS client for Privy authentication
 */
const privyJwksClient: JwksClient = jwksClient({
  jwksUri: 'https://auth.privy.io/api/v1/apps/cmacb9iyc00paky0mrursgxdk/jwks.json',
  cache: true,
  rateLimit: true,
  cacheMaxAge: 86400000, // 24 hours
});

/**
 * Get signing key from JWKS
 */
const getPrivySigningKey = (header: jwt.JwtHeader, callback: jwt.SigningKeyCallback): void => {
  privyJwksClient.getSigningKey(header.kid, (err: Error | null, key: jwksClient.SigningKey | undefined) => {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
};

/**
 * Verify a token using Privy's JWKS
 * @param token JWT token to verify
 * @returns Promise resolving to the decoded token payload
 */
export const verifyPrivyToken = (token: string): Promise<jwt.JwtPayload | string> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getPrivySigningKey, {}, (err: Error | null, decoded: string | jwt.JwtPayload | undefined) => {
      if (err) return reject(err);
      if (!decoded) return reject(new Error('Token could not be decoded'));
      resolve(decoded);
    });
  });
};

/**
 * Generate a JWT token for a user
 * @param userId User ID or wallet address
 * @param additionalData Additional data to include in the token
 * @returns JWT token
 */
export const generateToken = (userId: string, additionalData: Record<string, any> = {}): string => {
  try {
    const payload = {
      userId,
      ...additionalData,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: TOKEN_EXPIRATION,
    });

    return token;
  } catch (error) {
    logger.error('Error generating token:', error);
    throw new Error('Failed to generate authentication token');
  }
};

/**
 * Verify and decode a JWT token using local secret
 * @param token JWT token to verify
 * @returns Decoded token payload or null if invalid
 */
export const verifyToken = (token: string): jwt.JwtPayload | string | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    logger.error('Error verifying token:', error);
    return null;
  }
};

/**
 * Extract user ID from a token
 * @param token JWT token
 * @returns User ID or null if token is invalid
 */
export const getUserIdFromToken = (token: string): string | null => {
  const decoded = verifyToken(token);
  return decoded && typeof decoded === 'object' ? decoded.userId || null : null;
};

/**
 * Check if a token is expired
 * @param token JWT token
 * @returns True if token is expired or invalid, false otherwise
 */
export const isTokenExpired = (token: string): boolean => {
  try {
    const decoded = jwt.decode(token) as { exp?: number };
    if (!decoded || !decoded.exp) return true;
    
    // exp is in seconds, Date.now() is in milliseconds
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch (error) {
    logger.error('Error checking token expiration:', error);
    return true;
  }
};

export default {
  generateToken,
  verifyToken,
  verifyPrivyToken,
  getUserIdFromToken,
  isTokenExpired,
};