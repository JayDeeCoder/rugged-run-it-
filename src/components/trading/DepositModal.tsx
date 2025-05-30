// src/components/trading/DepositModal.tsx - UI Matched to WithdrawModal
import { FC, useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { ArrowUpToLine, Wallet, Check, Loader, X, Copy, QrCode, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { UserAPI } from '../../services/api';
import { toast } from 'react-hot-toast';

// Feature flags - same pattern as your withdrawal modal
const DEBUG_FEATURE_FLAGS = {
  CUSTODIAL_ONLY_MODE: process.env.NEXT_PUBLIC_CUSTODIAL_ONLY_MODE === 'true',
  ENABLE_EMBEDDED_WALLETS: process.env.NEXT_PUBLIC_ENABLE_EMBEDDED_WALLETS === 'true',
  ENABLE_HYBRID_SYSTEM: process.env.NEXT_PUBLIC_ENABLE_HYBRID_SYSTEM === 'true'
};

function isCustodialOnlyMode(): boolean {
  return DEBUG_FEATURE_FLAGS.CUSTODIAL_ONLY_MODE || !DEBUG_FEATURE_FLAGS.ENABLE_HYBRID_SYSTEM;
}

function getWalletMode(): 'custodial' | 'hybrid' | 'embedded' {
  if (DEBUG_FEATURE_FLAGS.CUSTODIAL_ONLY_MODE) return 'custodial';
  if (DEBUG_FEATURE_FLAGS.ENABLE_HYBRID_SYSTEM) return 'hybrid';
  return 'embedded';
}

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
  userId: propUserId
}) => {
  // Feature flag setup - exactly like withdrawal modal
  const custodialOnlyMode = isCustodialOnlyMode();
  const walletMode = getWalletMode();
  
  // User management - same pattern as withdrawal modal
  const { authenticated } = usePrivy();
  // FIX: Handle undefined propUserId by converting to null
  const [internalUserId, setInternalUserId] = useState<string | null>(propUserId || null);
  const [fetchingUserId, setFetchingUserId] = useState<boolean>(false);
  
  // State management - matches withdrawal modal patterns
  const [copied, setCopied] = useState<boolean>(false);
  const [showQR, setShowQR] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [success, setSuccess] = useState<boolean>(false);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  
  // Custodial-specific state
  const [custodialDepositInfo, setCustodialDepositInfo] = useState<CustodialDepositResponse | null>(null);
  const [fetchingDepositInfo, setFetchingDepositInfo] = useState<boolean>(false);
  const [serverConfigError, setServerConfigError] = useState<boolean>(false);
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState<boolean>(false);
  
  const modalRef = useRef<HTMLDivElement>(null);
  const tokenSymbol = currentToken;
  const effectiveUserId = internalUserId || propUserId;
  
  // Fallback house wallet - same as your pattern
  const FALLBACK_HOUSE_WALLET = '7voNeLKTZvD1bUJU18kx9eCtEGGJYWZbPAHNwLSkoR56';
  
  // User initialization - exact same pattern as withdrawal modal
  useEffect(() => {
    if (authenticated && walletAddress && !propUserId && !fetchingUserId) {
      const fetchUserId = async () => {
        try {
          setFetchingUserId(true);
          console.log('🔍 DepositModal: Fetching userId via API for walletAddress:', walletAddress);
          
          const response = await fetch('/api/users/get-or-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ walletAddress })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ DepositModal: API error:', errorText);
            throw new Error(`API error: ${response.status}`);
          }
          
          const data = await response.json();
          if (data.user && data.user.id) {
            setInternalUserId(data.user.id);
            console.log('✅ DepositModal: Got userId from API:', data.user.id);
          } else {
            console.error('❌ DepositModal: No user in API response:', data);
          }
        } catch (error) {
          console.error('❌ DepositModal: Failed to fetch userId via API:', error);
        } finally {
          setFetchingUserId(false);
        }
      };
      
      fetchUserId();
    } else if (propUserId) {
      setInternalUserId(propUserId);
      console.log('✅ DepositModal: Using provided userId:', propUserId);
    }
  }, [authenticated, walletAddress, propUserId, fetchingUserId]);

  const retryGetUserId = useCallback(async () => {
    if (!walletAddress || fetchingUserId) return;
    
    try {
      setFetchingUserId(true);
      console.log('🔄 DepositModal: Manual retry fetching userId via API for:', walletAddress);
      
      const response = await fetch('/api/users/get-or-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ DepositModal: Retry API error:', errorText);
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.user && data.user.id) {
        setInternalUserId(data.user.id);
        console.log('✅ DepositModal: Retry got userId from API:', data.user.id);
      } else {
        console.error('❌ DepositModal: Retry - No user in API response:', data);
      }
    } catch (error) {
      console.error('❌ DepositModal: Retry failed to fetch userId via API:', error);
    } finally {
      setFetchingUserId(false);
    }
  }, [walletAddress, fetchingUserId]);
  
  // API fetch function
  const fetchCustodialDepositInfo = useCallback(async () => {
    if (!custodialOnlyMode || !effectiveUserId || fetchingDepositInfo || hasAttemptedFetch) {
      return;
    }
    
    console.log('🚀 fetchCustodialDepositInfo called for user:', effectiveUserId);
    setFetchingDepositInfo(true);
    setError(null);
    setServerConfigError(false);
    setHasAttemptedFetch(true);
    
    try {
      const response = await fetch('/api/custodial/deposit-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: effectiveUserId })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API error response:', errorText);
        
        if (errorText.includes('House wallet not configured') || errorText.includes('Deposit service not available')) {
          setServerConfigError(true);
          setError('Custodial deposits are temporarily unavailable due to server configuration.');
        } else {
          setError(`Server error: ${response.status}`);
        }
        return;
      }
      
      const data: CustodialDepositResponse = await response.json();
      console.log('✅ API response data:', data);
      
      if (data.success) {
        setCustodialDepositInfo(data);
        setServerConfigError(false);
      } else {
        setError(data.message || 'API returned success: false');
      }
    } catch (error) {
      console.error('❌ fetchCustodialDepositInfo error:', error);
      setError('Failed to connect to deposit service');
      setServerConfigError(true);
    } finally {
      setFetchingDepositInfo(false);
    }
  }, [custodialOnlyMode, effectiveUserId, fetchingDepositInfo, hasAttemptedFetch]);
  
  // Reset state when modal opens/closes - same pattern as withdrawal modal
  useEffect(() => {
    if (isOpen) {
      console.log('🚀 DepositModal: Modal opened, resetting state');
      setCopied(false);
      setShowQR(false);
      setIsLoading(false);
      setError(null);
      setSuccess(false);
      setSuccessMessage('');
      setCustodialDepositInfo(null);
      setServerConfigError(false);
      setHasAttemptedFetch(false);
      
      // Initialize user if needed
      if (!effectiveUserId && !fetchingUserId) {
        // Will be handled by the useEffect above
      }
    } else {
      // Reset everything when modal closes
      if (!propUserId) {
        setInternalUserId(null);
      }
      setHasAttemptedFetch(false);
      setServerConfigError(false);
      setError(null);
      setCustodialDepositInfo(null);
    }
  }, [isOpen, effectiveUserId, propUserId, fetchingUserId]);
  
  // Fetch custodial info when ready
  useEffect(() => {
    if (isOpen && custodialOnlyMode && effectiveUserId && !fetchingUserId && !hasAttemptedFetch) {
      console.log('🔄 User ID available, fetching custodial deposit info...');
      fetchCustodialDepositInfo();
    }
  }, [isOpen, custodialOnlyMode, effectiveUserId, fetchingUserId, hasAttemptedFetch, fetchCustodialDepositInfo]);
  
  // Determine display address
  const getDisplayAddress = () => {
    if (custodialOnlyMode) {
      if (custodialDepositInfo?.depositAddress) {
        return custodialDepositInfo.depositAddress;
      }
      if (serverConfigError) {
        return FALLBACK_HOUSE_WALLET;
      }
      return null;
    }
    return walletAddress;
  };
  
  const displayAddress = getDisplayAddress();
  
  const copyAddress = async () => {
    if (!displayAddress) return;
    try {
      await navigator.clipboard.writeText(displayAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      console.log('📋 Address copied:', displayAddress?.slice(0, 8) + '...');
    } catch (error) {
      console.error('Failed to copy address:', error);
      toast.error('Failed to copy address');
    }
  };

  const handleDepositConfirmation = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setSuccess(true);
      setSuccessMessage(`Deposit initiated! Your ${tokenSymbol} will be credited to your ${custodialOnlyMode ? 'game balance' : 'account'} shortly.`);
      if (onSuccess) onSuccess();
    }, 3000);
  };

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
      depositType: serverConfigError ? 'Manual Deposit (Fallback)' : 'Direct Wallet Deposit',
      processingTime: serverConfigError ? '~1 minute' : 'Instant'
    };
  };

  const networkInfo = getNetworkInfo();
  
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isLoading) onClose();
  });
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
      >
        {/* Header - exactly matches withdrawal modal */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center">
            <ArrowUpToLine size={20} className="mr-2" />
            Deposit {tokenSymbol}
            {/* Mode indicator - same style as withdrawal modal */}
            <span className="ml-2 text-xs bg-green-600 text-white px-2 py-1 rounded">
              {walletMode.toUpperCase()}
            </span>
          </h2>
          <button
            onClick={onClose}
            disabled={isLoading || fetchingDepositInfo || fetchingUserId}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        {success ? (
          // Success state - exactly matches withdrawal modal
          <div className="text-center py-8">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-500 bg-opacity-20 rounded-full flex items-center justify-center">
                <Check size={32} className="text-green-500" />
              </div>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Success!</h3>
            <p className="text-gray-400 mb-6">{successMessage}</p>
            <button
              onClick={onClose}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors w-full"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Debug info - exactly matches withdrawal modal style */}
            {process.env.NODE_ENV === 'development' && (
              <div className="bg-gray-900 p-3 rounded mb-4 text-xs space-y-1">
                <div className="text-gray-400 font-bold">🔍 Debug Info:</div>
                <div className="text-purple-400">Wallet Mode: {walletMode}</div>
                <div className="text-orange-400">Custodial Only: {custodialOnlyMode ? 'Yes' : 'No'}</div>
                <div className="text-green-400">Prop UserId: {propUserId || 'None'}</div>
                <div className="text-cyan-400">Internal UserId: {internalUserId || 'None'}</div>
                <div className="text-lime-400">Effective UserId: {effectiveUserId || 'None'}</div>
                <div className="text-blue-400">WalletAddress: {walletAddress || 'None'}</div>
                <div className="text-yellow-400">Authenticated: {authenticated ? 'Yes' : 'No'}</div>
                <div className="text-purple-400">Fetching UserId: {fetchingUserId ? 'Yes' : 'No'}</div>
                <div className="text-teal-400">Fetching Deposit Info: {fetchingDepositInfo ? 'Yes' : 'No'}</div>
                <div className="text-pink-400">Server Config Error: {serverConfigError ? 'Yes' : 'No'}</div>
                {!effectiveUserId && !fetchingUserId && (
                  <div className="text-red-400 font-bold">⚠️ No userId available!</div>
                )}
                {fetchingUserId && (
                  <div className="text-yellow-400 font-bold">🔄 Fetching userId from API...</div>
                )}
              </div>
            )}
            
            {/* Mode description - matches withdrawal modal */}
            {custodialOnlyMode && (
              <div className="bg-blue-900 bg-opacity-20 border border-blue-800 text-blue-400 p-3 rounded-md mb-4 text-sm">
                <div className="font-medium mb-1">🏦 Custodial Deposit Mode</div>
                <div className="text-xs">
                  Send SOL from any wallet to this address. Your game balance will be credited automatically.
                </div>
              </div>
            )}
            
            {/* User ID status notification - same as withdrawal modal */}
            {authenticated && walletAddress && !effectiveUserId && !fetchingUserId && (
              <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 text-yellow-500 p-3 rounded-md mb-4 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold mb-1">⚠️ User Setup Required</div>
                    <div className="text-xs">Unable to initialize user account. Please retry.</div>
                  </div>
                  <button
                    onClick={retryGetUserId}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-xs"
                  >
                    Retry
                  </button>
                </div>
              </div>
            )}
            
            {/* Server configuration error */}
            {serverConfigError && (
              <div className="bg-orange-900 bg-opacity-30 border border-orange-800 text-orange-400 p-3 rounded-md mb-4 text-sm">
                <div className="font-medium mb-2">⚠️ Server Configuration Issue</div>
                <div className="text-xs mb-2">
                  The custodial deposit service is temporarily unavailable. Using fallback address.
                </div>
                <div className="text-xs text-orange-300">
                  • Your deposit will be manually processed
                  • Allow 1-2 minutes for credit
                </div>
              </div>
            )}
            
            {/* Loading states */}
            {fetchingUserId && (
              <div className="bg-blue-800 p-4 rounded-md mb-6 text-center">
                <Loader size={24} className="animate-spin text-blue-500 mx-auto mb-2" />
                <div className="text-white text-sm">Initializing user account...</div>
                <div className="text-gray-400 text-xs">Getting user ID from wallet address...</div>
              </div>
            )}
            
            {fetchingDepositInfo && (
              <div className="bg-gray-800 p-4 rounded-md mb-6 text-center">
                <Loader size={24} className="animate-spin text-green-500 mx-auto mb-2" />
                <div className="text-white text-sm">Getting deposit address...</div>
                <div className="text-gray-400 text-xs">Contacting server...</div>
              </div>
            )}
            
            {/* Network info - matches withdrawal modal balance display style */}
            {displayAddress && (
              <div className="bg-gray-800 p-4 rounded-md mb-6">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400 text-sm">Deposit Information</span>
                  <button 
                    onClick={() => {
                      setHasAttemptedFetch(false);
                      if (!effectiveUserId) {
                        retryGetUserId();
                      } else {
                        fetchCustodialDepositInfo();
                      }
                    }}
                    disabled={fetchingDepositInfo || fetchingUserId}
                    className="text-blue-400 hover:text-blue-300 transition-colors flex items-center space-x-1"
                    title="Refresh deposit info"
                  >
                    <RefreshCw size={14} className={(fetchingDepositInfo || fetchingUserId) ? 'animate-spin' : ''} />
                    <span className="text-xs">Refresh</span>
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Network:</span>
                    <span className="text-white font-medium">{networkInfo.network}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Type:</span>
                    <span className="text-white">{networkInfo.depositType}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Min Deposit:</span>
                    <span className="text-white">{networkInfo.minDeposit}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400 text-sm">Credit Time:</span>
                    <span className="text-white">{networkInfo.processingTime}</span>
                  </div>
                </div>
                
                {/* Show wallet address for debugging - matches withdrawal modal */}
                {walletAddress && (
                  <div className="mt-3 pt-2 border-t border-gray-700">
                    <div className="text-xs text-gray-500">
                      Your Wallet: {walletAddress.slice(0, 8)}...{walletAddress.slice(-8)}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Address display */}
            {displayAddress && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">
                    {custodialOnlyMode ? 'Send SOL to this Address' : 'Your Deposit Address'}
                    {serverConfigError && (
                      <span className="ml-2 text-xs text-orange-400">(Fallback Address)</span>
                    )}
                  </label>
                  
                  <div className="bg-gray-800 border border-gray-700 rounded-md p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 mr-2">
                        <div className="text-white font-mono text-sm break-all">
                          {displayAddress}
                        </div>
                      </div>
                      <button
                        onClick={copyAddress}
                        className="text-blue-400 text-xs hover:text-blue-300 flex items-center"
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
                    </div>
                  </div>
                </div>
                
                {/* QR Code toggle */}
                <div className="flex justify-center">
                  <button
                    onClick={() => setShowQR(!showQR)}
                    className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
                  >
                    <QrCode size={16} className="mr-2" />
                    {showQR ? 'Hide QR Code' : 'Show QR Code'}
                  </button>
                </div>
                
                {/* QR Code display */}
                {showQR && (
                  <div className="flex justify-center bg-white p-4 rounded-lg">
                    <QRCodeSVG 
                      value={displayAddress} 
                      size={200}
                      level="M"
                      includeMargin={true}
                    />
                  </div>
                )}
                
                {/* Instructions - matches withdrawal modal info boxes */}
                <div className="bg-yellow-900 bg-opacity-20 border border-yellow-800 text-yellow-500 p-3 rounded-md text-sm">
                  <div className="font-medium mb-2">Important Notes:</div>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>Only send {tokenSymbol} to this address</li>
                    <li>Double-check the address before sending</li>
                    {custodialOnlyMode && <li>Your game balance will be credited automatically</li>}
                    {serverConfigError && <li>Manual processing may take 1-2 minutes</li>}
                  </ul>
                </div>
                
                {/* Action button - matches withdrawal modal */}
                <button
                  onClick={handleDepositConfirmation}
                  disabled={isLoading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 px-4 rounded-md transition-colors flex items-center justify-center"
                >
                  {isLoading ? (
                    <>
                      <Loader size={16} className="animate-spin mr-2" />
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
            )}
            
            {/* No address available state */}
            {!displayAddress && !fetchingUserId && !fetchingDepositInfo && (
              <div className="text-center py-8">
                <div className="text-gray-400 mb-4">Unable to generate deposit address</div>
                <button
                  onClick={() => {
                    setHasAttemptedFetch(false);
                    if (!effectiveUserId) {
                      retryGetUserId();
                    } else {
                      fetchCustodialDepositInfo();
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
                >
                  <RefreshCw size={16} className="mr-2 inline" />
                  Retry
                </button>
              </div>
            )}
            
            {/* Error Message - matches withdrawal modal */}
            {error && (
              <div className="bg-red-900 bg-opacity-30 border border-red-800 text-red-500 p-3 rounded-md mt-4">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default DepositModal;