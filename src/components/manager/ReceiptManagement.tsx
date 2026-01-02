import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { formatUGX } from '@/lib/rentCalculations';
import { Receipt, Store, Plus, CheckCircle, XCircle, Clock, Loader2, Users, FileText, Key, ExternalLink, Printer, TrendingUp } from 'lucide-react';
import { PrintableReceiptSheet } from './PrintableReceiptSheet';
import { VendorAnalytics } from './VendorAnalytics';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface Vendor {
  id: string;
  name: string;
  location: string | null;
  phone: string | null;
  pin: string | null;
  active: boolean;
  created_at: string;
}

interface ReceiptNumber {
  id: string;
  receipt_code: string;
  vendor_id: string;
  vendor_amount: number | null;
  vendor_marked_at: string | null;
  status: string;
  created_at: string;
  vendors?: {
    name: string;
  };
}

interface UserReceipt {
  id: string;
  user_id: string;
  receipt_number_id: string;
  items_description: string;
  claimed_amount: number;
  verified: boolean;
  rejection_reason: string | null;
  loan_contribution: number | null;
  created_at: string;
  receipt_numbers?: {
    receipt_code: string;
    vendor_amount: number | null;
    vendors?: {
      name: string;
    };
  };
  profiles?: {
    full_name: string;
    phone: string;
  };
}

interface ReceiptManagementProps {
  userId: string;
}

// Vendor Card with PIN management
function VendorCard({ vendor, onPinSet }: { vendor: Vendor; onPinSet: () => void }) {
  const { toast } = useToast();
  const [showPinInput, setShowPinInput] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSetPin = async () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      toast({ title: 'Invalid PIN', description: 'PIN must be exactly 4 digits', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('vendors')
      .update({ pin: newPin })
      .eq('id', vendor.id);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'PIN Set', description: `PIN set for ${vendor.name}` });
      setShowPinInput(false);
      setNewPin('');
      onPinSet();
    }
    setSaving(false);
  };

  return (
    <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold">{vendor.name}</p>
          {vendor.location && <p className="text-sm text-muted-foreground">{vendor.location}</p>}
          {vendor.phone && <p className="text-sm text-muted-foreground">{vendor.phone}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={vendor.pin ? 'success' : 'outline'} className="gap-1">
            <Key className="h-3 w-3" />
            {vendor.pin ? 'PIN Set' : 'No PIN'}
          </Badge>
          <Badge variant={vendor.active ? 'success' : 'secondary'}>
            {vendor.active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>
      
      {showPinInput ? (
        <div className="mt-3 flex gap-2">
          <Input
            type="text"
            placeholder="4-digit PIN"
            maxLength={4}
            value={newPin}
            onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
            className="w-32 font-mono"
          />
          <Button size="sm" onClick={handleSetPin} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowPinInput(false); setNewPin(''); }}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button 
          size="sm" 
          variant="outline" 
          className="mt-3 gap-1"
          onClick={() => setShowPinInput(true)}
        >
          <Key className="h-3 w-3" />
          {vendor.pin ? 'Change PIN' : 'Set PIN'}
        </Button>
      )}
    </div>
  );
}

export function ReceiptManagement({ userId }: ReceiptManagementProps) {
  const { toast } = useToast();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [receiptNumbers, setReceiptNumbers] = useState<ReceiptNumber[]>([]);
  const [userReceipts, setUserReceipts] = useState<UserReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Form states
  const [vendorName, setVendorName] = useState('');
  const [vendorLocation, setVendorLocation] = useState('');
  const [vendorPhone, setVendorPhone] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('');
  const [receiptCount, setReceiptCount] = useState('10');
  const [markReceiptCode, setMarkReceiptCode] = useState('');
  const [markAmount, setMarkAmount] = useState('');
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [printSheetOpen, setPrintSheetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    
    const [vendorsRes, receiptsRes, userReceiptsRes] = await Promise.all([
      supabase
        .from('vendors')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase
        .from('receipt_numbers')
        .select('*, vendors(name)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('user_receipts')
        .select(`
          *,
          receipt_numbers (
            receipt_code,
            vendor_amount,
            vendors (name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(100)
    ]);

    // Fetch user profiles for receipts
    const userIds = [...new Set((userReceiptsRes.data || []).map(r => r.user_id))];
    const { data: profiles } = userIds.length > 0 
      ? await supabase.from('profiles').select('id, full_name, phone').in('id', userIds)
      : { data: [] };

    const receiptsWithProfiles = (userReceiptsRes.data || []).map(r => ({
      ...r,
      profiles: profiles?.find(p => p.id === r.user_id)
    }));

    setVendors(vendorsRes.data || []);
    setReceiptNumbers(receiptsRes.data || []);
    setUserReceipts(receiptsWithProfiles);
    setLoading(false);
  };

  const handleCreateVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const { error } = await supabase
      .from('vendors')
      .insert({
        name: vendorName.trim(),
        location: vendorLocation.trim() || null,
        phone: vendorPhone.trim() || null,
        created_by: userId
      });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Vendor Created', description: `${vendorName} has been added` });
      setVendorName('');
      setVendorLocation('');
      setVendorPhone('');
      setVendorDialogOpen(false);
      fetchData();
    }
    setSubmitting(false);
  };

  const handleGenerateReceipts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVendor) return;
    setSubmitting(true);

    const count = parseInt(receiptCount);
    const receipts = [];
    
    for (let i = 0; i < count; i++) {
      const code = `WL-${Date.now().toString(36).toUpperCase()}${i.toString().padStart(3, '0')}`;
      receipts.push({
        receipt_code: code,
        vendor_id: selectedVendor,
        created_by: userId
      });
    }

    const { error } = await supabase
      .from('receipt_numbers')
      .insert(receipts);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ 
        title: 'Receipts Generated', 
        description: `${count} receipt numbers created for distribution` 
      });
      setReceiptDialogOpen(false);
      fetchData();
    }
    setSubmitting(false);
  };

  const handleMarkReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    const { error } = await supabase
      .from('receipt_numbers')
      .update({
        vendor_amount: parseFloat(markAmount),
        vendor_marked_at: new Date().toISOString()
      })
      .eq('receipt_code', markReceiptCode.toUpperCase().trim());

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ 
        title: 'Receipt Marked', 
        description: `Receipt ${markReceiptCode} marked with ${formatUGX(parseFloat(markAmount))}` 
      });
      setMarkReceiptCode('');
      setMarkAmount('');
      fetchData();
    }
    setSubmitting(false);
  };

  const availableReceipts = receiptNumbers.filter(r => r.status === 'available' && !r.vendor_amount);
  const markedReceipts = receiptNumbers.filter(r => r.vendor_amount !== null);
  const usedReceipts = receiptNumbers.filter(r => r.status === 'used');
  const verifiedUserReceipts = userReceipts.filter(r => r.verified);
  const pendingUserReceipts = userReceipts.filter(r => !r.verified && !r.rejection_reason);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Store className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Vendors</p>
                <p className="text-xl font-bold">{vendors.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Verified</p>
                <p className="text-xl font-bold text-success">{verifiedUserReceipts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-warning" />
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-xl font-bold text-warning">{pendingUserReceipts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Receipt className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Available</p>
                <p className="text-xl font-bold">{availableReceipts.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Dialog open={vendorDialogOpen} onOpenChange={setVendorDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Store className="h-4 w-4" />
              Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Vendor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateVendor} className="space-y-4">
              <div className="space-y-2">
                <Label>Vendor Name</Label>
                <Input
                  placeholder="Shop/Supermarket name"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input
                  placeholder="Address/Location"
                  value={vendorLocation}
                  onChange={(e) => setVendorLocation(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  placeholder="Contact phone"
                  value={vendorPhone}
                  onChange={(e) => setVendorPhone(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Vendor
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={receiptDialogOpen} onOpenChange={setReceiptDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Generate Receipts
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Receipt Numbers</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleGenerateReceipts} className="space-y-4">
              <div className="space-y-2">
                <Label>Select Vendor</Label>
                <Select value={selectedVendor} onValueChange={setSelectedVendor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Number of Receipts</Label>
                <Select value={receiptCount} onValueChange={setReceiptCount}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 receipts</SelectItem>
                    <SelectItem value="25">25 receipts</SelectItem>
                    <SelectItem value="50">50 receipts</SelectItem>
                    <SelectItem value="100">100 receipts</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={submitting || !selectedVendor}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Generate Receipts
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <Button 
          variant="outline" 
          className="gap-2"
          onClick={() => setPrintSheetOpen(true)}
        >
          <Printer className="h-4 w-4" />
          Print Receipt Codes
        </Button>
      </div>

      {/* Printable Receipt Sheet Dialog */}
      <PrintableReceiptSheet
        vendors={vendors}
        receiptNumbers={receiptNumbers}
        open={printSheetOpen}
        onClose={() => setPrintSheetOpen(false)}
      />

      {/* Mark Receipt Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Mark Receipt (Vendor Entry)
          </CardTitle>
          <CardDescription>
            When a vendor gives out a receipt, enter the code and amount here
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMarkReceipt} className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Receipt Code (e.g., WL-ABC123)"
              value={markReceiptCode}
              onChange={(e) => setMarkReceiptCode(e.target.value.toUpperCase())}
              className="flex-1 font-mono uppercase"
              required
            />
            <Input
              type="number"
              placeholder="Amount (UGX)"
              value={markAmount}
              onChange={(e) => setMarkAmount(e.target.value)}
              className="w-full sm:w-40"
              required
              min="1000"
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tabs for different views */}
      <Tabs defaultValue="user-receipts" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="user-receipts" className="gap-1 text-xs sm:text-sm">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">User</span> Receipts
          </TabsTrigger>
          <TabsTrigger value="receipt-numbers" className="gap-1 text-xs sm:text-sm">
            <Receipt className="h-4 w-4" />
            <span className="hidden sm:inline">Receipt</span> Numbers
          </TabsTrigger>
          <TabsTrigger value="vendors" className="gap-1 text-xs sm:text-sm">
            <Store className="h-4 w-4" />
            Vendors
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-1 text-xs sm:text-sm">
            <TrendingUp className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="user-receipts" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">User Submitted Receipts</CardTitle>
            </CardHeader>
            <CardContent>
              {userReceipts.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No receipts submitted yet</p>
              ) : (
                <div className="space-y-3">
                  {userReceipts.map((receipt) => (
                    <div 
                      key={receipt.id} 
                      className={`p-4 rounded-xl border ${
                        receipt.verified 
                          ? 'bg-success/5 border-success/20' 
                          : receipt.rejection_reason 
                            ? 'bg-destructive/5 border-destructive/20'
                            : 'bg-secondary/30 border-border/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <code className="text-sm font-mono bg-background/50 px-2 py-0.5 rounded">
                              {receipt.receipt_numbers?.receipt_code || 'N/A'}
                            </code>
                            {receipt.verified ? (
                              <Badge variant="success" className="gap-1">
                                <CheckCircle className="h-3 w-3" />
                                Verified
                              </Badge>
                            ) : receipt.rejection_reason ? (
                              <Badge variant="destructive" className="gap-1">
                                <XCircle className="h-3 w-3" />
                                Rejected
                              </Badge>
                            ) : (
                              <Badge variant="warning">Pending</Badge>
                            )}
                          </div>
                          <p className="text-sm font-medium">{receipt.profiles?.full_name || 'Unknown User'}</p>
                          <p className="text-xs text-muted-foreground">{receipt.profiles?.phone}</p>
                          <p className="text-sm text-muted-foreground mt-1">{receipt.receipt_numbers?.vendors?.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatUGX(receipt.claimed_amount)}</p>
                          {receipt.receipt_numbers?.vendor_amount && (
                            <p className="text-xs text-muted-foreground">
                              Vendor: {formatUGX(receipt.receipt_numbers.vendor_amount)}
                            </p>
                          )}
                          {receipt.loan_contribution && (
                            <p className="text-xs text-success">+{formatUGX(receipt.loan_contribution)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipt-numbers" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Receipt Numbers</CardTitle>
              <CardDescription>
                {availableReceipts.length} available • {markedReceipts.length} marked • {usedReceipts.length} used
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {receiptNumbers.slice(0, 50).map((receipt) => (
                  <div 
                    key={receipt.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50"
                  >
                    <div className="flex items-center gap-3">
                      <code className="font-mono text-sm">{receipt.receipt_code}</code>
                      <Badge variant={
                        receipt.status === 'used' ? 'success' : 
                        receipt.vendor_amount ? 'default' : 'outline'
                      }>
                        {receipt.status === 'used' ? 'Used' : receipt.vendor_amount ? 'Marked' : 'Available'}
                      </Badge>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{receipt.vendors?.name}</p>
                      {receipt.vendor_amount && (
                        <p className="text-sm font-medium">{formatUGX(receipt.vendor_amount)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="vendors" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Registered Vendors</span>
                <a 
                  href="/vendor-portal" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm font-normal text-primary hover:underline flex items-center gap-1"
                >
                  Vendor Portal <ExternalLink className="h-3 w-3" />
                </a>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vendors.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No vendors registered yet</p>
              ) : (
                <div className="space-y-3">
                  {vendors.map((vendor) => (
                    <VendorCard 
                      key={vendor.id} 
                      vendor={vendor} 
                      onPinSet={fetchData}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <VendorAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
