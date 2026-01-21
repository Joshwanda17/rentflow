/**
 * Utility for tracking when opportunities were last marked as seen
 * Uses localStorage to persist across sessions
 */

const STORAGE_KEY = 'opportunities_last_seen_at';

/**
 * Get the timestamp when opportunities were last marked as seen
 */
export function getLastSeenAt(): Date | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return new Date(stored);
    }
  } catch (e) {
    console.warn('[OpportunitySeen] Failed to read from localStorage');
  }
  return null;
}

/**
 * Mark all opportunities as seen (stores current timestamp)
 */
export function markAllAsSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, new Date().toISOString());
  } catch (e) {
    console.warn('[OpportunitySeen] Failed to write to localStorage');
  }
}

/**
 * Check if an opportunity is unseen based on its created_at timestamp
 */
export function isOpportunityUnseen(createdAt: string): boolean {
  const lastSeenAt = getLastSeenAt();
  if (!lastSeenAt) return true; // Never marked as seen, all are unseen
  
  const createdDate = new Date(createdAt);
  return createdDate > lastSeenAt;
}

/**
 * Count unseen opportunities from a list
 */
export function countUnseenOpportunities(opportunities: { created_at: string }[]): number {
  const lastSeenAt = getLastSeenAt();
  if (!lastSeenAt) return opportunities.length; // All are unseen
  
  return opportunities.filter(opp => new Date(opp.created_at) > lastSeenAt).length;
}
