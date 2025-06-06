// src/types/user.ts
export type UserBadge = 
  | 'newcomer' 
  | 'user' 
  | 'verified' 
  | 'bronze' 
  | 'silver' 
  | 'gold' 
  | 'diamond' 
  | 'legend'
  | 'moderator'
  | 'admin';

export type UserRole = 'user' | 'moderator' | 'admin';

export interface UserProfile {
  id: string;
  username: string;
  wallet_address: string;
  external_wallet_address: string;
  privy_wallet_address?: string;
  avatar?: string;
  level: number;
  experience: number;
  experience_points: number;
  badge?: UserBadge;
  badges_earned: string[];
  achievements: string[];
  role: UserRole;
  is_connected: boolean;
  created_at: string;
  updated_at: string;
  last_active?: string;
}

export interface UserStats {
  total_games_played: number;
  total_bets_placed: number;
  games_won: number;
  games_lost: number;
  total_wagered: number;
  total_won: number;
  total_lost: number;
  net_profit: number;
  win_rate: number;
  current_win_streak: number;
  best_win_streak: number;
  largest_win: number;
  largest_loss: number;
  best_multiplier: number;
  daily_profit: number;
  weekly_profit: number;
  monthly_profit: number;
}

export interface UserBalance {
  custodial_balance: number;
  privy_balance: number;
  embedded_balance: number;
  total_balance: number;
  total_deposited: number;
  custodial_total_deposited: number;
}

export interface CompleteUserData extends UserProfile, UserStats, UserBalance {
  risk_score: number;
  behavior_pattern: string;
  preferred_bet_range: string;
}

// Leaderboard specific types
export interface LeaderboardUser {
  username: string;
  level: number;
  role: string;
  avatar?: string;
  badge?: UserBadge;
  gamesPlayed?: number;
  winRate?: number;
  bestMultiplier?: number;
  totalWagered?: number;
}

export interface LeaderboardEntry {
  id: string;
  wallet_address: string;
  username: string;
  total_profit: number;
  profit_percentage: number;
  games_played: number;
  best_multiplier: number;
  rank: number;
  avatar?: string;
  level?: number;
  badge?: UserBadge;
  win_rate?: number;
  total_wagered?: number;
}

// Badge progression system
export interface BadgeRequirement {
  badge: UserBadge;
  requirements: {
    level?: number;
    games_played?: number;
    net_profit?: number;
    win_rate?: number;
    total_wagered?: number;
    special_conditions?: string[];
  };
  rewards: {
    experience_bonus?: number;
    special_privileges?: string[];
  };
}

export const BADGE_PROGRESSION: BadgeRequirement[] = [
  {
    badge: 'newcomer',
    requirements: {},
    rewards: {}
  },
  {
    badge: 'user',
    requirements: {
      games_played: 10
    },
    rewards: {
      experience_bonus: 100
    }
  },
  {
    badge: 'verified',
    requirements: {
      games_played: 50,
      level: 5
    },
    rewards: {
      experience_bonus: 250,
      special_privileges: ['chat_mentions']
    }
  },
  {
    badge: 'bronze',
    requirements: {
      games_played: 100,
      net_profit: 100,
      level: 10
    },
    rewards: {
      experience_bonus: 500
    }
  },
  {
    badge: 'silver',
    requirements: {
      games_played: 250,
      net_profit: 500,
      level: 20
    },
    rewards: {
      experience_bonus: 1000
    }
  },
  {
    badge: 'gold',
    requirements: {
      games_played: 500,
      net_profit: 2000,
      level: 35,
      win_rate: 60
    },
    rewards: {
      experience_bonus: 2500,
      special_privileges: ['leaderboard_highlight']
    }
  },
  {
    badge: 'diamond',
    requirements: {
      games_played: 1000,
      net_profit: 10000,
      level: 50,
      win_rate: 70
    },
    rewards: {
      experience_bonus: 5000,
      special_privileges: ['chat_colors', 'priority_support']
    }
  },
  {
    badge: 'legend',
    requirements: {
      games_played: 2500,
      net_profit: 50000,
      level: 75,
      win_rate: 75,
      special_conditions: ['top_10_leaderboard_weekly']
    },
    rewards: {
      experience_bonus: 10000,
      special_privileges: ['custom_avatar', 'legend_chat_tag', 'beta_features']
    }
  }
];

// User context for React
export interface UserContextType {
  user: CompleteUserData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (walletAddress: string) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<CompleteUserData>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

// API response types
export interface AuthResponse {
  success: boolean;
  user?: CompleteUserData;
  isNewUser?: boolean;
  error?: string;
}

export interface BalanceResponse {
  userId: string;
  custodialBalance: number;
  privyBalance: number;
  embeddedBalance: number;
  totalBalance: number;
  totalDeposited: number;
  canBet: boolean;
  canWithdraw: boolean;
  walletAddress: string;
  lastUpdated: string;
  source: string;
}

// Utility functions for user data
export const getUserDisplayName = (user: Partial<UserProfile>): string => {
  return user.username || `User_${user.id?.slice(-8) || 'Unknown'}`;
};

export const getUserBadgeLevel = (badge?: UserBadge): number => {
  const badgeOrder: UserBadge[] = ['newcomer', 'user', 'verified', 'bronze', 'silver', 'gold', 'diamond', 'legend'];
  return badgeOrder.indexOf(badge || 'newcomer');
};

export const canUserUpgradeBadge = (user: UserStats & UserProfile, targetBadge: UserBadge): boolean => {
  const requirement = BADGE_PROGRESSION.find(b => b.badge === targetBadge);
  if (!requirement) return false;

  const { requirements } = requirement;
  
  return (
    (!requirements.level || user.level >= requirements.level) &&
    (!requirements.games_played || user.total_games_played >= requirements.games_played) &&
    (!requirements.net_profit || user.net_profit >= requirements.net_profit) &&
    (!requirements.win_rate || user.win_rate >= requirements.win_rate) &&
    (!requirements.total_wagered || user.total_wagered >= requirements.total_wagered)
  );
};

export const getNextBadge = (currentBadge?: UserBadge): UserBadge | null => {
  const badgeOrder: UserBadge[] = ['newcomer', 'user', 'verified', 'bronze', 'silver', 'gold', 'diamond', 'legend'];
  const currentIndex = badgeOrder.indexOf(currentBadge || 'newcomer');
  
  if (currentIndex === -1 || currentIndex >= badgeOrder.length - 1) {
    return null;
  }
  
  return badgeOrder[currentIndex + 1];
};

export const calculateExperienceToNextLevel = (currentLevel: number, currentExp: number): number => {
  // Experience required: level * 100 + (level - 1) * 50
  const expForNextLevel = currentLevel * 100 + (currentLevel - 1) * 50;
  return Math.max(0, expForNextLevel - currentExp);
};

export const formatUserStats = (stats: Partial<UserStats>) => {
  return {
    winRate: ((stats.win_rate || 0) * 100).toFixed(1),
    profitLoss: (stats.net_profit || 0).toFixed(2),
    gamesPlayed: stats.total_games_played || 0,
    bestMultiplier: (stats.best_multiplier || 0).toFixed(2)
  };
};