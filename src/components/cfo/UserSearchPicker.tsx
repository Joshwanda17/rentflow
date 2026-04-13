import { useState, useEffect, forwardRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Search, X, User, AlertCircle } from 'lucide-react';

interface UserResult {
  id: string;
  full_name: string;
  phone: string;
}

interface UserSearchPickerProps {
  label: string;
  placeholder?: string;
  selectedUser: UserResult | null;
  onSelect: (user: UserResult | null) => void;
  roleFilter?: string;
}

export const UserSearchPicker = forwardRef<HTMLDivElement, UserSearchPickerProps>(
  function UserSearchPicker({ label, placeholder = 'Search by name or phone...', selectedUser, onSelect, roleFilter }, ref) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<UserResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    useEffect(() => {
      if (query.length < 2) {
        setResults([]);
        setSearchError(null);
        return;
      }

      const timer = setTimeout(async () => {
        setLoading(true);
        setSearchError(null);

        try {
          const cleaned = query.replace(/\D/g, '');
          const isPhone = cleaned.length >= 3;

          if (roleFilter) {
            let q = supabase.from('profiles').select('id, full_name, phone').limit(50);
            if (isPhone) {
              q = q.ilike('phone', `%${cleaned.slice(-9)}%`);
            } else {
              q = q.ilike('full_name', `%${query}%`);
            }

            const { data: profiles, error: profilesError } = await q;
            if (profilesError) {
              console.error('[UserSearchPicker] profile search failed:', profilesError);
              setResults([]);
              setSearchError('You do not have permission to search users here.');
              setLoading(false);
              return;
            }

            if (!profiles || profiles.length === 0) {
              setResults([]);
              setLoading(false);
              return;
            }

            const profileIds = profiles.map(p => p.id);
            const batchSize = 50;
            const validIds = new Set<string>();

            for (let i = 0; i < profileIds.length; i += batchSize) {
              const batch = profileIds.slice(i, i + batchSize);
              const { data: roleData, error: roleError } = await supabase
                .from('user_roles')
                .select('user_id')
                .eq('role', roleFilter as any)
                .eq('enabled', true)
                .in('user_id', batch);

              if (roleError) {
                console.error('[UserSearchPicker] role filter failed:', roleError);
                setResults([]);
                setSearchError('User role lookup is blocked right now.');
                setLoading(false);
                return;
              }

              if (roleData) roleData.forEach(r => validIds.add(r.user_id));
            }

            setResults(profiles.filter(p => validIds.has(p.id)).slice(0, 10));
          } else {
            let q = supabase.from('profiles').select('id, full_name, phone').limit(10);
            if (isPhone) {
              q = q.ilike('phone', `%${cleaned.slice(-9)}%`);
            } else {
              q = q.ilike('full_name', `%${query}%`);
            }

            const { data, error } = await q;
            console.log('[UserSearchPicker] query:', query, 'isPhone:', isPhone, 'results:', data?.length, 'error:', error);

            if (error) {
              console.error('[UserSearchPicker] search failed:', error);
              setResults([]);
              setSearchError('You do not have permission to search users here.');
            } else {
              setResults(data || []);
            }
          }
        } catch (error) {
          console.error('[UserSearchPicker] unexpected search failure:', error);
          setResults([]);
          setSearchError('Search failed. Please try again.');
        }

        setLoading(false);
      }, 300);

      return () => clearTimeout(timer);
    }, [query, roleFilter]);

    if (selectedUser) {
      return (
        <div ref={ref}>
          <Label>{label}</Label>
          <div className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30 mt-1">
            <User className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{selectedUser.full_name}</p>
              <p className="text-xs text-muted-foreground">{selectedUser.phone}</p>
            </div>
            <button type="button" onClick={() => onSelect(null)} className="text-muted-foreground hover:text-destructive">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="relative" ref={ref}>
        <Label>{label}</Label>
        <div className="relative mt-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={query}
            onChange={e => { setQuery(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            className="pl-9"
          />
          {loading && <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {showResults && results.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {results.map(u => (
              <button
                key={u.id}
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent transition-colors text-sm"
                onClick={() => { onSelect(u); setQuery(''); setShowResults(false); setSearchError(null); }}
              >
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground">{u.phone}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        {showResults && query.length >= 2 && !loading && searchError && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg p-3 text-center text-xs text-destructive flex items-center justify-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{searchError}</span>
          </div>
        )}
        {showResults && query.length >= 2 && !loading && !searchError && results.length === 0 && (
          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-lg shadow-lg p-3 text-center text-xs text-muted-foreground">
            No users found
          </div>
        )}
      </div>
    );
  }
);
