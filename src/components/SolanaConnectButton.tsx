// src/components/SolanaConnectButton.tsx
import { FC } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { usePrivy } from '@privy-io/react-auth';

interface SolanaConnectButtonProps {
  showBalance?: boolean;
  className?: string;
}

const SolanaConnectButton: FC<SolanaConnectButtonProps> = ({ 
  showBalance = false,
  className = ''
}) => {
  const { connected, disconnect } = useWallet();
  const { authenticated, login } = usePrivy();

  if (!authenticated) {
    return (
      <button
        onClick={login}
        className={`bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-medium transition-colors ${className}`}
      >
        Login
      </button>
    );
  }

  // If authenticated, show the wallet connect button
  return <WalletMultiButton className={className} />;
};

export default SolanaConnectButton;