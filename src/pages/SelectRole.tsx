import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Home, Users, Wallet, Building2, Shield, Check, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import WelileLogo from '@/components/WelileLogo';

const MANAGER_ACCESS_CODE = 'MYPART@WELILE';

interface RoleOption {
  value: AppRole;
  label: string;
  description: string;
  icon: React.ReactNode;
  requiresCode: boolean;
}

const roleOptions: RoleOption[] = [
  { 
    value: 'tenant', 
    label: 'Tenant', 
    description: 'Request rent facilitation and pay back over time',
    icon: <Home className="h-6 w-6" />,
    requiresCode: false
  },
  { 
    value: 'agent', 
    label: 'Agent', 
    description: 'Connect tenants to the platform and earn commissions',
    icon: <Users className="h-6 w-6" />,
    requiresCode: false
  },
  { 
    value: 'landlord', 
    label: 'Landlord', 
    description: 'Receive rent payments from tenants',
    icon: <Building2 className="h-6 w-6" />,
    requiresCode: false
  },
  { 
    value: 'supporter', 
    label: 'Supporter', 
    description: 'Fund rent requests and earn 15% returns',
    icon: <Wallet className="h-6 w-6" />,
    requiresCode: false
  },
  { 
    value: 'manager', 
    label: 'Manager', 
    description: 'Manage platform operations and approvals',
    icon: <Shield className="h-6 w-6" />,
    requiresCode: true
  },
];

export default function SelectRole() {
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [accessCode, setAccessCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showCodeInput, setShowCodeInput] = useState(false);
  
  const { addRole, user, roles, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Handle redirects in useEffect to avoid render-time navigation
  useEffect(() => {
    if (loading) return;
    
    if (!user) {
      navigate('/auth');
    } else if (roles.length > 0) {
      navigate('/dashboard');
    }
  }, [user, roles, loading, navigate]);

  // Show loading while auth is checking
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const toggleRole = (role: AppRole) => {
    if (role === 'manager') {
      if (selectedRoles.includes('manager')) {
        setSelectedRoles(selectedRoles.filter(r => r !== 'manager'));
        setShowCodeInput(false);
        setAccessCode('');
      } else {
        setShowCodeInput(true);
      }
    } else {
      if (selectedRoles.includes(role)) {
        setSelectedRoles(selectedRoles.filter(r => r !== role));
      } else {
        setSelectedRoles([...selectedRoles, role]);
      }
    }
  };

  const confirmManagerAccess = () => {
    if (accessCode === MANAGER_ACCESS_CODE) {
      setSelectedRoles([...selectedRoles, 'manager']);
      setShowCodeInput(false);
      toast({
        title: 'Manager Access Granted',
        description: 'You can now access the manager dashboard'
      });
    } else {
      toast({
        title: 'Invalid Code',
        description: 'The access code is incorrect',
        variant: 'destructive'
      });
    }
  };

  const handleContinue = async () => {
    if (selectedRoles.length === 0) {
      toast({
        title: 'Select a Role',
        description: 'Please select at least one role to continue',
        variant: 'destructive'
      });
      return;
    }

    setIsLoading(true);

    for (const role of selectedRoles) {
      const { error } = await addRole(role);
      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive'
        });
        setIsLoading(false);
        return;
      }
    }

    toast({
      title: 'Roles Added!',
      description: `You now have access to ${selectedRoles.length} dashboard${selectedRoles.length > 1 ? 's' : ''}`
    });
    
    navigate('/dashboard');
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Home
        </Link>

        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <WelileLogo linkToHome={false} />
          </div>
          <p className="text-muted-foreground">Choose your role(s) on the platform</p>
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle>Select Your Role(s)</CardTitle>
            <CardDescription>
              You can select multiple roles. You can always add more later.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {roleOptions.map((option) => {
                const isSelected = selectedRoles.includes(option.value);
                return (
                  <button
                    key={option.value}
                    onClick={() => toggleRole(option.value)}
                    className={`relative p-4 rounded-lg border-2 text-left transition-all ${
                      isSelected 
                        ? 'border-primary bg-primary/10' 
                        : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2">
                        <Check className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className={`mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`}>
                      {option.icon}
                    </div>
                    <h3 className="font-semibold">{option.label}</h3>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                    {option.requiresCode && (
                      <span className="inline-block mt-2 text-xs px-2 py-1 rounded bg-destructive/10 text-destructive">
                        Requires Access Code
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {showCodeInput && (
              <Card className="border-warning/50 bg-warning/5">
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-warning">
                      <Shield className="h-5 w-5" />
                      <span className="font-medium">Manager Access Required</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Enter the manager access code to unlock this role.
                    </p>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        placeholder="Enter access code"
                        value={accessCode}
                        onChange={(e) => setAccessCode(e.target.value)}
                      />
                      <Button onClick={confirmManagerAccess} variant="outline">
                        Verify
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedRoles.length > 0 && (
              <div className="p-3 rounded-lg bg-primary/10 text-sm">
                <span className="font-medium">Selected: </span>
                {selectedRoles.map(r => roleOptions.find(o => o.value === r)?.label).join(', ')}
              </div>
            )}

            <Button 
              onClick={handleContinue} 
              className="w-full" 
              disabled={selectedRoles.length === 0 || isLoading}
            >
              {isLoading ? 'Setting up...' : 'Continue to Dashboard'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
