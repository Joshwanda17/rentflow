import { Link } from 'react-router-dom';
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
  Banknote
} from 'lucide-react';
import WelileLogo from '@/components/WelileLogo';

const userTypes = [
  {
    title: 'Tenant',
    description: 'Need rent money now? Get up to 90 days rent upfront and pay back daily.',
    icon: Home,
    color: 'primary',
    benefits: ['Get rent paid to your landlord instantly', 'Pay back in small daily amounts', 'No bank account required'],
    cta: 'Request Rent Now'
  },
  {
    title: 'Agent',
    description: 'Earn money by connecting tenants to our platform. Share your link and earn commissions.',
    icon: Users,
    color: 'warning',
    benefits: ['Earn UGX 5,000 per approved tenant', 'Get 5% of all tenant repayments', 'Simple referral link system'],
    cta: 'Start Earning'
  },
  {
    title: 'Supporter',
    description: 'Invest in rent facilitation and earn guaranteed returns on your capital.',
    icon: Wallet,
    color: 'success',
    benefits: ['Earn 15% returns on investments', 'Fund verified rent requests', 'Low-risk, high-impact lending'],
    cta: 'Start Investing'
  },
  {
    title: 'Landlord',
    description: 'Receive your rent on time, every time. No more chasing tenants for payments.',
    icon: Building2,
    color: 'accent',
    benefits: ['Get paid directly by the platform', 'Never miss a rent payment', 'Simple registration process'],
    cta: 'Get Paid On Time'
  },
];

const stats = [
  { value: 'UGX 500M+', label: 'Rent Facilitated' },
  { value: '2,000+', label: 'Happy Tenants' },
  { value: '500+', label: 'Active Agents' },
  { value: '15%', label: 'Supporter Returns' },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <WelileLogo />
          <div className="flex items-center gap-3">
            <Link to="/auth">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link to="/auth">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-success/5" />
        <div className="container mx-auto px-4 py-20 md:py-32 relative">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 animate-fade-in">
              Rent Facilitation
              <span className="text-primary"> Made Simple</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8 animate-fade-in">
              We connect tenants who need rent money with supporters who want to earn returns. 
              Landlords get paid on time, agents earn commissions. Everyone wins.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in">
              <Link to="/auth">
                <Button size="lg" className="gap-2 w-full sm:w-auto">
                  Get Started Free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Button variant="outline" size="lg" className="gap-2">
                Learn How It Works
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y border-border bg-secondary/30">
        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl md:text-4xl font-bold font-mono text-primary">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* User Types Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Choose Your Role</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Whether you're looking for rent money, want to earn commissions, invest for returns, 
              or receive guaranteed payments - we've got you covered.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {userTypes.map((type, i) => (
              <Card 
                key={i} 
                className="glass-card hover:border-primary/50 transition-all duration-300 hover:-translate-y-1 group"
              >
                <CardContent className="pt-6">
                  <div className={`p-3 rounded-lg bg-${type.color}/10 w-fit mb-4`}>
                    <type.icon className={`h-6 w-6 text-${type.color}`} />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{type.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{type.description}</p>
                  
                  <ul className="space-y-2 mb-6">
                    {type.benefits.map((benefit, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-success mt-0.5 shrink-0" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>

                  <Link to="/auth">
                    <Button 
                      variant="outline" 
                      className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                    >
                      {type.cta}
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-20 bg-secondary/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-muted-foreground">Simple steps to get started</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {[
              { step: '1', title: 'Sign Up', desc: 'Create your free account and choose your role', icon: Users },
              { step: '2', title: 'Submit Request', desc: 'Tenants submit rent requests with landlord details', icon: Banknote },
              { step: '3', title: 'Get Funded', desc: 'Supporters fund approved requests', icon: Wallet },
              { step: '4', title: 'Daily Repayment', desc: 'Tenants pay back in small daily amounts', icon: Clock },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10 shrink-0">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Secure & Trusted</h3>
                <p className="text-sm text-muted-foreground">
                  All transactions are verified and secure. Your money is always safe with us.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-success/10 shrink-0">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Guaranteed Returns</h3>
                <p className="text-sm text-muted-foreground">
                  Supporters earn 15% returns on funded rent requests. Low risk, high reward.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-warning/10 shrink-0">
                <Clock className="h-6 w-6 text-warning" />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Quick Approval</h3>
                <p className="text-sm text-muted-foreground">
                  Most rent requests are approved within 24 hours. Fast funding, quick disbursement.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-primary/5">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to Get Started?</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join thousands of users who are already benefiting from the RentAccess platform.
          </p>
          <Link to="/auth">
            <Button size="lg" className="gap-2">
              Create Free Account
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <WelileLogo />
            <p className="text-sm text-muted-foreground text-center">
              © {new Date().getFullYear()} Welile Technologies Limited • welile.com
            </p>
            <div className="flex gap-4">
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
                Sign In
              </Link>
              <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
                Sign Up
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
