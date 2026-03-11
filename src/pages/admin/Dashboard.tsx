import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/**
 * /admin/dashboard simply renders the main Dashboard page
 * which shows the ManagerDashboard for manager/super_admin roles.
 * This preserves the original admin layout with full sidebar and management tools.
 */
export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { role } = useAuth();

  useEffect(() => {
    // Redirect to main dashboard which renders ManagerDashboard for manager/super_admin
    navigate('/dashboard', { replace: true });
  }, [navigate]);

  return null;
}
