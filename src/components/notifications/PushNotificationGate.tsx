import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, BellRing, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  VAPID_PUBLIC_KEY,
  arrayBufferToBase64,
  isPushSupported,
  subscriptionUsesCurrentVapidKey,
  urlBase64ToUint8Array,
} from "@/lib/webPush";

/**
 * PushNotificationGate — a prominent popup shown to signed-in users who have
 * not yet enabled push notifications. Tapping "Enable notifications" triggers
 * the native browser/system permission prompt (allow/deny); if allowed, the
 * device is subscribed to Web Push. Non-blocking: the user may dismiss it and
 * it re-asks after a snooze window.
 *
 * Mounted once, globally (App.tsx).
 */

const SNOOZE_KEY = "welile-push-prompt-snooze";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000; // re-ask after 3 days if dismissed

type Status = "idle" | "subscribing" | "success";

export function PushNotificationGate() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  // When true, the user MUST enable notifications — the prompt can't be
  // dismissed. This is the case whenever push is supported and permission is
  // still grantable ("default"). We only allow snoozing when the browser can't
  // deliver push at all (unsupported) or the OS-level permission is "denied"
  // (which we can't override from the app).
  const [required, setRequired] = useState(false);
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
    if (!user || checkedRef.current) return;
    checkedRef.current = true;

    // If already granted, nothing to do. If the browser can't do push at all,
    // don't nag. Otherwise (permission === "default" or "denied") the user must
    // act — enabling is mandatory so rejection/payout/rent alerts reach them.
    if (!isPushSupported()) return;
    if (Notification.permission === "granted") {
      // Silent self-heal: if the stored PushSubscription was created with an
      // older VAPID key, the server can no longer deliver to it. Rotate it
      // transparently so previously-subscribed devices resume receiving
      // notifications without a manual trip to Settings.
      void refreshSubscriptionIfVapidChanged(user.id);
      return;
    }

    const isDenied = Notification.permission === "denied";
    // Denied is only snooze-able because the app can't override an OS block.
    if (isDenied && snoozed) return;

    setRequired(!isDenied);

    let cancelled = false;
    // Small delay so it doesn't fight other startup UI (e.g. location gate).
    const t = setTimeout(() => !cancelled && setOpen(true), 5000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [user, snoozed]);

  const handleSnooze = useCallback(() => {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
  }, []);

  const handleEnable = useCallback(async () => {
    if (!user) return;
    if (!isPushSupported()) {
      toast.error("Push notifications aren't supported on this browser.");
      handleSnooze();
      return;
    }

    setStatus("subscribing");
    try {
      // Native browser/system permission prompt (Allow / Block).
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("idle");
        if (permission === "denied") {
          toast.error("Notifications blocked. You can enable them later in Settings.");
        }
        handleSnooze();
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
      }

      const json = subscription.toJSON();
      const p256dh = json.keys?.p256dh ?? arrayBufferToBase64(subscription.getKey("p256dh"));
      const auth = json.keys?.auth ?? arrayBufferToBase64(subscription.getKey("auth"));

      // Take exclusive ownership of this device's endpoint so role-scoped
      // pushes (e.g. Merchant Agent "New withdrawal to claim") never fire on
      // a device now signed in as a different user.
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", subscription.endpoint);

      const { error } = await supabase
        .from("push_subscriptions")
        .insert({
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh,
          auth,
        });
      if (error) throw error;

      setStatus("success");
      toast.success("Notifications enabled on this device.");
      setTimeout(() => setOpen(false), 1600);
    } catch (err) {
      console.error("Push subscription failed:", err);
      setStatus("idle");
      toast.error("Could not enable notifications. Please try again.");
    }
  }, [user, handleSnooze]);

  if (!user) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) return setOpen(o);
        // Mandatory: don't let the user dismiss until they've enabled (or the
        // browser blocked it). Snooze only applies to the non-required path.
        if (required && status !== "success") return;
        handleSnooze();
      }}
    >
      <DialogContent
        className={
          "max-w-sm rounded-2xl border-0 p-0 overflow-hidden" +
          (required && status !== "success" ? " [&>button]:hidden" : "")
        }
        overlayClassName="backdrop-blur-0 bg-background/60"
        onEscapeKeyDown={(e) => {
          if (required && status !== "success") e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (required && status !== "success") e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (required && status !== "success") e.preventDefault();
        }}
      >
        {/* Hero */}
        <div className="relative bg-gradient-to-br from-primary to-primary/70 px-6 pt-8 pb-10 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary-foreground/15 ring-4 ring-primary-foreground/10">
            {status === "success" ? (
              <Check className="h-8 w-8 text-primary-foreground" />
            ) : status === "subscribing" ? (
              <Loader2 className="h-8 w-8 text-primary-foreground animate-spin" />
            ) : (
              <BellRing className="h-8 w-8 text-primary-foreground" />
            )}
          </div>
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-primary-foreground text-lg font-bold">
              {status === "success" ? "Notifications on!" : "Stay in the loop"}
            </DialogTitle>
            <DialogDescription className="text-primary-foreground/80 text-sm">
              {status === "success"
                ? "You'll now get instant alerts on this device."
                : required
                  ? "Notifications are required to use Welile. You'll get instant alerts for listing decisions, deposits, withdrawals, payouts and rent updates."
                  : "Get instant alerts for deposits, withdrawals, payouts and rent updates — even when Welile is closed."}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 -mt-4">
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <p className="text-sm text-muted-foreground">
              Your browser will ask for permission next. Tap{" "}
              <span className="font-medium text-foreground">Allow</span> to turn on
              notifications for this device.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                className="w-full"
                onClick={handleEnable}
                disabled={status === "subscribing" || status === "success"}
              >
                {status === "subscribing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
                Enable notifications
              </Button>
              {!required && (
                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground"
                  onClick={handleSnooze}
                  disabled={status === "subscribing" || status === "success"}
                >
                  Not now
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PushNotificationGate;