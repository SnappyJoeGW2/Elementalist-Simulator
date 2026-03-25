// ─── Gear Optimizer ───────────────────────────────────────────────────────────
// Parallel hill-climbing coordinate descent over gear prefixes + non-gear combos.
//
// Each non-gear combo (rune × relic × sigil pair × food × utility × infusion
// distribution) is evaluated on a Web Worker thread, running coordinate descent
// to find the best gear mix for that fixed non-gear config.
//
// Degree of parallelism = navigator.hardwareConcurrency (typically 4-16).

import { SimulationEngine } from './simulation.js';
import { calcAttributes }   from './calc-attributes.js';
import { GEAR_SLOTS }       from './gear-data.js';

export class GearOptimizer {
    constructor({ skills, skillHits, weapons, sigils, relics }) {
        this.skills     = skills;
        this.skillHits  = skillHits;
        this.weapons    = weapons;
        this.sigilsData = sigils;
        this.relicsData = relics;
        this._cancelled = false;
        this._workers   = [];
    }

    cancel() {
        this._cancelled = true;
        for (const w of this._workers) w.terminate();
        this._workers = [];
    }

    // ── Public entry point ────────────────────────────────────────────────────
    // config: { build, selectedSkills, rotation, space, startAtt, startAtt2,
    //           evokerElement, permaBoons, targetHP }
    // space:  { prefixes[], runes[], sigils[], relics[], foods[], utilities[],
    //           infusionStats[], infusionTotal }
    // onProgress(evalsDone, totalEst, currentTop10)
    async optimize(config, onProgress) {
        this._cancelled = false;
        this._workers   = [];

        const { build, selectedSkills, rotation, space,
                startAtt, startAtt2, evokerElement, permaBoons,
                targetHP = 0 } = config;

        if (!space.prefixes.length) throw new Error('Select at least one prefix.');

        const nonGearCombos = this._nonGearCombos(space);

        // Use as many workers as CPU cores, capped to the number of combos.
        const numCores   = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4;
        const numWorkers = Math.max(1, Math.min(numCores, nonGearCombos.length));

        // Split combos across workers (round-robin for even distribution).
        const batches = Array.from({ length: numWorkers }, () => []);
        nonGearCombos.forEach((combo, i) => batches[i % numWorkers].push(combo));

        // Payload sent to every worker — includes all static simulation data.
        const workerPayload = {
            skills:       this.skills,
            skillHits:    this.skillHits,
            weapons:      this.weapons,
            sigilsData:   this.sigilsData,
            relicsData:   this.relicsData,
            baseBuild:    JSON.parse(JSON.stringify(build)),
            selectedSkills,
            rotation,
            prefixes:     space.prefixes,
            startAtt, startAtt2, evokerElement, permaBoons,
        };

        const top10    = [];
        const seenKeys = new Set();
        let   evalsDone = 0;

        // Rough total for the progress bar.
        const estPerCombo = space.prefixes.length * GEAR_SLOTS.length * (space.prefixes.length - 1) * 3 + 1;
        const totalEst    = Math.max(nonGearCombos.length * estPerCombo, 1);

        // ── Launch all workers concurrently ───────────────────────────────────
        const workerUrl = new URL('./optimizer-worker.js', import.meta.url);

        await Promise.all(
            batches.filter(b => b.length > 0).map(batch => new Promise((resolve, reject) => {
                if (this._cancelled) { resolve(); return; }

                const worker = new Worker(workerUrl, { type: 'module' });
                this._workers.push(worker);

                worker.onmessage = ({ data }) => {
                    if (this._cancelled) { resolve(); return; }

                    evalsDone += data.evalsDone;

                    for (const r of data.results) {
                        const key = this._key(r);
                        if (!seenKeys.has(key)) {
                            seenKeys.add(key);
                            top10.push(r);
                            top10.sort((a, b) => b.rawDps - a.rawDps);
                            if (top10.length > 10) top10.pop();
                        }
                    }

                    onProgress(evalsDone, totalEst, [...top10]);
                    worker.terminate();
                    resolve();
                };

                worker.onerror = (err) => {
                    worker.terminate();
                    // Fall back to single-threaded for this batch if the worker fails.
                    this._runBatchSingleThread(
                        batch, build, selectedSkills, rotation, space.prefixes,
                        startAtt, startAtt2, evokerElement, permaBoons,
                        top10, seenKeys,
                    ).then(() => {
                        evalsDone += batch.length; // approximate
                        onProgress(evalsDone, totalEst, [...top10]);
                        resolve();
                    }).catch(reject);
                };

                worker.postMessage({ ...workerPayload, combos: batch });
            }))
        );

        if (this._cancelled) return top10;

        // ── Re-evaluate top 10 with the actual targetHP so displayed DPS
        //    matches what the main simulator shows after applying the build.
        const sim = this._makeSim(build, selectedSkills, rotation);
        for (const r of top10) {
            r.dps = this._evalFull(sim, build, selectedSkills, r,
                                   startAtt, startAtt2, evokerElement, permaBoons, targetHP);
        }
        top10.sort((a, b) => b.dps - a.dps);

        return top10;
    }

    // ── Single-threaded fallback for one batch (used if Worker fails) ─────────
    async _runBatchSingleThread(batch, build, selectedSkills, rotation, prefixes,
                                startAtt, startAtt2, evokerElement, permaBoons,
                                top10, seenKeys) {
        const sim = this._makeSim(build, selectedSkills, rotation);
        for (const combo of batch) {
            let comboBest = null;
            for (const startPrefix of prefixes) {
                const gear = {};
                for (const slot of GEAR_SLOTS) gear[slot] = startPrefix;
                const result = this._descent(
                    sim, build, selectedSkills, combo, gear, prefixes,
                    startAtt, startAtt2, evokerElement, permaBoons, () => {},
                );
                if (!comboBest || result.rawDps > comboBest.rawDps) comboBest = result;
            }
            if (comboBest) {
                const key = this._key(comboBest);
                if (!seenKeys.has(key)) {
                    seenKeys.add(key);
                    top10.push(comboBest);
                    top10.sort((a, b) => b.rawDps - a.rawDps);
                    if (top10.length > 10) top10.pop();
                }
            }
            // Yield occasionally so the browser stays responsive.
            await new Promise(r => setTimeout(r, 0));
        }
    }

    // ── Coordinate descent (single thread, used by fallback + final re-eval) ──
    _descent(sim, baseBuild, selectedSkills, combo, gear, prefixes,
             startAtt, startAtt2, evokerElement, permaBoons, onEval) {

        let bestDps = this._eval(sim, baseBuild, selectedSkills, combo, gear,
                                  startAtt, startAtt2, evokerElement, permaBoons);
        onEval(1);

        let improved = true;
        while (improved) {
            improved = false;
            for (const slot of GEAR_SLOTS) {
                const orig     = gear[slot];
                let winner     = orig;
                let winnerDps  = bestDps;

                for (const prefix of prefixes) {
                    if (prefix === orig) continue;
                    gear[slot] = prefix;
                    const dps = this._eval(sim, baseBuild, selectedSkills, combo, gear,
                                           startAtt, startAtt2, evokerElement, permaBoons);
                    onEval(1);
                    if (dps > winnerDps) { winnerDps = dps; winner = prefix; }
                }

                gear[slot] = winner;
                if (winner !== orig) { bestDps = winnerDps; improved = true; }
            }
        }

        return {
            rawDps:    bestDps,
            dps:       bestDps,
            gear:      { ...gear },
            rune:      combo.rune,
            relic:     combo.relic,
            sigil1:    combo.sigil1,
            sigil2:    combo.sigil2,
            food:      combo.food,
            utility:   combo.utility,
            infusions: combo.infusions,
        };
    }

    // ── Single DPS evaluation (no HP cap — fair comparison during search) ─────
    _eval(sim, baseBuild, selectedSkills, combo, gear,
          startAtt, startAtt2, evokerElement, permaBoons) {
        this._applyCombo(sim, baseBuild, selectedSkills, combo, gear);
        sim.run(startAtt, startAtt2, evokerElement, permaBoons, null, 0);
        return sim.results?.dps ?? 0;
    }

    // ── Final DPS evaluation with actual targetHP (for display) ───────────────
    _evalFull(sim, baseBuild, selectedSkills, r,
              startAtt, startAtt2, evokerElement, permaBoons, targetHP) {
        const combo = { rune: r.rune, relic: r.relic, sigil1: r.sigil1, sigil2: r.sigil2,
                        food: r.food, utility: r.utility, infusions: r.infusions };
        this._applyCombo(sim, baseBuild, selectedSkills, combo, r.gear);
        sim.run(startAtt, startAtt2, evokerElement, permaBoons, null, targetHP);
        return sim.results?.dps ?? 0;
    }

    // ── Apply a gear+combo configuration to the sim instance ─────────────────
    _applyCombo(sim, baseBuild, selectedSkills, combo, gear) {
        const testBuild = {
            ...baseBuild,
            gear:      { ...gear },
            rune:      combo.rune      || baseBuild.rune,
            relic:     combo.relic     || baseBuild.relic,
            sigils:    combo.sigil1 != null
                           ? [combo.sigil1, combo.sigil2].filter(Boolean)
                           : (baseBuild.sigils || []),
            food:      combo.food      || baseBuild.food,
            utility:   combo.utility   || baseBuild.utility,
            infusions: combo.infusions != null ? combo.infusions : (baseBuild.infusions || []),
        };

        const attrs = calcAttributes(testBuild, selectedSkills);
        sim.attributes       = attrs;
        sim.activeTraitNames = new Set((attrs.activeTraits || []).map(t => t.name));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    _makeSim(build, selectedSkills, rotation) {
        const attrs = calcAttributes(build, selectedSkills);
        const sim   = new SimulationEngine({
            skills:       this.skills,
            skillHits:    this.skillHits,
            weapons:      this.weapons,
            attributes:   attrs,
            sigils:       this.sigilsData,
            relics:       this.relicsData,
            activeTraits: attrs.activeTraits,
        });
        sim.rotation         = rotation;
        sim.activeTraitNames = new Set((attrs.activeTraits || []).map(t => t.name));
        return sim;
    }

    _nonGearCombos(space) {
        const runes     = space.runes.length     ? space.runes     : [null];
        const relics    = space.relics.length    ? space.relics    : [null];
        const foods     = space.foods.length     ? space.foods     : [null];
        const utilities = space.utilities.length ? space.utilities : [null];

        // Infusion distributions: all ways to split infusionTotal across selected stats.
        // null means "keep the build's existing infusions unchanged".
        const infStats = space.infusionStats || [];
        const infTotal = space.infusionTotal  ?? 0;
        const infusions = infStats.length === 0 ? [null]
            : this._infusionDistributions(infStats, infTotal);

        // Unordered sigil pairs — duplicates not allowed (GW2 rule).
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
        for (const rune     of runes)
        for (const relic    of relics)
        for (const [s1, s2] of sigilPairs)
        for (const food     of foods)
        for (const utility  of utilities)
        for (const infusion of infusions)
            out.push({ rune, relic, sigil1: s1, sigil2: s2, food, utility, infusions: infusion });
        return out;
    }

    // All ways to distribute `total` infusions among `stats` stat types.
    _infusionDistributions(stats, total) {
        if (total === 0) return [[]];

        const results = [];
        const counts  = new Array(stats.length).fill(0);

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
        const g   = GEAR_SLOTS.map(s => r.gear[s]).join(',');
        const inf = r.infusions == null ? 'keep'
            : (r.infusions.map(x => `${x.stat}×${x.count}`).join('+') || 'none');
        return `${g}|${r.rune}|${r.relic}|${r.sigil1}|${r.sigil2}|${r.food}|${r.utility}|${inf}`;
    }
}
