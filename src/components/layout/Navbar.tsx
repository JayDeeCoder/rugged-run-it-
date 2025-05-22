// src/components/layout/Navbar.tsx
import { FC, useState, useEffect, useRef, useContext } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { UserContext } from '../../context/UserContext';
import useOutsideClick from '../../hooks/useOutsideClick';
import { Menu, User, ChevronDown, LogOut, Wallet, BarChart2, Trophy, Settings, Edit } from 'lucide-react';
import UsernameModal from '../auth/UsernameModal';

const Navbar: FC = () => {
  const { authenticated, login, logout, user } = usePrivy();
  const { wallets } = useWallets();
  const { currentUser, experience, userLevel, crates, hasCustomUsername, setUsername } = useContext(UserContext);

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [showMobileMenu, setShowMobileMenu] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [showUsernameModal, setShowUsernameModal] = useState<boolean>(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);

  // Get the embedded wallet if available
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';

  const userMenuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(userMenuRef as React.RefObject<HTMLElement>, () => setShowUserMenu(false));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch real balance from Solana blockchain
  useEffect(() => {
    const fetchBalance = async () => {
      if (embeddedWallet && walletAddress) {
        try {
          setIsLoadingBalance(true);
          
          // Create Solana connection using Alchemy RPC
          const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://solana-mainnet.g.alchemy.com/v2/6CqgIf5nqVF9rWeernULokib0PAr6yh3';
          const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY || '6CqgIf5nqVF9rWeernULokib0PAr6yh3';
          
          const connection = new Connection(rpcUrl, {
            commitment: 'confirmed',
            httpHeaders: {
              'x-api-key': apiKey
            }
          });
          
          // Get actual balance from blockchain
          const publicKey = new PublicKey(walletAddress);
          const lamports = await connection.getBalance(publicKey);
          const solBalance = lamports / LAMPORTS_PER_SOL;
          
          setWalletBalance(solBalance);
        } catch (error) {
          console.error('Failed to fetch wallet balance:', error);
          setWalletBalance(0);
        } finally {
          setIsLoadingBalance(false);
        }
      } else {
        setWalletBalance(0);
      }
    };

    fetchBalance();
    
    // Refresh balance every 15 seconds
    const intervalId = setInterval(fetchBalance, 15000);
    return () => clearInterval(intervalId);
  }, [embeddedWallet, walletAddress]);

  const handleLogout = async () => {
    if (authenticated) await logout();
    setShowUserMenu(false);
  };

  const disconnectWallet = () => {
    // No need to specifically disconnect when using Privy - logout handles this
    handleLogout();
  };

  const getUserDisplayName = () => {
    return currentUser?.username || user?.email?.address || 'User';
  };

  const handleSetUsername = () => {
    setShowUsernameModal(true);
    setShowUserMenu(false);
  };

  const handleUsernameSubmit = (username: string) => {
    setUsername(username);
  };

  if (!isMounted) {
    return (
      <header className="bg-[#0d0d0f] py-2 px-3 border-b border-gray-800 text-white">
        <div className="container mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/images/ruggedfun-logo-resize-new.png"
              alt="RUGGED.FUN"
              width={140}
              height={35}
              className="object-contain"
              priority
            />
          </Link>
        </div>
      </header>
    );
  }

  // Check if wallet is connected
  const isWalletConnected = embeddedWallet !== undefined;

  return (
    <header className="bg-[#0d0d0f] py-2 px-3 border-b border-gray-800 text-white">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/" className="flex items-center mr-4">
            <Image
              src="/images/ruggedfun-logo-resize-new.png"
              alt="RUGGED.FUN"
              width={140}
              height={35}
              className="object-contain"
              priority
            />
          </Link>

          <nav className="hidden md:flex items-center">
            <Link href="/dashboard" className="px-3 py-1 hover:text-gray-300 text-sm">Dashboard</Link>
            <Link href="/leaderboard" className="px-3 py-1 hover:text-gray-300 text-sm">Leaderboard</Link>
          </nav>
        </div>

        <div className="flex items-center">
          {authenticated ? (
            <>
              <div className="hidden md:flex items-center mr-3">
                {userLevel && (
                  <div className="flex items-center bg-gray-800 rounded-full px-2 py-1 mr-2">
                    <span className="text-xs text-gray-400 mr-1">Lv.</span>
                    <span className="text-sm font-medium">{userLevel}</span>
                  </div>
                )}
                <div className="hidden md:block h-2 w-20 bg-gray-800 rounded-full mr-2">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${experience}%` }}></div>
                </div>
                {crates > 0 && (
                  <div className="flex items-center bg-yellow-900 rounded-full px-2 py-1 mr-2">
                    <span className="text-xs text-yellow-500 mr-1">🎁</span>
                    <span className="text-sm font-medium text-yellow-400">{crates}</span>
                  </div>
                )}
              </div>

              <div className="relative" ref={userMenuRef}>
                <button
                  className="flex items-center bg-gray-800 hover:bg-gray-700 rounded-md px-2 py-1 transition-colors"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                >
                  <User size={18} className="mr-1" />
                  <div className="hidden md:block text-left mr-1">
                    <div className="text-xs font-medium">{getUserDisplayName()}</div>
                    {isWalletConnected && (
                      <div className="text-xs text-gray-400">
                        {isLoadingBalance ? 'Loading...' : `${walletBalance.toFixed(3)} SOL`}
                      </div>
                    )}
                  </div>
                  <ChevronDown size={14} className={`transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-gray-800 rounded-md shadow-lg overflow-hidden z-50">
                    <div className="py-2">
                      <div className="px-4 py-2 border-b border-gray-700">
                        <div className="font-medium flex items-center justify-between">
                          <span>{getUserDisplayName()}</span>
                          <button 
                            onClick={handleSetUsername}
                            className="text-xs bg-gray-700 hover:bg-gray-600 p-1 rounded"
                            title="Change username"
                          >
                            <Edit size={12} />
                          </button>
                        </div>
                        <div className="text-sm text-gray-400">{user?.email?.address}</div>
                      </div>

                      <div className="px-4 py-2 border-b border-gray-700">
                        {isWalletConnected ? (
                          <>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm text-gray-400">Wallet:</span>
                              <span className="text-sm font-mono">
                                {`${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-400">Balance:</span>
                              <span className="text-sm font-medium text-green-400">
                                {isLoadingBalance ? 'Loading...' : `${walletBalance.toFixed(3)} SOL`}
                              </span>
                            </div>
                            <button
                              onClick={disconnectWallet}
                              className="mt-2 w-full text-sm bg-gray-700 hover:bg-gray-600 rounded px-3 py-1 text-left flex items-center"
                            >
                              <Wallet size={14} className="mr-2" />
                              Disconnect Wallet
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {/* Implement embedded wallet creation here */}}
                            className="w-full text-sm bg-green-600 hover:bg-green-700 rounded px-3 py-1 text-center"
                          >
                            Create Wallet
                          </button>
                        )}
                      </div>

                      <div className="py-1">
                        <Link href="/dashboard" className="px-4 py-2 text-sm hover:bg-gray-700 flex items-center" onClick={() => setShowUserMenu(false)}>
                          <BarChart2 size={14} className="mr-2" /> Dashboard
                        </Link>
                        <Link href="/leaderboard" className="px-4 py-2 text-sm hover:bg-gray-700 flex items-center" onClick={() => setShowUserMenu(false)}>
                          <Trophy size={14} className="mr-2" /> Leaderboard
                        </Link>
                        <Link href="/settings" className="px-4 py-2 text-sm hover:bg-gray-700 flex items-center" onClick={() => setShowUserMenu(false)}>
                          <Settings size={14} className="mr-2" /> Settings
                        </Link>
                      </div>

                      <div className="border-t border-gray-700 py-1">
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-700 flex items-center text-red-400"
                        >
                          <LogOut size={14} className="mr-2" />
                          Log Out
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <button
              onClick={login}
              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-md text-sm transition-colors"
            >
              Login
            </button>
          )}

          <button className="ml-3 md:hidden" onClick={() => setShowMobileMenu(!showMobileMenu)}>
            <Menu size={22} />
          </button>
        </div>
      </div>

      {showMobileMenu && (
        <div className="md:hidden bg-gray-800 mt-3 rounded-md p-2">
          <nav className="flex flex-col">
            <Link href="/dashboard" className="px-4 py-2 hover:bg-gray-700 rounded-md text-sm">Dashboard</Link>
            <Link href="/leaderboard" className="px-4 py-2 hover:bg-gray-700 rounded-md text-sm">Leaderboard</Link>
            {authenticated && <Link href="/settings" className="px-4 py-2 hover:bg-gray-700 rounded-md text-sm">Settings</Link>}
          </nav>
        </div>
      )}

      {/* Username Modal */}
      <UsernameModal 
        isOpen={showUsernameModal}
        onClose={() => setShowUsernameModal(false)}
        onSubmit={handleUsernameSubmit}
        currentUsername={currentUser?.username || ''}
      />
    </header>
  );
};

export default Navbar;