// src/app/settings/page.tsx
'use client';

import { FC, useState, useContext } from 'react';
import { usePrivy, useSolanaWallets } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { 
  Settings, 
  User, 
  Wallet, 
  Info, 
  TrendingUp, 
  Shield, 
  MessageCircle, 
  Trophy,
  AlertTriangle,
  DollarSign,
  Target,
  Clock,
  Zap,
  Eye,
  Edit3,
  Save,
  RefreshCw
} from 'lucide-react';
import UsernameModal from '../../components/auth/UsernameModal';

const SettingsPage: FC = () => {
  const { user, authenticated } = usePrivy();
  const { wallets } = useSolanaWallets();
  const userContext = useContext(UserContext);
  
  // Type guard to ensure userContext is not null
  const { currentUser, setUsername, loading } = userContext || { 
    currentUser: null, 
    setUsername: () => {}, 
    loading: false 
  };
  
  const [activeTab, setActiveTab] = useState('game-guide');
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoChat, setAutoChat] = useState(false);

  const embeddedWallet = wallets.find(wallet => wallet.walletClientType === 'privy');
  const walletAddress = embeddedWallet?.address || '';

  const tabs = [
    { id: 'game-guide', label: 'Trading Guide', icon: Info },
    { id: 'how-to-play', label: 'How to Trade', icon: Target },
    { id: 'strategies', label: 'Strategies', icon: TrendingUp },
    { id: 'account', label: 'Account', icon: User },
    { id: 'preferences', label: 'Preferences', icon: Settings },
  ];

  const handleUsernameSubmit = (username: string) => {
    setUsername(username);
    setShowUsernameModal(false);
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white p-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center py-20">
            <Shield className="mx-auto mb-4 text-gray-400" size={48} />
            <h1 className="text-2xl font-bold mb-2">Access Restricted</h1>
            <p className="text-gray-400">Please login to access settings and game guide.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-6xl mx-auto p-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">Settings & Trading Guide</h1>
              <p className="text-gray-400">Learn to trade, manage your account, and customize your experience</p>
            </div>
            <a 
              href="/"
              className="flex items-center px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 rounded-lg font-medium transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              <span className="mr-2">🎮</span>
              Back to Game
            </a>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex flex-wrap gap-2 mb-8 border-b border-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2 rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-gray-800 text-white border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white hover:bg-gray-900'
              }`}
            >
              <tab.icon size={16} className="mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-8">
          {/* Game Guide Tab */}
          {activeTab === 'game-guide' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-purple-900/30 to-blue-900/30 rounded-lg p-6 border border-purple-500/20">
                <h2 className="text-2xl font-bold mb-4 flex items-center">
                  <Zap className="mr-3 text-yellow-400" />
                  Welcome to iRUGGED.FUN! 
                </h2>
                <p className="text-lg text-gray-300 leading-relaxed">
                  iRUGGED.FUN is a real-time multiplayer trading game where you trade SOL and try to exit before the market crashes! 
                  The longer you hold, the higher the multiplier grows, but if you wait too long... you get RUGGED! 💥
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-xl font-bold mb-4 flex items-center text-green-400">
                    <DollarSign className="mr-2" />
                    The Basics
                  </h3>
                  <ul className="space-y-3 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">•</span>
                      Open your position in SOL before the round starts
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">•</span>
                      Watch the multiplier climb from 1.00x upward
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">•</span>
                      Close your position anytime to secure your profits
                    </li>
                    <li className="flex items-start">
                      <span className="text-green-400 mr-2">•</span>
                      If you don't exit before the crash, you lose your trade
                    </li>
                  </ul>
                </div>

                <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-xl font-bold mb-4 flex items-center text-blue-400">
                    <Trophy className="mr-2" />
                    Profit Formula
                  </h3>
                  <div className="space-y-3 text-gray-300">
                    <div className="bg-gray-800/50 rounded p-3">
                      <div className="text-sm text-gray-400 mb-1">Your Profits =</div>
                      <div className="text-lg font-mono text-yellow-400">
                        Trade Amount × Exit Multiplier × 0.95
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        (5% platform fee applied on exit)
                      </div>
                    </div>
                    <p className="text-sm">
                      Example: Trade 0.1 SOL, exit at 2.00x = 0.1 × 2.00 × 0.95 = 0.19 SOL profit!
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-r from-red-900/30 to-orange-900/30 rounded-lg p-6 border border-red-500/20 mb-6">
                <h3 className="text-xl font-bold mb-4 flex items-center text-red-400">
                  🎯 The Art of the RUG - It's You vs. Everyone!
                </h3>
                <p className="text-lg text-gray-300 leading-relaxed mb-4">
                  Here's the secret: <strong>YOU'RE</strong> the one pulling the rug! Every time you hit that "RUG" button, you're creating sell pressure that can trigger market crashes for other players. The key to winning? <span className="text-yellow-400 font-bold">Pull the rug before you GET rugged!</span> 🏃‍♂️💨
                </p>
                
                <div className="bg-gray-800/50 rounded p-4 border-l-4 border-red-500">
                  <h4 className="font-bold text-red-400 mb-2">🕯️ Watch for the Dark Red Candles!</h4>
                  <p className="text-gray-300 text-sm">
                    When multiple players exit at the same time, you'll see darker red candles appear on the chart - that's the visual sign of a coordinated rug pull in action! The more players that exit together, the darker and more dramatic the sell-off becomes. Don't get caught holding the bag! 📉
                  </p>
                </div>
                
                <div className="mt-4 p-3 bg-yellow-900/20 rounded border border-yellow-500/30">
                  <p className="text-yellow-300 text-sm font-medium">
                    💡 <strong>Pro Tip:</strong> The best ruggers know when to follow the crowd out the door, and when to be the first one running for the exit. Sometimes being early is better than being right!
                  </p>
                </div>
              </div>

              <div className="bg-red-900/20 rounded-lg p-6 border border-red-500/30">
                <h3 className="text-xl font-bold mb-4 flex items-center text-red-400">
                  <AlertTriangle className="mr-2" />
                  Important Trading Guidelines
                </h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-red-400 mr-2">⚠️</span>
                      Only trade with capital you can afford to lose
                    </li>
                    <li className="flex items-start">
                      <span className="text-red-400 mr-2">⚠️</span>
                      Market crashes are unpredictable - no strategy guarantees profits
                    </li>
                  </ul>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-red-400 mr-2">⚠️</span>
                      Set risk limits and take breaks regularly
                    </li>
                    <li className="flex items-start">
                      <span className="text-red-400 mr-2">⚠️</span>
                      Trading can be addictive - trade responsibly
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* How to Play Tab */}
          {activeTab === 'how-to-play' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-6">Step-by-Step Trading Guide</h2>
              
              <div className="space-y-6">
                {[
                  {
                    step: 1,
                    title: "Fund Your Trading Account",
                    description: "Deposit SOL from your free In Game wallet",
                    details: [
                      "Your trading balance is shown in the trading panel",
                      "Deposits are instant and secure",
                      "Minimum trade size is 0.005 SOL"
                    ],
                    color: "blue"
                  },
                  {
                    step: 2,
                    title: "Open Your Position",
                    description: "Enter your trade amount and wait for the next trading round",
                    details: [
                      "Use the trade input field in the trading panel",
                      "You can enter before the round starts or during active trading",
                      "Your position is locked in once placed"
                    ],
                    color: "green"
                  },
                  {
                    step: 3,
                    title: "Monitor the Market",
                    description: "The multiplier starts at 1.00x and climbs higher",
                    details: [
                      "The chart shows real-time market movement",
                      "Higher multipliers = bigger potential profits",
                      "But also higher risk of market crash!"
                    ],
                    color: "yellow"
                  },
                  {
                    step: 4,
                    title: "Exit or Get RUGGED",
                    description: "Decide when to close your position",
                    details: [
                      "Click 'RUG' button to exit at current multiplier",
                      "If you wait too long, the market crashes and you lose",
                      "Trust your analysis and manage your risk!"
                    ],
                    color: "purple"
                  }
                ].map((step) => (
                  <div key={step.step} className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                    <div className="flex items-start">
                      <div className={`w-10 h-10 rounded-full bg-${step.color}-500/20 border-2 border-${step.color}-500 flex items-center justify-center mr-4 flex-shrink-0`}>
                        <span className={`text-${step.color}-400 font-bold`}>{step.step}</span>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-xl font-bold mb-2">{step.title}</h3>
                        <p className="text-gray-300 mb-3">{step.description}</p>
                        <ul className="space-y-1">
                          {step.details.map((detail, index) => (
                            <li key={index} className="text-sm text-gray-400 flex items-start">
                              <span className="text-gray-600 mr-2">•</span>
                              {detail}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-gradient-to-r from-green-900/30 to-blue-900/30 rounded-lg p-6 border border-green-500/20">
                <h3 className="text-xl font-bold mb-4 flex items-center text-green-400">
                  <Clock className="mr-2" />
                  Trading Timing
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">~5-15s</div>
                    <div className="text-sm text-gray-400">Entry Phase</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-400">~30-120s</div>
                    <div className="text-sm text-gray-400">Active Trading</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">Instant</div>
                    <div className="text-sm text-gray-400">Exit Time</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Strategies Tab */}
          {activeTab === 'strategies' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-6">Trading Strategies & Tips</h2>
              
              <div className="bg-yellow-900/20 rounded-lg p-6 border border-yellow-500/30 mb-6">
                <div className="flex items-center mb-3">
                  <AlertTriangle className="text-yellow-400 mr-2" size={20} />
                  <span className="font-bold text-yellow-400">Risk Disclaimer</span>
                </div>
                <p className="text-gray-300">
                  No strategy can guarantee profits. Market crashes are random and unpredictable. 
                  These are common approaches that traders use, but all trading involves significant risk.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {[
                  {
                    name: "Conservative Trading",
                    multiplier: "1.2x - 2.0x",
                    description: "Exit early for consistent small profits",
                    pros: ["Higher success rate", "Lower stress", "Steady portfolio growth"],
                    cons: ["Lower profits", "Can be boring", "Platform fee impact"],
                    color: "green"
                  },
                  {
                    name: "Moderate Risk",
                    multiplier: "2.0x - 5.0x",
                    description: "Balanced approach between safety and profit potential",
                    pros: ["Good risk/reward ratio", "Flexible strategy", "Decent profits"],
                    cons: ["Moderate risk", "Requires patience", "Can have losing streaks"],
                    color: "blue"
                  },
                  {
                    name: "High Risk Trading",
                    multiplier: "5.0x - 20.0x",
                    description: "Hold for high multipliers seeking massive returns",
                    pros: ["Huge profit potential", "Exciting trading", "Big profit margins"],
                    cons: ["Very risky", "Low success rate", "Can lose quickly"],
                    color: "red"
                  },
                  {
                    name: "Martingale System",
                    multiplier: "Variable",
                    description: "Double position size after each loss (HIGH RISK)",
                    pros: ["Can recover losses", "Simple system"],
                    cons: ["Extremely dangerous", "Can lose everything", "Requires huge capital"],
                    color: "red"
                  }
                ].map((strategy) => (
                  <div key={strategy.name} className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xl font-bold">{strategy.name}</h3>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium bg-${strategy.color}-500/20 text-${strategy.color}-400 border border-${strategy.color}-500/30`}>
                        {strategy.multiplier}
                      </span>
                    </div>
                    <p className="text-gray-300 mb-4">{strategy.description}</p>
                    
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium text-green-400 mb-1">Pros:</h4>
                        <ul className="text-sm text-gray-400 space-y-1">
                          {strategy.pros.map((pro, index) => (
                            <li key={index} className="flex items-start">
                              <span className="text-green-400 mr-2">+</span>
                              {pro}
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-red-400 mb-1">Cons:</h4>
                        <ul className="text-sm text-gray-400 space-y-1">
                          {strategy.cons.map((con, index) => (
                            <li key={index} className="flex items-start">
                              <span className="text-red-400 mr-2">-</span>
                              {con}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-purple-900/20 rounded-lg p-6 border border-purple-500/20">
                <h3 className="text-xl font-bold mb-4 flex items-center text-purple-400">
                  <TrendingUp className="mr-2" />
                  General Tips for Successful Trading
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">💡</span>
                      Start with small positions while learning
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">💡</span>
                      Set profit targets and stick to them
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">💡</span>
                      Never chase losses with bigger positions
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">💡</span>
                      Take breaks after big wins or losses
                    </li>
                  </ul>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">💡</span>
                      Watch other traders' strategies in chat
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">💡</span>
                      Don't get emotional about wins/losses
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">💡</span>
                      Keep track of your overall P&L
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">💡</span>
                      Remember: the platform has trading fees
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Account Tab */}
          {activeTab === 'account' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-6">Account Information</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Profile Section */}
                <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-xl font-bold mb-4 flex items-center">
                    <User className="mr-2 text-blue-400" />
                    Profile
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Username:</span>
                      <div className="flex items-center">
                        <span className="font-medium mr-2">{currentUser?.username || 'Not set'}</span>
                        <button
                          onClick={() => setShowUsernameModal(true)}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                          title="Edit username"
                        >
                          <Edit3 size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Avatar:</span>
                      <span className="text-2xl">{currentUser?.avatar || '👤'}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Level:</span>
                      <span className="font-medium text-yellow-400">Level {currentUser?.level || 1}</span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Badge:</span>
                      <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-sm">
                        {currentUser?.badge || 'newcomer'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Member Since:</span>
                      <span className="text-sm">
                        {currentUser?.created_at ? new Date(currentUser.created_at).toLocaleDateString() : 'Unknown'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Wallet Section */}
                <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-xl font-bold mb-4 flex items-center">
                    <Wallet className="mr-2 text-green-400" />
                    Wallet Info
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <span className="text-gray-400 block mb-1">Wallet Address:</span>
                      <div className="font-mono text-sm bg-gray-800 p-2 rounded break-all">
                        {walletAddress || 'No wallet connected'}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Trading Balance:</span>
                      <span className="font-medium text-green-400">
                        {currentUser?.custodial_balance?.toFixed(3) || '0.000'} SOL
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Total Deposited:</span>
                      <span className="font-medium">
                        {currentUser?.total_deposited?.toFixed(3) || '0.000'} SOL
                      </span>
                    </div>

                    <div className="pt-4 border-t border-gray-700">
                      <div className="text-sm text-gray-400 mb-2">Contact Info:</div>
                      <div className="text-sm">
                        {user?.email?.address || user?.phone?.number || 'None provided'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Section */}
              <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                <h3 className="text-xl font-bold mb-4 flex items-center">
                  <Trophy className="mr-2 text-yellow-400" />
                  Trading Statistics
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-400">
                      {currentUser?.total_games_played || 0}
                    </div>
                    <div className="text-sm text-gray-400">Trades Executed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-400">
                      {currentUser?.games_won || 0}
                    </div>
                    <div className="text-sm text-gray-400">Profitable Trades</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-400">
                      {(currentUser?.win_rate || 0).toFixed(1)}%
                    </div>
                    <div className="text-sm text-gray-400">Success Rate</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-400">
                      {currentUser?.best_multiplier?.toFixed(2) || '0.00'}x
                    </div>
                    <div className="text-sm text-gray-400">Best Exit</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preferences Tab */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold mb-6">Preferences</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                {/* Display Settings */}
                <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-xl font-bold mb-4 flex items-center">
                    <Eye className="mr-2 text-blue-400" />
                    Display Settings
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Show Balance</div>
                        <div className="text-sm text-gray-400">Display your SOL balance in the navbar</div>
                      </div>
                      <button
                        onClick={() => setShowBalance(!showBalance)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          showBalance ? 'bg-green-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            showBalance ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Sound Effects</div>
                        <div className="text-sm text-gray-400">Play sounds for trading events</div>
                      </div>
                      <button
                        onClick={() => setSoundEnabled(!soundEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          soundEnabled ? 'bg-green-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            soundEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Notification Settings */}
                <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-xl font-bold mb-4 flex items-center">
                    <MessageCircle className="mr-2 text-green-400" />
                    Chat & Notifications
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Notifications</div>
                        <div className="text-sm text-gray-400">Receive trading and chat notifications</div>
                      </div>
                      <button
                        onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          notificationsEnabled ? 'bg-green-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">Auto-chat on Profit</div>
                        <div className="text-sm text-gray-400">Automatically celebrate profitable trades in chat</div>
                      </div>
                      <button
                        onClick={() => setAutoChat(!autoChat)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          autoChat ? 'bg-green-600' : 'bg-gray-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            autoChat ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-gray-900/50 rounded-lg p-6 border border-gray-700">
                <h3 className="text-xl font-bold mb-4 flex items-center">
                  <Settings className="mr-2 text-purple-400" />
                  Quick Actions
                </h3>
                <div className="grid md:grid-cols-3 gap-4">
                  <button
                    onClick={() => setShowUsernameModal(true)}
                    className="flex items-center justify-center p-4 bg-blue-600/20 hover:bg-blue-600/30 rounded-lg border border-blue-500/30 transition-colors"
                  >
                    <Edit3 className="mr-2" size={20} />
                    Change Username
                  </button>
                  
                  <button className="flex items-center justify-center p-4 bg-green-600/20 hover:bg-green-600/30 rounded-lg border border-green-500/30 transition-colors">
                    <RefreshCw className="mr-2" size={20} />
                    Refresh Data
                  </button>
                  
                  <button className="flex items-center justify-center p-4 bg-purple-600/20 hover:bg-purple-600/30 rounded-lg border border-purple-500/30 transition-colors">
                    <Save className="mr-2" size={20} />
                    Export Stats
                  </button>
                </div>
              </div>

              {/* Support Section */}
              <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 rounded-lg p-6 border border-blue-500/20">
                <h3 className="text-xl font-bold mb-4">Need Help?</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Contact Support</h4>
                    <p className="text-sm text-gray-400 mb-3">
                      Having issues? Reach out to our support team:
                    </p>
                    <div className="text-sm">
                      <div>📧 Email: IRUGGEDSUPPORT@IRUGGED.COM</div>
                      <div>💬 Discord: <a href="https://discord.gg/ZhhGJXB4yD" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Join our community</a></div>
                      <div>🐦 Twitter: @ruggeddotfun</div>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Community</h4>
                    <p className="text-sm text-gray-400 mb-3">
                      Connect with other traders and share strategies:
                    </p>
                    <div className="flex space-x-2">
                      <a 
                        href="https://discord.gg/ZhhGJXB4yD" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-purple-600/20 hover:bg-purple-600/30 rounded text-sm transition-colors"
                      >
                        Discord
                      </a>
                      <a 
                        href="https://x.com/ruggeddotfun" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 rounded text-sm transition-colors"
                      >
                        Twitter
                      </a>
                      <a 
                        href="https://t.me/+rqS5cuN9qKdmZTIx" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 rounded text-sm transition-colors"
                      >
                        Telegram
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Username Modal */}
      {showUsernameModal && (
        <UsernameModal 
          isOpen={showUsernameModal}
          onClose={() => setShowUsernameModal(false)}
          onSubmit={handleUsernameSubmit}
          currentUsername={currentUser?.username || ''}
        />
      )}
    </div>
  );
};

export default SettingsPage;