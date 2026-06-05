import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps'
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
const GOOGLE_MAPS_API_KEY = Deno.env.get('GOOGLE_MAPS_API_KEY')

interface LatLng { lat: number; lng: number }
interface Stop { id: string; lat: number; lng: number; label?: string }

function isValidLatLng(p: unknown): p is LatLng {
  return (
    !!p && typeof p === 'object' &&
    typeof (p as LatLng).lat === 'number' && Number.isFinite((p as LatLng).lat) &&
    typeof (p as LatLng).lng === 'number' && Number.isFinite((p as LatLng).lng) &&
    Math.abs((p as LatLng).lat) <= 90 && Math.abs((p as LatLng).lng) <= 180
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    if (!LOVABLE_API_KEY || !GOOGLE_MAPS_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Maps routing is not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json().catch(() => null)
    const origin = body?.origin as LatLng | undefined
    const rawStops = Array.isArray(body?.stops) ? body.stops : []
    const roundTrip = body?.roundTrip !== false // default true: return to start

    if (!isValidLatLng(origin)) {
      return new Response(
        JSON.stringify({ error: 'A valid origin location is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const stops: Stop[] = rawStops
      .filter((s: unknown) => isValidLatLng(s))
      .slice(0, 24) // Routes API allows up to 25 waypoints incl. origin/destination
      .map((s: Stop) => ({ id: String(s.id ?? ''), lat: s.lat, lng: s.lng, label: s.label }))

    if (stops.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one stop with coordinates is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // With a single stop there is nothing to optimize — return it directly.
    if (stops.length === 1) {
      return new Response(
        JSON.stringify({
          orderedStops: stops,
          distanceMeters: null,
          durationSeconds: null,
          encodedPolyline: null,
          mapsUrl: buildMapsUrl(origin, stops, roundTrip),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // For an open route the last optimized waypoint is the destination; for a
    // round trip we come back to the origin. Routes API optimizes the
    // intermediates between a fixed origin and destination.
    const destination = roundTrip
      ? { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } }
      : { location: { latLng: { latitude: stops[stops.length - 1].lat, longitude: stops[stops.length - 1].lng } } }

    const intermediates = (roundTrip ? stops : stops.slice(0, -1)).map((s) => ({
      location: { latLng: { latitude: s.lat, longitude: s.lng } },
    }))
    const intermediateStops = roundTrip ? stops : stops.slice(0, -1)

    const routeRes = await fetch(`${GATEWAY_URL}/routes/directions/v2:computeRoutes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': GOOGLE_MAPS_API_KEY,
        'Content-Type': 'application/json',
        'X-Goog-FieldMask':
          'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.optimizedIntermediateWaypointIndex',
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination,
        intermediates,
        travelMode: 'DRIVE',
        optimizeWaypointOrder: true,
        routingPreference: 'TRAFFIC_AWARE',
      }),
    })

    if (!routeRes.ok) {
      const text = await routeRes.text()
      return new Response(
        JSON.stringify({ error: 'Route service error', status: routeRes.status, detail: text.slice(0, 500) }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const data = await routeRes.json()
    const route = data?.routes?.[0]
    if (!route) {
      return new Response(
        JSON.stringify({ error: 'No route could be computed for these stops' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const optimizedIndex: number[] = route.optimizedIntermediateWaypointIndex ?? intermediateStops.map((_, i) => i)
    const orderedIntermediates = optimizedIndex.map((i) => intermediateStops[i]).filter(Boolean)
    // Open route: append the fixed destination stop at the end.
    const orderedStops = roundTrip ? orderedIntermediates : [...orderedIntermediates, stops[stops.length - 1]]

    const durationSeconds = typeof route.duration === 'string'
      ? parseInt(route.duration.replace('s', ''), 10)
      : null

    return new Response(
      JSON.stringify({
        orderedStops,
        distanceMeters: route.distanceMeters ?? null,
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
        encodedPolyline: route.polyline?.encodedPolyline ?? null,
        mapsUrl: buildMapsUrl(origin, orderedStops, roundTrip),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Unexpected error', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})

function buildMapsUrl(origin: LatLng, orderedStops: Stop[], roundTrip: boolean): string {
  const o = `${origin.lat},${origin.lng}`
  const stopCoords = orderedStops.map((s) => `${s.lat},${s.lng}`)
  const destination = roundTrip ? o : stopCoords[stopCoords.length - 1]
  const waypoints = roundTrip ? stopCoords : stopCoords.slice(0, -1)
  const params = new URLSearchParams({
    api: '1',
    origin: o,
    destination,
    travelmode: 'driving',
  })
  if (waypoints.length > 0) params.set('waypoints', waypoints.join('|'))
  return `https://www.google.com/maps/dir/?${params.toString()}`
}