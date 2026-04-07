import {
  BarChart3, Shield, Banknote, ClipboardList, BookOpen, Server, Code, Lock, Wrench,
  TrendingUp, Users, Home, Building2, Handshake, Activity, Megaphone, Target, Share2,
  MessageSquare, HeadphonesIcon, AlertTriangle, Scale, UserCheck, FileText, Wallet,
  Crown, LayoutDashboard, Globe, DollarSign, UserCog, Truck, Layers, MinusCircle, Receipt,
  ShieldCheck
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
}

export const executiveSidebarConfig: Record<string, SidebarSection[]> = {
  cto: [
    {
      title: 'Engineering',
      items: [
        { label: 'Overview', icon: LayoutDashboard, id: 'overview' },
        { label: 'System Infrastructure', icon: Server, id: 'infrastructure' },
        { label: 'API Management', icon: Code, id: 'api' },
        { label: 'Security Logs', icon: Lock, id: 'security' },
        { label: 'Developer Tools', icon: Wrench, id: 'tools' },
        { label: 'System Logs', icon: FileText, id: 'system-logs' },
        { label: 'Platform Users', icon: Users, id: 'platform-users', route: '/platform-users' },
      ],
    },
  ],
  cfo: [
    {
      title: 'Finance',
      items: [
        { label: 'Overview', icon: BarChart3, id: 'overview' },
        { label: 'ROI Requests', icon: TrendingUp, id: 'roi-requests' },
        { label: 'Rent Payouts', icon: Banknote, id: 'rent-payouts' },
        { label: 'Financial Agents', icon: DollarSign, id: 'financial-agents' },
        { label: 'Financial Statements', icon: BookOpen, id: 'statements' },
        { label: 'Solvency & Buffer', icon: Shield, id: 'solvency' },
        { label: 'Reconciliation', icon: Scale, id: 'reconciliation' },
        { label: 'General Ledger', icon: ClipboardList, id: 'ledger' },
        { label: 'Commission Payouts', icon: Banknote, id: 'commissions' },
        { label: 'Withdrawals', icon: Wallet, id: 'withdrawals' },
        { label: 'Partner Top-ups', icon: TrendingUp, id: 'partner-topups' },
        { label: 'Wallet Retractions', icon: MinusCircle, id: 'retractions' },
        { label: 'Rent Collections', icon: Receipt, id: 'rent-collections' },
        { label: 'Agent Rankings', icon: Crown, id: 'agent-rankings' },
        { label: 'Approval Audit', icon: ShieldCheck, id: 'approval-audit' },
      ],
    },
    {
      title: 'Disbursements',
      items: [
        { label: 'Cash-Out Agents', icon: Banknote, id: 'cashout-agents' },
        { label: 'Agent Activity', icon: Activity, id: 'agent-activity' },
        { label: 'Proxy Agents', icon: UserCog, id: 'proxy-agents' },
        { label: 'Agent Requisitions', icon: FileText, id: 'agent-requisitions' },
        { label: 'Payroll & Advances', icon: Users, id: 'payroll' },
        { label: 'Delivery Pipeline', icon: Truck, id: 'delivery-pipeline' },
        { label: 'Cash Reconciliation', icon: Scale, id: 'cash-reconciliation' },
        { label: 'Landlord Payouts', icon: Home, id: 'landlord-payouts' },
        { label: 'Advanced Ledgers', icon: BookOpen, id: 'advanced-ledgers' },
        { label: 'Angel Pool', icon: Layers, id: 'angel-pool' },
      ],
    },
    {
      title: 'Advances',
      items: [
        { label: 'Manage Advances', icon: Banknote, id: 'advances' },
      ],
    },
  ],
  coo: [
    {
      title: 'Financial Operations',
      items: [
        { label: 'Overview', icon: Activity, id: 'overview' },
        { label: 'Rent Approvals', icon: ClipboardList, id: 'rent-approvals' },
        { label: 'Transactions', icon: ClipboardList, id: 'transactions' },
        { label: 'Agent Collections', icon: Users, id: 'collections' },
        { label: 'Wallets', icon: Wallet, id: 'wallets' },
        { label: 'Agent Activity', icon: Activity, id: 'agent-activity' },
        { label: 'Payment Analytics', icon: BarChart3, id: 'analytics' },
      ],
    },
    {
      title: 'Governance',
      items: [
        { label: 'Reports', icon: FileText, id: 'reports' },
        { label: 'Alerts', icon: AlertTriangle, id: 'alerts' },
        { label: 'Withdrawal Approvals', icon: Banknote, id: 'withdrawals' },
        { label: 'Partners', icon: Handshake, id: 'partners' },
        { label: 'Partner Finance', icon: Receipt, id: 'partner-finance' },
        { label: 'Partner Top-ups', icon: TrendingUp, id: 'partner-topups' },
        { label: 'Staff Performance', icon: UserCheck, id: 'staff-performance' },
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
      ],
    },
  ],
  crm: [
    {
      title: 'Customer Relations',
      items: [
        { label: 'Overview', icon: LayoutDashboard, id: 'overview' },
        { label: 'Customer Profiles', icon: Users, id: 'profiles' },
        { label: 'Support Tickets', icon: HeadphonesIcon, id: 'tickets' },
        { label: 'Disputes', icon: AlertTriangle, id: 'disputes' },
        { label: 'Communications', icon: MessageSquare, id: 'communications' },
      ],
    },
  ],
  ceo: [
    {
      title: 'Executive',
      items: [
        { label: 'Platform Overview', icon: Crown, id: 'overview' },
        { label: 'Revenue & Growth', icon: TrendingUp, id: 'revenue' },
        { label: 'Users & Coverage', icon: Globe, id: 'users' },
        { label: 'Financial Health', icon: Shield, id: 'financial' },
        { label: 'Staff Performance', icon: UserCheck, id: 'staff-performance' },
        { label: 'Angel Pool', icon: Layers, id: 'angel-pool' },
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
