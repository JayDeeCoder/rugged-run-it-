// src/utils/authUtils.ts
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const client = jwksClient({
  jwksUri: 'https://auth.privy.io/api/v1/apps/cmacb9iyc00paky0mrursgxdk/jwks.json',
  cache: true,
  rateLimit: true,
  cacheMaxAge: 86400000, // 24 hours
});

// Function to get signing key
const getKey = (header: any, callback: any) => {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
};

// Verify token
export const verifyToken = (token: string): Promise<any> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getKey, {}, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded);
    });
  });
};