// ─── Gear Optimizer ───────────────────────────────────────────────────────────
// Exhaustive search over equivalence classes of gear slot prefixes.
//
// Slots with identical stat weights (e.g. Ring1 = Ring2) are grouped.
// For each group of N equivalent slots and K prefixes, we enumerate all
// unordered distributions — C(N+K-1, K-1) — instead of K^N ordered tuples.
// This reduces a 3-prefix / 14-slot search from 4.8M to ~525K combinations.
//
// Each non-gear combo (rune × relic × sigil pair × food × utility × infusions)
// is sent to a Web Worker for parallel exhaustive evaluation.

import { SimulationEngine } from './simulation.js?v=42';
import { calcAttributes } from './calc-attributes.js';
import { GEAR_SLOTS, GEAR_STATS, WEAPON_DATA, getActiveGearSlots } from './gear-data.js';

export class GearOptimizer {
    constructor({ skills, skillHits, weapons, sigils, relics }) {
        this.skills = skills;
        this.skillHits = skillHits;
        this.weapons = weapons;
        this.sigilsData = sigils;
        this.relicsData = relics;
        this._cancelled = false;
        this._workers = [];
    }

    cancel() {
        this._cancelled = true;
        for (const w of this._workers) w.terminate();
        this._workers = [];
    }

    async optimize(config, onProgress) {
        this._cancelled = false;
        this._workers = [];

        const { build, selectedSkills, rotation, space, constraints = {},
            slotConstraints = {},
            startAtt, startAtt2, evokerElement, permaBoons,
            targetHP = 0 } = config;

        if (!space.prefixes.length) throw new Error('Select at least one prefix.');

        const activeSlots = getActiveGearSlots(build.weapons, WEAPON_DATA);

        const nonGearCombos = this._nonGearCombos(space);

        const numCores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
        const numWorkers = Math.max(1, Math.min(numCores, nonGearCombos.length));

        const batches = Array.from({ length: numWorkers }, () => []);
        nonGearCombos.forEach((combo, i) => batches[i % numWorkers].push(combo));

        const workerPayload = {
            skills: this.skills,
            skillHits: this.skillHits,
            weapons: this.weapons,
            sigilsData: this.sigilsData,
            relicsData: this.relicsData,
            baseBuild: JSON.parse(JSON.stringify(build)),
            selectedSkills,
            rotation,
            prefixes: space.prefixes,
            constraints,
            slotConstraints,
            activeSlots,
            startAtt, startAtt2, evokerElement, permaBoons,
        };

        const top10 = [];
        const seenKeys = new Set();
        let evalsDone = 0;

        const gearComboCount = this._estimateGearCombos(activeSlots, space.prefixes, slotConstraints);
        const totalEst = Math.max(nonGearCombos.length * gearComboCount, 1);

        const workerUrl = new URL('./optimizer-worker.js', import.meta.url);

        await Promise.all(
            batches.filter(b => b.length > 0).map(batch => new Promise((resolve, reject) => {
                if (this._cancelled) { resolve(); return; }

                const worker = new Worker(workerUrl, { type: 'module' });
                this._workers.push(worker);

                worker.onmessage = ({ data }) => {
                    if (this._cancelled) { resolve(); return; }

                    if (data.error) {
                        console.error('Optimizer worker error:', data.error);
                        onProgress(evalsDone, totalEst, [...top10], `Worker error: ${data.error}`);
                    }

                    evalsDone += data.evalsDone;

                    for (const r of data.results) {
                        if (r.rawDps < 0) continue;
                        const key = this._key(r);
                        if (!seenKeys.has(key)) {
                            seenKeys.add(key);
                            top10.push(r);
                            top10.sort((a, b) => b.rawDps - a.rawDps);
                            if (top10.length > 10) top10.pop();
                        }
                    }

                    if (data.booted) {
                        onProgress(evalsDone, totalEst, [...top10],
                            `Worker started — ${data.gearComboCount} gear × ${data.nonGearCombos} non-gear combos`);
                    } else {
                        onProgress(evalsDone, totalEst, [...top10]);
                    }

                    if (data.done) {
                        worker.terminate();
                        resolve();
                    }
                };

                worker.onerror = (err) => {
                    worker.terminate();
                    console.error('Optimizer worker error:', err);
                    onProgress(evalsDone, totalEst, [...top10], `Worker crashed: ${err?.message || err}`);
                    resolve();
                };

                worker.postMessage({ ...workerPayload, combos: batch });
            }))
        );

        if (this._cancelled) return top10;

        // Re-evaluate top 10 with the actual targetHP
        const sim = this._makeSim(build, selectedSkills, rotation);
        for (const r of top10) {
            r.dps = this._evalFull(sim, build, selectedSkills, r,
                startAtt, startAtt2, evokerElement, permaBoons, targetHP);
        }
        top10.sort((a, b) => b.dps - a.dps);

        return top10;
    }

    // ── Estimate total gear combinations for progress bar ─────────────────────
    _estimateGearCombos(activeSlots, prefixes, slotConstraints) {
        const K = prefixes.length;
        const groups = this._buildEquivGroups(activeSlots, prefixes, slotConstraints);
        let total = 1;
        for (const g of groups) {
            if (g.locked) { total *= 1; continue; }
            total *= _countDistributions(g.slots.length, K);
        }
        return total;
    }

    _buildEquivGroups(activeSlots, prefixes, slotConstraints) {
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

    _evalFull(sim, baseBuild, selectedSkills, r,
        startAtt, startAtt2, evokerElement, permaBoons, targetHP) {
        const combo = {
            rune: r.rune, relic: r.relic, sigil1: r.sigil1, sigil2: r.sigil2,
            food: r.food, utility: r.utility, infusions: r.infusions
        };
        this._applyCombo(sim, baseBuild, selectedSkills, combo, r.gear);
        sim.run(startAtt, startAtt2, evokerElement, permaBoons, null, targetHP);
        return sim.results?.dps ?? 0;
    }

    _applyCombo(sim, baseBuild, selectedSkills, combo, gear) {
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
        sim.attributes = attrs;
        sim.activeTraitNames = new Set((attrs.activeTraits || []).map(t => t.name));
    }

    _makeSim(build, selectedSkills, rotation) {
        const attrs = calcAttributes(build, selectedSkills);
        const sim = new SimulationEngine({
            skills: this.skills,
            skillHits: this.skillHits,
            weapons: this.weapons,
            attributes: attrs,
            sigils: this.sigilsData,
            relics: this.relicsData,
            activeTraits: attrs.activeTraits,
        });
        sim.rotation = rotation;
        sim.fastMode = true;
        sim.activeTraitNames = new Set((attrs.activeTraits || []).map(t => t.name));
        return sim;
    }

    _nonGearCombos(space) {
        const runes = space.runes.length ? space.runes : [null];
        const relics = space.relics.length ? space.relics : [null];
        const foods = space.foods.length ? space.foods : [null];
        const utilities = space.utilities.length ? space.utilities : [null];

        const infStats = space.infusionStats || [];
        const infTotal = space.infusionTotal ?? 0;
        const infusions = infStats.length === 0 ? [null]
            : this._infusionDistributions(infStats, infTotal);

        const sigilPairs = [];
        const ss = space.sigils;
        if (ss.length < 2) {
            sigilPairs.push([null, null]);
        } else {
            for (let i = 0; i < ss.length; i++)
                for (let j = i + 1; j < ss.length; j++)
                    sigilPairs.push([ss[i], ss[j]]);
        }

        const out = [];
        for (const rune of runes)
            for (const relic of relics)
                for (const [s1, s2] of sigilPairs)
                    for (const food of foods)
                        for (const utility of utilities)
                            for (const infusion of infusions)
                                out.push({ rune, relic, sigil1: s1, sigil2: s2, food, utility, infusions: infusion });
        return out;
    }

    _infusionDistributions(stats, total) {
        if (total === 0) return [[]];
        const results = [];
        const counts = new Array(stats.length).fill(0);
        const recurse = (idx, remaining) => {
            if (idx === stats.length - 1) {
                counts[idx] = remaining;
                results.push(
                    stats.map((s, i) => ({ stat: s, count: counts[i] })).filter(x => x.count > 0)
                );
                return;
            }
            for (let i = 0; i <= remaining; i++) {
                counts[idx] = i;
                recurse(idx + 1, remaining - i);
            }
        };
        recurse(0, total);
        return results;
    }

    _key(r) {
        const g = GEAR_SLOTS.map(s => r.gear[s] || '').join(',');
        const inf = r.infusions == null ? 'keep'
            : (r.infusions.map(x => `${x.stat}×${x.count}`).join('+') || 'none');
        return `${g}|${r.rune}|${r.relic}|${r.sigil1}|${r.sigil2}|${r.food}|${r.utility}|${inf}`;
    }
}

// ── Helpers (shared) ─────────────────────────────────────────────────────────
function _slotSignature(slot, prefixes) {
    const parts = [];
    for (const pfx of prefixes) {
        const stats = GEAR_STATS[pfx]?.[slot] || {};
        const sorted = Object.entries(stats).sort((a, b) => a[0].localeCompare(b[0]));
        parts.push(sorted.map(([k, v]) => `${k}:${v}`).join(','));
    }
    return parts.join('|');
}

function _countDistributions(n, k) {
    // C(n + k - 1, k - 1)
    const top = n + k - 1;
    const bot = k - 1;
    let result = 1;
    for (let i = 0; i < bot; i++) result = result * (top - i) / (i + 1);
    return Math.round(result);
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
