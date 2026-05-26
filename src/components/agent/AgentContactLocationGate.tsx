import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MapPin, Crosshair, Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { UGANDA_DISTRICTS } from "@/lib/ugandaDistricts";

const CONTINENTS = [
  "Africa", "Asia", "Europe", "North America", "South America", "Oceania",
] as const;

const COUNTRIES = [
  { name: "Uganda", continent: "Africa" },
  { name: "Kenya", continent: "Africa" },
  { name: "Tanzania", continent: "Africa" },
  { name: "Rwanda", continent: "Africa" },
  { name: "Burundi", continent: "Africa" },
  { name: "South Sudan", continent: "Africa" },
  { name: "DR Congo", continent: "Africa" },
  { name: "Other", continent: "" },
] as const;

export type ContactRole = "tenant" | "landlord" | "partner" | "sub_agent";

interface Props {
  open: boolean;
  targetId: string;
  targetRole: ContactRole;
  targetName?: string | null;
  onComplete: () => void;
  /** When true, blocks dismissal — the agent cannot proceed without saving. */
  blocking?: boolean;
  onCancel?: () => void;
}

/**
 * Agent-facing blocking modal that forces capture of a contact's
 * detailed address + GPS before the agent can take any action on
 * that contact (rent collection, payout, allocation, etc.).
 *
 * Wired by the Agent Field Mandate: writes to profiles + agent_visits,
 * bumps the contact's trust score, and emits a system_event.
 */
export default function AgentContactLocationGate({
  open,
  targetId,
  targetRole,
  targetName,
  onComplete,
  blocking = true,
  onCancel,
}: Props) {
  const [continent, setContinent] = useState("");
  const [country, setCountry] = useState("Uganda");
  const [countryOther, setCountryOther] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [town, setTown] = useState("");
  const [subCounty, setSubCounty] = useState("");
  const [parish, setParish] = useState("");
  const [village, setVillage] = useState("");
  const [landmark, setLandmark] = useState("");

  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const known = COUNTRIES.find((c) => c.name === country);
    if (known && known.continent) setContinent(known.continent);
  }, [country]);

  const isUganda = country === "Uganda";
  const resolvedCountry = country === "Other" ? countryOther.trim() : country;

  const captureGPS = () => {
    if (!("geolocation" in navigator)) {
      toast.error("GPS not available on this device");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setAccuracy(pos.coords.accuracy);
        setGpsLoading(false);
        toast.success(`GPS captured (±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        setGpsLoading(false);
        toast.error("GPS failed", { description: err.message });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  // GPS is optional — agents can save address-only and still earn the bonus.
  const ready = !!resolvedCountry && (!isUganda || !!district);

  const handleSubmit = async () => {
    if (!ready) {
      toast.error(isUganda ? "Pick a country and district first" : "Pick a country first");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc(
        "agent_capture_contact_location",
        {
          p_target_id: targetId,
          p_target_role: targetRole,
          p_address: {
            continent,
            country: resolvedCountry,
            region: region.trim(),
            district: isUganda ? district : district.trim(),
            city: city.trim(),
            town: town.trim(),
            sub_county: subCounty.trim(),
            parish: parish.trim(),
            village: village.trim(),
          },
          p_latitude: lat ?? undefined,
          p_longitude: lng ?? undefined,
          p_accuracy: accuracy ?? undefined,
          p_landmark: landmark.trim() || undefined,
        } as any,
      );
      if (error) throw error;
      const bonus = (data as any)?.bonus;
      if (bonus?.status === "credited") {
        toast.success("Location saved · +UGX 100 bonus", {
          description: "Bonus credited to your withdrawable wallet.",
        });
      } else {
        toast.success("Location saved", {
          description: "Thanks — you can continue.",
        });
      }
      onComplete();
    } catch (e: any) {
      console.error("[AgentContactLocationGate] save failed", e);
      toast.error("Couldn't save location", {
        description: e?.message || "Try again with a stable connection.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !blocking) onCancel?.(); }}>
      <DialogContent
        onPointerDownOutside={(e) => blocking && e.preventDefault()}
        onEscapeKeyDown={(e) => blocking && e.preventDefault()}
        onInteractOutside={(e) => blocking && e.preventDefault()}
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto [&>button]:hidden"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Capture {targetRole.replace("_", " ")} location
          </DialogTitle>
          <DialogDescription>
            {targetName ? <><strong>{targetName}</strong> — </> : null}
            Welile requires every agent to record where their {targetRole.replace("_", " ")} is located before any further action.
          </DialogDescription>
        </DialogHeader>

        {/* GPS block */}
        <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium flex items-center gap-1.5">
              <Crosshair className="h-4 w-4 text-primary" /> GPS coordinates
            </div>
            <Button
              type="button"
              size="sm"
              variant={lat ? "outline" : "default"}
              onClick={captureGPS}
              disabled={gpsLoading}
            >
              {gpsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (lat ? "Recapture" : "Capture now")}
            </Button>
          </div>
          {lat !== null && lng !== null ? (
            <p className="text-xs text-muted-foreground">
              {lat.toFixed(6)}, {lng.toFixed(6)} · ±{Math.round(accuracy ?? 0)}m
            </p>
          ) : (
            <p className="text-xs text-destructive">GPS required — tap "Capture now"</p>
          )}
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Country <span className="text-destructive">*</span></Label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => (
                    <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Continent</Label>
              <Select value={continent} onValueChange={setContinent}>
                <SelectTrigger><SelectValue placeholder="Continent" /></SelectTrigger>
                <SelectContent>
                  {CONTINENTS.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {country === "Other" && (
            <div className="space-y-1.5">
              <Label>Country name</Label>
              <Input value={countryOther} onChange={(e) => setCountryOther(e.target.value)} maxLength={60} />
            </div>
          )}

          {isUganda ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Region</Label>
                  <Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Central" maxLength={60} />
                </div>
                <div className="space-y-1.5">
                  <Label>District <span className="text-destructive">*</span></Label>
                  <DistrictCombobox value={district} onChange={setDistrict} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>City</Label><Input value={city} onChange={(e)=>setCity(e.target.value)} maxLength={60} /></div>
                <div className="space-y-1.5"><Label>Town</Label><Input value={town} onChange={(e)=>setTown(e.target.value)} maxLength={60} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label>Ward</Label><Input value={subCounty} onChange={(e)=>setSubCounty(e.target.value)} maxLength={60} /></div>
                <div className="space-y-1.5"><Label>Cell</Label><Input value={parish} onChange={(e)=>setParish(e.target.value)} maxLength={60} /></div>
                <div className="space-y-1.5"><Label>Village</Label><Input value={village} onChange={(e)=>setVillage(e.target.value)} maxLength={60} /></div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Region / State</Label><Input value={region} onChange={(e)=>setRegion(e.target.value)} maxLength={60} /></div>
              <div className="space-y-1.5"><Label>City</Label><Input value={city} onChange={(e)=>setCity(e.target.value)} maxLength={60} /></div>
              <div className="space-y-1.5"><Label>District / County</Label><Input value={district} onChange={(e)=>setDistrict(e.target.value)} maxLength={60} /></div>
              <div className="space-y-1.5"><Label>Town</Label><Input value={town} onChange={(e)=>setTown(e.target.value)} maxLength={60} /></div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Nearest landmark</Label>
            <Input
              value={landmark}
              onChange={(e) => setLandmark(e.target.value)}
              placeholder="e.g. Behind Stanbic Bank, opposite St. Mary's"
              maxLength={140}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          {!blocking && (
            <Button variant="outline" onClick={() => onCancel?.()} disabled={submitting}>
              Cancel
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={!ready || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Save location
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DistrictCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
          )}
        >
          {value || "Select district"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 z-[200]"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Search district…" />
          <CommandList className="max-h-64">
            <CommandEmpty>No district found.</CommandEmpty>
            <CommandGroup>
              {UGANDA_DISTRICTS.map((d) => (
                <CommandItem
                  key={d}
                  value={d}
                  onSelect={(v) => {
                    onChange(v);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value.toLowerCase() === d.toLowerCase()
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  {d}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}