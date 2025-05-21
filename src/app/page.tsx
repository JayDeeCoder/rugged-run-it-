// src/app/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Layout from '../components/layout/Layout';
import dynamic from 'next/dynamic';
import ChatBox from '../components/chat/ChatBox';
import MobileChat from '../components/chat/MobileChat';
import { mockLeaderboardEntries, mockMultipliers } from '../data/MockData';
import { usePrivy } from '@privy-io/react-auth';
import useWindowSize from '../hooks/useWindowSize';

// Dynamically import components that might cause issues on SSR
const ChartContainer = dynamic(() => import('../components/trading/ChartContainer'), { ssr: false });
const MiniCharts = dynamic(() => import('../components/trading/MiniCharts'), { ssr: false });
const Leaderboard = dynamic(() => import('../components/leaderboard/Leaderboard'), { ssr: false });

export default function Home() {
  const [isLeaderboardVisible, setIsLeaderboardVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { authenticated, login } = usePrivy();
  const { width, height } = useWindowSize();
  
  // Better mobile detection that accounts for tablets
  const isMobile = width ? width < 768 : false;
  const isTablet = width ? width >= 768 && width < 1024 : false;
  const isDesktop = width ? width >= 1024 : false;

  // Track mount state to prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Scroll handler that works with the main window scroll
  const handleScroll = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollThreshold = isMobile ? 200 : 300; // Lower threshold for mobile
    
    setIsLeaderboardVisible(scrollTop > scrollThreshold);
  }, [isMobile]);

  // Set up window scroll listener
  useEffect(() => {
    if (!isMounted) return;

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll, isMounted]);

  const handleLoginClick = () => {
    login();
  };

  // Show loading state while hydrating to prevent layout shift
  if (!isMounted) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Main container - uses min-h-screen for better mobile compatibility */}
      <div className="flex flex-col min-h-screen bg-[#0B0E16]">
        
        {/* Content wrapper - no nested scroll containers */}
        <div className="flex flex-col lg:flex-row flex-1">
          
          {/* Desktop Chat Sidebar - hidden on mobile/tablet */}
          {isDesktop && (
            <div className="w-1/4 xl:w-1/5 border-r border-gray-800">
              <div className="sticky top-0 h-screen">
                <ChatBox />
              </div>
            </div>
          )}
          
          {/* Mobile Chat - only on mobile */}
          {isMobile && <MobileChat />}
          
          {/* Main Content Area - full width on mobile, remaining space on desktop */}
          <div className="flex-1 flex flex-col w-full">
            
            {/* Login Prompt - responsive padding */}
            {!authenticated && (
              <div className="bg-gray-900 mx-2 sm:mx-4 my-2 sm:my-4 p-4 sm:p-6 lg:p-8 rounded-lg text-center">
                <h2 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-4 text-white">
                  Login to Start Trading
                </h2>
                <p className="text-gray-400 mb-4 sm:mb-6 text-sm sm:text-base">
                  Connect your wallet to access all trading features and participate in the game.
                </p>
                <button
                  onClick={handleLoginClick}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg font-bold transition-colors text-sm sm:text-base"
                >
                  Login to Continue
                </button>
              </div>
            )}
            
            {/* Mini Charts - responsive layout */}
            <div className={`${authenticated ? '' : 'opacity-50 pointer-events-none'} w-full`}>
              <MiniCharts data={mockMultipliers} />
            </div>
            
            {/* Main Chart Container - responsive height and padding */}
            <div className={`${authenticated ? '' : 'opacity-50 pointer-events-none'} flex-1 px-2 sm:px-0`}>
              <ChartContainer useMobileHeight={isMobile} />
            </div>
            
            {/* Scroll Indicator - only show on desktop when leaderboard is not visible */}
            {isDesktop && !isLeaderboardVisible && (
              <div className="text-center py-4 text-gray-400 transition-opacity duration-300 animate-bounce">
                <div className="flex flex-col items-center">
                  <span className="text-sm">Scroll down to see leaderboard</span>
                  <span className="text-lg">▼</span>
                </div>
              </div>
            )}

            {/* Leaderboard Section - responsive spacing and visibility */}
            <div className={`
              w-full
              ${isMobile ? 'mt-4' : 'mt-8 lg:mt-12'} 
              mb-4 sm:mb-8 
              px-2 
              transition-opacity duration-300 
              ${(isLeaderboardVisible || isMobile || isTablet) ? 'opacity-100' : 'opacity-0'}
            `}>
              <Leaderboard entries={mockLeaderboardEntries} />
            </div>
            
            {/* Bottom spacing for mobile scroll */}
            <div className="h-4 sm:h-8" />
          </div>
        </div>
      </div>
    </Layout>
  );
}