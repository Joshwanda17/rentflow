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

const LEGACY_COUNTRIES: { name: string; continent: string }[] = [
  // Africa
  { name: "Algeria", continent: "Africa" },
  { name: "Angola", continent: "Africa" },
  { name: "Benin", continent: "Africa" },
  { name: "Botswana", continent: "Africa" },
  { name: "Burkina Faso", continent: "Africa" },
  { name: "Burundi", continent: "Africa" },
  { name: "Cabo Verde", continent: "Africa" },
  { name: "Cameroon", continent: "Africa" },
  { name: "Central African Republic", continent: "Africa" },
  { name: "Chad", continent: "Africa" },
  { name: "Comoros", continent: "Africa" },
  { name: "Congo", continent: "Africa" },
  { name: "DR Congo", continent: "Africa" },
  { name: "Côte d'Ivoire", continent: "Africa" },
  { name: "Djibouti", continent: "Africa" },
  { name: "Egypt", continent: "Africa" },
  { name: "Equatorial Guinea", continent: "Africa" },
  { name: "Eritrea", continent: "Africa" },
  { name: "Eswatini", continent: "Africa" },
  { name: "Ethiopia", continent: "Africa" },
  { name: "Gabon", continent: "Africa" },
  { name: "Gambia", continent: "Africa" },
  { name: "Ghana", continent: "Africa" },
  { name: "Guinea", continent: "Africa" },
  { name: "Guinea-Bissau", continent: "Africa" },
  { name: "Kenya", continent: "Africa" },
  { name: "Lesotho", continent: "Africa" },
  { name: "Liberia", continent: "Africa" },
  { name: "Libya", continent: "Africa" },
  { name: "Madagascar", continent: "Africa" },
  { name: "Malawi", continent: "Africa" },
  { name: "Mali", continent: "Africa" },
  { name: "Mauritania", continent: "Africa" },
  { name: "Mauritius", continent: "Africa" },
  { name: "Morocco", continent: "Africa" },
  { name: "Mozambique", continent: "Africa" },
  { name: "Namibia", continent: "Africa" },
  { name: "Niger", continent: "Africa" },
  { name: "Nigeria", continent: "Africa" },
  { name: "Rwanda", continent: "Africa" },
  { name: "São Tomé and Príncipe", continent: "Africa" },
  { name: "Senegal", continent: "Africa" },
  { name: "Seychelles", continent: "Africa" },
  { name: "Sierra Leone", continent: "Africa" },
  { name: "Somalia", continent: "Africa" },
  { name: "South Africa", continent: "Africa" },
  { name: "South Sudan", continent: "Africa" },
  { name: "Sudan", continent: "Africa" },
  { name: "Tanzania", continent: "Africa" },
  { name: "Togo", continent: "Africa" },
  { name: "Tunisia", continent: "Africa" },
  { name: "Uganda", continent: "Africa" },
  { name: "Zambia", continent: "Africa" },
  { name: "Zimbabwe", continent: "Africa" },
  // Asia
  { name: "Afghanistan", continent: "Asia" },
  { name: "Armenia", continent: "Asia" },
  { name: "Azerbaijan", continent: "Asia" },
  { name: "Bahrain", continent: "Asia" },
  { name: "Bangladesh", continent: "Asia" },
  { name: "Bhutan", continent: "Asia" },
  { name: "Brunei", continent: "Asia" },
  { name: "Cambodia", continent: "Asia" },
  { name: "China", continent: "Asia" },
  { name: "Cyprus", continent: "Asia" },
  { name: "Georgia", continent: "Asia" },
  { name: "India", continent: "Asia" },
  { name: "Indonesia", continent: "Asia" },
  { name: "Iran", continent: "Asia" },
  { name: "Iraq", continent: "Asia" },
  { name: "Israel", continent: "Asia" },
  { name: "Japan", continent: "Asia" },
  { name: "Jordan", continent: "Asia" },
  { name: "Kazakhstan", continent: "Asia" },
  { name: "Kuwait", continent: "Asia" },
  { name: "Kyrgyzstan", continent: "Asia" },
  { name: "Laos", continent: "Asia" },
  { name: "Lebanon", continent: "Asia" },
  { name: "Malaysia", continent: "Asia" },
  { name: "Maldives", continent: "Asia" },
  { name: "Mongolia", continent: "Asia" },
  { name: "Myanmar", continent: "Asia" },
  { name: "Nepal", continent: "Asia" },
  { name: "North Korea", continent: "Asia" },
  { name: "Oman", continent: "Asia" },
  { name: "Pakistan", continent: "Asia" },
  { name: "Palestine", continent: "Asia" },
  { name: "Philippines", continent: "Asia" },
  { name: "Qatar", continent: "Asia" },
  { name: "Saudi Arabia", continent: "Asia" },
  { name: "Singapore", continent: "Asia" },
  { name: "South Korea", continent: "Asia" },
  { name: "Sri Lanka", continent: "Asia" },
  { name: "Syria", continent: "Asia" },
  { name: "Taiwan", continent: "Asia" },
  { name: "Tajikistan", continent: "Asia" },
  { name: "Thailand", continent: "Asia" },
  { name: "Timor-Leste", continent: "Asia" },
  { name: "Turkey", continent: "Asia" },
  { name: "Turkmenistan", continent: "Asia" },
  { name: "United Arab Emirates", continent: "Asia" },
  { name: "Uzbekistan", continent: "Asia" },
  { name: "Vietnam", continent: "Asia" },
  { name: "Yemen", continent: "Asia" },
  // Europe
  { name: "Albania", continent: "Europe" },
  { name: "Andorra", continent: "Europe" },
  { name: "Austria", continent: "Europe" },
  { name: "Belarus", continent: "Europe" },
  { name: "Belgium", continent: "Europe" },
  { name: "Bosnia and Herzegovina", continent: "Europe" },
  { name: "Bulgaria", continent: "Europe" },
  { name: "Croatia", continent: "Europe" },
  { name: "Czechia", continent: "Europe" },
  { name: "Denmark", continent: "Europe" },
  { name: "Estonia", continent: "Europe" },
  { name: "Finland", continent: "Europe" },
  { name: "France", continent: "Europe" },
  { name: "Germany", continent: "Europe" },
  { name: "Greece", continent: "Europe" },
  { name: "Hungary", continent: "Europe" },
  { name: "Iceland", continent: "Europe" },
  { name: "Ireland", continent: "Europe" },
  { name: "Italy", continent: "Europe" },
  { name: "Kosovo", continent: "Europe" },
  { name: "Latvia", continent: "Europe" },
  { name: "Liechtenstein", continent: "Europe" },
  { name: "Lithuania", continent: "Europe" },
  { name: "Luxembourg", continent: "Europe" },
  { name: "Malta", continent: "Europe" },
  { name: "Moldova", continent: "Europe" },
  { name: "Monaco", continent: "Europe" },
  { name: "Montenegro", continent: "Europe" },
  { name: "Netherlands", continent: "Europe" },
  { name: "North Macedonia", continent: "Europe" },
  { name: "Norway", continent: "Europe" },
  { name: "Poland", continent: "Europe" },
  { name: "Portugal", continent: "Europe" },
  { name: "Romania", continent: "Europe" },
  { name: "Russia", continent: "Europe" },
  { name: "San Marino", continent: "Europe" },
  { name: "Serbia", continent: "Europe" },
  { name: "Slovakia", continent: "Europe" },
  { name: "Slovenia", continent: "Europe" },
  { name: "Spain", continent: "Europe" },
  { name: "Sweden", continent: "Europe" },
  { name: "Switzerland", continent: "Europe" },
  { name: "Ukraine", continent: "Europe" },
  { name: "United Kingdom", continent: "Europe" },
  { name: "Vatican City", continent: "Europe" },
  // North America
  { name: "Antigua and Barbuda", continent: "North America" },
  { name: "Bahamas", continent: "North America" },
  { name: "Barbados", continent: "North America" },
  { name: "Belize", continent: "North America" },
  { name: "Canada", continent: "North America" },
  { name: "Costa Rica", continent: "North America" },
  { name: "Cuba", continent: "North America" },
  { name: "Dominica", continent: "North America" },
  { name: "Dominican Republic", continent: "North America" },
  { name: "El Salvador", continent: "North America" },
  { name: "Grenada", continent: "North America" },
  { name: "Guatemala", continent: "North America" },
  { name: "Haiti", continent: "North America" },
  { name: "Honduras", continent: "North America" },
  { name: "Jamaica", continent: "North America" },
  { name: "Mexico", continent: "North America" },
  { name: "Nicaragua", continent: "North America" },
  { name: "Panama", continent: "North America" },
  { name: "Saint Kitts and Nevis", continent: "North America" },
  { name: "Saint Lucia", continent: "North America" },
  { name: "Saint Vincent and the Grenadines", continent: "North America" },
  { name: "Trinidad and Tobago", continent: "North America" },
  { name: "United States", continent: "North America" },
  // South America
  { name: "Argentina", continent: "South America" },
  { name: "Bolivia", continent: "South America" },
  { name: "Brazil", continent: "South America" },
  { name: "Chile", continent: "South America" },
  { name: "Colombia", continent: "South America" },
  { name: "Ecuador", continent: "South America" },
  { name: "Guyana", continent: "South America" },
  { name: "Paraguay", continent: "South America" },
  { name: "Peru", continent: "South America" },
  { name: "Suriname", continent: "South America" },
  { name: "Uruguay", continent: "South America" },
  { name: "Venezuela", continent: "South America" },
  // Oceania
  { name: "Australia", continent: "Oceania" },
  { name: "Fiji", continent: "Oceania" },
  { name: "Kiribati", continent: "Oceania" },
  { name: "Marshall Islands", continent: "Oceania" },
  { name: "Micronesia", continent: "Oceania" },
  { name: "Nauru", continent: "Oceania" },
  { name: "New Zealand", continent: "Oceania" },
  { name: "Palau", continent: "Oceania" },
  { name: "Papua New Guinea", continent: "Oceania" },
  { name: "Samoa", continent: "Oceania" },
  { name: "Solomon Islands", continent: "Oceania" },
  { name: "Tonga", continent: "Oceania" },
  { name: "Tuvalu", continent: "Oceania" },
  { name: "Vanuatu", continent: "Oceania" },
];
void LEGACY_COUNTRIES;

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