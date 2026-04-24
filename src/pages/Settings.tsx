import { useState, useEffect, useRef, lazy, Suspense, Component, ReactNode, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, Phone, Mail, Save, Loader2, Camera, Shield, Home, Users, Wallet, Building2, Check, Type, Vibrate, RotateCcw, LogIn, Volume2, RefreshCw, Scale, Lock, Eye, EyeOff, LayoutDashboard, Unlock, Settings as SettingsIcon, Palette, ShieldCheck } from 'lucide-react';
import { useHapticSettings, hapticIntensityOptions } from '@/hooks/useHapticSettings';
import { hapticSelection } from '@/lib/haptics';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { roleToSlug } from '@/lib/roleRoutes';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useFontSize, fontSizeOptions } from '@/hooks/useFontSize';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { useAppPreferences } from '@/hooks/useAppPreferences';
import { playNotificationSound } from '@/lib/notificationSound';
import { cn } from '@/lib/utils';

const WalletCard = lazy(() => import('@/components/wallet/WalletCard').then(m => ({ default: m.WalletCard })));
const DiagnosticsSection = lazy(() => import('@/components/settings/DiagnosticsSection'));
const PinSecuritySection = lazy(() => import('@/components/settings/PinSecuritySection'));
const BiometricSecuritySection = lazy(() => import('@/components/settings/BiometricSecuritySection'));
const TrustPrivacySection = lazy(() => import('@/components/settings/TrustPrivacySection'));
const MyLandlordsSection = lazy(() => import('@/components/tenant/MyLandlordsSection'));
const MyTenantsSection = lazy(() => import('@/components/landlord/MyTenantsSection'));
const RentDiscountToggle = lazy(() => import('@/components/tenant/RentDiscountToggle'));
const StaffAccessCard = lazy(() => import('@/components/settings/StaffAccessCard'));
const ResidenceAddressForm = lazy(() => import('@/components/profile/ResidenceAddressForm'));
const EmailEditor = lazy(() => import('@/components/profile/EmailEditor'));
const ShareCardThemeSettings = lazy(() => import('@/components/agent/ShareCardThemeSettings'));

class SectionBoundary extends Component<{ children: ReactNode; name: string }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.warn(`[Settings/${this.props.name}] failed:`, error.message); }
  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive/20 bg-destructive/5 rounded-2xl">
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">This section couldn't load.</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => this.setState({ hasError: false })}>Try again</Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

function SectionSkeleton() {
  return (
    <div className="py-6 space-y-3 px-1">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-10 w-full rounded-xl" />
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
  );
}

function LazySection({ children, name }: { children: ReactNode; name: string }) {
  return (
    <SectionBoundary name={name}>
      <Suspense fallback={<SectionSkeleton />}>{children}</Suspense>
    </SectionBoundary>
  );
}

interface Profile { id: string; full_name: string; email: string; phone: string; avatar_url: string | null; }
type SettingsSection = 'account' | 'roles' | 'appearance' | 'security' | 'legal' | 'advanced';

const SECTIONS: { id: SettingsSection; label: string; icon: typeof User }[] = [
  { id: 'account', label: 'Me', icon: User },
  { id: 'roles', label: 'Roles', icon: Shield },
  { id: 'appearance', label: 'Look', icon: Palette },
  { id: 'security', label: 'Safety', icon: ShieldCheck },
  { id: 'legal', label: 'Legal', icon: Scale },
  { id: 'advanced', label: 'More', icon: SettingsIcon },
];

export default function Settings() {
  const navigate = useNavigate();
  const { user, roles, loading: authLoading, role } = useAuth();
  const { fontSize, setFontSize } = useFontSize();
  const { intensity: hapticIntensity, setIntensity: setHapticIntensity } = useHapticSettings();
  const { preferences, updatePreference, resetPreferences } = useAppPreferences();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('account');
  const [deferredReady, setDeferredReady] = useState(false);

  useEffect(() => { if (!authLoading && !user) navigate('/auth'); }, [user, authLoading, navigate]);
  useEffect(() => { if (user) fetchProfile(); }, [user]);
  useEffect(() => { const t = setTimeout(() => setDeferredReady(true), 300); return () => clearTimeout(t); }, []);

  const fetchProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
    if (error) { console.error('Error fetching profile:', error); setLoading(false); return; }
    if (data) { setProfile(data as Profile); setFullName(data.full_name); setPhone(data.phone); }
    setLoading(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Image must be less than 5MB'); return; }
    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;
      await supabase.storage.from('avatars').remove([filePath]);
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const avatarUrl = `${publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
      if (updateError) throw updateError;
      setProfile(prev => prev ? { ...prev, avatar_url: avatarUrl } : null);
      toast.success('Profile photo updated!');
    } catch (error) { console.error('Error uploading avatar:', error); toast.error('Failed to upload photo'); }
    finally { setUploadingAvatar(false); }
  };

  const handleSave = async () => {
    if (!user || !profile) return;
    if (!fullName.trim()) { toast.error('Full name is required'); return; }
    if (!phone.trim()) { toast.error('Phone number is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: fullName.trim(), phone: phone.trim() }).eq('id', user.id);
    setSaving(false);
    if (error) { toast.error('Failed to update profile'); return; }
    toast.success('Profile updated successfully');
    setProfile({ ...profile, full_name: fullName.trim(), phone: phone.trim() });
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const roleConfig: Record<AppRole, { label: string; icon: React.ReactNode; color: string }> = {
    tenant: { label: 'Tenant', icon: <Home className="h-4 w-4" />, color: 'bg-primary/20 text-primary border-primary/30' },
    agent: { label: 'Agent', icon: <Users className="h-4 w-4" />, color: 'bg-warning/20 text-warning border-warning/30' },
    supporter: { label: 'Supporter', icon: <Wallet className="h-4 w-4" />, color: 'bg-success/20 text-success border-success/30' },
    landlord: { label: 'Landlord', icon: <Building2 className="h-4 w-4" />, color: 'bg-accent/20 text-accent border-accent/30' },
    manager: { label: 'Manager', icon: <Shield className="h-4 w-4" />, color: 'bg-destructive/20 text-destructive border-destructive/30' },
    ceo: { label: 'CEO', icon: <Shield className="h-4 w-4" />, color: 'bg-primary/20 text-primary border-primary/30' },
    coo: { label: 'COO', icon: <Shield className="h-4 w-4" />, color: 'bg-primary/20 text-primary border-primary/30' },
    cfo: { label: 'CFO', icon: <Wallet className="h-4 w-4" />, color: 'bg-warning/20 text-warning border-warning/30' },
    cto: { label: 'CTO', icon: <Shield className="h-4 w-4" />, color: 'bg-accent/20 text-accent border-accent/30' },
    cmo: { label: 'CMO', icon: <Users className="h-4 w-4" />, color: 'bg-success/20 text-success border-success/30' },
    crm: { label: 'CRM', icon: <Users className="h-4 w-4" />, color: 'bg-warning/20 text-warning border-warning/30' },
    employee: { label: 'Employee', icon: <Users className="h-4 w-4" />, color: 'bg-muted text-muted-foreground border-border' },
    operations: { label: 'Operations', icon: <Shield className="h-4 w-4" />, color: 'bg-accent/20 text-accent border-accent/30' },
    super_admin: { label: 'Super Admin', icon: <Shield className="h-4 w-4" />, color: 'bg-destructive/20 text-destructive border-destructive/30' },
    hr: { label: 'HR', icon: <Users className="h-4 w-4" />, color: 'bg-primary/20 text-primary border-primary/30' },
  };

  const hasLegalContent = roles.includes('tenant') || roles.includes('agent') || roles.includes('supporter');
  const visibleSections = useMemo(() => SECTIONS.filter(s => s.id !== 'legal' || hasLegalContent), [hasLegalContent]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2"><Skeleton className="h-6 w-32" /><Skeleton className="h-4 w-48" /></div>
          </div>
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4 max-w-2xl pb-24">
        {/* Header */}
        <div className="sticky top-0 z-30 bg-background -mx-4 px-4 border-b border-border/30 mb-2">
          <div className="flex items-center gap-3 pt-2 pb-2">
            <Button variant="ghost" size="icon" onClick={() => navigate(roleToSlug(role))} className="rounded-xl h-10 w-10 shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight">Settings</h1>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(roleToSlug(role))} className="rounded-xl gap-1.5 text-xs shrink-0">
              <Home className="h-3.5 w-3.5" /> Home
            </Button>
          </div>

          {/* Compact profile */}
          <div className="flex items-center gap-3 pb-2">
            <Avatar className="h-9 w-9 border border-primary/20">
              <AvatarImage src={profile?.avatar_url || undefined} alt={fullName} />
              <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">{getInitials(fullName || 'U')}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm truncate">{fullName || 'Your Name'}</p>
              <div className="flex flex-wrap gap-1">
                {roles.slice(0, 2).map((role) => {
                  const config = roleConfig[role];
                  return <Badge key={role} className={`${config.color} text-[9px] px-1.5 py-0 border`}>{config.label}</Badge>;
                })}
                {roles.length > 2 && <Badge variant="outline" className="text-[9px] px-1.5 py-0">+{roles.length - 2}</Badge>}
              </div>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-2">
            {visibleSections.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => setActiveSection(id)} className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all min-h-[40px] shrink-0 touch-manipulation active:scale-95",
                activeSection === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground bg-muted/30 hover:bg-muted"
              )}>
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
        </div>

        {/* Active section content — ONLY one section renders at a time */}
        <div className="mt-3">
          <SectionBoundary name={activeSection}>
            {activeSection === 'account' && (
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-card">
                  <div className="relative">
                    <Avatar className="h-16 w-16 border-2 border-primary/20">
                      <AvatarImage src={profile?.avatar_url || undefined} alt={fullName} />
                      <AvatarFallback className="text-lg bg-primary/10 text-primary font-bold">{getInitials(fullName || 'U')}</AvatarFallback>
                    </Avatar>
                    <Button size="icon" variant="secondary" className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full shadow border-2 border-background" onClick={() => fileInputRef.current?.click()} disabled={uploadingAvatar}>
                      {uploadingAvatar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                    </Button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                  </div>
                  <div className="min-w-0"><p className="font-bold truncate">{fullName || 'Your Name'}</p><p className="text-xs text-muted-foreground truncate">{profile?.email}</p></div>
                </div>
                <Card className="border-border/40 rounded-2xl">
                  <CardContent className="pt-5 space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="fullName" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your Name</Label>
                      <div className="relative"><User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="pl-10 h-12 rounded-xl" /></div>
                    </div>
                    {/* Email is now editable via dedicated EmailEditor below */}
                    <div className="space-y-1.5">
                      <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone</Label>
                      <div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0783673998" className="pl-10 h-12 rounded-xl" /></div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</Label>
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs text-primary" onClick={() => setShowPasswordForm(!showPasswordForm)}>{showPasswordForm ? 'Cancel' : 'Change'}</Button>
                      </div>
                      {!showPasswordForm ? (
                        <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value="••••••••" disabled className="pl-10 h-12 rounded-xl bg-muted/50" /></div>
                      ) : (
                        <div className="space-y-2 p-3 rounded-xl bg-muted/30 border border-border/50">
                          <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" className="pl-10 pr-10 h-11 rounded-xl" /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>{showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div>
                          <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min 6 chars)" className="pl-10 pr-10 h-11 rounded-xl" /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowNewPassword(!showNewPassword)}>{showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div>
                          <div className="relative"><Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="Confirm new password" className="pl-10 h-11 rounded-xl" /></div>
                          <Button size="sm" className="w-full gap-2 h-11 rounded-xl" disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword} onClick={async () => {
                            if (newPassword.length < 6) { toast.error('Min 6 characters'); return; }
                            if (newPassword !== confirmNewPassword) { toast.error("Passwords don't match"); return; }
                            setChangingPassword(true);
                            try {
                              const { error: signInError } = await supabase.auth.signInWithPassword({ email: profile?.email || '', password: currentPassword });
                              if (signInError) { toast.error('Current password is incorrect'); setChangingPassword(false); return; }
                              const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
                              if (updateError) toast.error('Failed: ' + updateError.message);
                              else { toast.success('Password updated!'); setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword(''); setShowPasswordForm(false); }
                            } catch { toast.error('An error occurred'); }
                            setChangingPassword(false);
                          }}>{changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Update Password</Button>
                        </div>
                      )}
                    </div>
                    <Button onClick={handleSave} disabled={saving} className="w-full gap-2 h-12 rounded-xl text-sm font-bold">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes</Button>
                  </CardContent>
                </Card>
                {user && profile && (
                  <LazySection name="EmailEditor">
                    <EmailEditor mode="self" userId={user.id} currentEmail={profile.email} onSaved={(e) => setProfile({ ...profile, email: e })} />
                  </LazySection>
                )}
                {user && (
                  <LazySection name="ResidenceAddress"><ResidenceAddressForm userId={user.id} /></LazySection>
                )}
                <LazySection name="Wallet"><WalletCard /></LazySection>
              </div>
            )}

            {activeSection === 'roles' && (
              <div className="space-y-4">
                <LazySection name="StaffAccess"><StaffAccessCard /></LazySection>
                <Card className="border-border/40 rounded-2xl">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {preferences.unlockAllRoles ? <Unlock className="h-5 w-5 text-success shrink-0" /> : <Lock className="h-5 w-5 text-primary shrink-0" />}
                        <div className="min-w-0"><p className="font-bold text-sm">Open All Dashboards</p><p className="text-xs text-muted-foreground">Use all role views</p></div>
                      </div>
                      <Switch checked={preferences.unlockAllRoles} onCheckedChange={(c) => { updatePreference('unlockAllRoles', c); toast.success(c ? 'All dashboards open!' : 'Back to default'); }} className="shrink-0" />
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/40 rounded-2xl">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Your Roles</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {roles.map((role) => { const c = roleConfig[role]; return c ? <Badge key={role} className={`${c.color} flex items-center gap-1.5 px-3 py-1.5 border text-xs`}>{c.icon}{c.label}<Check className="h-3 w-3 ml-0.5" /></Badge> : null; })}
                      {roles.length === 0 && <p className="text-sm text-muted-foreground">No roles yet</p>}
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border/40 rounded-2xl">
                  <CardHeader className="pb-2"><div className="flex items-center gap-2"><LayoutDashboard className="h-4 w-4 text-primary" /><div><CardTitle className="text-sm">Home Screen</CardTitle><CardDescription className="text-xs">Pick which page opens when you log in</CardDescription></div></div></CardHeader>
                  <CardContent>
                    <RadioGroup value={preferences.defaultRole} onValueChange={(v) => { updatePreference('defaultRole', v as any); toast.success(`Default set to ${v}`); }} className="grid grid-cols-2 gap-2">
                      <div className="flex items-center space-x-2 p-2.5 rounded-lg border border-border/50"><RadioGroupItem value="auto" id="role-auto" /><Label htmlFor="role-auto" className="text-sm cursor-pointer flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />Auto</Label></div>
                      {roles.map((r) => { const rc = roleConfig[r]; if (!rc) return null; return (<div key={r} className="flex items-center space-x-2 p-2.5 rounded-lg border border-border/50"><RadioGroupItem value={r} id={`role-${r}`} /><Label htmlFor={`role-${r}`} className="text-sm cursor-pointer flex items-center gap-1.5">{rc.icon}{rc.label}</Label></div>); })}
                    </RadioGroup>
                  </CardContent>
                </Card>
                {roles.includes('tenant') && <LazySection name="RentDiscount"><RentDiscountToggle /></LazySection>}
                {roles.includes('tenant') && <LazySection name="MyLandlords"><MyLandlordsSection /></LazySection>}
                {roles.includes('landlord') && <LazySection name="MyTenants"><MyTenantsSection /></LazySection>}
              </div>
            )}

            {activeSection === 'appearance' && (
              <div className="space-y-4">
                <Card className="border-border/40 rounded-2xl">
                  <CardContent className="pt-5 space-y-5">
                  <SettingsRow label="Dark / Light" description="Change the look"><ThemeToggle /></SettingsRow>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2"><Type className="h-4 w-4 text-primary" /><p className="font-medium text-sm">Text Size</p></div>
                    <RadioGroup value={fontSize} onValueChange={(v) => setFontSize(v as any)} className="grid grid-cols-2 gap-2">
                      {fontSizeOptions.map((opt) => (<Label key={opt.value} htmlFor={opt.value} className={cn("flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm", fontSize === opt.value ? 'border-primary bg-primary/10' : 'border-border/50')}><RadioGroupItem value={opt.value} id={opt.value} /><div><p className="font-medium text-xs">{opt.label}</p><p className="text-[10px] text-muted-foreground">{opt.description}</p></div></Label>))}
                    </RadioGroup>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2"><Vibrate className="h-4 w-4 text-primary" /><p className="font-medium text-sm">Vibration</p></div>
                    <RadioGroup value={hapticIntensity} onValueChange={(v) => { setHapticIntensity(v as any); if (v !== 'off') setTimeout(() => hapticSelection(), 100); }} className="grid grid-cols-2 gap-2">
                      {hapticIntensityOptions.map((opt) => (<Label key={opt.value} htmlFor={`haptic-${opt.value}`} className={cn("flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer text-sm", hapticIntensity === opt.value ? 'border-primary bg-primary/10' : 'border-border/50')}><RadioGroupItem value={opt.value} id={`haptic-${opt.value}`} /><div><p className="font-medium text-xs">{opt.label}</p><p className="text-[10px] text-muted-foreground">{opt.description}</p></div></Label>))}
                    </RadioGroup>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Volume2 className="h-4 w-4 text-primary" /><p className="font-medium text-sm">Alert Sounds</p></div><Switch checked={preferences.notificationSounds} onCheckedChange={(c) => { updatePreference('notificationSounds', c); if (c) playNotificationSound(preferences.notificationSoundType); toast.success(c ? 'Sounds on' : 'Sounds off'); }} /></div>
                    {preferences.notificationSounds && (
                      <div className="space-y-3 pl-6 border-l-2 border-primary/20">
                        <div><p className="text-xs text-muted-foreground mb-2">General Sound</p><RadioGroup value={preferences.notificationSoundType} onValueChange={(v) => { updatePreference('notificationSoundType', v as any); playNotificationSound(v as any); }} className="grid grid-cols-3 gap-2">{(['ding', 'pop', 'chime'] as const).map((s) => (<Label key={s} htmlFor={`sound-${s}`} className={cn("flex items-center justify-center p-2 rounded-lg border cursor-pointer capitalize text-xs", preferences.notificationSoundType === s ? 'border-primary bg-primary/10 font-semibold' : 'border-border/50')}><RadioGroupItem value={s} id={`sound-${s}`} className="sr-only" />{s}</Label>))}</RadioGroup></div>
                        <div><p className="text-xs text-muted-foreground mb-2">💰 Opportunity Sound</p><RadioGroup value={preferences.opportunitySoundType} onValueChange={(v) => { updatePreference('opportunitySoundType', v as any); if (v === 'opportunity') import('@/lib/notificationSound').then(m => m.playOpportunitySound('opportunity')); else playNotificationSound(v as any); }} className="grid grid-cols-2 gap-2">{(['opportunity', 'ding', 'pop', 'chime'] as const).map((s) => (<Label key={s} htmlFor={`opp-sound-${s}`} className={cn("flex items-center justify-center p-2 rounded-lg border cursor-pointer capitalize text-xs", preferences.opportunitySoundType === s ? 'border-success bg-success/10 font-semibold' : 'border-border/50')}><RadioGroupItem value={s} id={`opp-sound-${s}`} className="sr-only" />{s === 'opportunity' ? '💰 Money' : s}</Label>))}</RadioGroup></div>
                      </div>
                    )}
                  </div>
                  <SettingsRow label="Stay Logged In" description="Don't ask to sign in every time" icon={LogIn}><Switch checked={preferences.rememberLogin} onCheckedChange={(c) => { updatePreference('rememberLogin', c); toast.success(c ? 'Login remembered' : 'Login not remembered'); }} /></SettingsRow>
                  <SettingsRow label="Skip Welcome Screen" description={preferences.skipSplash ? 'Goes straight to dashboard' : 'Shows welcome first'} icon={RotateCcw}><Switch checked={preferences.skipSplash} onCheckedChange={(c) => { updatePreference('skipSplash', c); toast.success(c ? 'Splash skipped' : 'Splash enabled'); }} /></SettingsRow>
                  </CardContent>
                </Card>
                {roles.includes('agent') && (
                  <LazySection name="ShareCardTheme">
                    <ShareCardThemeSettings />
                  </LazySection>
                )}
              </div>
            )}

            {activeSection === 'security' && (
              <div className="space-y-4">
                <LazySection name="PinSecurity"><PinSecuritySection /></LazySection>
                <LazySection name="BiometricSecurity"><BiometricSecuritySection /></LazySection>
                <LazySection name="TrustPrivacy"><TrustPrivacySection /></LazySection>
              </div>
            )}

            {activeSection === 'legal' && hasLegalContent && deferredReady && (
              <LazySection name="Legal"><DeferredLegalSectionInner roles={roles} /></LazySection>
            )}
            {activeSection === 'legal' && (!hasLegalContent || !deferredReady) && <SectionSkeleton />}

            {activeSection === 'advanced' && (
              <div className="space-y-4">
                <Card className="border-border/40 rounded-2xl">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2"><RefreshCw className="h-4 w-4 text-muted-foreground" /><div><p className="font-medium text-sm">Start Fresh</p><p className="text-xs text-muted-foreground">Reset all preferences</p></div></div>
                      <Button variant="outline" size="sm" onClick={() => { resetPreferences(); toast.success('Preferences reset'); }} className="gap-1.5 text-xs"><RefreshCw className="h-3 w-3" />Reset</Button>
                    </div>
                  </CardContent>
                </Card>
                <LazySection name="Diagnostics"><DiagnosticsSection /></LazySection>
              </div>
            )}
          </SectionBoundary>
        </div>

        <div className="mt-8 text-center text-xs text-muted-foreground/50 pb-20"><p>Welile v1.11 • SW v11</p></div>
      </div>
    </div>
  );
}

const DeferredLegalSectionInner = lazy(() => import('@/components/settings/LegalSection'));

function SettingsRow({ label, description, icon: Icon, children }: { label: string; description: string; icon?: typeof User; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {Icon && <Icon className="h-4 w-4 text-primary shrink-0" />}
        <div className="min-w-0"><p className="font-medium text-sm">{label}</p><p className="text-xs text-muted-foreground truncate">{description}</p></div>
      </div>
      {children}
    </div>
  );
}
