import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const COUNTRIES = [
  { code: '256', flag: '🇺🇬', name: 'Uganda', short: 'UG' },
  { code: '257', flag: '🇧🇮', name: 'Burundi', short: 'BI' },
  { code: '254', flag: '🇰🇪', name: 'Kenya', short: 'KE' },
  { code: '255', flag: '🇹🇿', name: 'Tanzania', short: 'TZ' },
  { code: '250', flag: '🇷🇼', name: 'Rwanda', short: 'RW' },
  { code: '211', flag: '🇸🇸', name: 'South Sudan', short: 'SS' },
  { code: '243', flag: '🇨🇩', name: 'DR Congo', short: 'CD' },
  { code: '234', flag: '🇳🇬', name: 'Nigeria', short: 'NG' },
  { code: '233', flag: '🇬🇭', name: 'Ghana', short: 'GH' },
  { code: '27', flag: '🇿🇦', name: 'South Africa', short: 'ZA' },
  { code: '251', flag: '🇪🇹', name: 'Ethiopia', short: 'ET' },
  { code: '260', flag: '🇿🇲', name: 'Zambia', short: 'ZM' },
  { code: '263', flag: '🇿🇼', name: 'Zimbabwe', short: 'ZW' },
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
