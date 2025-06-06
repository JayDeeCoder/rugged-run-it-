// src/app/page.tsx - Fixed version with LeaderboardContainer
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
  const { authenticated, login } = usePrivy();
  const { width, height } = useWindowSize();
  
  // More granular screen size detection
  const isExtraSmall = width ? width < 375 : false;  // iPhone SE and smaller
  const isSmall = width ? width < 640 : false;       // Most phones
  const isMobile = width ? width < 768 : false;      // Mobile devices
  const isTablet = width ? width >= 768 && width < 1024 : false;
  const isDesktop = width ? width >= 1024 : false;

  // Track mount state to prevent hydration issues
  useEffect(() => {
    setIsMounted(true);
    // Show leaderboard immediately on mobile/tablet, or after a short delay on desktop
    if (width && width < 1024) {
      setIsLeaderboardVisible(true);
    } else {
      // For desktop, show after a brief delay or on scroll
      const timer = setTimeout(() => setIsLeaderboardVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [width]);

  // Simplified scroll handler - more aggressive visibility
  const handleScroll = useCallback(() => {
    if (typeof window === 'undefined' || !isMounted) return;
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    // Much lower threshold - show after scrolling just 20% on desktop
    const threshold = isDesktop ? windowHeight * 0.2 : 0;
    
    setIsLeaderboardVisible(scrollTop > threshold);
  }, [isDesktop, isMounted]);

  // Set up window scroll listener with debouncing
  useEffect(() => {
    if (!isMounted) return;

    // For mobile/tablet, always show leaderboard
    if (isMobile || isTablet) {
      setIsLeaderboardVisible(true);
      return;
    }

    let ticking = false;
    const scrollHandler = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          handleScroll();
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', scrollHandler, { passive: true });
    handleScroll(); // Initial check

    return () => {
      window.removeEventListener('scroll', scrollHandler);
    };
  }, [handleScroll, isMounted, isMobile, isTablet]);

  const handleLoginClick = () => {
    login();
  };

  // Show loading state while hydrating
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
      {/* Main container */}
      <div className="w-full min-h-screen bg-[#0B0E16]">
        
        {/* Content wrapper - single column on mobile, side-by-side on desktop */}
        <div className="flex flex-col lg:flex-row min-h-screen">
          
          {/* Desktop Chat Sidebar - completely hidden on mobile/tablet */}
          {isDesktop && (
            <div className="w-1/4 xl:w-1/5 border-r border-gray-800 flex-shrink-0">
              <div className="sticky top-0 h-screen overflow-hidden">
                <ChatBox />
              </div>
            </div>
          )}
          
          {/* Mobile Chat - floating overlay, doesn't affect layout */}
          {isMobile && <MobileChat />}
          
          {/* Main Content Area */}
          <div className="flex-1 flex flex-col w-full">
            
            {/* Login Prompt - fully responsive */}
            {!authenticated && (
              <div className={`
                bg-gray-900 rounded-lg text-center
                ${isExtraSmall ? 'mx-1 my-2 p-3' : 
                  isSmall ? 'mx-2 my-3 p-4' : 
                  'mx-4 my-4 p-6 lg:p-8'}
              `}>
                <h2 className={`
                  font-bold mb-3 text-white
                  ${isExtraSmall ? 'text-lg' : 
                    isSmall ? 'text-xl' : 
                    'text-2xl'}
                `}>
                  Login to Start Trading
                </h2>
                <p className={`
                  text-gray-400 mb-4
                  ${isExtraSmall ? 'text-xs' : 
                    isSmall ? 'text-sm' : 
                    'text-base'}
                `}>
                  Connect your wallet to access all trading features and participate in the game.
                </p>
                <button
                  onClick={handleLoginClick}
                  className={`
                    bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold transition-colors
                    ${isExtraSmall ? 'px-3 py-2 text-sm' : 
                      isSmall ? 'px-4 py-2 text-sm' : 
                      'px-6 py-3 text-base'}
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
              ${isExtraSmall ? 'px-1' : isSmall ? 'px-2' : 'px-4 lg:px-0'}
            `}>
              <div className="w-full">
                <ChartContainer useMobileHeight={isMobile} />
              </div>
            </div>
            
            {/* Scroll Indicator - only show on desktop when leaderboard is hidden */}
            {isDesktop && !isLeaderboardVisible && (
              <div className="text-center py-4 text-gray-400 transition-opacity duration-300 animate-bounce">
                <div className="flex flex-col items-center">
                  <span className="text-sm">Scroll Down To See TOP RUGGERS</span>
                  <span className="text-lg">▼</span>
                </div>
              </div>
            )}

            {/* FIXED: Leaderboard Section using LeaderboardContainer */}
            <div className={`
              w-full
              ${isExtraSmall ? 'mt-2 mb-2 px-1' : 
                isSmall ? 'mt-4 mb-4 px-2' : 
                isMobile ? 'mt-6 mb-6 px-2' : 
                'mt-12 mb-8 px-4'}
              transition-all duration-500 ease-in-out
              ${(isLeaderboardVisible || isMobile || isTablet) ? 
                'opacity-100 translate-y-0 pointer-events-auto' : 
                'opacity-0 translate-y-4 pointer-events-none'
              }
            `}>
              <div className="w-full">
                <LeaderboardContainer 
                  period="daily"
                  limit={10}
                  showHeader={true}
                  showRefresh={false}
                />
              </div>
            </div>
            
            {/* Debug info - remove this in production */}
            {process.env.NODE_ENV === 'development' && (
              <div className="fixed bottom-4 right-4 bg-black/80 text-white p-2 rounded text-xs z-50">
                <div>Width: {width}px</div>
                <div>Mounted: {isMounted ? 'Yes' : 'No'}</div>
                <div>Mobile: {isMobile ? 'Yes' : 'No'}</div>
                <div>Tablet: {isTablet ? 'Yes' : 'No'}</div>
                <div>Desktop: {isDesktop ? 'Yes' : 'No'}</div>
                <div>Leaderboard Visible: {isLeaderboardVisible ? 'Yes' : 'No'}</div>
              </div>
            )}
            
            {/* Bottom spacing for complete scroll */}
            <div className={`
              ${isExtraSmall ? 'h-4' : 
                isSmall ? 'h-8' : 
                'h-12'}
            `} />
          </div>
        </div>
      </div>
    </Layout>
  );
}