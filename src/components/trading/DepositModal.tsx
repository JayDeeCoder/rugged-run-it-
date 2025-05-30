// src/components/trading/DepositModal.tsx - Corrected for your API structure
import { FC, useState, useRef, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { UserContext } from '../../context/UserContext';
import { useContext } from 'react';
import useOutsideClick from '../../hooks/useOutsideClick';
import { ArrowUpToLine, Wallet, Check, Loader, X, Copy, ExternalLink, QrCode, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// 🚩 ADD: Import feature flags
import { 
  isCustodialOnlyMode, 
  shouldShowEmbeddedWalletUI, 
  getWalletMode, 
  getModeDescription 
} from '../../utils/featureFlags';

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
  userId?: string | null; // 🚩 ADD: userId for custodial deposits
}

// 🚩 CORRECTED: Interface matching your actual API response
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
  depositAddress: string; // Also available at top level
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
  userId // 🚩 ADD: userId prop
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [showQR, setShowQR] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // 🚩 ADD: Custodial-specific state
  const [custodialDepositInfo, setCustodialDepositInfo] = useState<CustodialDepositResponse | null>(null);
  const [fetchingDepositInfo, setFetchingDepositInfo] = useState<boolean>(false);
  const [depositError, setDepositError] = useState<string | null>(null);
  
  // 🚩 ADD: Feature flag checks
  const custodialOnlyMode = isCustodialOnlyMode();
  const showEmbeddedUI = shouldShowEmbeddedWalletUI();
  const walletMode = getWalletMode();
  
  // Get token symbol based on currentToken
  const tokenSymbol = currentToken;
  
  const { user } = usePrivy();
  const { currentUser } = useContext(UserContext);
  
  const modalRef = useRef<HTMLDivElement>(null);
  
  // 🚩 CORRECTED: Get custodial deposit info using your actual API
  const fetchCustodialDepositInfo = useCallback(async () => {
    if (!custodialOnlyMode || !userId) return;
    
    setFetchingDepositInfo(true);
    setDepositError(null);
    
    try {
      console.log('🏦 Fetching custodial deposit info for user:', userId);
      
      const response = await fetch('/api/custodial/deposit-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Deposit info API error:', errorText);
        throw new Error(`Failed to get deposit info: ${response.status}`);
      }
      
      const data: CustodialDepositResponse = await response.json();
      
      if (data.success) {
        setCustodialDepositInfo(data);
        console.log('✅ Custodial deposit info received:', data.depositAddress);
      } else {
        throw new Error('API returned success: false');
      }
    } catch (error) {
      console.error('❌ Failed to fetch custodial deposit info:', error);
      setDepositError(error instanceof Error ? error.message : 'Failed to get deposit information');
    } finally {
      setFetchingDepositInfo(false);
    }
  }, [custodialOnlyMode, userId]);
  
  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCopied(false);
      setShowQR(false);
      setIsLoading(false);
      setDepositError(null);
      setCustodialDepositInfo(null);
      
      // 🚩 ADD: Fetch custodial deposit info if needed
      if (custodialOnlyMode && userId) {
        fetchCustodialDepositInfo();
      }
    }
  }, [isOpen, custodialOnlyMode, userId, fetchCustodialDepositInfo]);
  
  // Handle outside clicks
  useOutsideClick(modalRef as React.RefObject<HTMLElement>, () => {
    if (isOpen && !isLoading && !fetchingDepositInfo) onClose();
  });
  
  // If not open, don't render
  if (!isOpen) return null;
  
  // 🚩 CORRECTED: Dynamic address based on mode and API response
  const displayAddress = custodialOnlyMode && custodialDepositInfo 
    ? custodialDepositInfo.depositAddress // Use the address from your API
    : walletAddress;
  
  // Copy wallet address to clipboard
  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(displayAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      console.log('📋 Address copied:', displayAddress.slice(0, 8) + '...');
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  // Handle deposit confirmation (for UI purposes)
  const handleDepositConfirmation = () => {
    setIsLoading(true);
    
    // Simulate checking for deposit
    setTimeout(() => {
      setIsLoading(false);
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    }, 3000);
  };

  // 🚩 CORRECTED: Dynamic network info based on mode and API data
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
    
    // Default for embedded mode
    const baseInfo = {
      network: currentToken === TokenType.SOL ? 'Solana Mainnet' : 'Solana (SPL Token)',
      minDeposit: currentToken === TokenType.SOL ? '0.001 SOL' : '1 RUGGED',
      maxDeposit: 'No limit',
      confirmations: '1 confirmation',
      depositType: 'Direct Wallet Deposit',
      processingTime: 'Instant'
    };
    
    return baseInfo;
  };

  const networkInfo = getNetworkInfo();
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div 
        ref={modalRef} 
        className="bg-[#0d0d0f] border border-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto"
      >
        {/* 🚩 UPDATE: Header with mode indicator */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-white flex items-center">
            <ArrowUpToLine size={20} className="mr-2" />
            Deposit {tokenSymbol}
            {/* Mode indicator */}
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
        
        {/* 🚩 ADD: Mode explanation */}
        {custodialOnlyMode && (
          <div className="bg-green-900 bg-opacity-20 border border-green-800 text-green-400 p-3 rounded-md mb-4 text-sm">
            <div className="font-medium mb-1">🏦 Custodial Deposit</div>
            <div className="text-xs">
              Send SOL from any wallet to this address. Your game balance will be credited automatically.
            </div>
          </div>
        )}
        
        {/* 🚩 ADD: Loading state for custodial deposit info */}
        {custodialOnlyMode && fetchingDepositInfo && (
          <div className="bg-gray-800 p-4 rounded-md mb-6 text-center">
            <Loader size={24} className="animate-spin text-green-500 mx-auto mb-2" />
            <div className="text-white text-sm">Getting deposit address...</div>
          </div>
        )}
        
        {/* 🚩 ADD: Error state for custodial deposit info */}
        {custodialOnlyMode && depositError && (
          <div className="bg-red-900 bg-opacity-30 border border-red-800 text-red-500 p-3 rounded-md mb-4 text-sm">
            <div className="font-medium mb-1">❌ Error</div>
            <div className="text-xs">{depositError}</div>
            <button
              onClick={fetchCustodialDepositInfo}
              className="mt-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-xs"
            >
              Retry
            </button>
          </div>
        )}
        
        {/* Show content only if we have the address (embedded mode always has it, custodial needs to fetch) */}
        {(!custodialOnlyMode || custodialDepositInfo) && (
          <>
            {/* Network Info */}
            <div className="bg-gray-800 p-4 rounded-md mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">Network:</span>
                <span className="text-white font-medium">{networkInfo.network}</span>
              </div>
              {/* 🚩 ADD: Deposit type info */}
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">Type:</span>
                <span className="text-white">{networkInfo.depositType}</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">Min Deposit:</span>
                <span className="text-white">{networkInfo.minDeposit}</span>
              </div>
              {networkInfo.maxDeposit && networkInfo.maxDeposit !== 'No limit' && (
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Max Deposit:</span>
                  <span className="text-white">{networkInfo.maxDeposit}</span>
                </div>
              )}
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400">Confirmations:</span>
                <span className="text-white">{networkInfo.confirmations}</span>
              </div>
              {/* 🚩 ADD: Processing time for custodial */}
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Credit Time:</span>
                <span className="text-white">{networkInfo.processingTime}</span>
              </div>
            </div>
            
            {/* Wallet Address Section */}
            <div className="mb-6">
              <label className="block text-gray-300 mb-2 text-sm">
                {/* 🚩 UPDATE: Dynamic label based on mode */}
                {custodialOnlyMode ? 'Send SOL to this Address' : 'Your Deposit Address'}
              </label>
              
              {/* Address Display */}
              <div className="bg-gray-800 p-3 rounded-md mb-3">
                <div className="flex items-center justify-between">
                  <div className="flex-1 mr-2">
                    <div className="text-white font-mono text-sm break-all">
                      {displayAddress}
                    </div>
                  </div>
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
                </div>
              </div>
              
              {/* QR Code Toggle */}
              <div className="flex justify-center mb-4">
                <button
                  onClick={() => setShowQR(!showQR)}
                  className="flex items-center bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors"
                >
                  <QrCode size={16} className="mr-2" />
                  {showQR ? 'Hide QR Code' : 'Show QR Code'}
                </button>
              </div>
              
              {/* QR Code Display */}
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
            </div>
            
            {/* 🚩 CORRECTED: Dynamic important notes based on mode and API data */}
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
                  <li>Deposits will appear after {networkInfo.confirmations}</li>
                  <li>This is your personal wallet address</li>
                  <li>Minimum deposit: {networkInfo.minDeposit}</li>
                  <li>Double-check the address before sending</li>
                </ul>
              )}
            </div>
            
            {/* 🚩 CORRECTED: Custodial-specific instructions from API */}
            {custodialOnlyMode && custodialDepositInfo && (
              <div className="bg-blue-900 bg-opacity-20 border border-blue-800 text-blue-400 p-3 rounded-md mb-6 text-sm">
                <div className="font-medium mb-2">📱 How to Send:</div>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  {custodialDepositInfo.instructions.map((instruction, index) => (
                    <li key={index}>{instruction}</li>
                  ))}
                </ol>
              </div>
            )}
            
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
            
            {/* 🚩 CORRECTED: Explorer link from API response */}
            {custodialOnlyMode && custodialDepositInfo?.explorerUrl && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => window.open(custodialDepositInfo.explorerUrl, '_blank')}
                  className="text-blue-400 hover:text-blue-300 text-sm flex items-center justify-center mx-auto"
                >
                  <ExternalLink size={14} className="mr-1" />
                  View Address on Explorer
                </button>
              </div>
            )}
          </>
        )}
        
        {/* Loading State Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
            <div className="bg-gray-800 p-4 rounded-lg text-center">
              <Loader size={32} className="animate-spin text-green-500 mx-auto mb-2" />
              <div className="text-white font-medium">Checking for deposit...</div>
              <div className="text-gray-400 text-sm">This may take a few moments</div>
            </div>
          </div>
        )}
        
        {/* 🚩 ADD: Debug info */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-4 bg-gray-900 p-2 rounded text-xs">
            <div className="text-gray-400 font-bold mb-1">🔍 Debug Info:</div>
            <div className="text-purple-400">Mode: {walletMode}</div>
            <div className="text-cyan-400">Custodial Only: {custodialOnlyMode ? 'Yes' : 'No'}</div>
            <div className="text-green-400">UserId: {userId || 'None'}</div>
            <div className="text-blue-400">Display Address: {displayAddress?.slice(0, 8) + '...' || 'None'}</div>
            <div className="text-yellow-400">Has Custodial Info: {custodialDepositInfo ? 'Yes' : 'No'}</div>
            <div className="text-pink-400">API House Address: {custodialDepositInfo?.depositAddress?.slice(0, 8) + '...' || 'None'}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DepositModal;