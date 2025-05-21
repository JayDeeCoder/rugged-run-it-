'use client';

import { FC } from 'react';
import { useWallets, usePrivy } from '@privy-io/react-auth';
import Layout from '../../components/layout/Layout';
import Link from 'next/link';

const Dashboard: FC = () => {
  // Use Privy for wallet management
  const { wallets } = useWallets();
  const { authenticated } = usePrivy();
  
  // Get the first wallet (if any)
  const activeWallet = wallets.length > 0 ? wallets[0] : null;
  const isConnected = authenticated && wallets.length > 0;
  const walletAddress = activeWallet?.address;
  
  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-white mb-6">Dashboard</h1>

        {/* Static content that doesn't depend on wallet connection */}
        <div className="bg-gray-900 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Your Stats</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-gray-400 mb-1">Total Wagered</div>
              <div className="text-2xl font-bold text-white">-- SOL</div>
            </div>
            <div>
              <div className="text-gray-400 mb-1">Total Payouts</div>
              <div className="text-2xl font-bold text-white">-- SOL</div>
            </div>
            <div>
              <div className="text-gray-400 mb-1">Games Played</div>
              <div className="text-2xl font-bold text-white">--</div>
            </div>
          </div>
        </div>

        {/* Wallet Status */}
        <div className="bg-gray-900 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Wallet Status</h2>
          {isConnected && walletAddress ? (
            <div>
              <p className="text-green-400">Connected: {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 4)}</p>
            </div>
          ) : (
            <p className="text-yellow-400">Not connected. Please connect your wallet to see your stats.</p>
          )}
        </div>

        {/* Play Button */}
        <div className="mt-8 text-center">
          <Link 
            href="/" 
            className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-8 rounded-lg transition"
          >
            Play Now
          </Link>
        </div>
      </div>
    </Layout>
  );
};

export default Dashboard;