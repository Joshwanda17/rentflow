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

/**
 * Display label for area/region pickers that mix districts and cities.
 * Cities are annotated with their parent district so users never confuse
 * a city (e.g. Entebbe) with a standalone district.
 */
export function regionLabel(value: string): string {
  const parent = CITY_TO_DISTRICT[value.trim().toLowerCase()];
  return parent ? `${value} (${parent})` : value;
}

/**
 * Uganda has 4 administrative regions. Many legacy records stored a
 * district or city in the `region` column (e.g. "Kampala", "Wakiso",
 * "Entebbe"). Map those back to the correct region so the hierarchy
 * picker shows ONE "Central", not five.
 */
export const UGANDA_REGIONS = ['Central', 'Eastern', 'Northern', 'Western'] as const;

const DISTRICT_TO_REGION: Record<string, typeof UGANDA_REGIONS[number]> = {
  // Central
  kampala: 'Central', wakiso: 'Central', mukono: 'Central', mpigi: 'Central',
  masaka: 'Central', entebbe: 'Central', nansana: 'Central', kira: 'Central',
  bweyogerere: 'Central', kyengera: 'Central', luwero: 'Central', mityana: 'Central',
  mubende: 'Central', nakasongola: 'Central', kayunga: 'Central', buikwe: 'Central',
  butambala: 'Central', gomba: 'Central', kalangala: 'Central', kyankwanzi: 'Central',
  lwengo: 'Central', lyantonde: 'Central', rakai: 'Central', sembabule: 'Central',
  // Eastern
  jinja: 'Eastern', mbale: 'Eastern', soroti: 'Eastern', iganga: 'Eastern',
  tororo: 'Eastern', busia: 'Eastern', kapchorwa: 'Eastern', pallisa: 'Eastern',
  // Northern
  gulu: 'Northern', lira: 'Northern', arua: 'Northern', kitgum: 'Northern',
  pader: 'Northern', moyo: 'Northern', nebbi: 'Northern', adjumani: 'Northern',
  // Western
  mbarara: 'Western', kabale: 'Western', kasese: 'Western', hoima: 'Western',
  'fort portal': 'Western', kabarole: 'Western', bushenyi: 'Western',
  ntungamo: 'Western', rukungiri: 'Western', kanungu: 'Western', ibanda: 'Western',
};

export function normalizeUgandaRegion(raw: string | null | undefined): string {
  if (!raw) return 'Unknown region';
  const cleaned = raw.trim();
  if (!cleaned) return 'Unknown region';
  const key = cleaned.toLowerCase().replace(/\s+region$/, '').trim();
  // Already a valid region (case-insensitive)
  const direct = UGANDA_REGIONS.find((r) => r.toLowerCase() === key);
  if (direct) return direct;
  return DISTRICT_TO_REGION[key] ?? cleaned;
}

/**
 * UI grouping of Uganda into its 4 official administrative regions
 * (Central, Eastern, Western, Northern). Southern districts like
 * Masaka, Rakai, Kabale, Kisoro etc. live under their canonical
 * region (Central or Western) — they are NOT split into a separate
 * "Southern" bucket, otherwise the same tenants would be double-
 * counted across Central and Southern.
 */
export interface UgandaDistrictEntry {
  name: string;
  /** Canonical region stored in the database (Central/Eastern/Northern/Western). */
  backendRegion: typeof UGANDA_REGIONS[number];
}

export interface UgandaRegionGroup {
  /** Label shown in the UI (e.g. "Central Uganda"). */
  label: string;
  /** Short key for state. */
  key: 'central' | 'eastern' | 'western' | 'northern';
  districts: UgandaDistrictEntry[];
}

export const UGANDA_REGION_GROUPS: UgandaRegionGroup[] = [
  {
    label: 'Central Uganda',
    key: 'central',
    districts: [
      { name: 'Kampala', backendRegion: 'Central' },
      { name: 'Wakiso', backendRegion: 'Central' },
      { name: 'Mukono', backendRegion: 'Central' },
      { name: 'Mpigi', backendRegion: 'Central' },
      { name: 'Luwero', backendRegion: 'Central' },
      { name: 'Mityana', backendRegion: 'Central' },
      { name: 'Mubende', backendRegion: 'Central' },
      { name: 'Nakasongola', backendRegion: 'Central' },
      { name: 'Kayunga', backendRegion: 'Central' },
      { name: 'Buikwe', backendRegion: 'Central' },
      { name: 'Butambala', backendRegion: 'Central' },
      { name: 'Gomba', backendRegion: 'Central' },
      { name: 'Kyankwanzi', backendRegion: 'Central' },
      { name: 'Masaka', backendRegion: 'Central' },
      { name: 'Kalangala', backendRegion: 'Central' },
      { name: 'Lwengo', backendRegion: 'Central' },
      { name: 'Lyantonde', backendRegion: 'Central' },
      { name: 'Rakai', backendRegion: 'Central' },
      { name: 'Sembabule', backendRegion: 'Central' },
    ],
  },
  {
    label: 'Eastern Uganda',
    key: 'eastern',
    districts: [
      { name: 'Jinja', backendRegion: 'Eastern' },
      { name: 'Mbale', backendRegion: 'Eastern' },
      { name: 'Soroti', backendRegion: 'Eastern' },
      { name: 'Iganga', backendRegion: 'Eastern' },
      { name: 'Tororo', backendRegion: 'Eastern' },
      { name: 'Busia', backendRegion: 'Eastern' },
      { name: 'Kapchorwa', backendRegion: 'Eastern' },
      { name: 'Pallisa', backendRegion: 'Eastern' },
    ],
  },
  {
    label: 'Western Uganda',
    key: 'western',
    districts: [
      { name: 'Mbarara', backendRegion: 'Western' },
      { name: 'Kasese', backendRegion: 'Western' },
      { name: 'Hoima', backendRegion: 'Western' },
      { name: 'Fort Portal', backendRegion: 'Western' },
      { name: 'Kabarole', backendRegion: 'Western' },
      { name: 'Bushenyi', backendRegion: 'Western' },
      { name: 'Ibanda', backendRegion: 'Western' },
      { name: 'Kabale', backendRegion: 'Western' },
      { name: 'Kanungu', backendRegion: 'Western' },
      { name: 'Kisoro', backendRegion: 'Western' },
      { name: 'Rukungiri', backendRegion: 'Western' },
      { name: 'Ntungamo', backendRegion: 'Western' },
    ],
  },
  {
    label: 'Northern Uganda',
    key: 'northern',
    districts: [
      { name: 'Gulu', backendRegion: 'Northern' },
      { name: 'Lira', backendRegion: 'Northern' },
      { name: 'Arua', backendRegion: 'Northern' },
      { name: 'Kitgum', backendRegion: 'Northern' },
      { name: 'Pader', backendRegion: 'Northern' },
      { name: 'Moyo', backendRegion: 'Northern' },
      { name: 'Nebbi', backendRegion: 'Northern' },
      { name: 'Adjumani', backendRegion: 'Northern' },
    ],
  },
];