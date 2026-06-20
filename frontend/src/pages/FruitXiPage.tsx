import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import PitchBuilder, { type Slot } from '../components/FruitXi/PitchBuilder';
import FruitTray from '../components/FruitXi/FruitTray';
import XiShareCard from '../components/FruitXi/XiShareCard';
import NotifyForm from '../components/NotifyForm';
import {
  addToCart,
  autofillXi,
  composeFanBox,
  formatPrice,
  getFruitXiTeams,
  notify,
} from '../api';
import { saveNotify } from '../lib/comingSoon';
import type { FruitXiBox, Product, WorldCupTeam } from '../types';

const SLOT_COUNT = 11; // 1 GK + 4-3-3

// The Fruit XI fan-box page (CLAUDE.md §10 path-based route /fruit-xi). PRESENTATION ONLY (§9): it
// fetches the curated teams, holds pure UI placement state, and calls the backend to compose the box
// (dedupe / honey-exclusion / total are ALL server-side), to autofill a colour-matched XI, and the
// existing add-to-cart loop to drop the box in the cart. No team data, colour mapping, dedupe,
// honey-filter, or totals math lives in this file.
export default function FruitXiPage() {
  const reduce = useReducedMotion();

  const [teams, setTeams] = useState<WorldCupTeam[]>([]);
  const [team, setTeam] = useState<WorldCupTeam | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  // The 11 pitch slots (pure UI state) + the slot the next tray pick lands in.
  const [slots, setSlots] = useState<Slot[]>(() => Array<Slot>(SLOT_COUNT).fill(null));
  const [activeSlot, setActiveSlot] = useState<number>(0);

  // The server-composed box (items/excluded/total) — only ever set from the /box or /autofill response.
  const [box, setBox] = useState<FruitXiBox | null>(null);
  const [composing, setComposing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Demand-signal capture (the share/notify step). Shown after a box is composed; reuses the shared
  // NotifyForm so the POST is a complete, valid /api/catalog/notify (phone + pincode/city/state).
  const [signalDone, setSignalDone] = useState(false);

  useEffect(() => {
    let active = true;
    getFruitXiTeams()
      .then((list) => {
        if (active) setTeams(list);
      })
      .catch(() => {
        if (active) setTeamsError('Could not load teams right now. Please try again in a moment.');
      });
    return () => {
      active = false;
    };
  }, []);

  // The product ids currently on the pitch (for the tray's "on the pitch" check + the /box lineup).
  const placedIds = useMemo(() => {
    const set = new Set<number>();
    for (const s of slots) if (s) set.add(s.id);
    return set;
  }, [slots]);

  const lineup = useMemo(
    () => slots.filter((s): s is Product => s != null).map((p) => p.id),
    [slots],
  );
  const filledCount = lineup.length;

  // Picking a team resets the build (a fresh canvas in the new kit colours).
  const handlePickTeam = useCallback((t: WorldCupTeam) => {
    setTeam(t);
    setSlots(Array<Slot>(SLOT_COUNT).fill(null));
    setActiveSlot(0);
    setBox(null);
    setAddedCount(null);
    setSignalDone(false);
    setError(null);
  }, []);

  // Drop a tray fruit into the active slot, then advance the active pointer to the next empty slot so
  // tapping fruits fills the XI left-to-right without re-selecting each slot. Pure UI placement.
  const handlePick = useCallback(
    (product: Product) => {
      setSlots((prev) => {
        const next = [...prev];
        next[activeSlot] = product;
        return next;
      });
      setBox(null); // the composed box is stale once the lineup changes
      setActiveSlot((cur) => {
        // find the next empty slot after the current one (wrap once), else stay put
        for (let i = 1; i <= SLOT_COUNT; i++) {
          const idx = (cur + i) % SLOT_COUNT;
          if (!slots[idx] && idx !== cur) return idx;
        }
        return cur;
      });
    },
    [activeSlot, slots],
  );

  // Tap a slot: if filled, clear it; if empty, target it for the next pick.
  const handleSelectSlot = useCallback((index: number) => {
    setSlots((prev) => {
      if (!prev[index]) return prev;
      const next = [...prev];
      next[index] = null;
      return next;
    });
    setActiveSlot(index);
    setBox(null);
  }, []);

  const handleClear = useCallback(() => {
    setSlots(Array<Slot>(SLOT_COUNT).fill(null));
    setActiveSlot(0);
    setBox(null);
    setAddedCount(null);
    setSignalDone(false);
  }, []);

  // Compose the box server-side: the backend dedupes, drops honey + missing/inactive, and sums the
  // total. We just render its response. EMPTY_LINEUP / UNKNOWN_TEAM surface the server's message.
  const handleCompose = useCallback(async () => {
    if (!team || lineup.length === 0) return;
    setComposing(true);
    setError(null);
    try {
      setBox(await composeFanBox(team.code, lineup));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not compose your fan box.');
    } finally {
      setComposing(false);
    }
  }, [team, lineup]);

  // Ask the backend for its deterministic, kit-colour-matched XI, then PLACE the returned items on the
  // pitch (in order) so the fan sees a ready lineup they can tweak. filled may be < 11 — we render
  // exactly what's returned (no padding). The returned items also become the composed box for cart/share.
  const handleAutofill = useCallback(async () => {
    if (!team) return;
    setComposing(true);
    setError(null);
    try {
      const result = await autofillXi(team.code);
      // Map autofill items → minimal Product shells for the pitch slots (presentation only; the cart/box
      // calls use productId, not these shells). currency/basePrice come straight from the server item.
      const placed: Slot[] = Array<Slot>(SLOT_COUNT).fill(null);
      result.items.slice(0, SLOT_COUNT).forEach((it, i) => {
        placed[i] = {
          id: it.productId,
          name: it.name,
          description: '',
          price: it.basePrice,
          imageUrl: it.imageUrl ?? '',
          category: '',
          sku: it.sku,
        };
      });
      setSlots(placed);
      setActiveSlot(Math.min(result.filled, SLOT_COUNT - 1));
      // Compose the box from the same lineup so cart/share have the authoritative server total.
      const ids = result.items.map((it) => it.productId);
      setBox(await composeFanBox(team.code, ids));
      setSignalDone(false);
      setAddedCount(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not auto-fill your XI.');
    } finally {
      setComposing(false);
    }
  }, [team]);

  // Add the composed box to the cart via the EXISTING add-to-cart loop (App.handleAuthed pattern):
  // one addToCart per item. Guests can build a cart freely — the checkout gate (non-guest account) is
  // unchanged and lives at order placement, not here. Honey can't be in `box.items` (server-excluded),
  // so this never re-introduces a non-buyable line.
  const handleAddToCart = useCallback(async () => {
    if (!box || box.items.length === 0) return;
    setAdding(true);
    setError(null);
    let added = 0;
    for (const item of box.items) {
      try {
        await addToCart(item.productId, item.quantity);
        added += 1;
      } catch {
        /* a line that fails to add is just skipped — never block the rest of the box */
      }
    }
    setAddedCount(added);
    setAdding(false);
  }, [box]);

  const intro = reduce
    ? {}
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { type: 'spring' as const, stiffness: 260, damping: 26 } };

  return (
    <div className="app fruit-xi-page">
      {/* Minimal page chrome — a back link home + the brand, no full storefront header (this is a
          focused builder surface). */}
      <header className="fruit-xi-topbar">
        {/* a11y: aria-label matches the visible text ("Back to shop") so screen-reader and sighted users
            hear/read the same name (no label-content-name-mismatch). */}
        <Link to="/" className="fruit-xi-back" aria-label="Back to shop">
          ‹ Back to shop
        </Link>
        <span className="fruit-xi-brand">MaLLADE</span>
      </header>

      {/* a11y: a single <main> landmark so screen readers can jump straight to the page content
          (the storefront's <main> lives on the / route only; this page needs its own). */}
      <main className="fruit-xi-main">
      <motion.section className="fruit-xi-hero" {...intro}>
        <p className="fruit-xi-eyebrow">⚽ World Cup 2026</p>
        <h1 className="display-2">Build your Fruit XI</h1>
        <p className="fruit-xi-lede">
          Pick your team, line up your favourite MaLLADE fruits in a 4-3-3, then send the whole fan-box
          to your cart. Tap a slot, tap a fruit — or let us auto-pick a kit-matched XI.
        </p>
      </motion.section>

      {/* Team picker — the flags/colours come from the API. */}
      <section className="fruit-xi-teams" aria-label="Pick your team">
        {teamsError ? (
          <p className="fruit-xi-teams-error">{teamsError}</p>
        ) : teams.length === 0 ? (
          <div className="fruit-xi-tray-state">
            <div className="spinner" />
            <p>Loading teams…</p>
          </div>
        ) : (
          <div className="team-pills" role="listbox" aria-label="World Cup 2026 teams">
            {teams.map((t) => (
              <button
                key={t.code}
                type="button"
                role="option"
                aria-selected={team?.code === t.code}
                className={`team-pill${team?.code === t.code ? ' is-selected' : ''}`}
                style={
                  {
                    '--kit-primary': t.colorPrimary,
                    '--kit-secondary': t.colorSecondary,
                  } as React.CSSProperties
                }
                onClick={() => handlePickTeam(t)}
              >
                <span className="team-flag" aria-hidden="true">
                  {t.flag}
                </span>
                <span className="team-name">{t.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {team && (
        <div className="fruit-xi-builder">
          {/* The pitch (left/top) + the fruit tray (right/bottom). */}
          <div className="fruit-xi-stage">
            <PitchBuilder
              team={team}
              slots={slots}
              activeSlot={activeSlot}
              onSelectSlot={handleSelectSlot}
            />

            <div className="fruit-xi-tray-panel">
              <div className="fruit-xi-tray-head">
                <h2 className="fruit-xi-tray-title">Your fruit tray</h2>
                <span className="fruit-xi-tray-count">
                  {filledCount}/{SLOT_COUNT} placed
                </span>
              </div>
              <FruitTray placedIds={placedIds} onPick={handlePick} />
            </div>
          </div>

          {/* Actions */}
          <div className="fruit-xi-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleAutofill}
              disabled={composing}
            >
              {composing ? 'Working…' : '✨ Auto-fill XI'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCompose}
              disabled={composing || filledCount === 0}
            >
              {composing ? 'Composing…' : 'Compose fan-box'}
            </button>
            {filledCount > 0 && (
              <button type="button" className="btn-ghost-link" onClick={handleClear}>
                Clear pitch
              </button>
            )}
          </div>

          {error && (
            <div className="banner banner-error fruit-xi-banner">
              <span>{error}</span>
              <button className="icon-button" onClick={() => setError(null)}>
                ✕
              </button>
            </div>
          )}

          {/* The server-composed box summary — items, server-noted exclusions, server-summed total. */}
          {box && (
            <section className="fruit-xi-box" aria-label="Your fan-box">
              <h2 className="fruit-xi-box-title">Your fan-box</h2>
              {box.items.length === 0 ? (
                <p className="fruit-xi-box-empty">
                  No buyable fruits in this lineup yet — add some fruit from the tray.
                </p>
              ) : (
                <ul className="fruit-xi-box-list">
                  {box.items.map((it) => (
                    <li key={it.productId} className="fruit-xi-box-item">
                      <img src={it.imageUrl ?? ''} alt="" loading="lazy" />
                      <span className="box-item-name">{it.name}</span>
                      <span className="box-item-price">{formatPrice(it.basePrice)}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Server-side exclusions, rendered honestly (we never re-derive the reason). */}
              {box.excluded.length > 0 && (
                <p className="fruit-xi-box-excluded">
                  {box.excluded.some((e) => e.reason === 'HONEY_NOT_BUYABLE') && (
                    <span>Honey is coming soon — it can't be added to a box yet. </span>
                  )}
                  {box.excluded.some((e) => e.reason === 'DUPLICATE') && (
                    <span>Duplicate picks were merged. </span>
                  )}
                  {box.excluded.some((e) => e.reason === 'NOT_FOUND_OR_INACTIVE') && (
                    <span>Some picks aren't available right now. </span>
                  )}
                </p>
              )}

              {box.items.length > 0 && (
                <div className="fruit-xi-box-foot">
                  <span className="fruit-xi-total">
                    Total <strong>{formatPrice(box.total)}</strong>
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleAddToCart}
                    disabled={adding}
                  >
                    {adding ? 'Adding…' : '🛒 Add fan-box to cart'}
                  </button>
                </div>
              )}

              {addedCount != null && (
                <p className="fruit-xi-added" role="status">
                  ✓ Added {addedCount} {addedCount === 1 ? 'fruit' : 'fruits'} to your cart. Open the
                  shop to check out.
                </p>
              )}
            </section>
          )}

          {/* Demand signal + share. Shown once a box exists. The notify POST is a COMPLETE, valid
              /api/catalog/notify (phone + pincode/city/state via the shared NotifyForm) tagged
              source:'fruit-xi' with the picked fruit slugs — the existing server-side fan-out. */}
          {box && box.items.length > 0 && (
            <section className="fruit-xi-signal" aria-label="Save your XI and get launch updates">
              <div className="fruit-xi-share-wrap">
                <XiShareCard
                  team={team}
                  fruitNames={box.items.map((i) => i.name)}
                  onShared={() => {
                    /* share is its own action; the notify form below is the demand capture */
                  }}
                />
              </div>

              {signalDone ? (
                <p className="fruit-xi-signal-done" role="status">
                  ✓ You're on the list — we'll tell you when your fruits drop.
                </p>
              ) : (
                <div className="fruit-xi-notify">
                  <p className="fruit-xi-notify-lede">
                    Want first dibs when these fruits drop in your area? Drop your details:
                  </p>
                  <NotifyForm
                    collectName
                    stateFirst
                    onNotifyWithName={(name, phone, email, pincode, city, state) => {
                      // Fruit slugs from the composed box (lowercase, slug charset) — the demand signal.
                      const fruits = box.items
                        .map((i) => i.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
                        .filter((s) => s.length > 0);
                      // Offline-fallback mirror (same as honey/quiz), then the best-effort server POST.
                      // The team code rides in `source` (the contract has no separate team field) so the
                      // demand-by-team signal is still captured: e.g. source='fruit-xi:BRA'.
                      saveNotify('fruit-xi', phone, email, pincode, city, state);
                      void notify('fruit-xi', phone, email || undefined, pincode, city, state, {
                        name,
                        source: `fruit-xi:${team.code}`,
                        fruits,
                      }).catch(() => {});
                      setSignalDone(true);
                    }}
                    // collectName routes through onNotifyWithName; onNotify is required by the type but unused here.
                    onNotify={() => {}}
                  />
                </div>
              )}
            </section>
          )}
        </div>
      )}
      </main>
    </div>
  );
}
