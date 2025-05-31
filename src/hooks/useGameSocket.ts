// Enhanced useGameSocket hook with pre-game betting and countdown support
// + Fixed connection issues and user initialization

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Enhanced GameState interface
interface GameState {
  id: string;
  gameNumber: number;
  multiplier: number;
  status: 'waiting' | 'active' | 'crashed';
  totalBets: number;
  totalPlayers: number;
  startTime: number;
  maxMultiplier?: number;
  serverTime?: number;
  countdown?: number;        // Countdown in milliseconds for waiting period
  canBet?: boolean;         // Whether betting is currently allowed
  preGameBets?: number;     // Pre-game bet totals
  preGamePlayers?: number;  // Pre-game player count
}

// Enhanced bet result interface
interface BetResult {
  success: boolean;
  reason?: string;
  walletAddress: string;
  betAmount: number;
  entryMultiplier?: number;
  gameState?: {
    totalBets: number;
    totalPlayers: number;
    status: 'waiting' | 'active' | 'crashed';
    countdown?: number;
  };
}

// Enhanced cashout result interface
interface CashOutResult {
  success: boolean;
  reason?: string;
  payout?: number;
  walletAddress: string;
}

// User initialization result interface
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
    
    // Allow betting during waiting period (but not in last 2 seconds) or during active game
    const canBetNow = (gameStatus === 'waiting' && countdownMs > 2000) || gameStatus === 'active';
    setCanBet(canBetNow);
  }, []);

  // Enhanced connection with automatic reconnection
  useEffect(() => {
    // Better URL resolution and debugging
    const serverUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL || 'wss://1741-3-16-49-236.ngrok-free.app';
    
    // Add detailed logging
    console.log('🔍 Environment check:');
    console.log('  - NODE_ENV:', process.env.NODE_ENV);
    console.log('  - NEXT_PUBLIC_GAME_SERVER_URL:', process.env.NEXT_PUBLIC_GAME_SERVER_URL);
    console.log('  - Final server URL:', serverUrl);
    console.log('  - Wallet Address:', walletAddress);
    
    setConnectionAttempts(prev => prev + 1);
    setConnectionError(null);
    
    const newSocket = io(serverUrl, {
      // Add polling as fallback transport
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      // Additional options for better compatibility
      forceNew: true,
      upgrade: true,
      rememberUpgrade: false, // Always try websocket first
    });

    // Store socket globally for other components
    (window as any).gameSocket = newSocket;

    // Enhanced connection handler with better error handling
    newSocket.on('connect', () => {
      console.log('✅ Connected to enhanced game server');
      console.log('  - Transport:', newSocket.io.engine.transport.name);
      console.log('  - Socket ID:', newSocket.id);
      setIsConnected(true);
      setConnectionError(null);
      setConnectionAttempts(0);
      newSocket.emit('requestGameSync');
    });

    // Enhanced error handling
    newSocket.on('connect_error', (error) => {
      console.error('❌ Connection error:', error);
      console.error('  - Error message:', error.message);
      console.error('  - Error type:', (error as any).type || 'unknown');
      console.error('  - Connection attempts:', connectionAttempts);
      
      setIsConnected(false);
      setCanBet(false);
      setConnectionError(`Connection failed: ${error.message}`);
      
      // Try different transports on repeated failures
      if (connectionAttempts >= 2) {
        console.log('🔄 Switching to polling transport only...');
        newSocket.io.opts.transports = ['polling'];
      }
    });

    // Better disconnect handling
    newSocket.on('disconnect', (reason, details) => {
      console.log('🔌 Disconnected from game server');
      console.log('  - Reason:', reason);
      console.log('  - Details:', details);
      setIsConnected(false);
      setCanBet(false);
      
      if (reason === 'io server disconnect') {
        // Server-initiated disconnect, don't auto-reconnect immediately
        setConnectionError('Server disconnected - manual reconnection required');
      } else {
        setConnectionError(`Disconnected: ${reason}`);
      }
    });

    // Add transport change detection
    newSocket.on('upgrade', () => {
      console.log('📶 Upgraded to websocket transport');
    });

    newSocket.on('upgradeError', (error) => {
      console.warn('⚠️ Websocket upgrade failed, using polling:', error);
    });

    // Enhanced game state handler with countdown support
    newSocket.on('gameState', (gameState: any) => {
      console.log('📊 Received enhanced game state:', gameState);
      
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
        startTime: gameState.startTime || Date.now(),
        maxMultiplier: gameState.maxMultiplier,
        serverTime: gameState.serverTime,
        countdown: gameState.countdown,
        canBet: gameState.canBet,
        preGameBets: gameState.preGameBets,
        preGamePlayers: gameState.preGamePlayers
      };
      
      // Update countdown state
      if (gameState.countdown !== undefined) {
        updateCountdownState(gameState.countdown, gameState.status);
      }
      
      setCurrentGame(newGameState);
      gameStateRef.current = newGameState;
    });

    // Handle waiting period start
    newSocket.on('gameWaiting', (data: any) => {
      console.log('⏳ Game waiting period started:', data);
      
      if (data.serverTime) {
        syncServerTime(data.serverTime);
      }
      
      updateCountdownState(data.countdown || 10000, 'waiting');
      
      // Update game state for waiting period
      if (gameStateRef.current) {
        const waitingGame: GameState = {
          ...gameStateRef.current,
          id: data.gameId || gameStateRef.current.id,
          gameNumber: data.gameNumber || gameStateRef.current.gameNumber,
          status: 'waiting',
          multiplier: 1.0,
          countdown: data.countdown,
          canBet: data.canBet,
          serverTime: data.serverTime
        };
        
        setCurrentGame(waitingGame);
        gameStateRef.current = waitingGame;
      }
    });

    // Handle countdown updates
    newSocket.on('countdown', (data: any) => {
      console.log('⏰ Countdown update:', data);
      
      if (data.serverTime) {
        syncServerTime(data.serverTime);
      }
      
      const countdownMs = data.countdownMs || (data.timeRemaining * 1000);
      updateCountdownState(countdownMs, 'waiting');
      
      // Update current game with countdown
      if (gameStateRef.current && gameStateRef.current.status === 'waiting') {
        const updatedGame: GameState = {
          ...gameStateRef.current,
          countdown: countdownMs,
          canBet: data.timeRemaining > 2, // Allow betting until 2 seconds left
          serverTime: data.serverTime
        };
        
        setCurrentGame(updatedGame);
        gameStateRef.current = updatedGame;
      }
    });

    // Handle countdown updates (alternative event name)
    newSocket.on('countdownUpdate', (data: any) => {
      if (data.serverTime) {
        syncServerTime(data.serverTime);
      }
      
      updateCountdownState(data.countdown, 'waiting');
      
      // Update current game with countdown
      if (gameStateRef.current && gameStateRef.current.status === 'waiting') {
        const updatedGame: GameState = {
          ...gameStateRef.current,
          countdown: data.countdown,
          canBet: data.canBet,
          serverTime: data.serverTime
        };
        
        setCurrentGame(updatedGame);
        gameStateRef.current = updatedGame;
      }
    });

    // Enhanced server sync handling
    newSocket.on('serverSync', (data: any) => {
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
      
      setCurrentGame(prev => ({
        ...prev,
        ...data,
        countdown: data.countdown || 0
      }));
    });

    // Handle waiting period bet updates
    newSocket.on('waitingGameUpdate', (data: any) => {
      if (gameStateRef.current && gameStateRef.current.status === 'waiting') {
        const updatedGame: GameState = {
          ...gameStateRef.current,
          totalBets: data.totalBets || gameStateRef.current.totalBets,
          totalPlayers: data.totalPlayers || gameStateRef.current.totalPlayers,
          countdown: data.countdown || gameStateRef.current.countdown
        };
        
        setCurrentGame(updatedGame);
        gameStateRef.current = updatedGame;
      }
    });

    // Enhanced multiplier update handler
    newSocket.on('multiplierUpdate', (data: any) => {
      if (gameStateRef.current && gameStateRef.current.gameNumber === data.gameNumber) {
        if (data.serverTime) {
          syncServerTime(data.serverTime);
        }
        
        const updatedGame: GameState = {
          ...gameStateRef.current,
          multiplier: data.multiplier || gameStateRef.current.multiplier,
          serverTime: data.serverTime
        };
        
        setCurrentGame(updatedGame);
        gameStateRef.current = updatedGame;
      } else {
        console.warn('⚠️ Received multiplier update for different game, requesting sync...');
        newSocket.emit('requestGameSync');
      }
    });

    // Enhanced game started handler
    newSocket.on('gameStarted', (data: any) => {
      console.log('🚀 Enhanced game started with pre-game bets:', data);
      
      if (data.serverTime) {
        syncServerTime(data.serverTime);
      }
      
      // Reset countdown state when game starts
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
        startTime: data.startTime || Date.now(),
        maxMultiplier: data.maxMultiplier,
        serverTime: data.serverTime,
        preGameBets: data.preGameBets,
        preGamePlayers: data.preGamePlayers,
        canBet: true
      };
      
      setCurrentGame(newGameState);
      gameStateRef.current = newGameState;
    });

    // Enhanced game crashed handler
    newSocket.on('gameCrashed', (data: any) => {
      console.log('💥 Game crashed:', data);
      
      // Reset countdown and betting state
      setCountdown(0);
      setIsWaitingPeriod(false);
      setCanBet(false);
      
      if (gameStateRef.current && gameStateRef.current.gameNumber === data.gameNumber) {
        const crashedGame: GameState = {
          ...gameStateRef.current,
          status: 'crashed',
          multiplier: data.crashMultiplier || data.finalMultiplier || gameStateRef.current.multiplier,
          canBet: false
        };
        
        setCurrentGame(crashedGame);
        gameStateRef.current = null; // Clear current game
        
        setGameHistory(prev => [...prev.slice(-49), crashedGame]);
      }
    });

    // Handle game sync responses
    newSocket.on('gameSync', (data: any) => {
      console.log('📥 Received game sync:', data);
      
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
          startTime: data.startTime || 0,
          serverTime: data.serverTime,
          countdown: data.countdown,
          canBet: data.canBet
        };
        
        // Update countdown state if in waiting period
        if (data.status === 'waiting' && data.countdown !== undefined) {
          updateCountdownState(data.countdown, 'waiting');
        }
        
        setCurrentGame(syncedGame);
        gameStateRef.current = syncedGame;
      }
    });

    // Handle game history
    newSocket.on('gameHistory', (history: any[]) => {
      const mappedHistory: GameState[] = history.map(game => ({
        id: game.id || '',
        gameNumber: game.gameNumber || 0,
        multiplier: game.currentMultiplier || game.multiplier || 1.0,
        status: game.status || 'crashed',
        totalBets: game.totalBets || 0,
        totalPlayers: game.totalPlayers || 0,
        startTime: game.startTime || 0,
        maxMultiplier: game.maxMultiplier,
        serverTime: game.serverTime
      }));
      setGameHistory(mappedHistory);
    });

    // Enhanced bet placed handler
    newSocket.on('betPlaced', (data: any) => {
      if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
        const updatedGame: GameState = {
          ...gameStateRef.current,
          totalBets: data.totalBets || gameStateRef.current.totalBets,
          totalPlayers: data.totalPlayers || gameStateRef.current.totalPlayers,
          countdown: data.countdown || gameStateRef.current.countdown
        };
        setCurrentGame(updatedGame);
        gameStateRef.current = updatedGame;
      }
    });

    setSocket(newSocket);

    // Periodic sync check with connection validation
    const syncInterval = setInterval(() => {
      if (newSocket.connected && gameStateRef.current) {
        newSocket.emit('requestGameSync');
      } else if (!newSocket.connected) {
        console.warn('⚠️ Socket disconnected during sync check');
      }
    }, 30000);

    return () => {
      clearInterval(syncInterval);
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      newSocket.close();
    };
  }, [walletAddress, syncServerTime, updateCountdownState]);

  // Enhanced place bet with pre-game betting support
  const placeBet = useCallback(async (
    walletAddress: string, 
    amount: number, 
    userId?: string
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!socket || !isConnected || !currentGame) {
        console.log('❌ Cannot place bet: no socket, connection, or game');
        resolve(false);
        return;
      }

      // Allow betting during waiting period and active games
      if (currentGame.status !== 'active' && currentGame.status !== 'waiting') {
        console.log('❌ Cannot place bet: game status is', currentGame.status);
        resolve(false);
        return;
      }

      // Check if betting is allowed (not in last 2 seconds of countdown)
      if (!canBet) {
        console.log('❌ Cannot place bet: betting not allowed (too close to game start)');
        resolve(false);
        return;
      }

      console.log('🎯 Placing bet via socket:', { walletAddress, amount, userId });

      const timeout = setTimeout(() => {
        console.error('❌ Bet timeout');
        resolve(false);
      }, 30000);

      socket.emit('placeBet', { 
        walletAddress, 
        betAmount: amount, 
        userId 
      });
      
      socket.once('betResult', (data: BetResult) => {
        clearTimeout(timeout);
        console.log('🎯 Bet result:', data);
        
        if (data.success) {
          resolve(true);
          
          // Update local state if bet was successful
          if (data.gameState && gameStateRef.current) {
            const updatedGame: GameState = {
              ...gameStateRef.current,
              totalBets: data.gameState.totalBets || gameStateRef.current.totalBets,
              totalPlayers: data.gameState.totalPlayers || gameStateRef.current.totalPlayers,
              countdown: data.gameState.countdown || gameStateRef.current.countdown
            };
            setCurrentGame(updatedGame);
            gameStateRef.current = updatedGame;
          }
        } else {
          console.error('❌ Bet failed:', data.reason);
          resolve(false);
        }
      });
    });
  }, [socket, isConnected, currentGame, canBet]);

  // Enhanced cash out with detailed result
  const cashOut = useCallback(async (walletAddress: string): Promise<{ success: boolean; payout?: number; reason?: string }> => {
    return new Promise((resolve) => {
      if (!socket || !isConnected || !currentGame || currentGame.status !== 'active') {
        resolve({ success: false, reason: 'Game not active or not connected' });
        return;
      }

      console.log('💸 Cashing out via socket:', { walletAddress });

      const timeout = setTimeout(() => {
        console.error('❌ Cashout timeout');
        resolve({ success: false, reason: 'Timeout' });
      }, 30000);

      socket.emit('cashOut', { walletAddress });
      
      socket.once('cashOutResult', (data: CashOutResult) => {
        clearTimeout(timeout);
        console.log('💸 Cashout result:', data);
        resolve({
          success: data.success,
          payout: data.payout,
          reason: data.reason
        });
      });
    });
  }, [socket, isConnected, currentGame]);

  // Add these three methods to your useGameSocket hook:

const placeCustodialBet = useCallback(async (
  userId: string, 
  betAmount: number
): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!socket || !isConnected) {
      console.log('❌ Cannot place custodial bet: not connected');
      resolve(false);
      return;
    }

    console.log('🎯 Placing custodial bet:', { userId, betAmount });

    const timeout = setTimeout(() => {
      console.error('❌ Custodial bet timeout');
      resolve(false);
    }, 30000);

    socket.once('custodialBetResult', (data: any) => {
      clearTimeout(timeout);
      console.log('🎯 Custodial bet result:', data);
      
      if (data.success && data.gameState && gameStateRef.current) {
        const updatedGame: GameState = {
          ...gameStateRef.current,
          totalBets: data.gameState.totalBets || gameStateRef.current.totalBets,
          totalPlayers: data.gameState.totalPlayers || gameStateRef.current.totalPlayers,
        };
        setCurrentGame(updatedGame);
        gameStateRef.current = updatedGame;
      }
      
      resolve(data.success);
    });

    socket.emit('custodialBet', { userId, betAmount });
  });
}, [socket, isConnected]);

const custodialCashOut = useCallback(async (
  userId: string, 
  walletAddress: string
): Promise<{ success: boolean; payout?: number; custodialBalance?: number; reason?: string }> => {
  return new Promise((resolve) => {
    if (!socket || !isConnected) {
      resolve({ success: false, reason: 'Not connected' });
      return;
    }

    console.log('💸 Custodial cashout:', { userId, walletAddress });

    const timeout = setTimeout(() => {
      console.error('❌ Custodial cashout timeout');
      resolve({ success: false, reason: 'Timeout' });
    }, 30000);

    socket.once('custodialCashOutResult', (data: any) => {
      clearTimeout(timeout);
      console.log('💸 Custodial cashout result:', data);
      
      resolve({
        success: data.success,
        payout: data.payout,
        custodialBalance: data.custodialBalance,
        reason: data.reason || data.error
      });
    });

    socket.emit('custodialCashOut', { userId, walletAddress });
  });
}, [socket, isConnected]);

const getCustodialBalance = useCallback(async (userId: string): Promise<number | null> => {
  return new Promise((resolve) => {
    if (!socket || !isConnected) {
      resolve(null);
      return;
    }

    const timeout = setTimeout(() => {
      console.error('❌ Get custodial balance timeout');
      resolve(null);
    }, 10000);

    socket.once('custodialBalanceResponse', (data: any) => {
      clearTimeout(timeout);
      console.log('📊 Custodial balance received:', data);
      
      if (data.success) {
        resolve(data.custodialBalance);
      } else {
        console.error('❌ Failed to get custodial balance:', data.error);
        resolve(null);
      }
    });

    socket.emit('getCustodialBalance', { userId });
  });
}, [socket, isConnected]);

return {
  currentGame,
  gameHistory,
  isConnected,
  placeBet,           // Regular betting
  cashOut,            // Regular cashout
  placeCustodialBet,  // NEW: Custodial betting
  custodialCashOut,   // NEW: Custodial cashout
  getCustodialBalance, // NEW: Get custodial balance
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


// Enhanced user initialization function for TradingControls
export const initializeUser = async (
  walletAddress: string,
  userId: string,
  UserAPI: any,
  updateCustodialBalance: () => void,
  updateRuggedBalance: () => void,
  toast: any
): Promise<void> => {
  try {
    console.log(`🔗 Initializing user with embedded wallet: ${walletAddress}`);
    
    // Get user data
    const userData = await UserAPI.getUserOrCreate(walletAddress);
    if (userData) {
      console.log(`👤 User ID: ${userData.id}`);
      
      // Enhanced initialization with the embedded wallet
      const socket = (window as any).gameSocket;
      if (socket && socket.connected) {
        console.log('📡 Initializing user via socket...');
        
        socket.emit('initializeUser', { 
          userId: userData.id, 
          walletAddress // This is the embedded wallet address
        });
        
        // Handle initialization result
        socket.once('userInitializeResult', (result: UserInitResult) => {
          console.log('📡 User initialization result:', result);
          
          if (result.success) {
            console.log(`✅ User ${userData.id} initialized successfully`);
            console.log(`💰 Custodial balance: ${result.custodialBalance?.toFixed(6)} SOL`);
            console.log(`💼 Embedded balance: ${result.embeddedBalance?.toFixed(6)} SOL`);
            
            // Refresh balances
            updateCustodialBalance();
            updateRuggedBalance();
            
            // Show success toast for new users
            if (result.isNewUser) {
              toast.success('Wallet connected! Ready to play.');
            }
          } else {
            console.warn('⚠️ User initialization failed:', result.error);
            toast.error(`Initialization failed: ${result.error}`);
          }
        });
        
        // Timeout for initialization
        setTimeout(() => {
          console.warn('⚠️ User initialization timeout');
        }, 10000);
        
      } else {
        console.warn('⚠️ Socket not connected, retrying initialization...');
        // Retry after a short delay
        setTimeout(() => {
          if ((window as any).gameSocket?.connected) {
            console.log('🔄 Retrying user initialization...');
            (window as any).gameSocket.emit('initializeUser', { 
              userId: userData.id, 
              walletAddress 
            });
          }
        }, 2000);
      }
    }
  } catch (error) {
    console.error('❌ Could not initialize user:', error);
    toast.error('Failed to initialize wallet');
  }
};

// Export types for use in other components
export type { GameState, BetResult, CashOutResult, UserInitResult };