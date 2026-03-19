import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, Phone, Mail, Save, Loader2, Camera, Shield, Home, Users, Wallet, Building2, Check, Type, Vibrate, RotateCcw, Bell, LogIn, Volume2, RefreshCw, FileText, Scale, Lock, Eye, EyeOff, LayoutDashboard, ChevronRight, Unlock, Settings as SettingsIcon, Palette, ShieldCheck, Sparkles } from 'lucide-react';
import DiagnosticsSection from '@/components/settings/DiagnosticsSection';
import PinSecuritySection from '@/components/settings/PinSecuritySection';
import BiometricSecuritySection from '@/components/settings/BiometricSecuritySection';
import { useHapticSettings, hapticIntensityOptions } from '@/hooks/useHapticSettings';
import { hapticSelection } from '@/lib/haptics';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

import { Skeleton } from '@/components/ui/skeleton';
import MyLandlordsSection from '@/components/tenant/MyLandlordsSection';
import MyTenantsSection from '@/components/landlord/MyTenantsSection';
import RentDiscountToggle from '@/components/tenant/RentDiscountToggle';
import { useFontSize, fontSizeOptions } from '@/hooks/useFontSize';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { WalletCard } from '@/components/wallet/WalletCard';
import { Switch } from '@/components/ui/switch';
import { useAppPreferences } from '@/hooks/useAppPreferences';
import { playNotificationSound } from '@/lib/notificationSound';
import { useTenantAgreement } from '@/hooks/useTenantAgreement';
import { TenantAgreementModal } from '@/components/tenant/agreement';

import { useAgentAgreement } from '@/hooks/useAgentAgreement';
import { AgentAgreementModal } from '@/components/agent/agreement';
import { useSupporterAgreement } from '@/hooks/useSupporterAgreement';
import { SupporterAgreementModal } from '@/components/supporter/agreement';
import { MyPerformanceCard } from '@/components/manager/MyPerformanceCard';
import { cn } from '@/lib/utils';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
}

type SettingsSection = 'account' | 'roles' | 'appearance' | 'security' | 'legal' | 'advanced';

const SECTIONS: { id: SettingsSection; label: string; icon: typeof User }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'roles', label: 'Roles', icon: Shield },
  { id: 'appearance', label: 'Display', icon: Palette },
  { id: 'security', label: 'Security', icon: ShieldCheck },
  { id: 'legal', label: 'Legal', icon: Scale },
  { id: 'advanced', label: 'Advanced', icon: SettingsIcon },
];

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 25 }
  },
};

export default function Settings() {
  const navigate = useNavigate();
  const { user, roles, loading: authLoading } = useAuth();
  const { fontSize, setFontSize } = useFontSize();
  const { intensity: hapticIntensity, setIntensity: setHapticIntensity } = useHapticSettings();
  const { preferences, updatePreference, resetPreferences } = useAppPreferences();
  const { isAccepted: hasAcceptedTenantTerms, acceptance: tenantAcceptance, acceptAgreement: acceptTenantAgreement } = useTenantAgreement();
  const { isAccepted: hasAcceptedAgentTerms, acceptance: agentAcceptance, acceptAgreement: acceptAgentAgreement } = useAgentAgreement();
  const { hasAccepted: hasAcceptedSupporterTerms, acceptance: supporterAcceptance, acceptAgreement: acceptSupporterAgreement } = useSupporterAgreement();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [showTenantAgreementModal, setShowTenantAgreementModal] = useState(false);
  const [showAgentAgreementModal, setShowAgentAgreementModal] = useState(false);
  const [showSupporterAgreementModal, setShowSupporterAgreementModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSection>('account');

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.error('Error fetching profile:', error);
      setLoading(false);
      return;
    }
    if (data) {
      setProfile(data as Profile);
      setFullName(data.full_name);
      setPhone(data.phone);
    }
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
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast.error('Failed to upload photo');
    } finally {
      setUploadingAvatar(false);
    }
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
  };

  const scrollToSection = (id: SettingsSection) => {
    setActiveSection(id);
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-6 max-w-2xl space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Skeleton className="h-[400px] rounded-xl" />
          <Skeleton className="h-[200px] rounded-xl" />
        </div>
      </div>
    );
  }

  const hasLegalContent = roles.includes('tenant') || roles.includes('agent') || roles.includes('supporter');

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-4 max-w-2xl">

        {/* Sticky Header */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md pb-3 -mx-4 px-4 border-b border-border/30 mb-4">
          <div className="flex items-center gap-3 pt-2 pb-3">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/dashboard')}
              className="rounded-xl h-10 w-10 shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold tracking-tight">Settings</h1>
              <p className="text-xs text-muted-foreground truncate">{profile?.full_name || 'Change how things work'}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/dashboard')}
              className="rounded-xl gap-1.5 text-xs shrink-0"
            >
              <Home className="h-3.5 w-3.5" />
              Home
            </Button>
          </div>

          {/* Section Navigation Pills */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {SECTIONS.filter(s => s.id !== 'legal' || hasLegalContent).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => scrollToSection(id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all shrink-0 min-h-[32px]",
                  activeSection === id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 🔓 UNLOCK ALL ROLES — Hero Banner (Priority #1) */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5"
        >
          <div className={cn(
            "relative overflow-hidden rounded-2xl border-2 p-4 transition-all",
            preferences.unlockAllRoles
              ? "border-success/40 bg-gradient-to-r from-success/5 via-success/10 to-success/5"
              : "border-primary/40 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5"
          )}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20" 
              style={{ background: preferences.unlockAllRoles ? 'hsl(var(--success))' : 'hsl(var(--primary))' }} />
            <div className="flex items-center gap-4 relative">
              <div className={cn(
                "p-3 rounded-xl shrink-0",
                preferences.unlockAllRoles ? "bg-success/15" : "bg-primary/15"
              )}>
                {preferences.unlockAllRoles ? (
                  <Unlock className="h-6 w-6 text-success" />
                ) : (
                  <Lock className="h-6 w-6 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                 <div className="flex items-center gap-2 mb-0.5">
                  <p className="font-bold text-sm">Open All Dashboards</p>
                  {preferences.unlockAllRoles && (
                    <Badge variant="outline" className="text-[10px] border-success/30 text-success bg-success/10 px-1.5 py-0">
                      On
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Switch between Tenant, Agent & Landlord views anytime you want
                </p>
              </div>
              <Switch
                checked={preferences.unlockAllRoles}
                onCheckedChange={(checked) => {
                  updatePreference('unlockAllRoles', checked);
                  toast.success(checked ? 'You can now see all dashboards' : 'Back to your main dashboard only');
                }}
                className="shrink-0"
              />
            </div>
          </div>
        </motion.div>

        {/* ===== ACCOUNT SECTION ===== */}
        <div ref={el => sectionRefs.current['account'] = el} className="scroll-mt-28 mb-6">
          <SectionHeader icon={User} label="Account" />

          <Card className="border-border/50 shadow-sm overflow-hidden">
            <CardContent className="pt-6 space-y-5">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-16 w-16 border-2 border-border shadow-md">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={fullName} />
                    <AvatarFallback className="text-lg bg-gradient-to-br from-primary/20 to-accent/20 text-primary font-semibold">
                      {getInitials(fullName || 'U')}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full shadow border-2 border-background"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                  </Button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-base truncate">{fullName || 'Your Name'}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                </div>
              </div>

              {/* Form Fields */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Type your full name here" className="pl-10 h-11" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="email" value={profile?.email || ''} disabled className="pl-10 h-11 bg-muted/50" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 0783673998" className="pl-10 h-11" />
                  </div>
                </div>

                {/* Change Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Password</Label>
                    <Button variant="link" size="sm" className="h-auto p-0 text-xs text-primary" onClick={() => setShowPasswordForm(!showPasswordForm)}>
                      {showPasswordForm ? 'Cancel' : 'Change'}
                    </Button>
                  </div>
                  {!showPasswordForm ? (
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input value="••••••••" disabled className="pl-10 h-11 bg-muted/50" />
                    </div>
                  ) : (
                    <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type={showCurrentPassword ? 'text' : 'password'} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" className="pl-10 pr-10 h-10" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowCurrentPassword(!showCurrentPassword)}>
                          {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min 6 chars)" className="pl-10 pr-10 h-10" />
                        <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowNewPassword(!showNewPassword)}>
                          {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input type="password" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} placeholder="Confirm new password" className="pl-10 h-10" />
                      </div>
                      <Button
                        size="sm"
                        className="w-full gap-2 h-10"
                        disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}
                        onClick={async () => {
                          if (newPassword.length < 6) { toast.error('New password must be at least 6 characters'); return; }
                          if (newPassword !== confirmNewPassword) { toast.error("New passwords don't match"); return; }
                          setChangingPassword(true);
                          try {
                            const { error: signInError } = await supabase.auth.signInWithPassword({ email: profile?.email || '', password: currentPassword });
                            if (signInError) { toast.error('Current password is incorrect'); setChangingPassword(false); return; }
                            const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
                            if (updateError) { toast.error('Failed to update password: ' + updateError.message); }
                            else { toast.success('Password updated!'); setCurrentPassword(''); setNewPassword(''); setConfirmNewPassword(''); setShowPasswordForm(false); }
                          } catch { toast.error('An error occurred'); }
                          setChangingPassword(false);
                        }}
                      >
                        {changingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                        Update Password
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full gap-2 h-11">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </Button>
            </CardContent>
          </Card>

          {/* Wallet */}
          <div className="mt-4">
            <WalletCard />
          </div>

          {/* Manager extras */}
          {roles.includes('manager') && (
            <div className="mt-4 space-y-4">
              <MyPerformanceCard />
              <Card 
                className="border-border/50 shadow-sm cursor-pointer active:scale-[0.98] transition-all"
                onClick={() => navigate('/coo-dashboard')}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="p-2.5 rounded-xl bg-primary/10">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">COO Dashboard</p>
                    <p className="text-xs text-muted-foreground">Operations overview</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        {/* ===== ROLES & NAVIGATION SECTION ===== */}
        <div ref={el => sectionRefs.current['roles'] = el} className="scroll-mt-28 mb-6">
          <SectionHeader icon={Shield} label="Roles & Navigation" />

          {/* Current Roles */}
          <Card className="border-border/50 shadow-sm mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">My Roles</CardTitle>
              <CardDescription className="text-xs">Your active platform roles</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => {
                  const config = roleConfig[role];
                  return (
                    <Badge key={role} className={`${config.color} flex items-center gap-1.5 px-3 py-1.5 border text-xs`}>
                      {config.icon}
                      {config.label}
                      <Check className="h-3 w-3 ml-0.5" />
                    </Badge>
                  );
                })}
                {roles.length === 0 && <p className="text-sm text-muted-foreground">No roles assigned</p>}
              </div>
            </CardContent>
          </Card>

          {/* Default Dashboard */}
          <Card className="border-border/50 shadow-sm mb-4">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4 text-primary" />
                <div>
                  <CardTitle className="text-sm">Default Dashboard</CardTitle>
                  <CardDescription className="text-xs">Which dashboard opens first</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={preferences.defaultRole}
                onValueChange={(value) => {
                  updatePreference('defaultRole', value as any);
                  const label = value === 'auto' ? 'Auto (Funder)' : roleConfig[value as AppRole]?.label || value;
                  toast.success(`Default dashboard set to ${label}`);
                }}
                className="grid grid-cols-2 gap-2"
              >
                <div className="flex items-center space-x-2 p-2.5 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="auto" id="role-auto" />
                  <Label htmlFor="role-auto" className="text-sm cursor-pointer flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                    Auto
                  </Label>
                </div>
                {roles.map((r) => {
                  const rc = roleConfig[r];
                  if (!rc) return null;
                  return (
                    <div key={r} className="flex items-center space-x-2 p-2.5 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors">
                      <RadioGroupItem value={r} id={`role-${r}`} />
                      <Label htmlFor={`role-${r}`} className="text-sm cursor-pointer flex items-center gap-1.5">
                        {rc.icon}
                        {rc.label}
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Rent Discount for Tenants */}
          {roles.includes('tenant') && <div className="mb-4"><RentDiscountToggle /></div>}

          {/* My Landlords / Tenants */}
          {roles.includes('tenant') && <div className="mb-4"><MyLandlordsSection /></div>}
          {roles.includes('landlord') && <div className="mb-4"><MyTenantsSection /></div>}
        </div>

        {/* ===== APPEARANCE SECTION ===== */}
        <div ref={el => sectionRefs.current['appearance'] = el} className="scroll-mt-28 mb-6">
          <SectionHeader icon={Palette} label="Display & Sound" />

          <Card className="border-border/50 shadow-sm">
            <CardContent className="pt-5 space-y-5">
              {/* Theme */}
              <SettingsRow label="Theme" description="Light or dark mode">
                <ThemeToggle />
              </SettingsRow>

              {/* Font Size */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Type className="h-4 w-4 text-primary" />
                  <p className="font-medium text-sm">Font Size</p>
                </div>
                <RadioGroup value={fontSize} onValueChange={(v) => setFontSize(v as typeof fontSize)} className="grid grid-cols-2 gap-2">
                  {fontSizeOptions.map((opt) => (
                    <Label
                      key={opt.value}
                      htmlFor={opt.value}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all text-sm",
                        fontSize === opt.value ? 'border-primary bg-primary/10' : 'border-border/50 hover:bg-muted/50'
                      )}
                    >
                      <RadioGroupItem value={opt.value} id={opt.value} />
                      <div>
                        <p className="font-medium text-xs">{opt.label}</p>
                        <p className="text-[10px] text-muted-foreground">{opt.description}</p>
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {/* Haptic */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Vibrate className="h-4 w-4 text-primary" />
                  <p className="font-medium text-sm">Haptic Feedback</p>
                </div>
                <RadioGroup 
                  value={hapticIntensity} 
                  onValueChange={(v) => { setHapticIntensity(v as typeof hapticIntensity); if (v !== 'off') setTimeout(() => hapticSelection(), 100); }}
                  className="grid grid-cols-2 gap-2"
                >
                  {hapticIntensityOptions.map((opt) => (
                    <Label
                      key={opt.value}
                      htmlFor={`haptic-${opt.value}`}
                      className={cn(
                        "flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all text-sm",
                        hapticIntensity === opt.value ? 'border-primary bg-primary/10' : 'border-border/50 hover:bg-muted/50'
                      )}
                    >
                      <RadioGroupItem value={opt.value} id={`haptic-${opt.value}`} />
                      <div>
                        <p className="font-medium text-xs">{opt.label}</p>
                        <p className="text-[10px] text-muted-foreground">{opt.description}</p>
                      </div>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {/* Notification Sounds */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-4 w-4 text-primary" />
                    <p className="font-medium text-sm">Notification Sounds</p>
                  </div>
                  <Switch
                    checked={preferences.notificationSounds}
                    onCheckedChange={(checked) => {
                      updatePreference('notificationSounds', checked);
                      if (checked) playNotificationSound(preferences.notificationSoundType);
                      toast.success(checked ? 'Sounds enabled' : 'Sounds disabled');
                    }}
                  />
                </div>
                {preferences.notificationSounds && (
                  <div className="space-y-3 pl-6 border-l-2 border-primary/20">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">General Sound</p>
                      <RadioGroup 
                        value={preferences.notificationSoundType} 
                        onValueChange={(v) => { updatePreference('notificationSoundType', v as any); playNotificationSound(v as any); }}
                        className="grid grid-cols-3 gap-2"
                      >
                        {(['ding', 'pop', 'chime'] as const).map((s) => (
                          <Label key={s} htmlFor={`sound-${s}`} className={cn(
                            "flex items-center justify-center p-2 rounded-lg border cursor-pointer transition-all capitalize text-xs",
                            preferences.notificationSoundType === s ? 'border-primary bg-primary/10 font-semibold' : 'border-border/50 hover:bg-muted/50'
                          )}>
                            <RadioGroupItem value={s} id={`sound-${s}`} className="sr-only" />
                            {s}
                          </Label>
                        ))}
                      </RadioGroup>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">💰 Opportunity Sound</p>
                      <RadioGroup 
                        value={preferences.opportunitySoundType} 
                        onValueChange={(v) => {
                          updatePreference('opportunitySoundType', v as any);
                          if (v === 'opportunity') import('@/lib/notificationSound').then(m => m.playOpportunitySound('opportunity'));
                          else playNotificationSound(v as any);
                        }}
                        className="grid grid-cols-2 gap-2"
                      >
                        {(['opportunity', 'ding', 'pop', 'chime'] as const).map((s) => (
                          <Label key={s} htmlFor={`opp-sound-${s}`} className={cn(
                            "flex items-center justify-center p-2 rounded-lg border cursor-pointer transition-all capitalize text-xs",
                            preferences.opportunitySoundType === s ? 'border-success bg-success/10 font-semibold' : 'border-border/50 hover:bg-muted/50'
                          )}>
                            <RadioGroupItem value={s} id={`opp-sound-${s}`} className="sr-only" />
                            {s === 'opportunity' ? '💰 Money' : s}
                          </Label>
                        ))}
                      </RadioGroup>
                    </div>
                  </div>
                )}
              </div>

              {/* Remember Login */}
              <SettingsRow label="Remember Login" description="Stay signed in between sessions" icon={LogIn}>
                <Switch
                  checked={preferences.rememberLogin}
                  onCheckedChange={(checked) => { updatePreference('rememberLogin', checked); toast.success(checked ? 'Login will be remembered' : 'Login will not be remembered'); }}
                />
              </SettingsRow>

              {/* Skip Splash */}
              <SettingsRow label="Skip Splash Screen" description={preferences.skipSplash ? 'Splash is skipped' : 'Splash shows on startup'} icon={RotateCcw}>
                <Switch
                  checked={preferences.skipSplash}
                  onCheckedChange={(checked) => { updatePreference('skipSplash', checked); toast.success(checked ? 'Splash skipped' : 'Splash enabled'); }}
                />
              </SettingsRow>
            </CardContent>
          </Card>
        </div>

        {/* ===== SECURITY SECTION ===== */}
        <div ref={el => sectionRefs.current['security'] = el} className="scroll-mt-28 mb-6">
          <SectionHeader icon={ShieldCheck} label="Security" />
          <div className="space-y-4">
            <PinSecuritySection />
            <BiometricSecuritySection />
          </div>
        </div>

        {/* ===== LEGAL SECTION ===== */}
        {hasLegalContent && (
          <div ref={el => sectionRefs.current['legal'] = el} className="scroll-mt-28 mb-6">
            <SectionHeader icon={Scale} label="Legal & Agreements" />
            <Card className="border-border/50 shadow-sm">
              <CardContent className="pt-5 space-y-3">
                {roles.includes('tenant') && (
                  <AgreementRow
                    label="Tenant Agreement"
                    accepted={hasAcceptedTenantTerms || false}
                    acceptedAt={tenantAcceptance?.accepted_at}
                    onView={() => setShowTenantAgreementModal(true)}
                  />
                )}
                {roles.includes('agent') && (
                  <AgreementRow
                    label="Agent Agreement"
                    accepted={true}
                    onView={() => setShowAgentAgreementModal(true)}
                  />
                )}
                {roles.includes('supporter') && (
                  <AgreementRow
                    label="Supporter Agreement"
                    accepted={hasAcceptedSupporterTerms || false}
                    acceptedAt={supporterAcceptance?.accepted_at}
                    onView={() => setShowSupporterAgreementModal(true)}
                    note="Implicitly agreed by using the platform"
                  />
                )}
              </CardContent>
            </Card>

            {/* Modals */}
            {roles.includes('tenant') && (
              <TenantAgreementModal isOpen={showTenantAgreementModal} onClose={() => setShowTenantAgreementModal(false)} onAccept={acceptTenantAgreement} viewOnly={hasAcceptedTenantTerms || false} />
            )}
            {roles.includes('agent') && (
              <AgentAgreementModal isOpen={showAgentAgreementModal} onClose={() => setShowAgentAgreementModal(false)} onAccept={async () => true} viewOnly />
            )}
            {roles.includes('supporter') && (
              <SupporterAgreementModal open={showSupporterAgreementModal} onOpenChange={setShowSupporterAgreementModal} onAccept={acceptSupporterAgreement} />
            )}
          </div>
        )}

        {/* ===== ADVANCED SECTION ===== */}
        <div ref={el => sectionRefs.current['advanced'] = el} className="scroll-mt-28 mb-6">
          <SectionHeader icon={SettingsIcon} label="Advanced" />

          {/* Reset Preferences */}
          <Card className="border-border/50 shadow-sm mb-4">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Reset Preferences</p>
                    <p className="text-xs text-muted-foreground">Restore all settings to defaults</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { resetPreferences(); toast.success('Preferences reset'); }}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className="h-3 w-3" />
                  Reset
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Diagnostics */}
          <DiagnosticsSection />
        </div>

        {/* Version */}
        <div className="mb-8 text-center text-xs text-muted-foreground/50 space-y-0.5 pb-20">
          <p>Welile v1.11 • SW v11</p>
          <p>Build {new Date((globalThis as any).__BUILD_TIME__ || Date.now()).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
    </div>
  );
}

/* ===== Reusable Sub-components ===== */

function SectionHeader({ icon: Icon, label }: { icon: typeof User; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{label}</h2>
    </div>
  );
}

function SettingsRow({ label, description, icon: Icon, children }: { label: string; description: string; icon?: typeof User; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {Icon && <Icon className="h-4 w-4 text-primary shrink-0" />}
        <div className="min-w-0">
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground truncate">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function AgreementRow({ label, accepted, acceptedAt, onView, note }: { label: string; accepted: boolean; acceptedAt?: string | null; onView: () => void; note?: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/30">
      <div className="flex items-center gap-2.5 min-w-0">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-sm">{label}</p>
          <p className="text-xs text-muted-foreground truncate">
            {accepted && acceptedAt ? `Accepted ${new Date(acceptedAt).toLocaleDateString()}` : note || (accepted ? 'Accepted' : 'Not yet accepted')}
          </p>
        </div>
      </div>
      <Button variant={accepted ? "outline" : "default"} size="sm" onClick={onView} className="shrink-0 text-xs h-8">
        {accepted ? 'View' : 'Accept'}
      </Button>
    </div>
  );
}