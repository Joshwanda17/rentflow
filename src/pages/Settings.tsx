import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, Phone, Mail, Save, Loader2, Camera, Shield, Home, Users, Wallet, Building2, Check, Sparkles, Type, Vibrate } from 'lucide-react';
import { useHapticSettings, hapticIntensityOptions } from '@/hooks/useHapticSettings';
import { hapticSelection } from '@/lib/haptics';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import AddRoleDialog from '@/components/AddRoleDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useFontSize, fontSizeOptions } from '@/hooks/useFontSize';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface Profile {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string | null;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 25 }
  },
};

export default function Settings() {
  const navigate = useNavigate();
  const { user, roles, addRole, loading: authLoading } = useAuth();
  const { fontSize, setFontSize } = useFontSize();
  const { intensity: hapticIntensity, setIntensity: setHapticIntensity } = useHapticSettings();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setUploadingAvatar(true);

    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/avatar.${fileExt}`;

      await supabase.storage.from('avatars').remove([filePath]);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const avatarUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id);

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

    if (!fullName.trim()) {
      toast.error('Full name is required');
      return;
    }

    if (!phone.trim()) {
      toast.error('Phone number is required');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim(),
      })
      .eq('id', user.id);

    setSaving(false);

    if (error) {
      toast.error('Failed to update profile');
      return;
    }

    toast.success('Profile updated successfully');
    setProfile({ ...profile, full_name: fullName.trim(), phone: phone.trim() });
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const roleConfig: Record<AppRole, { label: string; icon: React.ReactNode; color: string }> = {
    tenant: { label: 'Tenant', icon: <Home className="h-4 w-4" />, color: 'bg-primary/20 text-primary border-primary/30' },
    agent: { label: 'Agent', icon: <Users className="h-4 w-4" />, color: 'bg-warning/20 text-warning border-warning/30' },
    supporter: { label: 'Supporter', icon: <Wallet className="h-4 w-4" />, color: 'bg-success/20 text-success border-success/30' },
    landlord: { label: 'Landlord', icon: <Building2 className="h-4 w-4" />, color: 'bg-accent/20 text-accent border-accent/30' },
    manager: { label: 'Manager', icon: <Shield className="h-4 w-4" />, color: 'bg-destructive/20 text-destructive border-destructive/30' },
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
          <Skeleton className="h-[120px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ duration: 1 }}
          className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="absolute bottom-0 left-0 w-72 h-72 bg-accent/10 rounded-full blur-3xl"
        />
      </div>

      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="container mx-auto px-4 py-6 max-w-2xl relative z-10"
      >
        {/* Header */}
        <motion.div variants={itemVariants} className="flex items-center gap-4 mb-6">
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate('/dashboard')}
              className="rounded-xl bg-card/50 backdrop-blur-sm border border-border/50"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </motion.div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-muted-foreground text-sm">
              Manage your account settings
            </p>
          </div>
        </motion.div>

        {/* Profile Card */}
        <motion.div variants={itemVariants}>
          <Card className="mb-6 glass-card border-border/50 shadow-elevated overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
            
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2">
                <motion.div
                  className="p-2 rounded-lg bg-primary/10"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <User className="h-5 w-5 text-primary" />
                </motion.div>
                Profile Information
              </CardTitle>
              <CardDescription>
                Update your personal information
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6 relative">
              {/* Avatar Upload */}
              <div className="flex flex-col items-center gap-4 pb-6 border-b border-border/50">
                <motion.div 
                  className="relative"
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <Avatar className="h-28 w-28 border-4 border-background shadow-xl">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={fullName} />
                    <AvatarFallback className="text-2xl bg-gradient-to-br from-primary/20 to-accent/20 text-primary font-semibold">
                      {getInitials(fullName || 'U')}
                    </AvatarFallback>
                  </Avatar>
                  <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                  >
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute bottom-0 right-0 h-9 w-9 rounded-full shadow-lg border-2 border-background"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                    >
                      {uploadingAvatar ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </Button>
                  </motion.div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                  />
                </motion.div>
                <p className="text-sm text-muted-foreground">
                  Click the camera icon to upload a photo
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="pl-10 bg-background/50 border-border/50 focus:border-primary/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    value={profile?.email || ''}
                    disabled
                    className="pl-10 bg-muted/50 border-border/50"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 0783673998"
                    className="pl-10 bg-background/50 border-border/50 focus:border-primary/50"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  This is used for receiving money transfers
                </p>
              </div>

              <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                <Button onClick={handleSave} disabled={saving} className="w-full gap-2 h-11">
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Roles Card */}
        <motion.div variants={itemVariants}>
          <Card className="mb-6 glass-card border-border/50 shadow-elevated overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/5 pointer-events-none" />
            
            <CardHeader className="relative">
              <CardTitle className="flex items-center gap-2">
                <motion.div
                  className="p-2 rounded-lg bg-accent/10"
                  whileHover={{ scale: 1.1, rotate: -5 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                >
                  <Shield className="h-5 w-5 text-accent" />
                </motion.div>
                My Roles
              </CardTitle>
              <CardDescription>
                Manage your account roles
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4 relative">
              <div className="space-y-3">
                <Label>Current Roles</Label>
                <div className="flex flex-wrap gap-2">
                  {roles.map((role, index) => {
                    const config = roleConfig[role];
                    return (
                      <motion.div
                        key={role}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.1 }}
                        whileHover={{ scale: 1.05, y: -2 }}
                      >
                        <Badge className={`${config.color} flex items-center gap-1.5 px-3 py-1.5 border`}>
                          {config.icon}
                          {config.label}
                          <Check className="h-3 w-3 ml-1" />
                        </Badge>
                      </motion.div>
                    );
                  })}
                </div>
                {roles.length === 0 && (
                  <p className="text-sm text-muted-foreground">No roles assigned</p>
                )}
              </div>
              
              <div className="pt-4 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Add Another Role
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Expand your capabilities on the platform
                    </p>
                  </div>
                  <AddRoleDialog availableRoles={roles} onAddRole={addRole} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Appearance Card */}
        <motion.div variants={itemVariants}>
          <Card className="glass-card border-border/50 shadow-elevated overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
            
            <CardHeader className="relative">
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Customize how the app looks
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6 relative">
              {/* Theme Toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-background/50 border border-border/50">
                <div>
                  <p className="font-medium">Theme</p>
                  <p className="text-sm text-muted-foreground">
                    Switch between light and dark mode
                  </p>
                </div>
                <ThemeToggle />
              </div>

              {/* Font Size Selector */}
              <div className="p-4 rounded-xl bg-background/50 border border-border/50">
                <div className="flex items-center gap-2 mb-4">
                  <Type className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Font Size</p>
                    <p className="text-sm text-muted-foreground">
                      Adjust text size for better readability
                    </p>
                  </div>
                </div>
                
                <RadioGroup 
                  value={fontSize} 
                  onValueChange={(value) => setFontSize(value as typeof fontSize)}
                  className="grid grid-cols-2 gap-3"
                >
                  {fontSizeOptions.map((option) => (
                    <motion.div
                      key={option.value}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Label
                        htmlFor={option.value}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          fontSize === option.value 
                            ? 'border-primary bg-primary/10' 
                            : 'border-border/50 hover:border-primary/50 hover:bg-muted/50'
                        }`}
                      >
                        <RadioGroupItem value={option.value} id={option.value} />
                        <div className="flex-1">
                          <p className="font-medium text-sm">{option.label}</p>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </Label>
                    </motion.div>
                  ))}
                </RadioGroup>

                {/* Font Size Preview */}
                <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border/30">
                  <p className="text-muted-foreground text-xs mb-2">Preview:</p>
                  <p className="leading-relaxed">
                    This is how your text will look. Easy to read and comfortable for everyday use.
                  </p>
                </div>
              </div>

              {/* Haptic Feedback Selector */}
              <div className="p-4 rounded-xl bg-background/50 border border-border/50">
                <div className="flex items-center gap-2 mb-4">
                  <Vibrate className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Haptic Feedback</p>
                    <p className="text-sm text-muted-foreground">
                      Adjust vibration intensity for touch interactions
                    </p>
                  </div>
                </div>
                
                <RadioGroup 
                  value={hapticIntensity} 
                  onValueChange={(value) => {
                    setHapticIntensity(value as typeof hapticIntensity);
                    // Give a sample vibration when changing intensity
                    if (value !== 'off') {
                      setTimeout(() => hapticSelection(), 100);
                    }
                  }}
                  className="grid grid-cols-2 gap-3"
                >
                  {hapticIntensityOptions.map((option) => (
                    <motion.div
                      key={option.value}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Label
                        htmlFor={`haptic-${option.value}`}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          hapticIntensity === option.value 
                            ? 'border-primary bg-primary/10' 
                            : 'border-border/50 hover:border-primary/50 hover:bg-muted/50'
                        }`}
                      >
                        <RadioGroupItem value={option.value} id={`haptic-${option.value}`} />
                        <div className="flex-1">
                          <p className="font-medium text-sm">{option.label}</p>
                          <p className="text-xs text-muted-foreground">{option.description}</p>
                        </div>
                      </Label>
                    </motion.div>
                  ))}
                </RadioGroup>

                {/* Haptic Preview */}
                <div className="mt-4 p-4 rounded-lg bg-muted/30 border border-border/30">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-muted-foreground text-xs mb-1">Preview</p>
                      <p className="text-sm">
                        {hapticIntensity === 'off' 
                          ? 'Vibration feedback is disabled.'
                          : `Tap the button to feel ${hapticIntensity} vibration.`
                        }
                      </p>
                    </div>
                    <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={hapticIntensity === 'off'}
                        onClick={() => hapticSelection()}
                        className="gap-2"
                      >
                        <Vibrate className="h-4 w-4" />
                        Test
                      </Button>
                    </motion.div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}
