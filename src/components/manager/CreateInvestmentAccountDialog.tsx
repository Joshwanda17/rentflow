import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useConfetti } from '@/components/Confetti';
import { Search, User, Loader2, Sparkles, CheckCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CreateInvestmentAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface SupporterUser {
  id: string;
  full_name: string;
  email: string;
  phone: string;
}

const COLORS = [
  { id: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { id: 'green', label: 'Green', class: 'bg-green-500' },
  { id: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { id: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { id: 'pink', label: 'Pink', class: 'bg-pink-500' },
];

export function CreateInvestmentAccountDialog({ open, onOpenChange, onSuccess }: CreateInvestmentAccountDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [searchQuery, setSearchQuery] = useState('');
  const [supporters, setSupporters] = useState<SupporterUser[]>([]);
  const [selectedSupporter, setSelectedSupporter] = useState<SupporterUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();

  useEffect(() => {
    if (open) {
      fetchSupporters();
    }
  }, [open]);

  const fetchSupporters = async () => {
    setLoading(true);
    
    // Get all users with supporter role
    const { data: supporterRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'supporter')
      .eq('enabled', true);

    if (rolesError) {
      toast({ title: 'Error', description: rolesError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const userIds = supporterRoles?.map(r => r.user_id) || [];
    
    if (userIds.length === 0) {
      setSupporters([]);
      setLoading(false);
      return;
    }

    // Get profiles for supporters
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, full_name, email, phone')
      .in('id', userIds);

    if (profilesError) {
      toast({ title: 'Error', description: profilesError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    setSupporters(profiles || []);
    setLoading(false);
  };

  const filteredSupporters = supporters.filter(s =>
    s.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.phone.includes(searchQuery)
  );

  const handleCreate = async () => {
    if (!selectedSupporter || !name.trim()) return;
    
    setCreating(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    // Create account with approved status (manager-created accounts are auto-approved)
    const { error } = await supabase
      .from('investment_accounts')
      .insert({
        user_id: selectedSupporter.id,
        name: name.trim(),
        color,
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: user?.id,
        balance: 0
      });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      // Notify the supporter
      await supabase.from('notifications').insert({
        user_id: selectedSupporter.id,
        title: '🎉 New Investment Account Created!',
        message: `A manager has created an investment account "${name.trim()}" for you. You can start investing now!`,
        type: 'success',
        metadata: { account_name: name.trim() }
      });

      fireSuccess();
      toast({ 
        title: '🎉 Account Created!', 
        description: `Investment account created for ${selectedSupporter.full_name}` 
      });
      
      // Reset form
      setName('');
      setColor('blue');
      setSelectedSupporter(null);
      setSearchQuery('');
      onOpenChange(false);
      onSuccess();
    }
    
    setCreating(false);
  };

  const handleClose = () => {
    setName('');
    setColor('blue');
    setSelectedSupporter(null);
    setSearchQuery('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create Investment Account
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
          {/* Step 1: Select Supporter */}
          {!selectedSupporter ? (
            <>
              <div className="space-y-2">
                <Label>Select Supporter</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search supporters..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <ScrollArea className="flex-1 min-h-0 max-h-[300px]">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredSupporters.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No supporters found</p>
                  </div>
                ) : (
                  <div className="space-y-2 pr-4">
                    {filteredSupporters.map((supporter) => (
                      <button
                        key={supporter.id}
                        onClick={() => setSelectedSupporter(supporter)}
                        className="w-full p-3 rounded-lg border bg-card hover:bg-accent text-left transition-colors touch-manipulation active:scale-[0.98]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{supporter.full_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{supporter.phone}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          ) : (
            <>
              {/* Selected Supporter Card */}
              <div className="p-3 rounded-lg border bg-success/5 border-success/30">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-success" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{selectedSupporter.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{selectedSupporter.phone}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedSupporter(null)}
                  >
                    Change
                  </Button>
                </div>
              </div>

              {/* Step 2: Account Details */}
              <div className="space-y-2">
                <Label htmlFor="account-name">Account Name</Label>
                <Input
                  id="account-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Rent Portfolio, High Yield..."
                  className="bg-secondary/50"
                />
              </div>

              <div className="space-y-2">
                <Label>Account Color</Label>
                <RadioGroup value={color} onValueChange={setColor} className="flex gap-3">
                  {COLORS.map((c) => (
                    <div key={c.id} className="flex items-center">
                      <RadioGroupItem value={c.id} id={`color-${c.id}`} className="sr-only" />
                      <Label
                        htmlFor={`color-${c.id}`}
                        className={`w-8 h-8 rounded-full cursor-pointer ring-2 ring-offset-2 ring-offset-background transition-all ${c.class} ${
                          color === c.id ? 'ring-foreground' : 'ring-transparent hover:ring-muted-foreground/50'
                        }`}
                      />
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {selectedSupporter && (
            <Button 
              onClick={handleCreate} 
              disabled={!name.trim() || creating}
              className="gap-2"
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Create Account
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
