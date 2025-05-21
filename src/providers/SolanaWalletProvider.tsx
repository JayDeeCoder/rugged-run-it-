import { FC, ReactNode } from 'react';
import { PrivyProvider } from '@privy-io/react-auth';

interface SolanaWalletProviderProps {
  children: ReactNode;
}

/**
 * SolanaWalletProvider that uses Privy instead of direct Solana wallet adapter
 * Note: This component is kept for backward compatibility
 */
const SolanaWalletProvider: FC<SolanaWalletProviderProps> = ({ children }) => {
  // Get Privy App ID from env or use a default
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

export default SolanaWalletProvider;