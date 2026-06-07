import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MapPin, Crosshair, Loader2, MapPinned, AlertCircle, RefreshCw } from 'lucide-react';
import { captureSmartLocation } from '@/hooks/useSmartLocation';
import { reverseGeocode } from '@/lib/reverseGeocode';
import { toast } from 'sonner';

// Ensure default Leaflet marker icons resolve (CDN assets, no bundler config needed).
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

type LatLng = { latitude: number; longitude: number };

interface MapPinPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Starting pin position (e.g. the GPS fix). */
  initial: LatLng;
  /** Called with the final pin position when the agent confirms. */
  onConfirm: (pos: LatLng) => void;
}

// Keeps the Leaflet map view in sync when the pin is recentred programmatically.
function Recenter({ pos }: { pos: LatLng }) {
  const map = useMap();
  useEffect(() => {
    map.setView([pos.latitude, pos.longitude], map.getZoom(), { animate: true });
  }, [pos.latitude, pos.longitude, map]);
  return null;
}

// Moves the pin when the agent taps anywhere on the map.
function ClickToMove({ onMove }: { onMove: (pos: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onMove({ latitude: e.latlng.lat, longitude: e.latlng.lng });
    },
  });
  return null;
}

export function MapPinPicker({ open, onOpenChange, initial, onConfirm }: MapPinPickerProps) {
  const [pos, setPos] = useState<LatLng>(initial);
  const [locating, setLocating] = useState(false);
  const [address, setAddress] = useState<string>('');
  const [fetchingAddress, setFetchingAddress] = useState(false);
  const [addressError, setAddressError] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset the pin to the latest initial position each time the dialog opens.
  useEffect(() => {
    if (open) setPos(initial);
  }, [open, initial.latitude, initial.longitude]);

  // Debounced reverse-geocode preview whenever the pin moves.
  const fetchPreview = async (coords: LatLng) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setFetchingAddress(true);
    setAddressError(false);
    try {
      const res = await reverseGeocode(coords.latitude, coords.longitude, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (res?.address) {
        setAddress(res.address);
        setAddressError(false);
      } else {
        setAddress('');
        setAddressError(true);
      }
    } catch {
      if (!ctrl.signal.aborted) setAddressError(true);
    } finally {
      if (!ctrl.signal.aborted) setFetchingAddress(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setFetchingAddress(true);
    debounceRef.current = setTimeout(() => {
      fetchPreview(pos);
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.latitude, pos.longitude, open]);

  const recenterToGps = async () => {
    setLocating(true);
    try {
      const res = await captureSmartLocation();
      if (res.ok !== true) {
        toast.error(res.message || 'Could not get your location');
        return;
      }
      setPos({ latitude: res.latitude, longitude: res.longitude });
    } finally {
      setLocating(false);
    }
  };

  const handleRetry = () => fetchPreview(pos);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <MapPin className="h-4 w-4 text-primary" /> Drag the pin to the house
          </DialogTitle>
          <DialogDescription className="text-xs">
            Drag the pin or tap the map to mark the exact spot, then confirm to fill the area.
          </DialogDescription>
        </DialogHeader>

        <div className="relative h-[320px] w-full">
          {open && (
            <MapContainer
              center={[pos.latitude, pos.longitude]}
              zoom={16}
              scrollWheelZoom
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <Recenter pos={pos} />
              <ClickToMove onMove={setPos} />
              <Marker
                position={[pos.latitude, pos.longitude]}
                draggable
                eventHandlers={{
                  dragend: (e) => {
                    const m = e.target as L.Marker;
                    const ll = m.getLatLng();
                    setPos({ latitude: ll.lat, longitude: ll.lng });
                  },
                }}
              />
            </MapContainer>
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={recenterToGps}
            disabled={locating}
            className="absolute bottom-3 right-3 z-[400] shadow-md"
          >
            {locating ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Crosshair className="h-4 w-4 mr-1.5" />
            )}
            My location
          </Button>
        </div>

        {/* Address / landmark preview */}
        <div className="mx-4 mt-2">
          <div className="rounded-lg border bg-muted/40 px-3 py-2.5 flex items-start gap-2.5">
            {fetchingAddress ? (
              <Loader2 className="h-4 w-4 mt-0.5 text-muted-foreground animate-spin shrink-0" />
            ) : addressError ? (
              <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            ) : (
              <MapPinned className="h-4 w-4 mt-0.5 text-primary shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                Nearby landmark / address
              </p>
              {fetchingAddress ? (
                <p className="text-sm text-muted-foreground mt-0.5">Looking up this spot…</p>
              ) : addressError ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm text-destructive">Unknown area — tap closer to a road</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRetry}
                    className="h-6 px-2 text-xs"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Retry
                  </Button>
                </div>
              ) : (
                <p className="text-sm font-medium text-foreground mt-0.5 truncate">{address}</p>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 pt-3 flex items-center gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => {
              onConfirm(pos);
              onOpenChange(false);
            }}
          >
            Use this location
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
