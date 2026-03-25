// ─── Optimizer Web Worker ─────────────────────────────────────────────────────
// Receives a batch of non-gear combos, runs coordinate descent on each, and
// returns the best result per combo.  Runs inside a Web Worker so it never
// blocks the UI thread.

import { SimulationEngine } from './simulation.js';
import { calcAttributes }   from './calc-attributes.js';
import { GEAR_SLOTS }       from './gear-data.js';

self.onmessage = ({ data }) => {
    const {
        skills, skillHits, weapons, sigilsData, relicsData,
        baseBuild, selectedSkills, rotation,
        prefixes, startAtt, startAtt2, evokerElement, permaBoons,
        combos,
    } = data;

    // Build a local SimulationEngine.
    const initAttrs = calcAttributes(baseBuild, selectedSkills);
    const sim = new SimulationEngine({
        skills, skillHits, weapons,
        attributes:   initAttrs,
        sigils:       sigilsData,
        relics:       relicsData,
        activeTraits: initAttrs.activeTraits,
    });
    sim.rotation = rotation;

    // activeTraitNames never changes with gear — compute once.
    sim.activeTraitNames = new Set((initAttrs.activeTraits || []).map(t => t.name));

    const results  = [];
    let   evalsDone = 0;

    for (const combo of combos) {
        let comboBest = null;

        for (const startPrefix of prefixes) {
            // Seed: all slots start with this prefix.
            const gear = {};
            for (const slot of GEAR_SLOTS) gear[slot] = startPrefix;

            let bestDps = _eval(sim, baseBuild, selectedSkills, combo, gear,
                                startAtt, startAtt2, evokerElement, permaBoons);
            evalsDone++;

            // Coordinate descent: cycle through slots until no improvement.
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
                        const dps = _eval(sim, baseBuild, selectedSkills, combo, gear,
                                          startAtt, startAtt2, evokerElement, permaBoons);
                        evalsDone++;
                        if (dps > winnerDps) { winnerDps = dps; winner = prefix; }
                    }

                    gear[slot] = winner;
                    if (winner !== orig) { bestDps = winnerDps; improved = true; }
                }
            }

            const result = {
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
            if (!comboBest || result.rawDps > comboBest.rawDps) comboBest = result;
        }

        if (comboBest) results.push(comboBest);
    }

    self.postMessage({ results, evalsDone });
};

// ── Single evaluation (no HP cap) ─────────────────────────────────────────────
function _eval(sim, baseBuild, selectedSkills, combo, gear,
               startAtt, startAtt2, evokerElement, permaBoons) {
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
    sim.attributes = attrs;
    // activeTraitNames is constant (doesn't depend on gear) — already set at init.
    sim.run(startAtt, startAtt2, evokerElement, permaBoons, null, 0);
    return sim.results?.dps ?? 0;
}
