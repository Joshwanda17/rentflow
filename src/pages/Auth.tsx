import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, LogIn, Users, ArrowLeft, Mail, Lock, User, Phone, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import WelileLogo from '@/components/WelileLogo';
import { z } from 'zod';

const signUpSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
});

const signInSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  password: z.string().min(1, 'Password is required')
});

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
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

export default function Auth() {
  const [searchParams] = useSearchParams();
  const referralId = searchParams.get('ref');
  
  const [isSignUp, setIsSignUp] = useState(!!referralId);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { signUpWithoutRole, signIn, signInWithGoogle, resetPassword, user, roles } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  useEffect(() => {
    if (referralId) {
      localStorage.setItem('referral_agent_id', referralId);
    }
  }, [referralId]);

  useEffect(() => {
    if (user) {
      if (roles.length === 0) {
        navigate('/select-role');
      } else {
        navigate('/dashboard');
      }
    }
  }, [user, roles, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isForgotPassword) {
        const emailValidation = z.string().email('Please enter a valid email').safeParse(email);
        if (!emailValidation.success) {
          toast({
            title: 'Validation Error',
            description: emailValidation.error.errors[0].message,
            variant: 'destructive'
          });
          setIsLoading(false);
          return;
        }

        const { error } = await resetPassword(email);
        if (error) {
          toast({
            title: 'Reset Failed',
            description: error.message,
            variant: 'destructive'
          });
        } else {
          toast({
            title: 'Check Your Email',
            description: 'We sent you a password reset link'
          });
          setIsForgotPassword(false);
        }
      } else if (isSignUp) {
        const validation = signUpSchema.safeParse({ email, password, fullName, phone });
        if (!validation.success) {
          toast({
            title: 'Validation Error',
            description: validation.error.errors[0].message,
            variant: 'destructive'
          });
          setIsLoading(false);
          return;
        }

        const { error } = await signUpWithoutRole(email, password, fullName, phone);
        if (error) {
          toast({
            title: 'Sign Up Failed',
            description: error.message,
            variant: 'destructive'
          });
        } else {
          toast({
            title: 'Account Created!',
            description: 'Welcome to Welile Platform'
          });
        }
      } else {
        const validation = signInSchema.safeParse({ email, password });
        if (!validation.success) {
          toast({
            title: 'Validation Error',
            description: validation.error.errors[0].message,
            variant: 'destructive'
          });
          setIsLoading(false);
          return;
        }

        const { error } = await signIn(email, password);
        if (error) {
          toast({
            title: 'Sign In Failed',
            description: error.message,
            variant: 'destructive'
          });
        }
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        toast({
          title: 'Google Sign In Failed',
          description: error.message,
          variant: 'destructive'
        });
      }
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to sign in with Google',
        variant: 'destructive'
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          transition={{ duration: 1 }}
          className="absolute top-1/4 -left-20 w-72 h-72 bg-primary/20 rounded-full blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="absolute bottom-1/4 -right-20 w-96 h-96 bg-accent/20 rounded-full blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-radial from-primary/10 to-transparent rounded-full"
        />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full max-w-md relative z-10"
      >
        <motion.div variants={itemVariants}>
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-6 transition-colors group"
          >
            <motion.div
              whileHover={{ x: -4 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <ArrowLeft className="h-4 w-4" />
            </motion.div>
            <span>Back to Home</span>
          </Link>
        </motion.div>

        <motion.div variants={itemVariants} className="text-center mb-8">
          <motion.div 
            className="flex items-center justify-center mb-4"
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          >
            <WelileLogo linkToHome={false} />
          </motion.div>
          <p className="text-muted-foreground">Rent Facilitation Platform</p>
        </motion.div>

        <AnimatePresence mode="wait">
          {referralId && (
            <motion.div 
              key="referral"
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="mb-4 p-4 rounded-xl bg-success/10 border border-success/20 backdrop-blur-sm"
            >
              <div className="flex items-center justify-center gap-2 text-success">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-medium">Referred by an Agent</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Sign up to get started with rent facilitation
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div variants={itemVariants}>
          <Card className="glass-card border-border/50 shadow-elevated overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 pointer-events-none" />
            
            <CardHeader className="relative">
              <motion.div
                key={isForgotPassword ? 'forgot' : isSignUp ? 'signup' : 'signin'}
                initial={{ opacity: 0, x: isSignUp ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <CardTitle className="flex items-center gap-2">
                  <motion.div
                    className="p-2 rounded-lg bg-primary/10"
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 17 }}
                  >
                    {isForgotPassword ? <Mail className="h-5 w-5 text-primary" /> : isSignUp ? <UserPlus className="h-5 w-5 text-primary" /> : <LogIn className="h-5 w-5 text-primary" />}
                  </motion.div>
                  {isForgotPassword ? 'Reset Password' : isSignUp ? 'Create Account' : 'Welcome Back'}
                </CardTitle>
                <CardDescription>
                  {isForgotPassword 
                    ? 'Enter your email to receive a reset link'
                    : isSignUp 
                      ? 'Join Welile Platform to get started' 
                      : 'Sign in to continue to your dashboard'}
                </CardDescription>
              </motion.div>
            </CardHeader>
            
            <CardContent className="relative">
              <form onSubmit={handleSubmit} className="space-y-4">
                <AnimatePresence mode="wait">
                  {isSignUp && !isForgotPassword && (
                    <motion.div
                      key="signup-fields"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                      className="space-y-4 overflow-hidden"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name</Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="fullName"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Enter your full name"
                            className="pl-10 bg-background/50 border-border/50 focus:border-primary/50 transition-colors"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="phone"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="e.g., 0700123456"
                            className="pl-10 bg-background/50 border-border/50 focus:border-primary/50 transition-colors"
                            required
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <motion.div 
                  className="space-y-2"
                  layout
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                >
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="pl-10 bg-background/50 border-border/50 focus:border-primary/50 transition-colors"
                      required
                    />
                  </div>
                </motion.div>

                <AnimatePresence mode="wait">
                  {!isForgotPassword && (
                    <motion.div 
                      key="password-field"
                      className="space-y-2"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="pl-10 bg-background/50 border-border/50 focus:border-primary/50 transition-colors"
                          required
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {!isSignUp && !isForgotPassword && (
                  <motion.button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-sm text-primary hover:text-primary/80 transition-colors"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Forgot your password?
                  </motion.button>
                )}

                <motion.div
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <Button 
                    type="submit" 
                    className="w-full gap-2 h-11 font-medium" 
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full"
                      />
                    ) : (
                      <>
                        {isForgotPassword ? <Mail className="h-4 w-4" /> : isSignUp ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                        {isForgotPassword ? 'Send Reset Link' : isSignUp ? 'Create Account' : 'Sign In'}
                      </>
                    )}
                  </Button>
                </motion.div>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border/50" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <motion.div
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-3 h-11 font-medium bg-background/50 border-border/50 hover:bg-accent/50"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading || isLoading}
                >
                  {isGoogleLoading ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full"
                    />
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                  )}
                  Continue with Google
                </Button>
              </motion.div>

              <div className="mt-6 pt-4 border-t border-border/50 text-center">
                <motion.button
                  type="button"
                  onClick={() => {
                    if (isForgotPassword) {
                      setIsForgotPassword(false);
                    } else {
                      setIsSignUp(!isSignUp);
                    }
                  }}
                  className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isForgotPassword ? (
                    <>Remember your password? <span className="text-primary font-medium">Sign In</span></>
                  ) : isSignUp ? (
                    <>Already have an account? <span className="text-primary font-medium">Sign In</span></>
                  ) : (
                    <>Don't have an account? <span className="text-primary font-medium">Sign Up</span></>
                  )}
                </motion.button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.p 
          variants={itemVariants}
          className="text-center text-xs text-muted-foreground mt-6"
        >
          By continuing, you agree to our Terms of Service and Privacy Policy
        </motion.p>
      </motion.div>
    </div>
  );
}
