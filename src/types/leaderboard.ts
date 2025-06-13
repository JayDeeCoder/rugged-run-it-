// src/types/leaderboard.ts
// 🚀 Enhanced types and utilities for the new XP system

import { LeaderboardEntry, LevelProgressData } from '../services/api';

// 🚀 Base leaderboard entry interface
export interface BaseLeaderboardEntry {
  id: string;
  username: string;
  wallet_address: string;
  rank: number;
  level: number;
  experience_points: number;
  total_profit: number;
  profit_percentage: number;
  games_played: number;
  win_rate: number;
  avatar?: string;
  badge?: string;
}

// 🚀 Enhanced leaderboard entry with XP system data
export interface EnhancedLeaderboardEntry extends BaseLeaderboardEntry {
  levelProgress?: LevelProgressData;
  isEarlyLevel?: boolean;
  readyToLevelUp?: boolean;
  tier?: number;
  achievements?: string[];
  badges_earned?: string[];
  current_win_streak?: number;
  best_win_streak?: number;
  best_multiplier?: number;
  total_wagered?: number;
  total_won?: number;
}

// 🚀 Container props interface
export interface LeaderboardContainerProps {
  currentUserId?: string;
  period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
  maxEntries?: number;
  showCurrentUser?: boolean;
  enableRealTimeUpdates?: boolean;
}

// 🚀 XP System utilities
export class LeaderboardUtils {
  
  /**
   * Find user's position in leaderboard
   */
  static findUserPosition(entries: BaseLeaderboardEntry[], userId: string): number | null {
    const index = entries.findIndex(entry => entry.id === userId);
    return index >= 0 ? index + 1 : null;
  }

  /**
   * Check if entry belongs to current user
   */
  static isCurrentUser(entry: BaseLeaderboardEntry, userId: string): boolean {
    return entry.id === userId;
  }

  /**
   * Get rank suffix (1st, 2nd, 3rd, etc.)
   */
  static getRankSuffix(rank: number): string {
    if (rank >= 11 && rank <= 13) return 'th';
    
    switch (rank % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  /**
   * Format score for display
   */
  static formatScore(score: number): string {
    if (score >= 1000000) {
      return `${(score / 1000000).toFixed(1)}M`;
    }
    if (score >= 1000) {
      return `${(score / 1000).toFixed(1)}k`;
    }
    return score.toFixed(0);
  }

  /**
   * Format winnings for display
   */
  static formatWinnings(winnings: number): string {
    const isPositive = winnings >= 0;
    const absWinnings = Math.abs(winnings);
    
    let formatted: string;
    if (absWinnings >= 1000) {
      formatted = `${(absWinnings / 1000).toFixed(1)}k`;
    } else {
      formatted = absWinnings.toFixed(2);
    }
    
    return `${isPositive ? '+' : '-'}${formatted} SOL`;
  }

  /**
   * Format XP for display
   */
  static formatXP(xp: number): string {
    if (xp >= 10000) {
      return `${(xp / 1000).toFixed(1)}k`;
    }
    return xp.toString();
  }

  /**
   * Get level tier information
   */
  static getLevelTier(level: number): {
    tier: number;
    name: string;
    color: string;
    icon: string;
  } {
    const tier = Math.ceil(level / 10);
    
    if (level <= 3) {
      return { tier: 0, name: 'Rookie', color: 'text-green-400', icon: '🌱' };
    }
    
    if (level <= 8) {
      return { tier: 0, name: 'Rising', color: 'text-blue-400', icon: '⭐' };
    }

    if (tier <= 2) {
      return { tier, name: `Tier ${tier}`, color: 'text-purple-400', icon: '💎' };
    }

    return { tier, name: `Elite T${tier}`, color: 'text-yellow-400', icon: '👑' };
  }

  /**
   * Calculate level progress percentage
   */
  static calculateLevelProgressPercentage(
    currentXP: number, 
    currentLevel: number,
    getXPRequirement: (level: number) => number
  ): number {
    const currentLevelXP = getXPRequirement(currentLevel);
    const nextLevelXP = getXPRequirement(currentLevel + 1);
    const xpNeededThisLevel = nextLevelXP - currentLevelXP;
    const xpProgressThisLevel = Math.max(0, currentXP - currentLevelXP);
    
    return Math.min(100, Math.max(0, (xpProgressThisLevel / xpNeededThisLevel) * 100));
  }

  /**
   * Get rank styling class
   */
  static getRankStyling(rank: number): string {
    switch (rank) {
      case 1:
        return 'text-yellow-400 font-bold text-lg drop-shadow-lg';
      case 2:
        return 'text-gray-300 font-bold text-lg';
      case 3:
        return 'text-orange-400 font-bold text-lg';
      default:
        return rank <= 10 ? 'text-white font-medium' : 'text-gray-400 font-medium';
    }
  }

  /**
   * Check if user should receive early level boost
   */
  static isEarlyLevelUser(level: number): boolean {
    return level <= 3;
  }

  /**
   * Get XP boost multiplier for level
   */
  static getXPBoostMultiplier(level: number): number {
    if (level <= 3) return 3.0;  // 300% boost
    if (level <= 5) return 2.0;  // 200% boost
    if (level <= 8) return 1.5;  // 150% boost
    return 1.0; // Normal XP
  }

  /**
   * Sort leaderboard entries by enhanced criteria
   */
  static sortLeaderboardEntries(entries: EnhancedLeaderboardEntry[]): EnhancedLeaderboardEntry[] {
    return entries.sort((a, b) => {
      // Primary: Win rate (higher is better)
      if (a.win_rate !== b.win_rate) {
        return b.win_rate - a.win_rate;
      }
      
      // Secondary: Net profit (higher is better)
      if (a.total_profit !== b.total_profit) {
        return b.total_profit - a.total_profit;
      }
      
      // Tertiary: Total games played (more active users rank higher)
      if (a.games_played !== b.games_played) {
        return b.games_played - a.games_played;
      }
      
      // Quaternary: Experience points (higher XP ranks higher)
      return b.experience_points - a.experience_points;
    });
  }

  /**
   * Filter leaderboard by time period
   */
  static filterByPeriod(
    entries: EnhancedLeaderboardEntry[], 
    period: 'daily' | 'weekly' | 'monthly' | 'all_time'
  ): EnhancedLeaderboardEntry[] {
    // Note: In a real implementation, this would filter based on 
    // timestamp data from the API. For now, we return all entries
    // since the API handles period filtering.
    return entries;
  }

  /**
   * Get enhanced user stats summary
   */
  static getUserStatsSummary(entry: EnhancedLeaderboardEntry): {
    performance: 'excellent' | 'good' | 'average' | 'needs_improvement';
    highlights: string[];
    recommendations: string[];
  } {
    const winRate = entry.win_rate;
    const gamesPlayed = entry.games_played;
    const currentStreak = entry.current_win_streak || 0;
    const isEarlyLevel = entry.level <= 3;

    let performance: 'excellent' | 'good' | 'average' | 'needs_improvement';
    const highlights: string[] = [];
    const recommendations: string[] = [];

    // Determine performance level
    if (winRate >= 70 && gamesPlayed >= 20) {
      performance = 'excellent';
      highlights.push(`Outstanding ${winRate.toFixed(1)}% win rate`);
    } else if (winRate >= 55 && gamesPlayed >= 10) {
      performance = 'good';
      highlights.push(`Strong ${winRate.toFixed(1)}% win rate`);
    } else if (winRate >= 40 || gamesPlayed < 10) {
      performance = 'average';
      if (gamesPlayed < 10) highlights.push('New player building experience');
    } else {
      performance = 'needs_improvement';
      recommendations.push('Focus on bankroll management');
    }

    // Add highlights based on stats
    if (currentStreak >= 5) {
      highlights.push(`${currentStreak} game win streak!`);
    }
    
    if (isEarlyLevel) {
      highlights.push('Early level XP boost active');
    }

    if (entry.best_multiplier && entry.best_multiplier >= 10) {
      highlights.push(`Amazing ${entry.best_multiplier.toFixed(1)}x best multiplier`);
    }

    // Add recommendations
    if (gamesPlayed < 20) {
      recommendations.push('Play more games to improve ranking');
    }
    
    if (isEarlyLevel) {
      recommendations.push('Take advantage of early level XP bonuses');
    }

    return { performance, highlights, recommendations };
  }
}

// 🚀 Export types for use in components
export type LeaderboardPeriod = 'daily' | 'weekly' | 'monthly' | 'all_time';
export type UserPerformance = 'excellent' | 'good' | 'average' | 'needs_improvement';

// 🚀 Constants for the XP system
export const XP_CONSTANTS = {
  EARLY_LEVEL_THRESHOLD: 3,
  EARLY_LEVEL_BOOST: 3.0,
  RISING_LEVEL_THRESHOLD: 8,
  RISING_LEVEL_BOOST: 1.5,
  TIER_SIZE: 10,
  MIN_GAMES_FOR_RANKING: 5,
  XP_DISPLAY_THRESHOLD: 10000, // Show in 'k' format above this
} as const;