import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Home, 
  Users, 
  Wallet, 
  Building2, 
  ArrowRight, 
  CheckCircle,
  TrendingUp,
  Shield,
  Clock,
  Banknote,
  Sparkles,
  Zap,
  Star
} from 'lucide-react';
import WelileLogo from '@/components/WelileLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { ParticleBackground } from '@/components/ParticleBackground';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 25 }
  },
};

const floatAnimation = {
  y: [-10, 10, -10],
  transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const }
};

const userTypes = [
  {
    title: 'Tenant',
    description: 'Need rent money now? Get up to 90 days rent upfront and pay back daily.',
    icon: Home,
    gradient: 'from-primary/20 to-primary/5',
    iconBg: 'bg-primary/20',
    iconColor: 'text-primary',
    benefits: ['Get rent paid to your landlord instantly', 'Pay back in small daily amounts', 'No bank account required'],
    cta: 'Request Rent Now'
  },
  {
    title: 'Agent',
    description: 'Earn money by connecting tenants to our platform. Share your link and earn commissions.',
    icon: Users,
    gradient: 'from-warning/20 to-warning/5',
    iconBg: 'bg-warning/20',
    iconColor: 'text-warning',
    benefits: ['Earn UGX 5,000 per approved tenant', 'Get 5% of all tenant repayments', 'Simple referral link system'],
    cta: 'Start Earning'
  },
  {
    title: 'Supporter',
    description: 'Invest in rent facilitation and earn guaranteed returns on your capital.',
    icon: Wallet,
    gradient: 'from-success/20 to-success/5',
    iconBg: 'bg-success/20',
    iconColor: 'text-success',
    benefits: ['Earn 15% returns on investments', 'Fund verified rent requests', 'Low-risk, high-impact lending'],
    cta: 'Start Investing'
  },
  {
    title: 'Landlord',
    description: 'Receive your rent on time, every time. No more chasing tenants for payments.',
    icon: Building2,
    gradient: 'from-accent/20 to-accent/5',
    iconBg: 'bg-accent/20',
    iconColor: 'text-accent',
    benefits: ['Get paid directly by the platform', 'Never miss a rent payment', 'Simple registration process'],
    cta: 'Get Paid On Time'
  },
];

const stats = [
  { value: 'UGX 500M+', label: 'Rent Facilitated', icon: Banknote },
  { value: '2,000+', label: 'Happy Tenants', icon: Users },
  { value: '500+', label: 'Active Agents', icon: Star },
  { value: '15%', label: 'Supporter Returns', icon: TrendingUp },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Navigation */}
      <motion.header 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring' as const, stiffness: 300, damping: 30 }}
        className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl"
      >
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <motion.div whileHover={{ scale: 1.05 }} transition={{ type: 'spring' as const, stiffness: 400, damping: 17 }}>
            <WelileLogo />
          </motion.div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/auth">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button variant="ghost">Sign In</Button>
              </motion.div>
            </Link>
            <Link to="/auth">
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button className="gap-2">
                  Get Started
                  <Sparkles className="h-4 w-4" />
                </Button>
              </motion.div>
            </Link>
          </div>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center">
        {/* Purple particle effects */}
        <ParticleBackground />
        
        {/* Purple gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-primary/5" />
        <div className="absolute inset-0 bg-gradient-to-tl from-accent/10 via-transparent to-primary/8" />
        
        {/* Animated background */}
        <div className="absolute inset-0 overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.5, scale: 1 }}
            transition={{ duration: 1.5 }}
            className="absolute top-1/4 -left-32 w-96 h-96 bg-gradient-to-br from-primary/30 to-primary/10 rounded-full blur-3xl"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.4, scale: 1 }}
            transition={{ duration: 1.5, delay: 0.3 }}
            className="absolute bottom-1/4 -right-32 w-[500px] h-[500px] bg-gradient-to-tl from-primary/25 via-accent/20 to-primary/10 rounded-full blur-3xl"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 0.35, scale: 1 }}
            transition={{ duration: 1.5, delay: 0.6 }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-primary/15 via-accent/8 to-transparent rounded-full"
          />
          
          {/* Floating elements */}
          <motion.div
            animate={floatAnimation}
            className="absolute top-20 right-20 w-20 h-20 bg-gradient-to-br from-primary/15 to-primary/5 rounded-2xl backdrop-blur-sm border border-primary/25 hidden lg:flex items-center justify-center shadow-lg shadow-primary/10"
          >
            <Home className="h-8 w-8 text-primary/70" />
          </motion.div>
          <motion.div
            animate={{
              y: [-10, 10, -10],
              transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const, delay: 1 }
            }}
            className="absolute bottom-32 left-20 w-16 h-16 bg-gradient-to-br from-accent/20 to-primary/10 rounded-xl backdrop-blur-sm border border-primary/20 hidden lg:flex items-center justify-center shadow-lg shadow-primary/10"
          >
            <Wallet className="h-6 w-6 text-primary/60" />
          </motion.div>
          <motion.div
            animate={{
              y: [-10, 10, -10],
              transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const, delay: 2 }
            }}
            className="absolute top-40 left-1/4 w-12 h-12 bg-gradient-to-br from-primary/20 to-accent/10 rounded-lg backdrop-blur-sm border border-primary/20 hidden lg:flex items-center justify-center shadow-md shadow-primary/10"
          >
            <Users className="h-5 w-5 text-primary/60" />
          </motion.div>
        </div>

        <div className="container mx-auto px-4 py-20 md:py-32 relative z-10">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="max-w-4xl mx-auto text-center"
          >
            <motion.div variants={itemVariants} className="mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary font-medium">
                <Zap className="h-4 w-4" />
                Trusted by 2,000+ users across Uganda
              </span>
            </motion.div>
            
            <motion.h1 
              variants={itemVariants}
              className="text-5xl md:text-7xl font-bold mb-6 leading-tight"
            >
              Rent Facilitation
              <span className="block bg-gradient-to-r from-primary via-primary to-success bg-clip-text text-transparent">
                Made Simple
              </span>
            </motion.h1>
            
            <motion.p 
              variants={itemVariants}
              className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto"
            >
              We connect tenants who need rent money with supporters who want to earn returns. 
              Landlords get paid on time, agents earn commissions. Everyone wins.
            </motion.p>
            
            <motion.div 
              variants={itemVariants}
              className="flex flex-col sm:flex-row gap-4 justify-center"
            >
              <Link to="/auth">
                <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}>
                  <Button size="lg" className="gap-2 h-14 px-8 text-lg shadow-lg shadow-primary/25">
                    Get Started Free
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </motion.div>
              </Link>
              <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}>
                <Button variant="outline" size="lg" className="gap-2 h-14 px-8 text-lg border-border/50 bg-background/50 backdrop-blur-sm">
                  <span className="relative flex h-3 w-3 mr-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
                  </span>
                  Watch Demo
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
        
        {/* Scroll indicator */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-6 h-10 rounded-full border-2 border-muted-foreground/30 flex justify-center pt-2"
          >
            <motion.div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
          </motion.div>
        </motion.div>
      </section>

      {/* Stats Section */}
      <section className="relative border-y border-border/50 bg-card/50 backdrop-blur-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-accent/5 to-primary/10" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/3 to-transparent" />
        <div className="container mx-auto px-4 py-16 relative">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="grid grid-cols-2 md:grid-cols-4 gap-8"
          >
            {stats.map((stat, i) => (
              <motion.div 
                key={i} 
                variants={itemVariants}
                className="text-center group"
              >
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3 group-hover:bg-primary/20 transition-colors"
                >
                  <stat.icon className="h-6 w-6 text-primary" />
                </motion.div>
                <p className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* User Types Section */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/8 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-accent/5 via-transparent to-accent/5" />
        <div className="container mx-auto px-4 relative">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-16"
          >
            <motion.span 
              variants={itemVariants}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent/10 border border-accent/20 text-sm text-accent font-medium mb-4"
            >
              <Star className="h-4 w-4" />
              Choose Your Path
            </motion.span>
            <motion.h2 
              variants={itemVariants}
              className="text-4xl md:text-5xl font-bold mb-4"
            >
              One Platform, Four Roles
            </motion.h2>
            <motion.p 
              variants={itemVariants}
              className="text-muted-foreground max-w-2xl mx-auto text-lg"
            >
              Whether you're looking for rent money, want to earn commissions, invest for returns, 
              or receive guaranteed payments - we've got you covered.
            </motion.p>
          </motion.div>

          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="grid md:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {userTypes.map((type, i) => (
              <motion.div key={i} variants={itemVariants}>
                <Card 
                  className="h-full glass-card border-border/50 hover:border-primary/50 transition-all duration-500 group overflow-hidden relative"
                >
                  {/* Subtle purple gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-60" />
                  <div className={`absolute inset-0 bg-gradient-to-br ${type.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                  <CardContent className="pt-6 relative z-10">
                    <motion.div 
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      className={`p-3 rounded-xl ${type.iconBg} w-fit mb-4`}
                    >
                      <type.icon className={`h-6 w-6 ${type.iconColor}`} />
                    </motion.div>
                    <h3 className="text-xl font-semibold mb-2">{type.title}</h3>
                    <p className="text-sm text-muted-foreground mb-4">{type.description}</p>
                    
                    <ul className="space-y-2 mb-6">
                      {type.benefits.map((benefit, j) => (
                        <motion.li 
                          key={j} 
                          initial={{ opacity: 0, x: -10 }}
                          whileInView={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 * j }}
                          viewport={{ once: true }}
                          className="flex items-start gap-2 text-sm"
                        >
                          <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                          <span>{benefit}</span>
                        </motion.li>
                      ))}
                    </ul>

                    <Link to="/auth">
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button 
                          variant="outline" 
                          className="w-full group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all duration-300"
                        >
                          {type.cta}
                          <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                        </Button>
                      </motion.div>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 bg-card/30 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/8 via-accent/5 to-primary/8" />
        <div className="absolute inset-0 bg-gradient-to-b from-primary/3 via-transparent to-primary/3" />
        <div className="container mx-auto px-4 relative">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="text-center mb-16"
          >
            <motion.span 
              variants={itemVariants}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 border border-success/20 text-sm text-success font-medium mb-4"
            >
              <Zap className="h-4 w-4" />
              Quick & Easy
            </motion.span>
            <motion.h2 
              variants={itemVariants}
              className="text-4xl md:text-5xl font-bold mb-4"
            >
              How It Works
            </motion.h2>
            <motion.p 
              variants={itemVariants}
              className="text-muted-foreground text-lg"
            >
              Get started in just 4 simple steps
            </motion.p>
          </motion.div>

          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="grid md:grid-cols-4 gap-8 max-w-5xl mx-auto"
          >
            {[
              { step: '1', title: 'Sign Up', desc: 'Create your free account and choose your role', icon: Users },
              { step: '2', title: 'Submit Request', desc: 'Tenants submit rent requests with landlord details', icon: Banknote },
              { step: '3', title: 'Get Funded', desc: 'Supporters fund approved requests', icon: Wallet },
              { step: '4', title: 'Daily Repayment', desc: 'Tenants pay back in small daily amounts', icon: Clock },
            ].map((item, i) => (
              <motion.div 
                key={i} 
                variants={itemVariants}
                className="text-center group"
              >
                <motion.div 
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className="relative mx-auto mb-6"
                >
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center text-2xl font-bold shadow-lg shadow-primary/25 group-hover:shadow-primary/40 transition-shadow">
                    {item.step}
                  </div>
                  <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center">
                    <item.icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                </motion.div>
                <h3 className="font-semibold text-lg mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <motion.div 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="grid md:grid-cols-3 gap-8"
          >
            {[
              { icon: Shield, color: 'primary', title: 'Secure & Trusted', desc: 'All transactions are verified and secure. Your money is always safe with us.' },
              { icon: TrendingUp, color: 'success', title: 'Guaranteed Returns', desc: 'Supporters earn 15% returns on funded rent requests. Low risk, high reward.' },
              { icon: Clock, color: 'warning', title: 'Quick Approval', desc: 'Most rent requests are approved within 24 hours. Fast funding, quick disbursement.' },
            ].map((feature, i) => (
              <motion.div 
                key={i}
                variants={itemVariants}
                whileHover={{ y: -5 }}
                className="relative flex items-start gap-4 p-6 rounded-2xl bg-card/50 border border-border/50 backdrop-blur-sm hover:border-primary/30 transition-all overflow-hidden group"
              >
                {/* Subtle purple gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/5 opacity-50 group-hover:opacity-80 transition-opacity" />
                <motion.div 
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  className={`p-3 rounded-xl bg-${feature.color}/10 shrink-0 relative z-10`}
                >
                  <feature.icon className={`h-6 w-6 text-${feature.color}`} />
                </motion.div>
                <div className="relative z-10">
                  <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-accent/8 to-primary/12" />
        <div className="absolute inset-0 bg-gradient-to-tl from-primary/10 via-transparent to-accent/10" />
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 0.6, scale: 1 }}
          viewport={{ once: true }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-primary/25 to-accent/15 rounded-full blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 0.3, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="absolute top-1/4 right-1/4 w-[300px] h-[300px] bg-gradient-to-br from-accent/20 to-primary/10 rounded-full blur-3xl"
        />
        
        <div className="container mx-auto px-4 text-center relative">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            <motion.div variants={itemVariants}>
              <Sparkles className="h-12 w-12 text-primary mx-auto mb-6" />
            </motion.div>
            <motion.h2 
              variants={itemVariants}
              className="text-4xl md:text-5xl font-bold mb-4"
            >
              Ready to Get Started?
            </motion.h2>
            <motion.p 
              variants={itemVariants}
              className="text-muted-foreground mb-10 max-w-xl mx-auto text-lg"
            >
              Join thousands of users who are already benefiting from the Welile platform.
            </motion.p>
            <motion.div variants={itemVariants}>
              <Link to="/auth">
                <motion.div 
                  whileHover={{ scale: 1.05, y: -2 }} 
                  whileTap={{ scale: 0.95 }}
                  className="inline-block"
                >
                  <Button size="lg" className="gap-2 h-14 px-10 text-lg shadow-xl shadow-primary/25">
                    Create Free Account
                    <ArrowRight className="h-5 w-5" />
                  </Button>
                </motion.div>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-12 bg-card/30 relative">
        <div className="absolute inset-0 bg-gradient-to-t from-primary/5 via-transparent to-transparent" />
        <div className="container mx-auto px-4">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-col md:flex-row items-center justify-between gap-6"
          >
            <WelileLogo />
            <p className="text-sm text-muted-foreground text-center">
              © {new Date().getFullYear()} Welile Technologies Limited • welile.com
            </p>
            <div className="flex gap-6">
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Sign In
              </Link>
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Sign Up
              </Link>
            </div>
          </motion.div>
        </div>
      </footer>
    </div>
  );
}
