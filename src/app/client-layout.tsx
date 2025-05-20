'use client';

import React from 'react';

// Import providers
import PrivyAuthProvider from '../providers/PrivyClientProvider';
import { SolanaProvider } from '../components/SolanaWalletAdapter';
import { UserProvider } from '../context/UserContext';
import { ChatProvider } from '../context/ChatContext';
import { TradeProvider } from '../context/TradeContext';
import { GameProvider } from '../context/GameContext';

// Client component with all the providers that need 'use client'
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivyAuthProvider>
      <SolanaProvider>
        <UserProvider>
          <GameProvider>
            <TradeProvider>
              <ChatProvider>
                {children}
              </ChatProvider>
            </TradeProvider>
          </GameProvider>
        </UserProvider>
      </SolanaProvider>
    </PrivyAuthProvider>
  );
}