import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { LocationSearchBar } from './LocationSearchBar';
import { LocationBreadcrumbs } from './LocationBreadcrumbs';
import { LocationTileGrid } from './LocationTileGrid';
import { PropertyLeafList } from './PropertyLeafList';
import {
  useLocationBreakdown,
  nextLevel,
  type BreadcrumbPath,
  type BreakdownRow,
} from '@/hooks/useLocationBreakdown';

export function LocationBrowser() {
  const [path, setPath] = useState<BreadcrumbPath>({});
  const level = nextLevel(path);
  const { data, isLoading } = useLocationBreakdown(path);

  const pick = (row: BreakdownRow) => {
    const p: BreadcrumbPath = { ...path };
    switch (level) {
      case 'country':  p.country  = row.label; break;
      case 'region':   p.region   = row.label; break;
      case 'district': p.district = row.label; break;
      case 'ward':     p.ward     = row.label; break;
      case 'agent':    p.agentId  = row.agent_id ?? undefined; p.agentName = row.label; break;
      case 'landlord': p.landlordId = row.landlord_id ?? undefined; p.landlordName = row.label; break;
    }
    setPath(p);
  };

  return (
    <div className="space-y-3">
      <LocationSearchBar onPick={setPath} />
      <Card className="p-2.5 bg-muted/30">
        <LocationBreadcrumbs path={path} onJump={setPath} />
      </Card>
      {level === 'properties' ? (
        <PropertyLeafList path={path} />
      ) : (
        <LocationTileGrid
          rows={data ?? []}
          level={level}
          loading={isLoading}
          onPick={pick}
        />
      )}
    </div>
  );
}