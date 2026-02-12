import { useState, useCallback } from 'react';

// AI Brain tables removed - stub hook
export function useAIBrain() {
  return {
    recommendations: [],
    sessions: [],
    stats: null,
    loading: false,
    triggeringAI: false,
    fetchRecommendations: async () => {},
    fetchSessions: async () => {},
    approveRecommendation: async () => ({ error: null }),
    rejectRecommendation: async () => ({ error: null }),
    triggerAIAnalysis: async () => {},
    refreshAll: async () => {},
  };
}
