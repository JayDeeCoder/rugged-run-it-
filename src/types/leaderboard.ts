// src/types/leaderboard.ts
// 🚀 Enhanced type definitions for leaderboard components

// Base leaderboard entry interface that can be extended
export interface BaseLeaderboardEntry {
    // Common fields that might exist in different implementations
    id?: string;
    userId?: string;
    user_id?: string;
    walletAddress?: string;
    username?: string;
    displayName?: string;
    
    // Stats fields
    score?: number;
    winnings?: number;
    totalBets?: number;
    gamesPlayed?: number;
    rank?: number;
    position?: number;
    
    // Metadata
    createdAt?: string;
    updatedAt?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
  }
  
  // Extended leaderboard entry with guaranteed required fields
  export interface EnhancedLeaderboardEntry extends BaseLeaderboardEntry {
    // At least one identifier must exist
    id: string;
    
    // Core leaderboard data
    rank: number;
    score: number;
    displayName: string;
    
    // Optional enhanced fields
    winnings?: number;
    totalBets?: number;
    gamesPlayed?: number;
    winRate?: number;
    biggestWin?: number;
    currentStreak?: number;
  }
  
  // Utility type to check if entry has user identifier
  export type LeaderboardEntryWithUserId = BaseLeaderboardEntry & {
    userId: string;
  };
  
  export type LeaderboardEntryWithWallet = BaseLeaderboardEntry & {
    walletAddress: string;
  };
  
  // Helper function to get user identifier from any leaderboard entry
  export function getUserIdentifier(entry: BaseLeaderboardEntry): string | null {
    return entry.id || 
           entry.userId || 
           entry.user_id || 
           entry.walletAddress || 
           null;
  }
  
  // Helper function to find user position in leaderboard
  export function findUserPosition(
    entries: BaseLeaderboardEntry[], 
    currentUserId: string
  ): number | null {
    const index = entries.findIndex(entry => {
      const identifier = getUserIdentifier(entry);
      return identifier === currentUserId;
    });
    
    return index >= 0 ? index + 1 : null;
  }
  
  // Helper function to check if entry belongs to current user
  export function isCurrentUser(
    entry: BaseLeaderboardEntry, 
    currentUserId: string
  ): boolean {
    const identifier = getUserIdentifier(entry);
    return identifier === currentUserId;
  }
  
  // Props for leaderboard components
  export interface LeaderboardComponentProps {
    entries: BaseLeaderboardEntry[];
    currentUserId?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
    showPosition?: boolean;
    showStats?: boolean;
    maxEntries?: number;
  }
  
  // Container props for leaderboard container
  export interface LeaderboardContainerProps {
    currentUserId?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
    refreshInterval?: number;
    enableRealtime?: boolean;
  }
  
  // API response types
  export interface LeaderboardAPIResponse {
    entries: BaseLeaderboardEntry[];
    total: number;
    page?: number;
    period: 'daily' | 'weekly' | 'monthly' | 'all_time';
    lastUpdated: string;
  }
  
  // Leaderboard update event types for real-time updates
  export interface LeaderboardUpdateEvent {
    type: 'userStatsUpdate' | 'leaderboardUpdate' | 'gameCrashed';
    userId?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
    data?: any;
  }
  
  // Export utility functions
  export const LeaderboardUtils = {
    getUserIdentifier,
    findUserPosition,
    isCurrentUser,
    
    // Format score for display
    formatScore: (score: number): string => {
      if (score >= 1000000) {
        return `${(score / 1000000).toFixed(1)}M`;
      } else if (score >= 1000) {
        return `${(score / 1000).toFixed(1)}K`;
      }
      return score.toLocaleString();
    },
    
    // Format winnings for display
    formatWinnings: (winnings: number): string => {
      return `${winnings.toFixed(6)} SOL`;
    },
    
    // Get rank suffix (1st, 2nd, 3rd, etc.)
    getRankSuffix: (rank: number): string => {
      if (rank >= 11 && rank <= 13) return 'th';
      
      const lastDigit = rank % 10;
      switch (lastDigit) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    }
  };