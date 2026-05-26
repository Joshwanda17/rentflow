import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Loader2, MapPin, User as UserIcon, UserCheck, Lock, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { UGANDA_DISTRICTS } from "@/lib/ugandaDistricts";

/**
 * Continents — used when the user is outside Uganda. Kept short and
 * stable; we don't try to be a geo-database.
 */
const CONTINENTS = [
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "South America",
  "Oceania",
  "Antarctica",
] as const;

/**
 * Country list — Uganda first (cascading dropdowns kick in for it),
 * then a curated set of common countries; users elsewhere pick "Other"
 * and type their country name.
 */
const COUNTRIES = [
  { name: "Uganda", continent: "Africa" },
  { name: "Kenya", continent: "Africa" },
  { name: "Tanzania", continent: "Africa" },
  { name: "Rwanda", continent: "Africa" },
  { name: "Burundi", continent: "Africa" },
  { name: "South Sudan", continent: "Africa" },
  { name: "DR Congo", continent: "Africa" },
  { name: "Ethiopia", continent: "Africa" },
  { name: "Nigeria", continent: "Africa" },
  { name: "South Africa", continent: "Africa" },
  { name: "United Kingdom", continent: "Europe" },
  { name: "United States", continent: "North America" },
  { name: "Canada", continent: "North America" },
  { name: "United Arab Emirates", continent: "Asia" },
  { name: "India", continent: "Asia" },
  { name: "China", continent: "Asia" },
  { name: "Other", continent: "" },
] as const;

const PERSONAS = [
  { value: "tenant", label: "Tenant — I rent a home" },
  { value: "landlord", label: "Landlord — I own rental property" },
  { value: "funder", label: "Supporter — I fund rent / earn returns" },
  { value: "agent", label: "Agent — I collect rent in the field" },
  { value: "partner", label: "Partner — I run an investing institution" },
  { value: "staff", label: "Welile staff" },
  { value: "other", label: "Other" },
] as const;

type ProfileRow = {
  id: string;
  address_complete: boolean | null;
  continent: string | null;
  country: string | null;
  region: string | null;
  district: string | null;
  city: string | null;
  town: string | null;
  sub_county: string | null;
  parish: string | null;
  village: string | null;
  primary_persona: string | null;
  occupation: string | null;
  referrer_id: string | null;
};

type AgentRow = {
  agent_id: string; // we map rpc.id → agent_id for consistency
  full_name: string | null;
  phone: string | null;
};

/**
 * Blocking 3-step gate shown after login until every user has filled
 * out their detailed address, primary role/occupation, and referring
 * agent. Wired by the Trust Mission: this data feeds geographic
 * coverage, referral attribution, and segmentation reports.
 */
export default function ProfileCompletionGate() {
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const enabled = !!user && !authLoading;

  const { data: profile, refetch } = useQuery({
    queryKey: ["profile-completion-gate", user?.id],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<ProfileRow | null> => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, address_complete, continent, country, region, district, city, town, sub_county, parish, village, primary_persona, occupation, referrer_id",
        )
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        // Don't block UX on a fetch error — better to let them in than
        // trap them behind a broken modal.
        console.warn("[ProfileCompletionGate] profile fetch error", error);
        return null;
      }
      return data as ProfileRow | null;
    },
  });

  // The dialog opens automatically and CANNOT be dismissed by the user.
  const open = !!profile && profile.address_complete === false;

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Address state
  const [continent, setContinent] = useState("");
  const [country, setCountry] = useState("");
  const [countryOther, setCountryOther] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [town, setTown] = useState("");
  const [subCounty, setSubCounty] = useState("");
  const [parish, setParish] = useState("");
  const [village, setVillage] = useState("");

  // Persona state
  const [persona, setPersona] = useState("");
  const [occupation, setOccupation] = useState("");

  // Referrer state
  const [referrerOverride, setReferrerOverride] = useState<string | null>(null);
  const [agentSearch, setAgentSearch] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const [submitting, setSubmitting] = useState(false);

  // Seed the form from whatever the profile already has, so users only
  // fill the blanks.
  useEffect(() => {
    if (!profile) return;
    setContinent(profile.continent ?? "");
    const known = COUNTRIES.find((c) => c.name === profile.country);
    setCountry(known ? known.name : profile.country ? "Other" : "");
    setCountryOther(known ? "" : profile.country ?? "");
    setRegion(profile.region ?? "");
    setDistrict(profile.district ?? "");
    setCity(profile.city ?? "");
    setTown(profile.town ?? "");
    setSubCounty(profile.sub_county ?? "");
    setParish(profile.parish ?? "");
    setVillage(profile.village ?? "");
    setPersona(profile.primary_persona ?? "");
    setOccupation(profile.occupation ?? "");
  }, [profile?.id]);

  // Auto-derive continent from country selection if not yet set
  useEffect(() => {
    const known = COUNTRIES.find((c) => c.name === country);
    if (known && known.continent) setContinent(known.continent);
  }, [country]);

  const isUganda = country === "Uganda";
  const resolvedCountry = country === "Other" ? countryOther.trim() : country;

  // Existing referrer (locked attribution) — show their name
  const { data: existingReferrer } = useQuery({
    queryKey: ["profile-completion-referrer", profile?.referrer_id],
    enabled: !!profile?.referrer_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .eq("id", profile!.referrer_id!)
        .maybeSingle();
      return data;
    },
  });

  // Agent search (only when the user is choosing an override)
  const { data: agentResults = [], isFetching: searching } = useQuery({
    queryKey: ["profile-completion-agent-search", agentSearch],
    enabled: step === 3 && agentSearch.trim().length >= 2,
    queryFn: async (): Promise<AgentRow[]> => {
      const { data, error } = await supabase.rpc("search_agents", {
        search_term: agentSearch.trim(),
        result_limit: 20,
      });
      if (error) {
        console.warn("[ProfileCompletionGate] agent search error", error);
        return [];
      }
      return (data || []).map((r) => ({
        agent_id: r.id,
        full_name: r.full_name,
        phone: null,
      })) as AgentRow[];
    },
  });

  const step1Valid = useMemo(() => {
    if (!resolvedCountry) return false;
    if (isUganda && !district) return false;
    return true;
  }, [resolvedCountry, isUganda, district]);

  const step2Valid = !!persona;

  const referrerWillChange =
    !!referrerOverride && referrerOverride !== profile?.referrer_id;
  const step3Valid =
    !referrerWillChange || overrideReason.trim().length >= 10;

  const handleSubmit = async () => {
    if (!user || !profile) return;
    if (!step1Valid || !step2Valid || !step3Valid) return;

    setSubmitting(true);
    try {
      const newReferrerId = referrerOverride ?? profile.referrer_id;

      const update: Record<string, unknown> = {
        continent: continent || null,
        country: resolvedCountry,
        region: region.trim() || null,
        district: isUganda ? district : district.trim() || null,
        city: city.trim() || null,
        town: town.trim() || null,
        sub_county: subCounty.trim() || null,
        parish: parish.trim() || null,
        village: village.trim() || null,
        primary_persona: persona,
        occupation: occupation.trim() || null,
      };
      if (referrerWillChange) {
        update.referrer_id = newReferrerId;
        update.referrer_override_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("profiles")
        .update(update)
        .eq("id", user.id);
      if (error) throw error;

      // Audit trail (best-effort, never blocks the user)
      const logRows: Array<Record<string, unknown>> = [
        {
          user_id: user.id,
          action: "address_set",
          new_value: {
            continent,
            country: resolvedCountry,
            region,
            district,
            city,
            town,
            sub_county: subCounty,
            parish,
            village,
          },
        },
        {
          user_id: user.id,
          action: "persona_set",
          new_value: { primary_persona: persona, occupation },
        },
      ];
      if (referrerWillChange) {
        logRows.push({
          user_id: user.id,
          action: "referrer_override",
          previous_value: { referrer_id: profile.referrer_id },
          new_value: { referrer_id: newReferrerId },
          reason: overrideReason.trim(),
        });
      }
      void supabase.from("profile_completion_log").insert(logRows as any);

      toast.success("Profile updated", {
        description: "Thanks — this helps us route the right agent to you.",
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["profile-completion-gate"] });
    } catch (e: any) {
      console.error("[ProfileCompletionGate] save failed", e);
      toast.error("Couldn't save your profile", {
        description: e?.message || "Check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!enabled || !open) return null;

  return (
    <Dialog open={open}>
      <DialogContent
        // Block all dismissal channels — this gate is mandatory.
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto [&>button]:hidden"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Complete your profile
          </DialogTitle>
          <DialogDescription>
            Step {step} of 3 — this takes about a minute and unlocks the
            right agent, listings, and reports for your area.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Continent</Label>
                <Select value={continent} onValueChange={setContinent}>
                  <SelectTrigger><SelectValue placeholder="Select continent" /></SelectTrigger>
                  <SelectContent>
                    {CONTINENTS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Country <span className="text-destructive">*</span></Label>
                <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {country === "Other" && (
              <div className="space-y-1.5">
                <Label>Country name</Label>
                <Input
                  value={countryOther}
                  onChange={(e) => setCountryOther(e.target.value)}
                  placeholder="Type your country"
                  maxLength={60}
                />
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
                    <Select value={district} onValueChange={setDistrict}>
                      <SelectTrigger><SelectValue placeholder="Select district" /></SelectTrigger>
                      <SelectContent>
                        {UGANDA_DISTRICTS.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>City</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Kampala" maxLength={60} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Town</Label>
                    <Input value={town} onChange={(e) => setTown(e.target.value)} placeholder="e.g. Ntinda" maxLength={60} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Ward (Sub-county)</Label>
                    <Input value={subCounty} onChange={(e) => setSubCounty(e.target.value)} maxLength={60} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Cell (Parish)</Label>
                    <Input value={parish} onChange={(e) => setParish(e.target.value)} maxLength={60} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Village</Label>
                    <Input value={village} onChange={(e) => setVillage(e.target.value)} maxLength={60} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Region / State</Label>
                    <Input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={60} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>City</Label>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={60} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>District / County</Label>
                    <Input value={district} onChange={(e) => setDistrict(e.target.value)} maxLength={60} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Town / Neighborhood</Label>
                    <Input value={town} onChange={(e) => setTown(e.target.value)} maxLength={60} />
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={() => setStep(2)} disabled={!step1Valid}>
                Continue
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <UserIcon className="h-4 w-4" />
                Why are you on Welile? <span className="text-destructive">*</span>
              </Label>
              <Select value={persona} onValueChange={setPersona}>
                <SelectTrigger><SelectValue placeholder="Pick your main role" /></SelectTrigger>
                <SelectContent>
                  {PERSONAS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>What do you do for a living?</Label>
              <Input
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                placeholder="e.g. Boda rider, Teacher, Trader, Salaried"
                maxLength={80}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Helps us match you to the right plan.
              </p>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)} disabled={!step2Valid}>Continue</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="rounded-xl border bg-muted/30 p-3 space-y-1.5">
              <p className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5" /> Agent on file
              </p>
              {profile?.referrer_id ? (
                <p className="font-semibold">
                  {existingReferrer?.full_name || "Loading…"}
                  {existingReferrer?.phone && (
                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                      {existingReferrer.phone}
                    </span>
                  )}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No agent is currently linked to your account.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <UserCheck className="h-4 w-4" />
                Change referring agent (optional)
              </Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                  placeholder="Search agent by name or phone"
                  maxLength={60}
                />
              </div>
              {agentSearch.trim().length >= 2 && (
                <div className="rounded-md border max-h-44 overflow-y-auto divide-y">
                  {searching && (
                    <div className="p-2 text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                    </div>
                  )}
                  {!searching && agentResults.length === 0 && (
                    <div className="p-2 text-xs text-muted-foreground">
                      No agents matched.
                    </div>
                  )}
                  {agentResults.map((a) => {
                    const selected = referrerOverride === a.agent_id;
                    return (
                      <button
                        key={a.agent_id}
                        type="button"
                        onClick={() => setReferrerOverride(a.agent_id)}
                        className={`w-full text-left p-2 text-sm hover:bg-muted/60 ${
                          selected ? "bg-primary/10" : ""
                        }`}
                      >
                        <div className="font-medium">{a.full_name || "Unnamed"}</div>
                        {a.phone && (
                          <div className="text-xs text-muted-foreground">{a.phone}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {referrerOverride && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Selected:</span>
                  <span className="font-medium">
                    {agentResults.find((a) => a.agent_id === referrerOverride)?.full_name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setReferrerOverride(null)}
                    className="text-destructive hover:underline ml-auto"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {referrerWillChange && (
              <div className="space-y-1.5">
                <Label>Reason for changing agent (min 10 characters)</Label>
                <Input
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g. Previous agent left my area"
                  maxLength={200}
                />
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting || !step3Valid}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Save & continue
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
