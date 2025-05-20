import { FC } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { usePrivy } from '@privy-io/react-auth';
import SmartWalletButton from './SmartWalletButton';

const WalletButton: FC = () => {
  const { connected } = useWallet();
  const { authenticated } = usePrivy();
  
  // If not authenticated with Privy
  if (!authenticated) {
    return <SmartWalletButton />;
  }
  
  // If authenticated, show both options
  return (
    <div className="flex space-x-2">
      <SmartWalletButton />
      <WalletMultiButton />
    </div>
  );
};

export default WalletButton;