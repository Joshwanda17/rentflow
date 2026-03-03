import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Menu, 
  X, 
  UserPlus, 
  ArrowDownCircle,
  TrendingUp,
  Store,
  History,
  Receipt,
  Banknote,
  Users,
  HandCoins,
  Share2,
  Download,
  Trophy,
  Target,
  FileText,
  Handshake,
  ChevronRight,
  ChevronDown,
  Calculator,
  Home,
  Settings,
  HelpCircle,
  ScrollText,
  BarChart3,
  PiggyBank,
  Building2,
  Calendar,
  Wallet,
  ShieldCheck,
  MapPin,
  Zap,
  Droplets,
  Phone,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticTap, hapticSuccess } from '@/lib/haptics';
import { Separator } from '@/components/ui/separator';

interface AgentMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegisterUser: () => void;
  onDeposit: () => void;
  onPostRentRequest: () => void;
  onInviteSubAgent: () => void;
  onOpenEarningsRank: () => void;
  onManageProperty?: () => void;
  onViewManagedProperties?: () => void;
  onViewMyRentRequests?: () => void;
  onTopUpTenant?: () => void;
  onViewTenants?: () => void;
  onInvestForPartner?: () => void;
}

interface MenuSection {
  title: string;
  items: MenuItem[];
}

interface MenuItem {
  icon: typeof Menu;
  label: string;
  description?: string;
  path?: string;
  onClick?: () => void;
  badge?: string;
  color?: string;
}

export function AgentMenuDrawer({ 
  open, 
  onOpenChange, 
  onRegisterUser,
  onDeposit,
  onPostRentRequest,
  onInviteSubAgent,
  onOpenEarningsRank,
  onManageProperty,
  onViewManagedProperties,
  onViewMyRentRequests,
  onTopUpTenant,
  onViewTenants,
  onInvestForPartner,
}: AgentMenuDrawerProps) {
  const navigate = useNavigate();
  const [tenantGuideOpen, setTenantGuideOpen] = useState(false);
  const [landlordGuideOpen, setLandlordGuideOpen] = useState(false);

  const handleClose = () => {
    hapticTap();
    onOpenChange(false);
  };

  const handleItemClick = (item: MenuItem) => {
    hapticSuccess();
    onOpenChange(false);
    if (item.onClick) {
      item.onClick();
    } else if (item.path) {
      navigate(item.path);
    }
  };

  const menuSections: MenuSection[] = [
    {
      title: 'Agent Actions',
      items: [
        ...(onInvestForPartner ? [{ 
          icon: HandCoins, 
          label: 'Invest for Partner', 
          description: 'Fund rent pool on behalf of a partner',
          onClick: onInvestForPartner,
          color: 'text-emerald-600',
          badge: 'Proxy'
        } as MenuItem] : []),
        ...(onViewTenants ? [{ 
          icon: Users, 
          label: 'My Tenants', 
          description: 'Tap a tenant to see repayment schedule',
          onClick: onViewTenants,
          color: 'text-primary',
          badge: 'Priority'
        } as MenuItem] : []),
        { 
          icon: UserPlus, 
          label: 'Register New User', 
          description: 'Onboard tenants, landlords & more',
          onClick: onRegisterUser,
          color: 'text-primary'
        },
        { 
          icon: ArrowDownCircle, 
          label: 'Deposit for User', 
          description: 'Add funds to user wallet',
          onClick: onDeposit,
          color: 'text-success'
        },
        ...(onTopUpTenant ? [{ 
          icon: Wallet, 
          label: 'Top Up Tenant Wallet', 
          description: 'Help tenant deposit to their wallet',
          onClick: onTopUpTenant,
          color: 'text-emerald-500'
        } as MenuItem] : []),
        { 
          icon: FileText, 
          label: 'Post Rent Request', 
          description: 'On behalf of tenant',
          onClick: onPostRentRequest,
          color: 'text-blue-500'
        },
        ...(onViewMyRentRequests ? [{ 
          icon: ScrollText, 
          label: 'My Rent Requests', 
          description: 'View & verify your posted requests',
          onClick: onViewMyRentRequests,
          color: 'text-indigo-500'
        }, {
          icon: Calendar, 
          label: 'Tenant Repayment Schedules', 
          description: 'View, download & share PDF / WhatsApp',
          onClick: onViewMyRentRequests,
          color: 'text-primary',
          badge: 'PDF & WhatsApp'
        }] : []),
        { 
          icon: Handshake, 
          label: 'Register Sub-Agent', 
          description: 'Grow your team',
          onClick: onInviteSubAgent,
          color: 'text-amber-500'
        },
        ...(onManageProperty ? [{ 
          icon: Building2, 
          label: 'Manage Property for Landlord', 
          description: 'For landlords without smartphones',
          onClick: onManageProperty,
          color: 'text-orange-500',
          badge: '2% fee'
        }] : []),
        ...(onViewManagedProperties ? [{ 
          icon: Home, 
          label: 'My Managed Properties', 
          description: 'Properties you manage & payouts',
          onClick: onViewManagedProperties,
          color: 'text-teal-500'
        }] : []),
      ]
    },
    {
      title: 'Earnings & Growth',
      items: [
        { 
          icon: Trophy, 
          label: 'Earnings & Rank System', 
          description: 'See how you earn & level up',
          onClick: onOpenEarningsRank,
          color: 'text-amber-500'
        },
        { 
          icon: TrendingUp, 
          label: 'My Earnings', 
          description: 'View detailed earnings',
          path: '/earnings',
          color: 'text-success'
        },
        { 
          icon: Target, 
          label: 'Goals & Progress', 
          description: 'Track your targets',
          path: '/agent-analytics',
          color: 'text-primary'
        },
        { 
          icon: Users, 
          label: 'My Referrals', 
          description: 'Users you brought in',
          path: '/referrals',
          color: 'text-purple-500'
        },
        { 
          icon: Share2, 
          label: 'Share & Earn', 
          description: 'Invite others for rewards',
          path: '/benefits',
          color: 'text-pink-500'
        },
      ]
    },
    {
      title: 'Business Tools',
      items: [
        { 
          icon: Store, 
          label: 'Welile Shop', 
          description: 'Buy, sell & earn loan access',
          path: '/shop',
          color: 'text-orange-500',
          badge: 'Loans up to 30M'
        },
        { 
          icon: Receipt, 
          label: 'My Receipts', 
          description: 'Scan receipts to earn',
          path: '/my-receipts',
          color: 'text-teal-500'
        },
        { 
          icon: Banknote, 
          label: 'My Loans', 
          description: 'View & manage loans',
          path: '/my-loans',
          color: 'text-green-500'
        },
        { 
          icon: History, 
          label: 'Transactions', 
          description: 'Payment history',
          path: '/transactions',
          color: 'text-blue-500'
        },
        { 
          icon: FileText, 
          label: 'Financial Statement', 
          description: 'Download your statement',
          path: '/financial-statement',
          color: 'text-indigo-500'
        },
        { 
          icon: Calculator, 
          label: 'Calculator', 
          description: 'Rent & interest calculator',
          path: '/calculator',
          color: 'text-indigo-500'
        },
      ]
    },
    {
      title: 'Management',
      items: [
        { 
          icon: BarChart3, 
          label: 'Agent Analytics', 
          description: 'Performance metrics',
          path: '/agent-analytics',
          color: 'text-purple-500'
        },
        { 
          icon: Users, 
          label: 'My Sub-Agents', 
          description: 'Manage your team',
          path: '/sub-agents',
          color: 'text-blue-500'
        },
        { 
          icon: PiggyBank, 
          label: 'My Withdrawals', 
          description: 'Commission payouts & wallet withdrawals',
          path: '/earnings',
          color: 'text-success'
        },
      ]
    },
    {
      title: 'More',
      items: [
        { 
          icon: Download, 
          label: 'Share App', 
          description: 'Invite friends to Welile',
          path: '/install',
          color: 'text-primary'
        },
        { 
          icon: ScrollText, 
          label: 'Agent Agreement', 
          description: 'Terms & conditions',
          path: '/agent-agreement',
          color: 'text-muted-foreground'
        },
        { 
          icon: Settings, 
          label: 'Settings', 
          description: 'Account preferences',
          path: '/settings',
          color: 'text-muted-foreground'
        },
        { 
          icon: HelpCircle, 
          label: 'Help & Support', 
          description: 'Get assistance',
          path: '/help',
          color: 'text-muted-foreground'
        },
      ]
    },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-[85%] max-w-sm bg-background z-[101] shadow-2xl overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-card">
              <div>
                <h2 className="font-bold text-lg">Menu</h2>
                <p className="text-xs text-muted-foreground">All agent features</p>
              </div>
              <button
                onClick={handleClose}
                className="p-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <div className="p-4 space-y-6">
                {menuSections.map((section, sectionIndex) => (
                  <div key={section.title}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
                      {section.title}
                    </h3>
                    <div className="space-y-1">
                      {section.items.map((item, itemIndex) => (
                        <motion.button
                          key={item.label}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: (sectionIndex * 0.05) + (itemIndex * 0.02) }}
                          onClick={() => handleItemClick(item)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 active:scale-[0.98] transition-all text-left"
                        >
                          <div className={cn(
                            "p-2 rounded-lg bg-muted/80",
                            item.color
                          )}>
                            <item.icon className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-sm truncate">{item.label}</p>
                              {item.badge && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-success/20 text-success rounded-full">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </motion.button>
                      ))}
                    </div>
                    {sectionIndex < menuSections.length - 1 && (
                      <Separator className="mt-4" />
                    )}
                  </div>
                ))}
              </div>


              {/* Verification Guides */}
              <div className="px-4 pb-2">
                <Separator className="mb-4" />
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-1">
                  Verification Guides
                </h3>

                {/* Tenant Verification Guide */}
                <button
                  onClick={() => { hapticTap(); setTenantGuideOpen(!tenantGuideOpen); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10 mb-2 text-left touch-manipulation"
                >
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">How to Verify a Tenant</p>
                    <p className="text-xs text-muted-foreground">Step-by-step field guide</p>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", tenantGuideOpen && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {tenantGuideOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mb-3"
                    >
                      <div className="space-y-2 px-2 py-3 rounded-xl bg-muted/40 border border-border/60 text-xs">
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">1</span>
                          <div><p className="font-medium">Visit the Tenant's Residence</p><p className="text-muted-foreground">Go to the tenant's actual home address to confirm they live there.</p></div>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">2</span>
                          <div><p className="font-medium flex items-center gap-1"><Zap className="h-3 w-3" /> Verify Electricity Meter</p><p className="text-muted-foreground">Check the UMEME/UEDCL meter number and confirm it's in the landlord's name.</p></div>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">3</span>
                          <div><p className="font-medium flex items-center gap-1"><Droplets className="h-3 w-3" /> Verify Water Meter</p><p className="text-muted-foreground">Check the NWSC water meter number and confirm it's in the landlord's name.</p></div>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">4</span>
                          <div><p className="font-medium flex items-center gap-1"><Phone className="h-3 w-3" /> Confirm Mobile Money Details</p><p className="text-muted-foreground">Verify the tenant's MM registered name matches their phone number.</p></div>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-bold">5</span>
                          <div><p className="font-medium flex items-center gap-1"><MapPin className="h-3 w-3" /> Capture GPS Location</p><p className="text-muted-foreground">Use the "Capture GPS" button to pin the tenant's residence on Google Maps.</p></div>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-success text-success-foreground flex items-center justify-center text-[10px] font-bold">✓</span>
                          <div><p className="font-medium text-success">Tap "Verify" to Confirm</p><p className="text-muted-foreground">Once all checks pass, tap the Verify button on the rent request. You earn <strong>UGX 10,000</strong> + <strong>5%</strong> ongoing commission!</p></div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Landlord Verification Guide */}
                <button
                  onClick={() => { hapticTap(); setLandlordGuideOpen(!landlordGuideOpen); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 mb-2 text-left touch-manipulation"
                >
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">How to Verify a Landlord</p>
                    <p className="text-xs text-muted-foreground">Registration & verification steps</p>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", landlordGuideOpen && "rotate-180")} />
                </button>
                <AnimatePresence>
                  {landlordGuideOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mb-3"
                    >
                      <div className="space-y-2 px-2 py-3 rounded-xl bg-muted/40 border border-border/60 text-xs">
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">1</span>
                          <div><p className="font-medium">Visit the Landlord's Property</p><p className="text-muted-foreground">Travel to the property to verify it exists and matches the description.</p></div>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">2</span>
                          <div><p className="font-medium">Collect Landlord's MM Details</p><p className="text-muted-foreground">Record their Mobile Money registered name and number. Verify the name matches the phone.</p></div>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">3</span>
                          <div><p className="font-medium flex items-center gap-1"><Zap className="h-3 w-3" /> Record Utility Meters</p><p className="text-muted-foreground">Note the UMEME/UEDCL electricity and NWSC water meter numbers. Confirm they are in the landlord's name.</p></div>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">4</span>
                          <div><p className="font-medium">Get LC1 Chairperson Details</p><p className="text-muted-foreground">Record the Local Council 1 Chairperson's name, phone number, and village/cell. This is mandatory.</p></div>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">5</span>
                          <div><p className="font-medium flex items-center gap-1"><MapPin className="h-3 w-3" /> Capture GPS Location</p><p className="text-muted-foreground">Tap "Capture GPS" at the property or enter the address manually. Both work.</p></div>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] font-bold">6</span>
                          <div><p className="font-medium">Register & Share Activation Link</p><p className="text-muted-foreground">Submit the registration. Share the WhatsApp activation link so the landlord can accept and create a password.</p></div>
                        </div>
                        <div className="flex gap-2">
                          <span className="shrink-0 h-5 w-5 rounded-full bg-success text-success-foreground flex items-center justify-center text-[10px] font-bold">✓</span>
                          <div><p className="font-medium text-success">Landlord Verified!</p><p className="text-muted-foreground">Once the landlord accepts via the /join link, they are verified and can receive rent payments through Welile.</p></div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer Padding */}
              <div className="h-8" />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
