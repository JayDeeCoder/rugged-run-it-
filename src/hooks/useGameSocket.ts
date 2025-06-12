// 🚀 ULTRA-FAST Enhanced useGameSocket hook with LIGHTNING-FAST SYNC
// ✅ FIXES: "Received multiplier update for different game" error
// ⚡ PERFORMANCE: Ultra-fast sync with minimal delays (100ms-500ms vs 2000ms)
// 🚨 CRITICAL SYNC: Emergency recovery for missing game states
// 📈 PREDICTIVE: Immediate state updates while syncing
// 🔧 OPTIMIZED: TypeScript errors resolved with safe type handling

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Enhanced GameState interface with better tracking and fixed types
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
  // ✅ FIXED: Made liquidityBreakdown properties optional to handle undefined values
  liquidityBreakdown?: {
    realBets?: number;
    artificialLiquidity?: number;
    baseGameLiquidity?: number;
    liquidityGrowth?: number;
    growthRate?: number;
  };
  artificialPlayerCount?: number;
  // 🔧 NEW: Add tracking fields
  lastUpdate?: number;
  syncStatus?: 'synced' | 'syncing' | 'outdated';
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

// ✅ HELPER: Safe liquidityBreakdown creation function
const createSafeLiquidityBreakdown = (data: any): GameState['liquidityBreakdown'] => {
  if (!data) return undefined;
  
  return {
    realBets: typeof data.realBets === 'number' ? data.realBets : undefined,
    artificialLiquidity: typeof data.artificialLiquidity === 'number' ? data.artificialLiquidity : undefined,
    baseGameLiquidity: typeof data.baseGameLiquidity === 'number' ? data.baseGameLiquidity : undefined,
    liquidityGrowth: typeof data.liquidityGrowth === 'number' ? data.liquidityGrowth : undefined,
    growthRate: typeof data.growthRate === 'number' ? data.growthRate : undefined,
  };
};

// ✅ HELPER: Merge liquidityBreakdown safely
const mergeLiquidityBreakdown = (
  existing: GameState['liquidityBreakdown'], 
  updates: any
): GameState['liquidityBreakdown'] => {
  if (!existing && !updates) return undefined;
  
  const base = existing || {};
  const newData = updates || {};
  
  return {
    realBets: typeof newData.realBets === 'number' ? newData.realBets : base.realBets,
    artificialLiquidity: typeof newData.artificialLiquidity === 'number' ? newData.artificialLiquidity : base.artificialLiquidity,
    baseGameLiquidity: typeof newData.baseGameLiquidity === 'number' ? newData.baseGameLiquidity : base.baseGameLiquidity,
    liquidityGrowth: typeof newData.liquidityGrowth === 'number' ? newData.liquidityGrowth : base.liquidityGrowth,
    growthRate: typeof newData.growthRate === 'number' ? newData.growthRate : base.growthRate,
  };
};

// 🔧 ENHANCED: Better socket initialization with retry logic
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
        const io = (window as any).io;
        if (!io) {
          console.warn('⚠️ Game Socket: Socket.io not found, loading from CDN...');
          
          if (typeof window !== 'undefined' && !document.querySelector('script[src*="socket.io"]')) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.0.1/socket.io.js';
            script.onload = () => {
              console.log('✅ Game Socket: Socket.io loaded from CDN');
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
  
  // 🔧 ENHANCED: Better sync state management
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  const gameStateRef = useRef<GameState | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownRef = useRef<number>(0);
  const socketInitRef = useRef(false);
  const lastSyncRequestRef = useRef<number>(0);
  const pendingGameUpdatesRef = useRef<Map<number, any>>(new Map());

  // 🔧 NEW: Game state validation function
  const isValidGameUpdate = useCallback((incomingData: any, currentGameState: GameState | null): boolean => {
    if (!incomingData.gameNumber || !incomingData.gameId) {
      console.warn('🔧 Game Socket: Invalid update - missing gameNumber or gameId');
      return false;
    }

    if (!currentGameState) {
      console.log('🔧 Game Socket: No current game state, accepting update');
      return true;
    }

    // Check if this is the same game
    if (currentGameState.gameNumber === incomingData.gameNumber) {
      return true;
    }

    // Check if this is the next sequential game (normal progression)
    if (incomingData.gameNumber === currentGameState.gameNumber + 1) {
      console.log(`🔧 Game Socket: Sequential game transition detected: ${currentGameState.gameNumber} → ${incomingData.gameNumber}`);
      return true;
    }

    // Check if game number wrapped around (1-100 cycle)
    if (currentGameState.gameNumber === 100 && incomingData.gameNumber === 1) {
      console.log('🔧 Game Socket: Game counter wrap-around detected: 100 → 1');
      return true;
    }

    return false;
  }, []);

  // 🚀 ULTRA-FAST: Smart sync request with minimal debouncing for real-time gaming
  const requestGameSync = useCallback((reason: string = 'generic', priority: 'low' | 'high' | 'critical' = 'low') => {
    if (!socket?.connected) return;
    
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncRequestRef.current;
    
    // Critical sync requests bypass debouncing entirely
    if (priority === 'critical') {
      console.log(`🚨 Game Socket: CRITICAL sync request (${reason}) - bypassing debounce`);
    }
    // High priority sync requests have minimal debouncing (200ms)
    else if (priority === 'high' && timeSinceLastSync < 200) {
      console.log(`⚡ Game Socket: High priority sync debounced (${reason}) - ${200 - timeSinceLastSync}ms remaining`);
      return;
    }
    // Low priority sync requests have normal debouncing (500ms - reduced from 2000ms)
    else if (priority === 'low' && timeSinceLastSync < 500) {
      console.log(`🔧 Game Socket: Sync request debounced (${reason}) - ${500 - timeSinceLastSync}ms remaining`);
      return;
    }
    
    console.log(`🔄 Game Socket: Requesting ${priority} priority game sync (${reason})`);
    lastSyncRequestRef.current = now;
    
    // Set sync status
    if (gameStateRef.current) {
      gameStateRef.current.syncStatus = 'syncing';
      setCurrentGame(prev => prev ? { ...prev, syncStatus: 'syncing' } : null);
    }
    
    socket.emit('requestGameSync', {
      reason,
      priority,
      currentGameNumber: gameStateRef.current?.gameNumber,
      currentGameId: gameStateRef.current?.id,
      timestamp: now
    });
  }, [socket]);

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

  // 🔧 ENHANCED: Safe game state update with validation and fixed types
  const updateGameState = useCallback((
    newGameData: any,
    source: string = 'unknown',
    forceUpdate = false
  ): boolean => {
    try {
      const now = Date.now();
      
      // Validate the incoming data
      if (!forceUpdate && !isValidGameUpdate(newGameData, gameStateRef.current)) {
        console.warn(`🔧 Game Socket: Invalid game update from ${source}:`, {
          current: gameStateRef.current ? {
            gameNumber: gameStateRef.current.gameNumber,
            id: gameStateRef.current.id,
            status: gameStateRef.current.status
          } : null,
          incoming: {
            gameNumber: newGameData.gameNumber,
            gameId: newGameData.gameId,
            status: newGameData.status
          }
        });
        
        // 🚀 CRITICAL: Request immediate sync for invalid updates
        requestGameSync(`invalid_update_from_${source}`, 'critical');
        return false;
      }

      // ✅ FIXED: Create new game state with proper type handling
      const updatedGame: GameState = {
        id: newGameData.gameId || newGameData.id || '',
        gameNumber: newGameData.gameNumber || 0,
        multiplier: newGameData.multiplier || 1.0,
        status: newGameData.status || 'waiting',
        totalBets: newGameData.totalBets || 0,
        totalPlayers: newGameData.totalPlayers || 0,
        boostedPlayerCount: newGameData.boostedPlayerCount || newGameData.totalPlayers || 0,
        boostedTotalBets: newGameData.boostedTotalBets || newGameData.totalBets || 0,
        startTime: newGameData.startTime || Date.now(),
        maxMultiplier: newGameData.maxMultiplier,
        serverTime: newGameData.serverTime,
        countdown: newGameData.countdown,
        canBet: newGameData.canBet,
        preGameBets: newGameData.preGameBets,
        preGamePlayers: newGameData.preGamePlayers,
        // ✅ FIXED: Use safe liquidityBreakdown creation
        liquidityBreakdown: createSafeLiquidityBreakdown(newGameData.liquidityBreakdown),
        artificialPlayerCount: newGameData.artificialPlayerCount,
        // 🔧 NEW: Add tracking fields
        lastUpdate: now,
        syncStatus: 'synced'
      };

      // Update both ref and state
      gameStateRef.current = updatedGame;
      setCurrentGame(updatedGame);

      console.log(`✅ Game Socket: Game state updated from ${source}:`, {
        gameNumber: updatedGame.gameNumber,
        status: updatedGame.status,
        multiplier: updatedGame.multiplier
      });

      return true;
    } catch (error) {
      console.error(`❌ Game Socket: Error updating game state from ${source}:`, error);
      return false;
    }
  }, [isValidGameUpdate, requestGameSync]);

  // 🚀 NEW: Immediate state recovery function for critical situations
  const recoverGameState = useCallback((reason: string, fallbackData?: any) => {
    console.log(`🚨 Game Socket: Initiating immediate state recovery (${reason})`);
    
    // If we have fallback data, use it immediately to reduce perceived delay
    if (fallbackData && !gameStateRef.current) {
      console.log('⚡ Game Socket: Using fallback data for immediate recovery');
      updateGameState(fallbackData, `fallback_${reason}`, true);
    }
    
    // Request critical sync
    requestGameSync(reason, 'critical');
    
    // Emergency: try to get game state from server immediately
    if (socket?.connected) {
      socket.emit('getGameState', { 
        emergency: true, 
        reason,
        timestamp: Date.now()
      });
    }
  }, [socket, updateGameState, requestGameSync]);

  // 🔧 ENHANCED: Connection with improved game state handling
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
          
          // 🚀 ULTRA-FAST: Request immediate game state on connect
          setTimeout(() => {
            console.log('🔄 Game Socket: Requesting initial game sync...');
            gameSocket.emit('requestGameSync', { 
              reason: 'initial_connect',
              priority: 'critical',
              timestamp: Date.now()
            });
          }, 100); // Reduced from 500ms to 100ms
          
          // Auto-initialize user if available
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

        // 🔧 ENHANCED: Primary game state handler with better validation
        gameSocket.on('gameState', (gameState: any) => {
          console.log('📊 Game Socket: Received game state:', {
            gameNumber: gameState.gameNumber,
            status: gameState.status,
            multiplier: gameState.multiplier
          });
          
          if (gameState.serverTime) {
            syncServerTime(gameState.serverTime);
          }
          
          // Use the enhanced update function
          const updated = updateGameState(gameState, 'gameState', true); // Force update for primary game state
          
          if (updated && gameState.countdown !== undefined) {
            updateCountdownState(gameState.countdown, gameState.status);
          }
        });

        // ✅ ULTRA-FAST: Enhanced multiplier update handler with predictive state and critical sync
        gameSocket.on('multiplierUpdate', (data: any) => {
          // Enhanced validation and logging
          const currentGame = gameStateRef.current;
          
          if (!currentGame) {
            console.log('🚨 Game Socket: CRITICAL - No current game for multiplier update, initiating emergency recovery...');
            
            // 🚀 EMERGENCY: Use recovery function with fallback data
            recoverGameState('no_current_game_multiplier', {
              gameId: data.gameId,
              gameNumber: data.gameNumber,
              multiplier: data.multiplier,
              status: 'active',
              serverTime: data.serverTime,
              boostedPlayerCount: data.boostedPlayerCount,
              boostedTotalBets: data.boostedTotalBets
            });
            return;
          }

          // Check if this update is for the current game
          const isValidUpdate = (
            currentGame.gameNumber === data.gameNumber ||
            currentGame.id === data.gameId ||
            // Allow updates for the next sequential game (during transitions)
            data.gameNumber === currentGame.gameNumber + 1 ||
            // Handle wrap-around (100 -> 1)
            (currentGame.gameNumber === 100 && data.gameNumber === 1)
          );

          if (!isValidUpdate) {
            console.warn('⚠️ Game Socket: Multiplier update game mismatch:', {
              current: {
                gameNumber: currentGame.gameNumber,
                gameId: currentGame.id,
                status: currentGame.status
              },
              received: {
                gameNumber: data.gameNumber,
                gameId: data.gameId,
                multiplier: data.multiplier
              }
            });
            
            // 🚀 HIGH PRIORITY: Fast sync for game mismatches
            requestGameSync('multiplier_game_mismatch', 'high');
            return;
          }

          // ⚡ INSTANT: Update is valid, apply it immediately
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          // ✅ FIXED: Safe liquidityBreakdown update
          const updatedLiquidityBreakdown = data.liquidityGrowth !== undefined ? 
            mergeLiquidityBreakdown(currentGame.liquidityBreakdown, { 
              liquidityGrowth: parseFloat(data.liquidityGrowth) 
            }) : currentGame.liquidityBreakdown;
          
          const updatedGame: GameState = {
            ...currentGame,
            multiplier: data.multiplier,
            serverTime: data.serverTime,
            boostedPlayerCount: data.boostedPlayerCount || currentGame.boostedPlayerCount,
            boostedTotalBets: data.boostedTotalBets || currentGame.boostedTotalBets,
            liquidityBreakdown: updatedLiquidityBreakdown,
            lastUpdate: Date.now(),
            syncStatus: 'synced'
          };
          
          gameStateRef.current = updatedGame;
          setCurrentGame(updatedGame);
        });

        // 🔧 ENHANCED: Game started handler with validation
        gameSocket.on('gameStarted', (data: any) => {
          console.log('🎮 Game Socket: Game started event received:', {
            gameNumber: data.gameNumber,
            gameId: data.gameId
          });
          
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          setCountdown(0);
          setIsWaitingPeriod(false);
          setCanBet(true);
          
          // Use the enhanced update function
          updateGameState({
            ...data,
            id: data.gameId,
            multiplier: 1.0,
            status: 'active',
            canBet: true
          }, 'gameStarted');
        });

        // 🔧 ENHANCED: Game crashed handler
        gameSocket.on('gameCrashed', (data: any) => {
          console.log('💥 Game Socket: Game crashed event received:', {
            gameNumber: data.gameNumber,
            crashMultiplier: data.crashMultiplier
          });
          
          setCountdown(0);
          setIsWaitingPeriod(false);
          setCanBet(false);
          
          if (gameStateRef.current && gameStateRef.current.gameNumber === data.gameNumber) {
            const crashedGame: GameState = {
              ...gameStateRef.current,
              status: 'crashed',
              multiplier: data.crashMultiplier || data.finalMultiplier || gameStateRef.current.multiplier,
              canBet: false,
              lastUpdate: Date.now(),
              syncStatus: 'synced'
            };
            
            setCurrentGame(crashedGame);
            gameStateRef.current = null; // Clear current game
            
            setGameHistory(prev => [...prev.slice(-49), crashedGame]);
          }
        });

        // 🔧 ENHANCED: Game waiting handler
        gameSocket.on('gameWaiting', (data: any) => {
          console.log('⏰ Game Socket: Game waiting event received:', {
            gameNumber: data.gameNumber,
            countdown: data.countdown
          });
          
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          updateCountdownState(data.countdown || 10000, 'waiting');
          
          updateGameState({
            ...data,
            id: data.gameId,
            multiplier: 1.0,
            status: 'waiting',
            countdown: data.countdown,
            canBet: data.canBet !== false
          }, 'gameWaiting');
        });

        // 🚀 ULTRA-FAST: Server sync handler with immediate state recovery
        gameSocket.on('serverSync', (data: any) => {
          console.log('⚡ Game Socket: Server sync received - immediate processing');
          
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          // Immediate UI state updates for better responsiveness
          if (data.countdown && data.countdown > 0) {
            setCountdown(data.countdown);
            setIsWaitingPeriod(true);
            setCanBet(data.canBet !== false);
          } else if (data.status === 'waiting') {
            setIsWaitingPeriod(true);
          } else if (data.status === 'active') {
            setIsWaitingPeriod(false);
            setCountdown(0);
            setCanBet(true);
          } else {
            setIsWaitingPeriod(false);
            setCountdown(0);
          }
          
          // Update game state if provided
          if (data.gameId || data.gameNumber) {
            updateGameState({
              ...data,
              countdown: data.countdown || 0
            }, 'serverSync');
          }
        });

        // 🚀 ULTRA-FAST: Game sync response handler with immediate processing
        gameSocket.on('gameSync', (data: any) => {
          console.log('⚡ Game Socket: Game sync response received (PRIORITY PROCESSING):', {
            gameNumber: data.gameNumber,
            status: data.status,
            multiplier: data.multiplier
          });
          
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          if (data.status) {
            const updated = updateGameState(data, 'gameSync', true); // Force update for sync responses
            
            if (updated) {
              // Immediately update UI state for better responsiveness
              if (data.status === 'active') {
                setCanBet(true);
                setIsWaitingPeriod(false);
                setCountdown(0);
              } else if (data.status === 'waiting' && data.countdown !== undefined) {
                updateCountdownState(data.countdown, 'waiting');
              }
              
              console.log('✅ Game Socket: Fast sync completed - UI updated');
            }
          }
        });

        // Handle countdown updates
        gameSocket.on('countdown', (data: any) => {
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          const countdownMs = data.countdownMs || (data.timeRemaining * 1000);
          updateCountdownState(countdownMs, 'waiting');
          
          if (gameStateRef.current && gameStateRef.current.status === 'waiting') {
            const updatedGame: GameState = {
              ...gameStateRef.current,
              countdown: countdownMs,
              canBet: data.timeRemaining > 2,
              serverTime: data.serverTime,
              lastUpdate: Date.now()
            };
            
            gameStateRef.current = updatedGame;
            setCurrentGame(updatedGame);
          }
        });

        // 🚀 NEW: Emergency game state handler for immediate recovery
        gameSocket.on('emergencyGameState', (data: any) => {
          console.log('🚨 Game Socket: Emergency game state received - immediate processing!');
          
          if (data.serverTime) {
            syncServerTime(data.serverTime);
          }
          
          // Force update the game state immediately
          const updated = updateGameState(data, 'emergencyGameState', true);
          
          if (updated) {
            // Update UI state immediately based on game status
            if (data.status === 'active') {
              setCanBet(true);
              setIsWaitingPeriod(false);
              setCountdown(0);
            } else if (data.status === 'waiting') {
              setIsWaitingPeriod(true);
              setCanBet(data.canBet !== false);
              if (data.countdown) {
                setCountdown(data.countdown);
              }
            }
            
            console.log('✅ Game Socket: Emergency recovery completed successfully');
          }
        });

        // ✅ FIXED: Handle artificialBoostUpdate with proper type safety
        gameSocket.on('artificialBoostUpdate', (data: any) => {
          if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
            const updatedGame: GameState = {
              ...gameStateRef.current,
              boostedPlayerCount: data.boostedPlayerCount,
              boostedTotalBets: data.boostedTotalBets,
              // ✅ FIXED: Safe liquidityBreakdown handling
              liquidityBreakdown: createSafeLiquidityBreakdown(data.liquidityProfile),
              artificialPlayerCount: data.artificialPlayerCount,
              multiplier: data.currentMultiplier || gameStateRef.current.multiplier,
              serverTime: data.timestamp,
              lastUpdate: Date.now()
            };
            
            gameStateRef.current = updatedGame;
            setCurrentGame(updatedGame);
          }
        });

        gameSocket.on('betPlaced', (data: any) => {
          if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
            const updatedGame: GameState = {
              ...gameStateRef.current,
              totalBets: data.totalBets,
              totalPlayers: data.totalPlayers,
              boostedPlayerCount: data.boostedPlayerCount,
              boostedTotalBets: data.boostedTotalBets,
              countdown: data.countdown,
              lastUpdate: Date.now()
            };
            
            gameStateRef.current = updatedGame;
            setCurrentGame(updatedGame);
          }
        });

        gameSocket.on('custodialBetPlaced', (data: any) => {
          if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
            const updatedGame: GameState = {
              ...gameStateRef.current,
              totalBets: data.totalBets,
              totalPlayers: data.totalPlayers,
              boostedPlayerCount: data.boostedPlayerCount,
              boostedTotalBets: data.boostedTotalBets,
              lastUpdate: Date.now()
            };
            
            gameStateRef.current = updatedGame;
            setCurrentGame(updatedGame);
          }
        });

        gameSocket.on('playerCashedOut', (data: any) => {
          if (gameStateRef.current && gameStateRef.current.id === data.gameId) {
            // Trigger a refresh to get latest values - using requestGameSync instead of direct emit
            requestGameSync('post_cashout', 'high');
          }
        });

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
            // ✅ FIXED: Safe liquidityBreakdown handling
            liquidityBreakdown: createSafeLiquidityBreakdown(game.liquidityBreakdown),
            artificialPlayerCount: game.artificialPlayerCount,
            lastUpdate: Date.now(),
            syncStatus: 'synced'
          }));
          setGameHistory(mappedHistory);
        });

        // 🚀 ULTRA-FAST: Aggressive sync for real-time gaming
        const syncInterval = setInterval(() => {
          if (gameSocket.connected) {
            // Only request sync if our game state seems outdated
            if (gameStateRef.current) {
              const timeSinceLastUpdate = Date.now() - (gameStateRef.current.lastUpdate || 0);
              // Reduced from 30 seconds to 10 seconds for more responsive sync
              if (timeSinceLastUpdate > 10000) {
                console.log('🔄 Game Socket: Game state seems outdated, requesting high priority sync...');
                requestGameSync('periodic_stale_check', 'high');
              }
            } else {
              // No current game, request critical sync
              console.log('🚨 Game Socket: No current game state, requesting critical sync...');
              requestGameSync('periodic_no_game', 'critical');
            }
          } else if (!gameSocket.connected) {
            console.warn('⚠️ Game Socket: Socket disconnected during sync check');
          }
        }, 5000); // Reduced from 15 seconds to 5 seconds for faster detection

        // 🚀 NEW: Ultra-fast heartbeat for active games (every 2 seconds during gameplay)
        const fastHeartbeat = setInterval(() => {
          if (gameSocket.connected && gameStateRef.current?.status === 'active') {
            const timeSinceLastUpdate = Date.now() - (gameStateRef.current.lastUpdate || 0);
            if (timeSinceLastUpdate > 3000) { // 3 seconds without update during active game
              console.log('💓 Game Socket: Fast heartbeat - requesting sync during active game');
              requestGameSync('active_game_heartbeat', 'high');
            }
          }
        }, 2000); // Very fast check every 2 seconds during active games

        // Cleanup function
        return () => {
          clearInterval(syncInterval);
          clearInterval(fastHeartbeat);
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
  }, [walletAddress, userId, syncServerTime, updateCountdownState, updateGameState, requestGameSync, recoverGameState]);

  // 🔧 Rest of the functions remain the same...
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
          
          // Update local state
          if (data.gameState && gameStateRef.current) {
            const updatedGame: GameState = {
              ...gameStateRef.current,
              totalBets: data.gameState.totalBets,
              totalPlayers: data.gameState.totalPlayers,
              countdown: data.gameState.countdown,
              lastUpdate: Date.now()
            };
            
            gameStateRef.current = updatedGame;
            setCurrentGame(updatedGame);
          }
        } else {
          console.error('❌ Game Socket: Bet failed:', data.reason);
          resolve(false);
        }
      });
    });
  }, [socket, isConnected, currentGame, canBet]);

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
          const updatedGame: GameState = {
            ...gameStateRef.current,
            totalBets: data.gameState.totalBets,
            totalPlayers: data.gameState.totalPlayers,
            boostedPlayerCount: data.gameState.boostedPlayerCount,
            boostedTotalBets: data.gameState.boostedTotalBets,
            lastUpdate: Date.now()
          };
          
          gameStateRef.current = updatedGame;
          setCurrentGame(updatedGame);
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