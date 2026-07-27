import HRPlaceholderPage from './HRPlaceholderPage';
import DepartmentPerformanceDashboard from '../components/DepartmentPerformanceDashboard';

export default function ProductivityPage() {
  return (
    <HRPlaceholderPage heading="Productivity" subtitle="Performance against defined metrics">
      <DepartmentPerformanceDashboard />
    </HRPlaceholderPage>
  );
}
