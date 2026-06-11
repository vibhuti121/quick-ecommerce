// Live weather → rain effect (Iteration 11). Real forecast via Open-Meteo — free, no API key,
// no secret, CORS-enabled — keyed to the browser's geolocation. Client-only: this never goes
// through the commerce gateway (src/api.ts), and coordinates are used ONLY for this fetch.

export interface Coords {
  lat: number;
  lon: number;
}

export interface WeatherNow {
  raining: boolean;
  precipitation: number; // mm (current)
  code: number; // WMO weather code
  isThunder: boolean;
  temperatureC?: number;
  description: string;
}

// WMO codes that mean some form of rain/drizzle/showers/thunderstorm.
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const THUNDER_CODES = new Set([95, 96, 99]);

function describe(code: number): string {
  if (THUNDER_CODES.has(code)) return 'Thunderstorm';
  if ([80, 81, 82].includes(code)) return 'Rain showers';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  return 'Rain';
}

// Resolve the device location. Rejects on denial / unsupported / timeout — callers treat any
// rejection as simply "no rain" (the effect stays off, no error surfaced to the user).
export function getPosition(timeoutMs = 8000): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('geolocation-unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 10 * 60 * 1000 },
    );
  });
}

export async function fetchWeather({ lat, lon }: Coords): Promise<WeatherNow> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}` +
    `&longitude=${lon.toFixed(3)}&current=precipitation,weather_code,temperature_2m`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather-${res.status}`);
  const data = (await res.json()) as {
    current?: { precipitation?: number; weather_code?: number; temperature_2m?: number };
  };
  const cur = data.current ?? {};
  const code = Number(cur.weather_code ?? 0);
  const precipitation = Number(cur.precipitation ?? 0);
  return {
    raining: precipitation > 0 || RAIN_CODES.has(code),
    precipitation,
    code,
    isThunder: THUNDER_CODES.has(code),
    temperatureC: typeof cur.temperature_2m === 'number' ? cur.temperature_2m : undefined,
    description: describe(code),
  };
}
