// src/components/trading/DepositModal.tsx - Debug Version
import { FC, useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { ArrowUpToLine, Wallet, Check, Loader, X, Copy, ExternalLink, QrCode, RefreshCw, AlertTriangle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// 🚩 TEMPORARY: Inline feature flags for debugging
const DEBUG_FEATURE_FLAGS = {
  CUSTODIAL_ONLY_MODE: process.env.NEXT_PUBLIC_CUSTODIAL_ONLY_MODE === 'true',
  ENABLE_EMBEDDED_WALLETS: process.env.NEXT_PUBLIC_ENABLE_EMBEDDED_WALLETS === 'true',
  ENABLE_HYBRID_SYSTEM: process.env.NEXT_PUBLIC_ENABLE_HYBRID_SYSTEM === 'true'
};

// 🚩 TEMPORARY: Inline feature flag functions for debugging
function isCustodialOnlyMode(): boolean {
  return DEBUG_FEATURE_FLAGS.CUSTODIAL_ONLY_MODE || !DEBUG_FEATURE_FLAGS.ENABLE_HYBRID_SYSTEM;
}

function getWalletMode(): 'custodial' | 'hybrid' | 'embedded' {
  if (DEBUG_FEATURE_FLAGS.CUSTODIAL_ONLY_MODE) return 'custodial';
  if (DEBUG_FEATURE_FLAGS.ENABLE_HYBRID_SYSTEM) return 'hybrid';
  return 'embedded';
}

// Define the TokenType enum locally
enum TokenType {
  SOL = 'SOL',
  RUGGED = 'RUGGED'
}

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  currentToken: TokenType;
  walletAddress: string;
  userId?: string | null;
}

interface CustodialDepositResponse {
  success: boolean;
  message: string;
  depositInfo: {
    depositAddress: string;
    requestedAmount: string | number;
    minDeposit: number;
    maxDeposit: number;
    network: string;
    mode: string;
  };
  instructions: string[];
  important: string[];
  timing: {
    estimatedCreditTime: string;
    blockchainConfirmations: string;
    supportContact: string;
  };
  depositAddress: string;
  qrCodeUrl: string;
  explorerUrl: string;
  timestamp: string;
}

const DepositModal: FC<DepositModalProps> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  currentToken,
  walletAddress,
  userId
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [showQR, setShowQR] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Custodial-specific state
  const [custodialDepositInfo, setCustodialDepositInfo] = useState<CustodialDepositResponse | null>(null);
  const [fetchingDepositInfo, setFetchingDepositInfo] = useState<boolean>(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  
  // Debug state
  const [debugInfo, setDebugInfo] = useState<any>({});
  
  // Feature flag checks
  const custodialOnlyMode = isCustodialOnlyMode();
  const walletMode = getWalletMode();
  
  const tokenSymbol = currentToken;
  const { user } = usePrivy();
  const { currentUser } = useContext(UserContext);
  const modalRef = useRef<HTMLDivElement>(null);
  
  // 🚩 DEBUG: Enhanced logging
  useEffect(() => {
    const debug = {
      timestamp: new Date().toISOString(),
      environmentVariables: {
        NEXT_PUBLIC_CUSTODIAL_ONLY_MODE: process.env.NEXT_PUBLIC_CUSTODIAL_ONLY_MODE,
        NEXT_PUBLIC_ENABLE_EMBEDDED_WALLETS: process.env.NEXT_PUBLIC_ENABLE_EMBEDDED_WALLETS,
        NEXT_PUBLIC_ENABLE_HYBRID_SYSTEM: process.env.NEXT_PUBLIC_ENABLE_HYBRID_SYSTEM,
        HOUSE_WALLET_ADDRESS: process.env.HOUSE_WALLET_ADDRESS,
        NEXT_PUBLIC_HOUSE_WALLET_ADDRESS: process.env.NEXT_PUBLIC_HOUSE_WALLET_ADDRESS
      },
      featureFlags: DEBUG_FEATURE_FLAGS,
      computed: {
        custodialOnlyMode,
        walletMode
      },
      props: {
        userId,
        walletAddress: walletAddress?.slice(0, 8) + '...',
        isOpen
      }
    };
    
    setDebugInfo(debug);
    console.log('🔍 DepositModal Debug Info:', debug);
  }, [custodialOnlyMode, walletMode, userId, walletAddress, isOpen]);
  
  // Get custodial deposit info with enhanced debugging
  const fetchCustodialDepositInfo = useCallback(async () => {
    console.log('🚀 fetchCustodialDepositInfo called:', {
      custodialOnlyMode,
      userId,
      shouldFetch: custodialOnlyMode && userId
    });
    
    if (!custodialOnlyMode) {
      console.log('❌ Not fetching - custodialOnlyMode is false');
      return;
    }
    
    if (!userId) {
      console.log('❌ Not fetching - userId is missing');
      setDepositError('User ID is required for custodial deposits');
      return;
    }
    
    setFetchingDepositInfo(true);
    setDepositError(null);
    
    try {
      console.log('📡 Making API call to /api/custodial/deposit-info...');
      
      const response = await fetch('/api/custodial/deposit-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      console.log('📡 Response status:', response.status);
      console.log('📡 Response headers:', Object.fromEntries(response.headers));
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API error response:', errorText);
        throw new Error(`API error ${response.status}: ${errorText}`);
      }
      
      const data: CustodialDepositResponse = await response.json();
      console.log('✅ API response data:', data);
      
      if (data.success) {
        setCustodialDepositInfo(data);
        console.log('✅ Custodial deposit info set:', {
          depositAddress: data.depositAddress,
          hasInstructions: data.instructions?.length || 0,
          hasQrCode: !!data.qrCodeUrl
        });
      } else {
        throw new Error('API returned success: false');
      }
    } catch (error) {
      console.error('❌ fetchCustodialDepositInfo error:', error);
      setDepositError(error instanceof Error ? error.message : 'Failed to get deposit information');
    } finally {
      setFetchingDepositInfo(false);
    }
  }, [custodialOnlyMode, userId]);
  
  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      console.log('🚪 Modal opened, resetting state...');
      setCopied(false);
      setShowQR(false);
      setIsLoading(false);
      setDepositError(null);
      setCustodialDepositInfo(null);
      
      // Force immediate fetch for custodial mode
      if (custodialOnlyMode && userId) {
        console.log('🔄 Triggering custodial deposit info fetch...');
        setTimeout(() => {
          fetchCustodialDepositInfo();
        }, 100);
      } else {
        console.log('⚠️ Not fetching custodial info:', {
          custodialOnlyMode,
          hasUserId: !!userId
        });
      }
    }
  }, [isOpen, custodialOnlyMode, userId, fetchCustodialDepositInfo]);
  
  // Handle outside clicks
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isLoading && !fetchingDepositInfo) onClose();
  });
  
  if (!isOpen) return null;
  
  // Determine display address
  const displayAddress = custodialOnlyMode && custodialDepositInfo 
    ? custodialDepositInfo.depositAddress 
    : walletAddress;
  
  console.log('🏠 Display address logic:', {
    custodialOnlyMode,
    hasCustodialInfo: !!custodialDepositInfo,
    custodialAddress: custodialDepositInfo?.depositAddress,
    walletAddress,
    finalDisplayAddress: displayAddress
  });
  
  // Copy address to clipboard
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(displayAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      console.log('📋 Address copied:', displayAddress?.slice(0, 8) + '...');
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  // Handle deposit confirmation
  const handleDepositConfirmation = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      if (onSuccess) onSuccess();
      onClose();
    }, 3000);
  };

  // Get network info
  const getNetworkInfo = () => {
    if (custodialOnlyMode && custodialDepositInfo) {
      return {
        network: custodialDepositInfo.depositInfo.network,
        minDeposit: `${custodialDepositInfo.depositInfo.minDeposit} SOL`,
        maxDeposit: `${custodialDepositInfo.depositInfo.maxDeposit} SOL`,
        confirmations: custodialDepositInfo.timing.blockchainConfirmations,
        depositType: 'Custodial Deposit',
        processingTime: custodialDepositInfo.timing.estimatedCreditTime
      };
    }
    
    return {
      network: currentToken === TokenType.SOL ? 'Solana Mainnet' : 'Solana (SPL Token)',
      minDeposit: currentToken === TokenType.SOL ? '0.001 SOL' : '1 RUGGED',
      maxDeposit: 'No limit',
      confirmations: '1 confirmation',
      depositType: 'Direct Wallet Deposit',
      processingTime: 'Instant'
    };
  };

  const networkInfo = getNetworkInfo();
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center">
            <ArrowUpToLine size={20} className="mr-2" />
            Deposit {tokenSymbol}
            <span className="ml-2 text-xs bg-green-600 text-white px-2 py-1 rounded">
              {walletMode.toUpperCase()}
            </span>
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading || fetchingDepositInfo}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {/* 🚩 ENHANCED: Debug panel - always visible for now */}
        <div className="bg-gray-900 p-3 rounded mb-4 text-xs">
          <div className="text-yellow-400 font-bold mb-2 flex items-center">
            <AlertTriangle size={14} className="mr-1" />
            Debug Panel
          </div>
          <div className="space-y-1">
            <div className="text-red-400">Custodial Only Mode: {custodialOnlyMode ? 'TRUE' : 'FALSE'}</div>
            <div className="text-blue-400">Wallet Mode: {walletMode}</div>
            <div className="text-green-400">User ID: {userId || 'MISSING'}</div>
            <div className="text-purple-400">Has Custodial Info: {custodialDepositInfo ? 'YES' : 'NO'}</div>
            <div className="text-cyan-400">Fetching Info: {fetchingDepositInfo ? 'YES' : 'NO'}</div>
            <div className="text-orange-400">Display Address: {displayAddress?.slice(0, 12) + '...' || 'NONE'}</div>
            <div className="text-pink-400">Error: {depositError || 'None'}</div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-700">
            <div className="text-gray-400 text-xs">Env Vars:</div>
            <div className="text-yellow-300">CUSTODIAL_ONLY: {process.env.NEXT_PUBLIC_CUSTODIAL_ONLY_MODE || 'undefined'}</div>
            <div className="text-blue-300">EMBEDDED_WALLETS: {process.env.NEXT_PUBLIC_ENABLE_EMBEDDED_WALLETS || 'undefined'}</div>
          </div>
        </div>
        
        {/* Mode explanation */}
        {custodialOnlyMode && (
          <div className="bg-green-900 bg-opacity-20 border border-green-800 text-green-400 p-3 rounded-md mb-4 text-sm">
            <div className="font-medium mb-1">🏦 Custodial Deposit Active</div>
            <div className="text-xs">
              Send SOL from any wallet to this address. Your game balance will be credited automatically.
            </div>
          </div>
        )}
        
        {/* Loading state for custodial deposit info */}
        {custodialOnlyMode && fetchingDepositInfo && (
          <div className="bg-gray-800 p-4 rounded-md mb-6 text-center">
            <Loader size={24} className="animate-spin text-green-500 mx-auto mb-2" />
            <div className="text-white text-sm">Getting deposit address...</div>
            <div className="text-gray-400 text-xs">Calling /api/custodial/deposit-info...</div>
          </div>
        )}
        
        {/* Error state */}
        {depositError && (
          <div className="bg-red-900 bg-opacity-30 border border-red-800 text-red-500 p-3 rounded-md mb-4 text-sm">
            <div className="font-medium mb-1">❌ Error</div>
            <div className="text-xs">{depositError}</div>
            <button
              onClick={fetchCustodialDepositInfo}
              className="mt-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs"
            >
              Retry API Call
            </button>
          </div>
        )}
        
        {/* 🚩 FORCE SHOW: Show manual deposit info if custodial mode but no API data */}
        {custodialOnlyMode && !custodialDepositInfo && !fetchingDepositInfo && (
          <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 text-yellow-400 p-3 rounded-md mb-4 text-sm">
            <div className="font-medium mb-1">⚠️ Manual Deposit Info</div>
            <div className="text-xs mb-2">API call failed, showing manual deposit address:</div>
            <div className="bg-gray-800 p-2 rounded font-mono text-xs break-all">
              {process.env.HOUSE_WALLET_ADDRESS || process.env.NEXT_PUBLIC_HOUSE_WALLET_ADDRESS || '7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56'}
            </div>
            <button
              onClick={() => {
                const addr = process.env.HOUSE_WALLET_ADDRESS || process.env.NEXT_PUBLIC_HOUSE_WALLET_ADDRESS || '7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56';
                navigator.clipboard.writeText(addr);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="mt-2 bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs"
            >
              Copy Manual Address
            </button>
          </div>
        )}
        
        {/* Show main content */}
        {(!custodialOnlyMode || custodialDepositInfo || (!fetchingDepositInfo && depositError)) && (
          <>
            {/* Network Info */}
            <div className="bg-gray-800 p-4 rounded-md mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">Network:</span>
                <span className="text-white font-medium">{networkInfo.network}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">Type:</span>
                <span className="text-white">{networkInfo.depositType}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">Min Deposit:</span>
                <span className="text-white">{networkInfo.minDeposit}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Credit Time:</span>
                <span className="text-white">{networkInfo.processingTime}</span>
              </div>
            </div>
            
            {/* Address Display */}
            <div className="mb-6">
              <label className="block text-gray-300 mb-2 text-sm">
                {custodialOnlyMode ? 'Send SOL to this Address' : 'Your Deposit Address'}
              </label>
              
              <div className="bg-gray-800 p-3 rounded-md mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 mr-2">
                    <div className="text-white font-mono text-sm break-all">
                      {displayAddress || 'Address not available'}
                    </div>
                  </div>
                  {displayAddress && (
                    <button
                      onClick={copyAddress}
                      className="flex items-center bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1 rounded transition-colors"
                    >
                      {copied ? (
                        <>
                          <Check size={14} className="mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy size={14} className="mr-1" />
                          Copy
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
              
              {/* QR Code */}
              {displayAddress && (
                <>
                  <div className="flex justify-center mb-4">
                    <button
                      onClick={() => setShowQR(!showQR)}
                      className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
                    >
                      <QrCode size={16} className="mr-2" />
                      {showQR ? 'Hide QR Code' : 'Show QR Code'}
                    </button>
                  </div>
                  
                  {showQR && (
                    <div className="flex justify-center bg-white p-4 rounded-lg mb-4">
                      <QRCodeSVG 
                        value={displayAddress} 
                        size={200}
                        level="M"
                        includeMargin={true}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
            
            {/* Instructions */}
            <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 text-yellow-500 p-3 rounded-md mb-6 text-sm">
              <div className="font-medium mb-2">Important Notes:</div>
              {custodialOnlyMode && custodialDepositInfo ? (
                <ul className="list-disc list-inside space-y-1 text-xs">
                  {custodialDepositInfo.important.map((note, index) => (
                    <li key={index}>{note}</li>
                  ))}
                </ul>
              ) : (
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Only send {tokenSymbol} to this address</li>
                  <li>Double-check the address before sending</li>
                  {custodialOnlyMode && <li>Your game balance will be credited automatically</li>}
                </ul>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-md transition-colors"
              >
                Close
              </button>
              
              <button
                onClick={handleDepositConfirmation}
                disabled={isLoading}
                className={`flex-1 px-4 py-2 rounded-md transition-colors flex items-center justify-center ${
                  isLoading
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {isLoading ? (
                  <>
                    <Loader size={16} className="mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Wallet size={16} className="mr-2" />
                    I've Sent {tokenSymbol}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DepositModal;