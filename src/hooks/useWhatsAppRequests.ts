import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
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

export function useWhatsAppRequests() {
  const { user } = useAuth();
  const [incomingRequests, setIncomingRequests] = useState<WhatsAppRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<WhatsAppRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    if (!user) return;

    setLoading(true);

    // Fetch incoming requests (where I'm the target)
    const { data: incoming } = await supabase
      .from('whatsapp_requests')
      .select('*')
      .eq('target_user_id', user.id)
      .order('created_at', { ascending: false });

    // Fetch outgoing requests (where I'm the requester)
    const { data: outgoing } = await supabase
      .from('whatsapp_requests')
      .select('*')
      .eq('requester_id', user.id)
      .order('created_at', { ascending: false });

    // Get all user IDs to fetch profiles
    const allUserIds = new Set<string>();
    incoming?.forEach(r => allUserIds.add(r.requester_id));
    outgoing?.forEach(r => allUserIds.add(r.target_user_id));

    if (allUserIds.size > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, phone')
        .in('id', Array.from(allUserIds));

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      setIncomingRequests((incoming || []).map(r => ({
        ...r,
        requester: profileMap.get(r.requester_id)
      })) as WhatsAppRequest[]);

      setOutgoingRequests((outgoing || []).map(r => ({
        ...r,
        target: profileMap.get(r.target_user_id)
      })) as WhatsAppRequest[]);
    } else {
      setIncomingRequests([]);
      setOutgoingRequests([]);
    }

    setLoading(false);
  }, [user]);

  const sendRequest = async (targetUserId: string, message?: string): Promise<boolean> => {
    if (!user) return false;

    // Check if request already exists
    const existing = outgoingRequests.find(r => r.target_user_id === targetUserId);
    if (existing) {
      if (existing.status === 'pending') {
        toast.info('Request already sent', { description: 'Waiting for response' });
        return false;
      } else if (existing.status === 'approved') {
        toast.info('Already approved!', { description: 'You can contact them on WhatsApp' });
        return true;
      }
    }

    const { error } = await supabase
      .from('whatsapp_requests')
      .upsert({
        requester_id: user.id,
        target_user_id: targetUserId,
        message: message || null,
        status: 'pending'
      }, { onConflict: 'requester_id,target_user_id' });

    if (error) {
      console.error('Failed to send WhatsApp request:', error);
      toast.error('Failed to send request');
      return false;
    }

    toast.success('Request sent!', {
      description: 'They will be notified to approve your WhatsApp contact'
    });
    
    await fetchRequests();
    return true;
  };

  const respondToRequest = async (requestId: string, approve: boolean): Promise<boolean> => {
    if (!user) return false;

    const { error } = await supabase
      .from('whatsapp_requests')
      .update({ status: approve ? 'approved' : 'rejected' })
      .eq('id', requestId)
      .eq('target_user_id', user.id);

    if (error) {
      console.error('Failed to respond to request:', error);
      toast.error('Failed to respond');
      return false;
    }

    toast.success(approve ? 'Request approved!' : 'Request declined');
    await fetchRequests();
    return true;
  };

  const getRequestStatus = (targetUserId: string): 'none' | 'pending' | 'approved' | 'rejected' => {
    const request = outgoingRequests.find(r => r.target_user_id === targetUserId);
    return request?.status || 'none';
  };

  const getApprovedPhone = (targetUserId: string): string | null => {
    const request = outgoingRequests.find(r => r.target_user_id === targetUserId && r.status === 'approved');
    return request?.target?.phone || null;
  };

  useEffect(() => {
    fetchRequests();

    // Subscribe to realtime updates
    if (user) {
      const channel = supabase
        .channel('whatsapp-requests')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'whatsapp_requests',
            filter: `target_user_id=eq.${user.id}`
          },
          () => fetchRequests()
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'whatsapp_requests',
            filter: `requester_id=eq.${user.id}`
          },
          () => fetchRequests()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, fetchRequests]);

  return {
    incomingRequests,
    outgoingRequests,
    loading,
    sendRequest,
    respondToRequest,
    getRequestStatus,
    getApprovedPhone,
    refreshRequests: fetchRequests,
    pendingIncomingCount: incomingRequests.filter(r => r.status === 'pending').length
  };
}
