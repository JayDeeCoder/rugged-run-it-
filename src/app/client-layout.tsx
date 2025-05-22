// src/app/client-layout.tsx
'use client';

import React from 'react';

// Import providers
import PrivyAuthProvider from '../providers/PrivyClientProvider';
import { SupabaseProvider } from '../context/SupabaseContext';
import { UserProvider } from '../context/UserContext';
import { ChatProvider } from '../context/ChatContext';
import { TradeProvider } from '../context/TradeContext';
import { GameProvider } from '../context/GameContext';
import { TokenProvider } from '../context/TokenContext';

// Client component with all the providers that need 'use client'
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PrivyAuthProvider>
      <SupabaseProvider>
        <UserProvider>
          <TokenProvider>
            <GameProvider>
              <TradeProvider>
                <ChatProvider>
                  {children}
                </ChatProvider>
              </TradeProvider>
            </GameProvider>
          </TokenProvider>
        </UserProvider>
      </SupabaseProvider>
    </PrivyAuthProvider>
  );
}