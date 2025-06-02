// Enhanced AuthenticatedWalletProvider.tsx
'use client';

import React, { FC, ReactNode, useEffect, useState, useRef } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import SolanaWalletProvider from './SolanaWalletProvider';
import { referralService } from '../services/ReferralService';

interface AuthenticatedWalletProviderProps {
  children: ReactNode;
}

const AuthenticatedWalletProvider: FC<AuthenticatedWalletProviderProps> = ({ children }) => {
  const { authenticated, ready, logout, user, getAccessToken } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [canConnectWallet, setCanConnectWallet] = useState(false);
  const [isProcessingLogin, setIsProcessingLogin] = useState(false);
  
  // Track processed logins
  const loginProcessedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);
  
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

  useEffect(() => {
    if (ready) {
      if (authenticated) {
        setCanConnectWallet(true);
      } else {
        setCanConnectWallet(false);
        loginProcessedRef.current = false;
        lastUserIdRef.current = null;
      }
    }
  }, [authenticated, ready]);

  // Process referral login when user becomes authenticated
  useEffect(() => {
    const processReferralLogin = async () => {
      if (
        ready && 
        authenticated && 
        user && 
        !loginProcessedRef.current && 
        lastUserIdRef.current !== user.id &&
        !isProcessingLogin
      ) {
        console.log('🔐 New Privy login detected for user:', user.id);
        
        setIsProcessingLogin(true);
        
        try {
          // Use the integrated referral service
          const result = await referralService.processUserLogin(
            user.id, 
            navigator.userAgent
          );
          
          console.log('✅ Login processed successfully', result);
          
          // Show notification if referral was activated
          if (result.referralActivated) {
            showReferralActivationNotification(result);
          }
          
          loginProcessedRef.current = true;
          lastUserIdRef.current = user.id;
          
        } catch (error) {
          console.error('❌ Error processing login:', error);
        } finally {
          setIsProcessingLogin(false);
        }
      }
    };

    processReferralLogin();
  }, [ready, authenticated, user]);

  const showReferralActivationNotification = (result: any) => {
    if (result.isFirstLogin && result.referralActivated) {
      // Create toast notification
      const notification = document.createElement('div');
      notification.innerHTML = `
        <div style="
          position: fixed;
          top: 20px;
          right: 20px;
          background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
          color: white;
          padding: 16px 24px;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          z-index: 10000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          max-width: 300px;
          animation: slideIn 0.3s ease-out;
        ">
          <div style="font-weight: 600; margin-bottom: 8px;">
            🎉 Welcome! Referral Activated
          </div>
          <div style="font-size: 14px; opacity: 0.9;">
            ${result.referrerUsername ? `Thanks to ${result.referrerUsername} for referring you!` : 'Your referrer has been credited!'}
          </div>
        </div>
        <style>
          @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
        </style>
      `;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 5000);
    }
  };

  const childrenWithProps = React.Children.map(children, child => {
    if (React.isValidElement(child)) {
      const newProps = {
        canConnectWallet,
        embeddedWallet: embeddedWallet || null,
        isWalletReady: canConnectWallet && !!embeddedWallet,
        isProcessingReferralLogin: isProcessingLogin,
        user: user || null,
        privyReady: ready,
        privyAuthenticated: authenticated
      };
      
      return React.cloneElement(child, newProps);
    }
    return child;
  });

  return (
    <SolanaWalletProvider>
      {childrenWithProps}
    </SolanaWalletProvider>
  );
};

export default AuthenticatedWalletProvider;