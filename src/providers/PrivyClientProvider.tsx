'use client';

import { PrivyProvider } from '@privy-io/react-auth';
import { FC, ReactNode } from 'react';

interface PrivyAuthProviderProps {
  children: ReactNode;
}

const PrivyAuthProvider: FC<PrivyAuthProviderProps> = ({ children }) => {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'cmacb9iyc00paky0mrursgxdk';

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'wallet', 'google', 'twitter'],
        appearance: {
          theme: 'dark',
          accentColor: '#16a34a',
          logo: '/images/ruggedfun_combination_mark_beta.png',
          showWalletLoginFirst: false
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        }
      }}
    >
      {children}
    </PrivyProvider>
  );
};

export default PrivyAuthProvider;
