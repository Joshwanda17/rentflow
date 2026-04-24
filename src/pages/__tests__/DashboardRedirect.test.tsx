import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardRedirect from '@/pages/DashboardRedirect';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  );
  return { ...actual, useNavigate: () => mockNavigate };
});

const authState = {
  user: { id: 'u1' } as any,
  role: 'tenant' as string,
  roles: ['tenant', 'supporter', 'agent'] as string[],
  loading: false,
};
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

let preferredDefault = 'auto';
vi.mock('@/hooks/useAppPreferences', () => ({
  getPreferredDefaultRole: () => preferredDefault,
}));

beforeEach(() => {
  mockNavigate.mockReset();
  authState.role = 'tenant';
  authState.roles = ['tenant', 'supporter', 'agent'];
  preferredDefault = 'auto';
});

describe('DashboardRedirect — default dashboard preference', () => {
  it('lands on user-chosen default (supporter) instead of cached auth.role (tenant)', () => {
    preferredDefault = 'supporter';
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardRedirect />
      </MemoryRouter>
    );
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/funder', { replace: true });
  });

  it('falls back to auth.role when default preference is "auto"', () => {
    preferredDefault = 'auto';
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardRedirect />
      </MemoryRouter>
    );
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/tenant', { replace: true });
  });

  it('ignores default preference if user does not own that role', () => {
    preferredDefault = 'landlord'; // user does not have landlord
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <DashboardRedirect />
      </MemoryRouter>
    );
    // Should fall through to auth.role (tenant) since landlord is not owned
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/tenant', { replace: true });
  });

  it('explicit URL slug always wins over default preference', () => {
    preferredDefault = 'supporter';
    render(
      <MemoryRouter initialEntries={['/dashboard/agent']}>
        <DashboardRedirect />
      </MemoryRouter>
    );
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard/agent', { replace: true });
  });
});