'use client';

import React, { FC, ReactNode, useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import SolanaWalletProvider from './SolanaWalletProvider';
import { useWallet } from '@solana/wallet-adapter-react';

interface AuthenticatedWalletProviderProps {
  children: ReactNode;
}

const AuthenticatedWalletProvider: FC<AuthenticatedWalletProviderProps> = ({ children }) => {
  const { authenticated, ready } = usePrivy();
  const { disconnect } = useWallet();
  const [canConnectWallet, setCanConnectWallet] = useState(false);

  // Disconnect wallet if user is not authenticated
  useEffect(() => {
    if (ready) {
      if (authenticated) {
        setCanConnectWallet(true);
      } else {
        // Force disconnect wallet if not authenticated
        disconnect?.();
        setCanConnectWallet(false);
      }
    }
  }, [authenticated, ready, disconnect]);

  // Clone children with props properly
  const childrenWithProps = React.Children.map(children, child => {
    // Check if valid element before trying to clone
    if (React.isValidElement(child)) {
      // Create a new props object manually instead of spreading
      const newProps = {
        canConnectWallet: canConnectWallet
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