// src/app/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
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
  const mainContentRef = useRef<HTMLDivElement | null>(null);
  const { authenticated, login } = usePrivy();
  const { width } = useWindowSize(); // Get current window width
  const isMobile = width ? width < 768 : false; // Check if mobile based on width
  
  // Track scroll position to show/hide leaderboard
  useEffect(() => {
    const handleScroll = () => {
      if (mainContentRef.current) {
        const { scrollTop } = mainContentRef.current;
        const scrollThreshold = 100;
        
        if (scrollTop > scrollThreshold) {
          setIsLeaderboardVisible(true);
        } else {
          setIsLeaderboardVisible(false);
        }
      }
    };

    const mainContent = mainContentRef.current;
    if (mainContent) {
      mainContent.addEventListener('scroll', handleScroll);
    }

    return () => {
      if (mainContent) {
        mainContent.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const handleLoginClick = () => {
    login();
  };

  return (
    <Layout>
      <div className="flex flex-col h-screen">
        <div className="flex flex-col lg:flex-row h-full">
          {/* Chat sidebar - only show on desktop */}
          {!isMobile && (
            <div className="hidden lg:block lg:w-1/4 xl:w-1/5 h-64 lg:h-full">
              <ChatBox />
            </div>
          )}
          
          {/* Mobile chat popup - only show on mobile */}
          {isMobile && <MobileChat />}
          
          {/* Main content - Chart and trading controls */}
          <div 
            ref={mainContentRef}
            className="w-full lg:w-3/4 xl:w-4/5 flex flex-col overflow-y-auto"
          >
            {/* Login prompt for non-authenticated users */}
            {!authenticated && (
              <div className="bg-gray-900 mx-4 my-4 p-8 rounded-lg text-center">
                <h2 className="text-2xl font-bold mb-4 text-white">Login to Start Trading</h2>
                <p className="text-gray-400 mb-6">
                  Connect your wallet to access all trading features and participate in the game.
                </p>
                <button
                  onClick={handleLoginClick}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold transition-colors"
                >
                  Login to Continue
                </button>
              </div>
            )}
            
            {/* Mini charts showing recent game results */}
            <div className={authenticated ? '' : 'opacity-50 pointer-events-none'}>
              <MiniCharts data={mockMultipliers} />
            </div>
            
            {/* Main chart container - adjusted height for mobile */}
            <div className={authenticated ? '' : 'opacity-50 pointer-events-none'}>
              <ChartContainer useMobileHeight={isMobile} />
            </div>
            
            {/* Visual indicator to scroll for leaderboard */}
            {!isLeaderboardVisible && !isMobile && (
              <div className="text-center py-4 text-gray-400 transition-opacity duration-300">
                Scroll down to see leaderboard ▼
              </div>
            )}

            {/* Leaderboard section with added top margin to avoid overlapping */}
            <div className={`mt-12 md:mt-24 mb-8 mx-2 transition-opacity duration-300 ${isLeaderboardVisible || isMobile ? 'opacity-100' : 'opacity-0'}`}>
              <Leaderboard entries={mockLeaderboardEntries} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}