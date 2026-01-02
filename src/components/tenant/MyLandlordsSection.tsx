import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Building2, User, Phone, MapPin, Banknote, Edit2, Save, X, 
  Plus, Trash2, CheckCircle2, Loader2 
} from 'lucide-react';
import { formatUGX } from '@/lib/rentCalculations';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import RegisterLandlordDialog from './RegisterLandlordDialog';

interface Landlord {
  id: string;
  name: string;
  phone: string;
  property_address: string;
  monthly_rent: number | null;
  mobile_money_number: string | null;
}

export default function MyLandlordsSection() {
  const { user } = useAuth();
  const [landlords, setLandlords] = useState<Landlord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  
  // Edit form state
  const [editForm, setEditForm] = useState<Partial<Landlord>>({});

  useEffect(() => {
    if (user) {
      fetchLandlords();
    }
  }, [user]);

  const fetchLandlords = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('landlords')
      .select('id, name, phone, property_address, monthly_rent, mobile_money_number')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching landlords:', error);
    } else {
      setLandlords(data || []);
    }
    setLoading(false);
  };

  const startEditing = (landlord: Landlord) => {
    setEditingId(landlord.id);
    setEditForm({
      name: landlord.name,
      phone: landlord.phone,
      property_address: landlord.property_address,
      monthly_rent: landlord.monthly_rent,
      mobile_money_number: landlord.mobile_money_number,
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (landlordId: string) => {
    if (!editForm.name?.trim() || !editForm.phone?.trim() || !editForm.property_address?.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setSaving(true);
    
    const { error } = await supabase
      .from('landlords')
      .update({
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        property_address: editForm.property_address.trim(),
        monthly_rent: editForm.monthly_rent || null,
        mobile_money_number: editForm.mobile_money_number?.trim() || null,
      })
      .eq('id', landlordId);

    setSaving(false);

    if (error) {
      toast.error('Failed to update landlord details');
      console.error('Error updating landlord:', error);
      return;
    }

    toast.success('Landlord details updated');
    setEditingId(null);
    setEditForm({});
    fetchLandlords();
  };

  const deleteLandlord = async (landlordId: string) => {
    const { error } = await supabase
      .from('landlords')
      .delete()
      .eq('id', landlordId);

    if (error) {
      toast.error('Failed to delete landlord');
      console.error('Error deleting landlord:', error);
      return;
    }

    toast.success('Landlord removed');
    setLandlords(prev => prev.filter(l => l.id !== landlordId));
  };

  if (loading) {
    return (
      <Card className="glass-card border-border/50 shadow-elevated overflow-hidden">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-32 rounded-lg" />
          <Skeleton className="h-32 rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="glass-card border-border/50 shadow-elevated overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-500/5 pointer-events-none" />
        
        <CardHeader className="relative">
          <CardTitle className="flex items-center gap-2">
            <motion.div
              className="p-2 rounded-lg bg-emerald-500/10"
              whileHover={{ scale: 1.1, rotate: -5 }}
              transition={{ type: 'spring', stiffness: 400, damping: 17 }}
            >
              <Building2 className="h-5 w-5 text-emerald-500" />
            </motion.div>
            My Landlords
          </CardTitle>
          <CardDescription>
            Manage your registered landlord details for rent discounts
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 relative">
          <AnimatePresence mode="popLayout">
            {landlords.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center py-8"
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted/50 flex items-center justify-center">
                  <Building2 className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground mb-4">
                  No landlords registered yet
                </p>
                <Button onClick={() => setShowAddDialog(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Register Your Landlord
                </Button>
              </motion.div>
            ) : (
              <>
                {landlords.map((landlord, index) => (
                  <motion.div
                    key={landlord.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: index * 0.1 }}
                    className="p-4 rounded-xl bg-background/50 border border-border/50"
                  >
                    {editingId === landlord.id ? (
                      // Edit Mode
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs flex items-center gap-1">
                              <User className="h-3 w-3" /> Name
                            </Label>
                            <Input
                              value={editForm.name || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                              placeholder="Landlord name"
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs flex items-center gap-1">
                              <Phone className="h-3 w-3" /> Phone
                            </Label>
                            <Input
                              value={editForm.phone || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                              placeholder="Phone number"
                              className="h-9"
                            />
                          </div>
                        </div>
                        
                        <div className="space-y-1">
                          <Label className="text-xs flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> Property Address
                          </Label>
                          <Input
                            value={editForm.property_address || ''}
                            onChange={(e) => setEditForm(prev => ({ ...prev, property_address: e.target.value }))}
                            placeholder="Property address"
                            className="h-9"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs flex items-center gap-1">
                              <Banknote className="h-3 w-3" /> Monthly Rent (UGX)
                            </Label>
                            <Input
                              type="number"
                              value={editForm.monthly_rent || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, monthly_rent: parseInt(e.target.value) || null }))}
                              placeholder="Monthly rent"
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs flex items-center gap-1">
                              <Phone className="h-3 w-3" /> Mobile Money
                            </Label>
                            <Input
                              value={editForm.mobile_money_number || ''}
                              onChange={(e) => setEditForm(prev => ({ ...prev, mobile_money_number: e.target.value }))}
                              placeholder="Mobile money number"
                              className="h-9"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={cancelEditing}
                            className="flex-1"
                          >
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => saveEdit(landlord.id)}
                            disabled={saving}
                            className="flex-1"
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4 mr-1" />
                            )}
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // View Mode
                      <div>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-500/10">
                              <User className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div>
                              <p className="font-medium">{landlord.name}</p>
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {landlord.phone}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEditing(landlord)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remove Landlord?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will remove {landlord.name} from your registered landlords. 
                                    You can add them again later if needed.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteLandlord(landlord.id)}
                                    className="bg-destructive hover:bg-destructive/90"
                                  >
                                    Remove
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <span className="text-muted-foreground">{landlord.property_address}</span>
                          </div>
                          {landlord.monthly_rent && (
                            <div className="flex items-center gap-2">
                              <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">{formatUGX(landlord.monthly_rent)}/mo</span>
                            </div>
                          )}
                        </div>

                        {landlord.monthly_rent && (
                          <div className="mt-3 p-2 rounded-lg bg-emerald-500/10 flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            <p className="text-xs text-emerald-600 dark:text-emerald-400">
                              Eligible for up to {formatUGX(landlord.monthly_rent * 0.7)} rent discount
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                ))}

                {/* Add Another Button */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-dashed"
                    onClick={() => setShowAddDialog(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Add Another Landlord
                  </Button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <RegisterLandlordDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSuccess={fetchLandlords}
      />
    </>
  );
}
