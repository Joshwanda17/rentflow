import { Country, City } from "country-state-city";

/**
 * Country / city data for the profile-completion location picker.
 *
 * Countries (with ISO codes for city lookups) come from the
 * `country-state-city` dataset so we can offer EVERY city/town in the
 * world. We layer a best-effort continent map on top so the continent
 * field can auto-fill from a country pick.
 */
export interface WorldCountry {
  name: string;
  continent: string;
  isoCode: string;
}

/** Best-effort continent lookup keyed by ISO-3166 alpha-2 code. */
const CONTINENT_BY_ISO: Record<string, string> = {
  // Africa
  DZ: "Africa", AO: "Africa", BJ: "Africa", BW: "Africa", BF: "Africa", BI: "Africa",
  CV: "Africa", CM: "Africa", CF: "Africa", TD: "Africa", KM: "Africa", CG: "Africa",
  CD: "Africa", CI: "Africa", DJ: "Africa", EG: "Africa", GQ: "Africa", ER: "Africa",
  SZ: "Africa", ET: "Africa", GA: "Africa", GM: "Africa", GH: "Africa", GN: "Africa",
  GW: "Africa", KE: "Africa", LS: "Africa", LR: "Africa", LY: "Africa", MG: "Africa",
  MW: "Africa", ML: "Africa", MR: "Africa", MU: "Africa", MA: "Africa", MZ: "Africa",
  NA: "Africa", NE: "Africa", NG: "Africa", RW: "Africa", ST: "Africa", SN: "Africa",
  SC: "Africa", SL: "Africa", SO: "Africa", ZA: "Africa", SS: "Africa", SD: "Africa",
  TZ: "Africa", TG: "Africa", TN: "Africa", UG: "Africa", ZM: "Africa", ZW: "Africa",
  // Asia
  AF: "Asia", AM: "Asia", AZ: "Asia", BH: "Asia", BD: "Asia", BT: "Asia", BN: "Asia",
  KH: "Asia", CN: "Asia", CY: "Asia", GE: "Asia", IN: "Asia", ID: "Asia", IR: "Asia",
  IQ: "Asia", IL: "Asia", JP: "Asia", JO: "Asia", KZ: "Asia", KW: "Asia", KG: "Asia",
  LA: "Asia", LB: "Asia", MY: "Asia", MV: "Asia", MN: "Asia", MM: "Asia", NP: "Asia",
  KP: "Asia", OM: "Asia", PK: "Asia", PS: "Asia", PH: "Asia", QA: "Asia", SA: "Asia",
  SG: "Asia", KR: "Asia", LK: "Asia", SY: "Asia", TW: "Asia", TJ: "Asia", TH: "Asia",
  TL: "Asia", TR: "Asia", TM: "Asia", AE: "Asia", UZ: "Asia", VN: "Asia", YE: "Asia",
  // Europe
  AL: "Europe", AD: "Europe", AT: "Europe", BY: "Europe", BE: "Europe", BA: "Europe",
  BG: "Europe", HR: "Europe", CZ: "Europe", DK: "Europe", EE: "Europe", FI: "Europe",
  FR: "Europe", DE: "Europe", GR: "Europe", HU: "Europe", IS: "Europe", IE: "Europe",
  IT: "Europe", XK: "Europe", LV: "Europe", LI: "Europe", LT: "Europe", LU: "Europe",
  MT: "Europe", MD: "Europe", MC: "Europe", ME: "Europe", NL: "Europe", MK: "Europe",
  NO: "Europe", PL: "Europe", PT: "Europe", RO: "Europe", RU: "Europe", SM: "Europe",
  RS: "Europe", SK: "Europe", SI: "Europe", ES: "Europe", SE: "Europe", CH: "Europe",
  UA: "Europe", GB: "Europe", VA: "Europe",
  // North America
  AG: "North America", BS: "North America", BB: "North America", BZ: "North America",
  CA: "North America", CR: "North America", CU: "North America", DM: "North America",
  DO: "North America", SV: "North America", GD: "North America", GT: "North America",
  HT: "North America", HN: "North America", JM: "North America", MX: "North America",
  NI: "North America", PA: "North America", KN: "North America", LC: "North America",
  VC: "North America", TT: "North America", US: "North America",
  // South America
  AR: "South America", BO: "South America", BR: "South America", CL: "South America",
  CO: "South America", EC: "South America", GY: "South America", PY: "South America",
  PE: "South America", SR: "South America", UY: "South America", VE: "South America",
  // Oceania
  AU: "Oceania", FJ: "Oceania", KI: "Oceania", MH: "Oceania", FM: "Oceania",
  NR: "Oceania", NZ: "Oceania", PW: "Oceania", PG: "Oceania", WS: "Oceania",
  SB: "Oceania", TO: "Oceania", TV: "Oceania", VU: "Oceania",
};

/** Every country in the world, sourced from the country-state-city dataset. */
export const WORLD_COUNTRIES: WorldCountry[] = Country.getAllCountries().map((c) => ({
  name: c.name,
  isoCode: c.isoCode,
  continent: CONTINENT_BY_ISO[c.isoCode] ?? "",
}));

/** Uganda-first ordering so the most common pick is at the top. */
export const WORLD_COUNTRIES_UGANDA_FIRST: WorldCountry[] = [
  WORLD_COUNTRIES.find((c) => c.isoCode === "UG")!,
  ...WORLD_COUNTRIES.filter((c) => c.isoCode !== "UG").sort((a, b) =>
    a.name.localeCompare(b.name),
  ),
];

export function continentForCountry(name: string): string | null {
  return WORLD_COUNTRIES.find((c) => c.name === name)?.continent ?? null;
}

export function isoForCountry(name: string): string | null {
  return WORLD_COUNTRIES.find((c) => c.name === name)?.isoCode ?? null;
}

export interface WorldCity {
  name: string;
  stateCode: string;
}

/** All cities/towns for a country (deduplicated by name), alphabetically sorted. */
export function citiesForCountry(isoCode: string): WorldCity[] {
  if (!isoCode) return [];
  const seen = new Set<string>();
  const out: WorldCity[] = [];
  for (const c of City.getCitiesOfCountry(isoCode) ?? []) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push({ name: c.name, stateCode: c.stateCode });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}