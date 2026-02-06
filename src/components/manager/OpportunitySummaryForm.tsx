import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, Save, TrendingUp, Users, UserCheck, Banknote, 
  Clock, CheckCircle2, Loader2 
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { format } from 'date-fns';

interface OpportunitySummaryFormProps {
  onBack: () => void;
}

export function OpportunitySummaryForm({ onBack }: OpportunitySummaryFormProps) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const [totalRentRequested, setTotalRentRequested] = useState('');
  const [totalRequests, setTotalRequests] = useState('');
  const [totalLandlords, setTotalLandlords] = useState('');
  const [totalAgents, setTotalAgents] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchExisting();
  }, []);

  const fetchExisting = async () => {
    try {
      const { data, error } = await supabase
        .from('opportunity_summaries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setExistingId(data.id);
        setTotalRentRequested(String(data.total_rent_requested));
        setTotalRequests(String(data.total_requests));
        setTotalLandlords(String(data.total_landlords));
        setTotalAgents(String(data.total_agents));
        setNotes(data.notes || '');
        setLastUpdated(data.updated_at);
      }
    } catch (e) {
      console.error('Failed to fetch existing summary:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setSaving(true);
    try {
      const payload = {
        total_rent_requested: Number(totalRentRequested) || 0,
        total_requests: Number(totalRequests) || 0,
        total_landlords: Number(totalLandlords) || 0,
        total_agents: Number(totalAgents) || 0,
        notes: notes || null,
        posted_by: user.id,
        updated_at: new Date().toISOString(),
      };

      if (existingId) {
        const { error } = await supabase
          .from('opportunity_summaries')
          .update(payload)
          .eq('id', existingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('opportunity_summaries')
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        if (data) setExistingId(data.id);
      }

      setLastUpdated(new Date().toISOString());
      toast({
        title: '✅ Summary Updated',
        description: 'All supporters will now see the updated opportunity data.',
      });
    } catch (e: any) {
      toast({
        title: 'Error saving',
        description: e.message || 'Failed to save opportunity summary',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const fields = [
    {
      icon: Banknote,
      label: 'Total Rent Requested (UGX)',
      value: totalRentRequested,
      onChange: setTotalRentRequested,
      placeholder: 'e.g. 50000000',
      type: 'number',
      preview: totalRentRequested ? formatUGX(Number(totalRentRequested)) : null,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      icon: TrendingUp,
      label: 'Total Number of Requests',
      value: totalRequests,
      onChange: setTotalRequests,
      placeholder: 'e.g. 120',
      type: 'number',
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      icon: Users,
      label: 'Total Number of Landlords',
      value: totalLandlords,
      onChange: setTotalLandlords,
      placeholder: 'e.g. 45',
      type: 'number',
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      icon: UserCheck,
      label: 'Total Agents Who Onboarded Tenants',
      value: totalAgents,
      onChange: setTotalAgents,
      placeholder: 'e.g. 30',
      type: 'number',
      color: 'text-accent-foreground',
      bgColor: 'bg-accent/50',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-foreground">Opportunity Summary</h2>
          <p className="text-xs text-muted-foreground">
            Update the data shown to all supporters
          </p>
        </div>
        {lastUpdated && (
          <Badge variant="outline" className="text-[10px] gap-1">
            <Clock className="h-3 w-3" />
            {format(new Date(lastUpdated), 'MMM d, HH:mm')}
          </Badge>
        )}
      </div>

      {/* Form Fields */}
      <div className="space-y-3">
        {fields.map((field, index) => (
          <motion.div
            key={field.label}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="border-0 bg-muted/30">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${field.bgColor}`}>
                    <field.icon className={`h-4 w-4 ${field.color}`} />
                  </div>
                  <Label className="text-sm font-semibold">{field.label}</Label>
                </div>
                <Input
                  type={field.type}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  placeholder={field.placeholder}
                  className="text-lg font-bold"
                />
                {field.preview && (
                  <p className="text-xs text-muted-foreground">
                    Formatted: <span className="font-semibold text-foreground">{field.preview}</span>
                  </p>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}

        {/* Notes */}
        <Card className="border-0 bg-muted/30">
          <CardContent className="p-4 space-y-2">
            <Label className="text-sm font-semibold">Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes for supporters..."
              rows={3}
            />
          </CardContent>
        </Card>
      </div>

      {/* Preview Card */}
      <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/10 to-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Preview — What Supporters Will See
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-2xl font-black text-primary">
            {totalRentRequested ? formatUGX(Number(totalRentRequested)) : 'UGX 0'}
          </p>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{totalRequests || 0} requests</span>
            <span>•</span>
            <span>{totalLandlords || 0} landlords</span>
            <span>•</span>
            <span>{totalAgents || 0} agents</span>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <Button
        onClick={handleSave}
        disabled={saving}
        size="xl"
        className="w-full font-bold text-base"
      >
        {saving ? (
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
        ) : (
          <Save className="h-5 w-5 mr-2" />
        )}
        {existingId ? 'Update & Publish to Supporters' : 'Publish to Supporters'}
      </Button>
    </motion.div>
  );
}
