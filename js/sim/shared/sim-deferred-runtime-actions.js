import { enqueueRuntimeActionEvent } from './sim-events.js';
import { isCombatActiveAt } from '../run/sim-run-phase-state.js';
import { getRelicState } from '../state/sim-relic-state.js';

export function buildAuraFollowupAction({ time, skill }) {
    return {
        type: 'aura_followup',
        time,
        skill,
    };
}

export function buildPrimordialStanceAction({ time }) {
    return {
        type: 'primordial_stance',
        time,
    };
}

export function buildNourysTickAction({ time }) {
    return {
        type: 'nourys_tick',
        time,
    };
}

function resolveRuntimeActionState(target) {
    if (!target) return null;
    if (target.S && Array.isArray(target.S.eq)) return target.S;
    if (Array.isArray(target.eq)) return target;
    return null;
}

export function queueRuntimeAction(target, action, { priority = -1 } = {}) {
    if (target && typeof target.queueRuntimeActionEvent === 'function') {
        return target.queueRuntimeActionEvent(action, { priority });
    }

    const state = resolveRuntimeActionState(target);
    if (!state) return null;
    return enqueueRuntimeActionEvent(state.eq, {
        time: action.time,
        priority,
        action,
    });
}

export function queueAuraFollowupAction(S, action, options = {}) {
    queueRuntimeAction(S, action, options);
}

export function applyRuntimeAction(ctx, action) {
    const { S } = ctx;

    if (action.type === 'aura_followup') {
        if (S._hasEmpoweringAuras) ctx.grantEmpoweringAuras(action.time);
        if (S._hasElemEpitome) ctx.grantElemEmpowerment(1, action.time, action.skill);
    } else if (action.type === 'primordial_stance') {
        const att1 = ctx.attAt(action.time);
        const att2 = ctx.att2At(action.time);
        ctx.applyPrimordialStance(att1, att2, action.time);
    } else if (action.type === 'nourys_tick') {
        if (S.activeRelic !== 'Nourys') return;
        const proc = ctx.getRelicProc('Nourys');
        if (!proc || !isCombatActiveAt(S, action.time)) return;

        const relicState = getRelicState(S);
        relicState.nourysActiveUntil = Math.max(0, relicState.nourysActiveUntil || 0);
        relicState.nourysStacks = Math.max(0, relicState.nourysStacks || 0);

        relicState.nourysStacks++;
        ctx.log({
            t: action.time,
            type: 'skill_proc',
            skill: 'Nourys',
            detail: `${relicState.nourysStacks}/${proc.stacksNeeded}`,
        });

        if (relicState.nourysStacks >= proc.stacksNeeded) {
            relicState.nourysStacks = 0;
            relicState.nourysActiveUntil = action.time + proc.effectDuration;
            ctx.pushCondStack({
                t: action.time,
                cond: 'Nourys',
                expiresAt: relicState.nourysActiveUntil,
            });
            ctx.log({
                t: action.time,
                type: 'relic_proc',
                relic: 'Nourys',
                skill: 'Relic of Nourys',
            });
            ctx.addStep({
                skill: 'Relic of Nourys',
                start: action.time,
                end: action.time,
                att: S.att,
                type: 'relic_proc',
                ri: -1,
                icon: proc.icon,
            });
            ctx.queueRuntimeActionEvent(buildNourysTickAction({
                time: relicState.nourysActiveUntil + proc.stackInterval,
            }));
            return;
        }

        ctx.queueRuntimeActionEvent(buildNourysTickAction({
            time: action.time + proc.stackInterval,
        }));
    }
}
