import { strikeDamage } from '../../core/damage.js';
import { anySphereActiveAt } from '../scheduler/sim-special-actions.js';
import { addPerSkillStrike } from '../state/sim-reporting-state.js';

function applyStrikeDamage(ctx, ev, power, critMult, strikeMul) {
    const { S, catalystEnergyMax } = ctx;
    if (!(ev.dmg > 0 && ev.ws > 0)) return 0;

    const strike = strikeDamage(ev.dmg, ev.ws, power) * critMult * strikeMul;
    S.totalStrike += strike;

    if (!ev._energyCredited
        && (!anySphereActiveAt(S, ev.time) || S._hasSphereSpecialist)) {
        ctx.addCatalystEnergy(1, catalystEnergyMax);
    }

    return strike;
}

function recordStrikeContribution(ctx, skillName, strike) {
    ctx.ensurePerSkill(skillName);
    addPerSkillStrike(ctx.S, skillName, strike);
}

function applyPayloadEffects(ctx, ev) {
    const { S, boons, damagingConditions, fireFieldSkills } = ctx;
    if (!ev.conds) return;

    const sphereDoubleBoons = S._hasSphereSpecialist
        && ev.skill.startsWith('Deploy Jade Sphere');
    const frostBowCondDur = ev.conjure === 'Frost Bow' ? 20 : 0;

    for (const [cond, val] of Object.entries(ev.conds)) {
        if (!val || val.stacks <= 0 || val.duration <= 0) continue;

        if (cond === 'Boon Extension') {
            ctx.applyBoonExtension(val.duration, ev.time);
            ctx.log({ t: ev.time, type: 'apply', effect: 'Boon Extension', dur: val.duration, skill: ev.skill });
            continue;
        }

        const dur = (sphereDoubleBoons && boons.has(cond)) ? val.duration * 2 : val.duration;
        if (damagingConditions.has(cond)) {
            ctx.applyCondition(cond, val.stacks, dur, ev.time, ev.skill, ev.castStart, frostBowCondDur);
        } else {
            ctx.trackEffect(cond, val.stacks, dur, ev.time);
        }

        ctx.log({
            t: ev.time,
            type: 'apply',
            effect: cond,
            stacks: val.stacks,
            dur: val.duration,
            skill: ev.skill,
        });
    }

    if (S._hasPersistingFlames && ev.isField && fireFieldSkills.has(ev.skill)) {
        ctx.grantPersistingFlames(ev.time);
    }
}

function logAppliedHit(ctx, ev, strike) {
    ctx.log({
        t: ev.time,
        type: 'hit',
        skill: ev.skill,
        hit: ev.hitIdx,
        sub: ev.sub,
        totalSubs: ev.totalSubs,
        strike: Math.round(strike),
        coeff: ev.dmg,
        isField: ev.isField,
        cc: ev.cc,
        finisher: ev.finType,
        att: ev.att,
    });
}

export function procHit(ctx, ev, power, condDmg, critMult, strikeMul, condMul) {
    const strike = applyStrikeDamage(ctx, ev, power, critMult, strikeMul);
    recordStrikeContribution(ctx, ev.skill, strike);
    applyPayloadEffects(ctx, ev, condDmg, condMul);
    logAppliedHit(ctx, ev, strike);
}
