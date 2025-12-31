import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
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
  ChevronDown,
  MessageSquare,
  HelpCircle
} from 'lucide-react';
import WelileLogo from '@/components/WelileLogo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useLanguage } from '@/hooks/useLanguage';

const WHATSAPP_NUMBER = '256708257899';
const WHATSAPP_MESSAGE = 'Hello! I need help with Welile.';
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

      {/* FAQ Section */}
      <section id="faq" className="py-16 md:py-24 bg-muted/30">
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
              <HelpCircle className="h-4 w-4" />
              Common Questions
            </motion.span>
            <motion.h2 
              variants={fadeInUp}
              className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4"
            >
              Frequently Asked Questions
            </motion.h2>
            <motion.p 
              variants={fadeInUp}
              className="text-muted-foreground max-w-md mx-auto"
            >
              Got questions? We have answers. Here are the most common ones.
            </motion.p>
          </motion.div>

          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-50px" }}
            variants={fadeInUp}
            className="max-w-3xl mx-auto"
          >
            <Accordion type="single" collapsible className="space-y-4">
              <AccordionItem value="item-1" className="bg-card border border-border/50 rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  How does rent help work?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  When you need rent money, we pay your landlord directly on your behalf. You then pay us back in small, 
                  manageable daily amounts over 30-60 days. For example, if you borrow UGX 500,000, you might pay back 
                  around UGX 20,000 per day. This makes it much easier than paying a big lump sum at once.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-2" className="bg-card border border-border/50 rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  What do I need to apply for rent help?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  You need a valid phone number, your National ID, your landlord&apos;s details (name, phone, and bank/mobile money), 
                  and confirmation from your LC1 chairperson. No bank account is required - you can receive and pay through 
                  mobile money.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-3" className="bg-card border border-border/50 rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  How long does approval take?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  Most rent requests are reviewed and approved within 24 hours. Once approved and funded by a supporter, 
                  the money is sent directly to your landlord within the same day. You can track your application status 
                  in your dashboard.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-4" className="bg-card border border-border/50 rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  How do investors (supporters) earn returns?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  When you fund a rent request as a supporter, you earn 15% returns on your investment. For example, 
                  if you fund UGX 500,000, you receive UGX 575,000 back when the tenant completes their repayments. 
                  Returns are paid as the tenant makes their daily payments.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-5" className="bg-card border border-border/50 rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  Is my investment safe?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  We verify every tenant through their LC1 chairperson and landlord before approving any request. 
                  All tenants are required to have a referral from a verified agent. While all investments carry some risk, 
                  our verification process helps minimize defaults.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-6" className="bg-card border border-border/50 rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  How do agents earn money?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  Agents earn UGX 5,000 for every tenant they refer who gets approved. Plus, you earn 5% of every 
                  repayment your referred tenants make - forever! This means passive income as long as your 
                  referred tenants continue using Welile.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-7" className="bg-card border border-border/50 rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  What happens if I miss a payment?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  We understand that life happens. If you miss a payment, we will send you a reminder. However, 
                  consistently missing payments may affect your ability to get future rent help. If you are having 
                  difficulties, contact us through WhatsApp and we will try to find a solution together.
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="item-8" className="bg-card border border-border/50 rounded-xl px-6">
                <AccordionTrigger className="text-left font-semibold hover:no-underline py-5">
                  How do landlords receive payments?
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground pb-5">
                  Landlords register their bank account or mobile money number with us. When a tenant&apos;s rent request 
                  is approved and funded, we send the full rent amount directly to the landlord. No more chasing 
                  tenants for rent - we handle everything!
                </AccordionContent>
              </AccordionItem>
            </Accordion>
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
              Join over 140,000 Ugandans already using Welile. It is free to sign up.
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

      {/* Floating WhatsApp Button */}
      <motion.a
        href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`}
        target="_blank"
        rel="noopener noreferrer"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1, type: 'spring', stiffness: 200 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#25D366] text-white px-4 py-3 rounded-full shadow-lg hover:shadow-xl transition-shadow safe-area-bottom"
        aria-label="Chat on WhatsApp"
      >
        <svg 
          viewBox="0 0 24 24" 
          className="h-6 w-6 fill-current"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        <span className="hidden sm:inline font-medium">Chat with us</span>
      </motion.a>
    </div>
  );
}
