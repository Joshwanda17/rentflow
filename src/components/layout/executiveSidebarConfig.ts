import {
  BarChart3, Shield, Banknote, ClipboardList, BookOpen, Server, Code, Lock, Wrench,
  TrendingUp, Users, Home, Building2, Handshake, Activity, Megaphone, Target, Share2,
  MessageSquare, HeadphonesIcon, AlertTriangle, Scale, UserCheck, FileText, Wallet,
  Crown, LayoutDashboard, Globe
} from 'lucide-react';
import type { AppRole } from '@/hooks/auth/types';

export interface SidebarItem {
  label: string;
  icon: typeof BarChart3;
  id: string;
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
      ],
    },
  ],
  cfo: [
    {
      title: 'Finance',
      items: [
        { label: 'Overview', icon: BarChart3, id: 'overview' },
        { label: 'Financial Statements', icon: BookOpen, id: 'statements' },
        { label: 'Solvency & Buffer', icon: Shield, id: 'solvency' },
        { label: 'Reconciliation', icon: Scale, id: 'reconciliation' },
        { label: 'General Ledger', icon: ClipboardList, id: 'ledger' },
        { label: 'Commission Payouts', icon: Banknote, id: 'commissions' },
        { label: 'Withdrawals', icon: Wallet, id: 'withdrawals' },
      ],
    },
  ],
  coo: [
    {
      title: 'Financial Operations',
      items: [
        { label: 'Overview', icon: Activity, id: 'overview' },
        { label: 'Transactions', icon: ClipboardList, id: 'transactions' },
        { label: 'Agent Collections', icon: Users, id: 'collections' },
        { label: 'Wallets', icon: Wallet, id: 'wallets' },
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
  operations: '/operations',
};

/** Roles that get redirected away from /dashboard to their isolated environment */
export const ISOLATED_ROLES: AppRole[] = [
  'cto', 'cfo', 'coo', 'cmo', 'crm', 'ceo', 'operations',
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
  operations: 'Operations',
  super_admin: 'Super Admin',
};
