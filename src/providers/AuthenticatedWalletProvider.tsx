'use client';

import React, { FC, ReactNode, useEffect, useState } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import SolanaWalletProvider from './SolanaWalletProvider';

interface AuthenticatedWalletProviderProps {
  children: ReactNode;
}

const AuthenticatedWalletProvider: FC<AuthenticatedWalletProviderProps> = ({ children }) => {
  const { authenticated, ready, logout } = usePrivy();
  const { wallets } = useSolanaWallets();
  const [canConnectWallet, setCanConnectWallet] = useState(false);
  
  // Find embedded wallet if available
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

  // Manage wallet connection state based on authentication
  useEffect(() => {
    if (ready) {
      if (authenticated) {
        setCanConnectWallet(true);
      } else {
        // If not authenticated, we don't need to explicitly disconnect
        // as the Privy provider handles this automatically on logout
        setCanConnectWallet(false);
      }
    }
  }, [authenticated, ready]);

  // Clone children with props properly
  const childrenWithProps = React.Children.map(children, child => {
    // Check if valid element before trying to clone
    if (React.isValidElement(child)) {
      // Create a new props object with wallet information
      const newProps = {
        canConnectWallet,
        embeddedWallet: embeddedWallet || null,
        isWalletReady: canConnectWallet && !!embeddedWallet
      };
      
      // Clone with the new props object
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