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
  Phone,
  Menu,
  X,
  Play,
  Star,
  MessageCircle,
  Zap,
  ChevronDown
} from 'lucide-react';
import WelileLogo from '@/components/WelileLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLanguage } from '@/hooks/useLanguage';
import { useState } from 'react';

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } }
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } }
};

export default function Index() {
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const userTypes = [
    {
      title: 'Need Rent Money?',
      subtitle: t.tenant,
      description: 'Get your rent paid to your landlord today. Pay back in small daily amounts that fit your budget.',
      icon: Home,
      color: 'bg-primary',
      benefits: ['No bank account needed', 'Pay back daily', 'Quick approval'],
      cta: 'Get Rent Help',
      link: '/auth'
    },
    {
      title: 'Want to Earn?',
      subtitle: t.agent,
      description: 'Earn UGX 5,000 for every tenant you refer. Plus 5% of their repayments forever.',
      icon: Users,
      color: 'bg-success',
      benefits: ['Earn per referral', 'Passive income', 'Simple to start'],
      cta: 'Start Earning',
      link: '/auth'
    },
    {
      title: 'Want to Invest?',
      subtitle: t.supporter,
      description: 'Fund rent requests and earn 15% returns. Help people while growing your money.',
      icon: Wallet,
      color: 'bg-warning',
      benefits: ['15% returns', 'Low risk', 'Help others'],
      cta: 'Start Investing',
      link: '/auth'
    },
    {
      title: 'Own Property?',
      subtitle: t.landlord,
      description: 'Never miss a rent payment again. We pay you directly, guaranteed.',
      icon: Building2,
      color: 'bg-chart-3',
      benefits: ['Guaranteed payments', 'No chasing tenants', 'Easy setup'],
      cta: 'Register Property',
      link: '/auth'
    },
  ];

  const steps = [
    { 
      number: '1', 
      title: 'Sign Up', 
      description: 'Create your free account in under 2 minutes. Just need your phone number.',
      icon: Phone
    },
    { 
      number: '2', 
      title: 'Choose Your Role', 
      description: 'Select if you need rent help, want to earn, invest, or register as a landlord.',
      icon: Users
    },
    { 
      number: '3', 
      title: 'Get Started', 
      description: 'Complete a simple form and our team reviews your request within 24 hours.',
      icon: Clock
    },
    { 
      number: '4', 
      title: 'Receive Money', 
      description: 'Once approved, money is sent directly to where it needs to go.',
      icon: Banknote
    },
  ];

  const testimonials = [
    {
      name: 'Sarah M.',
      role: 'Tenant',
      text: 'Welile saved me when I was about to be evicted. Now I pay back small amounts daily and it\'s so manageable.',
      rating: 5
    },
    {
      name: 'John K.',
      role: 'Agent',
      text: 'I\'ve earned over UGX 500,000 just by telling my neighbors about Welile. Easy money!',
      rating: 5
    },
    {
      name: 'Grace N.',
      role: 'Supporter',
      text: 'My investment has grown 15% in just 3 months. Better than any bank!',
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile-First Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-md safe-area-top">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <WelileLogo className="h-10" />
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6">
              <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                How It Works
              </a>
              <a href="#for-you" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                For You
              </a>
              <Link to="/marketplace" className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
                Shop
              </Link>
            </nav>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-3">
              <LanguageSwitcher variant="compact" />
              <ThemeToggle />
              <Link to="/auth">
                <Button variant="ghost" size="sm">{t.signIn}</Button>
              </Link>
              <Link to="/auth">
                <Button size="sm" className="gap-2">
                  {t.getStarted}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <div className="flex md:hidden items-center gap-2">
              <ThemeToggle />
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden pt-4 pb-2 border-t border-border/50 mt-3"
            >
              <nav className="flex flex-col gap-2">
                <a 
                  href="#how-it-works" 
                  className="py-3 px-4 text-base font-medium rounded-lg hover:bg-muted transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  How It Works
                </a>
                <a 
                  href="#for-you" 
                  className="py-3 px-4 text-base font-medium rounded-lg hover:bg-muted transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  For You
                </a>
                <Link 
                  to="/marketplace" 
                  className="py-3 px-4 text-base font-medium rounded-lg hover:bg-muted transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Shop
                </Link>
                <div className="flex items-center gap-2 px-4 py-2">
                  <LanguageSwitcher />
                </div>
                <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                  <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full">{t.signIn}</Button>
                  </Link>
                  <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full gap-2">
                      {t.getStarted}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </nav>
            </motion.div>
          )}
        </div>
      </header>

      {/* Hero Section - Mobile Optimized */}
      <section className="relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-primary/10 to-background" />
        <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-br from-primary/20 to-transparent" />
        
        <div className="container mx-auto px-4 pt-8 pb-16 md:pt-16 md:pb-24 relative">
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="max-w-3xl mx-auto text-center"
          >
            {/* Trust Badge */}
            <motion.div variants={fadeInUp} className="mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 border border-success/20 text-sm font-medium text-success">
                <Shield className="h-4 w-4" />
                Trusted by 140,000+ Ugandans
              </span>
            </motion.div>

            {/* Main Headline */}
            <motion.h1 
              variants={fadeInUp}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4 md:mb-6"
            >
              Rent Help When
              <span className="block text-primary">You Need It Most</span>
            </motion.h1>

            {/* Simple Description */}
            <motion.p 
              variants={fadeInUp}
              className="text-base sm:text-lg md:text-xl text-muted-foreground mb-8 max-w-xl mx-auto px-4"
            >
              Can't pay rent this month? We pay your landlord today. 
              You pay us back in small daily amounts.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div 
              variants={fadeInUp}
              className="flex flex-col sm:flex-row gap-3 justify-center px-4"
            >
              <Link to="/auth" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto h-14 px-8 text-lg gap-2 shadow-lg shadow-primary/25">
                  Get Rent Help Now
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
              <a href="#how-it-works" className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="w-full sm:w-auto h-14 px-8 text-lg gap-2">
                  <Play className="h-5 w-5" />
                  See How It Works
                </Button>
              </a>
            </motion.div>

            {/* Quick Stats - Mobile Friendly */}
            <motion.div 
              variants={fadeInUp}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12 pt-8 border-t border-border/50"
            >
              {[
                { value: 'UGX 2B+', label: 'Rent Paid' },
                { value: '140K+', label: 'Happy Users' },
                { value: '24hrs', label: 'Fast Approval' },
                { value: '15%', label: 'Investor Returns' },
              ].map((stat, i) => (
                <div key={i} className="text-center py-2">
                  <p className="text-xl sm:text-2xl md:text-3xl font-bold text-primary">{stat.value}</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* Scroll Indicator */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="hidden md:flex justify-center mt-12"
          >
            <a href="#how-it-works" className="flex flex-col items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
              <span className="text-sm">Scroll to learn more</span>
              <ChevronDown className="h-5 w-5 animate-bounce" />
            </a>
          </motion.div>
        </div>
      </section>

      {/* How It Works - Super Simple */}
      <section id="how-it-works" className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="text-center mb-12"
          >
            <motion.span 
              variants={fadeInUp}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium text-primary mb-4"
            >
              <Zap className="h-4 w-4" />
              Simple Process
            </motion.span>
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4"
            >
              How It Works
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-muted-foreground max-w-md mx-auto"
            >
              Getting help with rent is easy. Just 4 simple steps.
            </motion.p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto"
          >
            {steps.map((step, i) => (
              <motion.div 
                key={i}
                variants={fadeInUp}
                className="relative"
              >
                {/* Connection Line */}
                {i < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-10 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-primary/50 to-primary/20" />
                )}
                
                <Card className="h-full border-border/50 hover:border-primary/30 hover:shadow-lg transition-all">
                  <CardContent className="pt-6 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-bold mb-4 shadow-lg shadow-primary/25">
                      {step.number}
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* For You Section - User Types */}
      <section id="for-you" className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="text-center mb-12"
          >
            <motion.span 
              variants={fadeInUp}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-success/10 border border-success/20 text-sm font-medium text-success mb-4"
            >
              <Star className="h-4 w-4" />
              Choose Your Path
            </motion.span>
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4"
            >
              Made For You
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-muted-foreground max-w-md mx-auto"
            >
              Whether you need help, want to earn, or invest - we've got you covered.
            </motion.p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {userTypes.map((type, i) => (
              <motion.div key={i} variants={fadeInUp}>
                <Card className="h-full border-border/50 hover:border-primary/30 hover:shadow-xl transition-all group overflow-hidden">
                  <CardContent className="pt-6">
                    <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl ${type.color} text-white mb-4 group-hover:scale-110 transition-transform`}>
                      <type.icon className="h-7 w-7" />
                    </div>
                    
                    <h3 className="text-xl font-bold mb-1">{type.title}</h3>
                    <p className="text-sm text-primary font-medium mb-3">{type.subtitle}</p>
                    <p className="text-sm text-muted-foreground mb-4">{type.description}</p>
                    
                    <ul className="space-y-2 mb-6">
                      {type.benefits.map((benefit, j) => (
                        <li key={j} className="flex items-center gap-2 text-sm">
                          <CheckCircle className="h-4 w-4 text-success shrink-0" />
                          <span>{benefit}</span>
                        </li>
                      ))}
                    </ul>

                    <Link to={type.link}>
                      <Button className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors" variant="outline">
                        {type.cta}
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Testimonials - Social Proof */}
      <section className="py-16 md:py-24 bg-muted/30">
        <div className="container mx-auto px-4">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="text-center mb-12"
          >
            <motion.span 
              variants={fadeInUp}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-warning/10 border border-warning/20 text-sm font-medium text-warning mb-4"
            >
              <MessageCircle className="h-4 w-4" />
              Real Stories
            </motion.span>
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4"
            >
              People Love Welile
            </motion.h2>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto"
          >
            {testimonials.map((testimonial, i) => (
              <motion.div key={i} variants={fadeInUp}>
                <Card className="h-full border-border/50">
                  <CardContent className="pt-6">
                    <div className="flex gap-1 mb-4">
                      {[...Array(testimonial.rating)].map((_, j) => (
                        <Star key={j} className="h-4 w-4 fill-warning text-warning" />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground mb-4 italic">"{testimonial.text}"</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">{testimonial.name[0]}</span>
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{testimonial.name}</p>
                        <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="text-center mb-12"
          >
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4"
            >
              Why Choose Welile?
            </motion.h2>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={stagger}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto"
          >
            {[
              { 
                icon: Shield, 
                title: 'Safe & Secure', 
                description: 'Your money and information are always protected with us.' 
              },
              { 
                icon: Clock, 
                title: 'Fast Approval', 
                description: 'Most requests approved within 24 hours. No long waiting.' 
              },
              { 
                icon: TrendingUp, 
                title: 'Grow Your Money', 
                description: 'Investors earn 15% returns. Better than any bank account.' 
              },
            ].map((feature, i) => (
              <motion.div 
                key={i}
                variants={fadeInUp}
                className="flex items-start gap-4 p-6 rounded-2xl bg-card border border-border/50 hover:border-primary/30 hover:shadow-lg transition-all"
              >
                <div className="shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 md:py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/10 via-primary/5 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent" />
        
        <div className="container mx-auto px-4 text-center relative">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.div 
              variants={fadeInUp}
              className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6"
            >
              <Zap className="h-8 w-8 text-primary" />
            </motion.div>
            
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4"
            >
              Ready to Get Started?
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-muted-foreground mb-8 max-w-md mx-auto"
            >
              Join over 140,000 Ugandans already using Welile. It's free to sign up.
            </motion.p>
            <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center px-4">
              <Link to="/auth" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-auto h-14 px-10 text-lg gap-2 shadow-xl shadow-primary/25">
                  Create Free Account
                  <ArrowRight className="h-5 w-5" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer - Simple & Clean */}
      <footer className="border-t border-border/50 py-8 bg-card/30 safe-area-bottom">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <WelileLogo />
            
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
              <a href="#how-it-works" className="hover:text-primary transition-colors">How It Works</a>
              <a href="#for-you" className="hover:text-primary transition-colors">For You</a>
              <Link to="/marketplace" className="hover:text-primary transition-colors">Shop</Link>
              <Link to="/auth" className="hover:text-primary transition-colors">{t.signIn}</Link>
            </div>

            <div className="flex items-center gap-3">
              <LanguageSwitcher variant="compact" />
            </div>
          </div>
          
          <div className="mt-6 pt-6 border-t border-border/50 text-center">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} Welile Technologies Limited. {t.allRightsReserved}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
