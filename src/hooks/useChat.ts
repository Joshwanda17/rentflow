import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[];
  hasReacted: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
  sender?: {
    full_name: string;
    avatar_url: string | null;
    roles: string[];
  };
  reactions?: MessageReaction[];
}

export interface Conversation {
  id: string;
  created_at: string;
  updated_at: string;
  participants: {
    user_id: string;
    full_name: string;
    avatar_url: string | null;
    roles: string[];
  }[];
  last_message?: Message;
  unread_count: number;
}

export function useChat() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    
    // Get all conversations for the user
    const { data: participations } = await supabase
      .from('conversation_participants')
      .select('conversation_id, last_read_at')
      .eq('user_id', user.id);

    if (!participations || participations.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const conversationIds = participations.map(p => p.conversation_id);
    const lastReadMap = new Map(participations.map(p => [p.conversation_id, p.last_read_at]));

    // Get conversation details with participants
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, created_at, updated_at')
      .in('id', conversationIds)
      .order('updated_at', { ascending: false });

    if (!convData) {
      setConversations([]);
      setLoading(false);
      return;
    }

    // Get all participants for these conversations
    const { data: allParticipants } = await supabase
      .from('conversation_participants')
      .select('conversation_id, user_id')
      .in('conversation_id', conversationIds);

    // Get profiles and roles for all participants
    const participantIds = [...new Set(allParticipants?.map(p => p.user_id) || [])];
    
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url').in('id', participantIds),
      supabase.from('user_roles').select('user_id, role').in('user_id', participantIds)
    ]);

    const profilesMap = new Map(profilesRes.data?.map(p => [p.id, p]) || []);
    const rolesMap = new Map<string, string[]>();
    rolesRes.data?.forEach(r => {
      const existing = rolesMap.get(r.user_id) || [];
      rolesMap.set(r.user_id, [...existing, r.role]);
    });

    // Get last message for each conversation
    const lastMessagesPromises = conversationIds.map(async (convId) => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      return { convId, message: data };
    });

    const lastMessages = await Promise.all(lastMessagesPromises);
    const lastMessageMap = new Map(lastMessages.map(lm => [lm.convId, lm.message]));

    // Get unread counts
    const unreadPromises = conversationIds.map(async (convId) => {
      const lastRead = lastReadMap.get(convId);
      let query = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', convId)
        .neq('sender_id', user.id);
      
      if (lastRead) {
        query = query.gt('created_at', lastRead);
      }
      
      const { count } = await query;
      return { convId, count: count || 0 };
    });

    const unreadCounts = await Promise.all(unreadPromises);
    const unreadMap = new Map(unreadCounts.map(u => [u.convId, u.count]));

    // Build conversation objects
    const conversationsWithDetails: Conversation[] = convData.map(conv => {
      const convParticipants = allParticipants?.filter(p => p.conversation_id === conv.id) || [];
      const participants = convParticipants
        .filter(p => p.user_id !== user.id)
        .map(p => {
          const profile = profilesMap.get(p.user_id);
          return {
            user_id: p.user_id,
            full_name: profile?.full_name || 'Unknown',
            avatar_url: profile?.avatar_url || null,
            roles: rolesMap.get(p.user_id) || []
          };
        });

      return {
        id: conv.id,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        participants,
        last_message: lastMessageMap.get(conv.id) || undefined,
        unread_count: unreadMap.get(conv.id) || 0
      };
    });

    setConversations(conversationsWithDetails);
    setLoading(false);
  }, [user]);

  const startConversation = async (otherUserId: string): Promise<string | null> => {
    if (!user) return null;

    // Check if conversation already exists between these two users
    const { data: existingParticipations } = await supabase
      .from('conversation_participants')
      .select('conversation_id')
      .eq('user_id', user.id);

    if (existingParticipations) {
      for (const p of existingParticipations) {
        const { data: otherParticipant } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', p.conversation_id)
          .eq('user_id', otherUserId)
          .single();

        if (otherParticipant) {
          // Conversation exists
          return p.conversation_id;
        }
      }
    }

    // Create new conversation
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert({})
      .select()
      .single();

    if (convError || !newConv) {
      console.error('Failed to create conversation:', convError);
      return null;
    }

    // Add both participants
    const { error: partError } = await supabase
      .from('conversation_participants')
      .insert([
        { conversation_id: newConv.id, user_id: user.id },
        { conversation_id: newConv.id, user_id: otherUserId }
      ]);

    if (partError) {
      console.error('Failed to add participants:', partError);
      return null;
    }

    await fetchConversations();
    return newConv.id;
  };

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    loading,
    fetchConversations,
    startConversation
  };
}

export function useConversation(conversationId: string | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [otherParticipant, setOtherParticipant] = useState<{
    user_id: string;
    full_name: string;
    avatar_url: string | null;
    roles: string[];
  } | null>(null);

  const fetchReactionsForMessages = useCallback(async (messageIds: string[]): Promise<Map<string, MessageReaction[]>> => {
    if (!user || messageIds.length === 0) return new Map();

    const { data: reactionsData } = await supabase
      .from('message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', messageIds);

    const reactionsMap = new Map<string, MessageReaction[]>();

    if (reactionsData) {
      // Group by message_id and emoji
      const grouped = new Map<string, Map<string, string[]>>();
      
      reactionsData.forEach(r => {
        if (!grouped.has(r.message_id)) {
          grouped.set(r.message_id, new Map());
        }
        const emojiMap = grouped.get(r.message_id)!;
        if (!emojiMap.has(r.emoji)) {
          emojiMap.set(r.emoji, []);
        }
        emojiMap.get(r.emoji)!.push(r.user_id);
      });

      grouped.forEach((emojiMap, messageId) => {
        const reactions: MessageReaction[] = [];
        emojiMap.forEach((users, emoji) => {
          reactions.push({
            emoji,
            count: users.length,
            users,
            hasReacted: users.includes(user.id)
          });
        });
        reactionsMap.set(messageId, reactions);
      });
    }

    return reactionsMap;
  }, [user]);

  const fetchMessages = useCallback(async () => {
    if (!conversationId || !user) return;

    setLoading(true);

    // Get messages
    const { data: messagesData } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (messagesData) {
      // Get sender info
      const senderIds = [...new Set(messagesData.map(m => m.sender_id))];
      const messageIds = messagesData.map(m => m.id);
      
      const [profilesRes, rolesRes, reactionsMap] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url').in('id', senderIds),
        supabase.from('user_roles').select('user_id, role').in('user_id', senderIds),
        fetchReactionsForMessages(messageIds)
      ]);

      const profilesMap = new Map(profilesRes.data?.map(p => [p.id, p]) || []);
      const rolesMap = new Map<string, string[]>();
      rolesRes.data?.forEach(r => {
        const existing = rolesMap.get(r.user_id) || [];
        rolesMap.set(r.user_id, [...existing, r.role]);
      });

      const messagesWithSenders = messagesData.map(m => ({
        ...m,
        sender: {
          full_name: profilesMap.get(m.sender_id)?.full_name || 'Unknown',
          avatar_url: profilesMap.get(m.sender_id)?.avatar_url || null,
          roles: rolesMap.get(m.sender_id) || []
        },
        reactions: reactionsMap.get(m.id) || []
      }));

      setMessages(messagesWithSenders);
    }

    // Get other participant
    const { data: participants } = await supabase
      .from('conversation_participants')
      .select('user_id')
      .eq('conversation_id', conversationId)
      .neq('user_id', user.id);

    if (participants && participants.length > 0) {
      const otherId = participants[0].user_id;
      const [profileRes, rolesRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url').eq('id', otherId).single(),
        supabase.from('user_roles').select('role').eq('user_id', otherId)
      ]);

      if (profileRes.data) {
        setOtherParticipant({
          user_id: otherId,
          full_name: profileRes.data.full_name,
          avatar_url: profileRes.data.avatar_url,
          roles: rolesRes.data?.map(r => r.role) || []
        });
      }
    }

    // Mark as read (both participant timestamp and individual messages)
    await supabase
      .from('conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('user_id', user.id);

    // Mark individual messages as read
    const unreadMessageIds = messagesData
      ?.filter(m => m.sender_id !== user.id && !m.read_at)
      .map(m => m.id) || [];
    
    if (unreadMessageIds.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadMessageIds);
    }

    setLoading(false);
  }, [conversationId, user]);

  const sendMessage = async (content: string) => {
    if (!conversationId || !user || !content.trim()) return false;

    const { error } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: content.trim()
      });

    if (error) {
      console.error('Failed to send message:', error);
      return false;
    }

    return true;
  };

  // Time window for editing/deleting messages (15 minutes)
  const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

  const canEditMessage = (message: Message) => {
    if (message.sender_id !== user?.id) return false;
    const messageTime = new Date(message.created_at).getTime();
    const now = Date.now();
    return now - messageTime < MESSAGE_EDIT_WINDOW_MS;
  };

  const editMessage = async (messageId: string, newContent: string) => {
    if (!user || !newContent.trim()) return false;

    const message = messages.find(m => m.id === messageId);
    if (!message || !canEditMessage(message)) return false;

    const { error } = await supabase
      .from('messages')
      .update({ content: newContent.trim() })
      .eq('id', messageId)
      .eq('sender_id', user.id);

    if (error) {
      console.error('Failed to edit message:', error);
      return false;
    }

    // Update local state immediately
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, content: newContent.trim() } : m
    ));

    return true;
  };

  const deleteMessage = async (messageId: string) => {
    if (!user) return false;

    const message = messages.find(m => m.id === messageId);
    if (!message || !canEditMessage(message)) return false;

    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('id', messageId)
      .eq('sender_id', user.id);

    if (error) {
      console.error('Failed to delete message:', error);
      return false;
    }

    // Update local state immediately
    setMessages(prev => prev.filter(m => m.id !== messageId));

    return true;
  };

  // Mark a specific message as read
  const markMessageAsRead = async (messageId: string) => {
    if (!user) return;
    
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('id', messageId)
      .is('read_at', null);
  };

  // Mark all unread messages from others as read
  const markAllAsRead = useCallback(async () => {
    if (!conversationId || !user) return;
    
    const { data: unreadMessages } = await supabase
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .neq('sender_id', user.id)
      .is('read_at', null);
    
    if (unreadMessages && unreadMessages.length > 0) {
      await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unreadMessages.map(m => m.id));
    }
  }, [conversationId, user]);

  // Real-time subscription for new messages and updates
  useEffect(() => {
    if (!conversationId || !user) return;

    fetchMessages();

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        async (payload) => {
          const newMessage = payload.new as Message;
          
          // Get sender info
          const [profileRes, rolesRes] = await Promise.all([
            supabase.from('profiles').select('id, full_name, avatar_url').eq('id', newMessage.sender_id).single(),
            supabase.from('user_roles').select('role').eq('user_id', newMessage.sender_id)
          ]);

          const messageWithSender: Message = {
            ...newMessage,
            sender: {
              full_name: profileRes.data?.full_name || 'Unknown',
              avatar_url: profileRes.data?.avatar_url || null,
              roles: rolesRes.data?.map(r => r.role) || []
            }
          };

          setMessages(prev => [...prev, messageWithSender]);

          // Mark as read if not sender
          if (newMessage.sender_id !== user.id) {
            await markMessageAsRead(newMessage.id);
            await supabase
              .from('conversation_participants')
              .update({ last_read_at: new Date().toISOString() })
              .eq('conversation_id', conversationId)
              .eq('user_id', user.id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const updatedMessage = payload.new as Message;
          setMessages(prev => prev.map(m => 
            m.id === updatedMessage.id ? { ...m, read_at: updatedMessage.read_at } : m
          ));
        }
      )
      .subscribe();

    // Reactions channel for real-time updates
    const messageIds = messages.map(m => m.id);
    const reactionsChannel = supabase
      .channel(`reactions-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions'
        },
        async (payload) => {
          // Refresh reactions when any change happens
          const messageId = (payload.new as any)?.message_id || (payload.old as any)?.message_id;
          if (messageId) {
            const reactionsMap = await fetchReactionsForMessages([messageId]);
            setMessages(prev => prev.map(m => 
              m.id === messageId ? { ...m, reactions: reactionsMap.get(messageId) || [] } : m
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(reactionsChannel);
    };
  }, [conversationId, user, fetchMessages, fetchReactionsForMessages]);

  // Typing indicator state
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  // Broadcast typing status
  const sendTypingIndicator = useCallback((typing: boolean) => {
    if (!conversationId || !user) return;

    const channel = supabase.channel(`typing-${conversationId}`);
    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: user.id, typing }
    });
  }, [conversationId, user]);

  // Typing timeout ref
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced typing handler
  const handleTyping = useCallback(() => {
    if (!isTyping) {
      setIsTyping(true);
      sendTypingIndicator(true);
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      sendTypingIndicator(false);
    }, 2000);
  }, [isTyping, sendTypingIndicator]);

  // Subscribe to typing events
  useEffect(() => {
    if (!conversationId || !user) return;

    const channel = supabase
      .channel(`typing-${conversationId}`)
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { user_id, typing } = payload.payload as { user_id: string; typing: boolean };
        if (user_id === user.id) return;

        setTypingUsers(prev => {
          if (typing && !prev.includes(user_id)) {
            return [...prev, user_id];
          } else if (!typing) {
            return prev.filter(id => id !== user_id);
          }
          return prev;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, user]);

  return {
    messages,
    loading,
    otherParticipant,
    sendMessage,
    fetchMessages,
    handleTyping,
    typingUsers,
    markAllAsRead,
    editMessage,
    deleteMessage,
    canEditMessage
  };
}
