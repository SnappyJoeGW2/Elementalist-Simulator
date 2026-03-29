import {
    strikeDamage, expectedCritMultiplier,
    conditionTickDamage, getConditionDurationBonus, getBoonDurationBonus,
} from './damage.js';

const DAMAGING_CONDITIONS = new Set([
    'Burning', 'Bleeding', 'Poisoned', 'Poison', 'Torment', 'Confusion',
]);
const BOONS = new Set([
    'Aegis', 'Alacrity', 'Fury', 'Might', 'Protection', 'Quickness',
    'Regeneration', 'Resistance', 'Resolution', 'Stability', 'Swiftness', 'Vigor',
    'Superspeed',
]);
const SIGIL_STAT_MAP = {
    criticalChance: 'Critical Chance',
    conditionDuration: 'Condition Duration',
    bleedingDuration: 'Bleeding Duration',
    burningDuration: 'Burning Duration',
    poisonDuration: 'Poison Duration',
    tormentDuration: 'Torment Duration',
};
const SIGIL_PROCS = {
    Air: {
        trigger: 'crit', icd: 3000, effect: 'strike', coeff: 1.1, ws: 690.5, canCrit: false,
        icon: 'https://render.guildwars2.com/file/C337CC61DF2F5EE44B7D053EFF33059111024444/220676.png'
    },
    Torment: {
        trigger: 'crit', icd: 5000, effect: 'condition', cond: 'Torment', stacks: 2, dur: 5,
        icon: 'https://render.guildwars2.com/file/E42EB6198022E5B4D71C5EE41465DD4EB84A0465/665778.png'
    },
    Earth: {
        trigger: 'crit', icd: 2000, effect: 'condition', cond: 'Bleeding', stacks: 1, dur: 6,
        icon: 'https://render.guildwars2.com/file/251EE3B8B5ADB8D7F7A35DBAEFABA35AEACDF51B/220677.png'
    },
    Blight: {
        trigger: 'crit', icd: 8000, effect: 'condition', cond: 'Poisoned', stacks: 2, dur: 4,
        icon: 'https://render.guildwars2.com/file/AE0A1C7816B56296FEA527E1D01376491374195A/941026.png'
    },
    Doom: {
        trigger: 'swap', icd: 9000, effect: 'doom', cond: 'Poisoned', stacks: 3, dur: 8,
        icon: 'https://render.guildwars2.com/file/6CE4D1D6E5392C4CC8BACA595E3393EBF208BEED/220686.png'
    },
    Hydromancy: {
        trigger: 'swap', icd: 9000, effect: 'strike_cond', coeff: 1.0, ws: 690.5, canCrit: true,
        cond: 'Chilled', stacks: 1, dur: 2,
        icon: 'https://render.guildwars2.com/file/B5F3E2021863079919299707290698504B5C7E90/220689.png'
    },
    Geomancy: {
        trigger: 'swap', icd: 9000, effect: 'condition', cond: 'Bleeding', stacks: 1, dur: 8,
        icon: 'https://render.guildwars2.com/file/B79B430645DDF54E6792909A52F5CA40A4911407/220687.png'
    },
};
const RELIC_PROCS = {
    Akeem: {
        trigger: 'cc_5torment_confusion', icd: 10000, strikeDmgM: 0, effectDuration: 0,
        conditions: { Confusion: { stacks: 2, dur: 10 }, Torment: { stacks: 2, dur: 10 } },
        icon: 'https://render.guildwars2.com/file/594C437E9606A167F4F372BCEB0C2B7C7828037B/3122330.png',
    },
    Fireworks: {
        trigger: 'weapon_recharge20', icd: 0, strikeDmgM: 0.07, effectDuration: 6000,
        conditions: null,
        icon: 'https://render.guildwars2.com/file/2999CCF7C94267B2EE3DDA7459050864622927C9/3122349.png',
    },
    'Mount Balrior': {
        trigger: 'elite_delayed', icd: 30000, delay: 1000, strikeDmgM: 0.15, effectDuration: 6000,
        conditions: null,
        icon: 'https://render.guildwars2.com/file/49A8520BDB6C5A7BA90832DB9406677473A6932F/3441973.png',
    },
    Peitha: {
        trigger: 'polaric_leap', icd: 4000, strikeDmgM: 0.10, effectDuration: 4000,
        conditions: { Torment: { stacks: 2, dur: 7 } },
        icon: 'https://render.guildwars2.com/file/949A6A4179F514FCDEF3AC3D9C292B38D5E0047D/3122365.png',
    },
    Claw: {
        trigger: 'cc_any', icd: 0, strikeDmgM: 0.07, effectDuration: 8000,
        conditions: null, icon: null,
    },
    Aristocracy: {
        trigger: 'apply_weakness_vuln', icd: 0, strikeDmgM: 0, effectDuration: 8000,
        maxStacks: 5, condDurPerStack: 3,
        conditions: null,
        icon: 'https://render.guildwars2.com/file/BCC01F0B6616FE26ED4BE159532A6A6FBD0EA2D8/3122332.png',
    },
    Blightbringer: {
        trigger: 'poison_6th', icd: 8000, strikeDmgM: 0, effectDuration: 0,
        poisonCountNeeded: 6,
        conditions: { Poisoned: { stacks: 3, dur: 10 }, Cripple: { stacks: 1, dur: 5 }, Weakness: { stacks: 1, dur: 5 } },
        icon: 'https://render.guildwars2.com/file/286C60AC6FA239B0070293039091A44476A35E90/3375219.png',
    },
    Brawler: {
        trigger: 'gain_protection_resolution', icd: 8000, strikeDmgM: 0.10, effectDuration: 4000,
        conditions: null,
        icon: 'https://render.guildwars2.com/file/2B5297A932F55DA3BDDD0A39C9CB0D9CF70244A1/3122334.png',
    },
    Dragonhunter: {
        trigger: 'trap_skill', icd: 0, strikeDmgM: 0.10, effectDuration: 5000,
        uncappedCondDur: 10,
        conditions: null, icon: null,
    },
    Eagle: {
        trigger: 'eagle_below50', icd: 0, strikeDmgM: 0.10, effectDuration: 0,
        conditions: null,
        icon: 'https://render.guildwars2.com/file/DFF4EB43AD0803F60D105658052321A0BE1AF02C/3592832.png',
    },
    Fractal: {
        trigger: 'bleed_6stacks', icd: 20000, strikeDmgM: 0, effectDuration: 0,
        conditions: { Burning: { stacks: 2, dur: 8 }, Torment: { stacks: 3, dur: 8 } },
        icon: 'https://render.guildwars2.com/file/B2D409644147BF18935A95A52505ABCB9EECE142/3122351.png',
    },
    Krait: {
        trigger: 'elite_delayed', icd: 30000, delay: 1000, strikeDmgM: 0, effectDuration: 0,
        strikeCoeff: 0.5, strikeWs: 690.5,
        conditions: { Bleeding: { stacks: 1, dur: 8 }, Poisoned: { stacks: 1, dur: 8 }, Torment: { stacks: 1, dur: 8 } },
        icon: 'https://render.guildwars2.com/file/645EFCBFFBB7B1C6630CBB7C0FB268CA27B703AC/3122355.png',
    },
    Thief: {
        trigger: 'weapon_recharge_hit', icd: 0, strikeDmgM: 0, effectDuration: 6000,
        stackDmgPer: 0.01, maxStacks: 5,
        conditions: null,
        icon: 'https://render.guildwars2.com/file/3523AC08EB04347CF371E9A91F4B985D12FB4ED3/3122371.png',
    },
    Weaver: {
        trigger: 'stance_skill', icd: 0, strikeDmgM: 0.10, effectDuration: 4000,
        conditions: null,
        icon: 'https://render.guildwars2.com/file/12997110B0509463DD9F1364A92493B2C4309BE1/3122377.png',
    },
    Fire: {
        // On healing skill (ICD 20s): grant Fire Aura 4s.
        // While Fire Aura is active: +7% strike damage (multiplicative).
        trigger: 'heal_skill', icd: 20000, strikeDmgM: 0.07, effectDuration: 4000,
        conditions: null, icon: 'https://render.guildwars2.com/file/00E5051DCC0EDD58395DF9CEA3456466EA4FD347/3592834.png',
    },
    Bloodstone: {
        trigger: 'blast_combo', icd: 0, strikeDmgM: 0.07, effectDuration: 8000,
        volatilityDuration: 10000, stacksNeeded: 4,
        strikeCoeff: 3.0, strikeWs: 690.5,
        conditions: { Bleeding: { stacks: 6, dur: 6 } },
        icon: 'https://render.guildwars2.com/file/A7327A7EDB4705EA05261110526D72AFEAF7DAB4/3629397.png',
    },
    Steamshrieker: {
        trigger: 'water_blast_leap_combo', icd: 0,
        conditions: { Burning: { stacks: 2, dur: 5 } },
        icon: 'https://render.guildwars2.com/file/23B0F0A5BF05E05C9F527BF7EB4962C9F49C6F42/3441975.png',
    },
};
const ATTUNEMENTS = ['Fire', 'Water', 'Air', 'Earth'];
const OFF_ATT_CD = 1500;
const OVERLOAD_DWELL = 6000;
const WEAVER_SWAP_CD = 4000;
const CATALYST_ENERGY_MAX = 30;
const CATALYST_SPHERE_COST = 10;
const CONJURE_WEAPONS = new Set(['Frost Bow', 'Lightning Hammer', 'Fiery Greatsword']);
const CONJURE_MAP = {
    'Conjure Frost Bow': 'Frost Bow',
    'Conjure Lightning Hammer': 'Lightning Hammer',
    'Conjure Fiery Greatsword': 'Fiery Greatsword',
};
const CONJURE_PICKUP_DURATION = 30000;
const FIRE_FIELD_SKILLS = new Set([
    'Lava Font', 'Pyroclastic Blast', 'Burning Retreat', 'Burning Speed',
    'Flamewall', 'Wildfire', 'Flame Uprising',
]);
const EVOKER_FAMILIAR_SELECTORS = new Set(['Ignite', 'Splash', 'Zap', 'Calcify']);
const EVOKER_NO_CHARGE_SKILLS = new Set([
    'Transmute Earth', 'Hurl', 'Transmute Frost', 'Transmute Lightning', 'Transmute Fire', 'Grand Finale'
]);
// Skills used to fill dead-time gaps before the next skill becomes available (ctrl+click).
// Keyed by the player's current attunement at gap time.
const GAP_FILL_SKILLS = { Air: 'Arc Lightning', Earth: 'Stone Shards' };
const EVOKER_ELEMENT_MAP = {
    Ignite: 'Fire', Splash: 'Water', Zap: 'Air', Calcify: 'Earth',
    Conflagration: 'Fire', 'Buoyant Deluge': 'Water', 'Lightning Blitz': 'Air', 'Seismic Impact': 'Earth'
};

// Spear Etching chains: Etching → lesser → (3 other Spear weapon casts) → full
// Casting lesser OR full resets back to Etching.
const ETCHING_CHAINS = {
    'Volcano': { etching: 'Etching: Volcano', lesser: 'Lesser Volcano', full: 'Volcano' },
    'Jökulhlaup': { etching: 'Etching: Jökulhlaup', lesser: 'Lesser Jökulhlaup', full: 'Jökulhlaup' },
    'Derecho': { etching: 'Etching: Derecho', lesser: 'Lesser Derecho', full: 'Derecho' },
    'Haboob': { etching: 'Etching: Haboob', lesser: 'Lesser Haboob', full: 'Haboob' },
};
// Map any of the three names → the chain entry
const ETCHING_LOOKUP = new Map();
for (const chain of Object.values(ETCHING_CHAINS)) {
    ETCHING_LOOKUP.set(chain.etching, chain);
    ETCHING_LOOKUP.set(chain.lesser, chain);
    ETCHING_LOOKUP.set(chain.full, chain);
}
// Skills that grant "next Spear skill" buffs
const SPEAR_NEXT_BUFF_SKILLS = new Set(['Seethe', 'Ripple', 'Energize', 'Harden']);

// ── Hammer orb system ─────────────────────────────────────────────────────────
// Each orb skill grants one elemental orb (15s duration, ticking damage).
// Grand Finale consumes all active orbs, dealing hits and applying conditions per orb.
const HAMMER_ORB_SKILLS = {
    'Flame Wheel': 'Fire',
    'Icy Coil': 'Water',
    'Crescent Wind': 'Air',
    'Rocky Loop': 'Earth',
};
// Dual orbit skills grant two orbs each
const HAMMER_DUAL_ORB_SKILLS = {
    'Dual Orbits: Fire and Water': ['Fire', 'Water'],
    'Dual Orbits: Fire and Air': ['Fire', 'Air'],
    'Dual Orbits: Fire and Earth': ['Fire', 'Earth'],
    'Dual Orbits: Water and Air': ['Water', 'Air'],
    'Dual Orbits: Water and Earth': ['Water', 'Earth'],
    'Dual Orbits: Air and Earth': ['Air', 'Earth'],
};
const HAMMER_ORB_DURATION_MS = 15000;
const HAMMER_ORB_ICD_MS = 480; // between orb skills and Grand Finale
// Per-orb conditions applied by Grand Finale when that orb is consumed
const HAMMER_GF_CONDITIONS = {
    Fire: { cond: 'Burning', stacks: 2, dur: 5 },
    Water: { cond: 'Vulnerability', stacks: 6, dur: 10 },
    Air: { cond: 'Weakness', stacks: 1, dur: 5 },
    Earth: { cond: 'Bleeding', stacks: 4, dur: 5 },
};
// Orbs that grant buffs to the caster (tracked as pseudo-effects in _condMap)
const HAMMER_ORB_BUFF_KEY = {
    Fire: 'Hammer Orb Fire',   // +5% strike and condi
    Water: 'Hammer Orb Water',  // tracked for display only
    Air: 'Hammer Orb Air',    // +15% crit chance
    Earth: 'Hammer Orb Earth',  // tracked for display only
};
// All Hammer orb-category skill names (base + dual), used for ICD and chain checks
const HAMMER_ALL_ORB_NAMES = new Set([
    ...Object.keys(HAMMER_ORB_SKILLS),
    ...Object.keys(HAMMER_DUAL_ORB_SKILLS),
]);

// ── Pistol bullet system ──────────────────────────────────────────────────────
// Slot 2 and 3 Pistol skills grant their element's bullet if not held, or consume it if held.
// "Consume" effects and "grant" effects are applied in the post-cast section of _step().
const PISTOL_BULLET_COLOR = {
    Fire: '#e05530', Water: '#4488cc', Air: '#c06ad0', Earth: '#aa7744',
};
// Which element does each base pistol skill belong to?
const PISTOL_SKILL_ELEMENT = {
    // Slot 2
    'Raging Ricochet': 'Fire',
    'Frigid Flurry': 'Water',
    'Dazing Discharge': 'Air',
    'Shattering Stone': 'Earth',
    // Slot 3 (base)
    'Searing Salvo': 'Fire',
    'Frozen Fusillade': 'Water',
    'Aerial Agility': 'Air',   // never consumes, may grant
    'Aerial Agility (chain)': 'Air',
    'Aerial Agility (dash)': 'Air',
    'Boulder Blast': 'Earth',
    // Slot 3 (Weaver dual) — handled separately, listed here for lookup convenience
    'Frostfire Flurry': null,  // Fire+Water dual
    'Purblinding Plasma': null,  // Fire+Air dual
    'Molten Meteor': null,  // Fire+Earth dual
    'Flowing Finesse': null,  // Air+Water dual
    'Echoing Erosion': null,  // Water+Earth dual
    'Enervating Earth': null,  // Air+Earth dual
};
// Dual pistol slot-3 skill → [priElement, secElement] (Fire is always listed first when present)
const PISTOL_DUAL_ELEMENTS = {
    'Frostfire Flurry': ['Fire', 'Water'],
    'Purblinding Plasma': ['Fire', 'Air'],
    'Molten Meteor': ['Fire', 'Earth'],
    'Flowing Finesse': ['Water', 'Air'],
    'Echoing Erosion': ['Water', 'Earth'],
    'Enervating Earth': ['Air', 'Earth'],
};
// Skills that NEVER consume a bullet
const PISTOL_NO_CONSUME = new Set(['Aerial Agility', 'Aerial Agility (chain)', 'Aerial Agility (dash)']);
// Skills that NEVER grant a bullet
const PISTOL_NO_GRANT = new Set(['Aerial Agility (chain)', 'Aerial Agility (dash)']);

const PERMA_EXPIRY = 999999999;

console.log('simulation.js loaded, version 13');

function insertSorted(arr, ev) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (arr[mid].time <= ev.time) lo = mid + 1;
        else hi = mid;
    }
    arr.splice(lo, 0, ev);
}

const NOOP_ARRAY = { push() { }, length: 0 };

export class SimulationEngine {
    constructor({ skills, skillHits, weapons, attributes, sigils, relics, activeTraits }) {
        this.skills = skills;
        this.skillHits = skillHits;
        this.weapons = weapons;
        this.attributes = attributes;
        this.sigils = sigils || {};
        this.relics = relics || {};
        this.activeTraitNames = new Set((activeTraits || []).map(t => t.name));
        this.rotation = [];
        this.results = null;
        this.fastMode = false;
    }

    _hasTrait(name) { return this.activeTraitNames.has(name); }

    addSkill(name) { this.rotation.push(name); }
    removeSkill(idx) { this.rotation.splice(idx, 1); }
    moveSkill(from, to) {
        const [item] = this.rotation.splice(from, 1);
        this.rotation.splice(to, 0, item);
    }
    clearRotation() { this.rotation = []; this.results = null; }

    _skill(name) { return this.skills.find(s => s.name === name); }

    _skillInContext(name, S) {
        const matches = this.skills.filter(s => s.name === name);
        if (matches.length <= 1) return matches[0] || null;
        if (S.conjureEquipped) {
            return matches.find(s => s.weapon === S.conjureEquipped)
                || matches.find(s => !CONJURE_WEAPONS.has(s.weapon))
                || matches[0];
        }
        return matches.find(s => !CONJURE_WEAPONS.has(s.weapon)) || matches[0];
    }

    _pushCondStack(S, entry) {
        let arr = S._condMap.get(entry.cond);
        if (!arr) { arr = []; S._condMap.set(entry.cond, arr); }
        arr.push(entry);
        S.allCondStacks.push(entry);
    }

    _cdKey(sk) {
        if (CONJURE_WEAPONS.has(sk.weapon)) return `${sk.name}::${sk.weapon}`;
        if (sk.type === 'Jade Sphere') return sk.name;
        const base = sk.name.replace(/\s*\((?:Fire|Water|Air|Earth)\)$/, '');
        return (base !== sk.name && sk.attunement) ? base : sk.name;
    }

    _adjCastTime(S, csvCastMs, castStart) {
        if (csvCastMs <= 0) return { castMs: 0, scaleOff: off => off };

        const hasQ = S.quicknessUntil > castStart;

        if (!hasQ) {
            const castMs = Math.round(csvCastMs * 4 / 3);
            return { castMs, scaleOff: off => Math.round(off * 4 / 3) };
        }

        if (S.quicknessUntil >= castStart + csvCastMs) {
            return { castMs: csvCastMs, scaleOff: off => off };
        }

        const quickDur = S.quicknessUntil - castStart;
        const remainCsv = csvCastMs - quickDur;
        const castMs = quickDur + Math.round(remainCsv * 4 / 3);

        return {
            castMs,
            scaleOff: off => {
                if (off <= quickDur) return off;
                return quickDur + Math.round((off - quickDur) * 4 / 3);
            },
        };
    }

    _alaCd(S, baseCdMs, cdStart) {
        if (baseCdMs <= 0) return 0;

        const alaEnd = S.alacrityUntil;

        if (alaEnd <= cdStart) return baseCdMs;

        const readyIfFull = Math.round(baseCdMs / 1.25);
        if (alaEnd >= cdStart + readyIfFull) return readyIfFull;

        const alaRealMs = alaEnd - cdStart;
        const alaProgress = alaRealMs * 1.25;
        const remaining = baseCdMs - alaProgress;
        return Math.round(alaRealMs + remaining);
    }

    _catchUpCharges(S, key, sk) {
        const ch = S.charges[key];
        if (!ch) return;
        const baseMs = this._pyroRechargeMs(S, sk, Math.round(sk.countRecharge * 1000));
        while (ch.count < sk.maximumCount && ch.nextChargeAt <= S.t) {
            const gainedAt = ch.nextChargeAt;
            ch.count++;
            if (ch.count < sk.maximumCount) {
                ch.nextChargeAt = gainedAt + this._alaCd(S, baseMs, gainedAt);
            } else {
                ch.nextChargeAt = Infinity;
            }
        }
    }

    _initCharges(S, key, sk) {
        if (!S.charges[key]) {
            S.charges[key] = { count: sk.maximumCount, nextChargeAt: Infinity };
        }
    }

    _getEliteSpec() {
        const specs = this.attributes.specializations || [];
        const elites = new Set(['Tempest', 'Weaver', 'Catalyst', 'Evoker']);
        const found = specs.find(s => elites.has(s.name || s));
        return found ? (found.name || found) : null;
    }

    _detectAACarryover(S) {
        const mh = this.attributes.weapons?.[0] || '';
        const candidates = this.skills.filter(s =>
            s.slot === '1' && s.weapon === mh && s.attunement === S.att && s.chainSkill
        );
        if (candidates.length === 0) return null;
        const targets = new Set(candidates.map(s => s.chainSkill));
        const root = candidates.find(s => !targets.has(s.name));
        const rootName = root ? root.name : candidates[0].name;
        const next = S.chainState[rootName];
        if (next && next !== rootName) return { root: rootName, att: S.att };
        return null;
    }

    _ws(skill) {
        const w = skill.weapon;
        if (w === 'Profession mechanic') return this.weapons['Profession mechanic']?.weaponStrength || 1100;
        if (['Frost Bow', 'Lightning Hammer', 'Fiery Greatsword'].includes(w))
            return this.weapons['Conjured Weapon']?.weaponStrength || 968.5;
        if (['Healing', 'Utility', 'Elite'].includes(skill.slot))
            return this.weapons['Unequipped']?.weaponStrength || 690.5;
        if (w && this.weapons[w]) return this.weapons[w].weaponStrength;
        const eq = this.attributes.weapons;
        return (eq?.[0] && this.weapons[eq[0]]?.weaponStrength) || 1000;
    }

    _attOK(sk, S) {
        const req = sk.attunement;
        if (!req) return true;

        if (S.eliteSpec === 'Weaver') {
            if (req.includes('+')) {
                const [a, b] = req.split('+');
                return (a === S.att && b === S.att2) || (b === S.att && a === S.att2);
            }
            const slotNum = parseInt(sk.slot);
            if (!isNaN(slotNum) && slotNum >= 4) return req === S.att2;
            return req === S.att;
        }

        if (req === S.att) return true;
        if (req.includes('+')) return req.split('+').includes(S.att);
        return false;
    }

    run(startAtt = 'Fire', startAtt2 = null, startEvokerElement = null, permaBoons = {}, disabled = null, targetHP = 0, stopAtTime = null, startPistolBullets = null) {
        const a = this.attributes.attributes;

        const disSigil = disabled?.startsWith('Sigil:') ? disabled.slice(6) : null;
        const disRelic = disabled?.startsWith('Relic:') ? disabled.slice(6) : null;
        const disTrait = disabled?.startsWith('Trait:') ? disabled.slice(6) : null;
        const dsStat = disSigil ? (this.sigils[disSigil] || {}) : {};
        const statAdj = {};
        if (disSigil) {
            for (const [sk, an] of Object.entries(SIGIL_STAT_MAP)) {
                const v = dsStat[sk];
                if (v && a[an]) { a[an].final -= v; statAdj[an] = v; }
            }
        }
        // Stat-based trait disables: subtract the flat bonus before base stats are read
        if (disTrait) {
            const activeTraits = this.attributes.activeTraits || [];
            const traitObj = name => activeTraits.find(t => t.name === name);
            const subStat = (stat, val) => {
                if (val && a[stat]) { a[stat].final -= val; statAdj[stat] = (statAdj[stat] || 0) + val; }
            };
            if (disTrait === 'Burning Rage') subStat('Condition Damage', traitObj('Burning Rage')?.conditionDamage);
            if (disTrait === "Aeromancer's Training") subStat('Ferocity', traitObj("Aeromancer's Training")?.ferocity);
            if (disTrait === "Zephyr's Speed") subStat('Critical Chance', traitObj("Zephyr's Speed")?.criticalChance);
            if (disTrait === 'Serrated Stones') subStat('Bleeding Duration', traitObj('Serrated Stones')?.bleedingDuration);
            // Concentration traits: must subtract both Concentration and the derived Boon Duration
            // (getBoonDurationBonus reads a['Boon Duration'].final, not re-deriving from concentration)
            if (disTrait === 'Gathered Focus' || disTrait === 'Elemental Enchantment') {
                const name = disTrait;
                const delta = traitObj(name)?.concentration || 0;
                subStat('Concentration', delta);
                subStat('Boon Duration', delta / 15);
            }
        }

        const basePower = a['Power']?.final ?? 1000;
        const baseCondDmg = a['Condition Damage']?.final ?? 0;
        const baseCritCh = a['Critical Chance']?.final ?? 0;
        const critDmg = a['Critical Damage']?.final ?? 150;

        const sigilMuls = this._computeSigilMuls(disSigil);
        this._activeProcSigils = (this.attributes.sigils || [])
            .filter(name => name !== disSigil && SIGIL_PROCS[name]);

        const activeRelic = (disRelic === this.attributes.relic) ? null : (this.attributes.relic || null);
        const relicProc = activeRelic ? (RELIC_PROCS[activeRelic] || null) : null;

        const eliteSpec = this._getEliteSpec();
        const realStartAtt = ATTUNEMENTS.includes(startAtt) ? startAtt : 'Fire';
        const realStartAtt2 = eliteSpec === 'Weaver'
            ? (ATTUNEMENTS.includes(startAtt2) ? startAtt2 : realStartAtt)
            : null;

        const S = {
            t: 0,
            castUntil: 0,
            att: realStartAtt,
            att2: realStartAtt2,
            attEnteredAt: -999999,
            attCD: {},
            skillCD: {},
            charges: {},
            chainState: {},
            chainExpiry: {}, // { chainRoot: timestamp } — non-slot-1 chains expire after 5s
            eq: [],
            condState: {},
            fields: [],
            comboAccum: {},
            auras: [],
            boons: {},
            log: this.fastMode ? NOOP_ARRAY : [],
            steps: this.fastMode ? NOOP_ARRAY : [],
            allCondStacks: this.fastMode ? NOOP_ARRAY : [],
            _condMap: new Map(),
            conjureEquipped: null,
            conjurePickups: [],
            energy: eliteSpec === 'Catalyst' ? CATALYST_ENERGY_MAX : null,
            sphereActiveUntil: 0,
            sphereWindows: [],
            evokerElement: (eliteSpec === 'Evoker' && startEvokerElement) ? startEvokerElement : null,
            evokerCharges: eliteSpec === 'Evoker' ? 6 : 0,
            evokerEmpowered: 0,
            igniteStep: 0,
            igniteLastUse: -Infinity,
            weaveSelfUntil: 0,
            weaveSelfVisited: new Set(),
            perfectWeaveUntil: 0,
            aaCarryover: null,
            quicknessUntil: 0,
            alacrityUntil: 0,
            arcaneEchoUntil: 0,
            bountifulPowerStacks: 0,
            overloadAirBonusPending: false,
            sphereExpiry: { Fire: 0, Water: 0, Air: 0, Earth: 0 },
            sigilICD: {},
            sigilCritAccum: 0,
            sigilDoomPending: false,
            relicICD: {},
            relicBuffUntil: 0,
            activeRelic: activeRelic,
            relicProc: relicProc,
            relicAristocracyStacks: 0,
            relicAristocracyUntil: 0,
            relicAristocracyLastTrigger: null,
            relicBlightbringerCount: 0,
            relicBlightbringerTrackedCasts: new Set(),
            relicThiefStacks: 0,
            relicThiefUntil: 0,
            relicBloodstoneStacks: 0,
            relicBloodstoneStacksUntil: 0,
            relicBloodstoneExplosionUntil: 0,
            totalStrike: 0,
            totalCond: 0,
            condDamage: {},
            condStackSeconds: {},
            firstHitTime: null,
            lastHitTime: null,
            perSkill: {},
            _pendingPartialFill: null,
            eliteSpec,
            _hasEmpoweringFlame: this._hasTrait('Empowering Flame'),
            _hasBurningPrecision: this._hasTrait('Burning Precision'),
            _hasConjurer: this._hasTrait('Conjurer'),
            _hasSunspot: this._hasTrait('Sunspot'),
            _hasBurningRage: this._hasTrait('Burning Rage'),
            _hasSmothering: this._hasTrait('Smothering Auras'),
            _hasPowerOverwhelming: this._hasTrait('Power Overwhelming'),
            _hasPyroTraining: this._hasTrait("Pyromancer's Training"),
            _hasPersistingFlames: this._hasTrait('Persisting Flames'),
            _hasPyroPuissance: this._hasTrait("Pyromancer's Puissance"),
            _hasInferno: this._hasTrait('Inferno'),
            _hasZephyrsBoon: this._hasTrait("Zephyr's Boon"),
            _hasOneWithAir: this._hasTrait('One with Air'),
            _hasElectricDischarge: this._hasTrait('Electric Discharge'),
            _hasInscription: this._hasTrait('Inscription'),
            _hasRagingStorm: this._hasTrait('Raging Storm'),
            _hasStormsoul: this._hasTrait('Stormsoul'),
            _hasAeroTraining: this._hasTrait("Aeromancer's Training"),
            _hasBoltToHeart: this._hasTrait('Bolt to the Heart'),
            _hasFreshAir: this._hasTrait('Fresh Air'),
            _hasLightningRod: this._hasTrait('Lightning Rod'),
            _hasEarthsEmbrace: this._hasTrait("Earth's Embrace"),
            _hasSerratedStones: this._hasTrait('Serrated Stones'),
            _hasElementalShielding: this._hasTrait('Elemental Shielding'),
            _hasEarthenBlast: this._hasTrait('Earthen Blast'),
            _hasStrengthOfStone: this._hasTrait('Strength of Stone'),
            _hasRockSolid: this._hasTrait('Rock Solid'),
            _hasGeoTraining: this._hasTrait("Geomancer's Training"),
            _hasWrittenInStone: this._hasTrait('Written in Stone'),
            _hasSoothingIce: this._hasTrait('Soothing Ice'),
            _hasPiercingShards: this._hasTrait('Piercing Shards'),
            _hasFlowLikeWater: this._hasTrait('Flow like Water'),
            _hasAquamancerTraining: this._hasTrait("Aquamancer's Training"),
            _hasArcaneProwess: this._hasTrait('Arcane Prowess'),
            _hasArcanePrecision: this._hasTrait('Arcane Precision'),
            _hasRenewingStamina: this._hasTrait('Renewing Stamina'),
            _hasElemAttunement: this._hasTrait('Elemental Attunement'),
            _hasElemLockdown: this._hasTrait('Elemental Lockdown'),
            _hasElemEnchantment: this._hasTrait('Elemental Enchantment'),
            _hasArcaneLightning: this._hasTrait('Arcane Lightning'),
            _hasBountifulPower: this._hasTrait('Bountiful Power'),
            _hasGaleSong: this._hasTrait('Gale Song'),
            _hasLatentStamina: this._hasTrait('Latent Stamina'),
            _hasUnstableConduit: this._hasTrait('Unstable Conduit'),
            _hasTempestuousAria: this._hasTrait('Tempestuous Aria'),
            _hasHarmoniousConduit: this._hasTrait('Harmonious Conduit'),
            _hasInvigoratingTorrents: this._hasTrait('Invigorating Torrents'),
            _hasHardyConduit: this._hasTrait('Hardy Conduit'),
            _hasTranscendentTempest: this._hasTrait('Transcendent Tempest'),
            _hasLucidSingularity: this._hasTrait('Lucid Singularity'),
            _hasElementalBastion: this._hasTrait('Elemental Bastion'),
            _hasSuperiorElements: this._hasTrait('Superior Elements'),
            _hasElementalPursuit: this._hasTrait('Elemental Pursuit'),
            _hasWeaversProwess: this._hasTrait("Weaver's Prowess"),
            _hasSwiftRevenge: this._hasTrait('Swift Revenge'),
            _hasBolsteredElements: this._hasTrait('Bolstered Elements'),
            _hasElemPolyphony: this._hasTrait('Elemental Polyphony'),
            _hasElementsOfRage: this._hasTrait('Elements of Rage'),
            _hasInvigoratingStrikes: this._hasTrait('Invigorating Strikes'),
            _hasViciousEmpowerment: this._hasTrait('Vicious Empowerment'),
            _hasEnergizedElements: this._hasTrait('Energized Elements'),
            _hasElemEmpowermentTrait: this._hasTrait('Elemental Empowerment'),
            _hasEmpoweringAuras: this._hasTrait('Empowering Auras'),
            _hasSpectacularSphere: this._hasTrait('Spectacular Sphere'),
            _hasElemEpitome: this._hasTrait('Elemental Epitome'),
            _hasElemSynergy: this._hasTrait('Elemental Synergy'),
            _hasEmpoweredEmpowerment: this._hasTrait('Empowered Empowerment'),
            _hasSphereSpecialist: this._hasTrait('Sphere Specialist'),
            _hasFieryMight: this._hasTrait('Fiery Might'),
            _hasAltruisticAspect: this._hasTrait('Altruistic Aspect'),
            _hasEnhancedPotency: this._hasTrait('Enhanced Potency'),
            _hasFamiliarsProwess: this._hasTrait("Familiar's Prowess"),
            _hasFamiliarsFocus: this._hasTrait("Familiar's Focus"),
            _hasFamiliarsBlessing: this._hasTrait("Familiar's Blessing"),
            _hasElemDynamo: this._hasTrait('Elemental Dynamo'),
            _hasGalvanicEnchantment: this._hasTrait('Galvanic Enchantment'),
            _hasElemBalance: this._hasTrait('Elemental Balance'),
            _hasSpecializedElements: this._hasTrait('Specialized Elements'),
            signetFirePassiveLostUntil: 0,
            attTimeline: [{ t: 0, att: realStartAtt, att2: realStartAtt2 }],
            traitICD: {},
            traitBurnPrecAccum: 0,
            traitRagingStormAccum: 0,
            traitArcanePrecAccum: 0,
            traitRenewingStaminaAccum: 0,
            freshAirAccum: 0,
            freshAirResetAt: -Infinity, // time of last Fresh Air CD reset; swap logic respects this
            electricEnchantmentStacks: 0,
            elemBalanceCount: 0,
            elemBalanceActive: false,
            elemBalanceExpiry: 0,
            // Spear Etching chain: null = on Etching, 'lesser' = lesser available, 'full' = full available
            etchingState: {},        // { [etchingName]: 'lesser' | 'full' }
            etchingOtherCasts: {},   // { [etchingName]: count of any skill casts (excl. etching/lesser/full) since Etching }
            // Hammer orb system
            // hammerOrbs: { Fire: expiresAt|null, Water: ..., Air: ..., Earth: ... }
            // orbsGrantedInAtt: { Fire: Set<attunement>, ... } — which attunement unlocked each orb
            hammerOrbs: { Fire: null, Water: null, Air: null, Earth: null },
            hammerOrbGrantedBy: { Fire: null, Water: null, Air: null, Earth: null },
            hammerOrbLastCast: -Infinity, // last time any orb skill (incl. GF) was cast, for ICD
            hammerOrbsUsed: new Set(), // orb skill names cast since last GF; can't reuse same orb without GF
            // Pistol bullet system
            pistolBullets: startPistolBullets
                ? { Fire: !!startPistolBullets.Fire, Water: !!startPistolBullets.Water, Air: !!startPistolBullets.Air, Earth: !!startPistolBullets.Earth }
                : { Fire: false, Water: false, Air: false, Earth: false },
            _pistolBulletMapEntry: {}, // { Fire: condMap entry ref, ... } for removal on consume
            _frigidFlurryProcActive: false,
            _purblindingCDReduce: false,
            dazingDischargeUntil: 0,      // expiry of next-pistol-CD-33% buff (5s window)
            shatteringStoneHits: 0,       // remaining bleed-on-hit procs (max 3)
            shatteringStoneUntil: 0,      // 10s window expiry for shattering stone
            // Spear "next spear skill" buffs
            spearNextDmgBonus: false,     // Seethe: next non-slot-1 Spear skill +25% strike
            spearNextCdReduce: false,     // Ripple: next non-slot-1 Spear skill -33% recharge
            spearNextGuaranteedCrit: false, // Energize: next non-slot-1 Spear skill guaranteed crit
            spearNextCCHit: false,        // Harden: next non-slot-1 Spear skill first hit applies CC
            _mightCondDmgBonus: 30,
            _furyCritBonus: 25,
        };

        console.log('run() start, condMap Empowering Auras:', S._condMap.get('Empowering Auras'));

        // Flag-based trait disables for contribution analysis
        if (disTrait) {
            const TRAIT_FLAGS = {
                'Empowering Flame': '_hasEmpoweringFlame',
                'Power Overwhelming': '_hasPowerOverwhelming',
                "Aeromancer's Training": '_hasAeroTraining',
                'Raging Storm': '_hasRagingStorm',
                'Fresh Air': '_hasFreshAir',
                'Elemental Polyphony': '_hasElemPolyphony',
                'Elemental Empowerment': '_hasElemEmpowermentTrait',
                'Enhanced Potency': '_hasEnhancedPotency',
                'Superior Elements': '_hasSuperiorElements',
                "Weaver's Prowess": '_hasWeaversProwess',
                'Burning Precision': '_hasBurningPrecision',
                'Persisting Flames': '_hasPersistingFlames',
                "Pyromancer's Training": '_hasPyroTraining',
                'Stormsoul': '_hasStormsoul',
                'Bolt to the Heart': '_hasBoltToHeart',
                'Transcendent Tempest': '_hasTranscendentTempest',
                'Elements of Rage': '_hasElementsOfRage',
                'Swift Revenge': '_hasSwiftRevenge',
                'Empowering Auras': '_hasEmpoweringAuras',
                "Familiar's Prowess": '_hasFamiliarsProwess',
                'Fiery Might': '_hasFieryMight',
                'Lightning Rod': '_hasLightningRod',
                'Burning Rage': '_hasBurningRage',
                'Serrated Stones': '_hasSerratedStones',
                'Piercing Shards': '_hasPiercingShards',
                'Flow like Water': '_hasFlowLikeWater',
                'Arcane Precision': '_hasArcanePrecision',
                'Arcane Prowess': '_hasArcaneProwess',
                'Elemental Attunement': '_hasElemAttunement',
                'Elemental Lockdown': '_hasElemLockdown',
                'Arcane Lightning': '_hasArcaneLightning',
                'Bountiful Power': '_hasBountifulPower',
            };
            const flag = TRAIT_FLAGS[disTrait];
            if (flag) S[flag] = false;
        }
        if (S._hasEnhancedPotency && S.evokerElement === 'Fire') S._mightCondDmgBonus = 35;
        if (S._hasEnhancedPotency && S.evokerElement === 'Air') S._furyCritBonus = 40;
        if (S._hasSpecializedElements && S.evokerElement) {
            S.att = S.evokerElement;
            S.attTimeline = [{ t: 0, att: S.evokerElement, att2: realStartAtt2 }];
        }

        // PERMA_EXPIRY is a module-level constant (999999999)
        for (const [effect, val] of Object.entries(permaBoons)) {
            if (!val) continue;
            const count = typeof val === 'number' ? val : 1;
            for (let i = 0; i < count; i++) {
                this._pushCondStack(S, { t: 0, cond: effect, expiresAt: PERMA_EXPIRY, perma: true });
            }
            // Damaging conditions stay in allCondStacks only (display / "target has X" checks).
            // They must NOT go into condState — permanent stacks never expire, which causes
            // _procCondTick to reschedule indefinitely and hang the simulation.
        }
        if (permaBoons.Quickness) S.quicknessUntil = PERMA_EXPIRY;
        if (permaBoons.Alacrity) S.alacrityUntil = PERMA_EXPIRY;
        S.permaBoons = permaBoons;

        S._empPool = {};
        if (eliteSpec === 'Catalyst') {
            for (const stat of ['Power', 'Precision', 'Ferocity', 'Condition Damage', 'Expertise', 'Concentration']) {
                const s = a[stat] || {};
                S._empPool[stat] = (s.base || 0) + (s.gear || 0) + (s.runes || 0) + (s.infusions || 0) + (s.food || 0);
            }
        }
        if (S._hasElemEmpowermentTrait) {
            for (let i = 0; i < 3; i++) {
                this._pushCondStack(S, { t: 0, cond: 'Elemental Empowerment', expiresAt: PERMA_EXPIRY, perma: true });
            }
        }

        // Pre-set pistol bullets from startPistolBullets — add to condMap for plot tracking
        for (const el of ['Fire', 'Water', 'Air', 'Earth']) {
            if (S.pistolBullets[el]) {
                const condName = el === 'Water' ? 'Ice Bullet' : `${el} Bullet`;
                const entry = { t: 0, cond: condName, expiresAt: PERMA_EXPIRY };
                this._pushCondStack(S, entry);
                S._pistolBulletMapEntry[el] = entry;
            }
        }

        for (let ri = 0; ri < this.rotation.length; ri++) {
            const item = this.rotation[ri];

            // Orphaned concurrent item (no preceding non-instant anchor) — treat sequentially
            if (typeof item === 'object' && item.offset !== undefined) {
                S._ri = ri;
                this._step(S, item.name);
                continue;
            }

            const name = typeof item === 'string' ? item : item.name;

            // Collect consecutive concurrent items that should fire during this skill's cast
            const concurrents = [];
            let j = ri + 1;
            while (j < this.rotation.length) {
                const nxt = this.rotation[j];
                if (typeof nxt !== 'object' || nxt.offset === undefined) break;
                concurrents.push({ name: nxt.name, offset: nxt.offset, _ri: j });
                j++;
            }

            // Gap-fill: before casting this skill, channel the attunement's filler
            // auto-attack for however long its CD would have made us wait anyway.
            if (typeof item === 'object' && item.gapFill) {
                // Advance past any active cast first (mirrors what _step does)
                if (S.t < S.castUntil) S.t = S.castUntil;
                const targetSk = this._skillInContext(name, S);
                if (targetSk) {
                    const cdKey = this._cdKey(targetSk);
                    const cdReady = S.skillCD[cdKey] || 0;
                    const gapMs = Math.max(0, cdReady - S.t);
                    if (gapMs > 0) {
                        const fillerName = GAP_FILL_SKILLS[S.att] || null;
                        const fillerSk = fillerName ? this.skills.find(s => s.name === fillerName) : null;
                        if (fillerSk) this._fillGap(S, fillerSk, gapMs);
                    }
                }
            }

            S._ri = ri;
            this._step(S, name, false, concurrents);
            ri = j - 1; // skip already-processed concurrent items
        }
        const rotEnd = S.t;

        const skipMight = disabled === 'Might';
        const skipFury = disabled === 'Fury';
        const skipVuln = disabled === 'Vulnerability';

        const tgtHP = targetHP > 0 ? targetHP : Infinity;
        let deathTime = null;

        S.eq.sort((a, b) => a.time - b.time);
        while (S.eq.length > 0) {
            const ev = S.eq.shift();
            if (deathTime !== null && ev.time > deathTime) break;
            if (stopAtTime !== null && ev.time > stopAtTime) break;
            // Stop at end of last skill's cast animation in both kill and no-kill modes.
            // Trailing condition ticks beyond the rotation are excluded — if the target
            // didn't die during the active rotation, it survived.
            if (stopAtTime === null && ev.time > rotEnd) break;

            if ((ev.type === 'hit' && ev.dmg > 0) || ev.type === 'ctick') {
                if (S.firstHitTime === null) S.firstHitTime = ev.time;
                S.lastHitTime = ev.time;
            }

            if (ev.type === 'relic_activate') {
                const rp = RELIC_PROCS[ev.relic];
                if (rp && rp.effectDuration > 0) {
                    S.relicBuffUntil = Math.max(S.relicBuffUntil, ev.time + rp.effectDuration);
                }
                if (ev.applyEffects && rp) {
                    if (rp.conditions) {
                        for (const [c, v] of Object.entries(rp.conditions)) {
                            if (DAMAGING_CONDITIONS.has(c)) {
                                this._applyCondition(S, c, v.stacks, v.dur, ev.time, `Relic of ${ev.relic}`);
                            } else {
                                this._trackEffect(S, c, v.stacks, v.dur, ev.time);
                            }
                        }
                    }
                    if (rp.strikeCoeff) {
                        insertSorted(S.eq, {
                            time: ev.time, type: 'hit',
                            skill: `Relic of ${ev.relic}`, hitIdx: 1, sub: 1, totalSubs: 1,
                            dmg: rp.strikeCoeff, ws: rp.strikeWs,
                            isField: false, cc: false, conds: null,
                            isRelicProc: true, noCrit: false, att: S.att,
                        });
                    }
                }
                S.log.push({ t: ev.time, type: 'relic_proc', relic: ev.relic, skill: `Relic of ${ev.relic}` });
                S.steps.push({ skill: `Relic of ${ev.relic}`, start: ev.time, end: ev.time, att: S.att, type: 'relic_proc', ri: -1, icon: rp?.icon });
                continue;
            }

            const might = skipMight ? 0 : this._mightStacksAt(S, ev.time);
            const empMul = this._getEmpMul(S, ev.time);
            const condDmg = baseCondDmg + might * S._mightCondDmgBonus
                + Math.round((S._empPool?.['Condition Damage'] || 0) * empMul);
            const vulnMul = skipVuln ? 1 : 1 + this._vulnStacksAt(S, ev.time) * 0.01;

            if (ev.type === 'hit') {
                // Hammer orb ticks: skip if Grand Finale consumed the orb before this tick fires
                if (ev.hammerOrbElement) {
                    if (ev.hammerOrbElement === 'Dual') {
                        // Dual orb: skip if ALL orbs that could be associated are gone
                        // (any active orb still makes it valid — both were granted together,
                        // so if GF consumed both, both are null)
                        const dualEls = HAMMER_DUAL_ORB_SKILLS[ev.skill];
                        if (dualEls && dualEls.every(el => S.hammerOrbs[el] === null || S.hammerOrbs[el] <= ev.time)) {
                            S.log.push({ t: ev.time, type: 'skip', skill: ev.skill, reason: 'orb consumed by Grand Finale' });
                            continue;
                        }
                    } else {
                        if (S.hammerOrbs[ev.hammerOrbElement] === null || S.hammerOrbs[ev.hammerOrbElement] <= ev.time) {
                            S.log.push({ t: ev.time, type: 'skip', skill: ev.skill, reason: 'orb consumed by Grand Finale' });
                            continue;
                        }
                    }
                }

                const hitAtt = ev.att;
                const hitAtt2 = ev.att2 || null;
                // For Weaver, "attuned to X" means X is either primary or secondary attunement
                const empFlame = (S._hasEmpoweringFlame && hitAtt === 'Fire') ? 150 : 0;
                let powOvr = 0;
                if (S._hasPowerOverwhelming && might >= 10) powOvr = hitAtt === 'Fire' ? 300 : 150;
                let polyPow = 0, polyFer = 0;
                if (S._hasElemPolyphony) {
                    // Set deduplicates Fire/Fire → only +200 Power once
                    const atts = hitAtt2 !== null ? new Set([hitAtt, hitAtt2]) : new Set([hitAtt]);
                    if (atts.has('Fire')) polyPow = 200;
                    if (atts.has('Air')) polyFer = 200 / 15;
                }
                const empPow = Math.round((S._empPool?.Power || 0) * empMul);
                const empCritCh = (S._empPool?.Precision || 0) * empMul / 21;
                const empCritDmg = (S._empPool?.Ferocity || 0) * empMul / 15;

                // Conjured weapon flat stat bonuses (no conversions, active while equipped)
                const conjurePow = ev.conjure === 'Fiery Greatsword' ? 260 : 0;
                const conjureCondDmgBonus = ev.conjure === 'Fiery Greatsword' ? 180 : 0;
                const conjureFer = ev.conjure === 'Lightning Hammer' ? 75 / 15 : 0;
                const conjurePrec = ev.conjure === 'Lightning Hammer' ? 180 / 21 : 0;
                const hitCondDmg = condDmg + conjureCondDmgBonus;

                const power = basePower + might * 30 + empFlame + powOvr + polyPow + empPow + conjurePow;

                const fury = skipFury ? false : this._hasFuryAt(S, ev.time);
                const ragingFerocity = (S._hasRagingStorm && fury) ? 12 : 0;
                const aeroFerocity = (S._hasAeroTraining && hitAtt === 'Air') ? 10 : 0;
                const freshAirActive = S._hasFreshAir
                    && this._effectStacksAt(S, 'Fresh Air', ev.time) > 0;
                const freshAirFerocity = freshAirActive ? (250 / 15) : 0;
                const zapPassiveFer = (S.evokerElement === 'Air' && fury) ? 75 / 15 : 0;
                const arcaneLightningFer = (S._hasArcaneLightning
                    && this._effectStacksAt(S, 'Arcane Lightning', ev.time) > 0) ? 150 / 15 : 0;
                const effectiveCritDmg = critDmg + ragingFerocity + aeroFerocity
                    + freshAirFerocity + polyFer + empCritDmg + conjureFer + zapPassiveFer + arcaneLightningFer + (ev.bonusCritDmg || 0);
                const signetFireLost = S.signetFirePassiveLostUntil > ev.time ? (180 / 21) : 0;
                const supElemCrit = (S._hasSuperiorElements
                    && this._effectStacksAt(S, 'Weakness', ev.time) > 0) ? 15 : 0;
                const hammerFireOrbUp = this._effectStacksAt(S, 'Hammer Orb Fire', ev.time) > 0;
                const hammerAirOrbUp = this._effectStacksAt(S, 'Hammer Orb Air', ev.time) > 0;
                const hammerAirCritBonus = hammerAirOrbUp ? 15 : 0;
                const cc = ev.noCrit ? 0 : (ev.spearForceCrit ? 100 : Math.min(
                    baseCritCh + (fury ? S._furyCritBonus : 0) - signetFireLost + supElemCrit + empCritCh + conjurePrec + hammerAirCritBonus, 100));
                const critMult = expectedCritMultiplier(cc, effectiveCritDmg);
                const zapBuff = S.evokerElement === 'Air' && this._effectStacksAt(S, 'Zap Buff', ev.time) > 0;
                const relicStrikeMul = this._getRelicStrikeMul(S, ev, tgtHP);

                const pfStacks = S._hasPersistingFlames
                    ? Math.min(this._effectStacksAt(S, 'Persisting Flames', ev.time), 5) : 0;
                const tempAriaUp = S._hasTempestuousAria
                    && this._effectStacksAt(S, 'Tempestuous Aria', ev.time) > 0;
                const transcTempUp = S._hasTranscendentTempest
                    && this._effectStacksAt(S, 'Transcendent Tempest', ev.time) > 0;
                const elemRageUp = S._hasElementsOfRage
                    && this._effectStacksAt(S, 'Elements of Rage', ev.time) > 0;
                const hasSpeed = S._hasSwiftRevenge
                    && (this._effectStacksAt(S, 'Swiftness', ev.time) > 0
                        || this._effectStacksAt(S, 'Superspeed', ev.time) > 0);
                const weaversProwessUp = S._hasWeaversProwess
                    && this._effectStacksAt(S, "Weaver's Prowess", ev.time) > 0;
                const empAurasStacks = S._hasEmpoweringAuras
                    ? Math.min(this._effectStacksAt(S, 'Empowering Auras', ev.time), 5) : 0;
                const famProwessUp = S._hasFamiliarsProwess
                    && this._effectStacksAt(S, "Familiar's Prowess", ev.time) > 0;
                const fpPct = famProwessUp ? (S._hasFamiliarsFocus ? 0.10 : 0.05) : 0;
                const fpStrike = (famProwessUp && S.evokerElement === 'Air') ? fpPct : 0;
                const fpCond = (famProwessUp && S.evokerElement === 'Fire') ? fpPct : 0;
                const relentlessFireUp = this._effectStacksAt(S, 'Relentless Fire', ev.time) > 0;
                const bountifulPowerUp = S._hasBountifulPower
                    && this._effectStacksAt(S, 'Bountiful Power Active', ev.time) > 0;
                const wsFireBonus = (S.weaveSelfVisited.has('Fire') && ev.time < S.weaveSelfUntil)
                    || ev.time < S.perfectWeaveUntil;
                const wsAirBonus = (S.weaveSelfVisited.has('Air') && ev.time < S.weaveSelfUntil)
                    || ev.time < S.perfectWeaveUntil;
                const addStrike = pfStacks * 0.02
                    + (tempAriaUp ? 0.10 : 0)
                    + (transcTempUp ? 0.25 : 0)
                    + (elemRageUp ? 0.07 : 0)   // strike bonus unchanged by patch (only cond was reduced)
                    + (hasSpeed ? 0.07 : 0)
                    + empAurasStacks * 0.01
                    + (relentlessFireUp ? 0.10 : 0)
                    + (bountifulPowerUp ? 0.20 : 0)
                    + (wsAirBonus ? 0.10 : 0)
                    + fpStrike
                    + (hammerFireOrbUp ? 0.05 : 0);
                const addCond = (tempAriaUp ? 0.05 : 0)
                    + (transcTempUp ? 0.20 : 0)
                    + (elemRageUp ? 0.05 : 0)
                    + empAurasStacks * 0.01
                    + (wsFireBonus ? 0.20 : 0)
                    + fpCond
                    + (hammerFireOrbUp ? 0.05 : 0);
                const baseStrike = (1 + sigilMuls.strikeAdd + addStrike) * sigilMuls.strikeMul;
                const baseCond = (1 + sigilMuls.condAdd + addCond) * sigilMuls.condMul;

                const targetHasBurning = (S._hasPyroTraining || S._hasFieryMight)
                    ? (
                        (S.condState['Burning']?.stacks.some(
                            s => s.t <= ev.time && s.expiresAt > ev.time) || false)
                        || !!(S.permaBoons?.Burning)
                    ) : false;
                const pyroMul = (S._hasPyroTraining && targetHasBurning) ? 1.07 : 1;
                const fieryMightMul = (S._hasFieryMight && targetHasBurning) ? 1.05 : 1;
                const hasBleeding = S._hasSerratedStones
                    && (
                        (S.condState['Bleeding']?.stacks.some(
                            s => s.t <= ev.time && s.expiresAt > ev.time) || false)
                        || !!(S.permaBoons?.Bleeding)
                    );
                const serratedMul = hasBleeding ? 1.05 : 1;
                const stormsoulMul = S._hasStormsoul ? 1.07 : 1;
                const flowLikeWaterMul = S._hasFlowLikeWater ? 1.10 : 1;
                const boltMul = (S._hasBoltToHeart && tgtHP < Infinity
                    && (S.totalStrike + S.totalCond) >= tgtHP * 0.5) ? 1.20 : 1;

                const zapMul = zapBuff ? 1.03 : 1;
                const targetHasVuln = this._vulnStacksAt(S, ev.time) > 0;
                const piercingShardsMul = (S._hasPiercingShards && targetHasVuln)
                    ? (hitAtt === 'Water' ? 1.14 : 1.07) : 1;
                const seetheMul = ev.spearDmgBonus ? 1.25 : 1;
                const strikeMul = baseStrike * vulnMul * relicStrikeMul
                    * pyroMul * fieryMightMul * serratedMul * stormsoulMul * flowLikeWaterMul * boltMul * zapMul * piercingShardsMul * seetheMul;
                const cMul = baseCond * vulnMul;

                // Primordial Stance: apply conditions based on attunements at hit time (not cast time)
                let procEv = ev;
                if (ev.skill.startsWith('Primordial Stance')) {
                    procEv = { ...ev, conds: null };
                    const psAtt1 = this._attAt(S, ev.time);
                    const psAtt2 = this._att2At(S, ev.time);
                    this._applyPrimordialStance(S, psAtt1, psAtt2, ev.time);
                }
                // Harden: first hit of buffed Spear skill applies CC
                if (ev.spearCCHit && procEv === ev) procEv = { ...ev, cc: true };
                else if (ev.spearCCHit) procEv = { ...procEv, cc: true };
                this._procHit(S, procEv, power, hitCondDmg, critMult, strikeMul, cMul);

                // Attach diagnostic breakdown to the log entry that _procHit just pushed
                const hitLog = S.log[S.log.length - 1];
                if (hitLog && hitLog.type === 'hit') {
                    hitLog.diag = {
                        power, ws: ev.ws, condDmg: hitCondDmg,
                        critCh: cc, critDmg: effectiveCritDmg, critMul: critMult,
                        might, fury, vulnStacks: skipVuln ? 0 : this._vulnStacksAt(S, ev.time), vulnMul,
                        strikeMul, baseStrike, addStrike,
                        pyroMul, stormMul: stormsoulMul, boltMul, serratedMul, fieryMightMul,
                        piercingShardsMul, flowLikeWaterMul, zapMul, relicStrikeMul,
                        condMul: cMul,
                        att: hitAtt, att2: hitAtt2,
                        empFlame, powOvr: powOvr, polyPow, polyFer,
                    };
                }

                if (!ev.isSigilProc && !ev.isRelicProc && !ev.isTraitProc && !ev.isField && ev.dmg > 0 && ev.ws > 0) {
                    this._checkOnCritSigils(S, ev.time, cc);
                    if (S._hasBurningPrecision) this._checkBurningPrecision(S, ev.time, cc);
                    if (S._hasRagingStorm) this._checkRagingStorm(S, ev.time, cc);
                    if (S._hasFreshAir) this._checkFreshAir(S, ev.time, cc);
                    if (S._hasArcanePrecision) this._checkArcanePrecision(S, ev.time, cc, hitAtt);
                    if (S._hasRenewingStamina) this._checkRenewingStamina(S, ev.time, cc);
                }

                if (S._hasLightningRod && ev.cc && !ev.isTraitProc && !ev.isSigilProc && !ev.isRelicProc) {
                    this._triggerLightningRod(S, ev.time);
                }

                if (S._hasStrengthOfStone && !ev.isTraitProc && !ev.isSigilProc && !ev.isRelicProc
                    && this._effectStacksAt(S, 'Immobilize', ev.time) > 0
                    && ev.time >= (S.traitICD['StrengthOfStone'] || 0)) {
                    S.traitICD['StrengthOfStone'] = ev.time + 3000;
                    this._applyCondition(S, 'Bleeding', 3, 10, ev.time, 'Strength of Stone');
                    S.log.push({ t: ev.time, type: 'trait_proc', trait: 'Strength of Stone', skill: 'Strength of Stone' });
                }

                if (S._hasLucidSingularity && ev.skill.startsWith('Overload ')) {
                    if (ev.hitIdx >= 1 && ev.hitIdx <= 4) this._trackEffect(S, 'Alacrity', 1, 1, ev.time);
                    else if (ev.hitIdx === 5) this._trackEffect(S, 'Alacrity', 1, 4.5, ev.time);
                }

                if (S._hasViciousEmpowerment && !ev.isSigilProc && !ev.isRelicProc && !ev.isTraitProc
                    && ev.cc && ev.time >= (S.traitICD['ViciousEmp'] || 0)) {
                    S.traitICD['ViciousEmp'] = ev.time + 250;
                    this._grantElemEmpowerment(S, 2, ev.time, 'Vicious Empowerment');
                    this._trackEffect(S, 'Might', 2, 10, ev.time);
                }

                if (S._hasElemLockdown && ev.cc && !ev.isTraitProc && !ev.isSigilProc && !ev.isRelicProc
                    && ev.time >= (S.traitICD['ElemLockdown'] || 0)) {
                    S.traitICD['ElemLockdown'] = ev.time + 1000;
                    if (hitAtt === 'Fire') this._trackEffect(S, 'Might', 5, 5, ev.time);
                    else if (hitAtt === 'Water') this._trackEffect(S, 'Regeneration', 1, 10, ev.time);
                    else if (hitAtt === 'Air') this._trackEffect(S, 'Fury', 1, 5, ev.time);
                    else if (hitAtt === 'Earth') this._trackEffect(S, 'Protection', 1, 4, ev.time);
                }

                if (!ev.isSigilProc && !ev.isRelicProc && !ev.isTraitProc) {
                    this._checkCombo(S, ev);
                }

                // Overload Air: first real hit after cast triggers the bonus strike
                if (S.overloadAirBonusPending
                    && !ev.isSigilProc && !ev.isRelicProc && !ev.isTraitProc
                    && !ev.isField && ev.dmg > 0 && ev.ws > 0) {
                    S.overloadAirBonusPending = false;
                    insertSorted(S.eq, {
                        time: ev.time, type: 'hit',
                        skill: 'Overload Air Bonus', hitIdx: 1, sub: 1, totalSubs: 1,
                        dmg: 1.32, ws: 690.5,
                        isField: false, cc: false, conds: null,
                        noCrit: true, att: ev.att, isTraitProc: true,
                    });
                    S.log.push({ t: ev.time, type: 'skill_proc', skill: 'Overload Air Bonus' });
                }

                // Shattering Ice buff: proc an additional strike with 1s ICD
                if (this._effectStacksAt(S, 'Shattering Ice', ev.time) > 0
                    && !ev.isSigilProc && !ev.isRelicProc && !ev.isTraitProc
                    && !ev.isField && ev.dmg > 0 && ev.ws > 0
                    && ev.time >= (S.traitICD['ShatteringIce'] || 0)) {
                    S.traitICD['ShatteringIce'] = ev.time + 1000;
                    insertSorted(S.eq, {
                        time: ev.time, type: 'hit',
                        skill: 'Shattering Ice Proc', hitIdx: 1, sub: 1, totalSubs: 1,
                        dmg: 0.6, ws: 690.5,
                        isField: false, cc: false,
                        conds: { Chilled: { stacks: 1, duration: 1 } },
                        noCrit: false, att: ev.att, isTraitProc: true,
                    });
                    S.log.push({ t: ev.time, type: 'skill_proc', skill: 'Shattering Ice Proc' });
                }

                if (S.sigilDoomPending && !ev.isSigilProc && !ev.isRelicProc && !ev.isTraitProc && !ev.isField && ev.dmg > 0) {
                    const dp = SIGIL_PROCS.Doom;
                    this._applyCondition(S, dp.cond, dp.stacks, dp.dur, ev.time, 'Sigil of Doom');
                    S.sigilDoomPending = false;
                    S.log.push({ t: ev.time, type: 'sigil_proc', sigil: 'Doom', skill: 'Sigil of Doom' });
                    S.steps.push({ skill: 'Sigil of Doom', start: ev.time, end: ev.time, att: S.att, type: 'sigil_proc', ri: -1, icon: dp.icon });
                }

                if (S.electricEnchantmentStacks > 0
                    && !ev.isSigilProc && !ev.isRelicProc && !ev.isTraitProc
                    && !ev.isField && ev.dmg > 0 && ev.ws > 0) {
                    S.electricEnchantmentStacks--;
                    insertSorted(S.eq, {
                        time: ev.time, type: 'hit',
                        skill: 'Electric Enchantment', hitIdx: 1, sub: 1, totalSubs: 1,
                        dmg: 0.4, ws: 690.5,
                        isField: false, cc: false,
                        conds: { Burning: { stacks: 1, duration: 1.5 } },
                        isTraitProc: true, noCrit: false, att: S.att,
                    });
                    S.log.push({ t: ev.time, type: 'trait_proc', trait: 'Electric Enchantment' });
                    S.steps.push({
                        skill: 'Electric Enchantment', start: ev.time, end: ev.time,
                        att: S.att, type: 'trait_proc', ri: -1,
                        icon: 'https://wiki.guildwars2.com/images/7/7b/Hare%27s_Agility.png',
                    });
                }

                // Frigid Flurry (Ice bullet consumed): each hit has 20% Projectile finisher
                if (ev.frigidFlurryProc && !ev.isSigilProc && !ev.isRelicProc && !ev.isTraitProc) {
                    this._checkCombo(S, { ...ev, finType: 'Projectile', finVal: 0.2 });
                }

                // Shattering Stone (Earth bullet consumed): next 3 hits within 10s apply Bleed 5s
                if (S.shatteringStoneHits > 0 && ev.time <= S.shatteringStoneUntil
                    && !ev.isSigilProc && !ev.isRelicProc && !ev.isTraitProc && !ev.isField
                    && ev.dmg > 0 && ev.ws > 0) {
                    S.shatteringStoneHits--;
                    this._applyCondition(S, 'Bleeding', 1, 5, ev.time, 'Shattering Stone');
                    if (S.shatteringStoneHits <= 0) S.shatteringStoneUntil = 0;
                    S.log.push({ t: ev.time, type: 'skill_proc', skill: 'Shattering Stone', detail: `Bleed proc (${S.shatteringStoneHits} left)` });
                }

                if (activeRelic && !ev.isSigilProc && !ev.isRelicProc && !ev.isTraitProc) {
                    this._checkRelicOnHit(S, ev);
                }
            } else if (ev.type === 'ctick') {
                let infernoPower = 0;
                if (S._hasInferno && ev.cond === 'Burning') {
                    const tickAtt = this._attAt(S, ev.time);
                    const empF = (S._hasEmpoweringFlame && tickAtt === 'Fire') ? 150 : 0;
                    let powO = 0;
                    if (S._hasPowerOverwhelming && might >= 10) powO = tickAtt === 'Fire' ? 300 : 150;
                    let polyP = 0;
                    if (S._hasElemPolyphony) {
                        const tickAtt2 = this._att2At(S, ev.time);
                        const atts = tickAtt2 !== null ? new Set([tickAtt, tickAtt2]) : new Set([tickAtt]);
                        if (atts.has('Fire')) polyP = 200;
                    }
                    const empP = Math.round((S._empPool?.Power || 0) * empMul);
                    infernoPower = basePower + might * 30 + empF + powO + polyP + empP;
                }
                const tickTempAria = S._hasTempestuousAria
                    && this._effectStacksAt(S, 'Tempestuous Aria', ev.time) > 0 ? 0.05 : 0;
                const tickTranscT = S._hasTranscendentTempest
                    && this._effectStacksAt(S, 'Transcendent Tempest', ev.time) > 0 ? 0.20 : 0;
                const tickElemRage = S._hasElementsOfRage
                    && this._effectStacksAt(S, 'Elements of Rage', ev.time) > 0 ? 0.05 : 0;
                const tickEmpAuras = S._hasEmpoweringAuras
                    ? Math.min(this._effectStacksAt(S, 'Empowering Auras', ev.time), 5) * 0.01 : 0;
                const tickFP = (S._hasFamiliarsProwess && S.evokerElement === 'Fire'
                    && this._effectStacksAt(S, "Familiar's Prowess", ev.time) > 0)
                    ? (S._hasFamiliarsFocus ? 0.10 : 0.05) : 0;
                const tickCondMul = (1 + sigilMuls.condAdd + tickTempAria + tickTranscT
                    + tickElemRage + tickEmpAuras + tickFP) * sigilMuls.condMul * vulnMul;
                const tickDiag = this.fastMode ? null : {
                    condDmg, infernoPower, condMul: tickCondMul,
                    sigilCondAdd: sigilMuls.condAdd, sigilCondMul: sigilMuls.condMul,
                    tempAria: tickTempAria, transcTemp: tickTranscT,
                    elemRage: tickElemRage, empAuras: tickEmpAuras, famProwess: tickFP,
                    vulnStacks: skipVuln ? 0 : this._vulnStacksAt(S, ev.time), vulnMul,
                    might,
                };
                this._procCondTick(S, ev, condDmg, tickCondMul, infernoPower, tickDiag);
            }

            if (deathTime === null && (S.totalStrike + S.totalCond) >= tgtHP) {
                deathTime = ev.time;
            }
        }

        const total = S.totalStrike + S.totalCond;
        // Use actual total damage (not the fixed tgtHP cap) so that builds with higher
        // effective DPS show measurably higher numbers even when they kill at the same
        // rotation hit.  In-game DPS meters count real damage, not boss max-HP.
        const effectiveDmg = total;
        // DPS window: [firstHitTime, effectiveEnd]
        //   start  — first damaging hit (mirrors GW2 golem benchmark; excludes pre-cast time)
        //   end    — kill mode: timestamp of the killing hit/tick (overkill damage included)
        //            no-kill:   end of the last skill's cast animation (rotEnd)
        const dpsStart = S.firstHitTime ?? 0;
        const effectiveEnd = deathTime !== null ? deathTime : rotEnd;
        const dpsWindowMs = effectiveEnd - dpsStart;

        if (this.fastMode) {
            this.results = { dps: dpsWindowMs > 0 ? effectiveDmg / (dpsWindowMs / 1000) : 0 };
            return;
        }

        if (S.log.sort) S.log.sort((a, b) => a.t - b.t);

        this.results = {
            rotationMs: rotEnd,
            dpsWindowMs,
            totalDamage: effectiveDmg,
            totalStrike: S.totalStrike,
            totalCondition: S.totalCond,
            dps: dpsWindowMs > 0 ? effectiveDmg / (dpsWindowMs / 1000) : 0,
            deathTime,
            targetHP: targetHP > 0 ? targetHP : null,
            perSkill: S.perSkill,
            condDamage: S.condDamage,
            condStackSeconds: S.condStackSeconds,
            condAvgStacks: (() => {
                const windowSec = dpsWindowMs / 1000;
                if (windowSec <= 0) return {};
                const avg = {};
                for (const [c, ss] of Object.entries(S.condStackSeconds)) {
                    avg[c] = ss / windowSec;
                }
                return avg;
            })(),
            log: S.log,
            steps: S.steps,
            allCondStacks: S.allCondStacks,
            endState: {
                time: rotEnd,
                att: S.att,
                att2: S.att2,
                attEnteredAt: S.attEnteredAt,
                attCD: { ...S.attCD },
                skillCD: { ...S.skillCD },
                charges: JSON.parse(JSON.stringify(S.charges)),
                chainState: { ...S.chainState },
                chainExpiry: { ...S.chainExpiry },
                conjureEquipped: S.conjureEquipped,
                conjurePickups: S.conjurePickups.filter(p => p.expiresAt > rotEnd).map(p => ({ ...p })),
                eliteSpec: S.eliteSpec,
                energy: S.energy,
                sphereActiveUntil: S.sphereActiveUntil,
                sphereWindows: S.sphereWindows.filter(w => w.end > rotEnd).map(w => ({ ...w })),
                evokerElement: S.evokerElement,
                evokerCharges: S.evokerCharges,
                evokerEmpowered: S.evokerEmpowered,
                evokerMaxCharges: S._hasSpecializedElements ? 4 : 6,
                aaCarryover: S.aaCarryover ? { ...S.aaCarryover } : null,
                quicknessUntil: S.quicknessUntil,
                alacrityUntil: S.alacrityUntil,
                weaveSelfUntil: S.weaveSelfUntil,
                weaveSelfVisited: [...S.weaveSelfVisited],
                perfectWeaveUntil: S.perfectWeaveUntil,
                // weaversProwessUntil tracked via allCondStacks — no snapshot needed
                permaBoons: S.permaBoons || {},
                _hasTranscendentTempest: S._hasTranscendentTempest,
                etchingState: { ...S.etchingState },
                etchingOtherCasts: { ...S.etchingOtherCasts },
                hammerOrbs: { ...S.hammerOrbs },
                hammerOrbGrantedBy: { ...S.hammerOrbGrantedBy },
                hammerOrbLastCast: S.hammerOrbLastCast,
                hammerOrbsUsed: [...S.hammerOrbsUsed],
                pistolBullets: { ...S.pistolBullets },
                dazingDischargeUntil: S.dazingDischargeUntil,
                shatteringStoneHits: S.shatteringStoneHits,
                shatteringStoneUntil: S.shatteringStoneUntil,
            },
        };

        for (const [an, v] of Object.entries(statAdj)) {
            a[an].final += v;
        }

        return this.results;
    }

    computeContributions(startAtt, startAtt2, evokerElement, permaBoons, targetHP = 0, startPistolBullets = null) {
        // Full run WITH target HP — used for the displayed DPS/kill-time results.
        this.run(startAtt, startAtt2, evokerElement, permaBoons, null, targetHP, null, startPistolBullets);
        const fullResults = this.results;

        // When the target actually dies, run comparison sims with the same targetHP and cap
        // each one at the baseline's death time.  This keeps all DPS windows identical and
        // allows HP-gated mechanics (Bolt to the Heart, Eagle relic) to fire correctly.
        // When there is no kill (infinite dummy), fall back to the old no-cap approach.
        let fullDps, baselineWindowSec, baselineStop;
        if (targetHP > 0 && fullResults.deathTime !== null) {
            fullDps = fullResults.dps;
            baselineWindowSec = fullResults.dpsWindowMs / 1000;
            baselineStop = fullResults.deathTime;
        } else {
            // No kill — run a separate no-cap baseline so the window is independent of
            // modifier effects on kill time.
            this.run(startAtt, startAtt2, evokerElement, permaBoons, null, 0, null, startPistolBullets);
            fullDps = this.results.dps;
            baselineWindowSec = null;
            baselineStop = null;
        }

        const modifiers = [];
        const ht = name => this.activeTraitNames.has(name);

        if (permaBoons.Might || fullResults.allCondStacks.some(s => s.cond === 'Might'))
            modifiers.push({ id: 'Might', name: 'Might' });
        if (permaBoons.Fury || fullResults.allCondStacks.some(s => s.cond === 'Fury'))
            modifiers.push({ id: 'Fury', name: 'Fury' });
        if (permaBoons.Vulnerability || fullResults.allCondStacks.some(s => s.cond === 'Vulnerability'))
            modifiers.push({ id: 'Vulnerability', name: 'Vulnerability' });

        for (const name of (this.attributes.sigils || [])) {
            const s = this.sigils[name];
            const hasStatEffect = s && (s.strikeDamageM || s.strikeDamageA
                || s.conditionDamageM || s.conditionDamageA
                || s.criticalChance || s.conditionDuration
                || s.bleedingDuration || s.burningDuration
                || s.poisonDuration || s.tormentDuration);
            const hasProcEffect = !!SIGIL_PROCS[name];
            if (hasStatEffect || hasProcEffect)
                modifiers.push({ id: `Sigil:${name}`, name: `Sigil of ${name}` });
        }

        const relic = this.attributes.relic;
        if (relic && RELIC_PROCS[relic])
            modifiers.push({ id: `Relic:${relic}`, name: `Relic of ${relic}` });

        // ── Trait contributions ──
        // Stat-based (flat bonus subtracted from attributes before running)
        if (ht('Burning Rage')) modifiers.push({ id: 'Trait:Burning Rage', name: 'Burning Rage' });
        if (ht("Zephyr's Speed")) modifiers.push({ id: "Trait:Zephyr's Speed", name: "Zephyr's Speed" });
        if (ht('Gathered Focus')) modifiers.push({ id: 'Trait:Gathered Focus', name: 'Gathered Focus' });
        if (ht('Elemental Enchantment')) modifiers.push({ id: 'Trait:Elemental Enchantment', name: 'Elemental Enchantment' });
        if (ht('Serrated Stones')) modifiers.push({ id: 'Trait:Serrated Stones', name: 'Serrated Stones' });
        // Per-hit power / ferocity bonuses (flag-based)
        if (ht("Aeromancer's Training")) modifiers.push({ id: "Trait:Aeromancer's Training", name: "Aeromancer's Training" });
        if (ht('Empowering Flame')) modifiers.push({ id: 'Trait:Empowering Flame', name: 'Empowering Flame' });
        if (ht('Power Overwhelming')) modifiers.push({ id: 'Trait:Power Overwhelming', name: 'Power Overwhelming' });
        if (ht('Raging Storm')) modifiers.push({ id: 'Trait:Raging Storm', name: 'Raging Storm' });
        if (ht('Fresh Air')) modifiers.push({ id: 'Trait:Fresh Air', name: 'Fresh Air' });
        if (ht('Elemental Polyphony')) modifiers.push({ id: 'Trait:Elemental Polyphony', name: 'Elemental Polyphony' });
        if (ht('Elemental Empowerment')) modifiers.push({ id: 'Trait:Elemental Empowerment', name: 'Elemental Empowerment' });
        if (ht('Enhanced Potency') && (permaBoons.Fury || permaBoons.Might))
            modifiers.push({ id: 'Trait:Enhanced Potency', name: 'Enhanced Potency' });
        if (ht('Superior Elements')) modifiers.push({ id: 'Trait:Superior Elements', name: 'Superior Elements' });
        if (ht('Burning Precision')) modifiers.push({ id: 'Trait:Burning Precision', name: 'Burning Precision' });
        // Weaver's Prowess no longer grants any damage bonus (patch removed cond dmg)
        // Damage multiplier traits (flag-based)
        if (ht('Persisting Flames')) modifiers.push({ id: 'Trait:Persisting Flames', name: 'Persisting Flames' });
        if (ht("Pyromancer's Training")) modifiers.push({ id: "Trait:Pyromancer's Training", name: "Pyromancer's Training" });
        if (ht('Fiery Might')) modifiers.push({ id: 'Trait:Fiery Might', name: 'Fiery Might' });
        if (ht('Stormsoul')) modifiers.push({ id: 'Trait:Stormsoul', name: 'Stormsoul' });
        if (ht('Bolt to the Heart')) modifiers.push({ id: 'Trait:Bolt to the Heart', name: 'Bolt to the Heart' });
        if (ht('Transcendent Tempest')) modifiers.push({ id: 'Trait:Transcendent Tempest', name: 'Transcendent Tempest' });
        if (ht('Elements of Rage')) modifiers.push({ id: 'Trait:Elements of Rage', name: 'Elements of Rage (proc)' });
        if (ht('Swift Revenge')) modifiers.push({ id: 'Trait:Swift Revenge', name: 'Swift Revenge' });
        if (ht('Empowering Auras')) modifiers.push({ id: 'Trait:Empowering Auras', name: 'Empowering Auras' });
        if (ht("Familiar's Prowess")) modifiers.push({ id: "Trait:Familiar's Prowess", name: "Familiar's Prowess" });
        if (ht('Lightning Rod')) modifiers.push({ id: 'Trait:Lightning Rod', name: 'Lightning Rod' });
        if (ht('Piercing Shards')) modifiers.push({ id: 'Trait:Piercing Shards', name: 'Piercing Shards' });
        if (ht('Flow like Water')) modifiers.push({ id: 'Trait:Flow like Water', name: 'Flow like Water' });
        if (ht('Arcane Precision')) modifiers.push({ id: 'Trait:Arcane Precision', name: 'Arcane Precision' });
        if (ht('Arcane Prowess')) modifiers.push({ id: 'Trait:Arcane Prowess', name: 'Arcane Prowess' });
        if (ht('Elemental Attunement')) modifiers.push({ id: 'Trait:Elemental Attunement', name: 'Elemental Attunement' });
        if (ht('Elemental Lockdown')) modifiers.push({ id: 'Trait:Elemental Lockdown', name: 'Elemental Lockdown' });
        if (ht('Arcane Lightning')) modifiers.push({ id: 'Trait:Arcane Lightning', name: 'Arcane Lightning' });
        if (ht('Bountiful Power')) modifiers.push({ id: 'Trait:Bountiful Power', name: 'Bountiful Power' });

        // When a kill occurred, run an extra infinite-HP pass to get a clean baseline for
        // all modifiers that don't need finite HP.  Using the finite-HP baseline for every
        // modifier inflates contributions because removing a buff also shrinks Bolt to the
        // Heart's window (or any other HP-gated mechanic), double-counting the interaction.
        // Bolt to the Heart itself is the exception — it must use the finite-HP window so
        // it actually fires and produces a non-zero contribution.
        let fullDpsForContrib = fullDps;
        if (baselineStop !== null) {
            this.run(startAtt, startAtt2, evokerElement, permaBoons, null, 0, null, startPistolBullets);
            fullDpsForContrib = this.results.dps;
        }

        const contributions = [];
        for (const mod of modifiers) {
            const isBolt = mod.id === 'Trait:Bolt to the Heart';
            if (baselineStop !== null && isBolt) {
                // Bolt to the Heart: must use finite-HP so it actually fires.
                // Stop at baseline kill time so the window is fixed.
                this.run(startAtt, startAtt2, evokerElement, permaBoons, mod.id, targetHP, baselineStop, startPistolBullets);
                const withoutDps = this.results.totalDamage / baselineWindowSec;
                const increase = fullDps - withoutDps;
                contributions.push({
                    id: mod.id,
                    name: mod.name,
                    dpsIncrease: increase,
                    pctIncrease: withoutDps > 0 ? (increase / withoutDps) * 100 : 0,
                });
            } else {
                // All other mods (and infinite-HP mode): compare using infinite-HP runs so
                // each modifier's contribution is isolated and cannot interact with Bolt.
                this.run(startAtt, startAtt2, evokerElement, permaBoons, mod.id, 0, null, startPistolBullets);
                const withoutDps = this.results.dps;
                const increase = fullDpsForContrib - withoutDps;
                contributions.push({
                    id: mod.id,
                    name: mod.name,
                    dpsIncrease: increase,
                    pctIncrease: withoutDps > 0 ? (increase / withoutDps) * 100 : 0,
                });
            }
        }

        contributions.sort((a, b) => b.dpsIncrease - a.dpsIncrease);

        this.results = fullResults;
        this.results.contributions = contributions;
        return this.results;
    }

    _step(S, name, skipCastUntil = false, concurrents = []) {
        if (!skipCastUntil && S.t < S.castUntil) S.t = S.castUntil;

        if (name === '__drop_bundle') {
            if (S.conjureEquipped) {
                S.log.push({ t: S.t, type: 'drop', weapon: S.conjureEquipped });
                S.steps.push({ skill: name, start: S.t, end: S.t, att: S.att, type: 'drop', ri: S._ri });
                S.conjureEquipped = null;
                this._procOnSwapSigils(S, S.t);
            }
            return;
        }
        if (name.startsWith('__pickup_')) {
            const weapon = name.slice(9);
            const pi = S.conjurePickups.findIndex(p => p.weapon === weapon && S.t <= p.expiresAt);
            if (pi !== -1) {
                S.conjureEquipped = weapon;
                S.conjurePickups.splice(pi, 1);
                S.log.push({ t: S.t, type: 'pickup', weapon });
                S.steps.push({ skill: name, start: S.t, end: S.t, att: S.att, type: 'pickup', ri: S._ri });
                this._procOnSwapSigils(S, S.t);
                if (S._hasConjurer) this._applyAura(S, 'Fire Aura', 4000, S.t, 'Conjurer');
            } else {
                S.log.push({ t: S.t, type: 'err', msg: `No ${weapon} pickup available` });
            }
            return;
        }

        const sk = this._skillInContext(name, S);
        if (!sk) { S.log.push({ t: S.t, type: 'err', msg: `Unknown: ${name}` }); return; }

        // Weave Self natural expiry: if expired without visiting all 4 attunements, reset the chain
        if (S.weaveSelfUntil > 0 && S.t >= S.weaveSelfUntil && S.perfectWeaveUntil <= S.t) {
            S.weaveSelfUntil = 0;
            S.weaveSelfVisited = new Set();
            S.chainState['Weave Self'] = 'Weave Self';
            S.log.push({ t: S.t, type: 'skill_proc', skill: 'Weave Self', detail: 'expired - chain reset' });
        }

        // Tailored Victory requires an active Perfect Weave window
        if (name === 'Tailored Victory' && S.perfectWeaveUntil <= S.t) {
            S.log.push({ t: S.t, type: 'err', msg: 'Tailored Victory requires Perfect Weave to be active' });
            return;
        }

        if (sk.type === 'Attunement' && !sk.name.startsWith('Overload')) {
            this._doSwap(S, sk, skipCastUntil, concurrents);
            return;
        }

        if (sk.name.startsWith('Overload')) {
            this._doOverload(S, sk, concurrents);
            return;
        }

        if (CONJURE_WEAPONS.has(sk.weapon) && S.conjureEquipped !== sk.weapon) {
            S.log.push({ t: S.t, type: 'err', msg: `Need ${sk.weapon} equipped for ${name}` });
            return;
        }
        if (S.conjureEquipped && sk.type === 'Weapon skill' && !CONJURE_WEAPONS.has(sk.weapon)) {
            S.log.push({ t: S.t, type: 'err', msg: `Cannot use ${name} while wielding ${S.conjureEquipped}` });
            return;
        }

        if (sk.type === 'Jade Sphere') {
            this._doJadeSphere(S, sk);
            return;
        }

        if (sk.type === 'Familiar') {
            this._doFamiliar(S, sk);
            return;
        }

        let isAACarryover = false;
        if (S.aaCarryover && sk.slot === '1') {
            const expected = S.chainState[S.aaCarryover.root];
            if (name === expected) isAACarryover = true;
        }

        if (!isAACarryover && sk.attunement && !this._attOK(sk, S)) {
            const inDesc = S.eliteSpec === 'Weaver' ? `${S.att}/${S.att2}` : S.att;
            S.log.push({ t: S.t, type: 'err', msg: `Wrong attunement for ${name} (need ${sk.attunement}, in ${inDesc})` });
            return;
        }

        if (sk.chainSkill) {
            const chainRoot = this._getChainRoot(sk);
            let expected = S.chainState[chainRoot] || chainRoot;
            // Non-slot-1 chains: if the 5s window expired, reset to root
            if (sk.slot !== '1' && S.chainExpiry[chainRoot] !== undefined && S.chainExpiry[chainRoot] <= S.t) {
                S.chainState[chainRoot] = chainRoot;
                delete S.chainExpiry[chainRoot];
                expected = chainRoot;
            }
            if (name !== expected) {
                S.log.push({ t: S.t, type: 'err', msg: `Chain: need ${expected}, got ${name}` });
                return;
            }
        }

        // Etching chain validation
        const etchChain = ETCHING_LOOKUP.get(name);
        if (etchChain) {
            const state = S.etchingState[etchChain.etching];
            if (name === etchChain.lesser) {
                // lesser is available only if etchingState is 'lesser'
                if (state !== 'lesser') {
                    S.log.push({ t: S.t, type: 'err', msg: `Etching: need to cast ${etchChain.etching} first` });
                    return;
                }
            } else if (name === etchChain.full) {
                // full is available only if etchingState is 'full'
                if (state !== 'full') {
                    S.log.push({ t: S.t, type: 'err', msg: `Etching: ${etchChain.full} requires 3 other Spear casts after ${etchChain.etching}` });
                    return;
                }
            }
            // etching itself is always allowed (no state restriction)
        }

        // ── Hammer orb ICD: orb skills blocked 480ms after Grand Finale (and vice versa) ──
        if (sk.weapon === 'Hammer' && sk.type === 'Weapon skill') {
            const isGF = name === 'Grand Finale';
            const isOrbSkill = HAMMER_ALL_ORB_NAMES.has(name);
            // Can't reuse the same orb skill without Grand Finale in between
            if (isOrbSkill && S.hammerOrbsUsed.has(name)) {
                S.log.push({ t: S.t, type: 'err', msg: `${name}: must cast Grand Finale before using this orb skill again` });
                return;
            }
            if ((isGF || isOrbSkill) && S.hammerOrbLastCast > -Infinity) {
                const sinceLast = S.t - S.hammerOrbLastCast;
                if (sinceLast < HAMMER_ORB_ICD_MS) S.t = S.hammerOrbLastCast + HAMMER_ORB_ICD_MS;
            }
        }

        // ── Grand Finale: validate at least one orb active in current attunement context ──
        if (name === 'Grand Finale' && sk.weapon === 'Hammer') {
            const activeOrbs = this._hammerActiveOrbs(S, S.t);
            if (activeOrbs.length === 0) {
                S.log.push({ t: S.t, type: 'err', msg: 'Grand Finale: no active orbs' });
                return;
            }
            // For non-Weaver: must have cast the corresponding attunement's orb skill first
            // For Weaver: must have an orb granted by a skill that required att or att2
            const hasQualifyingOrb = this._hammerGFAvailable(S, S.t);
            if (!hasQualifyingOrb) {
                S.log.push({ t: S.t, type: 'err', msg: `Grand Finale: need an orb from current attunement (${S.att}${S.att2 ? '/' + S.att2 : ''})` });
                return;
            }
        }

        const key = this._cdKey(sk);
        const isCharged = sk.maximumCount > 0 && sk.countRecharge > 0;

        if (isCharged) {
            this._initCharges(S, key, sk);

            const cdReady = S.skillCD[key] || 0;
            if (S.t < cdReady) S.t = cdReady;

            this._catchUpCharges(S, key, sk);
            const ch = S.charges[key];

            if (ch.count <= 0) {
                if (ch.nextChargeAt > S.t) S.t = ch.nextChargeAt;
                ch.count++;
                const baseMs = this._pyroRechargeMs(S, sk, Math.round(sk.countRecharge * 1000));
                ch.nextChargeAt = ch.count < sk.maximumCount ? S.t + this._alaCd(S, baseMs, S.t) : Infinity;
            }
            ch.count--;
            if (ch.nextChargeAt === Infinity && ch.count < sk.maximumCount) {
                const baseMs = this._pyroRechargeMs(S, sk, Math.round(sk.countRecharge * 1000));
                ch.nextChargeAt = S.t + this._alaCd(S, baseMs, S.t);
            }
        } else {
            const cdReady = S.skillCD[key] || 0;
            if (S.t < cdReady) S.t = cdReady;
        }

        const csvCastMs = Math.round(sk.castTime * 1000);
        const { castMs, scaleOff } = this._adjCastTime(S, csvCastMs, S.t);
        const start = S.t;
        const end = start + castMs;

        S.log.push({ t: start, type: 'cast', skill: name, att: S.att, dur: castMs });
        // Pre-schedule flags: set before _scheduleHits and before recharge block
        S._frigidFlurryProcActive = (name === 'Frigid Flurry' && S.pistolBullets['Water'] === true);
        // Purblinding Plasma (Air bullet consumed): flag for CD reduction in recharge block below
        S._purblindingCDReduce = (name === 'Purblinding Plasma' && S.pistolBullets['Air'] === true);
        // Grand Finale hits are scheduled manually in the post-cast block (one hit per consumed orb)
        if (name !== 'Grand Finale') this._scheduleHits(S, sk, start, scaleOff);
        S._frigidFlurryProcActive = false;
        this._trackField(S, sk, end);
        this._trackAura(S, sk, end);

        // Fire instant skills that overlap with this cast window
        const anchorRi = S._ri;
        for (const c of concurrents) {
            const fireAt = start + (c.offset || 0);
            S.t = Math.max(fireAt, start); // clamp to cast start; _step handles own CD wait
            S._ri = c._ri;
            this._step(S, c.name, true /* skipCastUntil */);
        }
        S._ri = anchorRi;

        if (castMs > 0) S.castUntil = end;
        S.t = end;
        S.log.push({ t: end, type: 'cast_end', skill: name });

        if (sk.recharge > 0) {
            let finalCd;
            if (S.arcaneEchoUntil > end && sk.type === 'Weapon skill') {
                // Arcane Echo: reduce the next weapon skill recharge to exactly 1s
                finalCd = end + 1000;
                S.arcaneEchoUntil = 0;
                S.log.push({ t: end, type: 'skill_proc', skill: 'Arcane Echo', detail: `${name} CD → 1s` });
            } else {
                let baseCdMs = this._pyroRechargeMs(S, sk, Math.round(sk.recharge * 1000));
                if (S.elemBalanceActive && end <= S.elemBalanceExpiry
                    && sk.type === 'Weapon skill') {
                    baseCdMs = Math.round(baseCdMs * 0.34);
                    S.elemBalanceActive = false;
                }
                // Ride the Lightning halves its own recharge when it hits (always assumed to hit).
                // The CSV recharge stays at 20s so relic procs (weapon_recharge20) trigger correctly.
                // _pyroRechargeMs already applied Aeromancer's Training (×0.8), giving 16s → 8s,
                // or 20s → 10s without the trait.
                if (name === 'Ride the Lightning') baseCdMs = Math.round(baseCdMs / 2);
                // Ripple: next non-slot-1 Spear weapon skill recharge -33%
                if (S.spearNextCdReduce && sk.weapon === 'Spear' && sk.type === 'Weapon skill' && sk.slot !== '1') {
                    baseCdMs = Math.round(baseCdMs * (2 / 3));
                    S.spearNextCdReduce = false;
                    S.log.push({ t: end, type: 'skill_proc', skill: 'Ripple', detail: `${name} CD -33%` });
                }
                // Dazing Discharge: next non-slot-1 Pistol skill recharge -33% (5s window)
                if (S.dazingDischargeUntil > end && sk.weapon === 'Pistol' && sk.type === 'Weapon skill' && sk.slot !== '1') {
                    baseCdMs = Math.round(baseCdMs * (2 / 3));
                    S.dazingDischargeUntil = 0;
                    S.log.push({ t: end, type: 'skill_proc', skill: 'Dazing Discharge', detail: `${name} CD -33%` });
                }
                // Purblinding Plasma (Air bullet consumed): reduce THIS skill's recharge by 33%
                if (name === 'Purblinding Plasma' && S._purblindingCDReduce) {
                    baseCdMs = Math.round(baseCdMs * (2 / 3));
                    S.log.push({ t: end, type: 'skill_proc', skill: 'Purblinding Plasma', detail: 'Air bullet → CD -33%' });
                }
                finalCd = end + this._alaCd(S, baseCdMs, end);
            }
            S.skillCD[key] = finalCd;
            // Skill-swap chains (A↔B where B replaces A in the slot) have independent CDs:
            // casting A should not put B on A's cooldown — B is immediately available.
            const isSwapChain = sk.chainSkill &&
                this._skill(sk.chainSkill)?.chainSkill === sk.name;
            // if (!isCharged && !isSwapChain) this._propagateChainCD(S, sk, finalCd);
        }

        if (sk.chainSkill) {
            const chainRoot = this._getChainRoot(sk);
            S.chainState[chainRoot] = sk.chainSkill;
            // Non-slot-1 chains get a 5s window to use the next skill in the chain
            if (sk.slot !== '1') {
                S.chainExpiry[chainRoot] = end + 5000;
            }
        }

        // Deferred aaCarryover detection for concurrent attunement swaps:
        // _doSwap defers _detectAACarryover when called concurrently so it can run here,
        // after the anchor's chain state is finalised.
        if (S._pendingAACPrev !== undefined) {
            const _savedAtt = S.att;
            S.att = S._pendingAACPrev;
            S.aaCarryover = this._detectAACarryover(S);
            S.att = _savedAtt;
            delete S._pendingAACPrev;
        }

        if (S.aaCarryover) {
            if (isAACarryover) {
                if (sk.chainSkill === S.aaCarryover.root) S.aaCarryover = null;
            } else if (sk.slot === '1' && this._attOK(sk, S)) {
                S.aaCarryover = null;
            }
        }

        this._resetChainsOnCast(S, sk);

        this._ensurePerSkill(S, name);
        S.perSkill[name].casts++;
        S.perSkill[name].castTimeMs += castMs;
        const pf = S._pendingPartialFill;
        S._pendingPartialFill = null;
        S.steps.push({ skill: name, start, end, att: S.att, type: 'skill', ri: S._ri, partialFill: pf || undefined });

        if (sk.type === 'Conjure') {
            const cw = CONJURE_MAP[sk.name];
            if (cw) {
                S.conjureEquipped = cw;
                const existing = S.conjurePickups.findIndex(p => p.weapon === cw);
                if (existing !== -1) S.conjurePickups.splice(existing, 1);
                S.conjurePickups.push({ weapon: cw, expiresAt: end + CONJURE_PICKUP_DURATION });
                S.log.push({ t: end, type: 'conjure', weapon: cw, pickupExpires: end + CONJURE_PICKUP_DURATION });
                if (S._hasConjurer) this._applyAura(S, 'Fire Aura', 4000, end, 'Conjurer');
            }
        }

        if (S.eliteSpec === 'Evoker' && S.evokerElement) {
            const slotNum = parseInt(sk.slot);
            if (!isNaN(slotNum) && slotNum >= 2 && slotNum <= 5
                && !CONJURE_WEAPONS.has(sk.weapon)
                && !EVOKER_NO_CHARGE_SKILLS.has(sk.name)) {
                const skillAtt = sk.attunement ? sk.attunement.split('+') : [];
                const bonus = skillAtt.includes(S.evokerElement) ? 2 : 1;
                const maxCh = S._hasSpecializedElements ? 4 : 6;
                S.evokerCharges = Math.min(maxCh, S.evokerCharges + bonus);
            }
        }

        this._checkRelicOnCast(S, sk, start, end);

        // ── Spear Etching chain state management ──────────────────────────────
        {
            const etchCast = ETCHING_LOOKUP.get(name);
            if (etchCast && sk.weapon === 'Spear') {
                if (name === etchCast.etching) {
                    // Casting an Etching arms the lesser variant; no CD propagation to lesser/full
                    S.etchingState[etchCast.etching] = 'lesser';
                    S.etchingOtherCasts[etchCast.etching] = 0;
                    S.log.push({ t: end, type: 'skill_proc', skill: name, detail: `armed ${etchCast.lesser}` });
                } else {
                    // Casting lesser or full resets back to etching
                    S.etchingState[etchCast.etching] = null;
                    S.etchingOtherCasts[etchCast.etching] = 0;
                }
            } else if (!etchCast) {
                // ANY skill (weapon, utility, heal, elite, profession mechanic) counts toward
                // flipping lesser → full, except the etching/lesser/full skills themselves
                for (const chain of Object.values(ETCHING_CHAINS)) {
                    if (S.etchingState[chain.etching] === 'lesser') {
                        S.etchingOtherCasts[chain.etching] = (S.etchingOtherCasts[chain.etching] || 0) + 1;
                        if (S.etchingOtherCasts[chain.etching] >= 3) {
                            S.etchingState[chain.etching] = 'full';
                            S.log.push({ t: end, type: 'skill_proc', skill: chain.etching, detail: `upgraded to ${chain.full}` });
                        }
                    }
                }
            }
        }

        // ── Spear "next spear skill" buffs — grant ─────────────────────────────
        if (sk.weapon === 'Spear') {
            if (name === 'Seethe') {
                S.spearNextDmgBonus = true;
                S.log.push({ t: end, type: 'skill_proc', skill: 'Seethe', detail: 'next Spear +25% strike armed' });
            } else if (name === 'Ripple') {
                S.spearNextCdReduce = true;
                S.log.push({ t: end, type: 'skill_proc', skill: 'Ripple', detail: 'next Spear -33% recharge armed' });
            } else if (name === 'Energize') {
                S.spearNextGuaranteedCrit = true;
                S.log.push({ t: end, type: 'skill_proc', skill: 'Energize', detail: 'next Spear guaranteed crit armed' });
            } else if (name === 'Harden') {
                S.spearNextCCHit = true;
                S.log.push({ t: end, type: 'skill_proc', skill: 'Harden', detail: 'next Spear first hit CC armed' });
            }
        }

        // ── Spear slot 3 dual-attunement (Weaver): reset primary attunement CD ─
        if (S.eliteSpec === 'Weaver' && sk.weapon === 'Spear' && sk.slot === '3'
            && sk.attunement && sk.attunement.includes('+')
            && S.att !== S.att2) {
            S.attCD[S.att] = end;
            S.log.push({ t: end, type: 'skill_proc', skill: name, detail: `${S.att} attunement CD reset` });
        }

        // ── Pistol bullet system ──────────────────────────────────────────────
        // Elemental Explosion: requires all 4 bullets, consumes all, grants attunement aura
        if (name === 'Elemental Explosion') {
            const auraMap = { Fire: ['Fire Aura', 4000], Water: ['Frost Aura', 4000], Air: ['Shocking Aura', 3000], Earth: ['Magnetic Aura', 3000] };
            const auraEntry = auraMap[S.att];
            if (auraEntry) this._applyAura(S, auraEntry[0], auraEntry[1], end, name);
            for (const el of ['Fire', 'Water', 'Air', 'Earth']) {
                if (S.pistolBullets[el]) {
                    S.pistolBullets[el] = false;
                    const me = S._pistolBulletMapEntry[el];
                    if (me) { me.expiresAt = end; S._pistolBulletMapEntry[el] = null; }
                }
            }
            S.log.push({ t: end, type: 'skill_proc', skill: name, detail: 'all bullets consumed, aura granted' });
        }

        if (sk.weapon === 'Pistol' && sk.type === 'Weapon skill'
            && (sk.slot === '2' || sk.slot === '3')
            && name !== 'Elemental Explosion') {

            const isDual = sk.attunement && sk.attunement.includes('+');

            if (!isDual) {
                // ── Base pistol skills ───────────────────────────────────────
                const el = PISTOL_SKILL_ELEMENT[name];
                if (el) {
                    const canConsume = !PISTOL_NO_CONSUME.has(name);
                    const canGrant = !PISTOL_NO_GRANT.has(name);
                    const hasIt = S.pistolBullets[el];

                    if (canConsume && hasIt) {
                        // ── Consume bullet — apply consume effects ────────────
                        S.pistolBullets[el] = false;
                        // Remove from condMap tracking
                        const mapEntry = S._pistolBulletMapEntry[el];
                        if (mapEntry) { mapEntry.expiresAt = end; S._pistolBulletMapEntry[el] = null; }
                        S.log.push({ t: end, type: 'skill_proc', skill: name, detail: `${el} bullet consumed` });

                        if (name === 'Raging Ricochet') {
                            this._trackEffect(S, 'Might', 1, 10, end);
                        } else if (name === 'Searing Salvo') {
                            this._applyAura(S, 'Fire Aura', 4000, end, 'Searing Salvo');
                        } else if (name === 'Frozen Fusillade') {
                            // Delayed hit 4s after cast: 0.75 coeff + 5x Bleed 8s
                            insertSorted(S.eq, {
                                time: end + 4000, type: 'hit',
                                skill: 'Frozen Fusillade', hitIdx: 99, sub: 1, totalSubs: 1,
                                dmg: 0.75, ws: this._ws(sk),
                                isField: false, cc: false,
                                conds: { Bleeding: { stacks: 5, duration: 8 } },
                                att: S.att, att2: S.att2, castStart: start,
                            });
                        } else if (name === 'Dazing Discharge') {
                            S.dazingDischargeUntil = end + 5000;
                            S.log.push({ t: end, type: 'skill_proc', skill: 'Dazing Discharge', detail: 'next Pistol CD -33% armed (5s)' });
                        } else if (name === 'Shattering Stone') {
                            S.shatteringStoneHits = 3;
                            S.shatteringStoneUntil = end + 10000;
                            S.log.push({ t: end, type: 'skill_proc', skill: 'Shattering Stone', detail: 'next 3 hits apply Bleed (10s)' });
                        } else if (name === 'Boulder Blast') {
                            // 100% Projectile finisher on its own hit — inject Projectile finisher hit
                            insertSorted(S.eq, {
                                time: end, type: 'hit',
                                skill: 'Boulder Blast', hitIdx: 99, sub: 1, totalSubs: 1,
                                dmg: 0, ws: 0, isField: false, cc: false, conds: null,
                                finType: 'Projectile', finVal: 1,
                                att: S.att, att2: S.att2, castStart: start,
                                isTraitProc: true, noCrit: true,
                            });
                        }
                    } else if (canGrant && !hasIt) {
                        // ── Grant bullet ─────────────────────────────────────
                        S.pistolBullets[el] = true;
                        const condName = el === 'Water' ? 'Ice Bullet' : `${el} Bullet`;
                        const entry = { t: end, cond: condName, expiresAt: PERMA_EXPIRY };
                        this._pushCondStack(S, entry);
                        S._pistolBulletMapEntry[el] = entry;
                        S.log.push({ t: end, type: 'skill_proc', skill: name, detail: `${el} bullet granted` });
                    }
                    // If hasIt and canConsume → consumed above; if !canConsume and !hasIt → grant
                    // If !canConsume and hasIt → no grant (already have), no consume → nothing
                }
            } else {
                // ── Weaver dual pistol slot-3 skills ────────────────────────
                const dualEls = PISTOL_DUAL_ELEMENTS[name];
                if (dualEls) {
                    const [priEl, secEl] = dualEls;
                    const hasPri = S.pistolBullets[priEl];
                    const hasSec = S.pistolBullets[secEl];
                    let anyConsumed = false;

                    const _bulletConsume = (el) => {
                        S.pistolBullets[el] = false;
                        const condName = el === 'Water' ? 'Ice Bullet' : `${el} Bullet`;
                        const me = S._pistolBulletMapEntry[el];
                        if (me) { me.expiresAt = end; S._pistolBulletMapEntry[el] = null; }
                        S.log.push({ t: end, type: 'skill_proc', skill: name, detail: `${el} bullet consumed` });
                    };
                    const _bulletGrant = (el) => {
                        S.pistolBullets[el] = true;
                        const condName = el === 'Water' ? 'Ice Bullet' : `${el} Bullet`;
                        const entry = { t: end, cond: condName, expiresAt: PERMA_EXPIRY };
                        this._pushCondStack(S, entry);
                        S._pistolBulletMapEntry[el] = entry;
                        S.log.push({ t: end, type: 'skill_proc', skill: name, detail: `${el} bullet granted` });
                    };

                    if (hasPri) { _bulletConsume(priEl); anyConsumed = true; }
                    if (hasSec) { _bulletConsume(secEl); anyConsumed = true; }

                    // Apply consume effects for each consumed element
                    if (hasPri) this._applyPistolDualConsumeEffect(S, sk, name, priEl, end, start);
                    if (hasSec) this._applyPistolDualConsumeEffect(S, sk, name, secEl, end, start);

                    // Grant primary element bullet if nothing was consumed
                    if (!anyConsumed) {
                        const grantEl = S.att; // primary attunement's element
                        _bulletGrant(grantEl);
                    }
                }
            }
        }

        // ── Hammer orb system ─────────────────────────────────────────────────
        if (sk.weapon === 'Hammer' && sk.type === 'Weapon skill') {
            const singleEl = HAMMER_ORB_SKILLS[name];
            const dualEls = HAMMER_DUAL_ORB_SKILLS[name];
            const isGF = name === 'Grand Finale';

            if (singleEl || dualEls) {
                // Orb skill: grant orb(s), refresh all existing orbs, apply buff(s)
                const granted = singleEl ? [singleEl] : dualEls;
                // Refresh all currently active orbs and extend their buffs
                for (const el of ['Fire', 'Water', 'Air', 'Earth']) {
                    if (S.hammerOrbs[el] !== null) {
                        S.hammerOrbs[el] = end + HAMMER_ORB_DURATION_MS;
                        // Extend buff stacks in _condMap
                        const buffKey = HAMMER_ORB_BUFF_KEY[el];
                        if (buffKey) {
                            const arr = S._condMap.get(buffKey);
                            if (arr) for (const s of arr) if (s.expiresAt > end) s.expiresAt = end + HAMMER_ORB_DURATION_MS;
                        }
                    }
                }
                // Grant new orbs
                for (const el of granted) {
                    S.hammerOrbs[el] = end + HAMMER_ORB_DURATION_MS;
                    S.hammerOrbGrantedBy[el] = name;
                    const buffKey = HAMMER_ORB_BUFF_KEY[el];
                    if (buffKey) {
                        // Remove any stale buff stacks and push a fresh one
                        const old = S._condMap.get(buffKey);
                        if (old) for (const s of old) s.expiresAt = end; // expire old stacks
                        this._pushCondStack(S, { t: end, cond: buffKey, expiresAt: end + HAMMER_ORB_DURATION_MS });
                    }
                    S.log.push({ t: end, type: 'skill_proc', skill: name, detail: `${el} orb granted (until +${HAMMER_ORB_DURATION_MS / 1000}s)` });
                }
                S.hammerOrbLastCast = end;
                S.hammerOrbsUsed.add(name);
            } else if (isGF) {
                // Grand Finale: consume all active orbs, schedule hits, apply conditions
                S.hammerOrbLastCast = end;
                S.hammerOrbsUsed.clear();
                const consumed = this._hammerActiveOrbs(S, end);
                // Expire all orbs and their buffs immediately
                for (const el of consumed) {
                    S.hammerOrbs[el] = null;
                    S.hammerOrbGrantedBy[el] = null;
                    const buffKey = HAMMER_ORB_BUFF_KEY[el];
                    if (buffKey) {
                        const arr = S._condMap.get(buffKey);
                        if (arr) for (const s of arr) s.expiresAt = end;
                    }
                }
                // Schedule one hit per consumed orb (using Grand Finale's hit data as template)
                const gfSk = this._skill('Grand Finale');
                const gfHits = this.skillHits['Grand Finale'] || [];
                const gfHit = gfHits[0]; // single hit row
                if (gfSk && gfHit) {
                    const ws = this._ws(gfSk);
                    for (let i = 0; i < consumed.length; i++) {
                        const el = consumed[i];
                        const condData = HAMMER_GF_CONDITIONS[el];
                        insertSorted(S.eq, {
                            time: end + (gfHit.startOffsetMs || 680),
                            type: 'hit',
                            skill: 'Grand Finale', hitIdx: 1, sub: i + 1, totalSubs: consumed.length,
                            dmg: gfHit.damage, ws,
                            isField: false, cc: false,
                            conds: condData ? { [condData.cond]: { stacks: condData.stacks, duration: condData.dur } } : null,
                            finType: gfHit.finisherType, finVal: gfHit.finisherValue,
                            att: S.att, att2: S.att2, castStart: start,
                            conjure: S.conjureEquipped || null,
                        });
                    }
                }
                S.log.push({ t: end, type: 'skill_proc', skill: 'Grand Finale', detail: `consumed ${consumed.length} orbs: ${consumed.join(', ')}` });
                // After Grand Finale: all orb skills revert (no further Grand Finale until new orb)
                // This is enforced by hammerOrbs all being null now.
            }
        }

        if (S._hasPyroPuissance && S.att === 'Fire') {
            this._trackEffect(S, 'Might', 1, 15, end);
        }

        if (S._hasGaleSong && sk.type === 'Healing skill') {
            this._trackEffect(S, 'Protection', 1, 3, end);
        }

        if (S._hasTempestuousAria && sk.type === 'Shout') {
            this._trackEffect(S, 'Might', 2, 10, end);
        }

        if (S._hasAltruisticAspect && sk.type === 'Meditation') {
            if (sk.name === "Fox's Fury") this._trackEffect(S, 'Might', 3, 10, end);
            else if (sk.name === "Hare's Agility") this._trackEffect(S, 'Fury', 1, 5, end);
            else if (sk.name === "Toad's Fortitude") this._trackEffect(S, 'Stability', 1, 5, end);
            else if (sk.name === 'Elemental Procession') this._trackEffect(S, 'Resistance', 1, 5, end);
        }

        if (S._hasEarthsEmbrace && sk.type === 'Healing skill'
            && end >= (S.traitICD['EarthsEmbrace'] || 0)) {
            S.traitICD['EarthsEmbrace'] = end + 15000;
            this._trackEffect(S, 'Resistance', 1, 4, end);
            S.log.push({ t: end, type: 'trait_proc', trait: "Earth's Embrace", skill: "Earth's Embrace" });
        }

        if (S._hasSoothingIce && sk.type === 'Healing skill'
            && end >= (S.traitICD['SoothingIce'] || 0)) {
            S.traitICD['SoothingIce'] = end + 15000;
            this._applyAura(S, 'Frost Aura', 4000, end, 'Soothing Ice');
            this._trackEffect(S, 'Regeneration', 1, 4, end);
        }

        if (sk.type === 'Signet') {
            if (S._hasWrittenInStone) {
                if (sk.name === 'Signet of Restoration') this._applyAura(S, 'Frost Aura', 4000, end, 'Written in Stone');
                else if (sk.name === 'Signet of Fire') this._applyAura(S, 'Fire Aura', 4000, end, 'Written in Stone');
                else if (sk.name === 'Signet of Earth') this._applyAura(S, 'Magnetic Aura', 3000, end, 'Written in Stone');
            }
            if (sk.name === 'Signet of Fire' && !S._hasWrittenInStone) {
                S.signetFirePassiveLostUntil = S.skillCD[key] || 0;
            }
        }

        if (S._hasInscription && sk.type === 'Glyph') {
            const att = S.att;
            if (att === 'Fire') this._trackEffect(S, 'Might', 1, 10, end);
            else if (att === 'Water') this._trackEffect(S, 'Regeneration', 1, 10, end);
            else if (att === 'Air') this._trackEffect(S, 'Swiftness', 1, 10, end);
            else if (att === 'Earth') this._trackEffect(S, 'Protection', 1, 3, end);
        }

        if (S._hasBolsteredElements && sk.type === 'Stance') {
            this._trackEffect(S, 'Protection', 1, 3, end);
        }

        if (S._hasArcaneLightning && sk.type === 'Arcane') {
            this._refreshArcaneLightningBuff(S, end);
            if (sk.name === 'Arcane Brilliance') this._trackEffect(S, 'Protection', 1, 3.5, end);
            else if (sk.name === 'Arcane Wave') this._trackEffect(S, 'Immobilize', 1, 2, end);
            else if (sk.name === 'Arcane Blast') this._trackEffect(S, 'Blindness', 1, 5, end);
            else if (sk.name === 'Arcane Echo') this._trackEffect(S, 'Quickness', 1, 4, end);
        }

        const isDual = sk.slot === '3' && sk.attunement && sk.attunement.includes('+');
        if (isDual) {
            if (S._hasSuperiorElements && end >= (S.traitICD['SuperiorElements'] || 0)) {
                S.traitICD['SuperiorElements'] = end + 4000;
                this._trackEffect(S, 'Weakness', 1, 5, end);
            }
            if (S._hasSwiftRevenge) this._trackEffect(S, 'Swiftness', 1, 4, end);
            if (S._hasInvigoratingStrikes) this._trackEffect(S, 'Vigor', 1, 3, end);
        }

        // ── Skill-specific post-cast effects ──────────────────────────────────

        if (sk.name === 'Arcane Echo') {
            S.arcaneEchoUntil = end + (sk.duration || 10) * 1000;
            S.log.push({ t: end, type: 'skill_proc', skill: 'Arcane Echo', detail: 'armed' });
        }

        if (sk.name === 'Relentless Fire') {
            const durMs = (S.sphereExpiry.Fire > end) ? 8000 : 5000;
            this._pushCondStack(S, { t: end, cond: 'Relentless Fire', expiresAt: end + durMs });
            S.log.push({ t: end, type: 'skill_proc', skill: 'Relentless Fire', detail: `${durMs / 1000}s` });
        }

        if (sk.name === 'Shattering Ice') {
            const durMs = (S.sphereExpiry.Water > end) ? 8000 : 5000;
            this._pushCondStack(S, { t: end, cond: 'Shattering Ice', expiresAt: end + durMs });
            // ICD starts at cast-end so the on-cast hit (< end) doesn't trigger the proc
            S.traitICD['ShatteringIce'] = end;
            S.log.push({ t: end, type: 'skill_proc', skill: 'Shattering Ice', detail: `${durMs / 1000}s` });
        }

        if (sk.name === 'Elemental Celerity') {
            // Reset cooldowns for all weapon skills belonging to the current attunement
            for (const wsk of this.skills) {
                if (wsk.type !== 'Weapon skill' || wsk.recharge <= 0) continue;
                if (!wsk.attunement) continue;
                if (!wsk.attunement.split('+').includes(S.att)) continue;
                S.skillCD[this._cdKey(wsk)] = 0;
            }
            S.log.push({ t: end, type: 'skill_proc', skill: 'Elemental Celerity', detail: `${S.att} CDs reset` });

            // Boons from each active Jade Sphere
            if ((S.sphereExpiry.Fire > end)) this._trackEffect(S, 'Might', 5, 6, end);
            if ((S.sphereExpiry.Water > end)) this._trackEffect(S, 'Vigor', 1, 6, end);
            if ((S.sphereExpiry.Air > end)) this._trackEffect(S, 'Fury', 1, 6, end);
            if ((S.sphereExpiry.Earth > end)) this._trackEffect(S, 'Protection', 1, 4, end);
        }

        // ── Evoker meditation post-cast effects ───────────────────────────────

        if (sk.name === "Hare's Agility") {
            S.electricEnchantmentStacks += 5;
            S.log.push({ t: end, type: 'skill_proc', skill: "Hare's Agility", detail: '+5 electric enchantment' });
        }

        if (sk.name === "Toad's Fortitude" && S.evokerElement === 'Earth') {
            this._trackEffect(S, 'Resistance', 1, 4, end);
        }

        if (sk.name === "Fox's Fury") {
            // Determine damage tier from Might count at cast start (before Fox's Fury grants)
            const preFuryMight = this._mightStacksAt(S, start);
            const foxTier = preFuryMight >= 20 ? 2 : preFuryMight >= 10 ? 1 : 0;
            const foxCoeffs = [1.5, 2.25, 3.0];
            const foxBurnStacks = [1, 2, 3];
            const foxBurnDurs = [3, 5, 7];
            insertSorted(S.eq, {
                time: start + scaleOff(560), type: 'hit',
                skill: "Fox's Fury", hitIdx: 1, sub: 1, totalSubs: 1,
                dmg: foxCoeffs[foxTier], ws: this._ws(sk),
                isField: false, cc: false,
                conds: { Burning: { stacks: foxBurnStacks[foxTier], duration: foxBurnDurs[foxTier] } },
                att: S.att, att2: S.att2, castStart: start,
                conjure: S.conjureEquipped || null,
            });
            // Grant Might + Fury at cast end
            const foxMightCount = 8 + (S.evokerElement === 'Fire' ? 3 : 0);
            this._trackEffect(S, 'Might', foxMightCount, 10, end);
            this._trackEffect(S, 'Fury', 1, 10, end);
            S.log.push({ t: end, type: 'skill_proc', skill: "Fox's Fury", detail: `tier ${foxTier}, ${foxMightCount} Might` });
        }

        if (sk.name === 'Elemental Procession') {
            // Summon all 4 empowered familiars; they cast autonomously (no player cast time)
            for (const ename of ['Conflagration', 'Lightning Blitz', 'Seismic Impact']) {
                const fsk = this._skill(ename);
                if (fsk) this._scheduleHits(S, fsk, end, x => x);
            }
            S.log.push({ t: end, type: 'skill_proc', skill: 'Elemental Procession', detail: 'empowered familiars released' });
        }

        if (sk.name === 'Rejuvenate') {
            const chargesNeeded = S._hasSpecializedElements ? 4 : 6;
            S.evokerCharges = chargesNeeded;
            S.log.push({ t: end, type: 'skill_proc', skill: 'Rejuvenate', detail: `charges → ${chargesNeeded}` });
        }

        if (sk.name === 'Weave Self') {
            S.weaveSelfUntil = end + 20000;
            S.weaveSelfVisited = new Set([S.att]);
            S.log.push({ t: end, type: 'skill_proc', skill: 'Weave Self', detail: `armed, starting in ${S.att}` });
        }

        if (sk.name === 'Tailored Victory') {
            S.perfectWeaveUntil = 0;
            S.log.push({ t: end, type: 'skill_proc', skill: 'Tailored Victory', detail: 'Perfect Weave consumed' });
        }
    }

    _doSwap(S, sk, isConcurrent = false, concurrents = []) {
        const target = sk.name.replace(' Attunement', '');

        if (S.eliteSpec === 'Weaver') {
            this._doWeaverSwap(S, sk, target, isConcurrent, concurrents);
            return;
        }

        if (S._hasSpecializedElements) {
            S.log.push({ t: S.t, type: 'err', msg: 'Cannot swap attunement with Specialized Elements' });
            return;
        }

        if (target === S.att) {
            S.log.push({ t: S.t, type: 'err', msg: `Already in ${target}` });
            return;
        }

        if (!isConcurrent) {
            S.aaCarryover = this._detectAACarryover(S);
        } else {
            S._pendingAACPrev = S.att;
        }

        let cdReady = S.attCD[target] || 0;
        // Fresh Air: if a pending crit hit would reset the Air CD before cdReady, advance
        // only to that hit's time instead of the full CD expiry.
        // Also check already-set freshAirResetAt (set by hits already processed via _checkFreshAir).
        if (target === 'Air' && S.t < cdReady) {
            if (S.freshAirResetAt >= 0 && S.freshAirResetAt <= S.t) {
                // Fresh Air already fired (hit processed before swap) — use it
                cdReady = S.freshAirResetAt;
            } else {
                // Scan pending hit events for a future Fresh Air reset
                const faTime = this._freshAirResetTimeInRange(S, 0, cdReady);
                if (faTime !== null) cdReady = faTime;
            }
        }
        if (S.t < cdReady) S.t = cdReady;

        const prev = S.att;
        S.att = target;
        S.attEnteredAt = S.t;
        if (target === 'Air') S.freshAirResetAt = -Infinity; // consumed

        const isEvoker = S.eliteSpec === 'Evoker';
        const evoEl = S.evokerElement;
        const rawPrevBaseCd = (isEvoker && prev === evoEl) ? OFF_ATT_CD : Math.round(sk.recharge * 1000);
        const prevBaseCd = this._attCdMs(S, rawPrevBaseCd);
        const existingCD = S.attCD[prev] || 0;
        S.attCD[prev] = Math.max(existingCD, S.t + this._alaCd(S, prevBaseCd, S.t));

        for (const other of ATTUNEMENTS) {
            if (other === target || other === prev) continue;
            const existingOther = S.attCD[other] || 0;
            let newCD = Math.max(existingOther, S.t + this._alaCd(S, this._attCdMs(S, OFF_ATT_CD), S.t));
            // Fresh Air reset: if Air's CD was reset by Fresh Air after the current time,
            // don't let the swap re-apply a longer CD — the reset takes priority.
            if (other === 'Air' && S._hasFreshAir && S.freshAirResetAt >= S.t) {
                newCD = Math.min(newCD, S.freshAirResetAt);
            }
            S.attCD[other] = newCD;
        }

        this._scheduleHits(S, sk, S.t);
        this._procOnSwapSigils(S, S.t);
        if (S._hasEnergizedElements) {
            if (S.energy !== null) S.energy = Math.min(CATALYST_ENERGY_MAX, S.energy + 2);
            this._trackEffect(S, 'Fury', 1, 2, S.t);
        }
        if (target === 'Fire') this._triggerSunspot(S, S.t);
        if (prev === 'Fire' && target !== 'Fire') this._triggerFlameExpulsion(S, S.t);
        if (target === 'Air') {
            this._triggerElectricDischarge(S, S.t);
            if (S._hasOneWithAir) this._trackEffect(S, 'Superspeed', 1, 3, S.t);
            if (S._hasInscription) this._trackEffect(S, 'Resistance', 1, 3, S.t);
            if (S._hasFreshAir) this._applyFreshAirBuff(S, S.t);
        }
        if (target === 'Water') {
            if (S._hasLatentStamina && S.t >= (S.traitICD['LatentStamina'] || 0)) {
                S.traitICD['LatentStamina'] = S.t + 10000;
                this._trackEffect(S, 'Vigor', 1, 3, S.t);
            }
        }
        if (target === 'Earth') {
            this._triggerEarthenBlast(S, S.t);
            if (S._hasRockSolid) this._grantRockSolid(S, S.t);
        }
        if (S._hasElemDynamo && target === S.evokerElement) {
            const maxCh = S._hasSpecializedElements ? 4 : 6;
            S.evokerCharges = Math.min(maxCh, S.evokerCharges + 1);
        }
        if (S._hasElemBalance && target === S.evokerElement) {
            S.elemBalanceCount++;
            if (S.elemBalanceCount % 2 === 0) {
                S.elemBalanceActive = true;
                S.elemBalanceExpiry = S.t + 5000;
            }
        }
        if (S._hasArcaneProwess) this._trackEffect(S, 'Might', 1, 8, S.t);
        if (S._hasElemAttunement) this._applyElemAttunementBoon(S, target, S.t);
        this._triggerBountifulPower(S, 1, S.t);
        S.attTimeline.push({ t: S.t, att: target });

        S.log.push({ t: S.t, type: 'swap', from: prev, to: target });
        S.steps.push({ skill: sk.name, start: S.t, end: S.t, att: target, type: 'swap', ri: S._ri, icon: 'https://render.guildwars2.com/file/F0C7F54A6FC70D079E1628FFE871980CAEBFD70D/1012290.png' });

        if (concurrents.length > 0) {
            const swapTime = S.t;
            const anchorRi = S._ri;
            for (const c of concurrents) {
                S.t = swapTime + (c.offset || 0);
                S._ri = c._ri;
                this._step(S, c.name, true /* skipCastUntil */);
            }
            S._ri = anchorRi;
            S.t = swapTime;
        }
    }

    _doWeaverSwap(S, sk, target, isConcurrent = false, concurrents = []) {
        if (target === S.att && target === S.att2) {
            S.log.push({ t: S.t, type: 'err', msg: `Already in ${target}/${target}` });
            return;
        }

        if (!isConcurrent) {
            S.aaCarryover = this._detectAACarryover(S);
        } else {
            S._pendingAACPrev = S.att;
        }

        let cdReady = S.attCD[target] || 0;
        // Fresh Air: if a pending crit hit would reset the Air CD before cdReady, advance
        // only to that hit's time instead of the full CD expiry.
        // Also check already-set freshAirResetAt (set by hits already processed via _checkFreshAir).
        if (target === 'Air' && S.t < cdReady) {
            if (S.freshAirResetAt >= 0 && S.freshAirResetAt <= S.t) {
                cdReady = S.freshAirResetAt;
            } else {
                const faTime = this._freshAirResetTimeInRange(S, 0, cdReady);
                if (faTime !== null) cdReady = faTime;
            }
        }
        if (S.t < cdReady) S.t = cdReady;

        const prevPrimary = S.att;
        const prevSecondary = S.att2;
        S.att2 = prevPrimary;
        S.att = target;
        S.attEnteredAt = S.t;
        if (target === 'Air') S.freshAirResetAt = -Infinity; // consumed

        // Capture before the expiry logic below can clear weaveSelfUntil
        const weaveSelfWasActive = S.weaveSelfUntil > S.t;

        // Weave Self: track visited attunements; trigger Perfect Weave when all 4 visited
        if (weaveSelfWasActive) {
            S.weaveSelfVisited.add(target);
            if (S.weaveSelfVisited.size >= 4) {
                // The 4th swap ends Weave Self — but this swap still benefits from the 2s CD
                S.weaveSelfUntil = 0;
                S.weaveSelfVisited = new Set();
                S.perfectWeaveUntil = S.t + 10000;
                S.log.push({ t: S.t, type: 'skill_proc', skill: 'Perfect Weave', detail: '10s' });
            }
        }

        // The 4th swap that ends Weave Self still gets the 2s cooldown (weaveSelfWasActive)
        const weaveSelfSwapCD = weaveSelfWasActive ? 2000 : this._attCdMs(S, WEAVER_SWAP_CD);
        for (const a of ATTUNEMENTS) {
            let newCD = S.t + this._alaCd(S, weaveSelfSwapCD, S.t);
            // Fresh Air reset: don't let the swap re-apply a longer CD to Air
            if (a === 'Air' && S._hasFreshAir && S.freshAirResetAt >= S.t) {
                newCD = Math.min(newCD, S.freshAirResetAt);
            }
            S.attCD[a] = newCD;
        }

        this._scheduleHits(S, sk, S.t);
        this._procOnSwapSigils(S, S.t);
        if (target === 'Fire') this._triggerSunspot(S, S.t);
        if (prevPrimary === 'Fire' && target !== 'Fire') this._triggerFlameExpulsion(S, S.t);
        if (target === 'Air') {
            this._triggerElectricDischarge(S, S.t);
            if (S._hasOneWithAir) this._trackEffect(S, 'Superspeed', 1, 3, S.t);
            if (S._hasInscription) this._trackEffect(S, 'Resistance', 1, 3, S.t);
            if (S._hasFreshAir && prevPrimary !== 'Air') this._applyFreshAirBuff(S, S.t);
        }
        if (target === 'Water') {
            if (S._hasLatentStamina && S.t >= (S.traitICD['LatentStamina'] || 0)) {
                S.traitICD['LatentStamina'] = S.t + 10000;
                this._trackEffect(S, 'Vigor', 1, 3, S.t);
            }
        }
        if (target === 'Earth') {
            this._triggerEarthenBlast(S, S.t);
            if (S._hasRockSolid) this._grantRockSolid(S, S.t);
        }
        if (S._hasWeaversProwess && target !== prevPrimary) {
            this._pushCondStack(S, { t: S.t, cond: "Weaver's Prowess", expiresAt: S.t + 8000 });
        }
        if (S._hasElementsOfRage && target === prevPrimary) {
            this._refreshEffect(S, 'Elements of Rage', 8, S.t);
        }
        if (S._hasArcaneProwess) this._trackEffect(S, 'Might', 1, 8, S.t);
        // Elemental Attunement: no boon if the swap would result in both attunements being the same
        if (S._hasElemAttunement && target !== prevPrimary) this._applyElemAttunementBoon(S, target, S.t);
        // Bountiful Power: both primary and secondary change per Weaver swap → 2 stacks
        this._triggerBountifulPower(S, 2, S.t);
        S.attTimeline.push({ t: S.t, att: target, att2: prevPrimary });

        S.log.push({ t: S.t, type: 'swap', from: `${prevPrimary}/${prevSecondary}`, to: `${target}/${prevPrimary}` });
        S.steps.push({ skill: sk.name, start: S.t, end: S.t, att: target, type: 'swap', ri: S._ri });

        if (concurrents.length > 0) {
            const swapTime = S.t;
            const anchorRi = S._ri;
            for (const c of concurrents) {
                S.t = swapTime + (c.offset || 0);
                S._ri = c._ri;
                this._step(S, c.name, true /* skipCastUntil */);
            }
            S._ri = anchorRi;
            S.t = swapTime;
        }
    }

    _doOverload(S, sk, concurrents = []) {
        if (S.eliteSpec !== 'Tempest') {
            S.log.push({ t: S.t, type: 'err', msg: `Overloads require Tempest specialization` });
            return;
        }
        const olAtt = sk.attunement;
        if (olAtt !== S.att) {
            S.log.push({ t: S.t, type: 'err', msg: `Need ${olAtt} for ${sk.name}` });
            return;
        }

        const cdReady = S.skillCD[sk.name] || 0;
        if (S.t < cdReady) S.t = cdReady;

        const baseDwell = S._hasTranscendentTempest
            ? Math.round(OVERLOAD_DWELL * (2 / 3)) : OVERLOAD_DWELL;
        const dwellEffMs = this._alaCd(S, baseDwell, S.attEnteredAt);
        const dwellReady = S.attEnteredAt + dwellEffMs;
        if (S.t < dwellReady) S.t = dwellReady;

        const csvCastMs = Math.round(sk.castTime * 1000);
        const { castMs, scaleOff } = this._adjCastTime(S, csvCastMs, S.t);
        const start = S.t;
        const end = start + castMs;

        if (S._hasHarmoniousConduit) {
            this._trackEffect(S, 'Swiftness', 1, 8, start);
            this._trackEffect(S, 'Stability', 1, 4, start);
        }
        if (S._hasHardyConduit) {
            this._trackEffect(S, 'Protection', 1, 3, start);
        }

        S.log.push({ t: start, type: 'cast', skill: sk.name, att: S.att, dur: castMs });
        this._scheduleHits(S, sk, start, scaleOff);
        this._trackField(S, sk, end);
        this._trackAura(S, sk, end);
        if (sk.attunement === 'Fire') this._triggerSunspot(S, start);

        S.castUntil = end;
        S.t = end;
        S.log.push({ t: end, type: 'cast_end', skill: sk.name });

        // Fire any shift-click concurrent skills scheduled during the overload cast window
        if (concurrents.length > 0) {
            const anchorRi = S._ri;
            for (const c of concurrents) {
                const fireAt = start + (c.offset || 0);
                S.t = Math.max(fireAt, start);
                S._ri = c._ri;
                this._step(S, c.name, true /* skipCastUntil */);
            }
            S._ri = anchorRi;
            S.t = end; // restore after concurrent steps may have advanced S.t
        }

        const olBaseCd = this._attCdMs(S, Math.round(sk.recharge * 1000));
        const olEffCd = this._alaCd(S, olBaseCd, end);
        S.attCD[olAtt] = end + olEffCd;
        S.skillCD[sk.name] = end + olEffCd;

        this._resetChainsOnCast(S, sk);

        this._ensurePerSkill(S, sk.name);
        S.perSkill[sk.name].casts++;
        S.perSkill[sk.name].castTimeMs += castMs;
        S.steps.push({ skill: sk.name, start, end, att: S.att, type: 'overload', ri: S._ri });

        if (S._hasUnstableConduit) {
            const auraMap = { Fire: 'Fire Aura', Water: 'Frost Aura', Air: 'Shocking Aura', Earth: 'Magnetic Aura' };
            const aura = auraMap[olAtt];
            if (aura) this._applyAura(S, aura, 4000, end, 'Unstable Conduit');
        }

        if (S._hasPyroPuissance && S.att === 'Fire') {
            this._trackEffect(S, 'Might', 1, 15, end);
        }
        if (sk.attunement === 'Fire') this._triggerFlameExpulsion(S, end);
        if (sk.attunement === 'Air') this._triggerElectricDischarge(S, start);
        if (sk.attunement === 'Earth') this._triggerEarthenBlast(S, start);

        if (S._hasTranscendentTempest) {
            this._refreshEffect(S, 'Transcendent Tempest', 7, end);
        }

        if (sk.attunement === 'Air') {
            S.overloadAirBonusPending = true;
        }
    }

    _anySphereActiveAt(S, time) {
        for (const w of S.sphereWindows) {
            if (w.start <= time && w.end > time) return true;
        }
        return false;
    }

    _flushPendingEnergy(S) {
        if (S.energy === null || S.energy >= CATALYST_ENERGY_MAX) return;
        for (const ev of S.eq) {
            if (ev.type !== 'hit' || ev.dmg <= 0 || ev.ws <= 0) continue;
            if (ev.time > S.t) continue;
            if (ev._energyCredited) continue;
            if (!this._anySphereActiveAt(S, ev.time) || S._hasSphereSpecialist) {
                S.energy = Math.min(CATALYST_ENERGY_MAX, S.energy + 1);
                ev._energyCredited = true;
                if (S.energy >= CATALYST_ENERGY_MAX) break;
            }
        }
    }

    _doJadeSphere(S, sk) {
        if (S.eliteSpec !== 'Catalyst') {
            S.log.push({ t: S.t, type: 'err', msg: `Jade Sphere requires Catalyst specialization` });
            return;
        }
        if (sk.attunement !== S.att) {
            S.log.push({ t: S.t, type: 'err', msg: `Need ${sk.attunement} for ${sk.name}` });
            return;
        }
        this._flushPendingEnergy(S);
        if (S.energy < CATALYST_SPHERE_COST) {
            S.log.push({ t: S.t, type: 'err', msg: `Not enough energy (${S.energy}/${CATALYST_SPHERE_COST})` });
            return;
        }
        const cdKey = this._cdKey(sk);
        const cdReady = S.skillCD[cdKey] || 0;
        if (S.t < cdReady) S.t = cdReady;

        S.energy -= CATALYST_SPHERE_COST;
        const durMs = Math.round((sk.duration || 5) * 1000);
        S.sphereActiveUntil = Math.max(S.sphereActiveUntil, S.t + durMs);
        S.sphereExpiry[sk.attunement] = Math.max(S.sphereExpiry[sk.attunement] || 0, S.t + durMs);
        S.sphereWindows.push({ start: S.t, end: S.t + durMs });

        this._trackField(S, sk, S.t);

        if (sk.recharge > 0) {
            const baseCdMs = this._attCdMs(S, Math.round(sk.recharge * 1000));
            S.skillCD[cdKey] = S.t + this._alaCd(S, baseCdMs, S.t);
        }

        S.log.push({ t: S.t, type: 'jade_sphere', skill: sk.name, att: sk.attunement, energy: S.energy, durMs });
        this._ensurePerSkill(S, sk.name);
        S.perSkill[sk.name].casts++;
        S.steps.push({ skill: sk.name, start: S.t, end: S.t, att: S.att, type: 'jade_sphere', ri: S._ri });

        if (S._hasSpectacularSphere) {
            const durMul = S._hasSphereSpecialist ? 1.5 : 1;
            this._trackEffect(S, 'Quickness', 1, 1.5 * durMul, S.t);
            const att = sk.attunement;
            if (att === 'Fire') this._trackEffect(S, 'Might', 5, 10 * durMul, S.t);
            else if (att === 'Water') this._trackEffect(S, 'Vigor', 1, 5 * durMul, S.t);
            else if (att === 'Air') this._trackEffect(S, 'Fury', 1, 5 * durMul, S.t);
            else if (att === 'Earth') this._trackEffect(S, 'Aegis', 1, 3 * durMul, S.t);
        }

        if (S._hasPyroPuissance && S.att === 'Fire') {
            this._trackEffect(S, 'Might', 1, 15, S.t);
        }
    }

    _doFamiliar(S, sk) {
        if (S.eliteSpec !== 'Evoker') {
            S.log.push({ t: S.t, type: 'err', msg: `Familiar skills require Evoker specialization` });
            return;
        }
        const famElement = EVOKER_ELEMENT_MAP[sk.name];
        if (!famElement) {
            S.log.push({ t: S.t, type: 'err', msg: `Unknown familiar: ${sk.name}` });
            return;
        }

        if (S.evokerElement !== famElement) {
            S.log.push({ t: S.t, type: 'err', msg: `Need ${famElement} familiar selected for ${sk.name} (have ${S.evokerElement || 'none'})` });
            return;
        }

        const isBasic = EVOKER_FAMILIAR_SELECTORS.has(sk.name);

        const chargesNeeded = S._hasSpecializedElements ? 4 : 6;
        if (isBasic) {
            if (S.evokerEmpowered >= 3) {
                S.log.push({ t: S.t, type: 'err', msg: `Empowered skill ready — cannot use ${sk.name}` });
                return;
            }
            if (S.evokerCharges < chargesNeeded) {
                S.log.push({ t: S.t, type: 'err', msg: `Need ${chargesNeeded} familiar charges for ${sk.name} (have ${S.evokerCharges})` });
                return;
            }
        } else {
            if (S.evokerEmpowered < 3) {
                S.log.push({ t: S.t, type: 'err', msg: `Need 3 empowered charges for ${sk.name} (have ${S.evokerEmpowered})` });
                return;
            }
        }

        const cdReady = S.skillCD[sk.name] || 0;
        if (S.t < cdReady) S.t = cdReady;

        const csvCastMs = Math.round(sk.castTime * 1000);
        const { castMs, scaleOff } = this._adjCastTime(S, csvCastMs, S.t);
        const start = S.t;
        const end = start + castMs;

        if (castMs > 0) {
            S.log.push({ t: start, type: 'cast', skill: sk.name, att: S.att, dur: castMs });
            S.castUntil = end;
        }
        if (sk.name === 'Ignite') {
            // Cycling burn durations: 2s / 0.5s / 1s / 1.5s; resets if unused for 15s
            if (start - S.igniteLastUse > 15000) S.igniteStep = 0;
            const IGNITE_DURS = [2, 0.5, 1, 1.5];
            const burnDur = IGNITE_DURS[Math.min(S.igniteStep, 3)];
            S.igniteStep = Math.min(S.igniteStep + 1, 3);
            S.igniteLastUse = start;
            insertSorted(S.eq, {
                time: start, type: 'hit',
                skill: 'Ignite', hitIdx: 1, sub: 1, totalSubs: 1,
                dmg: 0.63, ws: this._ws(sk),
                isField: false, cc: false,
                conds: { Burning: { stacks: 1, duration: burnDur } },
                att: S.att, att2: S.att2, castStart: start,
                conjure: S.conjureEquipped || null,
            });
        } else {
            this._scheduleHits(S, sk, start, scaleOff);
        }
        S.t = end;
        if (castMs > 0) S.log.push({ t: end, type: 'cast_end', skill: sk.name });

        if (isBasic) {
            S.evokerCharges = 0;
            S.evokerEmpowered++;
            S.log.push({ t: end, type: 'familiar_basic', skill: sk.name, empowered: S.evokerEmpowered });
        } else {
            S.evokerEmpowered = 0;
            S.log.push({ t: end, type: 'familiar_empowered', skill: sk.name });
        }

        if (sk.recharge > 0) {
            const baseCdMs = Math.round(sk.recharge * 1000);
            S.skillCD[sk.name] = end + this._alaCd(S, baseCdMs, end);
        }

        this._ensurePerSkill(S, sk.name);
        S.perSkill[sk.name].casts++;
        S.perSkill[sk.name].castTimeMs += castMs;
        S.steps.push({ skill: sk.name, start, end, att: S.att, type: 'familiar', ri: S._ri });

        if (S._hasPyroPuissance && S.att === 'Fire') {
            this._trackEffect(S, 'Might', 1, 15, end);
        }

        if (S._hasFamiliarsProwess) {
            this._grantFamiliarProwess(S, end);
        }
        if (S._hasFamiliarsBlessing) {
            if (famElement === 'Fire' || famElement === 'Air') {
                this._trackEffect(S, 'Quickness', 1, 3, end);
            } else {
                this._trackEffect(S, 'Alacrity', 1, 4, end);
            }
        }
        if (S._hasGalvanicEnchantment) {
            S.electricEnchantmentStacks += 2;
        }

        // Lightning Blitz always grants 1 electric enchantment stack (independent of traits)
        if (sk.name === 'Lightning Blitz') {
            S.electricEnchantmentStacks++;
        }

        // Zap active: 3% additive crit strike bonus for 10s
        if (sk.name === 'Zap') {
            this._trackEffect(S, 'Zap Buff', 1, 5, end);
            S.log.push({ t: end, type: 'skill_proc', skill: 'Zap', detail: 'Zap Buff 10s' });
        }

        if (S._hasSpecializedElements) {
            const pct = isBasic ? 0.10 : 0.50;
            this._rechargeWeaponSkills(S, pct, end);
            if (!isBasic) {
                this._triggerAttunementEnterEffects(S, S.evokerElement, end);
            }
        }
    }

    _getChainRoot(sk) {
        const slot = sk.slot;
        const att = sk.attunement;
        const weapon = sk.weapon;
        const candidates = this.skills.filter(s =>
            s.slot === slot && s.attunement === att && s.weapon === weapon && s.chainSkill
        );
        if (candidates.length === 0) return sk.name;
        const targets = new Set(candidates.map(s => s.chainSkill));
        const root = candidates.find(s => !targets.has(s.name));
        return root ? root.name : candidates[0].name;
    }

    _resetChainsOnCast(S, sk) {
        if (Math.round((sk.castTime || 0) * 1000) === 0) return;
        const ownRoot = sk.chainSkill ? this._getChainRoot(sk) : null;
        const carryRoot = S.aaCarryover?.root || null;
        for (const key of Object.keys(S.chainState)) {
            if (key === ownRoot || key === carryRoot) continue;
            if (S.chainState[key] !== key) {
                // Non-slot-1 chains have a 5s window — only reset if expired
                if (S.chainExpiry[key] !== undefined && S.chainExpiry[key] > S.t) continue;
                S.chainState[key] = key;
                delete S.chainExpiry[key];
            }
        }
    }

    _propagateChainCD(S, sk, cdTime) {
        let chain = sk.chainSkill;
        const visited = new Set([sk.name]);
        while (chain && !visited.has(chain)) {
            const cs = this._skill(chain);
            if (!cs) break;
            S.skillCD[this._cdKey(cs)] = cdTime;
            visited.add(chain);
            chain = cs.chainSkill;
        }
    }

    _fillGap(S, sk, gapMs) {
        const start = S.t;
        const end = start + gapMs;
        const ws = this._ws(sk);
        const rows = this.skillHits[sk.name] || [];

        S.log.push({ t: start, type: 'cast', skill: sk.name, att: S.att, dur: gapMs });

        for (const h of rows) {
            const off = h.startOffsetMs || 0;
            if (off >= gapMs) break; // rows are ascending; no hits fire beyond the gap
            insertSorted(S.eq, {
                time: start + off, type: 'hit',
                skill: sk.name, hitIdx: h.hit, sub: 1, totalSubs: 1,
                dmg: h.damage, ws, isField: false, cc: h.cc,
                conds: h.conditions,
                finType: h.finisherType, finVal: h.finisherValue,
                att: S.att, att2: S.att2, castStart: start,
                conjure: S.conjureEquipped || null,
            });
        }

        S.log.push({ t: end, type: 'cast_end', skill: sk.name });
        this._ensurePerSkill(S, sk.name);
        S.perSkill[sk.name].casts++;
        S.perSkill[sk.name].castTimeMs += gapMs;

        S.t = end;
        S.castUntil = end;
        // Pass gap-fill metadata through to the target skill's step entry
        S._pendingPartialFill = { skill: sk.name, durationMs: gapMs, startMs: start };
    }

    _trackField(S, sk, castEnd) {
        if (!sk.comboField || sk.duration <= 0) return;
        let dur = sk.duration * 1000;
        if (S._hasPersistingFlames && FIRE_FIELD_SKILLS.has(sk.name)) dur += 2000;
        S.fields.push({ type: sk.comboField, start: castEnd, end: castEnd + dur, skill: sk.name });
        S.log.push({ t: castEnd, type: 'field', field: sk.comboField, skill: sk.name, dur });
    }

    _applyAura(S, auraName, durMs, time, skill) {
        console.log('applyAura', auraName, time, skill);
        if (S._hasSmothering) durMs = Math.round(durMs * 1.33);
        S.auras.push({ type: auraName, end: time + durMs, skill });
        this._pushCondStack(S, { t: time, cond: auraName, expiresAt: time + durMs });
        S.log.push({ t: time, type: 'aura', aura: auraName, skill, dur: durMs });
        if (S._hasZephyrsBoon) {
            this._trackEffect(S, 'Fury', 1, 5, time);
            this._trackEffect(S, 'Swiftness', 1, 5, time);
        }
        if (S._hasElementalShielding) {
            this._trackEffect(S, 'Protection', 1, 3, time);
        }
        if (S._hasInvigoratingTorrents) {
            this._trackEffect(S, 'Vigor', 1, 5, time);
            this._trackEffect(S, 'Regeneration', 1, 5, time);
        }
        if (S._hasTempestuousAria) {
            this._refreshEffect(S, 'Tempestuous Aria', 5, time);
        }
        if (S._hasElementalBastion) {
            this._trackEffect(S, 'Alacrity', 1, 4, time);
        }
        if (S._hasEmpoweringAuras) {
            this._grantEmpoweringAuras(S, time);
        }
        if (S._hasElemEpitome) {
            this._grantElemEmpowerment(S, 1, time, skill);
        }
    }

    _refreshEffect(S, effectName, durSec, time) {
        const arr = S._condMap.get(effectName);
        if (arr) {
            for (const s of arr) {
                if (s.expiresAt > time) s.expiresAt = time;
            }
        }
        this._trackEffect(S, effectName, 1, durSec, time);
    }

    _grantFamiliarProwess(S, time) {
        const arr = S._condMap.get("Familiar's Prowess");
        const existing = arr?.find(s => s.expiresAt > time && !s.perma);
        if (existing) {
            existing.expiresAt = Math.min(existing.expiresAt + 5000, time + 15000);
        } else {
            this._pushCondStack(S, { t: time, cond: "Familiar's Prowess", expiresAt: time + 5000 });
        }
    }

    _rechargeWeaponSkills(S, pct, time) {
        for (const sk of this.skills) {
            if (sk.type !== 'Weapon skill') continue;
            const key = this._cdKey(sk);
            const cdTime = S.skillCD[key];
            if (!cdTime || cdTime <= time) continue;
            const remaining = cdTime - time;
            S.skillCD[key] = time + Math.round(remaining * (1 - pct));
        }
    }

    _triggerAttunementEnterEffects(S, element, time) {
        if (element === 'Fire') this._triggerSunspot(S, time);
        if (element === 'Air') {
            this._triggerElectricDischarge(S, time);
            if (S._hasOneWithAir) this._trackEffect(S, 'Superspeed', 1, 3, time);
            if (S._hasInscription) this._trackEffect(S, 'Resistance', 1, 3, time);
            if (S._hasFreshAir) this._applyFreshAirBuff(S, time);
        }
        if (element === 'Water') {
            if (S._hasLatentStamina && time >= (S.traitICD['LatentStamina'] || 0)) {
                S.traitICD['LatentStamina'] = time + 10000;
                this._trackEffect(S, 'Vigor', 1, 3, time);
            }
        }
        if (element === 'Earth') {
            this._triggerEarthenBlast(S, time);
            if (S._hasRockSolid) this._grantRockSolid(S, time);
        }
        if (S._hasElemDynamo && element === S.evokerElement) {
            const maxCh = S._hasSpecializedElements ? 4 : 6;
            S.evokerCharges = Math.min(maxCh, S.evokerCharges + 1);
        }
        if (S._hasElemBalance && element === S.evokerElement) {
            S.elemBalanceCount++;
            if (S.elemBalanceCount % 2 === 0) {
                S.elemBalanceActive = true;
                S.elemBalanceExpiry = time + 5000;
            }
        }
    }

    _getEmpMul(S, time) {
        const stacks = Math.min(this._effectStacksAt(S, 'Elemental Empowerment', time), 10);
        if (stacks === 0) return 0;
        if (S._hasEmpoweredEmpowerment) return stacks === 10 ? 0.20 : stacks * 0.015;
        return stacks * 0.01;
    }

    _grantElemEmpowerment(S, stacks, time, source) {
        const current = Math.min(this._effectStacksAt(S, 'Elemental Empowerment', time), 10);
        const toAdd = Math.min(stacks, 10 - current);
        for (let i = 0; i < toAdd; i++) {
            this._pushCondStack(S, { t: time, cond: 'Elemental Empowerment', expiresAt: time + 15000 });
        }
        if (toAdd > 0 && source) {
            S.log.push({ t: time, type: 'apply', effect: 'Elemental Empowerment', stacks: toAdd, dur: 15, skill: source });
        }
    }

    // _grantEmpoweringAuras(S, time) {
    //     console.trace('grantEmpoweringAuras called', time, new Error().stack);
    //     const durMs = 10000;
    //     const arr = S._condMap.get('Empowering Auras');
    //     const existing = arr ? arr.filter(s => s.expiresAt > time && !s.perma) : [];
    //     console.log('grantEmpoweringAuras', time, 'existing:', existing.length, 'condMap size:', S._condMap.get('Empowering Auras')?.length);
    //     for (const s of existing) s.expiresAt = time + durMs;
    //     if (existing.length < 5) {
    //         this._pushCondStack(S, { t: time, cond: 'Empowering Auras', expiresAt: time + durMs });
    //         S.log.push({ t: time, type: 'apply', effect: 'Empowering Auras', stacks: 1, dur: durMs / 1000, skill: 'Empowering Auras' });
    //     } else {
    //         // Refresh only — log the refresh so the graph reflects the updated duration
    //         S.log.push({ t: time, type: 'refresh', effect: 'Empowering Auras', stacks: existing.length, dur: durMs / 1000, skill: 'Empowering Auras' });
    //     }
    // }

    _grantEmpoweringAuras(S, time) {
        const durMs = 10000;
        const arr = S._condMap.get('Empowering Auras');
        const existing = arr ? arr.filter(s => s.t <= time && s.expiresAt > time && !s.perma) : [];
        console.log('grantEmpoweringAuras', time, 'existing:', existing.length, 'all stacks:', arr ? arr.map(s => `t=${s.t} exp=${s.expiresAt}`) : []);
        console.log('grantEmpoweringAuras', time, 'existing:', existing.length, 'total in map:', arr?.length ?? 0);
        for (const s of existing) s.expiresAt = time + durMs;
        if (existing.length < 5) {
            this._pushCondStack(S, { t: time, cond: 'Empowering Auras', expiresAt: time + durMs });
            S.log.push({ t: time, type: 'apply', effect: 'Empowering Auras', stacks: 1, dur: durMs / 1000, skill: 'Empowering Auras' });
        } else {
            S.log.push({ t: time, type: 'refresh', effect: 'Empowering Auras', stacks: existing.length, dur: durMs / 1000, skill: 'Empowering Auras' });
        }
    }

    _checkCombo(S, ev) {
        if (!ev.finType) return;
        const activeField = S.fields.find(f => f.start <= ev.time && f.end > ev.time);
        if (!activeField) return;
        // Use the player's actual attunement at hit-fire time, not the cast-time attunement
        // baked into ev.att.  A skill cast in Earth but hitting after an Air swap must use
        // the Air ICD key so the per-attunement 10 s cooldowns are independent.
        const att = this._attAt(S, ev.time);

        if (S._hasElemEpitome) {
            const icdKey = `EpitomeCombo_${att}`;
            if (ev.time >= (S.traitICD[icdKey] || 0)) {
                S.traitICD[icdKey] = ev.time + 10000;
                const auraMap = {
                    Fire: ['Fire Aura', 4000], Water: ['Frost Aura', 4000],
                    Air: ['Shocking Aura', 3000], Earth: ['Magnetic Aura', 3000]
                };
                const a = auraMap[att];
                if (a) this._applyAura(S, a[0], a[1], ev.time, 'Elemental Epitome');
            }
        }
        if (S._hasElemSynergy) {
            const icdKey = `SynergyCombo_${att}`;
            if (ev.time >= (S.traitICD[icdKey] || 0)) {
                S.traitICD[icdKey] = ev.time + 10000;
                if (att === 'Fire') this._trackEffect(S, 'Might', 6, 10, ev.time);
                else if (att === 'Earth') this._trackEffect(S, 'Stability', 2, 6, ev.time);
            }
        }

        const fieldType = activeField.type;
        const finType = ev.finType;
        const finVal = ev.finVal;

        if (finType === 'Blast' || finType === 'Leap') {
            this._applyComboEffect(S, fieldType, finType, ev.time, ev.skill);
            if (finType === 'Blast' && S.activeRelic === 'Bloodstone') {
                this._checkBloodstoneBlast(S, ev.time);
            }
            if (fieldType === 'Water' && S.activeRelic === 'Steamshrieker') {
                const rc = RELIC_PROCS.Steamshrieker.conditions;
                for (const [cond, v] of Object.entries(rc)) {
                    this._applyCondition(S, cond, v.stacks, v.dur, ev.time, 'Relic of Steamshrieker');
                }
                S.log.push({ t: ev.time, type: 'relic_proc', relic: 'Steamshrieker', skill: 'Relic of Steamshrieker' });
                S.steps.push({ skill: 'Relic of Steamshrieker', start: ev.time, end: ev.time, att: S.att, type: 'relic_proc', ri: -1, icon: 'https://render.guildwars2.com/file/23B0F0A5BF05E05C9F527BF7EB4962C9F49C6F42/3441975.png' });
            }
        } else if (finType === 'Projectile') {
            // Accumulator gives deterministic expected-value procs for fractional chances
            S.comboAccum.Projectile = (S.comboAccum.Projectile || 0) + finVal;
            if (S.comboAccum.Projectile >= 1) {
                S.comboAccum.Projectile -= 1;
                this._applyComboEffect(S, fieldType, finType, ev.time, ev.skill);
            }
        } else if (finType === 'Whirl') {
            // Each unit of finVal is an independent 100% proc
            for (let i = 0; i < finVal; i++) {
                this._applyComboEffect(S, fieldType, finType, ev.time, ev.skill);
            }
        }
    }

    _applyComboEffect(S, fieldType, finType, time, skill) {
        const src = `Combo (${fieldType}/${finType})`;

        if (fieldType === 'Fire') {
            if (finType === 'Blast') {
                this._trackEffect(S, 'Might', 3, 20, time);
            } else if (finType === 'Leap') {
                this._applyAura(S, 'Fire Aura', 5000, time, src);
            } else {
                this._applyCondition(S, 'Burning', 1, 1, time, src);
            }
        } else if (fieldType === 'Ice') {
            if (finType === 'Blast') {
                this._applyAura(S, 'Frost Aura', 3000, time, src);
            } else if (finType === 'Leap') {
                this._applyAura(S, 'Frost Aura', 5000, time, src);
            } else {
                this._trackEffect(S, 'Chilled', 1, 1, time);
            }
        } else if (fieldType === 'Lightning') {
            if (finType === 'Blast') {
                this._trackEffect(S, 'Swiftness', 1, 10, time);
            } else if (finType === 'Leap') {
                // Daze/CC — no DPS impact, logged only
                S.log.push({ t: time, type: 'combo', field: fieldType, finisher: finType, effect: 'CC', skill });
                return;
            } else {
                this._trackEffect(S, 'Vulnerability', 2, 5, time);
            }
        } else if (fieldType === 'Poison') {
            if (finType === 'Blast') {
                this._trackEffect(S, 'Weakness', 1, 3, time);
            } else if (finType === 'Leap') {
                this._trackEffect(S, 'Weakness', 1, 8, time);
            } else {
                this._applyCondition(S, 'Poisoned', 1, 2, time, src);
            }
        } else if (fieldType === 'Water') {
            if (finType === 'Projectile') {
                this._trackEffect(S, 'Regeneration', 1, 2, time);
            } else {
                // Blast/Leap/Whirl produce healing — not tracked
                return;
            }
        } else {
            return;
        }

        S.log.push({ t: time, type: 'combo', field: fieldType, finisher: finType, skill });
    }

    _applyBoonExtension(S, durSec, time) {
        const extMs = Math.round(durSec * 1000);
        for (const boon of BOONS) {
            const arr = S._condMap.get(boon);
            if (!arr) continue;
            for (const s of arr) {
                if (s.expiresAt > time) s.expiresAt += extMs;
            }
        }
        // Keep the explicit Quickness/Alacrity expiry fields in sync
        if (S.quicknessUntil > time) S.quicknessUntil += extMs;
        if (S.alacrityUntil > time) S.alacrityUntil += extMs;
        S.log.push({ t: time, type: 'boon_extension', extMs });
    }

    _applyPrimordialStance(S, att1, att2, time) {
        const STANCE_CONDS = {
            Fire: () => this._applyCondition(S, 'Burning', 1, 2, time, 'Primordial Stance'),
            Water: () => this._trackEffect(S, 'Chilled', 1, 1, time),
            Air: () => this._trackEffect(S, 'Vulnerability', 8, 3, time),
            Earth: () => this._applyCondition(S, 'Bleeding', 2, 6, time, 'Primordial Stance'),
        };
        // Apply for primary and (if Weaver) secondary attunement independently
        // Dual same-element (Fire/Fire) applies the effect twice
        const attunements = att2 !== null ? [att1, att2] : [att1];
        for (const att of attunements) {
            STANCE_CONDS[att]?.();
        }
    }

    _trackAura(S, sk, castEnd) {
        if (!sk.aura) return;
        const parts = sk.aura.split('|');
        const aType = parts[0];
        const aDur = (parseFloat(parts[1]) || 0) * 1000;
        if (aDur > 0) this._applyAura(S, aType + ' Aura', aDur, castEnd, sk.name);
    }

    _triggerSunspot(S, time) {
        if (!S._hasSunspot) return;
        if (S.eliteSpec === 'Evoker' && time < (S.traitICD['Sunspot'] || 0)) return;
        if (S.eliteSpec === 'Evoker') S.traitICD['Sunspot'] = time + 5000;

        this._applyAura(S, 'Fire Aura', 3000, time, 'Sunspot');

        insertSorted(S.eq, {
            time, type: 'hit',
            skill: 'Sunspot', hitIdx: 1, sub: 1, totalSubs: 1,
            dmg: 0.6, ws: 690.5,
            isField: false, cc: false, conds: null,
            noCrit: true, att: S.att, isTraitProc: true,
        });

        if (S._hasBurningRage) {
            this._applyCondition(S, 'Burning', 2, 4, time, 'Sunspot');
        }

        S.log.push({ t: time, type: 'trait_proc', trait: 'Sunspot', skill: 'Sunspot' });
        S.steps.push({
            skill: 'Sunspot', start: time, end: time, att: S.att, type: 'trait_proc', ri: -1,
            icon: 'https://render.guildwars2.com/file/1405047ED70DE30F80B1F6304A787B215BB50878/1012316.png',
        });
    }

    _triggerFlameExpulsion(S, time) {
        if (!S._hasPyroPuissance) return;
        if (S.eliteSpec === 'Evoker' && time < (S.traitICD['FlameExpulsion'] || 0)) return;
        if (S.eliteSpec === 'Evoker') S.traitICD['FlameExpulsion'] = time + 5000;

        const might = this._mightStacksAt(S, time);
        const capped = Math.min(might, 10);
        const coeff = 1.0 + 0.05 * capped;
        const burnDur = Math.min(2 + 0.5 * capped, 7);

        insertSorted(S.eq, {
            time, type: 'hit',
            skill: 'Flame Expulsion', hitIdx: 1, sub: 1, totalSubs: 1,
            dmg: coeff, ws: 690.5,
            isField: false, cc: false, conds: null,
            noCrit: false, att: S.att, isTraitProc: true,
        });

        this._applyCondition(S, 'Burning', 1, burnDur, time, 'Flame Expulsion');

        S.log.push({ t: time, type: 'trait_proc', trait: 'Flame Expulsion', skill: 'Flame Expulsion' });
        S.steps.push({
            skill: 'Flame Expulsion', start: time, end: time, att: S.att, type: 'trait_proc', ri: -1,
            icon: 'https://render.guildwars2.com/file/998095CB1FD2CF0164B8A36BABFDB911DF08DB02/1012313.png',
        });
    }

    _attAt(S, t) {
        let att = S.attTimeline[0].att;
        for (const e of S.attTimeline) {
            if (e.t > t) break;
            att = e.att;
        }
        return att;
    }

    _att2At(S, t) {
        let att2 = S.attTimeline[0].att2 || null;
        for (const e of S.attTimeline) {
            if (e.t > t) break;
            if (e.att2 !== undefined) att2 = e.att2;
        }
        return att2;
    }

    _pyroRechargeMs(S, sk, baseMs) {
        // Read directly from activeTraitNames (not S._has* flags) so CDR is never stripped
        // by the contribution analysis, which only disables the damage multiplier portion.
        if (sk.type === 'Weapon skill') {
            if (this._hasTrait("Pyromancer's Training") && sk.attunement === 'Fire') baseMs = Math.round(baseMs * 0.8);
            if (this._hasTrait("Aeromancer's Training") && sk.attunement === 'Air') baseMs = Math.round(baseMs * 0.8);
            if (this._hasTrait("Geomancer's Training") && sk.attunement === 'Earth') baseMs = Math.round(baseMs * 0.8);
            if (this._hasTrait("Aquamancer's Training") && sk.attunement === 'Water') baseMs = Math.round(baseMs * 0.8);
        }
        return baseMs;
    }

    _triggerEarthenBlast(S, time) {
        if (!S._hasEarthenBlast) return;
        if (S.eliteSpec === 'Evoker' && time < (S.traitICD['EarthenBlast'] || 0)) return;
        if (S.eliteSpec === 'Evoker') S.traitICD['EarthenBlast'] = time + 5000;

        insertSorted(S.eq, {
            time, type: 'hit',
            skill: 'Earthen Blast', hitIdx: 1, sub: 1, totalSubs: 1,
            dmg: 0.36, ws: 690.5,
            isField: false, cc: false, conds: null,
            noCrit: true, att: S.att, isTraitProc: true,
        });

        S.log.push({ t: time, type: 'trait_proc', trait: 'Earthen Blast', skill: 'Earthen Blast' });
        S.steps.push({ skill: 'Earthen Blast', start: time, end: time, att: S.att, type: 'trait_proc', ri: -1, icon: 'https://render.guildwars2.com/file/2531DCAFAEAB452C90C4572E1ADCE8236DCF5636/1012304.png' });
    }

    _grantRockSolid(S, time) {
        if (S.eliteSpec === 'Evoker' && time < (S.traitICD['RockSolid'] || 0)) return;
        if (S.eliteSpec === 'Evoker') S.traitICD['RockSolid'] = time + 5000;
        this._trackEffect(S, 'Stability', 1, 3, time);
    }

    _triggerElectricDischarge(S, time) {
        if (!S._hasElectricDischarge) return;

        insertSorted(S.eq, {
            time, type: 'hit',
            skill: 'Electric Discharge', hitIdx: 1, sub: 1, totalSubs: 1,
            dmg: 0.35, ws: 690.5,
            isField: false, cc: false,
            conds: { Vulnerability: { stacks: 1, duration: 8 } },
            noCrit: false, att: S.att, isTraitProc: true,
            bonusCritDmg: 100,
        });

        S.log.push({ t: time, type: 'trait_proc', trait: 'Electric Discharge', skill: 'Electric Discharge' });
        S.steps.push({
            skill: 'Electric Discharge', start: time, end: time, att: S.att, type: 'trait_proc', ri: -1,
            icon: 'https://render.guildwars2.com/file/F4622EE8300028599369D4084EA7A2774D250DEA/1012280.png',
        });
    }

    // Find the earliest queued hit event in [fromTime, upTo] that would trigger a Fresh Air
    // CD reset. If found, eagerly applies the reset to S.attCD['Air'] and updates
    // S.freshAirAccum so the main event loop's _checkFreshAir call doesn't double-proc.
    // Returns the hit time, or null if no Fresh Air reset would occur before upTo.
    _freshAirResetTimeInRange(S, fromTime, upTo) {
        if (!S._hasFreshAir) return null;
        const a = this.attributes.attributes;
        const baseCritCh = a['Critical Chance']?.final ?? 0;
        const furyBonus = this._effectStacksAt(S, 'Fury', fromTime) > 0 ? S._furyCritBonus : 0;
        const ccPct = Math.min(baseCritCh + furyBonus, 100);
        if (ccPct <= 0) return null;

        let accum = S.freshAirAccum;
        for (const ev of S.eq) {
            if (ev.time < fromTime) continue;
            if (ev.time > upTo) break;
            if (ev.type !== 'hit') continue;
            if (ev.isSigilProc || ev.isRelicProc || ev.isTraitProc) continue;
            if (ev.noCrit) continue;
            if (ev.dmg <= 0 || !ev.ws) continue;
            const hitAtt = this._attAt(S, ev.time);
            if (hitAtt === 'Air') continue;
            accum += ccPct / 100;
            if (accum >= 1) {
                // Eagerly apply the reset so S.attCD['Air'] and S.skillCD['Overload Air']
                // reflect it before the swap proceeds.
                // Deduct 1 from the accumulator; _checkFreshAir in the main loop will skip
                // applying another reset since attCD['Air'] will already be ≤ ev.time.
                S.freshAirAccum = accum - 1;
                S.attCD['Air'] = Math.min(S.attCD['Air'] || 0, ev.time);
                S.skillCD['Overload Air'] = Math.min(S.skillCD['Overload Air'] || 0, ev.time);
                S.freshAirResetAt = ev.time;
                S.log.push({ t: ev.time, type: 'trait_proc', trait: 'Fresh Air', skill: 'Fresh Air (CD reset)', detail: 'Air attunement recharged (pre-swap)' });
                return ev.time;
            }
        }
        return null;
    }

    _checkFreshAir(S, time, critChancePct) {
        if (critChancePct <= 0) return;
        // Only recharges Air attunement when hitting in Fire, Water, or Earth — not while already in Air
        const hitAtt = this._attAt(S, time);
        if (hitAtt === 'Air') return;
        S.freshAirAccum += critChancePct / 100;
        if (S.freshAirAccum >= 1) {
            S.freshAirAccum -= 1;
            S.attCD['Air'] = Math.min(S.attCD['Air'] || 0, time);
            // Also reset the Overload Air skill CD — after Fresh Air you only wait the dwell,
            // not the remaining overload recharge.
            S.skillCD['Overload Air'] = Math.min(S.skillCD['Overload Air'] || 0, time);
            // Record the reset time so _doSwap/_doWeaverSwap don't re-apply a higher CD to Air
            S.freshAirResetAt = time;
            S.log.push({ t: time, type: 'trait_proc', trait: 'Fresh Air', skill: 'Fresh Air (CD reset)', detail: 'Air attunement recharged' });
        }
    }

    _applyFreshAirBuff(S, time) {
        this._pushCondStack(S, { t: time, cond: 'Fresh Air', expiresAt: time + 5000 });
        S.log.push({ t: time, type: 'trait_proc', trait: 'Fresh Air', skill: 'Fresh Air', icon: 'https://render.guildwars2.com/file/FA64C9F2750F986E52E8376F22EDBA3844A8C603/1012277.png' });
    }

    _triggerLightningRod(S, time) {
        insertSorted(S.eq, {
            time, type: 'hit',
            skill: 'Lightning Rod', hitIdx: 1, sub: 1, totalSubs: 1,
            dmg: 1.5, ws: 690.5,
            isField: false, cc: false,
            conds: { Weakness: { stacks: 1, duration: 4 } },
            noCrit: false, att: S.att, isTraitProc: true,
        });

        S.log.push({ t: time, type: 'trait_proc', trait: 'Lightning Rod', skill: 'Lightning Rod' });
        S.steps.push({
            skill: 'Lightning Rod', start: time, end: time, att: S.att, type: 'trait_proc', ri: -1,
            icon: 'https://render.guildwars2.com/file/0D26024404D06BBB0A3BD70340251740C73E0F2C/1012278.png',
        });
    }

    _checkRagingStorm(S, time, critChancePct) {
        if (critChancePct <= 0) return;
        S.traitRagingStormAccum += critChancePct / 100;
        if (S.traitRagingStormAccum < 1) return;
        if (time < (S.traitICD['RagingStorm'] || 0)) return;
        S.traitRagingStormAccum -= 1;
        S.traitICD['RagingStorm'] = time + 8000;
        this._trackEffect(S, 'Fury', 1, 4, time);
        S.log.push({ t: time, type: 'trait_proc', trait: 'Raging Storm', skill: 'Raging Storm' });
    }

    _grantPersistingFlames(S, time) {
        const active = this._effectStacksAt(S, 'Persisting Flames', time);
        if (active >= 5) return;
        this._pushCondStack(S, { t: time, cond: 'Persisting Flames', expiresAt: time + 15000 });
    }

    _scheduleHits(S, sk, castStart, scaleOff = off => off) {
        // GW2 shout skills have display quotes in their names (e.g. "Feel the Burn!").
        // The Skills CSV stores them quoted, but the Skill_hits CSV may not.
        // Try both the raw name and the name with surrounding quotes stripped.
        const strippedName = sk.name.replace(/^"|"$/g, '');
        const rows = this.skillHits[sk.name] || this.skillHits[strippedName] || [];
        const ws = this._ws(sk);

        // Tag Hammer orb ticks so Grand Finale can cancel them
        const hammerOrbElement = HAMMER_ORB_SKILLS[sk.name] || (HAMMER_DUAL_ORB_SKILLS[sk.name] ? 'Dual' : null);

        // Consume "next Spear skill" buffs for non-slot-1 Spear weapon skills
        const isSpearWeapon = sk.weapon === 'Spear' && sk.type === 'Weapon skill' && sk.slot !== '1';
        const spearDmgBonus = isSpearWeapon && S.spearNextDmgBonus;
        const spearGirantCrit = isSpearWeapon && S.spearNextGuaranteedCrit;
        const spearCCHit = isSpearWeapon && S.spearNextCCHit;
        if (isSpearWeapon) {
            if (spearDmgBonus) S.spearNextDmgBonus = false;
            if (spearGirantCrit) S.spearNextGuaranteedCrit = false;
            if (spearCCHit) S.spearNextCCHit = false;
        }

        let firstHitScheduled = false;
        for (const h of rows) {
            const off = scaleOff(h.startOffsetMs || 0);
            const rep = h.repeatOffsetMs || 0;
            let count = 1;
            let durBased = false;
            const raw = h.numberOfImpacts;

            if (raw === 'Duration') {
                durBased = true;
                let effectiveDur = h.duration || 1;
                if (S._hasPersistingFlames && FIRE_FIELD_SKILLS.has(sk.name) && h.isFieldTick) {
                    effectiveDur += 2;
                }
                count = Math.floor(effectiveDur / (h.interval || 1)) || 1;
            } else {
                const n = parseInt(raw) || 1;
                if (n > 1) count = n;
            }

            const perHit = durBased ? h.damage : (count > 1 ? h.damage / count : h.damage);
            const effectiveRep = rep > 0 ? rep : (durBased && count > 1 ? (h.interval || 1) * 1000 : 0);

            for (let i = 0; i < count; i++) {
                const t = castStart + off + (effectiveRep > 0 && count > 1 ? i * effectiveRep : 0);
                const isFirstHit = !firstHitScheduled;
                firstHitScheduled = true;
                insertSorted(S.eq, {
                    time: t, type: 'hit',
                    skill: sk.name, hitIdx: h.hit, sub: i + 1, totalSubs: count,
                    dmg: perHit, ws, isField: h.isFieldTick, cc: h.cc,
                    conds: h.conditions,
                    finType: h.finisherType, finVal: h.finisherValue,
                    att: S.att, att2: S.att2, castStart,
                    conjure: S.conjureEquipped || null,
                    spearDmgBonus: spearDmgBonus || undefined,
                    spearForceCrit: spearGirantCrit || undefined,
                    spearCCHit: (spearCCHit && isFirstHit) || undefined,
                    hammerOrbElement: (hammerOrbElement && durBased) ? hammerOrbElement : undefined,
                    frigidFlurryProc: S._frigidFlurryProcActive || undefined,
                });
            }
        }
    }

    _checkOnCritSigils(S, time, critChancePct) {
        const critSigils = this._activeProcSigils.filter(n => SIGIL_PROCS[n].trigger === 'crit');
        if (critSigils.length === 0 || critChancePct <= 0) return;

        S.sigilCritAccum += critChancePct / 100;
        if (S.sigilCritAccum < 1) return;
        S.sigilCritAccum -= 1;

        for (const name of critSigils) {
            const proc = SIGIL_PROCS[name];
            if (time < (S.sigilICD[name] || 0)) continue;
            S.sigilICD[name] = time + proc.icd;

            if (proc.effect === 'strike') {
                insertSorted(S.eq, {
                    time, type: 'hit',
                    skill: `Sigil of ${name}`, hitIdx: 1, sub: 1, totalSubs: 1,
                    dmg: proc.coeff, ws: proc.ws,
                    isField: false, cc: false, conds: null,
                    isSigilProc: true, noCrit: !proc.canCrit, att: S.att,
                });
            } else if (proc.effect === 'condition') {
                this._applyCondition(S, proc.cond, proc.stacks, proc.dur, time, `Sigil of ${name}`);
            }
            S.log.push({ t: time, type: 'sigil_proc', sigil: name, skill: `Sigil of ${name}` });
            S.steps.push({ skill: `Sigil of ${name}`, start: time, end: time, att: S.att, type: 'sigil_proc', ri: -1, icon: proc.icon });
        }
    }

    _checkBurningPrecision(S, time, critChancePct) {
        if (critChancePct <= 0) return;
        S.traitBurnPrecAccum += (critChancePct / 100) * 0.33;
        if (S.traitBurnPrecAccum < 1) return;
        if (time < (S.traitICD['BurningPrecision'] || 0)) return;
        S.traitBurnPrecAccum -= 1;
        S.traitICD['BurningPrecision'] = time + 5000;
        this._applyCondition(S, 'Burning', 1, 3, time, 'Burning Precision');
        S.log.push({ t: time, type: 'trait_proc', trait: 'Burning Precision', skill: 'Burning Precision' });
        S.steps.push({ skill: 'Burning Precision', start: time, end: time, att: S.att, type: 'trait_proc', ri: -1, icon: 'https://render.guildwars2.com/file/774471FA3841BB90EB6F935A76D8017A0C4B005E/1012306.png' });
    }

    _checkArcanePrecision(S, time, critChancePct, attunement) {
        if (critChancePct <= 0) return;
        S.traitArcanePrecAccum += (critChancePct / 100) * 0.33;
        if (S.traitArcanePrecAccum < 1) return;
        if (time < (S.traitICD['ArcanePrecision'] || 0)) return;
        S.traitArcanePrecAccum -= 1;
        S.traitICD['ArcanePrecision'] = time + 3000;
        if (attunement === 'Fire') this._applyCondition(S, 'Burning', 1, 1.5, time, 'Arcane Precision');
        else if (attunement === 'Water') this._trackEffect(S, 'Vulnerability', 1, 10, time);
        else if (attunement === 'Air') this._trackEffect(S, 'Weakness', 1, 3, time);
        else if (attunement === 'Earth') this._applyCondition(S, 'Bleeding', 1, 5, time, 'Arcane Precision');
        S.log.push({ t: time, type: 'trait_proc', trait: 'Arcane Precision', skill: 'Arcane Precision' });
        S.steps.push({ skill: 'Arcane Precision', start: time, end: time, att: S.att, type: 'trait_proc', ri: -1, icon: 'https://render.guildwars2.com/file/1CB6B7903F10246E9405DD625380161FCD4E6C23/1012282.png' });
    }

    _checkRenewingStamina(S, time, critChancePct) {
        if (critChancePct <= 0) return;
        S.traitRenewingStaminaAccum += critChancePct / 100;
        if (S.traitRenewingStaminaAccum < 1) return;
        if (time < (S.traitICD['RenewingStamina'] || 0)) return;
        S.traitRenewingStaminaAccum -= 1;
        S.traitICD['RenewingStamina'] = time + 10000;
        this._trackEffect(S, 'Vigor', 1, 5, time);
    }

    _applyElemAttunementBoon(S, attunement, time) {
        if (attunement === 'Fire') this._trackEffect(S, 'Might', 1, 15, time);
        else if (attunement === 'Water') this._trackEffect(S, 'Regeneration', 1, 5, time);
        else if (attunement === 'Air') this._trackEffect(S, 'Swiftness', 1, 8, time);
        else if (attunement === 'Earth') this._trackEffect(S, 'Protection', 1, 5, time);
    }

    // Elemental Enchantment: −15% attunement swap recharge (applied before Alacrity)
    _attCdMs(S, baseCdMs) {
        return S._hasElemEnchantment ? Math.round(baseCdMs * 0.85) : baseCdMs;
    }

    // Arcane Lightning: 150 Ferocity buff (15s, refreshes on each Arcane cast)
    _refreshArcaneLightningBuff(S, time) {
        const arr = S._condMap.get('Arcane Lightning');
        const existing = arr?.find(s => s.expiresAt > time && !s.perma);
        if (existing) existing.expiresAt = time + 15000;
        else this._pushCondStack(S, { t: time, cond: 'Arcane Lightning', expiresAt: time + 15000 });
    }

    // Bountiful Power: accumulate stacks on swap; at 5 → Quickness + 7s +20% strike buff
    _triggerBountifulPower(S, stacks, time) {
        if (!S._hasBountifulPower) return;
        S.bountifulPowerStacks += stacks;
        if (S.bountifulPowerStacks >= 5) {
            S.bountifulPowerStacks -= 5;
            this._trackEffect(S, 'Quickness', 1, 5, time);
            this._pushCondStack(S, { t: time, cond: 'Bountiful Power Active', expiresAt: time + 7000 });
            S.log.push({ t: time, type: 'skill_proc', skill: 'Bountiful Power', detail: '+20% strike, 5s Quickness' });
        }
    }

    _procOnSwapSigils(S, time) {
        const swapSigils = this._activeProcSigils.filter(n => SIGIL_PROCS[n].trigger === 'swap');
        for (const name of swapSigils) {
            const proc = SIGIL_PROCS[name];
            if (time < (S.sigilICD[name] || 0)) continue;
            S.sigilICD[name] = time + proc.icd;

            if (proc.effect === 'doom') {
                S.sigilDoomPending = true;
            } else if (proc.effect === 'strike_cond') {
                insertSorted(S.eq, {
                    time, type: 'hit',
                    skill: `Sigil of ${name}`, hitIdx: 1, sub: 1, totalSubs: 1,
                    dmg: proc.coeff, ws: proc.ws,
                    isField: false, cc: false,
                    conds: { [proc.cond]: { stacks: proc.stacks, duration: proc.dur } },
                    isSigilProc: true, noCrit: !proc.canCrit, att: S.att,
                });
            } else if (proc.effect === 'condition') {
                this._applyCondition(S, proc.cond, proc.stacks, proc.dur, time, `Sigil of ${name}`);
            }
            S.log.push({ t: time, type: 'sigil_proc', sigil: name, skill: `Sigil of ${name}` });
            S.steps.push({ skill: `Sigil of ${name}`, start: time, end: time, att: S.att, type: 'sigil_proc', ri: -1, icon: proc.icon });
        }
    }

    _procHit(S, ev, power, condDmg, critMult, strikeMul, condMul) {
        let strike = 0;
        if (ev.dmg > 0 && ev.ws > 0) {
            strike = strikeDamage(ev.dmg, ev.ws, power) * critMult * strikeMul;
            S.totalStrike += strike;

            if (S.energy !== null && !ev._energyCredited
                && (!this._anySphereActiveAt(S, ev.time) || S._hasSphereSpecialist)) {
                S.energy = Math.min(CATALYST_ENERGY_MAX, S.energy + 1);
            }
        }
        this._ensurePerSkill(S, ev.skill);
        S.perSkill[ev.skill].strike += strike;

        if (ev.conds) {
            const sphereDoubleBoons = S._hasSphereSpecialist
                && ev.skill.startsWith('Deploy Jade Sphere');
            // Frost Bow: +20% condition duration while equipped (flat, added to bonus pool)
            const frostBowCondDur = ev.conjure === 'Frost Bow' ? 20 : 0;
            for (const [cond, val] of Object.entries(ev.conds)) {
                if (!val || val.stacks <= 0 || val.duration <= 0) continue;
                if (cond === 'Boon Extension') {
                    this._applyBoonExtension(S, val.duration, ev.time);
                    S.log.push({ t: ev.time, type: 'apply', effect: 'Boon Extension', dur: val.duration, skill: ev.skill });
                    continue;
                }
                const dur = (sphereDoubleBoons && BOONS.has(cond)) ? val.duration * 2 : val.duration;
                if (DAMAGING_CONDITIONS.has(cond)) {
                    this._applyCondition(S, cond, val.stacks, dur, ev.time, ev.skill, ev.castStart, frostBowCondDur);
                } else {
                    this._trackEffect(S, cond, val.stacks, dur, ev.time);
                }
                S.log.push({
                    t: ev.time, type: 'apply', effect: cond,
                    stacks: val.stacks, dur: val.duration, skill: ev.skill,
                });
            }
        }

        if (S._hasPersistingFlames && ev.isField && FIRE_FIELD_SKILLS.has(ev.skill)) {
            this._grantPersistingFlames(S, ev.time);
        }

        S.log.push({
            t: ev.time, type: 'hit', skill: ev.skill,
            hit: ev.hitIdx, sub: ev.sub, totalSubs: ev.totalSubs,
            strike: Math.round(strike), coeff: ev.dmg,
            isField: ev.isField, cc: ev.cc, finisher: ev.finType, att: ev.att,
        });
    }

    _applyCondition(S, cond, stacks, durSec, time, skillName, castStart = null, extraCondDurPct = 0) {
        const attrs = this.attributes.attributes;
        let bonus = getConditionDurationBonus(cond, attrs) + extraCondDurPct;
        if (S._hasWeaversProwess && this._effectStacksAt(S, "Weaver's Prowess", time) > 0) {
            bonus += 20;
        }
        if (S._empPool?.Expertise) {
            bonus += (S._empPool.Expertise * this._getEmpMul(S, time)) / 15;
        }
        if (S.activeRelic === 'Aristocracy' && S.relicAristocracyStacks > 0 && S.relicAristocracyUntil > time) {
            bonus += S.relicAristocracyStacks * RELIC_PROCS.Aristocracy.condDurPerStack;
        }
        let uncapped = 0;
        if (S.activeRelic === 'Dragonhunter' && S.relicBuffUntil > time) {
            uncapped = RELIC_PROCS.Dragonhunter.uncappedCondDur;
        }
        const adjMs = Math.round(durSec * 1000 * (1 + Math.min(bonus / 100, 1) + uncapped / 100));

        if (!S.condState[cond]) {
            S.condState[cond] = { stacks: [], tickActive: false, nextTick: null };
        }
        const cs = S.condState[cond];

        for (let i = 0; i < stacks; i++) {
            // Store the application time so ticks only count stacks that have actually started.
            // Trait procs (Sunspot, Flame Expulsion) are applied inline during rotation
            // pre-processing with future timestamps; without this check every future stack
            // would be counted from the very first tick event.
            cs.stacks.push({ t: time, expiresAt: time + adjMs, appliedBy: skillName });
            this._pushCondStack(S, { t: time, cond, expiresAt: time + adjMs });
        }

        if (!cs.tickActive) {
            cs.tickActive = true;
            cs.nextTick = time + 1000;
            insertSorted(S.eq, { time: time + 1000, type: 'ctick', cond });
        }

        const activeAtTime = cs.stacks.filter(s => s.t <= time && s.expiresAt > time).length;
        const wpApplied = S._hasWeaversProwess
            && this._effectStacksAt(S, "Weaver's Prowess", time) > 0;
        const effectiveBonus = Math.min(bonus, 100) + uncapped;
        S.log.push({
            t: time, type: 'cond_apply', cond, stacks, durMs: adjMs,
            total: activeAtTime, skill: skillName,
            diag: {
                baseDurMs: Math.round(durSec * 1000),
                bonusPct: Math.round(effectiveBonus * 100) / 100,
                weaversProwess: wpApplied || false,
                uncappedPct: uncapped,
            },
        });

        if (S.activeRelic === 'Blightbringer' && (cond === 'Poisoned' || cond === 'Poison')) {
            this._trackBlightbringerPoison(S, time, skillName, castStart);
        }

        if (S._hasPersistingFlames && cond === 'Burning') {
            this._grantPersistingFlames(S, time);
        }

        // Ignite passive: 1 Might (6s) whenever Burning is applied (1s ICD)
        if (S.evokerElement === 'Fire' && cond === 'Burning'
            && time >= (S.traitICD['IgnitePassive'] || 0)) {
            S.traitICD['IgnitePassive'] = time + 1000;
            this._trackEffect(S, 'Might', 1, 6, time);
        }

        if (S.activeRelic === 'Fractal' && cond === 'Bleeding' && time >= (S.relicICD.Fractal || 0)) {
            const activeStacks = cs.stacks.filter(s => s.t <= time && s.expiresAt > time).length;
            if (activeStacks >= 6) {
                S.relicICD.Fractal = time + RELIC_PROCS.Fractal.icd;
                const fp = RELIC_PROCS.Fractal;
                for (const [fc, fv] of Object.entries(fp.conditions)) {
                    this._applyCondition(S, fc, fv.stacks, fv.dur, time, 'Relic of Fractal');
                }
                S.log.push({ t: time, type: 'relic_proc', relic: 'Fractal', skill: 'Relic of Fractal' });
                S.steps.push({ skill: 'Relic of Fractal', start: time, end: time, att: S.att, type: 'relic_proc', ri: -1, icon: fp.icon });
            }
        }

    }

    _trackEffect(S, effect, stacks, durSec, time) {
        const attrs = this.attributes.attributes;
        let bonus;
        let uncapped = 0;
        if (BOONS.has(effect)) {
            bonus = getBoonDurationBonus(effect, attrs);
            if (S._empPool?.Concentration) {
                bonus += (S._empPool.Concentration * this._getEmpMul(S, time)) / 15;
            }
            // Weave Self / Perfect Weave: Water attunement bonus +20% boon duration
            if ((S.weaveSelfVisited.has('Water') && time < S.weaveSelfUntil)
                || time < S.perfectWeaveUntil) {
                bonus += 20;
            }
        } else {
            bonus = getConditionDurationBonus(effect, attrs);
            if (S._hasPiercingShards && effect === 'Vulnerability') bonus += 33;
            if (S._hasWeaversProwess && this._effectStacksAt(S, "Weaver's Prowess", time) > 0) {
                bonus += 20;
            }
            if (S._empPool?.Expertise) {
                bonus += (S._empPool.Expertise * this._getEmpMul(S, time)) / 15;
            }
            if (S.activeRelic === 'Aristocracy' && S.relicAristocracyStacks > 0 && S.relicAristocracyUntil > time) {
                bonus += S.relicAristocracyStacks * RELIC_PROCS.Aristocracy.condDurPerStack;
            }
            if (S.activeRelic === 'Dragonhunter' && S.relicBuffUntil > time) {
                uncapped = RELIC_PROCS.Dragonhunter.uncappedCondDur;
            }
        }
        const adjMs = Math.round(durSec * 1000 * (1 + Math.min(bonus / 100, 1) + uncapped / 100));

        for (let i = 0; i < stacks; i++) {
            this._pushCondStack(S, { t: time, cond: effect, expiresAt: time + adjMs });
        }

        if (effect === 'Quickness') {
            S.quicknessUntil = Math.max(S.quicknessUntil, time + adjMs);
        } else if (effect === 'Alacrity') {
            S.alacrityUntil = Math.max(S.alacrityUntil, time + adjMs);
        }

        if (S._hasElementalPursuit
            && (effect === 'Immobilize' || effect === 'Chilled' || effect === 'Crippled')
            && time >= (S.traitICD['ElemPursuit'] || 0)) {
            S.traitICD['ElemPursuit'] = time + 10000;
            this._trackEffect(S, 'Superspeed', 1, 2.5, time);
        }

        if (S._hasViciousEmpowerment && effect === 'Immobilize'
            && time >= (S.traitICD['ViciousEmp'] || 0)) {
            S.traitICD['ViciousEmp'] = time + 250;
            this._grantElemEmpowerment(S, 2, time, 'Vicious Empowerment');
            this._trackEffect(S, 'Might', 2, 10, time);
        }
    }

    _mightStacksAt(S, t) {
        const arr = S._condMap.get('Might');
        if (!arr) return 0;
        let count = 0;
        for (const s of arr) {
            if (s.t <= t && s.expiresAt > t) count++;
        }
        return Math.min(count, 25);
    }

    _hasFuryAt(S, t) {
        const arr = S._condMap.get('Fury');
        if (!arr) return false;
        for (const s of arr) {
            if (s.t <= t && s.expiresAt > t) return true;
        }
        return false;
    }

    _vulnStacksAt(S, t) {
        const arr = S._condMap.get('Vulnerability');
        if (!arr) return 0;
        let count = 0;
        for (const s of arr) {
            if (s.t <= t && s.expiresAt > t) count++;
        }
        return Math.min(count, 25);
    }

    _effectStacksAt(S, effect, t) {
        const arr = S._condMap.get(effect);
        if (!arr) return 0;
        let count = 0;
        for (const s of arr) {
            if (s.t <= t && s.expiresAt > t) count++;
        }
        return count;
    }

    // Apply per-element consume effects for Weaver dual pistol slot-3 skills
    _applyPistolDualConsumeEffect(S, sk, name, element, end, start) {
        const ws = this._ws(sk);
        if (name === 'Frostfire Flurry') {
            if (element === 'Fire') {
                this._applyAura(S, 'Fire Aura', 3000, end, name);
            } else if (element === 'Water') {
                this._applyCondition(S, 'Vulnerability', 4, 8, end, name);
            }
        } else if (name === 'Purblinding Plasma') {
            if (element === 'Fire') {
                this._applyCondition(S, 'Burning', 3, 4, end, name);
            }
            // Air: CD reduction already applied in recharge block via S._purblindingCDReduce pre-set flag
        } else if (name === 'Molten Meteor') {
            if (element === 'Earth') {
                insertSorted(S.eq, {
                    time: end, type: 'hit',
                    skill: name, hitIdx: 99, sub: 1, totalSubs: 1,
                    dmg: 0, ws: 0, isField: false, cc: false,
                    conds: { Bleeding: { stacks: 3, duration: 8 } },
                    att: S.att, att2: S.att2, castStart: start,
                    isTraitProc: true, noCrit: true,
                });
            }
            // Fire: no extra effect
        } else if (name === 'Flowing Finesse') {
            if (element === 'Water') {
                this._applyAura(S, 'Frost Aura', 3000, end, name);
            } else if (element === 'Air') {
                this._trackEffect(S, 'Superspeed', 1, 4, end);
            }
        } else if (name === 'Echoing Erosion') {
            // Both Water and Earth: no extra effects on consume
        } else if (name === 'Enervating Earth') {
            if (element === 'Air') {
                // CC — inject a zero-damage hit with cc:true for relic/trait procs
                insertSorted(S.eq, {
                    time: end, type: 'hit',
                    skill: name, hitIdx: 99, sub: 1, totalSubs: 1,
                    dmg: 0, ws: 0, isField: false, cc: true, conds: null,
                    att: S.att, att2: S.att2, castStart: start,
                    isTraitProc: true, noCrit: true,
                });
            } else if (element === 'Earth') {
                insertSorted(S.eq, {
                    time: end, type: 'hit',
                    skill: name, hitIdx: 99, sub: 1, totalSubs: 1,
                    dmg: 0, ws: 0, isField: false, cc: false,
                    conds: { Bleeding: { stacks: 4, duration: 8 } },
                    att: S.att, att2: S.att2, castStart: start,
                    isTraitProc: true, noCrit: true,
                });
            }
        }
    }

    // Returns array of element names for currently active hammer orbs at time t
    _hammerActiveOrbs(S, t) {
        const active = [];
        for (const el of ['Fire', 'Water', 'Air', 'Earth']) {
            if (S.hammerOrbs[el] !== null && S.hammerOrbs[el] > t) active.push(el);
        }
        return active;
    }

    // Grand Finale is available if:
    //  - Non-Weaver: there is at least one active orb for the current attunement
    //  - Weaver with pri !== sec: there is at least one active orb granted by a skill
    //    whose attunement requirement includes pri or sec
    //  - Weaver with pri === sec: there is at least one orb for that attunement
    _hammerGFAvailable(S, t) {
        const active = this._hammerActiveOrbs(S, t);
        if (active.length === 0) return false;
        const pri = S.att;
        const sec = S.att2;

        if (S.eliteSpec !== 'Weaver' || !sec || pri === sec) {
            // Need an orb that was granted while (or in relation to) current attunement
            // Simpler: orb for current attunement must exist
            return active.includes(pri);
        }

        // Weaver dual: accessible if any orb granted by a skill requiring pri OR sec,
        // or directly granted by a Dual Orbit skill covering pri or sec.
        for (const el of active) {
            const grantedBy = S.hammerOrbGrantedBy[el];
            if (!grantedBy) continue;
            const grantSk = this._skill(grantedBy);
            if (!grantSk) continue;
            const att = grantSk.attunement || '';
            // Dual orbit: attunement contains '+'
            if (att.includes('+')) {
                const parts = att.split('+');
                if (parts.includes(pri) || parts.includes(sec)) return true;
            } else {
                if (att === pri || att === sec) return true;
            }
        }
        // Also: if we have both pri and sec orbs regardless of how they were gained,
        // that qualifies (individual orb skills from each att side)
        if (active.includes(pri) || active.includes(sec)) return true;
        return false;
    }

    _getRelicStrikeMul(S, ev, tgtHP) {
        const proc = S.relicProc;
        if (!proc) return 1;

        if (proc.trigger === 'blast_combo') {
            return S.relicBloodstoneExplosionUntil > ev.time ? (1 + proc.strikeDmgM) : 1;
        }
        if (proc.trigger === 'eagle_below50') {
            const dealt = S.totalStrike + S.totalCond;
            return (tgtHP < Infinity && dealt >= tgtHP * 0.5) ? (1 + proc.strikeDmgM) : 1;
        }
        if (proc.trigger === 'weapon_recharge_hit') {
            return (S.relicThiefStacks > 0 && S.relicThiefUntil > ev.time)
                ? (1 + S.relicThiefStacks * proc.stackDmgPer) : 1;
        }
        if (proc.trigger === 'heal_skill') {
            return this._effectStacksAt(S, 'Fire Aura', ev.time) > 0 ? (1 + proc.strikeDmgM) : 1;
        }
        return (proc.strikeDmgM > 0 && S.relicBuffUntil > ev.time) ? (1 + proc.strikeDmgM) : 1;
    }

    _checkRelicOnHit(S, ev) {
        const relic = S.activeRelic;
        const proc = S.relicProc;
        if (!relic || !proc) return;

        switch (proc.trigger) {
            case 'cc_5torment_confusion':
                if (ev.cc && ev.time >= (S.relicICD[relic] || 0)) {
                    const confusion = this._effectStacksAt(S, 'Confusion', ev.time);
                    const torment = this._effectStacksAt(S, 'Torment', ev.time);
                    if (confusion >= 5 || torment >= 5) {
                        S.relicICD[relic] = ev.time + proc.icd;
                        for (const [cond, v] of Object.entries(proc.conditions)) {
                            this._applyCondition(S, cond, v.stacks, v.dur, ev.time, `Relic of ${relic}`);
                        }
                        S.log.push({ t: ev.time, type: 'relic_proc', relic, skill: `Relic of ${relic}` });
                        S.steps.push({ skill: `Relic of ${relic}`, start: ev.time, end: ev.time, att: S.att, type: 'relic_proc', ri: -1, icon: proc.icon });
                    }
                }
                break;

            case 'cc_any':
                if (ev.cc) {
                    if (proc.icd > 0 && ev.time < (S.relicICD[relic] || 0)) break;
                    if (proc.icd > 0) S.relicICD[relic] = ev.time + proc.icd;
                    if (proc.effectDuration > 0) {
                        const wasActive = S.relicBuffUntil > ev.time;
                        S.relicBuffUntil = Math.max(S.relicBuffUntil, ev.time + proc.effectDuration);
                        if (!wasActive) {
                            S.log.push({ t: ev.time, type: 'relic_proc', relic, skill: `Relic of ${relic}` });
                            S.steps.push({ skill: `Relic of ${relic}`, start: ev.time, end: ev.time, att: S.att, type: 'relic_proc', ri: -1, icon: proc.icon });
                        }
                    }
                }
                break;

            case 'weapon_recharge20':
                if (ev.dmg > 0 && ev.ws > 0) {
                    const sk = this._skill(ev.skill);
                    if (sk) {
                        const isWeapon = sk.type === 'Weapon skill' && !CONJURE_WEAPONS.has(sk.weapon);
                        const isOverload = sk.name.startsWith('Overload');
                        if ((isWeapon || isOverload) && sk.recharge >= 20) {
                            const wasActive = S.relicBuffUntil > ev.time;
                            S.relicBuffUntil = Math.max(S.relicBuffUntil, ev.time + proc.effectDuration);
                            if (!wasActive) {
                                S.log.push({ t: ev.time, type: 'relic_proc', relic, skill: `Relic of ${relic}` });
                                S.steps.push({ skill: `Relic of ${relic}`, start: ev.time, end: ev.time, att: S.att, type: 'relic_proc', ri: -1, icon: proc.icon });
                            }
                        }
                    }
                }
                break;

            case 'apply_weakness_vuln':
                if (ev.conds) {
                    const hasWV = Object.keys(ev.conds).some(k =>
                        (k === 'Weakness' || k === 'Vulnerability') && ev.conds[k]?.stacks > 0 && ev.conds[k]?.duration > 0
                    );
                    if (hasWV) {
                        const trigKey = `${ev.skill}_${ev.time}`;
                        if (trigKey !== S.relicAristocracyLastTrigger) {
                            S.relicAristocracyLastTrigger = trigKey;
                            if (S.relicAristocracyUntil <= ev.time) S.relicAristocracyStacks = 0;
                            const wasZero = S.relicAristocracyStacks === 0;
                            S.relicAristocracyStacks = Math.min(S.relicAristocracyStacks + 1, proc.maxStacks);
                            S.relicAristocracyUntil = ev.time + proc.effectDuration;
                            if (wasZero) {
                                S.log.push({ t: ev.time, type: 'relic_proc', relic, skill: `Relic of ${relic}` });
                                S.steps.push({ skill: `Relic of ${relic}`, start: ev.time, end: ev.time, att: S.att, type: 'relic_proc', ri: -1, icon: proc.icon });
                            }
                        }
                    }
                }
                break;

            case 'gain_protection_resolution':
                if (ev.conds && ev.time >= (S.relicICD[relic] || 0)) {
                    const hasPR = Object.keys(ev.conds).some(k =>
                        (k === 'Protection' || k === 'Resolution') && ev.conds[k]?.stacks > 0 && ev.conds[k]?.duration > 0
                    );
                    if (hasPR) {
                        S.relicICD[relic] = ev.time + proc.icd;
                        S.relicBuffUntil = Math.max(S.relicBuffUntil, ev.time + proc.effectDuration);
                        S.log.push({ t: ev.time, type: 'relic_proc', relic, skill: `Relic of ${relic}` });
                        S.steps.push({ skill: `Relic of ${relic}`, start: ev.time, end: ev.time, att: S.att, type: 'relic_proc', ri: -1, icon: proc.icon });
                    }
                }
                break;

            case 'trap_skill':
                if (ev.dmg > 0 || (ev.conds && Object.keys(ev.conds).length > 0)) {
                    const sk = this._skill(ev.skill);
                    if (sk && sk.type === 'Trap') {
                        const wasActive = S.relicBuffUntil > ev.time;
                        S.relicBuffUntil = Math.max(S.relicBuffUntil, ev.time + proc.effectDuration);
                        if (!wasActive) {
                            S.log.push({ t: ev.time, type: 'relic_proc', relic, skill: `Relic of ${relic}` });
                            S.steps.push({ skill: `Relic of ${relic}`, start: ev.time, end: ev.time, att: S.att, type: 'relic_proc', ri: -1, icon: proc.icon });
                        }
                    }
                }
                break;

            case 'weapon_recharge_hit':
                if (ev.dmg > 0 && ev.ws > 0) {
                    const sk = this._skill(ev.skill);
                    if (sk && sk.type === 'Weapon skill' && sk.recharge > 0) {
                        if (S.relicThiefUntil <= ev.time) S.relicThiefStacks = 0;
                        const wasZero = S.relicThiefStacks === 0;
                        S.relicThiefStacks = Math.min(S.relicThiefStacks + 1, proc.maxStacks);
                        S.relicThiefUntil = ev.time + proc.effectDuration;
                        if (wasZero) {
                            S.log.push({ t: ev.time, type: 'relic_proc', relic, skill: `Relic of ${relic}` });
                            S.steps.push({ skill: `Relic of ${relic}`, start: ev.time, end: ev.time, att: S.att, type: 'relic_proc', ri: -1, icon: proc.icon });
                        }
                    }
                }
                break;
        }
    }

    _checkRelicOnCast(S, sk, start, end) {
        const relic = S.activeRelic;
        const proc = S.relicProc;
        if (!relic || !proc) return;

        if (proc.trigger === 'polaric_leap' && sk.name === 'Polaric Leap') {
            if (end >= (S.relicICD[relic] || 0)) {
                S.relicICD[relic] = end + proc.icd;
                insertSorted(S.eq, { time: end, type: 'relic_activate', relic, applyEffects: true });
            }
        }

        if (proc.trigger === 'elite_delayed' && sk.type === 'Elite skill') {
            if (end >= (S.relicICD[relic] || 0)) {
                S.relicICD[relic] = end + proc.icd;
                insertSorted(S.eq, { time: end + (proc.delay || 0), type: 'relic_activate', relic, applyEffects: true });
            }
        }

        if (proc.trigger === 'stance_skill' && sk.type === 'Stance') {
            insertSorted(S.eq, { time: end, type: 'relic_activate', relic, applyEffects: true });
        }

        if (proc.trigger === 'heal_skill' && sk.type === 'Healing skill') {
            if (end >= (S.relicICD[relic] || 0)) {
                S.relicICD[relic] = end + proc.icd;
                this._applyAura(S, 'Fire Aura', proc.effectDuration, end, `Relic of ${relic}`);
                S.log.push({ t: end, type: 'relic_proc', relic, skill: `Relic of ${relic}` });
                S.steps.push({ skill: `Relic of ${relic}`, start: end, end, att: S.att, type: 'relic_proc', ri: -1, icon: proc.icon });
            }
        }
    }

    _trackBlightbringerPoison(S, time, skillName, castStart) {
        const key = castStart != null ? `${skillName}_${castStart}` : `${skillName}_${time}`;
        if (S.relicBlightbringerTrackedCasts.has(key)) return;
        S.relicBlightbringerTrackedCasts.add(key);

        if (S.relicBlightbringerCount < 6) S.relicBlightbringerCount++;
        if (S.relicBlightbringerCount >= 6 && time >= (S.relicICD.Blightbringer || 0)) {
            S.relicBlightbringerCount = 0;
            S.relicICD.Blightbringer = time + S.relicProc.icd;
            const bproc = S.relicProc;
            for (const [c, v] of Object.entries(bproc.conditions)) {
                if (DAMAGING_CONDITIONS.has(c)) {
                    this._applyCondition(S, c, v.stacks, v.dur, time, 'Relic of Blightbringer');
                } else {
                    this._trackEffect(S, c, v.stacks, v.dur, time);
                }
            }
            S.log.push({ t: time, type: 'relic_proc', relic: 'Blightbringer', skill: 'Relic of Blightbringer' });
            S.steps.push({ skill: 'Relic of Blightbringer', start: time, end: time, att: S.att, type: 'relic_proc', ri: -1, icon: bproc.icon });
        }
    }

    _checkBloodstoneBlast(S, time) {
        const proc = RELIC_PROCS.Bloodstone;
        if (S.relicBloodstoneExplosionUntil > time) return;

        if (S.relicBloodstoneStacksUntil <= time) S.relicBloodstoneStacks = 0;

        S.relicBloodstoneStacks++;
        S.relicBloodstoneStacksUntil = time + proc.volatilityDuration;

        const volArr = S._condMap.get('Bloodstone Volatility');
        if (volArr) {
            for (const s of volArr) {
                if (s.expiresAt > time) s.expiresAt = time + proc.volatilityDuration;
            }
        }
        this._pushCondStack(S, { t: time, cond: 'Bloodstone Volatility', expiresAt: time + proc.volatilityDuration });

        if (S.relicBloodstoneStacks >= proc.stacksNeeded) {
            S.relicBloodstoneStacks = 0;
            S.relicBloodstoneExplosionUntil = time + proc.effectDuration;

            const volArr2 = S._condMap.get('Bloodstone Volatility');
            if (volArr2) {
                for (const s of volArr2) {
                    if (s.expiresAt > time) s.expiresAt = time;
                }
            }
            this._pushCondStack(S, { t: time, cond: 'Bloodstone Explosion', expiresAt: time + proc.effectDuration });

            insertSorted(S.eq, {
                time, type: 'hit',
                skill: 'Bloodstone Explosion', hitIdx: 1, sub: 1, totalSubs: 1,
                dmg: proc.strikeCoeff, ws: proc.strikeWs,
                isField: false, cc: false, conds: null,
                isRelicProc: true, noCrit: false, att: S.att,
            });

            for (const [c, v] of Object.entries(proc.conditions)) {
                this._applyCondition(S, c, v.stacks, v.dur, time, 'Bloodstone Explosion');
            }

            S.log.push({ t: time, type: 'relic_proc', relic: 'Bloodstone', skill: 'Bloodstone Explosion' });
            S.steps.push({
                skill: 'Bloodstone Explosion', start: time, end: time,
                att: S.att, type: 'relic_proc', ri: -1, icon: proc.icon,
            });
        }
    }

    _computeSigilMuls(excludeSigil = null) {
        const sigilNames = this.attributes.sigils || [];
        let strikeAdd = 0, condAdd = 0;
        let strikeMul = 1, condMul = 1;

        for (const name of sigilNames) {
            if (name === excludeSigil) continue;
            const s = this.sigils[name];
            if (!s) continue;
            strikeAdd += (s.strikeDamageA || 0) / 100;
            condAdd += (s.conditionDamageA || 0) / 100;
            if (s.strikeDamageM) strikeMul *= 1 + s.strikeDamageM / 100;
            if (s.conditionDamageM) condMul *= 1 + s.conditionDamageM / 100;
        }

        return {
            strikeAdd, strikeMul, condAdd, condMul,
            strike: (1 + strikeAdd) * strikeMul,
            cond: (1 + condAdd) * condMul,
        };
    }

    _procCondTick(S, ev, condDmg, condMul, infernoPower = 0, diag = null) {
        const { cond } = ev;
        const cs = S.condState[cond];
        if (!cs) return;

        const t = ev.time;
        const active = cs.stacks.filter(s => s.t <= t && s.expiresAt >= t);

        if (active.length > 0) {
            const baseTick = (infernoPower > 0 && cond === 'Burning')
                ? (0.075 * infernoPower + 131)
                : conditionTickDamage(cond, condDmg);
            const tick = baseTick * condMul;
            const total = tick * active.length;
            S.totalCond += total;
            if (!this.fastMode) {
                S.condDamage[cond] = (S.condDamage[cond] || 0) + total;
                S.condStackSeconds[cond] = (S.condStackSeconds[cond] || 0) + active.length;
            }

            for (const stack of active) {
                this._ensurePerSkill(S, stack.appliedBy);
                S.perSkill[stack.appliedBy].condition += tick;
            }

            S.log.push({
                t, type: 'cond_tick', cond,
                stacks: active.length, perStack: Math.round(tick), total: Math.round(total),
                diag: diag ? { ...diag, baseTick: Math.round(baseTick * 100) / 100 } : null,
            });
        }

        cs.stacks = cs.stacks.filter(s => s.expiresAt > t);
        if (cs.stacks.length > 0) {
            cs.nextTick = t + 1000;
            insertSorted(S.eq, { time: t + 1000, type: 'ctick', cond });
        } else {
            cs.tickActive = false;
            cs.nextTick = null;
        }
    }

    _ensurePerSkill(S, name) {
        if (!S.perSkill[name]) S.perSkill[name] = { strike: 0, condition: 0, casts: 0, castTimeMs: 0 };
    }

    static exportLogCSV(log) {
        const CSV_COLS = [
            'Time', 'Type', 'Skill/Condition',
            'Hit#', 'Coeff', 'StrikeDmg',
            'Stacks', 'PerStack', 'CondTotal',
            'BaseDurMs', 'AdjDurMs', 'DurBonus%', 'WeaversProwess', 'ActiveTotal',
            'Power', 'WeaponStr', 'CondDmg', 'InfernoPower',
            'CritCh%', 'CritDmg%', 'CritMul',
            'Might', 'Fury', 'VulnStacks', 'VulnMul',
            'StrikeMul', 'BaseStrike', 'AddStrike',
            'PyroMul', 'StormMul', 'BoltMul', 'SerratedMul', 'FieryMightMul',
            'PiercingMul', 'FlowLikeWaterMul', 'ZapMul', 'RelicStrikeMul',
            'CondMul', 'SigilCondAdd', 'SigilCondMul', 'BaseTick',
            'TempAria', 'TranscTemp', 'ElemRage', 'EmpAuras', 'FamProwess',
            'EmpFlame', 'PowOvr', 'PolyPow', 'PolyFer',
            'Att', 'Att2', 'Extra',
        ];

        const esc = v => {
            if (v === null || v === undefined || v === '') return '';
            const s = String(v);
            return s.includes(',') || s.includes('"') || s.includes('\n')
                ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const r = v => v !== undefined && v !== null ? (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v) : '';

        const rows = [CSV_COLS.join(',')];
        for (const ev of log) {
            const d = ev.diag || {};
            const time = (ev.t / 1000).toFixed(3);
            let row;
            switch (ev.type) {
                case 'hit':
                    row = [
                        time, 'HIT', esc(ev.skill),
                        `${ev.hit}.${ev.sub}`, r(ev.coeff), r(ev.strike),
                        '', '', '',
                        '', '', '', '', '',
                        r(d.power), r(d.ws), r(d.condDmg), '',
                        r(d.critCh), r(d.critDmg), r(d.critMul),
                        r(d.might), r(d.fury), r(d.vulnStacks), r(d.vulnMul),
                        r(d.strikeMul), r(d.baseStrike), r(d.addStrike),
                        r(d.pyroMul), r(d.stormMul), r(d.boltMul), r(d.serratedMul), r(d.fieryMightMul),
                        r(d.piercingShardsMul), r(d.flowLikeWaterMul), r(d.zapMul), r(d.relicStrikeMul),
                        r(d.condMul), '', '', '',
                        '', '', '', '', '',
                        r(d.empFlame), r(d.powOvr), r(d.polyPow), r(d.polyFer),
                        r(d.att), r(d.att2), ev.isField ? 'field' : '',
                    ];
                    break;
                case 'cond_tick':
                    row = [
                        time, 'TICK', esc(ev.cond),
                        '', '', '',
                        r(ev.stacks), r(ev.perStack), r(ev.total),
                        '', '', '', '', '',
                        '', '', r(d.condDmg), r(d.infernoPower),
                        '', '', '',
                        r(d.might), '', r(d.vulnStacks), r(d.vulnMul),
                        '', '', '',
                        '', '', '', '', '',
                        '', '', '', '',
                        r(d.condMul), r(d.sigilCondAdd), r(d.sigilCondMul), r(d.baseTick),
                        r(d.tempAria), r(d.transcTemp), r(d.elemRage), r(d.empAuras), r(d.famProwess),
                        '', '', '', '',
                        '', '', '',
                    ];
                    break;
                case 'cond_apply':
                    row = [
                        time, 'APPLY', esc(ev.cond),
                        '', '', '',
                        r(ev.stacks), '', '',
                        r(d.baseDurMs), r(ev.durMs), r(d.bonusPct), r(d.weaversProwess), r(ev.total),
                        '', '', '', '',
                        '', '', '',
                        '', '', '', '',
                        '', '', '',
                        '', '', '', '', '',
                        '', '', '', '',
                        '', '', '', '',
                        '', '', '', '', '',
                        '', '', '', '',
                        '', '', esc(ev.skill),
                    ];
                    break;
                case 'cast':
                    row = [time, 'CAST', esc(ev.skill), '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', r(ev.att), '', `${ev.dur}ms`];
                    break;
                case 'swap':
                    row = [time, 'SWAP', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', `${ev.from}→${ev.to}`];
                    break;
                default:
                    continue;
            }
            rows.push(row.join(','));
        }
        return rows.join('\n');
    }
}
