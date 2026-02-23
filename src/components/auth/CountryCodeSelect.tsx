import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const COUNTRIES = [
  // East Africa
  { code: '256', flag: '🇺🇬', name: 'Uganda', short: 'UG' },
  { code: '254', flag: '🇰🇪', name: 'Kenya', short: 'KE' },
  { code: '255', flag: '🇹🇿', name: 'Tanzania', short: 'TZ' },
  { code: '250', flag: '🇷🇼', name: 'Rwanda', short: 'RW' },
  { code: '257', flag: '🇧🇮', name: 'Burundi', short: 'BI' },
  { code: '211', flag: '🇸🇸', name: 'South Sudan', short: 'SS' },
  { code: '251', flag: '🇪🇹', name: 'Ethiopia', short: 'ET' },
  { code: '253', flag: '🇩🇯', name: 'Djibouti', short: 'DJ' },
  { code: '291', flag: '🇪🇷', name: 'Eritrea', short: 'ER' },
  { code: '252', flag: '🇸🇴', name: 'Somalia', short: 'SO' },
  // Central Africa
  { code: '243', flag: '🇨🇩', name: 'DR Congo', short: 'CD' },
  { code: '242', flag: '🇨🇬', name: 'Congo', short: 'CG' },
  { code: '237', flag: '🇨🇲', name: 'Cameroon', short: 'CM' },
  { code: '236', flag: '🇨🇫', name: 'Central African Rep.', short: 'CF' },
  { code: '235', flag: '🇹🇩', name: 'Chad', short: 'TD' },
  { code: '241', flag: '🇬🇦', name: 'Gabon', short: 'GA' },
  { code: '240', flag: '🇬🇶', name: 'Equatorial Guinea', short: 'GQ' },
  { code: '239', flag: '🇸🇹', name: 'São Tomé & Príncipe', short: 'ST' },
  // West Africa
  { code: '234', flag: '🇳🇬', name: 'Nigeria', short: 'NG' },
  { code: '233', flag: '🇬🇭', name: 'Ghana', short: 'GH' },
  { code: '225', flag: '🇨🇮', name: "Côte d'Ivoire", short: 'CI' },
  { code: '221', flag: '🇸🇳', name: 'Senegal', short: 'SN' },
  { code: '223', flag: '🇲🇱', name: 'Mali', short: 'ML' },
  { code: '226', flag: '🇧🇫', name: 'Burkina Faso', short: 'BF' },
  { code: '227', flag: '🇳🇪', name: 'Niger', short: 'NE' },
  { code: '224', flag: '🇬🇳', name: 'Guinea', short: 'GN' },
  { code: '245', flag: '🇬🇼', name: 'Guinea-Bissau', short: 'GW' },
  { code: '220', flag: '🇬🇲', name: 'Gambia', short: 'GM' },
  { code: '228', flag: '🇹🇬', name: 'Togo', short: 'TG' },
  { code: '229', flag: '🇧🇯', name: 'Benin', short: 'BJ' },
  { code: '231', flag: '🇱🇷', name: 'Liberia', short: 'LR' },
  { code: '232', flag: '🇸🇱', name: 'Sierra Leone', short: 'SL' },
  { code: '238', flag: '🇨🇻', name: 'Cape Verde', short: 'CV' },
  { code: '222', flag: '🇲🇷', name: 'Mauritania', short: 'MR' },
  // Southern Africa
  { code: '27', flag: '🇿🇦', name: 'South Africa', short: 'ZA' },
  { code: '260', flag: '🇿🇲', name: 'Zambia', short: 'ZM' },
  { code: '263', flag: '🇿🇼', name: 'Zimbabwe', short: 'ZW' },
  { code: '258', flag: '🇲🇿', name: 'Mozambique', short: 'MZ' },
  { code: '265', flag: '🇲🇼', name: 'Malawi', short: 'MW' },
  { code: '267', flag: '🇧🇼', name: 'Botswana', short: 'BW' },
  { code: '264', flag: '🇳🇦', name: 'Namibia', short: 'NA' },
  { code: '266', flag: '🇱🇸', name: 'Lesotho', short: 'LS' },
  { code: '268', flag: '🇸🇿', name: 'Eswatini', short: 'SZ' },
  { code: '244', flag: '🇦🇴', name: 'Angola', short: 'AO' },
  { code: '261', flag: '🇲🇬', name: 'Madagascar', short: 'MG' },
  { code: '230', flag: '🇲🇺', name: 'Mauritius', short: 'MU' },
  { code: '269', flag: '🇰🇲', name: 'Comoros', short: 'KM' },
  { code: '248', flag: '🇸🇨', name: 'Seychelles', short: 'SC' },
  // North Africa
  { code: '20', flag: '🇪🇬', name: 'Egypt', short: 'EG' },
  { code: '212', flag: '🇲🇦', name: 'Morocco', short: 'MA' },
  { code: '213', flag: '🇩🇿', name: 'Algeria', short: 'DZ' },
  { code: '216', flag: '🇹🇳', name: 'Tunisia', short: 'TN' },
  { code: '218', flag: '🇱🇾', name: 'Libya', short: 'LY' },
  { code: '249', flag: '🇸🇩', name: 'Sudan', short: 'SD' },
  // International
  { code: '44', flag: '🇬🇧', name: 'UK', short: 'GB' },
  { code: '1', flag: '🇺🇸', name: 'USA', short: 'US' },
  { code: '91', flag: '🇮🇳', name: 'India', short: 'IN' },
];

interface CountryCodeSelectProps {
  value: string;
  onChange: (code: string) => void;
}

export function CountryCodeSelect({ value, onChange }: CountryCodeSelectProps) {
  const selected = COUNTRIES.find(c => c.code === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[90px] h-14 rounded-xl rounded-r-none border-r-0 px-2 text-base shrink-0">
        <SelectValue>
          {selected ? `${selected.flag} +${selected.code}` : '+256'}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {COUNTRIES.map((country) => (
          <SelectItem key={country.code} value={country.code}>
            <span className="flex items-center gap-2">
              <span>{country.flag}</span>
              <span className="text-sm">+{country.code}</span>
              <span className="text-xs text-muted-foreground">{country.name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export { COUNTRIES };
