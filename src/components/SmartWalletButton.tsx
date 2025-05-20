import { FC, useState } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';

const SmartWalletButton: FC<{ canConnectWallet?: boolean }> = ({ canConnectWallet = true }) => {
  const { ready, authenticated, login, logout, user, createWallet } = usePrivy();
  const { wallets } = useWallets();
  const [isLoading, setIsLoading] = useState(false);
  
  // Find the embedded wallet if it exists
  const embeddedWallet = wallets.find(wallet => 
    wallet.walletClientType === 'privy'
  );

  // Handle login flow
  const handleLogin = async () => {
    if (!authenticated) {
      await login();
    }
  };

  // Handle wallet creation
  const handleCreateWallet = async () => {
    if (!embeddedWallet && authenticated && canConnectWallet) {
      setIsLoading(true);
      try {
        await createWallet();
      } catch (error) {
        console.error('Failed to create wallet:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  // Handle logout
  const handleLogout = async () => {
    await logout();
  };

  if (!ready) {
    return (
      <button 
        disabled
        className="bg-gray-600 text-white px-4 py-1 rounded-md font-bold opacity-70"
      >
        Loading...
      </button>
    );
  }

  if (!authenticated) {
    return (
      <button 
        onClick={handleLogin}
        className="bg-white text-black px-4 py-1 rounded-md font-bold hover:bg-gray-100 transition-all duration-200 transform active:scale-90 hover:shadow-lg"
      >
        Login
      </button>
    );
  }

  // If can't connect wallet yet but is authenticated
  if (!canConnectWallet) {
    return (
      <button 
        disabled
        className="bg-gray-600 text-gray-300 px-4 py-1 rounded-md font-bold cursor-not-allowed opacity-70"
      >
        Login to Connect Wallet
      </button>
    );
  }

  if (!embeddedWallet) {
    return (
      <button 
        onClick={handleCreateWallet}
        disabled={isLoading}
        className={`bg-green-600 text-white px-4 py-1 rounded-md font-bold hover:bg-green-700 transition-all duration-200 transform active:scale-90 hover:shadow-lg ${
          isLoading ? 'opacity-70 cursor-not-allowed' : ''
        }`}
      >
        {isLoading ? 'Creating Wallet...' : 'Create Smart Wallet'}
      </button>
    );
  }

  return (
    <div className="flex items-center space-x-2">
      <div className="bg-gray-800 rounded-md px-3 py-1 text-sm text-green-400 font-mono">
        {embeddedWallet.address.substring(0, 6)}...{embeddedWallet.address.substring(embeddedWallet.address.length - 4)}
      </div>
      <button 
        onClick={handleLogout}
        className="bg-red-600 text-white px-2 py-1 rounded-md text-sm hover:bg-red-700 transition-all duration-200"
      >
        Logout
      </button>
    </div>
  );
};

export default SmartWalletButton;