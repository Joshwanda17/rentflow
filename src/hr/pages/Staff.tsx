import HRPlaceholderPage from './HRPlaceholderPage';
import StaffDirectory from '../components/StaffDirectory';

export default function StaffPage() {
  return (
    <HRPlaceholderPage heading="Staff" subtitle="People enrolled in performance tracking">
      <StaffDirectory />
    </HRPlaceholderPage>
  );
}
