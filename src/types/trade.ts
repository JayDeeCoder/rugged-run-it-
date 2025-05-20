// src/types/trade.ts
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'executed' | 'cancelled';

export interface TradeData {
  price: number;
  time: number;
}

export interface ChartData {
  symbol: string;
  interval: string;
  candles: Candle[];
  lastUpdated: string;
}

export interface OrderStats {
  average: number;
  lastPrice: number;
}

export interface UserPosition {
  username: string;
  amount: number;
  percentage: string;
}

export interface PresaleItem {
  price: number;
  description: string;
}

export interface Order {
  id?: string;
  side: OrderSide;
  amount: number;
  price?: number;
  timestamp: string;
  status?: OrderStatus;
}

export interface Trade extends Order {
  id: string;
  executedAt: string;
  executionPrice: number;
  status: 'executed';
}

export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Game-specific types
export interface GameResult {
  value: number;
  label: string;
  timestamp: number;
  candleData?: CandlestickData[];
}

export interface CandlestickData {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface GameState {
  isActive: boolean;
  currentMultiplier: number;
  hasActiveGame: boolean;
  betAmount: number;
  startTime: number;
  cashoutTime?: number;
  isRug: boolean;
  rugPullThreshold: number;
  totalPlayerBets: number;
  activePlayers: number;
}

export interface PlayerBet {
  userId: string;
  amount: number;
  timestamp: number;
  isCashedOut: boolean;
  cashoutMultiplier?: number;
  profit?: number;
}