// Pincode → city/state resolver for the launch-list + checkout delivery forms.
//
// Strategy (no multi-MB dataset bundled): try a free, CORS-friendly public API first for a precise
// district(city)+state, and fall back to a small bundled offline table when the API is slow/down/
// offline. The offline fallback maps the India PIN's first-two-digit POSTAL CIRCLE prefix → state,
// then uses that state's capital city (the founder's explicit "state known → use the state capital
// as city" rule). The form keeps city/state editable, so a coarse offline guess is always correctable.
//
// Dependency-free, strict-typed, and DEFENSIVE: every path returns a plain object (or null on a
// malformed pin) — it NEVER throws into the form, and a slow/offline API never hangs it (AbortController).

// ---- offline table 1: first-two-digit postal-circle prefix → state ---------------------------
// India PINs encode a postal region in the first digit and a circle (sub-region) in the first two.
// First digit 1=North, 2=North, 3=West, 4=West, 5=South, 6=South, 7=East, 8=East; 0 and 9 are not
// valid leading digits for a delivery PIN. This is the offline fallback — reasonably accurate at the
// state level (a few two-digit circles straddle a border; the editable field absorbs that).
const PINCODE_PREFIX_TO_STATE: Record<string, string> = {
  // 11 — Delhi
  '11': 'Delhi',
  // 12–13 — Haryana
  '12': 'Haryana',
  '13': 'Haryana',
  // 14–16 — Punjab
  '14': 'Punjab',
  '15': 'Punjab',
  '16': 'Punjab',
  // 17 — Himachal Pradesh
  '17': 'Himachal Pradesh',
  // 18–19 — Jammu & Kashmir / Ladakh
  '18': 'Jammu and Kashmir',
  '19': 'Jammu and Kashmir',
  // 20–28 — Uttar Pradesh (24–28 core UP; 20–23 western UP)
  '20': 'Uttar Pradesh',
  '21': 'Uttar Pradesh',
  '22': 'Uttar Pradesh',
  '23': 'Uttar Pradesh',
  '24': 'Uttar Pradesh',
  '25': 'Uttar Pradesh',
  '26': 'Uttar Pradesh',
  '27': 'Uttar Pradesh',
  '28': 'Uttar Pradesh',
  // 30–34 — Rajasthan
  '30': 'Rajasthan',
  '31': 'Rajasthan',
  '32': 'Rajasthan',
  '33': 'Rajasthan',
  '34': 'Rajasthan',
  // 36–39 — Gujarat
  '36': 'Gujarat',
  '37': 'Gujarat',
  '38': 'Gujarat',
  '39': 'Gujarat',
  // 40–44 — Maharashtra
  '40': 'Maharashtra',
  '41': 'Maharashtra',
  '42': 'Maharashtra',
  '43': 'Maharashtra',
  '44': 'Maharashtra',
  // 45–48 — Madhya Pradesh
  '45': 'Madhya Pradesh',
  '46': 'Madhya Pradesh',
  '47': 'Madhya Pradesh',
  '48': 'Madhya Pradesh',
  // 49 — Chhattisgarh
  '49': 'Chhattisgarh',
  // 50 — Telangana (Hyderabad circle)
  '50': 'Telangana',
  // 51–53 — Andhra Pradesh
  '51': 'Andhra Pradesh',
  '52': 'Andhra Pradesh',
  '53': 'Andhra Pradesh',
  // 56–59 — Karnataka
  '56': 'Karnataka',
  '57': 'Karnataka',
  '58': 'Karnataka',
  '59': 'Karnataka',
  // 60–66 — Tamil Nadu
  '60': 'Tamil Nadu',
  '61': 'Tamil Nadu',
  '62': 'Tamil Nadu',
  '63': 'Tamil Nadu',
  '64': 'Tamil Nadu',
  '65': 'Tamil Nadu',
  '66': 'Tamil Nadu',
  // 67–69 — Kerala
  '67': 'Kerala',
  '68': 'Kerala',
  '69': 'Kerala',
  // 70–74 — West Bengal
  '70': 'West Bengal',
  '71': 'West Bengal',
  '72': 'West Bengal',
  '73': 'West Bengal',
  '74': 'West Bengal',
  // 75–77 — Odisha
  '75': 'Odisha',
  '76': 'Odisha',
  '77': 'Odisha',
  // 78 — Assam
  '78': 'Assam',
  // 79 — North-Eastern circle (Arunachal/Nagaland/Manipur/Mizoram/Tripura/Meghalaya) — coarse
  '79': 'Meghalaya',
  // 80–85 — Bihar (80–81) & Jharkhand (82–83) & Bihar (84–85)
  '80': 'Bihar',
  '81': 'Bihar',
  '82': 'Jharkhand',
  '83': 'Jharkhand',
  '84': 'Bihar',
  '85': 'Bihar',
};

// ---- offline table 2: state/UT → capital city -------------------------------------------------
// "state known → use the state capital as city" (founder rule). Covers the 28 states + 8 UTs.
const STATE_TO_CAPITAL: Record<string, string> = {
  'Andhra Pradesh': 'Amaravati',
  'Arunachal Pradesh': 'Itanagar',
  Assam: 'Dispur',
  Bihar: 'Patna',
  Chhattisgarh: 'Raipur',
  Goa: 'Panaji',
  Gujarat: 'Gandhinagar',
  Haryana: 'Chandigarh',
  'Himachal Pradesh': 'Shimla',
  Jharkhand: 'Ranchi',
  Karnataka: 'Bengaluru',
  Kerala: 'Thiruvananthapuram',
  'Madhya Pradesh': 'Bhopal',
  Maharashtra: 'Mumbai',
  Manipur: 'Imphal',
  Meghalaya: 'Shillong',
  Mizoram: 'Aizawl',
  Nagaland: 'Kohima',
  Odisha: 'Bhubaneswar',
  Punjab: 'Chandigarh',
  Rajasthan: 'Jaipur',
  Sikkim: 'Gangtok',
  'Tamil Nadu': 'Chennai',
  Telangana: 'Hyderabad',
  Tripura: 'Agartala',
  'Uttar Pradesh': 'Lucknow',
  Uttarakhand: 'Dehradun',
  'West Bengal': 'Kolkata',
  // Union Territories
  'Andaman and Nicobar Islands': 'Port Blair',
  Chandigarh: 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu': 'Daman',
  Delhi: 'New Delhi',
  'Jammu and Kashmir': 'Srinagar',
  Ladakh: 'Leh',
  Lakshadweep: 'Kavaratti',
  Puducherry: 'Puducherry',
};

const PIN_RE = /^\d{6}$/;
const API_TIMEOUT_MS = 4000;

// One PostOffice entry from api.postalpincode.in (only the fields we read).
interface PostOffice {
  District?: string;
  State?: string;
}
interface PincodeApiEntry {
  Status?: string;
  PostOffice?: PostOffice[] | null;
}

// Offline-only resolution: prefix → state → capital. Returns blank strings (NOT null) when the state
// is unknown, so the caller renders empty editable fields for the user to type manually.
function resolveOffline(pin: string): { city: string; state: string } {
  const state = PINCODE_PREFIX_TO_STATE[pin.slice(0, 2)];
  if (!state) return { city: '', state: '' };
  const city = STATE_TO_CAPITAL[state] ?? '';
  return { city, state };
}

/**
 * Resolve a 6-digit India pincode to a { city, state }.
 *  - Invalid (non-6-digit) pin → null (caller keeps fields blank, shows no auto-fill).
 *  - Tries api.postalpincode.in first (precise district + state), with a ~4s abort timeout.
 *  - On any API failure/offline/non-Success → offline prefix→state→capital fallback.
 *  - State still unknown → { city:'', state:'' } so the user types it manually. NEVER throws.
 */
export async function resolvePincode(
  pin: string,
): Promise<{ city: string; state: string } | null> {
  if (!PIN_RE.test(pin)) return null;

  // 1) Precise lookup via the free public API, guarded by a short abort timeout so a slow/offline
  //    network never hangs the form. Any throw (network/abort/parse) drops to the offline fallback.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const body = (await res.json()) as PincodeApiEntry[] | unknown;
        const entry = Array.isArray(body) ? (body[0] as PincodeApiEntry | undefined) : undefined;
        if (entry?.Status === 'Success' && entry.PostOffice && entry.PostOffice.length > 0) {
          const po = entry.PostOffice[0];
          const city = (po.District ?? '').trim();
          const state = (po.State ?? '').trim();
          if (city || state) return { city, state };
        }
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {
    /* network error / abort / bad JSON — fall through to the offline table */
  }

  // 2) Offline fallback: prefix → state → capital (or blank for the user to type).
  return resolveOffline(pin);
}
