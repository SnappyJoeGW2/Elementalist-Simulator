import { enqueueRuntimeActionEvent } from './sim-events.js';

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
    }
}
