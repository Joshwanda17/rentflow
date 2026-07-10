import {
  BarChart3, Shield, Banknote, ClipboardList, BookOpen, Server, Code, Lock, Wrench,
  TrendingUp, Users, Home, Building2, Handshake, Activity, Megaphone, Target, Share2,
  MessageSquare, HeadphonesIcon, AlertTriangle, Scale, UserCheck, FileText, Wallet,
  Crown, LayoutDashboard, Globe, DollarSign, UserCog, Truck, Layers, MinusCircle, Receipt,
  ShieldCheck, GraduationCap, Mail, FolderOpen, CalendarCheck, Landmark, KeyRound, SlidersHorizontal, HandCoins, Snowflake, ShoppingBag, MonitorSmartphone
  , Gauge
} from 'lucide-react';
import type { AppRole } from '@/hooks/auth/types';

export interface SidebarItem {
  label: string;
  icon: typeof BarChart3;
  id: string;
  route?: string;
}

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
  /**
   * When true, renders this section as a collapsible group with a chevron
   * toggle. Defaults to false (always-expanded section header).
   */
  collapsible?: boolean;
  /** Default open state when `collapsible` is true. */
  defaultOpen?: boolean;
  /** Optional icon shown next to the section title when collapsible. */
  icon?: typeof BarChart3;
}

export const executiveSidebarConfig: Record<string, SidebarSection[]> = {
  cto: [
    {
      title: 'Engineering',
      items: [
        { label: 'Overview', icon: LayoutDashboard, id: 'overview' },
        { label: 'System Infrastructure', icon: Server, id: 'infrastructure' },
        { label: 'API Management', icon: Code, id: 'api' },
        { label: 'Communication', icon: Mail, id: 'communication' },
        { label: 'OTP / SMS Logs', icon: MessageSquare, id: 'sms-delivery' },
        { label: 'SMS Exceptions', icon: ShieldCheck, id: 'sms-exceptions' },
        { label: 'Broadcast Status', icon: Megaphone, id: 'broadcast-status' },
        { label: 'Security Logs', icon: Lock, id: 'security' },
        { label: 'Platform Controls', icon: SlidersHorizontal, id: 'platform-controls' },
        { label: 'Agent Freeze', icon: Snowflake, id: 'agent-freeze' },
        { label: 'Reset Password', icon: KeyRound, id: 'password-reset' },
        { label: 'Developer Tools', icon: Wrench, id: 'tools' },
        { label: 'System Logs', icon: FileText, id: 'system-logs' },
        { label: 'Browser Compatibility', icon: MonitorSmartphone, id: 'browser-compat' },
        { label: 'Platform Users', icon: Users, id: 'platform-users', route: '/platform-users' },
        { label: 'Requisitions', icon: ClipboardList, id: 'requisitions' },
      ],
    },
  ],
  cfo: [
    {
      title: 'Quick Actions',
      items: [
        { label: 'Home', icon: BarChart3, id: 'overview' },
        { label: 'Send Money', icon: Wallet, id: 'wallet-payout' },
        { label: 'Wallet Activities', icon: ClipboardList, id: 'wallet-activities' },
        { label: 'Platform Impact', icon: Globe, id: 'platform-impact' },
        { label: 'Merchant Float Requests', icon: HandCoins, id: 'merchant-float' },
        { label: 'Request Funding (Director)', icon: HandCoins, id: 'requisitions' },
      ],
    },
    {
      title: 'Money In',
      items: [
        { label: 'Rent Collections', icon: Receipt, id: 'rent-collections' },
        { label: 'Investor Returns', icon: TrendingUp, id: 'roi-requests' },
        { label: 'Partner Top-ups', icon: TrendingUp, id: 'partner-topups' },
      ],
    },
    {
      title: 'Money Out',
      items: [
      { label: 'Rent Payouts', icon: Banknote, id: 'rent-payouts' },
        { label: 'Landlord Payout Float', icon: Home, id: 'landlord-payout-float' },
        { label: 'Already Funded Landlords', icon: Landmark, id: 'already-funded-landlords' },
        { label: 'Agent Commissions', icon: Banknote, id: 'commissions' },
        { label: 'Withdrawals', icon: Wallet, id: 'withdrawals' },
        { label: 'Withdrawal History', icon: ClipboardList, id: 'withdrawal-history' },
        { label: 'Staff & Payroll', icon: Users, id: 'payroll' },
        { label: 'Agent Requests', icon: FileText, id: 'agent-requisitions' },
        { label: 'Wallet Removals', icon: MinusCircle, id: 'retractions' },
        { label: 'Mark-Not-Funded Approvals', icon: ShieldCheck, id: 'unfunding-approvals' },
      ],
    },
    {
      title: 'Agents & Field',
      items: [
        { label: 'Agent Teams', icon: DollarSign, id: 'financial-agents' },
        { label: 'Cash-Out Agents', icon: Banknote, id: 'cashout-agents' },
        { label: 'Agent Activity', icon: Activity, id: 'agent-activity' },
        { label: 'Agent Rankings', icon: Crown, id: 'agent-rankings' },
        { label: 'Agent Float', icon: Building2, id: 'float-management' },
        { label: 'Delivery Tracking', icon: Truck, id: 'delivery-pipeline' },
        { label: 'Cash Check', icon: Scale, id: 'cash-reconciliation' },
        { label: 'Advances', icon: Banknote, id: 'advances' },
      ],
    },
    {
      title: 'Reports & Audit',
      items: [
        { label: 'Financial Reports', icon: BookOpen, id: 'statements' },
        { label: 'Revenue & Expenses', icon: TrendingUp, id: 'revenue-expenses' },
        { label: 'Payout Reports', icon: Banknote, id: 'payout-reports' },
        { label: 'House Listing Commission', icon: Home, id: 'house-listing-commission' },
        { label: 'Safety Buffer', icon: Shield, id: 'solvency' },
        { label: 'Reconciliation', icon: Scale, id: 'reconciliation' },
        { label: 'Full Ledger', icon: ClipboardList, id: 'ledger' },
        { label: 'Detailed Ledgers', icon: BookOpen, id: 'advanced-ledgers' },
        { label: 'Approval History', icon: ShieldCheck, id: 'approval-audit' },
        { label: 'Allocation Traces', icon: ClipboardList, id: 'allocation-traces' },
        { label: 'System Health', icon: Activity, id: 'ledger-health' },
        { label: 'SMS Delivery Log', icon: MessageSquare, id: 'sms-log' },
        { label: 'Capital Opportunities', icon: TrendingUp, id: 'capital-opportunities' },
        { label: 'Angel Pool', icon: Layers, id: 'angel-pool' },
      ],
    },
  ],
  coo: [
    {
      title: 'Financial Operations',
      items: [
        { label: 'Overview', icon: Activity, id: 'overview' },
        { label: 'Rent Approvals', icon: ClipboardList, id: 'rent-approvals' },
        { label: 'Tenants', icon: Home, id: 'tenants' },
        { label: 'Transactions', icon: ClipboardList, id: 'transactions' },
        { label: 'Agent Collections', icon: Users, id: 'collections' },
        { label: 'Daily Collections', icon: CalendarCheck, id: 'daily-collections' },
        { label: 'Wallets', icon: Wallet, id: 'wallets' },
        { label: 'Agents', icon: Activity, id: 'agent-activity' },
        { label: 'Payment Analytics', icon: BarChart3, id: 'analytics' },
      ],
    },
    {
      title: 'Governance',
      items: [
        { label: 'Financial Reports', icon: FileText, id: 'reports' },
        { label: 'Alerts', icon: AlertTriangle, id: 'alerts' },
        { label: 'Withdrawal Approvals', icon: Banknote, id: 'withdrawals' },
        { label: 'ROI Return Approvals', icon: ShieldCheck, id: 'roi-approvals' },
        { label: 'Partners', icon: Handshake, id: 'partners' },
        { label: 'Partner Finance', icon: Receipt, id: 'partner-finance' },
        { label: 'Partner Top-ups', icon: TrendingUp, id: 'partner-topups' },
        { label: 'Staff Performance', icon: UserCheck, id: 'staff-performance' },
        { label: 'Internship Applications', icon: GraduationCap, id: 'internships' },
        { label: 'Requisitions', icon: ClipboardList, id: 'requisitions' },
      ],
    },
    {
      title: 'Reports',
      icon: FolderOpen,
      collapsible: true,
      defaultOpen: false,
      items: [
        { label: 'Partner Ops',   icon: Handshake,     id: 'reports-partner-ops',   route: '/coo/reports/partner-ops' },
        { label: 'Agent Ops',     icon: Users,         id: 'reports-agent-ops',     route: '/coo/reports/agent-ops' },
        { label: 'Tenant Ops',    icon: Home,          id: 'reports-tenant-ops',    route: '/coo/reports/tenant-ops' },
        { label: 'Financial Ops', icon: Wallet,        id: 'reports-financial-ops', route: '/coo/reports/financial-ops' },
      ],
    },
  ],
  cmo: [
    {
      title: 'Marketing',
      items: [
        { label: 'Overview', icon: LayoutDashboard, id: 'overview' },
        { label: 'Growth Metrics', icon: TrendingUp, id: 'growth' },
        { label: 'Signup Trends', icon: UserCheck, id: 'signups' },
        { label: 'Referral Performance', icon: Share2, id: 'referrals' },
        { label: 'Campaign Analytics', icon: Target, id: 'campaigns' },
        { label: 'Merchandise', icon: ShoppingBag, id: 'merchandise' },
        { label: 'Requisitions', icon: ClipboardList, id: 'requisitions' },
      ],
    },
  ],
  crm: [
    {
      title: 'Customer Relations',
      items: [
        { label: 'Overview', icon: LayoutDashboard, id: 'overview' },
        { label: 'All Tenants', icon: Home, id: 'all-tenants' },
        { label: 'All Agents', icon: UserCog, id: 'all-agents' },
        { label: 'All Landlords', icon: Building2, id: 'all-landlords' },
        { label: 'Customer Issues', icon: MessageSquare, id: 'customer-issues' },
        { label: 'Tenant Support', icon: Handshake, id: 'tenant-support' },
        { label: 'Communications', icon: MessageSquare, id: 'communications' },
        { label: 'Requisitions', icon: ClipboardList, id: 'requisitions' },
      ],
    },
  ],
  ceo: [
    {
      title: 'Executive',
      items: [
        { label: 'Platform Overview', icon: Crown, id: 'overview' },
        { label: 'Revenue & Growth', icon: TrendingUp, id: 'revenue' },
        { label: 'Revenue Recognition', icon: Gauge, id: 'revenue-recognition' },
        { label: 'Users & Coverage', icon: Globe, id: 'users' },
        { label: 'Financial Health', icon: Shield, id: 'financial' },
        { label: 'Requisitions', icon: ClipboardList, id: 'requisitions' },
        { label: 'Staff Performance', icon: UserCheck, id: 'staff-performance' },
        { label: 'Angel Pool', icon: Layers, id: 'angel-pool' },
        { label: 'Mission & Goals', icon: Target, id: 'mission-goals' },
        { label: 'Role Management', icon: UserCog, id: 'role-management' },
      ],
    },
  ],
  hr: [
    {
      title: 'Human Resources',
      items: [
        { label: 'Overview', icon: LayoutDashboard, id: 'overview' },
        { label: 'Employee Directory', icon: Users, id: 'employees' },
        { label: 'Departments', icon: Building2, id: 'departments' },
        { label: 'System Users', icon: UserCog, id: 'user-management' },
        { label: 'Leave Management', icon: ClipboardList, id: 'leave' },
        { label: 'Payroll', icon: Banknote, id: 'payroll' },
        { label: 'Disciplinary', icon: AlertTriangle, id: 'disciplinary' },
        { label: 'Audit Trail', icon: FileText, id: 'audit' },
        { label: 'Internship Applications', icon: GraduationCap, id: 'internships' },
        { label: 'Requisitions', icon: ClipboardList, id: 'requisitions' },
      ],
    },
  ],
  super_admin: [
    {
      title: 'Administration',
      items: [
        { label: 'Dashboard Access', icon: LayoutDashboard, id: 'access-panel' },
        { label: 'User Management', icon: Users, id: 'users' },
        { label: 'Audit Log', icon: ClipboardList, id: 'audit' },
        { label: 'System Config', icon: Wrench, id: 'config' },
      ],
    },
  ],
  manager: [
    {
      title: 'Administration',
      items: [
        { label: 'Dashboard Access', icon: LayoutDashboard, id: 'access-panel' },
        { label: 'User Management', icon: Users, id: 'users' },
        { label: 'Deposits', icon: Banknote, id: 'deposits' },
        { label: 'Financial Ops', icon: Wallet, id: 'financial-ops' },
        { label: 'Internship Applications', icon: GraduationCap, id: 'internships' },
        { label: 'Audit Log', icon: ClipboardList, id: 'audit' },
      ],
    },
  ],
};

/** Map role to its dedicated route */
export const roleDashboardRoutes: Partial<Record<AppRole, string>> = {
  cto: '/cto/dashboard',
  cfo: '/cfo/dashboard',
  coo: '/coo/dashboard',
  cmo: '/cmo/dashboard',
  crm: '/crm/dashboard',
  ceo: '/ceo/dashboard',
  hr: '/hr/dashboard',
  operations: '/operations',
  manager: '/admin/dashboard',
  super_admin: '/admin/dashboard',
  employee: '/admin/dashboard',
};

/** Roles that get redirected away from /dashboard to their isolated environment */
export const ISOLATED_ROLES: AppRole[] = [
  'cto', 'cfo', 'coo', 'cmo', 'crm', 'ceo', 'hr', 'operations',
  'manager', 'super_admin', 'employee',
];

/** Role display names */
export const roleLabels: Record<AppRole, string> = {
  tenant: 'Tenant',
  agent: 'Agent',
  landlord: 'Landlord',
  supporter: 'Supporter',
  manager: 'Manager',
  ceo: 'CEO',
  coo: 'COO',
  cfo: 'CFO',
  cto: 'CTO',
  cmo: 'CMO',
  crm: 'CRM',
  employee: 'Employee',
  hr: 'HR',
  operations: 'Operations',
  super_admin: 'Super Admin',
};
