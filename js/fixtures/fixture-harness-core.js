import { cloneRotationItems, resolveSelectedSkills } from '../app/app-state.js';
import { createSimulationEngine, calcBuildAttributes, runSimulationContributions } from '../sim/run/sim-runner.js';

function deepSort(value) {
    if (Array.isArray(value)) return value.map(deepSort);
    if (value && typeof value === 'object') {
        const out = {};
        for (const key of Object.keys(value).sort()) out[key] = deepSort(value[key]);
        return out;
    }
    return value;
}

function stableStringify(value) {
    return JSON.stringify(deepSort(value));
}

function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

function round(value, digits = 3) {
    if (value === null || value === undefined || Number.isNaN(value)) return value ?? null;
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}

function topPerSkill(perSkill = {}, limit = 12) {
    return Object.entries(perSkill)
        .map(([name, stats]) => ({
            name,
            total: round((stats.strike || 0) + (stats.condition || 0), 3),
            strike: round(stats.strike || 0, 3),
            condition: round(stats.condition || 0, 3),
        }))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
        .slice(0, limit);
}

function topContributions(contributions = [], limit = 12) {
    return (contributions || [])
        .map(entry => ({
            name: entry.name,
            dpsIncrease: round(entry.dpsIncrease || 0, 3),
            pctIncrease: round(entry.pctIncrease || 0, 4),
        }))
        .sort((a, b) => b.dpsIncrease - a.dpsIncrease || a.name.localeCompare(b.name))
        .slice(0, limit);
}

function normalizeEndState(endState = {}) {
    return {
        time: endState.time ?? null,
        att: endState.att ?? null,
        att2: endState.att2 ?? null,
        energy: endState.energy ?? null,
        endurance: endState.endurance ?? null,
        hasExplicitCombatStart: endState.hasExplicitCombatStart ?? false,
        combatStartTime: endState.combatStartTime ?? null,
        evokerElement: endState.evokerElement ?? null,
        evokerCharges: endState.evokerCharges ?? null,
        pistolBullets: endState.pistolBullets || {},
        hammerOrbs: endState.hammerOrbs || {},
        attCD: endState.attCD || {},
        skillCD: endState.skillCD || {},
        charges: endState.charges || {},
        chainState: endState.chainState || {},
    };
}

function sanitizeLog(log = []) {
    return log.map(entry => ({
        t: entry.t,
        type: entry.type,
        skill: entry.skill ?? null,
        cond: entry.cond ?? null,
        effect: entry.effect ?? null,
        msg: entry.msg ?? null,
        strike: entry.strike ?? null,
        detail: entry.detail ?? null,
        from: entry.from ?? null,
        to: entry.to ?? null,
    }));
}

function sanitizeSteps(steps = []) {
    return steps.map(step => ({
        skill: step.skill,
        start: step.start,
        end: step.end,
        att: step.att ?? null,
        type: step.type ?? null,
        ri: step.ri ?? null,
    }));
}

export function mergeFixtureState(buildState, rotationState) {
    const rotation = Array.isArray(rotationState)
        ? rotationState
        : (rotationState?.rotation || buildState?.rotation || []);
    return {
        ...buildState,
        rotation: cloneRotationItems(rotation),
    };
}

export function createSimulationContext(data, state) {
    const selectedSkills = resolveSelectedSkills(state.selectedSkills, data.skills);
    const attributes = calcBuildAttributes(state.build, selectedSkills);
    const sim = createSimulationEngine(data, attributes);
    for (const item of (state.rotation || [])) sim.addSkill(item);
    return { sim, attributes, selectedSkills };
}

export function summarizeResults(results) {
    const endState = normalizeEndState(results.endState);
    const skillSummary = topPerSkill(results.perSkill);
    const contributionSummary = topContributions(results.contributions);
    const logSummary = sanitizeLog(results.log);
    const stepSummary = sanitizeSteps(results.steps);

    return {
        metrics: {
            dps: round(results.dps, 6),
            totalDamage: round(results.totalDamage, 3),
            totalStrike: round(results.totalStrike, 3),
            totalCondition: round(results.totalCondition, 3),
            deathTime: results.deathTime,
            rotationMs: results.rotationMs,
            dpsWindowMs: results.dpsWindowMs,
        },
        counts: {
            rotationLength: results.steps?.filter(step => step.ri >= 0).length ?? 0,
            logEntries: results.log?.length ?? 0,
            stepEntries: results.steps?.length ?? 0,
            allCondStacks: results.allCondStacks?.length ?? 0,
        },
        topSkills: skillSummary,
        topContributions: contributionSummary,
        condAvgStacks: Object.fromEntries(
            Object.entries(results.condAvgStacks || {})
                .map(([name, value]) => [name, round(value, 4)])
                .sort(([a], [b]) => a.localeCompare(b))
        ),
        endState,
        hashes: {
            perSkill: hashString(stableStringify(results.perSkill || {})),
            contributions: hashString(stableStringify(results.contributions || [])),
            condAvgStacks: hashString(stableStringify(results.condAvgStacks || {})),
            endState: hashString(stableStringify(endState)),
            log: hashString(stableStringify(logSummary)),
            steps: hashString(stableStringify(stepSummary)),
        },
    };
}

export function runFixtureWithData(data, fixture, buildState, rotationState) {
    const mergedState = mergeFixtureState(buildState, rotationState);
    const { sim } = createSimulationContext(data, mergedState);
    const targetHP = fixture.targetHP ?? 0;
    runSimulationContributions({
        sim,
        activeAttunement: mergedState.activeAttunement || 'Fire',
        secondaryAttunement: mergedState.secondaryAttunement || null,
        evokerElement: mergedState.evokerElement || null,
        permaBoons: mergedState.permaBoons || {},
        targetHP,
        startPistolBullets: null,
    });
    return {
        fixtureId: fixture.id,
        label: fixture.label,
        targetHP,
        summary: summarizeResults(sim.results),
    };
}

export function compareSummaries(current, baseline) {
    if (!baseline) {
        return {
            ok: false,
            mismatches: ['Missing baseline'],
        };
    }

    const mismatches = [];
    const metricKeys = ['dps', 'totalDamage', 'totalStrike', 'totalCondition', 'deathTime', 'rotationMs', 'dpsWindowMs'];
    for (const key of metricKeys) {
        const a = current.metrics?.[key];
        const b = baseline.metrics?.[key];
        if (typeof a === 'number' || typeof b === 'number') {
            if (Math.abs((a ?? 0) - (b ?? 0)) > 0.000001) mismatches.push(`Metric changed: ${key}`);
        } else if (a !== b) {
            mismatches.push(`Metric changed: ${key}`);
        }
    }

    const countKeys = ['rotationLength', 'logEntries', 'stepEntries', 'allCondStacks'];
    for (const key of countKeys) {
        if ((current.counts?.[key] ?? null) !== (baseline.counts?.[key] ?? null)) {
            mismatches.push(`Count changed: ${key}`);
        }
    }

    for (const key of ['perSkill', 'contributions', 'condAvgStacks', 'endState', 'log', 'steps']) {
        if (current.hashes?.[key] !== baseline.hashes?.[key]) {
            mismatches.push(`Hash changed: ${key}`);
        }
    }

    return {
        ok: mismatches.length === 0,
        mismatches,
    };
}
