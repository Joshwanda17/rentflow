// Ultra-fast session cache for instant auth state on app load
// Caches session in sessionStorage for immediate availability

const SESSION_CACHE_KEY = 'welile_session_cache';
const ROLES_CACHE_KEY = 'welile_roles_cache';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CachedSession {
  userId: string;
  email: string;
  expiresAt: number;
  cachedAt: number;
}

interface CachedRoles {
  roles: string[];
  cachedAt: number;
}

export function getCachedSession(): CachedSession | null {
  try {
    const cached = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!cached) return null;
    
    const parsed: CachedSession = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is still valid
    if (now - parsed.cachedAt > CACHE_TTL) {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
    
    // Check if session hasn't expired
    if (parsed.expiresAt && parsed.expiresAt * 1000 < now) {
      sessionStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
    
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedSession(userId: string, email: string, expiresAt: number): void {
  try {
    const cache: CachedSession = {
      userId,
      email,
      expiresAt,
      cachedAt: Date.now(),
    };
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors
  }
}

export function clearSessionCache(): void {
  try {
    sessionStorage.removeItem(SESSION_CACHE_KEY);
    sessionStorage.removeItem(ROLES_CACHE_KEY);
  } catch {
    // Ignore
  }
}

export function getCachedRoles(): string[] | null {
  try {
    const cached = sessionStorage.getItem(ROLES_CACHE_KEY);
    if (!cached) return null;
    
    const parsed: CachedRoles = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is still valid (roles can be cached longer)
    if (now - parsed.cachedAt > CACHE_TTL * 2) {
      sessionStorage.removeItem(ROLES_CACHE_KEY);
      return null;
    }
    
    return parsed.roles;
  } catch {
    return null;
  }
}

export function setCachedRoles(roles: string[]): void {
  try {
    const cache: CachedRoles = {
      roles,
      cachedAt: Date.now(),
    };
    sessionStorage.setItem(ROLES_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage errors
  }
}

// Preload session on module load (runs immediately when imported)
let preloadedSession: CachedSession | null = null;
let preloadedRoles: string[] | null = null;

try {
  preloadedSession = getCachedSession();
  preloadedRoles = getCachedRoles();
} catch {
  // Ignore
}

export function getPreloadedSession(): CachedSession | null {
  return preloadedSession;
}

export function getPreloadedRoles(): string[] | null {
  return preloadedRoles;
}
