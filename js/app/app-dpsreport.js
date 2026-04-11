// ─── dps.report / Elite Insights rotation importer ───────────────────────────
//
// Converts the Elite Insights JSON (fetched via the dps.report API) into the
// tool's native rotation array format.
//
// Public API:
//   extractLogId(url)                             → string | null
//   fetchEIJson(logId)                            → Promise<object>
//   findElementalistPlayers(eiJson)               → player[]
//   convertEIRotation(eiJson, player, toolSkillNames) → item[]

const ELEMENTALIST_SPECS = new Set([
    'Elementalist', 'Weaver', 'Tempest', 'Catalyst', 'Evoker',
]);

// Skills whose tool name requires a current-attunement suffix.
// These skills keep the same base name in EI but need "(Fire)" / "(Air)" etc.
const ATTUNEMENT_SUFFIX_SKILLS = new Set([
    'Glyph of Elemental Power',
    'Primordial Stance',
    'Deploy Jade Sphere',
]);

// Direct EI skill name → tool skill name overrides.
// Used when EI reports a completely different name than the tool uses,
// typically because the in-game skill name changes per attunement.
const EI_NAME_MAP = {
    // Glyph of Storms — EI uses the attunement-specific cast names.
    'Firestorm':       'Glyph of Storms (Fire)',
    'Ice Storm':       'Glyph of Storms (Water)',
    'Lightning Storm': 'Glyph of Storms (Air)',
    'Sandstorm':       'Glyph of Storms (Earth)',
};

// ─── URL / ID helpers ────────────────────────────────────────────────────────

/**
 * Extract the log ID from a dps.report permalink.
 * Accepts:
 *   https://dps.report/AATE-20260118-105514_golem
 *   https://b.dps.report/AATE-20260118-105514_golem
 *   AATE-20260118-105514_golem   (bare ID)
 */
export function extractLogId(url) {
    url = url.trim();
    const m = url.match(/([A-Za-z0-9]{4}-\d{8}-\d{6}_\w+)/);
    return m ? m[1] : null;
}

// ─── Network ─────────────────────────────────────────────────────────────────

export async function fetchEIJson(logId) {
    const endpoint = `https://dps.report/getJson?permalink=https://dps.report/${logId}`;
    let res;
    try {
        res = await fetch(endpoint);
    } catch (e) {
        throw new Error(`Network error fetching dps.report: ${e.message}`);
    }
    if (!res.ok) throw new Error(`dps.report returned HTTP ${res.status}. Is the URL correct?`);
    const json = await res.json();
    if (json.error) throw new Error(`dps.report error: ${json.error}`);
    return json;
}

// ─── Player selection ────────────────────────────────────────────────────────

export function findElementalistPlayers(eiJson) {
    return (eiJson.players || []).filter(p => ELEMENTALIST_SPECS.has(p.profession));
}

// ─── Core conversion ─────────────────────────────────────────────────────────

/**
 * Convert an EI player rotation into the tool's rotation item array.
 *
 * @param {object}  eiJson            - Full Elite Insights JSON from dps.report
 * @param {object}  player            - Player entry from eiJson.players[]
 * @param {Set}     toolSkillNames    - Set of all skill names the tool knows (from CSV)
 * @param {Map}     skillAttunements  - Map of tool skill name → attunement string (from CSV)
 * @returns {Array} Rotation items — strings, { name, offset }, { name, interruptMs }, or { name: '__wait', waitMs }
 */
export function convertEIRotation(eiJson, player, toolSkillNames, skillAttunements = new Map()) {
    const skillMap = eiJson.skillMap || {};

    // 1. Flatten all casts from the per-skill-id grouping into a single list.
    const allCasts = [];
    for (const se of (player.rotation || [])) {
        const info = skillMap['s' + se.id] || {};

        // Skip procs that fire automatically — the player didn't press these.
        if (info.isTraitProc || info.isUnconditionalProc || info.isGearProc) continue;

        for (const cast of se.skills) {
            const timeGained = cast.timeGained ?? 0;
            allCasts.push({
                name:        (info.name || '').replace(/^"|"$/g, ''),
                castTime:    cast.castTime,
                duration:    cast.duration,
                isInstant:   !!(info.isInstantCast || cast.duration === 0),
                isSwap:      !!info.isSwap,
                isInterrupted: timeGained < 0,
            });
        }
    }
    allCasts.sort((a, b) => a.castTime - b.castTime);

    // Inject missing aura skill casts inferred from unattributed aura buff activations.
    injectAuraCasts(allCasts, player, toolSkillNames);

    // 2. Walk chronologically and emit rotation items.
    const items = [];
    // Infer the starting primary attunement from the first identifiable pre-swap skill.
    let currentElement = inferStartingElement(allCasts, skillAttunements);
    let anchor = null; // { castTime, endTime } of the current non-instant cast window

    for (const cast of allCasts) {
        const toolName = resolveToolName(cast, currentElement, toolSkillNames);

        // Update attunement tracking whenever we see a swap.
        if (cast.isSwap) {
            currentElement = extractElement(toolName);
        }

        const known = toolSkillNames.has(toolName);

        if (cast.isInterrupted) {
            // ── Interrupted cast ──────────────────────────────────────────────
            if (known) {
                items.push({ name: toolName, interruptMs: cast.duration });
            } else if (cast.duration > 0) {
                items.push({ name: '__wait', waitMs: cast.duration });
            }
            // Interrupted casts don't define a valid concurrent window.
            anchor = null;

        } else if (cast.isInstant) {
            // ── Instant-cast skill ────────────────────────────────────────────
            const inWindow = anchor
                && cast.castTime >= anchor.castTime
                && cast.castTime < anchor.endTime;

            if (inWindow) {
                // Fires during the previous non-instant's animation → concurrent.
                if (known) {
                    items.push({ name: toolName, offset: Math.max(1, cast.castTime - anchor.castTime) });
                }
                // Unknown instants inside the window are silently skipped
                // (they're likely minor procs that slipped through the filter).
            } else {
                // Fires between casts → standalone instant.
                if (known) items.push(toolName);
                anchor = null;
            }

        } else {
            // ── Normal (non-instant) cast ─────────────────────────────────────
            if (known) {
                items.push(toolName);
            } else if (cast.duration > 0) {
                items.push({ name: '__wait', waitMs: cast.duration });
            }
            anchor = { castTime: cast.castTime, endTime: cast.castTime + cast.duration };
        }
    }

    return items;
}

// ─── Aura injection ───────────────────────────────────────────────────────────

const AURA_WINDOW_MS = 2000;

// Configuration for each elemental aura skill that arcdps does not log.
//
//   buffId        — EI buff ID for the aura effect
//   skillName     — tool skill name to inject when the aura is unattributed
//   transmuteName — precondition: this Transmute skill must be in the rotation
//                   (confirms the build uses the Aura → Transmute combo)
//   attunement    — swapping TO this attunement counts as a known aura source
//   sources       — other EI skill names (post-quote-strip) that also grant
//                   this aura; any cast within ±AURA_WINDOW_MS means the
//                   activation came from that skill, not the missing aura skill
const AURA_CONFIG = [
    {
        buffId:        5677,
        skillName:     'Fire Shield',
        transmuteName: 'Transmute Fire',
        attunement:    'Fire',
        sources: new Set([
            'Elemental Explosion', 'Searing Salvo', 'Frostfire Flurry',
            'Frostfire Ward', 'Immutable Stone', 'Feel the Burn!',
            'Signet of Fire', 'Signet of Earth', 'Overload Fire',
            'Transmute Fire',
        ]),
    },
    {
        buffId:        5579,
        skillName:     'Frost Aura',
        transmuteName: 'Transmute Frost',
        attunement:    'Water',
        sources: new Set([
            'Elemental Explosion', 'Frozen Ground', 'Flowing Finesse',
            'Frostfire Ward', 'Immutable Stone',
            'Signet of Fire', 'Signet of Earth', 'Overload Water',
            'Transmute Frost',
        ]),
    },
    {
        buffId:        5684,
        skillName:     'Magnetic Aura',
        transmuteName: 'Transmute Earth',
        attunement:    'Earth',
        sources: new Set([
            'Elemental Explosion', 'Sand Squall', 'Immutable Stone',
            'Aftershock!',
            'Signet of Fire', 'Signet of Earth', 'Overload Earth',
            'Transmute Earth',
        ]),
    },
    {
        buffId:        5577,
        skillName:     'Shocking Aura',
        transmuteName: 'Transmute Lightning',
        attunement:    'Air',
        sources: new Set([
            'Elemental Explosion', 'Immutable Stone',
            'Signet of Fire', 'Signet of Earth', 'Overload Air',
            'Transmute Lightning',
        ]),
    },
];

/**
 * Splice missing aura skill casts (Fire Shield, Frost Aura, Magnetic Aura,
 * Shocking Aura) into allCasts by detecting buff activations that have no
 * other known aura-granting skill nearby.
 *
 * arcdps does not emit cast events for these instant aura skills, so they
 * never appear in the EI rotation.  We detect them from the corresponding
 * aura buff (buffUptimes.states): any 0→1 transition at t ≥ 0 that has no
 * known source within ±AURA_WINDOW_MS is attributed to the missing skill.
 *
 * Precondition per aura: the matching Transmute skill must appear in allCasts,
 * signalling the build intentionally uses the Aura → Transmute combo.
 *
 * Mutates allCasts in place; re-sorts only when at least one cast is injected.
 */
function injectAuraCasts(allCasts, player, toolSkillNames) {
    const buffUptimes = player.buffUptimes || [];
    let anyInjected = false;

    for (const cfg of AURA_CONFIG) {
        if (!toolSkillNames.has(cfg.skillName)) continue;
        if (!allCasts.some(c => c.name === cfg.transmuteName)) continue;

        const auraBuff = buffUptimes.find(b => b.id === cfg.buffId);
        if (!auraBuff?.states) continue;

        // Collect 0→1 transitions; skip t < 0 (pre-fight pre-casts).
        const activations = [];
        let prev = 0;
        for (const [t, state] of auraBuff.states) {
            if (prev === 0 && state === 1 && t >= 0) activations.push(t);
            prev = state;
        }

        for (const t of activations) {
            const winStart = t - AURA_WINDOW_MS;
            const winEnd   = t + AURA_WINDOW_MS;

            const hasKnownSource = allCasts.some(c => {
                if (c.castTime < winStart || c.castTime > winEnd) return false;
                if (c.isSwap && resolveAttunementSwap(c.name) === `${cfg.attunement} Attunement`) return true;
                return cfg.sources.has(c.name);
            });

            if (!hasKnownSource) {
                allCasts.push({
                    name:          cfg.skillName,
                    castTime:      t,
                    duration:      0,
                    isInstant:     true,
                    isSwap:        false,
                    isInterrupted: false,
                });
                anyInjected = true;
            }
        }
    }

    if (anyInjected) allCasts.sort((a, b) => a.castTime - b.castTime);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Infer the starting primary attunement by scanning the first skills used
 * before the first attunement swap.
 *
 * Priority order per cast:
 *   1. EI_NAME_MAP hit whose resolved name ends in "(Element)" — e.g.
 *      "Lightning Storm" → "Glyph of Storms (Air)" → element = "Air"
 *   2. CSV attunement for the raw EI name, if it is a single element (no "+")
 *
 * Falls back to "Fire" if no clear signal is found.
 */
function inferStartingElement(allCasts, skillAttunements) {
    for (const cast of allCasts) {
        if (cast.isSwap) break; // stop looking once the first swap occurs

        // 1. EI_NAME_MAP: resolved name may embed the attunement as a suffix.
        const mapped = EI_NAME_MAP[cast.name];
        if (mapped) {
            const m = mapped.match(/\((\w+)\)$/);
            if (m) return m[1];
        }

        // 2. CSV attunement for the raw EI name (covers skills whose name
        //    matches between EI and the tool, e.g. "Derecho" → "Air").
        const att = skillAttunements.get(cast.name);
        if (att && !att.includes('+')) return att;
    }
    return 'Fire';
}

/**
 * Map an EI cast's name to the tool's skill name.
 *
 * Priority order:
 *   1. Direct EI_NAME_MAP override (e.g. "Lightning Storm" → "Glyph of Storms (Air)")
 *   2. Attunement swap resolution ("Earth Fire Attunement" → "Earth Attunement")
 *   3. Attunement-suffix appending ("Primordial Stance" → "Primordial Stance (Air)")
 *   4. Identity (name used as-is)
 */
function resolveToolName(cast, currentElement, toolSkillNames) {
    if (EI_NAME_MAP[cast.name]) return EI_NAME_MAP[cast.name];
    if (cast.isSwap) return resolveAttunementSwap(cast.name);
    if (ATTUNEMENT_SUFFIX_SKILLS.has(cast.name)) {
        const candidate = `${cast.name} (${currentElement})`;
        return toolSkillNames.has(candidate) ? candidate : cast.name;
    }
    return cast.name;
}

/**
 * Convert an EI attunement swap name to the tool's simple "X Attunement".
 *
 * EI formats:
 *   "Dual Fire Attunement"   → new primary = Fire
 *   "Earth Fire Attunement"  → new primary = Earth  (first word)
 */
function resolveAttunementSwap(eiName) {
    // "Dual X Attunement" → "X Attunement"
    let m = eiName.match(/^Dual (\w+) Attunement$/);
    if (m) return `${m[1]} Attunement`;

    // "X Y Attunement" → "X Attunement"  (X = new primary)
    m = eiName.match(/^(\w+) \w+ Attunement$/);
    if (m) return `${m[1]} Attunement`;

    return eiName;
}

/** "Fire Attunement" → "Fire" */
function extractElement(attunementToolName) {
    return attunementToolName.replace(' Attunement', '');
}
