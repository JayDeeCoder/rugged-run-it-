// src/components/layout/Navbar.tsx - Updated with avatar and level progression
import { FC, useState, useEffect, useRef, useContext } from 'react';
import { createPortal } from 'react-dom';
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
  const { currentUser, experience, userLevel, hasCustomUsername, setUsername } = useContext(UserContext);

  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [showUserMenu, setShowUserMenu] = useState<boolean>(false);
  const [showMobileMenu, setShowMobileMenu] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [showUsernameModal, setShowUsernameModal] = useState<boolean>(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState<boolean>(false);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; right: number } | null>(null);

  // Get the embedded wallet if available
  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';

  const userMenuRef = useRef<HTMLDivElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);
  useOutsideClick(userMenuRef as React.RefObject<HTMLElement>, () => setShowUserMenu(false));

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (showUserMenu && userButtonRef.current && isMounted) {
      const rect = userButtonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 8, // 8px spacing
        right: window.innerWidth - rect.right
      });
    } else {
      setDropdownPosition(null);
    }
  }, [showUserMenu, isMounted]);

  // Fetch real balance from Solana blockchain
  useEffect(() => {
    const fetchBalance = async () => {
      if (!embeddedWallet || !walletAddress || !authenticated) {
        setWalletBalance(0);
        return;
      }

      try {
        setIsLoadingBalance(true);
        
        if (!isValidSolanaAddress(walletAddress)) {
          console.error('Invalid wallet address:', walletAddress);
          setWalletBalance(0);
          return;
        }
        
        const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
        const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
        
        if (!rpcUrl) {
          console.error('Missing NEXT_PUBLIC_SOLANA_RPC_URL environment variable');
          setWalletBalance(0);
          return;
        }
        
        const connectionConfig: any = {
          commitment: 'confirmed',
        };
        
        if (apiKey) {
          connectionConfig.httpHeaders = {
            'x-api-key': apiKey
          };
        }
        
        const connection = new Connection(rpcUrl, connectionConfig);
        const publicKey = safeCreatePublicKey(walletAddress);
        if (!publicKey) {
          console.error('Failed to create PublicKey for address:', walletAddress);
          setWalletBalance(0);
          return;
        }
        
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
    const intervalId = setInterval(fetchBalance, 30000);
    return () => clearInterval(intervalId);
  }, [embeddedWallet, walletAddress, authenticated]);

  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      await login();
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (authenticated) {
        await logout();
      }
      setShowUserMenu(false);
      setWalletBalance(0);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const disconnectWallet = () => {
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
    }
  };

  // Calculate experience progress for current level
  const getExperienceProgress = () => {
    // Use experience from UserContext if available, fallback to currentUser properties
    const currentXP = experience || currentUser?.experience || 0;
    const currentLevel = userLevel || currentUser?.level || 1;
    
    // Calculate experience needed for next level (100 XP per level)
    const experienceNeeded = 100;
    const experienceInLevel = currentXP % 100;
    const progressPercentage = (experienceInLevel / experienceNeeded) * 100;
    
    return {
      progress: Math.min(progressPercentage, 100),
      current: experienceInLevel,
      needed: experienceNeeded
    };
  };

  const xpData = getExperienceProgress();

  // Dropdown component that renders using portal
  const DropdownMenu = () => {
    if (!showUserMenu || !dropdownPosition || !isMounted) return null;

    return createPortal(
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 z-[9998] bg-transparent"
          onClick={() => setShowUserMenu(false)}
        />
        
        {/* Dropdown Menu */}
        <div 
          ref={userMenuRef}
          className="fixed z-[9999] w-56 bg-gray-800 rounded-md shadow-2xl border border-gray-700 animate-in fade-in-0 zoom-in-95 duration-200"
          style={{
            top: `${dropdownPosition.top}px`,
            right: `${dropdownPosition.right}px`,
          }}
        >
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
                className="px-4 py-2 text-sm hover:bg-gray-700 flex items-center transition-colors block w-full" 
                onClick={() => setShowUserMenu(false)}
              >
                <BarChart2 size={14} className="mr-2" /> Dashboard
              </Link>
              <Link 
                href="/leaderboard" 
                className="px-4 py-2 text-sm hover:bg-gray-700 flex items-center transition-colors block w-full" 
                onClick={() => setShowUserMenu(false)}
              >
                <Trophy size={14} className="mr-2" /> Rugger Board
              </Link>
              <Link 
                href="/settings" 
                className="px-4 py-2 text-sm hover:bg-gray-700 flex items-center transition-colors block w-full" 
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
      </>,
      document.body
    );
  };

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

  const isWalletConnected = embeddedWallet !== undefined && isValidSolanaAddress(walletAddress);

  return (
    <>
      <header className="bg-[#0d0d0f] py-2 px-3 border-b border-gray-800 text-white relative z-40">
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
                RUGGER Board
              </Link>
            </nav>
          </div>

          <div className="flex items-center">
            {authenticated ? (
              <>
                {/* User Stats - Avatar + Level + Progress */}
                <div className="hidden md:flex items-center mr-3 space-x-2">
                  {/* User Avatar */}
                  <div className="flex items-center">
                    <span className="text-lg" title={`${getUserDisplayName()}'s avatar`}>
                      {currentUser?.avatar || '👤'}
                    </span>
                  </div>

                  {/* Level Display */}
                  {userLevel && (
                    <div className="flex items-center bg-gray-800 rounded-full px-2 py-1">
                      <span className="text-xs text-gray-400 mr-1">Lv.</span>
                      <span className="text-sm font-medium text-yellow-400">{userLevel}</span>
                    </div>
                  )}

                  {/* Experience Progress Bar */}
                  <div className="flex flex-col items-center">
                    <div className="h-1.5 w-16 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500 ease-out" 
                        style={{ width: `${xpData.progress}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {xpData.current}/{xpData.needed} XP
                    </div>
                  </div>
                </div>

                {/* User Menu Button */}
                <button
                  ref={userButtonRef}
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
              {/* Mobile User Stats */}
              {authenticated && currentUser && (
                <div className="px-4 py-2 border-b border-gray-700 mb-2">
                  <div className="flex items-center space-x-3">
                    <span className="text-lg">{currentUser.avatar || '👤'}</span>
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-sm font-medium">{getUserDisplayName()}</span>
                        {userLevel && (
                          <span className="text-xs bg-gray-700 text-yellow-400 px-2 py-0.5 rounded-full">
                            Lv.{userLevel}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="h-1.5 w-20 bg-gray-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-500" 
                            style={{ width: `${xpData.progress}%` }}
                          ></div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {xpData.current}/{xpData.needed}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
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
                RUGGER Board
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
      </header>

      {/* Portal-rendered dropdown */}
      <DropdownMenu />

      {/* Username Modal */}
      <UsernameModal 
        isOpen={showUsernameModal}
        onClose={() => setShowUsernameModal(false)}
        onSubmit={handleUsernameSubmit}
        currentUsername={currentUser?.username || ''}
      />
    </>
  );
};

export default Navbar;