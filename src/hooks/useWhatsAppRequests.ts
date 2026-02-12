import { useState } from 'react';
import { toast } from 'sonner';

export interface WhatsAppRequest {
  id: string;
  requester_id: string;
  target_user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  message: string | null;
  created_at: string;
  responded_at: string | null;
  requester?: {
    full_name: string;
    avatar_url: string | null;
    phone: string;
  };
  target?: {
    full_name: string;
    avatar_url: string | null;
    phone: string;
  };
}

// whatsapp_requests table removed - stub hook
export function useWhatsAppRequests() {
  return {
    incomingRequests: [] as WhatsAppRequest[],
    outgoingRequests: [] as WhatsAppRequest[],
    loading: false,
    sendRequest: async () => { toast.info('Feature not available'); return false; },
    respondToRequest: async () => false,
    getRequestStatus: () => 'none' as const,
    getApprovedPhone: () => null,
    refreshRequests: async () => {},
    pendingIncomingCount: 0
  };
}
