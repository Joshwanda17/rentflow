import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Loader2, MapPin, RotateCcw, User as UserIcon, UserCheck, Lock, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { UGANDA_DISTRICTS } from "@/lib/ugandaDistricts";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { CityCombobox } from "@/components/ui/city-combobox";
import { continentForCountry, isoForCountry } from "@/lib/worldCountries";

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

  // Edit mode is triggered manually (e.g. from Settings) so users can
  // revise an already-complete profile without the mandatory gate.
  const [editMode, setEditMode] = useState(false);

  // The gate opens automatically when the profile is incomplete (mandatory,
  // non-dismissable) OR when the user explicitly opens the editor.
  const mandatory = !!profile && profile.address_complete === false;
  const open = mandatory || editMode;

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Address state — defaults to Africa, Uganda, Kampala for the majority user base
  const [continent, setContinent] = useState("Africa");
  const [country, setCountry] = useState("Uganda");
  const [region, setRegion] = useState("Central");
  const [district, setDistrict] = useState("Kampala");
  const [city, setCity] = useState("Kampala");
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
  // Local "remind me later" dismissal — does NOT persist. Because
  // address_complete stays false in the DB, the gate will reopen on
  // the next login/session as required by the Trust Mission.
  const [dismissed, setDismissed] = useState(false);

  // While seeding from the DB we suppress the country/continent cascade
  // effects so they don't wipe the values we're restoring.
  const seeding = useRef(false);

  const seedFromProfile = useCallback((p: ProfileRow) => {
    seeding.current = true;
    if (p.continent) setContinent(p.continent);
    if (p.country) setCountry(p.country);
    if (p.region) setRegion(p.region);
    if (p.district) setDistrict(p.district);
    if (p.city) setCity(p.city);
    if (p.town) setTown(p.town);
    if (p.sub_county) setSubCounty(p.sub_county);
    if (p.parish) setParish(p.parish);
    if (p.village) setVillage(p.village);
    if (p.primary_persona) setPersona(p.primary_persona);
    if (p.occupation) setOccupation(p.occupation);
    // Re-enable cascades after the suppressed effects have run this tick.
    setTimeout(() => {
      seeding.current = false;
    }, 0);
  }, []);

  // Seed the form from whatever the profile already has, so users only
  // fill the blanks.
  useEffect(() => {
    if (!profile) return;
    seedFromProfile(profile);
  }, [profile?.id, seedFromProfile]);

  // Allow other parts of the app (e.g. Settings) to open this gate in
  // edit mode so a user can revise an already-complete profile.
  useEffect(() => {
    const handler = () => {
      if (profile) seedFromProfile(profile);
      setStep(1);
      setDismissed(false);
      setEditMode(true);
    };
    window.addEventListener("open-profile-editor", handler);
    return () => window.removeEventListener("open-profile-editor", handler);
  }, [profile, seedFromProfile]);

  // Auto-derive continent from country selection and cascade-clear
  // dependent address fields so they never mismatch a previous city.
  useEffect(() => {
    if (seeding.current) return;
    const cont = continentForCountry(country);
    if (cont) setContinent(cont);

    if (country === "Uganda") {
      setRegion("Central");
      setDistrict("Kampala");
      setCity("Kampala");
    } else {
      setRegion("");
      setDistrict("");
      setCity("");
    }
    setTown("");
    setSubCounty("");
    setParish("");
    setVillage("");
  }, [country]);

  // When continent is changed manually, wipe all sub-fields so the user
  // re-selects a matching country → city chain.
  useEffect(() => {
    if (seeding.current) return;
    setCountry("");
    setRegion("");
    setDistrict("");
    setCity("");
    setTown("");
    setSubCounty("");
    setParish("");
    setVillage("");
  }, [continent]);

  const isUganda = country === "Uganda";
  const resolvedCountry = country.trim();
  const countryIso = isoForCountry(country);

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

  const handleResetLocation = () => {
    setContinent("Africa");
    setCountry("Uganda");
    setRegion("Central");
    setDistrict("Kampala");
    setCity("Kampala");
    setTown("");
    setSubCounty("");
    setParish("");
    setVillage("");
  };

  const handleSubmit = async () => {
    if (!user || !profile) return;
    if (!step1Valid || !step2Valid || !step3Valid) return;

    setSubmitting(true);
    try {
      const newReferrerId = referrerOverride ?? profile.referrer_id;

      const update: Record<string, unknown> = {
        address_complete: true,
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
        description: editMode
          ? "Your profile details have been saved."
          : "Thanks — this helps us route the right agent to you.",
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["profile-completion-gate"] });
      if (editMode) setEditMode(false);
    } catch (e: any) {
      console.error("[ProfileCompletionGate] save failed", e);
      toast.error("Couldn't save your profile", {
        description: e?.message || "Check your connection and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!enabled || !open || (dismissed && !editMode)) return null;

  // In edit mode the dialog is freely dismissable; the mandatory gate is not.
  const closeEditor = () => setEditMode(false);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && editMode) closeEditor(); }}>
      <DialogContent
        // Mandatory gate blocks all dismissal; edit mode allows it.
        onPointerDownOutside={(e) => { if (!editMode) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!editMode) e.preventDefault(); }}
        onInteractOutside={(e) => { if (!editMode) e.preventDefault(); }}
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto [&>button]:hidden"
      >
        <button
          type="button"
          onClick={() => {
            if (editMode) {
              closeEditor();
              return;
            }
            setDismissed(true);
            toast.message("We'll remind you next time", {
              description: "Finish your profile to unlock the right agent and listings.",
            });
          }}
          aria-label={editMode ? "Close" : "Close and remind me later"}
          className="absolute right-3 top-3 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" />
        </button>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {editMode ? "Edit your profile" : "Complete your profile"}
          </DialogTitle>
          <DialogDescription>
            Step {step} of 3 — {editMode
              ? "update your location, role, or referring agent."
              : "this takes about a minute and unlocks the right agent, listings, and reports for your area."}
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
                <CountryCombobox value={country} onChange={setCountry} />
              </div>
            </div>

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
                    <CityCombobox countryIso={countryIso} value={city} onChange={setCity} />
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
                    <CityCombobox countryIso={countryIso} value={city} onChange={setCity} />
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

            <div className="flex justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetLocation}
                className="gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset to Kampala
              </Button>
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
