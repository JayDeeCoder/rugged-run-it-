// src/components/layout/Navbar.tsx - Fixed version
import { FC, useState, useEffect, useRef, useContext } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { UserContext } from '../../context/UserContext';
import useOutsideClick from '../../hooks/useOutsideClick';
import { Menu, User, ChevronDown, LogOut, Wallet, BarChart2, Trophy, Settings, Edit } from 'lucide-react';
import UsernameModal from '../auth/UsernameModal';
import { safeCreatePublicKey, isValidSolanaAddress } from '../../utils/walletUtils';

const Navbar: FC = () => {
  const { authenticated, login, logout, user, ready } = usePrivy();
  const { wallets } = useSolanaWallets();
  const { currentUser, experience, userLevel, crates, hasCustomUsername, setUsername } = useContext(UserContext);

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [showMobileMenu, setShowMobileMenu] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [showUsernameModal, setShowUsernameModal] = useState<boolean>(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Get the embedded wallet if available
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';

  const userMenuRef = useRef<HTMLDivElement>(null);
  useOutsideClick(userMenuRef as React.RefObject<HTMLElement>, () => setShowUserMenu(false));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Note: User initialization should be handled in UserContext provider
  // when authentication state changes

  // Fetch real balance from Solana blockchain
  useEffect(() => {
    const fetchBalance = async () => {
      if (!embeddedWallet || !walletAddress || !authenticated) {
        setWalletBalance(0);
        return;
      }

      try {
        setIsLoadingBalance(true);
        
        // Validate wallet address before proceeding
        if (!isValidSolanaAddress(walletAddress)) {
          console.error('Invalid wallet address:', walletAddress);
          setWalletBalance(0);
          return;
        }
        
        // Get environment variables
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
        const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
        
        if (!rpcUrl) {
          console.error('Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
          setWalletBalance(0);
          return;
        }
        
        // Create Solana connection
        const connectionConfig: any = {
          commitment: 'confirmed',
        };
        
        // Add API key header if available
        if (apiKey) {
          connectionConfig.httpHeaders = {
            'x-api-key': apiKey
          };
        }
        
        const connection = new Connection(rpcUrl, connectionConfig);
        
        // Safely create PublicKey object
        const publicKey = safeCreatePublicKey(walletAddress);
        if (!publicKey) {
          console.error('Failed to create PublicKey for address:', walletAddress);
          setWalletBalance(0);
          return;
        }
        
        // Get actual balance from blockchain
        const lamports = await connection.getBalance(publicKey);
        const solBalance = lamports / LAMPORTS_PER_SOL;
        
        setWalletBalance(solBalance);
      } catch (error) {
        console.error('Failed to fetch wallet balance:', error);
        setWalletBalance(0);
      } finally {
        setIsLoadingBalance(false);
      }
    };

    fetchBalance();
    
    // Refresh balance every 30 seconds (reduced frequency to avoid rate limits)
    const intervalId = setInterval(fetchBalance, 30000);
    return () => clearInterval(intervalId);
  }, [embeddedWallet, walletAddress, authenticated]);

  // Enhanced login function
  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      await login();
    } catch (error) {
      console.error('Login failed:', error);
      // Optionally show error toast/notification
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Enhanced logout function
  const handleLogout = async () => {
    try {
      if (authenticated) {
        await logout();
      }
      setShowUserMenu(false);
      setWalletBalance(0);
      // Clear any cached user data if needed
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const disconnectWallet = () => {
    // With Privy, logout handles wallet disconnection
    handleLogout();
  };

  const getUserDisplayName = () => {
    if (currentUser?.username) return currentUser.username;
    if (user?.email?.address) return user.email.address;
    if (user?.phone?.number) return user.phone.number;
    return 'User';
  };

  const handleSetUsername = () => {
    setShowUsernameModal(true);
    setShowUserMenu(false);
  };

  const handleUsernameSubmit = (username: string) => {
    try {
      setUsername(username);
      setShowUsernameModal(false);
    } catch (error) {
      console.error('Failed to set username:', error);
      // Optionally show error message
    }
  };

  // Show loading state while Privy initializes
  if (!isMounted || !ready) {
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
          <div className="flex items-center">
            <div className="bg-gray-700 animate-pulse rounded-md px-3 py-1 w-16 h-8"></div>
          </div>
        </div>
      </header>
    );
  }

  // Check if wallet is connected and address is valid
  const isWalletConnected = embeddedWallet !== undefined && isValidSolanaAddress(walletAddress);

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
            <Link href="/dashboard" className="px-3 py-1 hover:text-gray-300 text-sm transition-colors">
              Dashboard
            </Link>
            <Link href="/leaderboard" className="px-3 py-1 hover:text-gray-300 text-sm transition-colors">
              Leaderboard
            </Link>
          </nav>
        </div>

        <div className="flex items-center">
          {authenticated ? (
            <>
              {/* User Stats */}
              <div className="hidden md:flex items-center mr-3">
                {userLevel && (
                  <div className="flex items-center bg-gray-800 rounded-full px-2 py-1 mr-2">
                    <span className="text-xs text-gray-400 mr-1">Lv.</span>
                    <span className="text-sm font-medium">{userLevel}</span>
                  </div>
                )}
                <div className="hidden md:block h-2 w-20 bg-gray-800 rounded-full mr-2">
                  <div 
                    className="h-full bg-green-500 rounded-full transition-all duration-300" 
                    style={{ width: `${Math.min(experience || 0, 100)}%` }}
                  ></div>
                </div>
                {crates > 0 && (
                  <div className="flex items-center bg-yellow-900 rounded-full px-2 py-1 mr-2">
                    <span className="text-xs text-yellow-500 mr-1">🎁</span>
                    <span className="text-sm font-medium text-yellow-400">{crates}</span>
                  </div>
                )}
              </div>

              {/* User Menu */}
              <div className="relative" ref={userMenuRef}>
                <button
                  className="flex items-center bg-gray-800 hover:bg-gray-700 rounded-md px-2 py-1 transition-colors"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  aria-label="User menu"
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
                  <div className="absolute right-0 mt-2 w-56 bg-gray-800 rounded-md shadow-lg overflow-hidden z-50 border border-gray-700">
                    <div className="py-2">
                      {/* User Info */}
                      <div className="px-4 py-2 border-b border-gray-700">
                        <div className="font-medium flex items-center justify-between">
                          <span className="truncate">{getUserDisplayName()}</span>
                          <button 
                            onClick={handleSetUsername}
                            className="text-xs bg-gray-700 hover:bg-gray-600 p-1 rounded transition-colors"
                            title="Change username"
                          >
                            <Edit size={12} />
                          </button>
                        </div>
                        <div className="text-sm text-gray-400 truncate">
                          {user?.email?.address || user?.phone?.number || 'No contact info'}
                        </div>
                      </div>

                      {/* Wallet Info */}
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
                              className="mt-2 w-full text-sm bg-gray-700 hover:bg-gray-600 rounded px-3 py-1 text-left flex items-center transition-colors"
                            >
                              <Wallet size={14} className="mr-2" />
                              Disconnect Wallet
                            </button>
                          </>
                        ) : (
                          <div className="text-center">
                            <div className="text-sm text-gray-400 mb-2">
                              {embeddedWallet ? 'Invalid wallet address' : 'No wallet connected'}
                            </div>
                            <div className="text-xs text-gray-500 mb-2">
                              Wallet will be created automatically with your account
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Navigation Links */}
                      <div className="py-1">
                        <Link 
                          href="/dashboard" 
                          className="px-4 py-2 text-sm hover:bg-gray-700 flex items-center transition-colors" 
                          onClick={() => setShowUserMenu(false)}
                        >
                          <BarChart2 size={14} className="mr-2" /> Dashboard
                        </Link>
                        <Link 
                          href="/leaderboard" 
                          className="px-4 py-2 text-sm hover:bg-gray-700 flex items-center transition-colors" 
                          onClick={() => setShowUserMenu(false)}
                        >
                          <Trophy size={14} className="mr-2" /> Leaderboard
                        </Link>
                        <Link 
                          href="/settings" 
                          className="px-4 py-2 text-sm hover:bg-gray-700 flex items-center transition-colors" 
                          onClick={() => setShowUserMenu(false)}
                        >
                          <Settings size={14} className="mr-2" /> Settings
                        </Link>
                      </div>

                      {/* Logout */}
                      <div className="border-t border-gray-700 py-1">
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-gray-700 flex items-center text-red-400 transition-colors"
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
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-3 py-1 rounded-md text-sm transition-colors flex items-center"
            >
              {isLoggingIn ? (
                <>
                  <div className="animate-spin h-3 w-3 border border-white border-t-transparent rounded-full mr-2"></div>
                  Logging in...
                </>
              ) : (
                'Login'
              )}
            </button>
          )}

          <button 
            className="ml-3 md:hidden" 
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            aria-label="Mobile menu"
          >
            <Menu size={22} />
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="md:hidden bg-gray-800 mt-3 rounded-md p-2">
          <nav className="flex flex-col">
            <Link 
              href="/dashboard" 
              className="px-4 py-2 hover:bg-gray-700 rounded-md text-sm transition-colors"
              onClick={() => setShowMobileMenu(false)}
            >
              Dashboard
            </Link>
            <Link 
              href="/leaderboard" 
              className="px-4 py-2 hover:bg-gray-700 rounded-md text-sm transition-colors"
              onClick={() => setShowMobileMenu(false)}
            >
              Leaderboard
            </Link>
            {authenticated && (
              <Link 
                href="/settings" 
                className="px-4 py-2 hover:bg-gray-700 rounded-md text-sm transition-colors"
                onClick={() => setShowMobileMenu(false)}
              >
                Settings
              </Link>
            )}
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