// utils/featureFlags.ts
export const FEATURE_FLAGS = {
    EMBEDDED_WALLETS_ENABLED: process.env.NEXT_PUBLIC_ENABLE_EMBEDDED_WALLETS === 'true',
    CUSTODIAL_ONLY_MODE: process.env.NEXT_PUBLIC_CUSTODIAL_ONLY_MODE === 'true',
    HYBRID_SYSTEM_ENABLED: process.env.NEXT_PUBLIC_ENABLE_HYBRID_SYSTEM === 'true',
    
    // Granular controls for specific endpoints
    PRIVY_TO_CUSTODIAL_ENABLED: process.env.NEXT_PUBLIC_ENABLE_PRIVY_TO_CUSTODIAL === 'true',
    CUSTODIAL_TO_PRIVY_ENABLED: process.env.NEXT_PUBLIC_ENABLE_CUSTODIAL_TO_PRIVY === 'true',
    PRIVY_WITHDRAWALS_ENABLED: process.env.NEXT_PUBLIC_ENABLE_PRIVY_WITHDRAWALS === 'true',
    
    // Debug settings
    DEBUG_MODE: process.env.NEXT_PUBLIC_DEBUG_MODE === 'true'
  };
  
  export function isEmbeddedWalletsEnabled(): boolean {
    return FEATURE_FLAGS.EMBEDDED_WALLETS_ENABLED && !FEATURE_FLAGS.CUSTODIAL_ONLY_MODE;
  }
  
  export function isCustodialOnlyMode(): boolean {
    return FEATURE_FLAGS.CUSTODIAL_ONLY_MODE || !FEATURE_FLAGS.HYBRID_SYSTEM_ENABLED;
  }
  
  export function shouldShowEmbeddedWalletUI(): boolean {
    return isEmbeddedWalletsEnabled() && FEATURE_FLAGS.HYBRID_SYSTEM_ENABLED;
  }
  
  export function shouldShowTransferButtons(): boolean {
    return shouldShowEmbeddedWalletUI() && 
           (FEATURE_FLAGS.PRIVY_TO_CUSTODIAL_ENABLED || FEATURE_FLAGS.CUSTODIAL_TO_PRIVY_ENABLED);
  }
  
  export function getWalletMode(): 'custodial' | 'hybrid' | 'embedded' {
    if (FEATURE_FLAGS.CUSTODIAL_ONLY_MODE) return 'custodial';
    if (FEATURE_FLAGS.HYBRID_SYSTEM_ENABLED) return 'hybrid';
    return 'embedded';
  }
  
  // Logging for debugging
  export function logFeatureFlags() {
    if (FEATURE_FLAGS.DEBUG_MODE) {
      console.log('🚩 Feature Flags Status:', {
        mode: getWalletMode(),
        embeddedWalletsEnabled: isEmbeddedWalletsEnabled(),
        custodialOnlyMode: isCustodialOnlyMode(),
        showEmbeddedUI: shouldShowEmbeddedWalletUI(),
        showTransferButtons: shouldShowTransferButtons(),
        rawFlags: FEATURE_FLAGS
      });
    }
  }
  
  // Helper function to get user-friendly mode description
  export function getModeDescription(): string {
    const mode = getWalletMode();
    switch (mode) {
      case 'custodial':
        return 'Custodial Mode - Instant gameplay, easy deposits and withdrawals';
      case 'hybrid':
        return 'Hybrid Mode - Embedded wallets with custodial gaming balance';
      case 'embedded':
        return 'Embedded Mode - Privy embedded wallets only';
      default:
        return 'Unknown Mode';
    }
  }