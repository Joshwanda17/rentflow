
Fix the Chrome install flow by removing the logic that consumes the native install prompt before the user taps the button, and only show the install CTA when a real deferred prompt exists.

What I found:
- `src/components/PWAInstallPrompt.tsx` auto-calls `promptInstall()` after 400ms when `beforeinstallprompt` is available.
- In Chrome, that event is single-use. If it gets consumed or dismissed once, the button can remain visible but no usable prompt remains.
- The current UI also shows the modal on Android even when there is no actual prompt yet, which creates a false “Install App” button that cannot complete installation.
- The screenshot/footer issue was already cleaned up, so the main remaining problem is the prompt lifecycle, not the label.

Planned changes:

1. Update `src/components/PWAInstallPrompt.tsx`
- Remove the auto-install `useEffect` that triggers the prompt automatically.
- Gate the Android/desktop install modal so it only appears when `isInstallable || hasPrompt` is true.
- Keep iOS on the manual guide path.
- Keep the button click as the only place that calls `promptInstall()`.
- If the prompt is unavailable, do not show a fake install CTA; optionally close the modal or keep it hidden until the event arrives.

2. Tighten the install state in `src/hooks/usePWAInstall.tsx`
- Clear installable state consistently after a dismissed/used prompt so the UI does not keep advertising installation when Chrome has no active prompt left.
- Keep `appinstalled` handling and local storage redirect logic intact.

3. Reduce conflicting/manual fallback behavior
- Ensure Android Chrome does not fall back into instruction-style install guidance from `AdaptiveInstallGuide`.
- Reserve manual instructions for iOS only, since Chrome should rely on the native prompt.

4. Verify related entry points
- Check any alternate install surfaces such as `src/pages/Landing.tsx` so they follow the same “only show install when prompt exists” rule and do not reintroduce the same bug.

Technical details:
```text
Desired Chrome flow:
beforeinstallprompt fires
  -> store deferred prompt
  -> show Install App button
user taps button
  -> call prompt()
  -> await userChoice
  -> accepted => mark installed, hide UI
  -> dismissed => clear prompt + hide CTA until browser provides a new event
```

Files to update:
- `src/components/PWAInstallPrompt.tsx`
- `src/hooks/usePWAInstall.tsx`
- likely `src/pages/Landing.tsx` for consistency

Expected result:
- On Chrome, the Install button will no longer “pretend” to work after the prompt has already been consumed.
- Users will only see the install button when the browser has actually provided a usable native install prompt.
- iOS manual install remains unchanged.
