import { useNavigate } from 'react-router-dom';
import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';

interface HRPlaceholderPageProps {
  heading: string;
  subtitle: string;
  children?: React.ReactNode;
}

/**
 * Renders a simple HR page inside the existing HR dashboard shell
 * (same top bar, sidebar and background as the HR Command Center).
 */
export default function HRPlaceholderPage({ heading, subtitle, children }: HRPlaceholderPageProps) {
  const navigate = useNavigate();

  return (
    <ExecutiveDashboardLayout
      role="hr"
      activeTab=""
      // Tab-style sidebar items live on the main HR dashboard. From these
      // standalone HR pages, send the user back there with the section selected
      // instead of swallowing the click (which made the links look dead).
      onTabChange={(tab) => {
        if (!tab) return;
        navigate(`/hr/dashboard?section=${encodeURIComponent(tab)}`);
      }}
    >
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">{heading}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        {children}
      </div>
    </ExecutiveDashboardLayout>
  );
}
