// src/components/layout/Navbar.tsx - Enhanced with NEW XP SYSTEM
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
import { UserAPI } from '../../services/api';

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

  // 🚀 ENHANCED: Use exact same XP calculation as dashboard and leaderboard
  const calculateEnhancedXP = (userData: {
    level?: number;
    experience_points?: number;
    total_games_played?: number;
    win_rate?: number;
  }) => {
    const {
      level = 1,
      experience_points = 0,
      total_games_played = 0,
      win_rate = 0
    } = userData;

    // 🎯 EXACT same XP requirements as API
    const getXPRequirement = (level: number): number => {
      const easyLevels: Record<number, number> = {
        1: 0,
        2: 25,      // SUPER EASY
        3: 75,      // STILL EASY 
        4: 150,     // Start ramping up
        5: 250,
        6: 400,
        7: 600,
        8: 900,
        9: 1350,
        10: 2000
      };

      if (easyLevels[level] !== undefined) {
        return easyLevels[level];
      }

      // For levels 11+, use exponential growth
      if (level > 10) {
        let xp = easyLevels[10];
        for (let i = 11; i <= level; i++) {
          xp = Math.floor(xp * 1.5);
        }
        return xp;
      }

      return 0;
    };

    const currentLevelXP = getXPRequirement(level);
    const nextLevelXP = getXPRequirement(level + 1);
    const xpNeededThisLevel = nextLevelXP - currentLevelXP;
    const xpProgressThisLevel = Math.max(0, experience_points - currentLevelXP);
    
    let progressPercentage = Math.min(100, (xpProgressThisLevel / xpNeededThisLevel) * 100);

    // 🎯 EXACT same bonus progress for early levels
    if (level <= 3) {
      // Game participation bonus (up to 25%)
      const gameBonus = Math.min(25, total_games_played * 2);
      
      // Learning bonus (up to 15%)  
      const winBonus = Math.min(15, win_rate * 0.3);
      
      progressPercentage += gameBonus + winBonus;
      progressPercentage = Math.min(100, progressPercentage);
    }

    const readyToLevelUp = progressPercentage >= 100;

    return {
      progressPercentage: Math.max(0, progressPercentage),
      xpThisLevel: xpProgressThisLevel,
      xpNeededThisLevel,
      isEarlyLevel: level <= 3,
      readyToLevelUp,
      current: xpProgressThisLevel,
      needed: xpNeededThisLevel
    };
  };

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

  // Get user level with proper fallbacks
  const getUserLevel = () => {
    return currentUser?.level || userLevel || 1;
  };

  // 🚀 ENHANCED: Calculate experience progress using new XP system
  const getExperienceProgress = () => {
    const currentLevel = getUserLevel();
    const currentXP = currentUser?.experience_points || experience || 0;
    const gamesPlayed = currentUser?.total_games_played || 0;
    const winRate = currentUser?.win_rate || 0;
    
    // Try UserAPI first, fallback to local calculation
    try {
      const levelProgress = UserAPI.calculateLevelProgress({
        level: currentLevel,
        experience_points: currentXP,
        total_games_played: gamesPlayed,
        win_rate: winRate
      });
      
      return {
        progress: levelProgress.progressPercentage || 0,
        current: levelProgress.xpThisLevel || 0,
        needed: levelProgress.xpNeededThisLevel || 25,
        isEarlyLevel: levelProgress.isEarlyLevel || false,
        readyToLevelUp: levelProgress.readyToLevelUp || false
      };
    } catch (error) {
      console.warn('⚠️ Navbar: UserAPI failed, using local calculation');
      const result = calculateEnhancedXP({
        level: currentLevel,
        experience_points: currentXP,
        total_games_played: gamesPlayed,
        win_rate: winRate
      });
      
      return {
        progress: result.progressPercentage,
        current: result.current,
        needed: result.needed,
        isEarlyLevel: result.isEarlyLevel,
        readyToLevelUp: result.readyToLevelUp
      };
    }
  };

  // 🚀 ENHANCED: Get level color with early level boost indication
  const getLevelColor = () => {
    const level = getUserLevel();
    const xpData = getExperienceProgress();
    
    // Special styling for early levels with boost
    if (xpData.isEarlyLevel) {
      return 'bg-gradient-to-r from-green-600/90 to-yellow-600/90 text-white border-yellow-400 shadow-lg';
    }
    
    if (level >= 20) return 'bg-purple-600/90 text-purple-200 border-purple-400';
    if (level >= 15) return 'bg-red-600/90 text-red-200 border-red-400';
    if (level >= 10) return 'bg-green-600/90 text-green-200 border-green-400';
    if (level >= 5) return 'bg-blue-600/90 text-blue-200 border-blue-400';
    return 'bg-gray-600/90 text-gray-200 border-gray-400';
  };

  const xpData = getExperienceProgress();
  const displayLevel = getUserLevel();
  const levelColorClass = getLevelColor();

  // 🚀 ENHANCED: Format XP numbers for display
  const formatXP = (xp: number) => {
    if (xp >= 10000) return `${(xp / 1000).toFixed(1)}k`;
    return xp.toString();
  };

  // Debug logging in development
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && currentUser) {
      console.log('🔍 Navbar User Data (Enhanced XP):', {
        level: currentUser.level,
        experience_points: currentUser.experience_points,
        total_games_played: currentUser.total_games_played,
        win_rate: currentUser.win_rate,
        username: currentUser.username,
        avatar: currentUser.avatar,
        xpProgress: xpData
      });
    }
  }, [currentUser, xpData]);

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
              
              {/* 🚀 ENHANCED: Level and XP in dropdown with new system */}
              <div className="flex items-center space-x-2 mt-2">
                <span className={`text-xs rounded px-2 py-1 font-medium border ${levelColorClass} relative`}>
                  Lv.{displayLevel}
                  {xpData.isEarlyLevel && (
                    <span className="absolute -top-1 -right-1 text-xs">🚀</span>
                  )}
                  {xpData.readyToLevelUp && (
                    <span className="absolute -top-1 -right-1 text-xs animate-bounce">🎉</span>
                  )}
                </span>
                <div className="flex-1">
                  <div className={`h-1.5 bg-gray-700 rounded-full overflow-hidden ${
                    xpData.readyToLevelUp ? 'animate-pulse' : ''
                  }`}>
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        xpData.isEarlyLevel 
                          ? 'bg-gradient-to-r from-green-400 via-yellow-400 to-orange-400' 
                          : xpData.readyToLevelUp
                            ? 'bg-gradient-to-r from-yellow-400 to-green-400'
                            : 'bg-gradient-to-r from-blue-500 to-purple-500'
                      }`}
                      style={{ width: `${Math.max(5, xpData.progress)}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {xpData.readyToLevelUp ? (
                      <span className="text-green-400 font-medium">Ready to level up!</span>
                    ) : (
                      `${formatXP(xpData.current)}/${formatXP(xpData.needed)} XP`
                    )}
                    {xpData.isEarlyLevel && (
                      <span className="text-yellow-400 ml-1 font-medium">• 3x Boost!</span>
                    )}
                  </div>
                </div>
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

            {/* Account Actions */}
            <div className="py-1">
              <button
                onClick={handleSetUsername}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-700 flex items-center transition-colors"
              >
                <Edit size={14} className="mr-2" />
                Change Username
              </button>
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

            {/* Main Navigation - Dashboard and RUGGER Board only */}
            <nav className="hidden lg:flex items-center">
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
                {/* 🚀 ENHANCED: User Stats with new XP system */}
                <div className="flex items-center mr-3 space-x-2">
                  {/* User Avatar - Always visible */}
                  <div className="flex items-center">
                    <span className="text-lg" title={`${getUserDisplayName()}'s avatar`}>
                      {currentUser?.avatar || '👤'}
                    </span>
                  </div>

                  {/* 🚀 ENHANCED: Level Display with early level boost indicator */}
                  <div className={`flex items-center rounded-full px-2 py-1 border relative ${levelColorClass}`}>
                    <span className="text-xs font-medium mr-1">Lv.</span>
                    <span className="text-sm font-bold">{displayLevel}</span>
                    {xpData.isEarlyLevel && (
                      <span className="absolute -top-1 -right-1 text-xs" title="Early Level Boost Active">🚀</span>
                    )}
                    {xpData.readyToLevelUp && (
                      <span className="absolute -top-1 -right-1 text-xs animate-bounce" title="Ready to Level Up!">🎉</span>
                    )}
                  </div>

                  {/* 🚀 ENHANCED: Experience Progress Bar with new styling */}
                  <div className="hidden xs:flex flex-col items-center">
                    <div className={`h-1.5 bg-gray-700 rounded-full overflow-hidden w-10 sm:w-12 md:w-14 lg:w-16 ${
                      xpData.readyToLevelUp ? 'animate-pulse' : ''
                    }`}>
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                          xpData.isEarlyLevel 
                            ? 'bg-gradient-to-r from-green-400 via-yellow-400 to-orange-400' 
                            : xpData.readyToLevelUp
                              ? 'bg-gradient-to-r from-yellow-400 to-green-400'
                              : 'bg-gradient-to-r from-blue-500 to-purple-500'
                        }`}
                        style={{ width: `${Math.max(5, xpData.progress)}%` }}
                      ></div>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5 hidden sm:block">
                      {xpData.readyToLevelUp ? (
                        <span className="text-green-400 font-medium">Ready!</span>
                      ) : (
                        `${formatXP(xpData.current)}/${formatXP(xpData.needed)}`
                      )}
                    </div>
                  </div>
                </div>

                {/* User Menu Button - Enhanced for mobile/tablet */}
                <button
                  ref={userButtonRef}
                  className="flex items-center bg-gray-800 hover:bg-gray-700 rounded-md px-2 py-1 transition-colors"
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  aria-label="User menu"
                >
                  {/* Mobile/Tablet View */}
                  <div className="lg:hidden flex items-center space-x-2">
                    <div className="flex flex-col">
                      <div className="flex items-center space-x-1">
                        <span className="text-sm font-medium truncate max-w-16 xs:max-w-20 sm:max-w-24">
                          {getUserDisplayName()}
                        </span>
                      </div>
                      {/* Show balance on tablet and up */}
                      {isWalletConnected && (
                        <div className="text-xs text-gray-400 hidden md:block">
                          {isLoadingBalance ? 'Loading...' : `${walletBalance.toFixed(2)} SOL`}
                        </div>
                      )}
                    </div>
                    <ChevronDown size={14} className={`transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                  </div>

                  {/* Desktop View */}
                  <div className="hidden lg:flex items-center">
                    <User size={18} className="mr-1" />
                    <div className="text-left mr-1">
                      <div className="text-xs font-medium">{getUserDisplayName()}</div>
                      {isWalletConnected && (
                        <div className="text-xs text-gray-400">
                          {isLoadingBalance ? 'Loading...' : `${walletBalance.toFixed(3)} SOL`}
                        </div>
                      )}
                    </div>
                    <ChevronDown size={14} className={`transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                  </div>
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

            {/* Mobile menu toggle - Show for tablet and below */}
            <button 
              className="ml-3 lg:hidden" 
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label="Mobile menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>

        {/* 🚀 ENHANCED: Mobile Menu with new XP system */}
        {showMobileMenu && (
          <div className="lg:hidden bg-gray-800 mt-3 rounded-md p-2">
            <nav className="flex flex-col">
              {/* Mobile Navigation Links */}
              <Link 
                href="/dashboard" 
                className="px-4 py-3 hover:bg-gray-700 rounded-md text-sm transition-colors flex items-center"
                onClick={() => setShowMobileMenu(false)}
              >
                <BarChart2 size={16} className="mr-3" />
                Dashboard
              </Link>
              <Link 
                href="/leaderboard" 
                className="px-4 py-3 hover:bg-gray-700 rounded-md text-sm transition-colors flex items-center"
                onClick={() => setShowMobileMenu(false)}
              >
                <Trophy size={16} className="mr-3" />
                RUGGER Board
              </Link>
              
              {/* 🚀 ENHANCED: Show XP progress in mobile menu with new system */}
              {authenticated && (
                <div className="px-4 py-3 border-t border-gray-700 mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Your Progress</span>
                    <span className={`text-xs rounded px-2 py-1 font-medium border relative ${levelColorClass}`}>
                      Lv.{displayLevel}
                      {xpData.isEarlyLevel && (
                        <span className="absolute -top-1 -right-1 text-xs">🚀</span>
                      )}
                      {xpData.readyToLevelUp && (
                        <span className="absolute -top-1 -right-1 text-xs animate-bounce">🎉</span>
                      )}
                    </span>
                  </div>
                  <div className={`w-full bg-gray-700 rounded-full h-2 mb-1 ${
                    xpData.readyToLevelUp ? 'animate-pulse' : ''
                  }`}>
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        xpData.isEarlyLevel 
                          ? 'bg-gradient-to-r from-green-400 via-yellow-400 to-orange-400' 
                          : xpData.readyToLevelUp
                            ? 'bg-gradient-to-r from-yellow-400 to-green-400'
                            : 'bg-gradient-to-r from-blue-500 to-purple-500'
                      }`}
                      style={{ width: `${Math.max(5, xpData.progress)}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-400 text-center">
                    {xpData.readyToLevelUp ? (
                      <span className="text-green-400 font-medium">🎉 Ready to level up!</span>
                    ) : (
                      <>
                        {formatXP(xpData.current)}/{formatXP(xpData.needed)} XP to next level
                        {xpData.isEarlyLevel && (
                          <div className="text-yellow-400 font-medium mt-1">🚀 Early Level Boost Active!</div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </nav>
          </div>
        )}
      </header>

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