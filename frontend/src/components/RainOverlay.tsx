import { useEffect, useRef, useState } from 'react';
import type { WeatherNow } from '../lib/weather';
import { fetchWeather, getPosition } from '../lib/weather';
import { RAIN_EVENT } from './RainToggle';

// Realistic canvas rain. For NOW it's driven by the manual header <RainToggle/> (no geolocation
// prompt). The live-weather path is kept but DORMANT behind AUTO_WEATHER.
//
// HAND-OFF (when geolocation is ready): set AUTO_WEATHER = true, remove <RainToggle/> from the
// Header, and clear localStorage['mallade-rain'] → rain becomes auto-by-location.
const AUTO_WEATHER = false;
const STORAGE_KEY = 'mallade-rain';
const REFRESH_MS = 10 * 60 * 1000;

// Dev/test override: ?rain=light|medium|heavy forces rain; ?rain=off forces clear.
function readOverride(): WeatherNow | 'off' | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('rain');
  if (!v) return null;
  if (v === 'off') return 'off';
  const precipitation = v === 'heavy' ? 9 : v === 'medium' ? 3 : 1;
  return { raining: true, precipitation, code: 63, isThunder: false, description: 'Rain' };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function RainOverlay() {
  const [override] = useState<WeatherNow | 'off' | null>(readOverride);
  const [manualOn, setManualOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      return false;
    }
  });
  const [weather, setWeather] = useState<WeatherNow | null>(
    override && override !== 'off' ? override : null,
  );
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Live updates from the header RainToggle (same-tab CustomEvent).
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ on: boolean }>).detail;
      setManualOn(Boolean(detail?.on));
    };
    window.addEventListener(RAIN_EVENT, onChange);
    return () => window.removeEventListener(RAIN_EVENT, onChange);
  }, []);

  // Live-weather path — dormant until AUTO_WEATHER is enabled (no geolocation prompt now).
  useEffect(() => {
    if (!AUTO_WEATHER || override) return;
    let active = true;
    const load = async () => {
      try {
        const pos = await getPosition();
        const w = await fetchWeather(pos);
        if (active) setWeather(w);
      } catch {
        if (active) setWeather(null); // denied / sunny / failed → no rain, silently
      }
    };
    void load();
    const id = window.setInterval(load, REFRESH_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      active = false;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [override]);

  const reduced = prefersReducedMotion();
  const autoRaining = AUTO_WEATHER && Boolean(weather?.raining);
  const raining =
    override === 'off' ? false : override ? true : manualOn || autoRaining;

  // Intensity: override precip → forecast precip → a sensible manual default.
  const precip =
    override && override !== 'off' ? override.precipitation : weather?.precipitation ?? 3;

  // Canvas particle rain. Density/speed scale with precip; pauses when the tab is hidden.
  useEffect(() => {
    if (!raining || reduced) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const narrow = w < 640;
    const base = narrow ? 60 : 120;
    const count = Math.min(
      Math.round(base + precip * (narrow ? 22 : 40)),
      narrow ? 220 : 460,
    );
    const speedScale = 1 + Math.min(precip, 10) / 10;
    const wind = 0.18; // slight slant

    interface Drop {
      x: number;
      y: number;
      len: number;
      vy: number;
      o: number;
    }
    const drops: Drop[] = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      len: 8 + Math.random() * 14 + precip,
      vy: (4 + Math.random() * 6) * speedScale,
      o: 0.12 + Math.random() * 0.28,
    }));

    let raf = 0;
    let running = true;
    const tick = () => {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = 'round';
      ctx.lineWidth = 1.1;
      for (const d of drops) {
        ctx.strokeStyle = `rgba(174, 194, 224, ${d.o})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.vy * wind, d.y + d.len);
        ctx.stroke();
        d.y += d.vy;
        d.x += d.vy * wind * 0.6;
        if (d.y > h + 20) {
          d.y = -20;
          d.x = Math.random() * w;
        }
        if (d.x > w + 20) d.x = -10;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onVis = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      ctx.clearRect(0, 0, w, h);
    };
  }, [raining, reduced, precip]);

  if (!raining) return null;

  // Weather readout chip — only on the auto path; in manual mode the header toggle is the control.
  const showChip = autoRaining;
  const temp = weather?.temperatureC;
  return (
    <>
      {!reduced && <canvas ref={canvasRef} className="rain-canvas" aria-hidden="true" />}
      {showChip && (
        <div className="rain-chip" role="status">
          <span aria-hidden="true">🌧️</span>
          <span className="rain-chip-text">
            Raining near you{typeof temp === 'number' ? ` · ${Math.round(temp)}°` : ''}
          </span>
        </div>
      )}
    </>
  );
}
