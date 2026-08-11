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
import { Loader2, MapPin, RotateCcw, User as UserIcon, UserCheck, Lock, Search, X, Navigation, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { UGANDA_DISTRICTS } from "@/lib/ugandaDistricts";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { CityCombobox } from "@/components/ui/city-combobox";
import UgLocationPicker from "@/components/location/UgLocationPicker";
import { resolveUgVillage, type UgLocationSelection } from "@/hooks/useUgLocations";
import {
  continentForCountry,
  isoForCountry,
  loadWorldCountries,
} from "@/lib/worldCountries";

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
  { value: "staff", label: "Welile staff" },
  { value: "other", label: "Other" },
] as const;

/**
 * Picture-first role choices for the Quick setup screen. Designed for
 * smartphone users who don't want to read long labels — big emoji + a
 * two/three-word caption, tapped not typed.
 */
const QUICK_PERSONAS = [
  { value: "tenant", emoji: "🏠", label: "I rent a home" },
  { value: "landlord", emoji: "🔑", label: "I own a house" },
  { value: "funder", emoji: "💰", label: "I fund rent" },
  { value: "agent", emoji: "🚶", label: "I collect rent" },
  { value: "other", emoji: "👤", label: "Other" },
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
  ug_village_id: number | null;
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
          "id, address_complete, continent, country, region, district, city, town, sub_county, parish, village, primary_persona, occupation, referrer_id, ug_village_id",
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

  // Warm the lazy country/city dataset as soon as the gate opens so the
  // ISO/continent lookups resolve without the user waiting on a picker.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadWorldCountries().then(() => {
      if (!cancelled) setGeoReady((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // The country/city dataset is large (~2.2 MB) and loaded lazily. We pull
  // it in only once the gate is actually open, then bump this counter so
  // the synchronous `continentForCountry`/`isoForCountry` lookups re-run.
  const [geoReady, setGeoReady] = useState(0);

  // Quick setup is the easy, picture-first path shown by default to the
  // mandatory gate. Users can switch to the detailed form via "More options".
  const [quickMode, setQuickMode] = useState(true);
  const [locating, setLocating] = useState(false);
  const [residenceLat, setResidenceLat] = useState<number | null>(null);
  const [residenceLng, setResidenceLng] = useState<number | null>(null);

  // Address state — country defaults to Uganda, but NOTHING below country is
  // pre-filled: the user must pick their official village themselves.
  const [continent, setContinent] = useState("Africa");
  const [country, setCountry] = useState("Uganda");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [town, setTown] = useState("");
  const [subCounty, setSubCounty] = useState("");
  const [parish, setParish] = useState("");
  const [village, setVillage] = useState("");
  // Official Uganda administrative selection (ug_* dataset). Single source of
  // truth for region/district/sub-county/parish/village when in Uganda.
  const [ugSelection, setUgSelection] = useState<UgLocationSelection | null>(null);
  const [ugError, setUgError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  // Draft autosave — partial form input is synced to the server (table
  // `profile_drafts`) so people can close the gate (it's optional) and
  // resume on ANY device or browser. localStorage is kept as an offline
  // fallback when the network is unavailable.
  const draftKey = user ? `welile:profile-draft:${user.id}` : null;
  const draftRestored = useRef(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [draftSyncing, setDraftSyncing] = useState(false);

  // Apply a saved draft object on top of the current (DB-seeded) form
  // state. Cascades are suppressed so restored values aren't wiped.
  const applyDraft = useCallback((d: Record<string, unknown>) => {
    seeding.current = true;
    if (typeof d.continent === "string") setContinent(d.continent);
    if (typeof d.country === "string") setCountry(d.country);
    if (typeof d.region === "string") setRegion(d.region);
    if (typeof d.district === "string") setDistrict(d.district);
    if (typeof d.city === "string") setCity(d.city);
    if (typeof d.town === "string") setTown(d.town);
    if (typeof d.subCounty === "string") setSubCounty(d.subCounty);
    if (typeof d.parish === "string") setParish(d.parish);
    if (typeof d.village === "string") setVillage(d.village);
    if (d.ugSelection && typeof d.ugSelection === "object") {
      setUgSelection(d.ugSelection as UgLocationSelection);
    }
    if (typeof d.persona === "string") setPersona(d.persona);
    if (typeof d.occupation === "string") setOccupation(d.occupation);
    if (typeof d.residenceLat === "number") setResidenceLat(d.residenceLat);
    if (typeof d.residenceLng === "number") setResidenceLng(d.residenceLng);
    if (d.step === 1 || d.step === 2 || d.step === 3) setStep(d.step);
    if (typeof d.quickMode === "boolean") setQuickMode(d.quickMode);
    if (typeof d.savedAt === "number") setDraftSavedAt(d.savedAt);
    setTimeout(() => {
      seeding.current = false;
    }, 0);
  }, []);

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

  // Rebuild the official selection from a saved village id so an existing
  // address shows as a confirmed pick instead of an empty picker.
  useEffect(() => {
    const id = profile?.ug_village_id;
    if (!id || ugSelection) return;
    let cancelled = false;
    resolveUgVillage(id)
      .then((sel) => { if (!cancelled && sel) setUgSelection(sel); })
      .catch(() => { /* stored names remain the fallback */ });
    return () => { cancelled = true; };
  }, [profile?.ug_village_id, ugSelection]);

  // Seed the form from whatever the profile already has, so users only
  // fill the blanks.
  useEffect(() => {
    if (!profile) return;
    seedFromProfile(profile);
  }, [profile?.id, seedFromProfile]);

  // Restore a previously saved draft (once) on top of the DB-seeded
  // values. We prefer the server copy (cross-device) and fall back to the
  // local cache when offline. The most recent of the two wins.
  useEffect(() => {
    if (!user || !draftKey || draftRestored.current || !profile) return;
    draftRestored.current = true;

    let cancelled = false;

    const readLocal = (): Record<string, unknown> | null => {
      try {
        const raw = localStorage.getItem(draftKey);
        return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    };

    (async () => {
      const local = readLocal();
      let server: Record<string, unknown> | null = null;
      try {
        const { data } = await supabase
          .from("profile_drafts")
          .select("draft")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.draft && typeof data.draft === "object") {
          server = data.draft as Record<string, unknown>;
        }
      } catch {
        /* offline — local fallback only */
      }
      if (cancelled) return;

      // Choose whichever draft was saved most recently.
      const localAt = typeof local?.savedAt === "number" ? local.savedAt : 0;
      const serverAt = typeof server?.savedAt === "number" ? server.savedAt : 0;
      const chosen = serverAt >= localAt ? server ?? local : local ?? server;
      if (chosen) applyDraft(chosen);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, draftKey, profile, applyDraft]);

  // Debounced autosave of the in-progress form to BOTH the server (for
  // cross-device resume) and localStorage (offline fallback). Runs only
  // after the initial restore so we never clobber a draft with defaults.
  useEffect(() => {
    if (!user || !draftKey || !draftRestored.current) return;
    const handle = setTimeout(() => {
      const savedAt = Date.now();
      const payload = {
        continent,
        country,
        region,
        district,
        city,
        town,
        subCounty,
        parish,
        village,
        ugSelection,
        persona,
        occupation,
        residenceLat,
        residenceLng,
        step,
        quickMode,
        savedAt,
      };
      try {
        localStorage.setItem(draftKey, JSON.stringify(payload));
      } catch {
        /* storage full / unavailable — best effort */
      }
      setDraftSavedAt(savedAt);
      setDraftSyncing(true);
      void supabase
        .from("profile_drafts")
        .upsert(
          { user_id: user.id, draft: payload as any },
          { onConflict: "user_id" },
        )
        .then(() => setDraftSyncing(false), () => setDraftSyncing(false));
    }, 800);
    return () => clearTimeout(handle);
  }, [
    user,
    draftKey,
    continent,
    country,
    region,
    district,
    city,
    town,
    subCounty,
    parish,
    village,
    ugSelection,
    persona,
    occupation,
    residenceLat,
    residenceLng,
    step,
    quickMode,
  ]);

  // Allow other parts of the app (e.g. Settings) to open this gate in
  // edit mode so a user can revise an already-complete profile.
  useEffect(() => {
    const handler = () => {
      if (profile) seedFromProfile(profile);
      setStep(1);
      setDismissed(false);
      // Editing from Settings → give the full detailed form, not quick mode.
      setQuickMode(false);
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
      setUgSelection(null);
    }
    setRegion("");
    setDistrict("");
    setCity("");
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
    setUgSelection(null);
  }, [continent]);

  const isUganda = country === "Uganda";
  const resolvedCountry = country.trim();
  // `geoReady` is referenced so this recomputes once the dataset loads.
  const countryIso = useMemo(
    () => isoForCountry(country),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [country, geoReady],
  );

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
    if (isUganda && !ugSelection && !district) return false;
    return true;
  }, [resolvedCountry, isUganda, ugSelection, district]);

  const step2Valid = !!persona;

  const referrerWillChange =
    !!referrerOverride && referrerOverride !== profile?.referrer_id;
  const step3Valid =
    !referrerWillChange || overrideReason.trim().length >= 10;

  const handleResetLocation = () => {
    setContinent("Africa");
    setCountry("Uganda");
    setRegion("");
    setDistrict("");
    setCity("");
    setTown("");
    setSubCounty("");
    setParish("");
    setVillage("");
    setUgSelection(null);
    // Return to the simple, one-field flow and forget any stale saved
    // draft (e.g. an old "France/Paris" selection) so it can't be
    // restored again on the next visit.
    setQuickMode(true);
    setDraftSavedAt(null);
    draftRestored.current = true;
    if (draftKey) {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
    }
    if (user) {
      void supabase.from("profile_drafts").delete().eq("user_id", user.id);
    }
    toast.success("Reset to Uganda", {
      description: "Pick your official village below.",
    });
  };

  // One-tap GPS capture so users don't have to type any address detail.
  const handleUseMyLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("Location not available on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setResidenceLat(lat);
        setResidenceLng(lng);
        // Reverse-geocode the pin into a readable place name (keyless OSM service).
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
            { headers: { Accept: "application/json" } },
          );
          if (res.ok) {
            const data = await res.json();
            const a = data?.address ?? {};
            // Most-specific area for the "town" field.
            const area =
              a.neighbourhood ||
              a.suburb ||
              a.village ||
              a.hamlet ||
              a.town ||
              a.city_district ||
              a.city ||
              a.county ||
              "";
            const cityName = a.city || a.town || a.municipality || "";
            const districtName = a.county || a.state_district || a.region || "";
            if (area) setTown(area);
            if (cityName) setCity(cityName);
            if (isUganda && districtName) {
              const matched = UGANDA_DISTRICTS.find(
                (d) => d.toLowerCase() === districtName.replace(/ district$/i, "").toLowerCase(),
              );
              if (matched) setDistrict(matched);
            }
            setLocating(false);
            toast.success("Location captured", {
              description: area ? `We saved ${area}.` : "We saved where you are now.",
            });
            return;
          }
        } catch {
          /* reverse geocoding is best-effort */
        }
        setLocating(false);
        toast.success("Location captured", {
          description: "We saved your exact spot.",
        });
      },
      () => {
        setLocating(false);
        toast.error("Couldn't get your location", {
          description: "You can still finish — we'll use Kampala by default.",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
      if (residenceLat != null && residenceLng != null) {
        update.residence_lat = residenceLat;
        update.residence_lng = residenceLng;
      }
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

      // The profile is saved — clear the draft locally and on the server.
      if (draftKey) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* ignore */
        }
      }
      void supabase.from("profile_drafts").delete().eq("user_id", user.id);
      setDraftSavedAt(null);

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

  // Completing the profile is optional — the gate is freely dismissable in
  // both edit mode and the prompted (incomplete-profile) mode. Dismissing
  // does not persist, so the prompt can reappear next session.
  const closeEditor = () => setEditMode(false);
  const dismissGate = () => {
    setDismissed(true);
    toast.message("We'll remind you next time", {
      description: "Finish your profile to unlock the right agent and listings.",
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        if (editMode) closeEditor();
        else dismissGate();
      }}
    >
      <DialogContent
        className="w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] sm:max-w-lg max-h-[92vh] overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] xs:p-4 sm:p-6 [&>button:not([data-later-skip])]:hidden"
      >
        <button
          type="button"
          data-later-skip
          onClick={() => {
            if (editMode) {
              closeEditor();
              return;
            }
            dismissGate();
          }}
          aria-label={editMode ? "Close editor" : "Skip profile completion for later"}
          className="absolute right-2 top-2 sm:right-3 sm:top-3 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-95 transition-all"
        >
          {editMode ? <X className="h-4 w-4" aria-hidden="true" /> : "Later"}
        </button>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            {editMode ? "Edit your profile" : quickMode ? "Quick setup" : "Complete your profile"}
          </DialogTitle>
          <DialogDescription>
            {quickMode && !editMode
              ? "Two taps. Tell us where you are and who you are — that's it."
              : `Step ${step} of 3 — ${
                  editMode
                    ? "update your location, role, or referring agent."
                    : "this takes about a minute and unlocks the right agent, listings, and reports for your area."
                }`}
          </DialogDescription>
        </DialogHeader>

        {!editMode && draftSavedAt != null && (
          <div className="flex items-center gap-1.5 text-[11px] xs:text-xs text-muted-foreground">
            {draftSyncing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Saving draft…</span>
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 text-primary" />
                <span>Draft saved — resume on any device.</span>
              </>
            )}
          </div>
        )}

        {quickMode && !editMode && (
          <div className="space-y-5 xs:space-y-6 sm:space-y-7 pt-1">
            {/* 1) Location — one tap, sensible Kampala default */}
            <div className="space-y-3">
              <p className="text-[11px] xs:text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Where you live
              </p>
              <div className="rounded-2xl border bg-card p-3 xs:p-3.5 sm:p-4 space-y-3">
                {/* Manual entry — type your area / neighbourhood */}
                <div className="space-y-1.5">
                  <Label htmlFor="quick-location" className="text-[12px] xs:text-[13px] font-medium">
                    Your area, village or neighbourhood
                  </Label>
                  <Input
                    id="quick-location"
                    value={town}
                    onChange={(e) => setTown(e.target.value)}
                    placeholder="e.g. Najjera, Wakiso"
                    autoComplete="off"
                    className="h-12 xs:h-14 rounded-xl text-[15px] xs:text-base"
                  />
                </div>
                {/* Search around using Google Maps (opens in a new tab) */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2 h-11 xs:h-12 rounded-xl text-[13px] xs:text-sm sm:text-base font-medium"
                  onClick={() => {
                    const query = [town, city || district, country].filter(Boolean).join(", ").trim();
                    const url = query
                      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
                      : `https://www.google.com/maps`;
                    window.open(url, "_blank", "noopener,noreferrer");
                  }}
                >
                  <Search className="h-4 w-4" />
                  Search around on Google Maps
                </Button>
                {/* Optional GPS pin for accuracy */}
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full gap-2 h-10 xs:h-11 rounded-xl text-[12px] xs:text-[13px] sm:text-sm font-medium text-muted-foreground"
                  onClick={handleUseMyLocation}
                  disabled={locating}
                >
                  {locating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Navigation className="h-4 w-4" />
                  )}
                  {residenceLat != null ? "Location pinned — update" : "Pin my exact location (optional)"}
                  {residenceLat != null && <Check className="h-3.5 w-3.5 text-primary" />}
                </Button>
              </div>
            </div>

            {/* 2) Role — clean picture buttons */}
            <div className="space-y-3">
              <p className="text-[11px] xs:text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Who you are
              </p>
              <div className="grid grid-cols-2 gap-3 xs:gap-3 sm:gap-3.5">
                {QUICK_PERSONAS.map((p) => {
                  const selected = persona === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setPersona(p.value)}
                      aria-pressed={selected}
                      className={`group relative flex min-h-[80px] xs:min-h-[88px] flex-col items-center justify-center gap-1.5 sm:gap-2 rounded-2xl border p-3 xs:p-3.5 sm:p-4 text-center transition-all duration-150 ${
                        selected
                          ? "border-primary bg-primary/5 dark:bg-primary/20 ring-1 ring-primary dark:ring-2"
                      : "border-border dark:border-border/60 hover:border-foreground/20 hover:bg-muted/40 dark:hover:bg-muted/50"
                      }`}
                    >
                      {selected && (
                        <span className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                      <span className="text-xl xs:text-2xl sm:text-3xl" aria-hidden>{p.emoji}</span>
                      <span className="text-xs xs:text-[13px] sm:text-sm font-medium leading-tight">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <Button
                type="button"
                size="lg"
                className="w-full min-h-[48px] xs:min-h-[52px] rounded-xl text-[15px] xs:text-base font-semibold"
                onClick={handleSubmit}
                disabled={submitting || !persona}
              >
                {submitting && <Loader2 className="h-5 w-5 animate-spin mr-2" />}
                Finish
              </Button>
              <button
                type="button"
                onClick={() => setQuickMode(false)}
                className="w-full text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                More options
              </button>
            </div>
          </div>
        )}

        {(!quickMode || editMode) && step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 xs:gap-3">
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

            {!isUganda && (
              <button
                type="button"
                onClick={handleResetLocation}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary/10 px-3 py-2 text-[13px] font-medium text-primary transition-colors hover:bg-primary/15"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Not in {country}? Switch back to Uganda
              </button>
            )}

            {isUganda ? (
              <>
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 xs:gap-3">
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
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 xs:gap-3">
                  <div className="space-y-1.5">
                    <Label>City</Label>
                    <CityCombobox countryIso={countryIso} value={city} onChange={setCity} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Town</Label>
                    <Input value={town} onChange={(e) => setTown(e.target.value)} placeholder="e.g. Ntinda" maxLength={60} />
                  </div>
                </div>
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-4 xs:gap-3">
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
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 xs:gap-3">
                  <div className="space-y-1.5">
                    <Label>Region / State</Label>
                    <Input value={region} onChange={(e) => setRegion(e.target.value)} maxLength={60} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>City</Label>
                    <CityCombobox countryIso={countryIso} value={city} onChange={setCity} />
                  </div>
                </div>
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-4 xs:gap-3">
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

            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => {
                const query = [town, city, district, country].filter(Boolean).join(", ").trim();
                const url = query
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
                  : `https://www.google.com/maps`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              <Search className="h-4 w-4" />
              Search around on Google Maps
            </Button>

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
          <div className="space-y-4">
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
          <div className="space-y-4">
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
                {editMode ? "Save changes" : "Save & continue"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
