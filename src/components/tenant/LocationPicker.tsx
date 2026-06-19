import { useMemo, useState } from 'react';
import { MapPin, Search, Check, Crosshair, X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { UGANDA_LOCATIONS } from '@/lib/ugandaLocations';
import type { UgandaLocation } from '@/lib/ugandaLocations';

interface LocationPickerProps {
  /** Label of the currently active location (manual or detected). */
  currentName?: string | null;
  /** Whether the active location came from a manual choice. */
  isManual?: boolean;
  onSelect: (loc: UgandaLocation) => void;
  /** Re-detect via GPS / clear the manual override. */
  onUseGPS?: () => void;
}

export function LocationPicker({ currentName, isManual, onSelect, onUseGPS }: LocationPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return UGANDA_LOCATIONS;
    return UGANDA_LOCATIONS.filter(
      (l) => l.name.toLowerCase().includes(q) || l.region.toLowerCase().includes(q),
    );
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, UgandaLocation[]>();
    for (const loc of filtered) {
      const arr = map.get(loc.region) || [];
      arr.push(loc);
      map.set(loc.region, arr);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/15 px-2.5 py-1.5 rounded-full transition-colors touch-manipulation"
          aria-label="Change your location"
        >
          <MapPin className="h-3.5 w-3.5" />
          <span className="max-w-[120px] truncate">{currentName || 'Set location'}</span>
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" /> Choose your area
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-4 space-y-3 overflow-y-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city or district…"
              className="pl-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {onUseGPS && (
            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => {
                onUseGPS();
                setOpen(false);
              }}
            >
              <Crosshair className="h-4 w-4 text-primary" />
              Use my current location (GPS)
            </Button>
          )}

          <div className="space-y-4">
            {grouped.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                No areas match “{query}”.
              </p>
            )}
            {grouped.map(([region, locs]) => (
              <div key={region} className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
                  {region}
                </p>
                <div className="grid grid-cols-1 gap-1">
                  {locs.map((loc) => {
                    const active = isManual && currentName === loc.name;
                    return (
                      <button
                        key={loc.name}
                        type="button"
                        onClick={() => {
                          onSelect(loc);
                          setOpen(false);
                        }}
                        className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-left transition-colors touch-manipulation ${
                          active ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'
                        }`}
                      >
                        <span>{loc.name}</span>
                        {active && <Check className="h-4 w-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}