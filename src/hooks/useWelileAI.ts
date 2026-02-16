import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/welile-ai-chat`;

export function useWelileAI() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Load chat history on mount
  useEffect(() => {
    if (!user || historyLoaded) return;
    (async () => {
      const { data } = await supabase
        .from('ai_chat_messages')
        .select('id, role, content, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(50);
      if (data && data.length > 0) {
        setMessages(data as AIChatMessage[]);
      }
      setHistoryLoaded(true);
    })();
  }, [user, historyLoaded]);

  const sendMessage = useCallback(async (input: string) => {
    if (!user || !input.trim() || isLoading) return;

    const userMsg: AIChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);

    // Build messages for API (last 20 for context window)
    const recentMessages = [...messages.slice(-18), userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    let assistantContent = '';
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messages: recentMessages }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Failed' }));
        throw new Error(err.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantContent += content;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant' && last.id === 'streaming') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { id: 'streaming', role: 'assistant', content: assistantContent, created_at: new Date().toISOString() }];
              });
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Finalize message with real ID and save to DB
      const finalId = crypto.randomUUID();
      setMessages(prev => prev.map(m => m.id === 'streaming' ? { ...m, id: finalId } : m));

      if (assistantContent) {
        await supabase.from('ai_chat_messages').insert({
          user_id: user.id,
          role: 'assistant',
          content: assistantContent,
        });
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.error('Welile AI error:', e);
      toast.error(e.message || 'Failed to get AI response');
      // Remove the streaming message on error
      setMessages(prev => prev.filter(m => m.id !== 'streaming'));
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [user, messages, isLoading]);

  const clearHistory = useCallback(async () => {
    if (!user) return;
    await supabase.from('ai_chat_messages').delete().eq('user_id', user.id);
    setMessages([]);
  }, [user]);

  const cancelStream = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
  }, []);

  return { messages, isLoading, sendMessage, clearHistory, cancelStream, historyLoaded };
}
