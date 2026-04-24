/**
 * CapabilityGate — render children only if the current agent holds the
 * required capability (or any of `anyOf`). Optional `fallback` is shown
 * while loading or when access is denied.
 */
import type { ReactNode } from 'react';
import { useAgentCapabilities, type Capability } from '@/hooks/useAgentCapabilities';

interface CapabilityGateProps {
  capability?: Capability;
  anyOf?: Capability[];
  fallback?: ReactNode;
  children: ReactNode;
}

export function CapabilityGate({ capability, anyOf, fallback = null, children }: CapabilityGateProps) {
  const { has, isLoading } = useAgentCapabilities();
  if (isLoading) return <>{fallback}</>;
  const allowed = capability ? has(capability) : (anyOf?.some(has) ?? false);
  return <>{allowed ? children : fallback}</>;
}