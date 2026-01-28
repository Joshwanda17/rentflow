import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useConfetti } from '@/components/Confetti';
import { Search, User, Loader2, Sparkles, CheckCircle, MessageCircle, Copy, ExternalLink } from 'lucide-react';
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

interface CreatedAccountInfo {
  accountId: string;
  accountName: string;
  supporterName: string;
  supporterPhone: string;
  activationLink: string;
}

const COLORS = [
  { id: 'blue', label: 'Blue', class: 'bg-blue-500' },
  { id: 'green', label: 'Green', class: 'bg-green-500' },
  { id: 'purple', label: 'Purple', class: 'bg-purple-500' },
  { id: 'orange', label: 'Orange', class: 'bg-orange-500' },
  { id: 'pink', label: 'Pink', class: 'bg-pink-500' },
];

const APP_URL = 'https://welile2.lovable.app';

export function CreateInvestmentAccountDialog({ open, onOpenChange, onSuccess }: CreateInvestmentAccountDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('blue');
  const [searchQuery, setSearchQuery] = useState('');
  const [supporters, setSupporters] = useState<SupporterUser[]>([]);
  const [selectedSupporter, setSelectedSupporter] = useState<SupporterUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<CreatedAccountInfo | null>(null);
  const { toast } = useToast();
  const { fireSuccess } = useConfetti();

  useEffect(() => {
    if (open) {
      fetchSupporters();
      setCreatedAccount(null);
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

  const generateActivationLink = (accountId: string) => {
    return `${APP_URL}/dashboard?activate_account=${accountId}`;
  };

  const handleCreate = async () => {
    if (!selectedSupporter || !name.trim()) return;
    
    setCreating(true);
    
    const { data: { user } } = await supabase.auth.getUser();
    
    // Create account with pending_activation status (needs user to activate via link)
    const { data: newAccount, error } = await supabase
      .from('investment_accounts')
      .insert({
        user_id: selectedSupporter.id,
        name: name.trim(),
        color,
        status: 'pending_activation',
        balance: 0
      })
      .select('id')
      .single();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else if (newAccount) {
      const activationLink = generateActivationLink(newAccount.id);
      
      // Notify the supporter
      await supabase.from('notifications').insert({
        user_id: selectedSupporter.id,
        title: '🎉 Investment Account Created!',
        message: `A manager has created an investment account "${name.trim()}" for you. Please activate it using the link shared with you.`,
        type: 'info',
        metadata: { account_id: newAccount.id, account_name: name.trim() }
      });

      fireSuccess();
      
      // Show the share step
      setCreatedAccount({
        accountId: newAccount.id,
        accountName: name.trim(),
        supporterName: selectedSupporter.full_name,
        supporterPhone: selectedSupporter.phone,
        activationLink
      });
      
      toast({ 
        title: '🎉 Account Created!', 
        description: 'Now share the activation link with the supporter' 
      });
      
      onSuccess();
    }
    
    setCreating(false);
  };

  const handleShareWhatsApp = () => {
    if (!createdAccount) return;
    
    const message = `🎉 *Welile Investment Account Created!*\n\nHello ${createdAccount.supporterName},\n\nYour investment account "${createdAccount.accountName}" has been created!\n\n👉 Click here to activate: ${createdAccount.activationLink}\n\nStart investing and earn 15% monthly interest! 💰`;
    
    // Format phone for WhatsApp
    let phone = createdAccount.supporterPhone.replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '256' + phone.slice(1);
    } else if (!phone.startsWith('256')) {
      phone = '256' + phone;
    }
    
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleCopyLink = async () => {
    if (!createdAccount) return;
    
    try {
      await navigator.clipboard.writeText(createdAccount.activationLink);
      toast({ title: '✅ Link Copied!', description: 'Activation link copied to clipboard' });
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy the link manually', variant: 'destructive' });
    }
  };

  const handleClose = () => {
    setName('');
    setColor('blue');
    setSelectedSupporter(null);
    setSearchQuery('');
    setCreatedAccount(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {createdAccount ? 'Share Activation Link' : 'Create Investment Account'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4 flex-1 overflow-hidden flex flex-col">
          {/* Step 3: Share Link (after creation) */}
          {createdAccount ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-success/10 border border-success/30 text-center">
                <CheckCircle className="h-12 w-12 text-success mx-auto mb-3" />
                <h3 className="font-bold text-lg">Account Created Successfully!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Share the activation link with <strong>{createdAccount.supporterName}</strong> to complete setup.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Activation Link</Label>
                <div className="flex gap-2">
                  <Input 
                    value={createdAccount.activationLink} 
                    readOnly 
                    className="text-xs bg-secondary/50"
                  />
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={handleCopyLink}
                    className="shrink-0"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <Button 
                onClick={handleShareWhatsApp}
                className="w-full gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white"
                size="lg"
              >
                <MessageCircle className="h-5 w-5" />
                Share on WhatsApp
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                The account will be activated when {createdAccount.supporterName} opens the link
              </p>
            </div>
          ) : (
            <>
              {/* Step 1: Select Supporter */}
              {!selectedSupporter ? (
                <>
                  <div className="space-y-2">
                    <Label>Select Supporter</Label>
                    <div className="relative transform-none">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        placeholder="Search supporters..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 transform-none"
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
                  <div className="space-y-2 transform-none">
                    <Label htmlFor="account-name">Account Name</Label>
                    <Input
                      id="account-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., Rent Portfolio, High Yield..."
                      className="bg-secondary/50 transform-none transition-none"
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
            </>
          )}
        </div>

        <DialogFooter>
          {createdAccount ? (
            <Button onClick={handleClose}>
              Done
            </Button>
          ) : (
            <>
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
                      Create & Share
                    </>
                  )}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
