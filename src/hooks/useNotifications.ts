import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export function useNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Listen for incoming wallet transactions
    const walletChannel = supabase
      .channel('wallet-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'wallet_transactions',
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          const transaction = payload.new as {
            amount: number;
            sender_id: string;
            description: string | null;
          };

          // Fetch sender name
          const { data: senderProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', transaction.sender_id)
            .maybeSingle();

          const senderName = senderProfile?.full_name || 'Someone';
          const amount = new Intl.NumberFormat('en-UG', {
            style: 'currency',
            currency: 'UGX',
            minimumFractionDigits: 0,
          }).format(transaction.amount);

          toast.success(`${senderName} sent you ${amount}`, {
            description: transaction.description || 'You received money!',
            duration: 6000,
          });
        }
      )
      .subscribe();

    // Listen for new money requests where current user is the recipient
    const requestChannel = supabase
      .channel('request-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'money_requests',
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          const request = payload.new as {
            amount: number;
            requester_id: string;
            description: string | null;
          };

          // Fetch requester name
          const { data: requesterProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', request.requester_id)
            .maybeSingle();

          const requesterName = requesterProfile?.full_name || 'Someone';
          const amount = new Intl.NumberFormat('en-UG', {
            style: 'currency',
            currency: 'UGX',
            minimumFractionDigits: 0,
          }).format(request.amount);

          toast.info(`${requesterName} requested ${amount}`, {
            description: request.description || 'You have a new money request',
            duration: 6000,
          });
        }
      )
      .subscribe();

    // Listen for request status updates (approved/rejected)
    const requestStatusChannel = supabase
      .channel('request-status-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'money_requests',
          filter: `requester_id=eq.${user.id}`,
        },
        async (payload) => {
          const request = payload.new as {
            amount: number;
            recipient_id: string;
            status: string;
          };

          if (request.status === 'pending') return;

          // Fetch recipient name
          const { data: recipientProfile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', request.recipient_id)
            .maybeSingle();

          const recipientName = recipientProfile?.full_name || 'Someone';
          const amount = new Intl.NumberFormat('en-UG', {
            style: 'currency',
            currency: 'UGX',
            minimumFractionDigits: 0,
          }).format(request.amount);

          if (request.status === 'approved') {
            toast.success(`${recipientName} approved your ${amount} request`, {
              description: 'The money has been sent to your wallet!',
              duration: 6000,
            });
          } else if (request.status === 'rejected') {
            toast.error(`${recipientName} declined your ${amount} request`, {
              duration: 6000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(walletChannel);
      supabase.removeChannel(requestChannel);
      supabase.removeChannel(requestStatusChannel);
    };
  }, [user]);
}
