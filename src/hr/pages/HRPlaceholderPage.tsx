import ExecutiveDashboardLayout from '@/components/layout/ExecutiveDashboardLayout';

interface HRPlaceholderPageProps {
  heading: string;
  subtitle: string;
}

/**
 * Renders a simple HR page inside the existing HR dashboard shell
 * (same top bar, sidebar and background as the HR Command Center).
 */
export default function HRPlaceholderPage({ heading, subtitle }: HRPlaceholderPageProps) {
  return (
    <ExecutiveDashboardLayout role="hr" activeTab="" onTabChange={() => {}}>
      <div>
        <h2 className="text-xl font-bold text-foreground">{heading}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
    </ExecutiveDashboardLayout>
  );
}
