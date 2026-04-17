import { calcAttributes } from '../../core/calc-attributes.js';
import { SimulationEngine } from '../../simulation.js?v=46';
import { WEAPON_DATA, SIGIL_DATA, RELIC_DATA } from '../../data/gear-data.js';
import { cloneRotationItems } from '../../app/app-state.js';

export function getSelectedSkillList(selectedSkills = {}) {
    return Object.values(selectedSkills).filter(Boolean);
}

export function calcBuildAttributes(build, selectedSkills) {
    return calcAttributes(build, getSelectedSkillList(selectedSkills));
}

export function createSimulationEngine(data, attributes, { hitboxSize, glyphBoonedElementals } = {}) {
    return new SimulationEngine({
        skills: data.skills,
        skillHits: data.skillHits,
        weapons: WEAPON_DATA,
        attributes,
        sigils: SIGIL_DATA,
        relics: RELIC_DATA,
        activeTraits: attributes.activeTraits,
        hitboxSize,
        glyphBoonedElementals,
    });
}

export function rebuildSimulation({ data, build, selectedSkills, rotation = [], hitboxSize, glyphBoonedElementals }) {
    const attributes = calcBuildAttributes(build, selectedSkills);
    const sim = createSimulationEngine(data, attributes, { hitboxSize, glyphBoonedElementals });
    sim.rotation = cloneRotationItems(rotation);
    return { attributes, sim };
}

export function runSimulationContributions({
    sim,
    activeAttunement,
    secondaryAttunement,
    evokerElement,
    startEvokerCharges = 6,
    startEvokerEmpowered = 0,
    permaBoons,
    targetHP = 0,
    startPistolBullets = null,
}) {
    sim.computeContributions(
        activeAttunement,
        secondaryAttunement,
        evokerElement,
        permaBoons,
        targetHP,
        startPistolBullets,
        startEvokerCharges,
        startEvokerEmpowered,
    );
    return sim.results;
}
