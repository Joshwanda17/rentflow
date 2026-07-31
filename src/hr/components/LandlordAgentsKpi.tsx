import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

type Inputs = {
  target: number;
  registered: number;
  metListing: number;
  metSubAgents: number;
  metBoth: number;
  prevActive: number;
  prevStillActive: number;
  featuresAssigned: number;
  featuresCompleted: number;
  featuresOnTime: number;
  featureRelevance: number;
  bugsReported: number;
  bugsResolved: number;
  criticalIncidents: number;
  avgResolutionHours: number;
};

const DEFAULTS: Inputs = {
  target: 50,
  registered: 725,
  metListing: 418,
  metSubAgents: 232,
  metBoth: 36,
  prevActive: 3,
  prevStillActive: 1,
  featuresAssigned: 0,
  featuresCompleted: 0,
  featuresOnTime: 0,
  featureRelevance: 0,
  bugsReported: 0,
  bugsResolved: 0,
  criticalIncidents: 0,
  avgResolutionHours: 0,
};

const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
const clamp100 = (n: number) => Math.min(100, Math.max(0, n));
const fmt = (n: number) => `${n.toFixed(1)}%`;

const FIELDS: { key: keyof Inputs; label: string; group: string }[] = [
  { key: 'target', label: 'Monthly target — new active landlord agents', group: 'New Active Landlord Agents (60%)' },
  { key: 'registered', label: 'Agents registered during the month', group: 'New Active Landlord Agents (60%)' },
  { key: 'metListing', label: 'Agents who listed 8+ vacant houses', group: 'New Active Landlord Agents (60%)' },
  { key: 'metSubAgents', label: 'Agents who recruited 3+ sub-agents', group: 'New Active Landlord Agents (60%)' },
  { key: 'metBoth', label: 'Agents who met BOTH requirements', group: 'New Active Landlord Agents (60%)' },
  { key: 'prevActive', label: 'Agents active in the previous month', group: 'Existing Agent Retention (15%)' },
  { key: 'prevStillActive', label: 'Of those, still active this month', group: 'Existing Agent Retention (15%)' },
  { key: 'featuresAssigned', label: 'Product features assigned', group: 'Product Delivery (15%)' },
  { key: 'featuresCompleted', label: 'Product features completed', group: 'Product Delivery (15%)' },
  { key: 'featuresOnTime', label: 'Product features completed on time', group: 'Product Delivery (15%)' },
  { key: 'featureRelevance', label: 'Features that directly served recruitment / listings / retention / growth', group: 'Product Delivery (15%)' },
  { key: 'bugsReported', label: 'Bugs reported', group: 'Platform Reliability (10%)' },
  { key: 'bugsResolved', label: 'Bugs resolved', group: 'Platform Reliability (10%)' },
  { key: 'criticalIncidents', label: 'Critical incidents or downtime events', group: 'Platform Reliability (10%)' },
  { key: 'avgResolutionHours', label: 'Average bug-resolution time (hours)', group: 'Platform Reliability (10%)' },
];

export default function LandlordAgentsKpi() {
  const [v, setV] = useState<Inputs>(DEFAULTS);
  const set = (k: keyof Inputs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV((p) => ({ ...p, [k]: Number(e.target.value) || 0 }));

  const r = useMemo(() => {
    const growthRaw = clamp100(pct(v.metBoth, v.target));
    const growth = (growthRaw * 60) / 100;

    const retentionRaw = clamp100(pct(v.prevStillActive, v.prevActive));
    const retention = (retentionRaw * 15) / 100;

    const completed = pct(v.featuresCompleted, v.featuresAssigned);
    const onTime = pct(v.featuresOnTime, v.featuresAssigned);
    const relevance = pct(v.featureRelevance, v.featuresAssigned);
    const deliveryRaw = clamp100(0.5 * completed + 0.3 * onTime + 0.2 * relevance);
    const delivery = (deliveryRaw * 15) / 100;

    const resolved = pct(v.bugsResolved, v.bugsReported);
    // 24h SLA: full marks at <=24h, zero at >=120h
    const speed = v.avgResolutionHours <= 0 ? 0 : clamp100(((120 - v.avgResolutionHours) / 96) * 100);
    const stability = clamp100(100 - v.criticalIncidents * 20);
    const reliabilityRaw = clamp100(0.5 * resolved + 0.2 * speed + 0.3 * stability);
    const reliability = (reliabilityRaw * 10) / 100;

    return {
      growthRaw, growth, retentionRaw, retention,
      completed, onTime, relevance, deliveryRaw, delivery,
      resolved, speed, stability, reliabilityRaw, reliability,
      total: growth + retention + delivery + reliability,
      onlyListed: Math.max(0, v.metListing - v.metBoth),
      onlyRecruited: Math.max(0, v.metSubAgents - v.metBoth),
      inactive: Math.max(0, v.registered - v.metBoth),
    };
  }, [v]);

  const groups = Array.from(new Set(FIELDS.map((f) => f.group)));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <Card key={g}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{g}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {FIELDS.filter((f) => f.group === g).map((f) => (
                <div key={f.key} className="grid grid-cols-[1fr_110px] items-center gap-3">
                  <Label htmlFor={f.key} className="text-xs text-muted-foreground">{f.label}</Label>
                  <Input id={f.key} type="number" min={0} value={v[f.key]} onChange={set(f.key)} className="h-8 text-right" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Score</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Score label="New Active Landlord Agents" score={r.growth} max={60} raw={r.growthRaw} />
            <Score label="Existing Agent Retention" score={r.retention} max={15} raw={r.retentionRaw} />
            <Score label="Product Delivery" score={r.delivery} max={15} raw={r.deliveryRaw} />
            <Score label="Platform Reliability" score={r.reliability} max={10} raw={r.reliabilityRaw} />
          </div>
          <Separator />
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium">Total performance</span>
            <span className="text-2xl font-bold text-primary">{fmt(r.total)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">How each percentage was calculated</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>1. New active agents: {v.metBoth} met both ÷ {v.target} target × 100 = {fmt(r.growthRaw)} (capped at 100%) × 60% = <b className="text-foreground">{fmt(r.growth)}</b> of 60.</p>
          <p>2. Retention: {v.prevStillActive} still active ÷ {v.prevActive} previously active × 100 = {fmt(r.retentionRaw)} × 15% = <b className="text-foreground">{fmt(r.retention)}</b> of 15.</p>
          <p>3. Product delivery: 50% × completed ({fmt(r.completed)}) + 30% × on time ({fmt(r.onTime)}) + 20% × growth-relevant ({fmt(r.relevance)}) = {fmt(r.deliveryRaw)} × 15% = <b className="text-foreground">{fmt(r.delivery)}</b> of 15.</p>
          <p>4. Reliability: 50% × bugs resolved ({fmt(r.resolved)}) + 20% × resolution speed ({fmt(r.speed)}, full marks ≤24h, zero ≥120h) + 30% × stability ({fmt(r.stability)}, −20 points per critical incident) = {fmt(r.reliabilityRaw)} × 10% = <b className="text-foreground">{fmt(r.reliability)}</b> of 10.</p>
          <Separator className="my-2" />
          <p><b className="text-foreground">Cohort split:</b> {v.registered} registered · {r.onlyListed} listed only · {r.onlyRecruited} recruited sub-agents only · {v.metBoth} satisfied both conditions · {r.inactive} registered but not active.</p>
          <p><b className="text-foreground">Evidence still required:</b> a written feature log (assigned / completed / on-time dates), a bug register with severity and resolution timestamps, and an uptime record for the month. Delivery and reliability scores are not defensible until those are entered from a tracked source rather than recall.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Score({ label, score, max, raw }: { label: string; score: number; max: number; raw: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold text-foreground">{score.toFixed(1)}<span className="text-xs font-normal text-muted-foreground"> / {max}</span></p>
      <p className="text-[11px] text-muted-foreground">attainment {raw.toFixed(1)}%</p>
    </div>
  );
}