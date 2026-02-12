import { useState } from 'react';

export interface OpportunitySummary {
  id: string;
  total_rent_requested: number;
  total_requests: number;
  total_landlords: number;
  total_agents: number;
  notes: string | null;
  posted_by: string;
  created_at: string;
  updated_at: string;
}

// opportunity_summaries table removed - stub hook
export function useOpportunitySummary() {
  return { summary: null, loading: false, refetch: async () => {} };
}
