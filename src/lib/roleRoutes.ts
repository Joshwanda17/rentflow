import type { AppRole } from '@/hooks/auth/types';

/**
 * Persona-specific URL slugs. The `supporter` role is exposed publicly as
 * `/funder` (BOU/CMA terminology); the internal role name stays `supporter`.
 */
export const PERSONA_SLUGS = ['/tenant', '/agent', '/landlord', '/funder', '/manager'] as const;
export type PersonaSlug = typeof PERSONA_SLUGS[number];

const ROLE_TO_SLUG: Record<string, PersonaSlug> = {
  tenant: '/tenant',
  agent: '/agent',
  landlord: '/landlord',
  supporter: '/funder',
  manager: '/manager',
};

const SLUG_TO_ROLE: Record<PersonaSlug, AppRole> = {
  '/tenant': 'tenant',
  '/agent': 'agent',
  '/landlord': 'landlord',
  '/funder': 'supporter',
  '/manager': 'manager',
};

/** Map an internal AppRole to its persona URL slug. Falls back to `/tenant`. */
export function roleToSlug(role: AppRole | null | undefined): PersonaSlug {
  if (!role) return '/tenant';
  return ROLE_TO_SLUG[role] ?? '/tenant';
}

/**
 * Read the persona role from a pathname (e.g. "/agent" → "agent",
 * "/funder/anything" → "supporter"). Returns null if no persona match.
 */
export function slugToRole(pathname: string): AppRole | null {
  const seg = '/' + (pathname.split('/').filter(Boolean)[0] ?? '');
  return SLUG_TO_ROLE[seg as PersonaSlug] ?? null;
}

export function isPersonaSlug(pathname: string): boolean {
  return slugToRole(pathname) !== null;
}
