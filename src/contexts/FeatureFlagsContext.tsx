import React, { createContext, useContext, useState, ReactNode } from 'react';

interface FeatureFlags {
  enableWithdrawTenant: boolean;
  enableInternationalTenant: boolean;
  enableInternationalPartner: boolean;
  enableAutoFund: boolean;
  enableBankTransfer: boolean;
  enableCardPayments: boolean;
}

interface FeatureFlagsContextType {
  flags: FeatureFlags;
  setFlag: (key: keyof FeatureFlags, value: boolean) => void;
}

const defaultFlags: FeatureFlags = {
  enableWithdrawTenant: false,
  enableInternationalTenant: true,
  enableInternationalPartner: true,
  enableAutoFund: false,
  enableBankTransfer: true,
  enableCardPayments: true,
};

const FeatureFlagsContext = createContext<FeatureFlagsContextType | undefined>(undefined);

export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(defaultFlags);

  const setFlag = (key: keyof FeatureFlags, value: boolean) => {
    setFlags(prev => ({ ...prev, [key]: value }));
  };

  return (
    <FeatureFlagsContext.Provider value={{ flags, setFlag }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const context = useContext(FeatureFlagsContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within FeatureFlagsProvider');
  }
  return context;
}

interface FeatureFlagProps {
  flag: keyof FeatureFlags;
  children: ReactNode;
  fallback?: ReactNode;
}

export function FeatureFlag({ flag, children, fallback = null }: FeatureFlagProps) {
  const { flags } = useFeatureFlags();
  return flags[flag] ? <>{children}</> : <>{fallback}</>;
}
