/**
 * Shared browser GPS capture for agent field actions.
 *
 * Renewals (and any other flow that needs the property pin) fall back to a
 * fresh on-the-spot capture when the platform has no GPS on record for the
 * property. Errors are plain-language so they can be shown to an agent as-is.
 */
export interface CapturedGps {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export function isGpsRequiredError(message: unknown): boolean {
  const raw = typeof message === 'string' ? message : String((message as any)?.message ?? '');
  return raw.includes('GPS_REQUIRED') || raw.includes('RENT_REQUEST_GPS_REQUIRED');
}

export async function captureGps(timeoutMs = 15000): Promise<CapturedGps> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('This device cannot capture GPS. Open the app in a browser that allows location access.');
  }
  return new Promise<CapturedGps>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: typeof pos.coords.accuracy === 'number' ? pos.coords.accuracy : null,
      }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new Error('Location permission was blocked. Allow location for this site, then try again at the house.'));
        } else if (err.code === err.TIMEOUT) {
          reject(new Error('Getting your location took too long. Step outside at the house and try again.'));
        } else {
          reject(new Error('Your location could not be read. Step outside at the house and try again.'));
        }
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}
