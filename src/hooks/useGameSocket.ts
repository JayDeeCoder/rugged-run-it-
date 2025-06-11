// Enhanced useGameSocket hook with FIXED CONNECTION LOGIC + REAL-TIME liquidity updates
// 🚀 FIXED: Incorporates the connection improvements from dashboard/leaderboard

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

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
  // 🚀 NEW: Detailed liquidity tracking
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

// 🚀 FIXED: Enhanced socket initialization with better connection handling
const initializeGameSocket = async (): Promise<Socket | null> => {
  return new Promise((resolve) => {
    try {
      // Check if socket already exists on window
      let gameSocket = (window as any).gameSocket;
      
      if (gameSocket && gameSocket.connected) {
        console.log('✅ Game Socket: Using existing connected socket');
        resolve(gameSocket);
        return;
      }
      
      if (gameSocket && !gameSocket.connected) {
        console.log('🔌 Game Socket: Existing socket found but disconnected, reconnecting...');
        gameSocket.connect();
        
        gameSocket.once('connect', () => {
          console.log('✅ Game Socket: Reconnected successfully');
          resolve(gameSocket);
        });
        
        setTimeout(() => {
          console.warn('⚠️ Game Socket: Reconnect timeout, creating new socket');
          gameSocket = null;
          initializeNewSocket();
        }, 5000);
        
        return;
      }
      
      // No existing socket, create new one
      initializeNewSocket();
      
      function initializeNewSocket() {
        // Check if socket.io is available
        const io = (window as any).io;
        if (!io) {
          console.warn('⚠️ Game Socket: Socket.io not found, loading from CDN...');
          
          // Load socket.io if not present
          if (typeof window !== 'undefined' && !document.querySelector('script[src*="socket.io"]')) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.0.1/socket.io.js';
            script.onload = () => {
              console.log('✅ Game Socket: Socket.io loaded from CDN');
              // Retry after loading
              setTimeout(() => initializeNewSocket(), 1000);
            };
            script.onerror = () => {
              console.error('❌ Game Socket: Failed to load socket.io from CDN');
              resolve(null);
            };
            document.head.appendChild(script);
          }
          return;
        }
        
        // Create new socket connection
        const serverUrl = process.env.NEXT_PUBLIC_GAME_SERVER_URL || 'wss://irugged-run.ngrok.app';
        
        console.log('🔌 Game Socket: Creating new connection to:', serverUrl);
        
        gameSocket = io(serverUrl, {
          transports: ['websocket', 'polling'],
          timeout: 20000,
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          forceNew: true,
          upgrade: true,
          rememberUpgrade: false,
        });

        // Store socket globally for other components
        (window as any).gameSocket = gameSocket;
        (window as any).socket = gameSocket;

        // Connection handlers
        gameSocket.on('connect', () => {
          console.log('✅ Game Socket: Connected successfully');
          console.log('  - Transport:', gameSocket.io.engine.transport.name);
          console.log('  - Socket ID:', gameSocket.id);
          resolve(gameSocket);
        });

        gameSocket.on('connect_error', (error: any) => {
          console.error('❌ Game Socket: Connection error:', error);
          resolve(null);
        });

        // Timeout fallback
        setTimeout(() => {
          if (!gameSocket.connected) {
            console.error('❌ Game Socket: Connection timeout');
            resolve(null);
          }
        }, 10000);
      }
    } catch (error) {
      console.error('❌ Game Socket: Initialization error:', error);
      resolve(null);
    }
  });
};

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

  // 🚀 NEW: Helper function to safely update game state with liquidity data
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
      
      // 🚀 NEW: Update detailed liquidity breakdown if available
      liquidityBreakdown: updateData.liquidityBreakdown || baseGame.liquidityBreakdown,
      artificialPlayerCount: updateData.artificialPlayerCount !== undefined ? updateData.artificialPlayerCount : baseGame.artificialPlayerCount
    };

    return updatedGame;
  }, []);

  // 🚀 FIXED: Enhanced connection with improved initialization
  useEffect(() => {
    if (socketInitRef.current) return;
    
    console.log('🔍 Game Socket: Environment check:');
    console.log('  - NODE_ENV:', process.env.NODE_ENV);
    console.log('  - NEXT_PUBLIC_GAME_SERVER_URL:', process.env.NEXT_PUBLIC_GAME_SERVER_URL);
    console.log('  - Wallet Address:', walletAddress);
    
    socketInitRef.current = true;
    setConnectionAttempts(prev => prev + 1);
    setConnectionError(null);
    
    const initConnection = async () => {
      try {
        const gameSocket = await initializeGameSocket();
        
        if (!gameSocket) {
          setConnectionError('Failed to initialize socket connection');
          setIsConnected(false);
          socketInitRef.current = false;
          return;
        }

        setSocket(gameSocket);
        setIsConnected(gameSocket.connected);
        setConnectionError(null);
        setConnectionAttempts(0);

        // Enhanced connection handlers
        gameSocket.on('connect', () => {
          console.log('✅ Game Socket: Connected to enhanced game server');
          console.log('  - Transport:', gameSocket.io.engine.transport.name);
          console.log('  - Socket ID:', gameSocket.id);
          setIsConnected(true);
          setConnectionError(null);
          setConnectionAttempts(0);
          gameSocket.emit('requestGameSync');
          
          // 🚀 NEW: Auto-initialize user if available
          if (userId && walletAddress) {
            console.log('🔧 Game Socket: Auto-initializing user on connect...');
            gameSocket.emit('initializeUser', { 
              userId, 
              walletAddress,
              autoInit: true,
              timestamp: Date.now()
            });
          }
        });

        // Enhanced error handling
        gameSocket.on('connect_error', (error: any) => {
          console.error('❌ Game Socket: Connection error:', error);
          setIsConnected(false);
          setCanBet(false);
          setConnectionError(`Connection failed: ${error.message}`);
          
          setConnectionAttempts(prev => {
            const newAttempts = prev + 1;
            if (newAttempts >= 2) {
              console.log('🔄 Game Socket: Switching to polling transport only...');
              gameSocket.io.opts.transports = ['polling'];
            }
            return newAttempts;
          });
        });

        // Better disconnect handling
        gameSocket.on('disconnect', (reason: string, details?: any) => {
          console.log('🔌 Game Socket: Disconnected from game server');
          console.log('  - Reason:', reason);
          console.log('  - Details:', details);
          setIsConnected(false);
          setCanBet(false);
          
          if (reason === 'io server disconnect') {
            setConnectionError('Server disconnected - manual reconnection required');
          } else {
            setConnectionError(`Disconnected: ${reason}`);
          }
        });

        // Add transport change detection
        gameSocket.on('upgrade', () => {
          console.log('📶 Game Socket: Upgraded to websocket transport');
        });

        gameSocket.on('upgradeError', (error: any) => {
          console.warn('⚠️ Game Socket: Websocket upgrade failed, using polling:', error);
        });

        // 🚀 ENHANCED: Game state handler with full liquidity support
        gameSocket.on('gameState', (gameState: any) => {
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
            // 🚀 NEW: Include liquidity breakdown
            liquidityBreakdown: gameState.liquidityBreakdown,
            artificialPlayerCount: gameState.artificialPlayerCount
          };
          
          if (gameState.countdown !== undefined) {
            updateCountdownState(gameState.countdown, gameState.status);
          }
          
          setCurrentGame(newGameState);
          gameStateRef.current = newGameState;
        });

        // 🚀 NEW: Dedicated artificial boost/liquidity update handler
        gameSocket.on('artificialBoostUpdate', (data: any) => {
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
          } else {
            console.warn('⚠️ Game Socket: Received artificial boost update for different/no game');
          }
        });

        // Handle waiting period start
        gameSocket.on('gameWaiting', (data: any) => {
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
                // 🚀 NEW: Reset liquidity for waiting period
                boostedPlayerCount: data.boostedPlayerCount || gameStateRef.current.boostedPlayerCount,
                boostedTotalBets: data.boostedTotalBets || 0
              },
              'gameWaiting'
            );
            
            setCurrentGame(waitingGame);
            gameStateRef.current = waitingGame;
          }
        });

        // 🚀 ENHANCED: Countdown handler with liquidity preservation
        gameSocket.on('countdown', (data: any) => {
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

        // 🚀 ENHANCED: Server sync with liquidity data
        gameSocket.on('serverSync', (data: any) => {
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

        // 🚀 ENHANCED: Multiplier updates with liquidity tracking
        gameSocket.on('multiplierUpdate', (data: any) => {
          if (gameStateRef.current && gameStateRef.current.gameNumber === data.gameNumber) {
            if (data.serverTime) {
              syncServerTime(data.serverTime);
            }
            
            const updatedGame = updateGameWithLiquidityData(
              gameStateRef.current,
              {
                multiplier: data.multiplier,
                serverTime: data.serverTime,
                // 🚀 NEW: Include liquidity updates from multiplier events
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
            gameSocket.emit('requestGameSync');
          }
        });

        // 🚀 ENHANCED: Game started with full liquidity initialization
        gameSocket.on('gameStarted', (data: any) => {
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
            // 🚀 NEW: Initialize liquidity breakdown
            liquidityBreakdown: data.liquidityBreakdown,
            artificialPlayerCount: data.artificialPlayerCount
          };
          
          setCurrentGame(newGameState);
          gameStateRef.current = newGameState;
        });

        // 🚀 ENHANCED: Game crashed with liquidity cleanup
        gameSocket.on('gameCrashed', (data: any) => {
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
              // 🚀 NEW: Preserve final liquidity state for history
              liquidityBreakdown: gameStateRef.current.liquidityBreakdown
            };
            
            setCurrentGame(crashedGame);
            gameStateRef.current = null; // Clear current game
            
            setGameHistory(prev => [...prev.slice(-49), crashedGame]);
          }
        });

        // Handle game sync responses
        gameSocket.on('gameSync', (data: any) => {
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

        // 🚀 ENHANCED: Game history with liquidity data
        gameSocket.on('gameHistory', (history: any[]) => {
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

        // 🚀 ENHANCED: Bet placed with instant liquidity updates
        gameSocket.on('betPlaced', (data: any) => {
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

        // 🚀 NEW: Handle custodial bet placed with liquidity updates
        gameSocket.on('custodialBetPlaced', (data: any) => {
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

        // 🚀 NEW: Handle liquidity updates on player cashouts
        gameSocket.on('playerCashedOut', (data: any) => {
          if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
            // Liquidity should decrease when players cash out (server handles this)
            // Just trigger a refresh to get latest boosted values
            if (gameSocket.connected) {
              gameSocket.emit('requestGameSync');
            }
          }
        });

        // 🚀 ENHANCED: More frequent sync for liquidity updates
        const syncInterval = setInterval(() => {
          if (gameSocket.connected && gameStateRef.current) {
            gameSocket.emit('requestGameSync');
          } else if (!gameSocket.connected) {
            console.warn('⚠️ Game Socket: Socket disconnected during sync check');
          }
        }, 15000); // Reduced from 30s to 15s for more frequent liquidity updates

        // Cleanup function
        return () => {
          clearInterval(syncInterval);
          if (syncTimeoutRef.current) {
            clearTimeout(syncTimeoutRef.current);
          }
          gameSocket.close();
        };

      } catch (error) {
        console.error('❌ Game Socket: Setup error:', error);
        setConnectionError(`Setup failed: ${error}`);
        setIsConnected(false);
        socketInitRef.current = false;
      }
    };

    initConnection();
  }, [walletAddress, userId, syncServerTime, updateCountdownState, updateGameWithLiquidityData]);

  // Enhanced place bet with pre-game betting support
  const placeBet = useCallback(async (
    walletAddress: string, 
    amount: number, 
    userId?: string
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!socket || !isConnected || !currentGame) {
        console.log('❌ Game Socket: Cannot place bet: no socket, connection, or game');
        resolve(false);
        return;
      }

      if (currentGame.status !== 'active' && currentGame.status !== 'waiting') {
        console.log('❌ Game Socket: Cannot place bet: game status is', currentGame.status);
        resolve(false);
        return;
      }

      if (!canBet) {
        console.log('❌ Game Socket: Cannot place bet: betting not allowed (too close to game start)');
        resolve(false);
        return;
      }

      console.log('🎯 Game Socket: Placing bet via socket:', { walletAddress, amount, userId });

      const timeout = setTimeout(() => {
        console.error('❌ Game Socket: Bet timeout');
        resolve(false);
      }, 30000);

      socket.emit('placeBet', { 
        walletAddress, 
        betAmount: amount, 
        userId 
      });
      
      socket.once('betResult', (data: BetResult) => {
        clearTimeout(timeout);
        
        if (data.success) {
          resolve(true);
          
          // Update local state with enhanced liquidity data
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
      });
    });
  }, [socket, isConnected, currentGame, canBet, updateGameWithLiquidityData]);

  // Enhanced cash out with detailed result
  const cashOut = useCallback(async (walletAddress: string): Promise<{ success: boolean; payout?: number; reason?: string }> => {
    return new Promise((resolve) => {
      if (!socket || !isConnected || !currentGame || currentGame.status !== 'active') {
        resolve({ success: false, reason: 'Game not active or not connected' });
        return;
      }

      console.log('💸 Game Socket: Cashing out via socket:', { walletAddress });

      const timeout = setTimeout(() => {
        console.error('❌ Game Socket: Cashout timeout');
        resolve({ success: false, reason: 'Timeout' });
      }, 30000);

      socket.emit('cashOut', { walletAddress });
      
      socket.once('cashOutResult', (data: CashOutResult) => {
        clearTimeout(timeout);
        resolve({
          success: data.success,
          payout: data.payout,
          reason: data.reason
        });
      });
    });
  }, [socket, isConnected, currentGame]);

  // Enhanced custodial betting methods
  const placeCustodialBet = useCallback(async (
    userId: string, 
    betAmount: number
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!socket || !isConnected) {
        console.log('❌ Game Socket: Cannot place custodial bet: not connected');
        resolve(false);
        return;
      }
  
      console.log('🎯 Game Socket: Placing custodial bet:', { userId, betAmount });
  
      const timeout = setTimeout(() => {
        console.error('❌ Game Socket: Custodial bet timeout');
        resolve(false);
      }, 30000);
  
      socket.once('custodialBetResult', (data: any) => {
        clearTimeout(timeout);
        
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
      });
  
      socket.emit('custodialBet', { userId, betAmount });
    });
  }, [socket, isConnected, updateGameWithLiquidityData]);

  const custodialCashOut = useCallback(async (
    userId: string, 
    walletAddress: string
  ): Promise<{ success: boolean; payout?: number; custodialBalance?: number; reason?: string }> => {
    return new Promise((resolve) => {
      if (!socket || !isConnected) {
        resolve({ success: false, reason: 'Not connected' });
        return;
      }

      console.log('💸 Game Socket: Custodial cashout:', { userId, walletAddress });

      const timeout = setTimeout(() => {
        console.error('❌ Game Socket: Custodial cashout timeout');
        resolve({ success: false, reason: 'Timeout' });
      }, 30000);

      socket.once('custodialCashOutResult', (data: any) => {
        clearTimeout(timeout);
        
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
        console.error('❌ Game Socket: Get custodial balance timeout');
        resolve(null);
      }, 10000);

      socket.once('custodialBalanceResponse', (data: any) => {
        clearTimeout(timeout);
        
        if (data.success) {
          resolve(data.custodialBalance);
        } else {
          console.error('❌ Game Socket: Failed to get custodial balance:', data.error);
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

// Enhanced user initialization function
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
      
      const socket = (window as any).gameSocket;
      if (socket && socket.connected) {
        console.log('📡 Game Socket: Initializing user via socket...');
        
        socket.emit('initializeUser', { 
          userId: userData.id, 
          walletAddress
        });
        
        socket.once('userInitializeResult', (result: UserInitResult) => {
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
        });
        
        setTimeout(() => {
          console.warn('⚠️ Game Socket: User initialization timeout');
        }, 10000);
        
      } else {
        console.warn('⚠️ Game Socket: Socket not connected, retrying initialization...');
        setTimeout(() => {
          if ((window as any).gameSocket?.connected) {
            console.log('🔄 Game Socket: Retrying user initialization...');
            (window as any).gameSocket.emit('initializeUser', { 
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