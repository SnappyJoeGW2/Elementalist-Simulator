// ─── Attribute Calculation Engine ────────────────────────────────────────────
// Implements a clean attribute pipeline validated against Discretize Gear Optimizer.
//
// Pipeline (matches Discretize's calcStatsScenario model):
//   1. Base stats
//   2. Gear stats
//   3. Rune stats (into conversion pool)
//   4. Food stats (converted items → conversion pool; buff items → applied after)
//   5. Build conversion base pool (base + gear + runes + food_converted)
//   6. Utility conversions (N% of pool stat → target stat)
//   7. Trait conversion rules (Ferocious Winds, Strength of Stone, etc.)
//   8. Flat trait buffs (Burning Rage, Aeromancer's Training Vuln bonus, Gathered Focus, etc.)
//      Aeromancer's Training has TWO +150 Ferocity bonuses: (1) Vulnerability proc [applied here,
//      always-on], (2) Air attunement [simulation per-hit + conditions panel, separate bonus].
//   9. Sigil stat bonuses
//  10. JBC buff (Vitality, not part of conversion pool)
//  11. Infusions
//  12. Derive Critical Chance, Critical Damage, Boon Duration, Condition Duration

import {
    GEAR_STATS, GEAR_SLOTS, BASE_STATS, JBC_BONUS, INFUSION_BONUS,
    RUNE_DATA, FOOD_DATA, UTILITY_DATA, UTILITY_CONVERSION_RATES, SIGIL_DATA,
    WEAPON_DATA,
} from '../data/gear-data.js';
import { getActiveTraits } from '../data/traits-data.js';

const PRIMARY_STATS = [
    'Power', 'Precision', 'Toughness', 'Vitality',
    'Ferocity', 'Condition Damage', 'Expertise', 'Concentration', 'Healing Power',
];

const DURATION_KEYS = [
    'Burning Duration', 'Bleeding Duration', 'Torment Duration', 'Confusion Duration',
    'Poison Duration', 'Quickness Duration', 'Might Duration', 'Fury Duration',
];

function add(obj, stat, val) {
    if (val) obj[stat] = (obj[stat] || 0) + val;
}

// ─── Trait conversion functions ───────────────────────────────────────────────
// Each function takes the read-only convBase pool and writes delta into traitAccum.

function runFerociousWinds(hasTrait, convBase, traitAccum) {
    if (!hasTrait) return;
    const bonus = Math.round((convBase['Precision'] || 0) * 0.07);
    add(traitAccum, 'Ferocity', bonus);
}

// Strength of Stone: 10% Toughness (base+gear+runes only, food excluded)
function runStrengthOfStone(hasTrait, convBaseNoFood, traitAccum) {
    if (!hasTrait) return;
    const bonus = Math.round((convBaseNoFood['Toughness'] || 0) * 0.10);
    add(traitAccum, 'Condition Damage', bonus);
}

// Master's Fortitude: 5% (Power + CondDmg) → Vitality, + flat 120 if Sword equipped
function runMastersFortitude(hasTrait, convBase, hasSword, traitAccum) {
    if (!hasTrait) return;
    const flat = hasSword ? 120 : 0;
    const converted = Math.round(
        ((convBase['Power'] || 0) + (convBase['Condition Damage'] || 0)) * 0.05
    );
    add(traitAccum, 'Vitality', flat + converted);
}

// Elements of Rage: 13% Vitality (convBase + MF flat) → Precision
function runElementsOfRage(hasTrait, convBase, hasMF, hasSword, traitAccum) {
    if (!hasTrait) return;
    const mfFlat = (hasMF && hasSword) ? 120 : 0;
    const bonus = Math.round(((convBase['Vitality'] || 0) + mfFlat) * 0.13);
    add(traitAccum, 'Precision', bonus);
}

// Signet of Fire passive: +180 Precision (applied AFTER conversions – not converted)
function runSignetOfFire(skills, traitAccum) {
    if (skills && skills.some(s => s.name === 'Signet of Fire')) {
        add(traitAccum, 'Precision', 180);
    }
}

// ─── Main calculation ─────────────────────────────────────────────────────────
export function calcAttributes(build, skills) {
    // ── Accumulators ──
    const gearAcc   = {};  // gear prefix stat sums
    const runeAcc   = {};  // rune flat stat bonuses
    const foodConv  = {};  // food converted stats (feed into pool)
    const foodBuff  = {};  // food buff stats (applied after conversions)
    const foodDur   = {};  // food duration bonuses
    const runeDur   = {};  // rune duration bonuses
    const utilAcc   = {};  // utility conversion results
    const traitAcc  = {};  // trait flat buffs + conversion bonuses
    const sigilDur  = {};  // sigil duration bonuses
    const jbcAcc    = {};  // jade bot core bonuses

    // ── 2. Gear ──
    const mhWeapon = build.weapons?.[0] || '';
    const is2H = WEAPON_DATA[mhWeapon]?.wielding === '2h';
    for (const slot of GEAR_SLOTS) {
        if (is2H && slot === 'Weapon2') continue;
        const statSlot = (is2H && slot === 'Weapon1') ? 'Weapon2H' : slot;
        const prefix = build.gear?.[slot];
        if (!prefix) continue;
        const slotStats = GEAR_STATS[prefix]?.[statSlot];
        if (!slotStats) continue;
        for (const [s, v] of Object.entries(slotStats)) add(gearAcc, s, v);
    }

    // ── 3. Rune ──
    const runeEntry = RUNE_DATA[build.rune];
    if (runeEntry) {
        for (const [s, v] of Object.entries(runeEntry.stats))     add(runeAcc, s, v);
        for (const [d, v] of Object.entries(runeEntry.durations)) add(runeDur, d, v);
    }

    // ── 4. Food ──
    const foodEntry = FOOD_DATA[build.food];
    if (foodEntry) {
        const statsTarget = foodEntry.isConverted ? foodConv : foodBuff;
        for (const [s, v] of Object.entries(foodEntry.stats || {}))     add(statsTarget, s, v);
        for (const [d, v] of Object.entries(foodEntry.durations || {})) add(foodDur, d, v);
    }

    // ── 5. Jade Bot Core ──
    if (build.jadeBotCore) {
        for (const [s, v] of Object.entries(JBC_BONUS)) add(jbcAcc, s, v);
    }

    // ── Build conversion base pool: base + gear + runes + food(converted) + JBC ──
    // JBC is included because in-game trait conversions operate on the full stat total
    // including JBC. Validated: Elements of Rage uses 13% × (base+JBC Vitality) in-game.
    const convBase = {};
    const convBaseNoFood = {}; // for Strength of Stone (excludes food, but includes JBC)
    for (const stat of PRIMARY_STATS) {
        const b = BASE_STATS[stat] || 0;
        const g = gearAcc[stat]  || 0;
        const r = runeAcc[stat]  || 0;
        const f = foodConv[stat] || 0;
        const j = build.jadeBotCore ? (JBC_BONUS[stat] || 0) : 0;
        convBase[stat]       = b + g + r + f + j;
        convBaseNoFood[stat] = b + g + r + j;
    }

    // ── 6. Utility conversions ──
    const utilEntry = UTILITY_DATA[build.utility];
    if (utilEntry) {
        for (const { to, from } of utilEntry) {
            const rate  = (UTILITY_CONVERSION_RATES[from] || 0) / 100;
            const bonus = Math.round((convBase[from] || 0) * rate);
            add(utilAcc, to, bonus);
        }
    }

    // ── 7 & 8. Trait conversions + flat buffs ──
    const activeTraits = getActiveTraits(build.specializations || []);

    const hasTrait    = (name) => activeTraits.some(t => t.name === name);
    const hasFW       = hasTrait('Ferocious Winds');
    const hasSoS      = hasTrait('Strength of Stone');
    const hasMF       = hasTrait("Master's Fortitude");
    const hasEoR      = hasTrait('Elements of Rage');
    const hasSword    = (build.weapons || []).includes('Sword');

    // Conversion traits (order matters: MF before EoR so mfFlat is available)
    runFerociousWinds(hasFW,  convBase, traitAcc);
    runStrengthOfStone(hasSoS, convBaseNoFood, traitAcc);
    runMastersFortitude(hasMF, convBase, hasSword, traitAcc);
    runElementsOfRage(hasEoR, convBase, hasMF, hasSword, traitAcc);

    // Flat trait buffs from traits_data.csv (Burning Rage +CondDmg, Gathered Focus +Concentration, etc.)
    // Duration bonuses go directly into the appropriate duration accumulator objects.
    //
    // Aeromancer's Training: trait.ferocity = 150 represents the VULNERABILITY PROC BONUS
    // ("+150 Ferocity for 4s after applying Vulnerability, ICD 2s") — treated as always-on in base
    // stats since vulnerability is permanently applied in group content (matches Discretize's
    // "permanent" entry for aeromancers-training with temporaryBuff: false).
    // The AIR ATTUNEMENT bonus (+150 Ferocity while in Air) is a SEPARATE second bonus handled:
    //   - in the simulation: aeroFerocity = 10 crit dmg (= 150/15) when hitAtt === 'Air'
    //   - in the conditions panel: +150 Ferocity shown as additional when Air attunement is selected
    // These are different bonuses — NOT double-counting.
    let traitCC = 0;
    for (const trait of activeTraits) {
        if (trait.conditionDamage)  add(traitAcc, 'Condition Damage', trait.conditionDamage);
        if (trait.ferocity)         add(traitAcc, 'Ferocity',         trait.ferocity);
        if (trait.concentration)    add(traitAcc, 'Concentration',    trait.concentration);
        if (trait.vitality)         add(traitAcc, 'Vitality',         trait.vitality);
        if (trait.burningDuration)  add(runeDur,  'Burning Duration', trait.burningDuration);
        if (trait.bleedingDuration) add(runeDur,  'Bleeding Duration', trait.bleedingDuration);
        if (trait.criticalChance)   traitCC += trait.criticalChance;
    }

    // Signet of Fire passive (+180 Precision – post-conversion, not in pool)
    runSignetOfFire(skills, traitAcc);

    // ── 9. Sigil stat bonuses ──
    let sigilCC = 0;
    for (const sigilName of (build.sigils || [])) {
        const s = SIGIL_DATA[sigilName];
        if (!s) continue;
        if (s.conditionDuration) add(sigilDur, 'Condition Duration', s.conditionDuration);
        if (s.bleedingDuration)  add(sigilDur, 'Bleeding Duration',  s.bleedingDuration);
        if (s.burningDuration)   add(sigilDur, 'Burning Duration',   s.burningDuration);
        if (s.poisonDuration)    add(sigilDur, 'Poison Duration',    s.poisonDuration);
        if (s.tormentDuration)   add(sigilDur, 'Torment Duration',   s.tormentDuration);
        if (s.criticalChance)    sigilCC += s.criticalChance;
    }

    // ── 10. Infusions (up to 3 types, 18 total) ──
    const infAcc = {};
    for (const inf of build.infusions || []) {
        if (inf?.stat && inf.count > 0) {
            infAcc[inf.stat] = (infAcc[inf.stat] || 0) + inf.count * INFUSION_BONUS;
        }
    }

    // ── 11. Assemble primary stat breakdowns ──
    const attributes = {};
    for (const stat of PRIMARY_STATS) {
        const b   = BASE_STATS[stat] || 0;
        const g   = gearAcc[stat]  || 0;
        const r   = runeAcc[stat]  || 0;
        const f   = (foodConv[stat] || 0) + (foodBuff[stat] || 0);
        const u   = utilAcc[stat]  || 0;
        const j   = jbcAcc[stat]   || 0;
        const t   = traitAcc[stat] || 0;
        const inf = infAcc[stat]   || 0;
        const final = b + g + r + f + u + j + t + inf;
        attributes[stat] = { final, base: b, gear: g, runes: r, food: f, utility: u, jbc: j, traits: t, sigils: 0, infusions: inf };
    }

    // ── 12. Derived stats ──
    const precFinal = attributes['Precision'].final;
    const ferFinal  = attributes['Ferocity'].final;
    const concFinal = attributes['Concentration'].final;
    const expFinal  = attributes['Expertise'].final;

    // Critical Chance = (Precision – 895) / 21  +  flat CC bonuses
    // GW2 formula: at base Precision 1000 (level 80 minimum), this gives ~5% crit naturally.
    const baseCC = (precFinal - 895) / 21;
    attributes['Critical Chance'] = {
        final: baseCC + traitCC + sigilCC,
        base: 0, gear: 0, runes: 0, food: 0, utility: 0, jbc: 0,
        traits: traitCC, sigils: sigilCC,
    };

    // Critical Damage = 150 + Ferocity / 15
    attributes['Critical Damage'] = {
        final: 150 + ferFinal / 15,
        base: 0, gear: 0, runes: 0, food: 0, utility: 0, jbc: 0, traits: 0, sigils: 0,
    };

    // Boon Duration = Concentration / 15  +  bonuses
    const boonDurBonus = (runeDur['Boon Duration'] || 0) + (foodDur['Boon Duration'] || 0);
    attributes['Boon Duration'] = {
        final: concFinal / 15 + boonDurBonus,
        base: 0, gear: 0, runes: 0, food: 0, utility: 0, jbc: 0, traits: 0, sigils: 0,
    };

    // Condition Duration = Expertise / 15  +  bonuses
    const condDurBonus = (runeDur['Condition Duration'] || 0) + (sigilDur['Condition Duration'] || 0);
    attributes['Condition Duration'] = {
        final: expFinal / 15 + condDurBonus,
        base: 0, gear: 0, runes: 0, food: 0, utility: 0, jbc: 0, traits: 0, sigils: 0,
    };

    // Specific duration bonuses (Burning, Bleeding, etc.)
    // runeDur also accumulates trait duration bonuses (see flat trait buffs section above)
    const allDurations = {};
    for (const k of DURATION_KEYS) {
        const v = (runeDur[k] || 0) + (foodDur[k] || 0) + (sigilDur[k] || 0);
        if (v > 0) allDurations[k] = v;
    }

    for (const [k, v] of Object.entries(allDurations)) {
        attributes[k] = {
            final: v,
            base: 0, gear: 0, runes: 0, food: 0, utility: 0, jbc: 0, traits: 0, sigils: 0,
        };
    }

    return {
        attributes,
        activeTraits,
        gear:           { ...(build.gear || {}) },
        weapons:        build.weapons        || [],
        runes:          build.rune           || '',
        sigils:         build.sigils         || [],
        relic:          build.relic          || '',
        food:           build.food           || '',
        utility:        build.utility        || '',
        jadeBotCore:    build.jadeBotCore    || false,
        specializations: build.specializations || [],
    };
}
