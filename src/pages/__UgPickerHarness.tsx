import { useState } from 'react';
import { UgLocationPicker } from '@/components/location/UgLocationPicker';
import type { UgLocationSelection } from '@/hooks/useUgLocations';

export default function UgPickerHarness() {
  const [a, setA] = useState<UgLocationSelection | null>(null);
  const [b, setB] = useState<UgLocationSelection | null>(null);
  return (
    <div className="p-6 space-y-8">
      <div data-testid="mode-search"><UgLocationPicker value={a} onChange={setA} /></div>
      <pre data-testid="out-search">{JSON.stringify(a)}</pre>
      <div data-testid="mode-cascade"><UgLocationPicker value={b} onChange={setB} defaultMode="cascade" urban /></div>
      <pre data-testid="out-cascade">{JSON.stringify(b)}</pre>
    </div>
  );
}
