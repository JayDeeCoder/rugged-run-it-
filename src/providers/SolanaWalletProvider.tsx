import { FC, ReactNode, useMemo, createContext, useContext } from 'react';
import { Connection, clusterApiUrl } from '@solana/web3.js';
import { usePrivy, useWallets } from '@privy-io/react-auth';

// Create a context for providing Solana connection
interface SolanaConnectionContextProps {
  connection: Connection;
  network: string;
  isReady: boolean;
  embeddedWallet: any | null;
}

const SolanaConnectionContext = createContext<SolanaConnectionContextProps>({
  connection: new Connection(clusterApiUrl('mainnet-beta')),
  network: 'mainnet-beta',
  isReady: false,
  embeddedWallet: null
});

// Hook for accessing the connection context
export const useSolanaConnection = () => useContext(SolanaConnectionContext);

interface SolanaWalletProviderProps {
  children: ReactNode;
}

/**
 * Provider that only works with embedded Privy wallets
 * Replaces the standard Solana wallet adapter infrastructure
 */
const SolanaWalletProvider: FC<SolanaWalletProviderProps> = ({ children }) => {
  // Get authentication state from Privy
  const { authenticated, ready } = usePrivy();
  
  // Get available wallets from Privy
  const { wallets } = useWallets();
  
  // Find embedded wallet if available
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');

  // Use Mainnet for production
  const network = 'mainnet-beta';
  
  // Create connection to Solana network
  const connection = useMemo(() => {
    const endpoint = clusterApiUrl(network);
    
    // You can add custom RPC configuration here
    return new Connection(
      endpoint, 
      { commitment: 'confirmed' }
    );
  }, [network]);
  
  // Create context value
  const contextValue = {
    connection,
    network,
    isReady: ready && authenticated && !!embeddedWallet,
    embeddedWallet: embeddedWallet || null
  };

  return (
    <SolanaConnectionContext.Provider value={contextValue}>
      {children}
    </SolanaConnectionContext.Provider>
  );
};

export default SolanaWalletProvider;