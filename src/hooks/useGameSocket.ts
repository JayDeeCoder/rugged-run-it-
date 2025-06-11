// src/hooks/useGameSocket.ts
// 🚀 Updated useGameSocket hook using shared socket service

import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { sharedSocket } from '../services/sharedSocket';

// Enhanced GameState interface with liquidity tracking
interface GameState {
  id: string;
  gameNumber: number;
  multiplier: number;
  status: 'waiting' | 'active' | 'crashed';
  totalBets: number;
  totalPlayers: number;
  boostedPlayerCount: number;
  boostedTotalBets: number;
  startTime: number;
  maxMultiplier?: number;
  serverTime?: number;
  countdown?: number;
  canBet?: boolean;
  preGameBets?: number;
  preGamePlayers?: number;
  liquidityBreakdown?: {
    realBets: number;
    artificialLiquidity: number;
    baseGameLiquidity: number;
    liquidityGrowth: number;
    growthRate: number;
  };
  artificialPlayerCount?: number;
}

interface BetResult {
  success: boolean;
  reason?: string;
  walletAddress: string;
  betAmount: number;
  entryMultiplier?: number;
  gameState?: {
    totalBets: number;
    totalPlayers: number;
    boostedTotalBets?: number;
    boostedPlayerCount?: number;
    status: 'waiting' | 'active' | 'crashed';
    countdown?: number;
  };
}

interface CashOutResult {
  success: boolean;
  reason?: string;
  payout?: number;
  walletAddress: string;
}

interface UserInitResult {
  success: boolean;
  error?: string;
  isNewUser?: boolean;
  custodialBalance?: number;
  embeddedBalance?: number;
}

export function useGameSocket(walletAddress: string, userId?: string) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [currentGame, setCurrentGame] = useState<GameState | null>(null);
  const [gameHistory, setGameHistory] = useState<GameState[]>([]);
  
  // Countdown and waiting period state
  const [countdown, setCountdown] = useState<number>(0);
  const [isWaitingPeriod, setIsWaitingPeriod] = useState<boolean>(false);
  const [canBet, setCanBet] = useState<boolean>(false);
  
  // Connection debugging state
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
  // Sync state
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const gameStateRef = useRef<GameState | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<number>(0);
  const socketInitRef = useRef(false);

  // Calculate server time offset for synchronization
  const syncServerTime = useCallback((serverTime: number) => {
    const clientTime = Date.now();
    const newOffset = serverTime - clientTime;
    setServerTimeOffset(newOffset);
  }, []);

  // Get synchronized server time
  const getServerTime = useCallback(() => {
    return Date.now() + serverTimeOffset;
  }, [serverTimeOffset]);

  // Update countdown and betting availability
  const updateCountdownState = useCallback((countdownMs: number, gameStatus: string) => {
    setCountdown(countdownMs);
    countdownRef.current = countdownMs;
    setIsWaitingPeriod(gameStatus === 'waiting');
    
    const canBetNow = (gameStatus === 'waiting' && countdownMs > 2000) || gameStatus === 'active';
    setCanBet(canBetNow);
  }, []);

  // Helper function to safely update game state with liquidity data
  const updateGameWithLiquidityData = useCallback((
    baseGame: GameState, 
    updateData: any, 
    source: string = 'update'
  ): GameState => {
    const updatedGame: GameState = {
      ...baseGame,
      multiplier: updateData.multiplier !== undefined ? updateData.multiplier : baseGame.multiplier,
      totalBets: updateData.totalBets !== undefined ? updateData.totalBets : baseGame.totalBets,
      totalPlayers: updateData.totalPlayers !== undefined ? updateData.totalPlayers : baseGame.totalPlayers,
      boostedPlayerCount: updateData.boostedPlayerCount !== undefined ? updateData.boostedPlayerCount : baseGame.boostedPlayerCount,
      boostedTotalBets: updateData.boostedTotalBets !== undefined ? updateData.boostedTotalBets : baseGame.boostedTotalBets,
      serverTime: updateData.serverTime || baseGame.serverTime,
      countdown: updateData.countdown !== undefined ? updateData.countdown : baseGame.countdown,
      canBet: updateData.canBet !== undefined ? updateData.canBet : baseGame.canBet,
      liquidityBreakdown: updateData.liquidityBreakdown || baseGame.liquidityBreakdown,
      artificialPlayerCount: updateData.artificialPlayerCount !== undefined ? updateData.artificialPlayerCount : baseGame.artificialPlayerCount
    };

    return updatedGame;
  }, []);

  // 🚀 UPDATED: Use shared socket service
  useEffect(() => {
    if (socketInitRef.current) return;
    
    console.log('🔍 Game Socket: Using shared socket service...');
    socketInitRef.current = true;
    
    const initConnection = async () => {
      try {
        // Get shared socket instance
        const gameSocket = await sharedSocket.getSocket();
        
        if (!gameSocket) {
          setConnectionError('Failed to get shared socket connection');
          setIsConnected(false);
          socketInitRef.current = false;
          return;
        }

        setSocket(gameSocket);
        setIsConnected(gameSocket.connected);
        setConnectionError(null);
        setConnectionAttempts(0);

        // Enhanced connection event handlers
        const handleConnect = () => {
          console.log('✅ Game Socket: Connected via shared service');
          setIsConnected(true);
          setConnectionError(null);
          setConnectionAttempts(0);
          
          // Request initial game sync
          sharedSocket.emit('requestGameSync');
          
          // Auto-initialize user if available
          if (userId && walletAddress) {
            console.log('🔧 Game Socket: Auto-initializing user on connect...');
            sharedSocket.emit('initializeUser', { 
              userId, 
              walletAddress,
              autoInit: true,
              timestamp: Date.now()
            });
          }
        };

        const handleDisconnect = (reason: string, details?: any) => {
          console.log('🔌 Game Socket: Disconnected via shared service');
          console.log('  - Reason:', reason);
          setIsConnected(false);
          setCanBet(false);
          
          if (reason === 'io server disconnect') {
            setConnectionError('Server disconnected - manual reconnection required');
          } else {
            setConnectionError(`Disconnected: ${reason}`);
          }
        };

        const handleError = (error: any) => {
          console.error('❌ Game Socket: Connection error via shared service:', error);
          setIsConnected(false);
          setCanBet(false);
          setConnectionError(`Connection failed: ${error.message}`);
        };

        // Register event handlers with shared socket
        sharedSocket.on('connect', handleConnect);
        sharedSocket.on('disconnect', handleDisconnect);
        sharedSocket.on('connect_error', handleError);

        // If already connected, trigger connect handler
        if (gameSocket.connected) {
          handleConnect();
        }

        // 🚀 ENHANCED: Game state handler with full liquidity support
        const handleGameState = (gameState: any) => {
          console.log('📊 Game Socket: Received enhanced game state with liquidity:', gameState);
          
          if (gameState.serverTime) {
            syncServerTime(gameState.serverTime);
          }
          
          const newGameState: GameState = {
            id: gameState.gameId || gameState.id || '',
            gameNumber: gameState.gameNumber || 0,
            multiplier: gameState.multiplier || 1.0,
            status: gameState.status || 'waiting',
            totalBets: gameState.totalBets || 0,
            totalPlayers: gameState.totalPlayers || 0,
            boostedPlayerCount: gameState.boostedPlayerCount || gameState.totalPlayers || 0,
            boostedTotalBets: gameState.boostedTotalBets || gameState.totalBets || 0,
            startTime: gameState.startTime || Date.now(),
            maxMultiplier: gameState.maxMultiplier,
            serverTime: gameState.serverTime,
            countdown: gameState.countdown,
            canBet: gameState.canBet,
            preGameBets: gameState.preGameBets,
            preGamePlayers: gameState.preGamePlayers,
            liquidityBreakdown: gameState.liquidityBreakdown,
            artificialPlayerCount: gameState.artificialPlayerCount
          };
          
          if (gameState.countdown !== undefined) {
            updateCountdownState(gameState.countdown, gameState.status);
          }
          
          setCurrentGame(newGameState);
          gameStateRef.current = newGameState;
        };

        // Register all game event handlers
        sharedSocket.on('gameState', handleGameState);
        
        sharedSocket.on('artificialBoostUpdate', (data: any) => {
          if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
            const updatedGame = updateGameWithLiquidityData(
              gameStateRef.current, 
              {
                boostedPlayerCount: data.boostedPlayerCount,
                boostedTotalBets: data.boostedTotalBets,
                liquidityBreakdown: data.liquidityProfile,
                artificialPlayerCount: data.artificialPlayerCount,
                multiplier: data.currentMultiplier,
                serverTime: data.timestamp
              },
              'artificialBoostUpdate'
            );
            
            setCurrentGame(updatedGame);
            gameStateRef.current = updatedGame;
          }
        });

        sharedSocket.on('gameWaiting', (data: any) => {
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          updateCountdownState(data.countdown || 10000, 'waiting');
          
          if (gameStateRef.current) {
            const waitingGame = updateGameWithLiquidityData(
              gameStateRef.current,
              {
                id: data.gameId,
                gameNumber: data.gameNumber,
                status: 'waiting',
                multiplier: 1.0,
                countdown: data.countdown,
                canBet: data.canBet,
                serverTime: data.serverTime,
                boostedPlayerCount: data.boostedPlayerCount || gameStateRef.current.boostedPlayerCount,
                boostedTotalBets: data.boostedTotalBets || 0
              },
              'gameWaiting'
            );
            
            setCurrentGame(waitingGame);
            gameStateRef.current = waitingGame;
          }
        });

        sharedSocket.on('countdown', (data: any) => {
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          const countdownMs = data.countdownMs || (data.timeRemaining * 1000);
          updateCountdownState(countdownMs, 'waiting');
          
          if (gameStateRef.current && gameStateRef.current.status === 'waiting') {
            const updatedGame = updateGameWithLiquidityData(
              gameStateRef.current,
              {
                countdown: countdownMs,
                canBet: data.timeRemaining > 2,
                serverTime: data.serverTime,
                boostedPlayerCount: data.boostedPlayerCount || gameStateRef.current.boostedPlayerCount,
                boostedTotalBets: data.boostedTotalBets || gameStateRef.current.boostedTotalBets
              },
              'countdown'
            );
            
            setCurrentGame(updatedGame);
            gameStateRef.current = updatedGame;
          }
        });

        sharedSocket.on('serverSync', (data: any) => {
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          if (data.countdown && data.countdown > 0) {
            setCountdown(data.countdown);
            setIsWaitingPeriod(true);
            setCanBet(data.canBet !== false);
          } else if (data.status === 'waiting') {
            setIsWaitingPeriod(true);
          } else {
            setIsWaitingPeriod(false);
            setCountdown(0);
          }
          
          if (gameStateRef.current) {
            const syncedGame = updateGameWithLiquidityData(
              gameStateRef.current,
              {
                ...data,
                countdown: data.countdown || 0,
                boostedPlayerCount: data.boostedPlayerCount || gameStateRef.current.boostedPlayerCount,
                boostedTotalBets: data.boostedTotalBets || gameStateRef.current.boostedTotalBets
              },
              'serverSync'
            );
            
            setCurrentGame(syncedGame);
            gameStateRef.current = syncedGame;
          }
        });

        sharedSocket.on('multiplierUpdate', (data: any) => {
          if (gameStateRef.current && gameStateRef.current.gameNumber === data.gameNumber) {
            if (data.serverTime) {
              syncServerTime(data.serverTime);
            }
            
            const updatedGame = updateGameWithLiquidityData(
              gameStateRef.current,
              {
                multiplier: data.multiplier,
                serverTime: data.serverTime,
                boostedPlayerCount: data.boostedPlayerCount || gameStateRef.current.boostedPlayerCount,
                boostedTotalBets: data.boostedTotalBets || gameStateRef.current.boostedTotalBets,
                liquidityBreakdown: data.liquidityGrowth !== undefined ? {
                  ...gameStateRef.current.liquidityBreakdown,
                  liquidityGrowth: parseFloat(data.liquidityGrowth)
                } : gameStateRef.current.liquidityBreakdown
              },
              'multiplierUpdate'
            );
            
            setCurrentGame(updatedGame);
            gameStateRef.current = updatedGame;
          } else {
            console.warn('⚠️ Game Socket: Received multiplier update for different game, requesting sync...');
            sharedSocket.emit('requestGameSync');
          }
        });

        sharedSocket.on('gameStarted', (data: any) => {
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          setCountdown(0);
          setIsWaitingPeriod(false);
          setCanBet(true);
          
          const newGameState: GameState = {
            id: data.gameId || '',
            gameNumber: data.gameNumber || 0,
            multiplier: 1.0,
            status: 'active',
            totalBets: data.totalBets || data.preGameBets || 0,
            totalPlayers: data.totalPlayers || data.preGamePlayers || 0,
            boostedPlayerCount: data.boostedPlayerCount || data.totalPlayers || 0,
            boostedTotalBets: data.boostedTotalBets || data.totalBets || 0,
            startTime: data.startTime || Date.now(),
            maxMultiplier: data.maxMultiplier,
            serverTime: data.serverTime,
            preGameBets: data.preGameBets,
            preGamePlayers: data.preGamePlayers,
            canBet: true,
            liquidityBreakdown: data.liquidityBreakdown,
            artificialPlayerCount: data.artificialPlayerCount
          };
          
          setCurrentGame(newGameState);
          gameStateRef.current = newGameState;
        });

        sharedSocket.on('gameCrashed', (data: any) => {
          setCountdown(0);
          setIsWaitingPeriod(false);
          setCanBet(false);
          
          if (gameStateRef.current && gameStateRef.current.gameNumber === data.gameNumber) {
            const crashedGame: GameState = {
              ...gameStateRef.current,
              status: 'crashed',
              multiplier: data.crashMultiplier || data.finalMultiplier || gameStateRef.current.multiplier,
              boostedPlayerCount: gameStateRef.current.boostedPlayerCount,
              boostedTotalBets: gameStateRef.current.boostedTotalBets,
              canBet: false,
              liquidityBreakdown: gameStateRef.current.liquidityBreakdown
            };
            
            setCurrentGame(crashedGame);
            gameStateRef.current = null;
            
            setGameHistory(prev => [...prev.slice(-49), crashedGame]);
          }
        });

        sharedSocket.on('gameSync', (data: any) => {
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          if (data.status) {
            const syncedGame: GameState = {
              id: data.gameId || '',
              gameNumber: data.gameNumber || 0,
              multiplier: data.multiplier || 1.0,
              status: data.status,
              totalBets: data.totalBets || 0,
              totalPlayers: data.totalPlayers || 0,
              boostedPlayerCount: data.boostedPlayerCount || data.totalPlayers || 0,
              boostedTotalBets: data.boostedTotalBets || data.totalBets || 0,
              startTime: data.startTime || 0,
              serverTime: data.serverTime,
              countdown: data.countdown,
              canBet: data.canBet,
              liquidityBreakdown: data.liquidityBreakdown,
              artificialPlayerCount: data.artificialPlayerCount
            };
            
            if (data.status === 'waiting' && data.countdown !== undefined) {
              updateCountdownState(data.countdown, 'waiting');
            }
            
            setCurrentGame(syncedGame);
            gameStateRef.current = syncedGame;
          }
        });

        sharedSocket.on('gameHistory', (history: any[]) => {
          const mappedHistory: GameState[] = history.map(game => ({
            id: game.id || '',
            gameNumber: game.gameNumber || 0,
            multiplier: game.currentMultiplier || game.multiplier || 1.0,
            status: game.status || 'crashed',
            totalBets: game.totalBets || 0,
            totalPlayers: game.totalPlayers || 0,
            boostedPlayerCount: game.boostedPlayerCount || game.totalPlayers || 0,
            boostedTotalBets: game.boostedTotalBets || game.totalBets || 0,
            startTime: game.startTime || 0,
            maxMultiplier: game.maxMultiplier,
            serverTime: game.serverTime,
            liquidityBreakdown: game.liquidityBreakdown,
            artificialPlayerCount: game.artificialPlayerCount
          }));
          setGameHistory(mappedHistory);
        });

        sharedSocket.on('betPlaced', (data: any) => {
          if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
            const updatedGame = updateGameWithLiquidityData(
              gameStateRef.current,
              {
                totalBets: data.totalBets,
                totalPlayers: data.totalPlayers,
                boostedPlayerCount: data.boostedPlayerCount,
                boostedTotalBets: data.boostedTotalBets,
                countdown: data.countdown
              },
              'betPlaced'
            );
            
            setCurrentGame(updatedGame);
            gameStateRef.current = updatedGame;
          }
        });

        sharedSocket.on('custodialBetPlaced', (data: any) => {
          if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
            const updatedGame = updateGameWithLiquidityData(
              gameStateRef.current,
              {
                totalBets: data.totalBets,
                totalPlayers: data.totalPlayers,
                boostedPlayerCount: data.boostedPlayerCount,
                boostedTotalBets: data.boostedTotalBets
              },
              'custodialBetPlaced'
            );
            
            setCurrentGame(updatedGame);
            gameStateRef.current = updatedGame;
          }
        });

        sharedSocket.on('playerCashedOut', (data: any) => {
          if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
            sharedSocket.emit('requestGameSync');
          }
        });

        // Enhanced sync with more frequent liquidity updates
        const syncInterval = setInterval(() => {
          if (sharedSocket.isConnected() && gameStateRef.current) {
            sharedSocket.emit('requestGameSync');
          } else if (!sharedSocket.isConnected()) {
            console.warn('⚠️ Game Socket: Shared socket disconnected during sync check');
          }
        }, 15000);

        // Cleanup function
        return () => {
          clearInterval(syncInterval);
          if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
          }
          
          // Remove our event handlers but don't close the shared socket
          sharedSocket.off('connect', handleConnect);
          sharedSocket.off('disconnect', handleDisconnect);
          sharedSocket.off('connect_error', handleError);
          
          // Remove game-specific handlers
          sharedSocket.off('gameState', handleGameState);
          sharedSocket.off('artificialBoostUpdate');
          sharedSocket.off('gameWaiting');
          sharedSocket.off('countdown');
          sharedSocket.off('serverSync');
          sharedSocket.off('multiplierUpdate');
          sharedSocket.off('gameStarted');
          sharedSocket.off('gameCrashed');
          sharedSocket.off('gameSync');
          sharedSocket.off('gameHistory');
          sharedSocket.off('betPlaced');
          sharedSocket.off('custodialBetPlaced');
          sharedSocket.off('playerCashedOut');
          
          console.log('🧹 Game Socket: Cleaned up event handlers');
        };

      } catch (error) {
        console.error('❌ Game Socket: Setup error with shared service:', error);
        setConnectionError(`Setup failed: ${error}`);
        setIsConnected(false);
        socketInitRef.current = false;
      }
    };

    initConnection();
  }, [walletAddress, userId, syncServerTime, updateCountdownState, updateGameWithLiquidityData]);

  // Place bet using shared socket service
  const placeBet = useCallback(async (
    walletAddress: string, 
    amount: number, 
    userId?: string
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!sharedSocket.isConnected() || !currentGame) {
        console.log('❌ Game Socket: Cannot place bet: no connection or game');
        resolve(false);
        return;
      }

      if (currentGame.status !== 'active' && currentGame.status !== 'waiting') {
        console.log('❌ Game Socket: Cannot place bet: game status is', currentGame.status);
        resolve(false);
        return;
      }

      if (!canBet) {
        console.log('❌ Game Socket: Cannot place bet: betting not allowed');
        resolve(false);
        return;
      }

      console.log('🎯 Game Socket: Placing bet via shared socket:', { walletAddress, amount, userId });

      const timeout = setTimeout(() => {
        console.error('❌ Game Socket: Bet timeout');
        resolve(false);
      }, 30000);

      sharedSocket.emit('placeBet', { 
        walletAddress, 
        betAmount: amount, 
        userId 
      });
      
      const handleBetResult = (data: BetResult) => {
        clearTimeout(timeout);
        sharedSocket.off('betResult', handleBetResult);
        
        if (data.success) {
          resolve(true);
          
          if (data.gameState && gameStateRef.current) {
            const updatedGame = updateGameWithLiquidityData(
              gameStateRef.current,
              {
                totalBets: data.gameState.totalBets,
                totalPlayers: data.gameState.totalPlayers,
                countdown: data.gameState.countdown
              },
              'betResult'
            );
            
            setCurrentGame(updatedGame);
            gameStateRef.current = updatedGame;
          }
        } else {
          console.error('❌ Game Socket: Bet failed:', data.reason);
          resolve(false);
        }
      };
      
      sharedSocket.on('betResult', handleBetResult);
    });
  }, [currentGame, canBet, updateGameWithLiquidityData]);

  // Cash out using shared socket
  const cashOut = useCallback(async (walletAddress: string): Promise<{ success: boolean; payout?: number; reason?: string }> => {
    return new Promise((resolve) => {
      if (!sharedSocket.isConnected() || !currentGame || currentGame.status !== 'active') {
        resolve({ success: false, reason: 'Game not active or not connected' });
        return;
      }

      console.log('💸 Game Socket: Cashing out via shared socket:', { walletAddress });

      const timeout = setTimeout(() => {
        console.error('❌ Game Socket: Cashout timeout');
        resolve({ success: false, reason: 'Timeout' });
      }, 30000);

      sharedSocket.emit('cashOut', { walletAddress });
      
      const handleCashoutResult = (data: CashOutResult) => {
        clearTimeout(timeout);
        sharedSocket.off('cashOutResult', handleCashoutResult);
        resolve({
          success: data.success,
          payout: data.payout,
          reason: data.reason
        });
      };
      
      sharedSocket.on('cashOutResult', handleCashoutResult);
    });
  }, [currentGame]);

  // Custodial betting methods using shared socket
  const placeCustodialBet = useCallback(async (
    userId: string, 
    betAmount: number
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!sharedSocket.isConnected()) {
        console.log('❌ Game Socket: Cannot place custodial bet: not connected');
        resolve(false);
        return;
      }
  
      console.log('🎯 Game Socket: Placing custodial bet via shared socket:', { userId, betAmount });
  
      const timeout = setTimeout(() => {
        console.error('❌ Game Socket: Custodial bet timeout');
        resolve(false);
      }, 30000);
  
      const handleCustodialBetResult = (data: any) => {
        clearTimeout(timeout);
        sharedSocket.off('custodialBetResult', handleCustodialBetResult);
        
        if (data.success && data.gameState && gameStateRef.current) {
          const updatedGame = updateGameWithLiquidityData(
            gameStateRef.current,
            {
              totalBets: data.gameState.totalBets,
              totalPlayers: data.gameState.totalPlayers,
              boostedPlayerCount: data.gameState.boostedPlayerCount,
              boostedTotalBets: data.gameState.boostedTotalBets
            },
            'custodialBetResult'
          );
          
          setCurrentGame(updatedGame);
          gameStateRef.current = updatedGame;
        }
        
        resolve(data.success);
      };
      
      sharedSocket.on('custodialBetResult', handleCustodialBetResult);
      sharedSocket.emit('custodialBet', { userId, betAmount });
    });
  }, [updateGameWithLiquidityData]);

  const custodialCashOut = useCallback(async (
    userId: string, 
    walletAddress: string
  ): Promise<{ success: boolean; payout?: number; custodialBalance?: number; reason?: string }> => {
    return new Promise((resolve) => {
      if (!sharedSocket.isConnected()) {
        resolve({ success: false, reason: 'Not connected' });
        return;
      }

      console.log('💸 Game Socket: Custodial cashout via shared socket:', { userId, walletAddress });

      const timeout = setTimeout(() => {
        console.error('❌ Game Socket: Custodial cashout timeout');
        resolve({ success: false, reason: 'Timeout' });
      }, 30000);

      const handleCustodialCashoutResult = (data: any) => {
        clearTimeout(timeout);
        sharedSocket.off('custodialCashOutResult', handleCustodialCashoutResult);
        
        resolve({
          success: data.success,
          payout: data.payout,
          custodialBalance: data.custodialBalance,
          reason: data.reason || data.error
        });
      };
      
      sharedSocket.on('custodialCashOutResult', handleCustodialCashoutResult);
      sharedSocket.emit('custodialCashOut', { userId, walletAddress });
    });
  }, []);

  const getCustodialBalance = useCallback(async (userId: string): Promise<number | null> => {
    return new Promise((resolve) => {
      if (!sharedSocket.isConnected()) {
        resolve(null);
        return;
      }

      const timeout = setTimeout(() => {
        console.error('❌ Game Socket: Get custodial balance timeout');
        resolve(null);
      }, 10000);

      const handleBalanceResponse = (data: any) => {
        clearTimeout(timeout);
        sharedSocket.off('custodialBalanceResponse', handleBalanceResponse);
        
        if (data.success) {
          resolve(data.custodialBalance);
        } else {
          console.error('❌ Game Socket: Failed to get custodial balance:', data.error);
          resolve(null);
        }
      };
      
      sharedSocket.on('custodialBalanceResponse', handleBalanceResponse);
      sharedSocket.emit('getCustodialBalance', { userId });
    });
  }, []);

  return {
    currentGame,
    gameHistory,
    isConnected,
    placeBet,
    cashOut,
    placeCustodialBet,
    custodialCashOut,
    getCustodialBalance,
    serverTimeOffset,
    getServerTime,
    countdown,
    isWaitingPeriod,
    canBet,
    connectionError,
    connectionAttempts,
    socket
  };
}

// User initialization function using shared socket service
export const initializeUser = async (
  walletAddress: string,
  userId: string,
  UserAPI: any,
  updateCustodialBalance: () => void,
  updateRuggedBalance: () => void,
  toast: any
): Promise<void> => {
  try {
    console.log(`🔗 Game Socket: Initializing user with embedded wallet: ${walletAddress}`);
    
    const userData = await UserAPI.getUserOrCreate(walletAddress);
    if (userData) {
      console.log(`👤 Game Socket: User ID: ${userData.id}`);
      
      if (sharedSocket.isConnected()) {
        console.log('📡 Game Socket: Initializing user via shared socket...');
        
        sharedSocket.emit('initializeUser', { 
          userId: userData.id, 
          walletAddress
        });
        
        const handleUserInitResult = (result: UserInitResult) => {
          console.log('📡 Game Socket: User initialization result:', result);
          
          if (result.success) {
            console.log(`✅ Game Socket: User ${userData.id} initialized successfully`);
            console.log(`💰 Game Socket: Custodial balance: ${result.custodialBalance?.toFixed(6)} SOL`);
            console.log(`💼 Game Socket: Embedded balance: ${result.embeddedBalance?.toFixed(6)} SOL`);
            
            updateCustodialBalance();
            updateRuggedBalance();
            
            if (result.isNewUser) {
              toast.success('Wallet connected! Ready to play.');
            }
          } else {
            console.warn('⚠️ Game Socket: User initialization failed:', result.error);
            toast.error(`Initialization failed: ${result.error}`);
          }
          
          sharedSocket.off('userInitializeResult', handleUserInitResult);
        };
        
        sharedSocket.on('userInitializeResult', handleUserInitResult);
        
        setTimeout(() => {
          console.warn('⚠️ Game Socket: User initialization timeout');
          sharedSocket.off('userInitializeResult', handleUserInitResult);
        }, 10000);
        
      } else {
        console.warn('⚠️ Game Socket: Shared socket not connected, retrying initialization...');
        setTimeout(async () => {
          const socket = await sharedSocket.getSocket();
          if (socket && socket.connected) {
            console.log('🔄 Game Socket: Retrying user initialization...');
            sharedSocket.emit('initializeUser', { 
              userId: userData.id, 
              walletAddress 
            });
          }
        }, 2000);
      }
    }
  } catch (error) {
    console.error('❌ Game Socket: Could not initialize user:', error);
    toast.error('Failed to initialize wallet');
  }
};

export type { GameState, BetResult, CashOutResult, UserInitResult };