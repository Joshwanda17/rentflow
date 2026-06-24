import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MapPin,
  Navigation,
  Loader2,
  ShieldCheck,
  Check,
  Search,
  X,
  AlertTriangle,
  SignalHigh,
  SignalMedium,
  SignalLow,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { UGANDA_LOCATIONS } from "@/lib/ugandaLocations";
import type { UgandaLocation } from "@/lib/ugandaLocations";

/**
 * LocationCaptureGate — a modern, prominent popup shown to every signed-in
 * user who has not yet shared their location. It requests GPS permission and
 * captures the user's administrative location (district / city / country) via
 * reverse geocoding, then persists it to `profiles` and `user_locations`.
 *
 * Mounted once, globally (App.tsx). Non-blocking: the user may dismiss it and
 * it will re-ask after a snooze window.
 */

const SNOOZE_KEY = "welile-location-prompt-snooze";
const SNOOZE_MS = 24 * 60 * 60 * 1000; // re-ask after 24h if dismissed

type AdminLocation = {
  district: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
};

type PendingFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  admin: AdminLocation;
};

type GpsQuality = {
  label: string;
  tone: "good" | "fair" | "weak";
  weak: boolean;
  Icon: typeof SignalHigh;
};

/** Map a GPS accuracy radius (meters) to a human quality rating. */
function gpsQuality(accuracy: number | null): GpsQuality {
  if (accuracy == null) {
    return { label: "Unknown accuracy", tone: "weak", weak: true, Icon: SignalLow };
  }
  if (accuracy <= 30) {
    return { label: "Excellent signal", tone: "good", weak: false, Icon: SignalHigh };
  }
  if (accuracy <= 75) {
    return { label: "Good signal", tone: "good", weak: false, Icon: SignalHigh };
  }
  if (accuracy <= 150) {
    return { label: "Fair signal", tone: "fair", weak: false, Icon: SignalMedium };
  }
  return { label: "Weak signal", tone: "weak", weak: true, Icon: SignalLow };
}

async function reverseGeocodeAdmin(lat: number, lng: number): Promise<AdminLocation> {
  const fallback: AdminLocation = { district: null, city: null, country: null, address: null };
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=12&addressdetails=1`,
      { headers: { Accept: "application/json", "Accept-Language": "en" }, signal: ctrl.signal },
    );
    clearTimeout(timeout);
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      display_name?: string;
      address?: Record<string, string>;
    };
    const a = data.address || {};
    return {
      // Uganda admin: county/state_district map best to "district"
      district:
        a.county || a.state_district || a.district || a.region || a.state || a.city || null,
      city: a.city || a.town || a.village || a.suburb || a.municipality || null,
      country: a.country || null,
      address: data.display_name || null,
    };
  } catch {
    return fallback;
  }
}

export function LocationCaptureGate() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "capturing" | "review" | "saving" | "success"
  >("idle");
  const [captured, setCaptured] = useState<AdminLocation | null>(null);
  const [pending, setPending] = useState<PendingFix | null>(null);
  const [mode, setMode] = useState<"gps" | "manual">("gps");
  const [query, setQuery] = useState("");
  const checkedRef = useRef(false);

  const snoozed = useMemo(() => {
    try {
      const ts = Number(localStorage.getItem(SNOOZE_KEY) || 0);
      return ts > Date.now() - SNOOZE_MS;
    } catch {
      return false;
    }
  }, []);

  // Decide whether to show the prompt.
  useEffect(() => {
    if (!user || checkedRef.current || snoozed) return;
    checkedRef.current = true;
    let cancelled = false;

    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("residence_lat, residence_lng, district, country")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;
      const hasLocation =
        !!data &&
        data.residence_lat != null &&
        data.residence_lng != null &&
        !!data.country;
      if (!hasLocation) {
        // small delay so it doesn't fight other startup UI
        setTimeout(() => !cancelled && setOpen(true), 2500);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, snoozed]);

  const handleShare = useCallback(async () => {
    if (!user) return;
    if (!navigator.geolocation) {
      toast.error("Your device does not support location services.");
      setMode("manual");
      return;
    }
    setStatus("capturing");
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 20000,
          maximumAge: 0,
        });
      });

      const { latitude, longitude, accuracy } = position.coords;
      const admin = await reverseGeocodeAdmin(latitude, longitude);

      // Show the captured point + its quality and let the user review/confirm
      // before saving — especially important when the signal is weak.
      setPending({ latitude, longitude, accuracy: accuracy ?? null, admin });
      setStatus("review");
    } catch (err: unknown) {
      const code = (err as GeolocationPositionError)?.code;
      if (code === 1) {
        toast.error("Location permission denied. Please enable it in your browser settings.");
      } else if (code === 2) {
        toast.error("Location unavailable. Please try again.");
      } else if (code === 3) {
        toast.error("Location request timed out. Please try again.");
      } else {
        toast.error("Could not get your location. Please try again.");
      }
      setStatus("idle");
      // GPS failed — offer manual entry as a fallback.
      setMode("manual");
    }
  }, [user]);

  // Persist the reviewed GPS fix to the database.
  const persistFix = useCallback(async () => {
    if (!user || !pending) return;
    const { latitude, longitude, accuracy, admin } = pending;
    setStatus("saving");
    setCaptured(admin);
    try {
      // 1) Append a tracking record (history of captures)
      await supabase.from("user_locations").insert({
        user_id: user.id,
        latitude,
        longitude,
        accuracy: accuracy ?? null,
        address: admin.address,
        city: admin.city,
        country: admin.country,
      });

      // 2) Update the canonical profile location
      const profilePatch: Record<string, unknown> = {
        residence_lat: latitude,
        residence_lng: longitude,
      };
      if (admin.country) profilePatch.country = admin.country;
      if (admin.city) profilePatch.city = admin.city;
      if (admin.district) profilePatch.district = admin.district;
      await supabase.from("profiles").update(profilePatch).eq("id", user.id);

      // 3) Capture a trust signal (best-effort, non-blocking)
      try {
        await supabase.rpc("capture_trust_signal" as never, {
          p_user_id: user.id,
          p_signal_type: "location_shared",
          p_metadata: { latitude, longitude, accuracy } as never,
        } as never);
      } catch {
        /* trust signal is best-effort */
      }

      setStatus("success");
      toast.success("Location shared. Thank you!");
      setTimeout(() => setOpen(false), 1800);
    } catch {
      toast.error("Could not save your location. Please try again.");
      setStatus("review");
    }
  }, [user, pending]);

  const filteredLocations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return UGANDA_LOCATIONS;
    return UGANDA_LOCATIONS.filter(
      (l) => l.name.toLowerCase().includes(q) || l.region.toLowerCase().includes(q),
    );
  }, [query]);

  const handleManualSelect = useCallback(
    async (loc: UgandaLocation) => {
      if (!user) return;
      setStatus("saving");
      const admin: AdminLocation = {
        district: loc.name,
        city: loc.name,
        country: "Uganda",
        address: `${loc.name}, ${loc.region}, Uganda`,
      };
      setCaptured(admin);
      try {
        // 1) Append a tracking record (history of captures)
        await supabase.from("user_locations").insert({
          user_id: user.id,
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: null,
          address: admin.address,
          city: admin.city,
          country: admin.country,
        });

        // 2) Update the canonical profile location
        await supabase
          .from("profiles")
          .update({
            residence_lat: loc.latitude,
            residence_lng: loc.longitude,
            country: admin.country,
            city: admin.city,
            district: admin.district,
            region: loc.region,
          })
          .eq("id", user.id);

        // 3) Capture a trust signal (best-effort, non-blocking)
        try {
          await supabase.rpc("capture_trust_signal" as never, {
            p_user_id: user.id,
            p_signal_type: "location_shared",
            p_metadata: {
              latitude: loc.latitude,
              longitude: loc.longitude,
              source: "manual",
            } as never,
          } as never);
        } catch {
          /* trust signal is best-effort */
        }

        setStatus("success");
        toast.success("Location saved. Thank you!");
        setTimeout(() => setOpen(false), 1800);
      } catch {
        toast.error("Could not save your location. Please try again.");
        setStatus("idle");
      }
    },
    [user],
  );

  const handleSnooze = useCallback(() => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? handleSnooze() : setOpen(o))}>
      <DialogContent className="max-w-sm rounded-2xl border-0 p-0 overflow-hidden">
        {/* Hero */}
        <div className="relative bg-gradient-to-br from-primary to-primary/70 px-6 pt-8 pb-10 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary-foreground/15 ring-4 ring-primary-foreground/10">
            {status === "success" ? (
              <Check className="h-8 w-8 text-primary-foreground" />
            ) : status === "capturing" || status === "saving" ? (
              <Loader2 className="h-8 w-8 text-primary-foreground animate-spin" />
            ) : (
              <MapPin className="h-8 w-8 text-primary-foreground" />
            )}
          </div>
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-primary-foreground text-lg font-bold">
              {status === "success" ? "Location shared!" : "Share your location"}
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/80 text-sm">
              {status === "success"
                ? captured?.district || captured?.city
                  ? `We've recorded ${[captured?.city, captured?.district].filter(Boolean).join(", ")}.`
                  : "Your location has been recorded."
                : "Help us serve you better with accurate, local services."}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-6 -mt-4">
          {mode === "manual" && status !== "success" ? (
            <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
              <p className="text-sm text-muted-foreground">
                Can't use GPS? Choose your <span className="font-medium text-foreground">district or town</span> below.
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search district or town…"
                  className="h-11 pl-9"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="max-h-56 overflow-y-auto -mx-1 px-1 space-y-1">
                {filteredLocations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No areas match "{query}".
                  </p>
                ) : (
                  filteredLocations.map((loc) => (
                    <button
                      key={loc.name}
                      type="button"
                      disabled={status === "saving"}
                      onClick={() => handleManualSelect(loc)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm text-left transition-colors hover:bg-muted disabled:opacity-50 touch-manipulation"
                    >
                      <span className="font-medium text-foreground">{loc.name}</span>
                      <span className="text-xs text-muted-foreground">{loc.region}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <Navigation className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                <p className="text-muted-foreground">
                  We use GPS to capture your <span className="font-medium text-foreground">district, city and country</span> so agents and services reach the right place.
                </p>
              </div>
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-primary shrink-0" />
                <p className="text-muted-foreground">
                  Your location is private and only used to verify and improve your experience.
                </p>
              </div>
            </div>
          </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 pt-4 space-y-2">
          {status !== "success" && (
            <>
              {mode === "gps" ? (
                <Button
                  onClick={handleShare}
                  disabled={status === "capturing" || status === "saving"}
                  size="lg"
                  className="w-full gap-2"
                >
                  {status === "capturing" || status === "saving" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {status === "capturing" ? "Getting location…" : "Saving…"}
                    </>
                  ) : (
                    <>
                      <Navigation className="h-4 w-4" />
                      Share my location
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setMode("gps");
                    handleShare();
                  }}
                  variant="outline"
                  size="lg"
                  disabled={status === "saving"}
                  className="w-full gap-2"
                >
                  <Navigation className="h-4 w-4" />
                  Try GPS again
                </Button>
              )}
              {mode === "gps" && (
                <Button
                  onClick={() => setMode("manual")}
                  variant="ghost"
                  size="sm"
                  disabled={status === "capturing" || status === "saving"}
                  className="w-full text-muted-foreground"
                >
                  Enter location manually
                </Button>
              )}
              <Button
                onClick={handleSnooze}
                variant="ghost"
                size="sm"
                disabled={status === "capturing" || status === "saving"}
                className="w-full text-muted-foreground"
              >
                Not now
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default LocationCaptureGate;