// ─── Optimizer Web Worker ─────────────────────────────────────────────────────
// Receives a batch of non-gear combos, runs coordinate descent on each, and
// posts incremental results after every combo so the UI progress bar moves
// smoothly.  Runs inside a Web Worker so it never blocks the UI thread.

import { SimulationEngine } from './simulation.js';
import { calcAttributes }   from './calc-attributes.js';
import { GEAR_SLOTS }       from './gear-data.js';

self.onmessage = ({ data }) => {
    const {
        skills, skillHits, weapons, sigilsData, relicsData,
        baseBuild, selectedSkills, rotation,
        prefixes, constraints = {}, slotConstraints = {},
        startAtt, startAtt2, evokerElement, permaBoons,
        combos,
    } = data;

    const initAttrs = calcAttributes(baseBuild, selectedSkills);
    const sim = new SimulationEngine({
        skills, skillHits, weapons,
        attributes:   initAttrs,
        sigils:       sigilsData,
        relics:       relicsData,
        activeTraits: initAttrs.activeTraits,
    });
    sim.rotation = rotation;
    sim.activeTraitNames = new Set((initAttrs.activeTraits || []).map(t => t.name));

    for (const combo of combos) {
        let comboBest = null;
        let evalsDone = 0;

        for (const startPrefix of prefixes) {
            const gear = {};
            for (const slot of GEAR_SLOTS) gear[slot] = slotConstraints[slot] || startPrefix;

            let bestDps = _eval(sim, baseBuild, selectedSkills, combo, gear,
                                startAtt, startAtt2, evokerElement, permaBoons, constraints);
            evalsDone++;

            let improved = true;
            while (improved) {
                improved = false;
                for (const slot of GEAR_SLOTS) {
                    if (slotConstraints[slot]) continue;
                    const orig     = gear[slot];
                    let winner     = orig;
                    let winnerDps  = bestDps;

                    for (const prefix of prefixes) {
                        if (prefix === orig) continue;
                        gear[slot] = prefix;
                        const dps = _eval(sim, baseBuild, selectedSkills, combo, gear,
                                          startAtt, startAtt2, evokerElement, permaBoons, constraints);
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

        self.postMessage({
            results:   comboBest && comboBest.rawDps >= 0 ? [comboBest] : [],
            evalsDone,
            done:      false,
        });
    }

    self.postMessage({ results: [], evalsDone: 0, done: true });
};

function _eval(sim, baseBuild, selectedSkills, combo, gear,
               startAtt, startAtt2, evokerElement, permaBoons, constraints = {}) {
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
