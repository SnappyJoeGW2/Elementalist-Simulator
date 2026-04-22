const TARGET_ARMOR = 2597;

// Condition damage per tick (1 second), per stack
const CONDITION_FORMULAS = {
    Burning:   { base: 131.0,  scaling: 0.155 },
    Bleeding:  { base: 22.0,   scaling: 0.06 },
    Poisoned:  { base: 33.5,   scaling: 0.06 },
    Poison:    { base: 33.5,   scaling: 0.06 },
    Torment:   { base: 31.8,   scaling: 0.09 },
    Confusion: { base: 18.25,  scaling: 0.05 },
};

const CONDITION_DURATION_KEYS = {
    Burning:   'Burning Duration',
    Bleeding:  'Bleeding Duration',
    Poisoned:  'Poison Duration',
    Poison:    'Poison Duration',
    Torment:   'Torment Duration',
    Confusion: 'Confusion Duration',
};

export function strikeDamage(coefficient, weaponStrength, power, armor = TARGET_ARMOR) {
    return coefficient * weaponStrength * power / armor;
}

export function expectedCritMultiplier(critChancePct, critDamagePct) {
    const cc = Math.min(critChancePct / 100, 1);
    const cd = critDamagePct / 100;
    return 1 + cc * (cd - 1);
}

export function conditionTickDamage(conditionType, conditionDamage) {
    const formula = CONDITION_FORMULAS[conditionType];
    if (!formula) return 0;
    return formula.base + formula.scaling * conditionDamage;
}

export function conditionTotalDamage(conditionType, stacks, baseDurationSec, conditionDamage, durationBonusPct) {
    const tickDmg = conditionTickDamage(conditionType, conditionDamage);
    const adjustedDuration = baseDurationSec * (1 + Math.min(durationBonusPct / 100, 1));
    return stacks * tickDmg * adjustedDuration;
}

export function getConditionDurationBonus(conditionType, attributes) {
    const base = attributes['Condition Duration']?.final ?? 0;
    const key = CONDITION_DURATION_KEYS[conditionType];
    const specific = (key && attributes[key] !== undefined) ? attributes[key].final : 0;
    return base + specific;
}

const BOON_DURATION_KEYS = {
    Might: 'Might Duration',
    Fury: 'Fury Duration',
    Quickness: 'Quickness Duration',
};

export function getBoonDurationBonus(boonType, attributes) {
    const base = attributes['Boon Duration']?.final ?? 0;
    const key = BOON_DURATION_KEYS[boonType];
    const specific = (key && attributes[key] !== undefined) ? attributes[key].final : 0;
    return base + specific;
}

/**
 * Calculate full damage for a single skill cast.
 * Returns { totalStrike, totalCondition, totalDamage, dps, hits[], conditions[] }
 */
export function calculateSkillDamage(skill, skillHits, weaponStrength, attributes, { maxHit = Infinity } = {}) {
    const power = attributes['Power']?.final ?? 1000;
    const condDmg = attributes['Condition Damage']?.final ?? 0;
    const critChance = attributes['Critical Chance']?.final ?? 0;
    const critDamage = attributes['Critical Damage']?.final ?? 150;
    const critMult = expectedCritMultiplier(critChance, critDamage);

    let totalStrike = 0;
    let totalCondition = 0;
    const hitDetails = [];
    const conditionDetails = [];

    const hits = skillHits || [];
    for (const hit of hits) {
        if (hit.hit > maxHit) continue;
        const coefficient = hit.damage || 0;
        if (coefficient <= 0 && !hasConditions(hit)) continue;

        let tickCount = 1;
        let isPerTick = false;
        if (hit.numberOfImpacts === 'Duration') {
            isPerTick = true;
            const interval = hit.interval || 1;
            tickCount = Math.floor(hit.duration / interval);
            if (tickCount < 1) tickCount = 1;
        }

        let hitStrike = 0;
        if (coefficient > 0) {
            const raw = strikeDamage(coefficient, weaponStrength, power);
            const expected = raw * critMult;
            if (isPerTick) {
                hitStrike = expected * tickCount;
            } else {
                hitStrike = expected;
            }
            totalStrike += hitStrike;
        }

        hitDetails.push({
            hitIndex: hit.hit,
            coefficient,
            isPerTick,
            tickCount,
            strikeDamage: hitStrike,
        });

        for (const [condType, condVal] of Object.entries(hit.conditions || {})) {
            if (!condVal || !CONDITION_FORMULAS[condType]) continue;
            const stacks = condVal.stacks || 0;
            const duration = condVal.duration || 0;
            if (stacks <= 0 || duration <= 0) continue;

            const durationBonus = getConditionDurationBonus(condType, attributes);
            const effectiveStacks = isPerTick ? stacks * tickCount : stacks;
            const dmg = conditionTotalDamage(condType, effectiveStacks, duration, condDmg, durationBonus);
            totalCondition += dmg;

            conditionDetails.push({
                type: condType,
                stacks: effectiveStacks,
                baseDuration: duration,
                adjustedDuration: duration * (1 + Math.min(durationBonus / 100, 1)),
                tickDamage: conditionTickDamage(condType, condDmg),
                totalDamage: dmg,
            });
        }
    }

    const totalDamage = totalStrike + totalCondition;
    const castTime = skill.castTime || 0;
    const dps = castTime > 0 ? totalDamage / castTime : totalDamage;

    return {
        skillName: skill.name,
        castTime,
        cooldown: skill.recharge,
        totalStrike,
        totalCondition,
        totalDamage,
        dps,
        critMultiplier: critMult,
        hitDetails,
        conditionDetails,
    };
}

function hasConditions(hit) {
    if (!hit.conditions) return false;
    return Object.values(hit.conditions).some(c => c && c.stacks > 0);
}
