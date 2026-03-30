// ─── Optimizer Web Worker ─────────────────────────────────────────────────────
// Exhaustive search over equivalence classes of gear slots.
// Slots with identical stat weights are grouped; we enumerate unique
// distributions of prefixes per group, then expand to per-slot assignments.

import { SimulationEngine } from './simulation.js?v=43';
import { calcAttributes } from './calc-attributes.js';
import { GEAR_STATS } from './gear-data.js';

self.onmessage = ({ data }) => {
    try {
        const {
            skills, skillHits, weapons, sigilsData, relicsData,
            baseBuild, selectedSkills, rotation,
            prefixes, constraints = {}, slotConstraints = {},
            startAtt, startAtt2, evokerElement, permaBoons,
            combos, activeSlots,
        } = data;

        const initAttrs = calcAttributes(baseBuild, selectedSkills);
        const sim = new SimulationEngine({
            skills, skillHits, weapons,
            attributes: initAttrs,
            sigils: sigilsData,
            relics: relicsData,
            activeTraits: initAttrs.activeTraits,
        });
        sim.rotation = rotation;
        sim.fastMode = true;
        sim.activeTraitNames = new Set((initAttrs.activeTraits || []).map(t => t.name));

        const groups = _buildEquivGroups(activeSlots, prefixes, slotConstraints);
        const gearCombos = _enumerateGearCombos(groups, prefixes);

        self.postMessage({
            results: [], evalsDone: 0, done: false,
            booted: true, gearComboCount: gearCombos.length, nonGearCombos: combos.length,
        });

        const REPORT_INTERVAL = 50;
        const TOP_N = 20;
        const localTop = [];
        let topDirty = false;

        for (const combo of combos) {
            let unreported = 0;

            for (const gearAssign of gearCombos) {
                const gear = _expandToGear(gearAssign, groups, prefixes);
                const dps = _eval(sim, baseBuild, selectedSkills, combo, gear,
                    startAtt, startAtt2, evokerElement, permaBoons, constraints);
                unreported++;

                if (dps > 0 && (localTop.length < TOP_N || dps > localTop[localTop.length - 1].rawDps)) {
                    localTop.push({
                        rawDps: dps, dps,
                        gear: { ...gear },
                        rune: combo.rune, relic: combo.relic,
                        sigil1: combo.sigil1, sigil2: combo.sigil2,
                        food: combo.food, utility: combo.utility,
                        infusions: combo.infusions,
                    });
                    localTop.sort((a, b) => b.rawDps - a.rawDps);
                    if (localTop.length > TOP_N) localTop.pop();
                    topDirty = true;
                }

                if (unreported >= REPORT_INTERVAL) {
                    self.postMessage({
                        results: topDirty ? localTop.map(r => ({ ...r })) : [],
                        evalsDone: unreported,
                        done: false,
                    });
                    unreported = 0;
                    topDirty = false;
                }
            }

            if (unreported > 0) {
                self.postMessage({
                    results: topDirty ? localTop.map(r => ({ ...r })) : [],
                    evalsDone: unreported,
                    done: false,
                });
                topDirty = false;
            }
        }

        self.postMessage({
            results: localTop.map(r => ({ ...r })),
            evalsDone: 0, done: true,
        });
    } catch (err) {
        self.postMessage({
            results: [], evalsDone: 0, done: true,
            error: String(err?.message || err),
        });
    }
};

// ── Build equivalence groups ─────────────────────────────────────────────────
function _buildEquivGroups(activeSlots, prefixes, slotConstraints) {
    const free = [];
    const locked = [];

    for (const slot of activeSlots) {
        if (slotConstraints[slot]) {
            locked.push({ slots: [slot], locked: slotConstraints[slot] });
        } else {
            free.push(slot);
        }
    }

    const sigMap = new Map();
    for (const slot of free) {
        const sig = _slotSignature(slot, prefixes);
        if (!sigMap.has(sig)) sigMap.set(sig, []);
        sigMap.get(sig).push(slot);
    }

    const groups = [];
    for (const [, slots] of sigMap) groups.push({ slots, locked: null });
    for (const g of locked) groups.push(g);
    return groups;
}

function _slotSignature(slot, prefixes) {
    const parts = [];
    for (const pfx of prefixes) {
        const stats = GEAR_STATS[pfx]?.[slot] || {};
        const sorted = Object.entries(stats).sort((a, b) => a[0].localeCompare(b[0]));
        parts.push(sorted.map(([k, v]) => `${k}:${v}`).join(','));
    }
    return parts.join('|');
}

// ── Enumerate all unique gear distributions ──────────────────────────────────
function _enumerateGearCombos(groups, prefixes) {
    const K = prefixes.length;
    const groupDistributions = groups.map(g => {
        if (g.locked !== null) {
            return [new Array(g.slots.length).fill(prefixes.indexOf(g.locked))];
        }
        return _distributions(g.slots.length, K);
    });

    let combos = [[]];
    for (const dists of groupDistributions) {
        const next = [];
        for (const prev of combos) {
            for (const dist of dists) {
                next.push([...prev, dist]);
            }
        }
        combos = next;
    }
    return combos;
}

function _distributions(n, k) {
    const results = [];
    const cur = new Array(n);
    const recurse = (pos, minIdx) => {
        if (pos === n) { results.push([...cur]); return; }
        for (let i = minIdx; i < k; i++) {
            cur[pos] = i;
            recurse(pos + 1, i);
        }
    };
    recurse(0, 0);
    return results;
}

function _expandToGear(gearAssign, groups, prefixes) {
    const gear = {};
    for (let gi = 0; gi < groups.length; gi++) {
        const g = groups[gi];
        const dist = gearAssign[gi];
        for (let si = 0; si < g.slots.length; si++) {
            const effectiveSlot = g.slots[si];
            const gearSlot = effectiveSlot === 'Weapon2H' ? 'Weapon1' : effectiveSlot;
            gear[gearSlot] = prefixes[dist[si]];
        }
    }
    return gear;
}

function _eval(sim, baseBuild, selectedSkills, combo, gear,
    startAtt, startAtt2, evokerElement, permaBoons, constraints = {}) {
    const testBuild = {
        ...baseBuild,
        gear: { ...gear },
        rune: combo.rune || baseBuild.rune,
        relic: combo.relic || baseBuild.relic,
        sigils: combo.sigil1 != null
            ? [combo.sigil1, combo.sigil2].filter(Boolean)
            : (baseBuild.sigils || []),
        food: combo.food || baseBuild.food,
        utility: combo.utility || baseBuild.utility,
        infusions: combo.infusions != null ? combo.infusions : (baseBuild.infusions || []),
    };

    const attrs = calcAttributes(testBuild, selectedSkills);
    if (!_meetsConstraints(attrs.attributes, constraints)) return -1;
    sim.attributes = attrs;
    sim.run(startAtt, startAtt2, evokerElement, permaBoons, null, 0);
    return sim.results?.dps ?? 0;
}

function _meetsConstraints(attrs, constraints) {
    if (!constraints) return true;
    if (constraints.minBoonDuration != null &&
        (attrs['Boon Duration']?.final ?? 0) < constraints.minBoonDuration) return false;
    if (constraints.minCritChance != null &&
        (attrs['Critical Chance']?.final ?? 0) < constraints.minCritChance) return false;
    if (constraints.minToughness != null &&
        (attrs['Toughness']?.final ?? 0) < constraints.minToughness) return false;
    if (constraints.minVitality != null &&
        (attrs['Vitality']?.final ?? 0) < constraints.minVitality) return false;
    return true;
}
