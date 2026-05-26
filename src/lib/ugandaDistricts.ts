/**
 * Uganda district normalization helpers.
 *
 * Backed by the `trg_normalize_profile_district` trigger on `profiles`:
 * Entebbe is a city under Wakiso District, so any UI that captures a
 * *district* value must rewrite "Entebbe" → "Wakiso" before submit.
 * Selecting Entebbe as a standalone district is not allowed.
 */

export const UGANDA_DISTRICTS = [
  'Kampala', 'Wakiso', 'Mukono', 'Mpigi', 'Jinja', 'Mbale', 'Mbarara',
  'Gulu', 'Lira', 'Arua', 'Kasese', 'Kabale', 'Soroti', 'Masaka',
  'Hoima', 'Fort Portal',
] as const;

/** Cities/suburbs that roll up to a parent district. */
export const CITY_TO_DISTRICT: Record<string, string> = {
  entebbe: 'Wakiso',
  nansana: 'Wakiso',
  kira: 'Wakiso',
  bweyogerere: 'Wakiso',
  kyengera: 'Wakiso',
};

export function normalizeDistrict(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = raw.trim();
  if (!cleaned) return '';
  const key = cleaned.toLowerCase();
  if (CITY_TO_DISTRICT[key]) return CITY_TO_DISTRICT[key];
  const match = UGANDA_DISTRICTS.find((d) => d.toLowerCase() === key);
  return match ?? cleaned;
}

/** Returns a friendly warning when the entered district is actually a city. */
export function districtWarning(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  const parent = CITY_TO_DISTRICT[key];
  if (!parent) return null;
  const cityLabel = key.charAt(0).toUpperCase() + key.slice(1);
  return `${cityLabel} is a city under ${parent} District — saved as ${parent}.`;
}