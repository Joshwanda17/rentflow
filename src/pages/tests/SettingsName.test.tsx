/**
 * Settings → Me → Profile: name is captured in parts, stored as one string.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';

const updateSpy = vi.fn();
const stored = { full_name: '', phone: '+256771234567' };

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'u1', email: 'a@b.com' }, roles: ['tenant'], loading: false, role: 'tenant' }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'u1', email: 'a@b.com', avatar_url: null, ...stored }, error: null }) }) }),
      update: (patch: any) => { updateSpy(patch); return { eq: async () => ({ error: null }) }; },
    }),
    storage: { from: () => ({ remove: async () => ({}), upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }), updateUser: async () => ({ error: null }) },
    functions: { invoke: async () => ({ data: null, error: null }) },
  },
}));

async function renderSettings(full_name: string) {
  stored.full_name = full_name;
  const Settings = (await import('@/pages/Settings')).default;
  render(
    <HelmetProvider>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </HelmetProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText(/First name/i)).toBeInTheDocument());
}

beforeEach(() => { updateSpy.mockClear(); });

describe('Settings — split name capture', () => {
  it('hydrates a 2-token stored name and writes nothing on mount', async () => {
    await renderSettings('Alice Nakato');
    expect((screen.getByLabelText(/First name/i) as HTMLInputElement).value).toBe('Alice');
    expect((screen.getByLabelText(/Other names/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Last name/i) as HTMLInputElement).value).toBe('Nakato');
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('hydrates a 5-token stored name with the middle tokens in Other names', async () => {
    await renderSettings('Timothy Christian Peter John Waniaye');
    expect((screen.getByLabelText(/First name/i) as HTMLInputElement).value).toBe('Timothy');
    expect((screen.getByLabelText(/Other names/i) as HTMLInputElement).value).toBe('Christian Peter John');
    expect((screen.getByLabelText(/Last name/i) as HTMLInputElement).value).toBe('Waniaye');
  });

  it('saves the joined string and blocks a blank last name', async () => {
    const { toast } = await import('sonner');
    await renderSettings('Alice Nakato');
    fireEvent.change(screen.getByLabelText(/Last name/i), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(updateSpy).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Last name/i), { target: { value: 'Namono' } });
    fireEvent.change(screen.getByLabelText(/Other names/i), { target: { value: 'Grace' } });
    fireEvent.click(screen.getByRole('button', { name: /Save/i }));
    await waitFor(() => expect(updateSpy).toHaveBeenCalledWith({ full_name: 'Alice Grace Namono' }));
  });
});
