// src/app/page.tsx - Fixed with proper LeaderboardContainer props
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
  
  // Enhanced screen size detection with iPad support
  const isExtraSmall = width ? width < 375 : false;    // iPhone SE and smaller
  const isSmall = width ? width < 640 : false;         // Most phones
  const isMobile = width ? width < 768 : false;        // Mobile devices
  const isTablet = width ? width >= 768 && width < 1024 : false;  // iPad and tablets
  const isDesktop = width ? width >= 1024 : false;     // Desktop
  const isMobileOrTablet = width ? width < 1024 : false; // Combined mobile/tablet check

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
      <div className="flex h-full bg-[#0B0E16]">
        
        {/* Real ChatBox with Collapsible Functionality - Hidden on mobile, shown on tablet+ */}
        {!isMobile && (
          <div className="flex-shrink-0">
            <ChatBox />
          </div>
        )}
        
        {/* Mobile Chat - floating overlay, doesn't affect layout */}
        {isMobile && <MobileChat />}
        
        {/* Main Content Area - Scrollable */}
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden"
          onScroll={handleMainContentScroll}
        >
          <div className="min-h-full flex flex-col">
            
            {/* Login Prompt - Enhanced responsiveness */}
            {!authenticated && (
              <div className={`
                bg-gray-900 rounded-lg text-center mx-auto
                ${isExtraSmall ? 'mx-2 my-3 p-4 max-w-sm' : 
                  isSmall ? 'mx-3 my-4 p-5 max-w-md' : 
                  isMobile ? 'mx-4 my-5 p-6 max-w-lg' :
                  isTablet ? 'mx-6 my-6 p-8 max-w-xl' :
                  'mx-8 my-8 p-10 max-w-2xl'}
              `}>
                <h2 className={`
                  font-bold mb-4 text-white
                  ${isExtraSmall ? 'text-lg' : 
                    isSmall ? 'text-xl' : 
                    isMobile ? 'text-2xl' :
                    isTablet ? 'text-3xl' :
                    'text-4xl'}
                `}>
                  Login to Start Trading
                </h2>
                <p className={`
                  text-gray-400 mb-6
                  ${isExtraSmall ? 'text-sm' : 
                    isSmall ? 'text-base' : 
                    isMobile ? 'text-lg' :
                    isTablet ? 'text-xl' :
                    'text-xl'}
                `}>
                  Create an account to access all trading & Wallet features and participate in the game.
                </p>
                <button
                  onClick={handleLoginClick}
                  className={`
                    bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition-colors
                    ${isExtraSmall ? 'px-4 py-2 text-sm' : 
                      isSmall ? 'px-5 py-3 text-base' : 
                      isMobile ? 'px-6 py-3 text-lg' :
                      isTablet ? 'px-8 py-4 text-xl' :
                      'px-10 py-4 text-xl'}
                  `}
                >
                  Login to Continue
                </button>
              </div>
            )}
            
            {/* Main Chart Container */}
            <div className={`
              flex-1 w-full
              ${authenticated ? '' : 'opacity-50 pointer-events-none'}
              ${isExtraSmall ? 'px-1' : 
                isSmall ? 'px-2' : 
                isMobile ? 'px-3' :
                isTablet ? 'px-4' :
                'px-6'}
            `}>
              <div className="w-full h-full">
                <ChartContainer useMobileHeight={isMobile} />
              </div>
            </div>
            
            {/* Scroll Indicator - only show on desktop when leaderboard is hidden */}
            {isDesktop && !isLeaderboardVisible && (
              <div className="text-center py-6 text-gray-400 transition-opacity duration-300 animate-bounce">
                <div className="flex flex-col items-center">
                  <span className="text-base">Scroll Down To See TOP RUGGERS</span>
                  <span className="text-2xl">▼</span>
                </div>
              </div>
            )}

            {/* Leaderboard Section */}
            <div className={`
              w-full
              ${isExtraSmall ? 'mt-4 mb-4 px-2' : 
                isSmall ? 'mt-6 mb-6 px-3' : 
                isMobile ? 'mt-8 mb-8 px-4' :
                isTablet ? 'mt-10 mb-10 px-6' :
                'mt-12 mb-12 px-8'}
              transition-all duration-500 ease-in-out
              ${(isLeaderboardVisible || isMobileOrTablet) ? 
                'opacity-100 translate-y-0 pointer-events-auto' : 
                'opacity-0 translate-y-8 pointer-events-none'
              }
            `}>
              <div className="w-full max-w-6xl mx-auto">
                {/* 🚀 FIXED: Use only supported props */}
                <LeaderboardContainer 
                  period="daily"
                  currentUserId={currentUserId}
                />
              </div>
            </div>
            
            {/* Bottom spacing for complete scroll */}
            <div className={`
              ${isExtraSmall ? 'h-8' : 
                isSmall ? 'h-12' : 
                isMobile ? 'h-16' :
                isTablet ? 'h-20' :
                'h-24'}
            `} />
          </div>
        </div>
      </div>
    </Layout>
  );
}