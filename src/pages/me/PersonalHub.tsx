import { Link } from 'react-router-dom';
import { FileText, Briefcase, User, Bell, FolderOpen, Ticket } from 'lucide-react';
import { cn } from '@/lib/utils';
import PersonalLayout from '@/components/layout/PersonalLayout';
import NameCompletionReminder from '@/components/notifications/NameCompletionReminder';

interface HubCardProps {
  to?: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  disabled?: boolean;
}

const HubCard = ({ to, icon: Icon, title, description, disabled }: HubCardProps) => {
  const className = cn(
    'group flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm transition-colors',
    disabled
      ? 'cursor-not-allowed opacity-60'
      : 'hover:border-primary/30 hover:bg-accent/50'
  );

  const content = (
    <>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h2 className="font-semibold text-card-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {disabled && (
        <span className="mt-auto self-start rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          Coming soon
        </span>
      )}
    </>
  );

  if (disabled || !to) {
    return (
      <div className={className} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link to={to} className={className}>
      {content}
    </Link>
  );
};

const CARDS = [
  {
    to: '/me/payslips',
    icon: FileText,
    title: 'My payslips',
    description: 'Your own pay records',
  },
  {
    to: '/me/work',
    icon: Briefcase,
    title: 'My work',
    description: 'Tasks assigned to you',
  },
  {
    to: '/me/tickets',
    icon: Ticket,
    title: 'Tickets',
    description: 'Raise a fault or pick one up',
  },
  {
    to: '/your-profile',
    icon: User,
    title: 'My profile',
    description: 'Your personal details',
  },
  {
    to: '/notifications',
    icon: Bell,
    title: 'Notifications',
    description: 'Messages and alerts',
  },
  {
    icon: FolderOpen,
    title: 'My documents',
    description: 'Your contracts, letters and certificates',
    to: '/me/documents',
  },
];

const PersonalHub = () => {
  return (
    <PersonalLayout title="My space">
      <div className="space-y-4">
        <NameCompletionReminder />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card, index) => (
            <HubCard key={index} {...card} />
          ))}
        </div>
      </div>
    </PersonalLayout>
  );
};

export default PersonalHub;
