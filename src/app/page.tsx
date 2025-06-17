// src/app/page.tsx - Complete Fix with proper responsive design
'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/layout/Layout';
import dynamic from 'next/dynamic';
import ChatBox from '../components/chat/ChatBox';
import MobileChat from '../components/chat/MobileChat';
import { usePrivy } from '@privy-io/react-auth';
import useWindowSize from '../hooks/useWindowSize';

// Dynamically import components that might cause issues on SSR
const ChartContainer = dynamic(() => import('../components/trading/ChartContainer'), { ssr: false });
const LeaderboardContainer = dynamic(() => import('../components/leaderboard/LeaderboardContainer'), { ssr: false });

export default function Home() {
  const [isLeaderboardVisible, setIsLeaderboardVisible] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const { authenticated, login, user } = usePrivy();
  const { width, height } = useWindowSize();
  
  // 🚀 ENHANCED: Better screen size detection with intermediate breakpoints
  const isExtraSmall = width ? width < 375 : false;    // iPhone SE and smaller
  const isSmall = width ? width < 640 : false;         // Most phones
  const isMobile = width ? width < 768 : false;        // Mobile devices
  const isTablet = width ? width >= 768 && width < 1024 : false;  // iPad and tablets
  const isSmallLaptop = width ? width >= 1024 && width < 1280 : false; // Small laptops
  const isLargeLaptop = width ? width >= 1280 && width < 1536 : false; // Large laptops
  const isDesktop = width ? width >= 1536 : false;     // Large desktop
  const isMobileOrTablet = width ? width < 1024 : false; // Combined mobile/tablet check
  const isIntermediateSize = width ? width >= 768 && width < 1280 : false; // Problem sizes

  // Track mount state to prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
    // Show leaderboard immediately on mobile/tablet, or after a short delay on desktop
    if (isMobileOrTablet) {
      setIsLeaderboardVisible(true);
    } else {
      // For desktop, show after a brief delay or on scroll
      const timer = setTimeout(() => setIsLeaderboardVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [isMobileOrTablet]);

  // Simplified scroll handler for main content area
  const handleMainContentScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (!isMounted || isMobileOrTablet) return;
    
    const element = e.target as HTMLDivElement;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    
    // Show leaderboard when scrolled past 30% of content
    const scrollPercentage = scrollTop / (scrollHeight - clientHeight);
    setIsLeaderboardVisible(scrollPercentage > 0.3);
  }, [isMounted, isMobileOrTablet]);

  const handleLoginClick = () => {
    login();
  };

  // Get current user ID for leaderboard positioning
  const currentUserId = user?.id || user?.wallet?.address || undefined;

  // Show loading state while hydrating
  if (!isMounted) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <div className="animate-pulse text-gray-400">Loading...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* 🚀 FIXED: Main container with proper height and overflow handling */}
      <div className={`
        flex h-full bg-[#0B0E16] min-h-0
        ${isIntermediateSize ? 'overflow-hidden' : ''}
      `}>
        
        {/* Real ChatBox with Collapsible Functionality - Hidden on mobile, shown on tablet+ */}
        {!isMobile && (
          <div className="flex-shrink-0">
            <ChatBox />
          </div>
        )}
        
        {/* Mobile Chat - floating overlay, doesn't affect layout */}
        {isMobile && <MobileChat />}
        
        {/* 🚀 FIXED: Main Content Area with responsive overflow behavior */}
        <div 
          className={`
            flex-1 min-w-0 min-h-0
            ${isIntermediateSize 
              ? 'flex flex-col overflow-hidden' 
              : 'overflow-y-auto overflow-x-hidden'
            }
          `}
          onScroll={!isIntermediateSize ? handleMainContentScroll : undefined}
        >
          {/* 🚀 FIXED: Content wrapper with size-specific flex behavior */}
          <div className={`
            ${isIntermediateSize 
              ? 'flex-1 min-h-0 flex flex-col' 
              : 'min-h-full flex flex-col'
            }
          `}>
            
            {/* Login Prompt - Enhanced responsiveness */}
            {!authenticated && (
              <div className={`
                bg-gray-900 rounded-lg text-center mx-auto flex-shrink-0
                ${isExtraSmall ? 'mx-2 my-2 p-3 max-w-sm' : 
                  isSmall ? 'mx-3 my-3 p-4 max-w-md' : 
                  isMobile ? 'mx-4 my-4 p-5 max-w-lg' :
                  isTablet ? 'mx-4 my-3 p-4 max-w-xl' :
                  isSmallLaptop ? 'mx-6 my-4 p-5 max-w-xl' :
                  isLargeLaptop ? 'mx-8 my-5 p-6 max-w-2xl' :
                  'mx-8 my-6 p-8 max-w-3xl'}
              `}>
                <h2 className={`
                  font-bold mb-3 text-white
                  ${isExtraSmall ? 'text-lg' : 
                    isSmall ? 'text-xl' : 
                    isMobile ? 'text-2xl' :
                    isTablet ? 'text-2xl' :
                    isSmallLaptop ? 'text-3xl' :
                    isLargeLaptop ? 'text-3xl' :
                    'text-4xl'}
                `}>
                  Login to Start Trading
                </h2>
                <p className={`
                  text-gray-400 mb-4
                  ${isExtraSmall ? 'text-sm' : 
                    isSmall ? 'text-base' : 
                    isMobile ? 'text-lg' :
                    isTablet ? 'text-base' :
                    isSmallLaptop ? 'text-lg' :
                    isLargeLaptop ? 'text-xl' :
                    'text-xl'}
                `}>
                  Create an account to access all trading & Wallet features and participate in the game.
                </p>
                <button
                  onClick={handleLoginClick}
                  className={`
                    bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition-colors
                    ${isExtraSmall ? 'px-3 py-2 text-sm' : 
                      isSmall ? 'px-4 py-2 text-base' : 
                      isMobile ? 'px-5 py-3 text-lg' :
                      isTablet ? 'px-6 py-3 text-base' :
                      isSmallLaptop ? 'px-7 py-3 text-lg' :
                      isLargeLaptop ? 'px-8 py-3 text-xl' :
                      'px-10 py-4 text-xl'}
                  `}
                >
                  Login to Continue
                </button>
              </div>
            )}
            
            {/* 🚀 FIXED: Main Chart Container with size-specific constraints */}
            <div className={`
              w-full relative
              ${authenticated ? '' : 'opacity-50 pointer-events-none'}
              ${isIntermediateSize 
                ? 'flex-1 min-h-0' 
                : 'flex-1'
              }
              ${isExtraSmall ? 'px-1' : 
                isSmall ? 'px-2' : 
                isMobile ? 'px-3' :
                isTablet ? 'px-2' :
                isSmallLaptop ? 'px-3' :
                isLargeLaptop ? 'px-4' :
                'px-6'}
            `}>
              <div className="w-full h-full">
                <ChartContainer 
                  useMobileHeight={isMobile}
                />
              </div>
            </div>
            
            {/* Scroll Indicator - only show on larger screens when leaderboard is hidden */}
            {(isLargeLaptop || isDesktop) && !isLeaderboardVisible && (
              <div className="text-center py-4 text-gray-400 transition-opacity duration-300 animate-bounce flex-shrink-0">
                <div className="flex flex-col items-center">
                  <span className="text-sm">Scroll Down To See TOP RUGGERS</span>
                  <span className="text-xl">▼</span>
                </div>
              </div>
            )}

            {/* 🚀 FIXED: Leaderboard Section with size-specific behavior */}
            <div className={`
              w-full
              ${isIntermediateSize 
                ? 'flex-shrink-0 overflow-y-auto max-h-[40vh]' 
                : 'flex-shrink-0'
              }
              ${isExtraSmall ? 'mt-2 mb-4 px-2' : 
                isSmall ? 'mt-3 mb-4 px-3' : 
                isMobile ? 'mt-4 mb-6 px-4' :
                isTablet ? 'mt-3 mb-4 px-3' :
                isSmallLaptop ? 'mt-4 mb-5 px-4' :
                isLargeLaptop ? 'mt-6 mb-6 px-6' :
                'mt-8 mb-8 px-8'}
              transition-all duration-500 ease-in-out
              ${(isLeaderboardVisible || isMobileOrTablet) ? 
                'opacity-100 translate-y-0 pointer-events-auto' : 
                'opacity-0 translate-y-8 pointer-events-none'
              }
            `}>
              <div className="w-full max-w-6xl mx-auto">
                <LeaderboardContainer 
                  period="daily"
                  currentUserId={currentUserId}
                />
              </div>
            </div>
            
            {/* 🚀 FIXED: Bottom spacing with size-specific heights */}
            <div className={`
              flex-shrink-0
              ${isExtraSmall ? 'h-4' : 
                isSmall ? 'h-6' : 
                isMobile ? 'h-8' :
                isTablet ? 'h-4' :
                isSmallLaptop ? 'h-6' :
                isLargeLaptop ? 'h-8' :
                'h-12'}
            `} />
          </div>
        </div>
      </div>
    </Layout>
  );
}