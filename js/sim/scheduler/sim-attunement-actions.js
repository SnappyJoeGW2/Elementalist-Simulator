import {
    buildCastWindow,
    runConcurrentSteps,
} from './sim-cast-window.js';
import {
    advanceSwapToReadyTime,
    applySharedSwapElementEffects,
} from './sim-swap-shared.js';
import { getProcState } from '../state/sim-proc-state.js';
import { getEvokerState } from '../state/sim-specialization-state.js';
import {
    getAttunementCooldownReadyAt,
    getSkillCooldownReadyAt,
} from '../state/sim-cooldown-state.js';
import { isCombatActiveAt } from '../run/sim-run-phase-state.js';

export function handleAttunementSwap(ctx, sk, isConcurrent, concurrents, {
    attunements,
    offAttCd,
    catalystEnergyMax,
    swapIcon,
}) {
    const state = ctx.S;
    const evokerState = getEvokerState(state);
    const procState = getProcState(state);
    const target = sk.name.replace(' Attunement', '');
    const combatActive = isCombatActiveAt(state, state.t);

    if (state.eliteSpec === 'Weaver') {
        return handleWeaverSwap(ctx, target, sk, isConcurrent, concurrents, {
            attunements,
            weaverSwapCd: 4000,
        });
    }

    if (state._hasSpecializedElements) {
        ctx.log({ t: state.t, type: 'err', msg: 'Cannot swap attunement with Specialized Elements' });
        return;
    }

    if (target === state.att) {
        ctx.log({ t: state.t, type: 'err', msg: `Already in ${target}` });
        return;
    }

    if (!isConcurrent) {
        ctx.setAACarryover(ctx.detectAACarryover());
    } else {
        ctx.setPendingAACPrevious(state.att);
    }

    advanceSwapToReadyTime(ctx, target);

    const prev = state.att;
    ctx.setAttunement(target);
    ctx.setAttEnteredAt(state.t);
    if (target === 'Air') ctx.setFlag('freshAirResetAt', -Infinity);

    const isEvoker = state.eliteSpec === 'Evoker';
    const evoEl = evokerState.element;
    const rawPrevBaseCd = (isEvoker && prev === evoEl) ? offAttCd : Math.round(sk.recharge * 1000);
    const prevBaseCd = ctx.attunementCooldownMs(rawPrevBaseCd);
    const existingCD = getAttunementCooldownReadyAt(state, prev);
    ctx.setAttunementCooldown(prev, Math.max(existingCD, state.t + ctx.alacrityAdjustedCooldown(prevBaseCd, state.t)));

    for (const other of attunements) {
        if (other === target || other === prev) continue;
        const existingOther = getAttunementCooldownReadyAt(state, other);
        let newCD = Math.max(existingOther, state.t + ctx.alacrityAdjustedCooldown(ctx.attunementCooldownMs(offAttCd), state.t));
        if (other === 'Air' && state._hasFreshAir && procState.freshAirResetAt >= state.t) {
            newCD = Math.min(newCD, procState.freshAirResetAt);
        }
        ctx.setAttunementCooldown(other, newCD);
    }

    ctx.scheduleHits(sk, state.t);
    ctx.procOnSwapSigils(state.t);
    if (combatActive && state._hasEnergizedElements) {
        ctx.addCatalystEnergy(2, catalystEnergyMax);
        ctx.trackEffect('Fury', 1, 2, state.t);
    }
    applySharedSwapElementEffects(ctx, {
        prevPrimary: prev,
        target,
        allowFreshAirBuff: true,
    });
    if (combatActive && state._hasElemDynamo && target === evokerState.element) {
        const maxCh = state._hasSpecializedElements ? 4 : 6;
        ctx.grantEvokerCharges(1, maxCh);
    }
    if (state._hasElemBalance && target === evokerState.element) {
        ctx.incrementCatalystElemBalance(state.t, { activateEvery: 2, durationMs: 5000 });
    }
    if (state._hasElemAttunement) ctx.applyElemAttunementBoon(target, state.t);
    ctx.triggerBountifulPower(1, state.t);
    ctx.pushAttunementTimeline({ t: state.t, att: target });

    ctx.log({ t: state.t, type: 'swap', from: prev, to: target });
    ctx.addStep({ skill: sk.name, start: state.t, end: state.t, att: target, type: 'swap', ri: state._ri, icon: swapIcon });

    runConcurrentSteps(ctx, concurrents, {
        anchorTime: state.t,
        restoreTime: state.t,
    });
}

export function handleWeaverSwap(ctx, target, sk, isConcurrent, concurrents, {
    attunements,
    weaverSwapCd,
}) {
    const { S } = ctx;
    const procState = getProcState(S);
    if (target === S.att && target === S.att2) {
        ctx.log({ t: S.t, type: 'err', msg: `Already in ${target}/${target}` });
        return;
    }

    if (!isConcurrent) {
        ctx.setAACarryover(ctx.detectAACarryover());
    } else {
        ctx.setPendingAACPrevious(S.att);
    }

    advanceSwapToReadyTime(ctx, target);

    const unravelActive = (S.unravelUntil || 0) > S.t;
    const prevPrimary = S.att;
    const prevSecondary = S.att2;
    const nextSecondary = unravelActive ? target : prevPrimary;
    ctx.setSecondaryAttunement(nextSecondary);
    ctx.setAttunement(target);
    ctx.setAttEnteredAt(S.t);
    if (target === 'Air') ctx.setFlag('freshAirResetAt', -Infinity);

    const weaveSelfWasActive = S.weaveSelfUntil > S.t;
    if (weaveSelfWasActive) {
        ctx.addWeaveSelfVisited(target);
        if (S.weaveSelfVisited.size >= 4) {
            ctx.resetWeaveSelfState();
            ctx.setPerfectWeaveUntil(S.t + 10000);
            ctx.log({ t: S.t, type: 'skill_proc', skill: 'Perfect Weave', detail: '10s' });
        }
    }

    const weaveSelfSwapCD = weaveSelfWasActive ? 2000 : ctx.attunementCooldownMs(weaverSwapCd);
    for (const a of attunements) {
        let newCD = S.t + ctx.alacrityAdjustedCooldown(weaveSelfSwapCD, S.t);
        if (a === 'Air' && S._hasFreshAir && procState.freshAirResetAt >= S.t) {
            newCD = Math.min(newCD, procState.freshAirResetAt);
        }
        ctx.setAttunementCooldown(a, newCD);
    }

    ctx.scheduleHits(sk, S.t);
    ctx.procOnSwapSigils(S.t);
    applySharedSwapElementEffects(ctx, {
        prevPrimary,
        target,
        allowFreshAirBuff: prevPrimary !== 'Air',
    });
    if (unravelActive) {
        if (S._hasWeaversProwess) ctx.refreshEffect("Weaver's Prowess", 8, S.t);
        if (S._hasElementsOfRage) ctx.refreshEffect('Elements of Rage', 8, S.t);
        if (S._hasElemAttunement) ctx.applyElemAttunementBoon(target, S.t);
        ctx.triggerBountifulPower(1, S.t);
    } else {
        if (S._hasWeaversProwess && target !== prevPrimary) {
            ctx.refreshEffect("Weaver's Prowess", 8, S.t);
        }
        if (S._hasElementsOfRage && target === prevPrimary) {
            ctx.refreshEffect('Elements of Rage', 8, S.t);
        }
        if (S._hasElemAttunement && target !== prevPrimary) ctx.applyElemAttunementBoon(target, S.t);
        ctx.triggerBountifulPower(2, S.t);
    }
    ctx.pushAttunementTimeline({ t: S.t, att: target, att2: nextSecondary });

    const toLabel = unravelActive ? target : `${target}/${prevPrimary}`;
    ctx.log({ t: S.t, type: 'swap', from: `${prevPrimary}/${prevSecondary}`, to: toLabel });
    ctx.addStep({ skill: sk.name, start: S.t, end: S.t, att: target, type: 'swap', ri: S._ri });

    runConcurrentSteps(ctx, concurrents, {
        anchorTime: S.t,
        restoreTime: S.t,
    });
}

export function handleOverload(ctx, sk, concurrents, {
    overloadDwell,
}) {
    const state = ctx.S;
    if (state.eliteSpec !== 'Tempest') {
        ctx.log({ t: state.t, type: 'err', msg: `Overloads require Tempest specialization` });
        return;
    }
    const olAtt = sk.attunement;
    if (olAtt !== state.att) {
        ctx.log({ t: state.t, type: 'err', msg: `Need ${olAtt} for ${sk.name}` });
        return;
    }

    const cdReady = getSkillCooldownReadyAt(state, sk.name);
    ctx.advanceTimeTo(cdReady);

    const baseDwell = state._hasTranscendentTempest
        ? Math.round(overloadDwell * (2 / 3))
        : overloadDwell;
    const dwellEffMs = ctx.alacrityAdjustedCooldown(baseDwell, state.attEnteredAt);
    const dwellReady = state.attEnteredAt + dwellEffMs;
    ctx.advanceTimeTo(dwellReady);

    const { castMs, scaleOff, start, end } = buildCastWindow(ctx, sk, state.t);

    if (state._hasHarmoniousConduit) {
        ctx.trackEffect('Swiftness', 1, 8, start);
        ctx.trackEffect('Stability', 1, 4, start);
    }
    if (state._hasHardyConduit) {
        ctx.trackEffect('Protection', 1, 3, start);
    }

    ctx.beginCast(sk.name, start, castMs);
    ctx.scheduleHits(sk, start, scaleOff);
    ctx.trackField(sk, end);
    ctx.trackAura(sk, end);
    if (sk.attunement === 'Fire') ctx.triggerSunspot(start);

    ctx.finishCast(sk.name, end, { setCastUntil: true });

    runConcurrentSteps(ctx, concurrents, {
        anchorTime: start,
        restoreTime: end,
        clampToAnchor: true,
    });

    const olBaseCd = ctx.attunementCooldownMs(Math.round(sk.recharge * 1000));
    const olEffCd = ctx.alacrityAdjustedCooldown(olBaseCd, end);
    ctx.setAttunementCooldown(olAtt, end + olEffCd);
    ctx.setSkillCooldown(sk.name, end + olEffCd);

    ctx.resetChainsOnCast(sk);

    ctx.ensurePerSkill(sk.name);
    ctx.recordSkillCast(sk.name, castMs);
    ctx.addStep({ skill: sk.name, start, end, att: state.att, type: 'overload', ri: state._ri });

    if (state._hasUnstableConduit) {
        const auraMap = { Fire: 'Fire Aura', Water: 'Frost Aura', Air: 'Shocking Aura', Earth: 'Magnetic Aura' };
        const aura = auraMap[olAtt];
        if (aura) ctx.applyAura(aura, 4000, end, 'Unstable Conduit');
    }

    if (state._hasPyroPuissance && state.att === 'Fire' && isCombatActiveAt(state, end)) {
        ctx.trackEffect('Might', 1, 15, end);
    }
    if (sk.attunement === 'Fire') ctx.triggerFlameExpulsion(end);
    if (sk.attunement === 'Air') ctx.triggerElectricDischarge(start);
    if (sk.attunement === 'Earth') ctx.triggerEarthenBlast(start);

    if (state._hasTranscendentTempest) {
        ctx.refreshEffect('Transcendent Tempest', 7, end);
    }

    if (sk.attunement === 'Air') {
        ctx.setFlag('overloadAirBonusPending', true);
    }
}
