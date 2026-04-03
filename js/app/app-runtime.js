import {
    buildSnapshotFromState,
    cloneRotationItems,
    mergeSnapshotIntoState,
} from './app-state.js';
import {
    rebuildSimulation,
    runSimulationContributions,
} from '../sim/run/sim-runner.js';

function normalizeConcurrentOffsetMs(offset) {
    if (offset === null || offset === undefined) return offset;
    return Math.max(1, offset);
}

function normalizeWaitMs(waitMs) {
    if (waitMs === null || waitMs === undefined) return waitMs;
    return Math.max(1, waitMs);
}

export function getStartPistolBullets(app) {
    if (app._presetPistolBullets) return { ...app._presetPistolBullets };
    return null;
}

export function serializeRotation(app) {
    if (!app.sim) return [];
    return cloneRotationItems(app.sim.rotation);
}

export function deserializeRotation(app, items) {
    if (!app.sim || !Array.isArray(items)) return;
    app.sim.clearRotation();
    for (const item of items) app.sim.addSkill(item);
}

export function buildSnapshot(app) {
    return buildSnapshotFromState({
        build: app.build,
        selectedSkills: app.selectedSkills,
        activeAttunement: app.activeAttunement,
        secondaryAttunement: app.secondaryAttunement,
        evokerElement: app.evokerElement,
        permaBoons: app.permaBoons,
        rotation: serializeRotation(app),
    });
}

export function applySnapshot(app, state) {
    const merged = mergeSnapshotIntoState({
        build: app.build,
        activeAttunement: app.activeAttunement,
        secondaryAttunement: app.secondaryAttunement,
        evokerElement: app.evokerElement,
        permaBoons: app.permaBoons,
        selectedSkills: app.selectedSkills,
    }, state, app.data?.skills);

    app.build = merged.build;
    app.activeAttunement = merged.activeAttunement;
    app.secondaryAttunement = merged.secondaryAttunement;
    app.evokerElement = merged.evokerElement;
    app.permaBoons = merged.permaBoons;
    app.selectedSkills = merged.selectedSkills;

    if (merged.rotation) {
        if (app.sim) deserializeRotation(app, merged.rotation);
        else app._pendingRotation = merged.rotation;
    }
}

export function persistBuild(app) {
    try {
        localStorage.setItem('gw2dps_build', JSON.stringify(buildSnapshot(app)));
    } catch (_) { /* localStorage unavailable */ }
}

export function restoreBuild(app) {
    try {
        const raw = localStorage.getItem('gw2dps_build');
        if (!raw) return;
        applySnapshot(app, JSON.parse(raw));
    } catch (_) { /* corrupt or missing */ }
}

export function onBuildChange(app) {
    const rotation = app.sim ? cloneRotationItems(app.sim.rotation) : [];
    const rebuilt = rebuildSimulation({
        data: app.data,
        build: app.build,
        selectedSkills: app.selectedSkills,
        rotation,
    });
    app.data.attributes = rebuilt.attributes;
    app.sim = rebuilt.sim;

    app.renderTraits();
    app.renderAttributes();
    app.renderConditions();
    app.renderAttunementBar();
    app.renderWeaponBar();
    app.renderSkillBar();
    app.renderSkillInfoTable();

    if (app.sim.rotation.length > 0) autoRun(app);
    else app._renderPalette();

    persistBuild(app);
}

export function autoRun(app) {
    if (!app.sim || app.sim.rotation.length === 0) {
        app.sim.results = null;
        app._renderPalette();
        app._renderTimeline();
        document.getElementById('rotation-results').innerHTML = '';
        app._updateOptimizerVisibility(false);
        persistBuild(app);
        return;
    }

    runSimulationContributions({
        sim: app.sim,
        activeAttunement: app.activeAttunement,
        secondaryAttunement: app.secondaryAttunement,
        evokerElement: app.evokerElement,
        permaBoons: app.permaBoons,
        targetHP: app._getTargetHP(),
        startPistolBullets: getStartPistolBullets(app),
    });

    app._renderPalette();
    app._renderTimeline();
    app._renderResults();
    app._updateOptimizerVisibility(true);
    persistBuild(app);
}

function buildRotationItem(skillName, {
    offset = null,
    gapFill = false,
    interruptMs = null,
    waitMs = null,
} = {}) {
    const item = { name: skillName };
    if (offset !== null) item.offset = normalizeConcurrentOffsetMs(offset);
    if (gapFill) item.gapFill = true;
    if (interruptMs !== null) item.interruptMs = interruptMs;
    if (waitMs !== null) item.waitMs = normalizeWaitMs(waitMs);
    return Object.keys(item).length === 1 ? skillName : item;
}

export function addToRotation(app, skillName, options = {}) {
    if (!app.sim) return;
    app.sim.addSkill(buildRotationItem(skillName, options));
    autoRun(app);
}

export function removeFromRotation(app, idx) {
    if (!app.sim) return;
    app.sim.removeSkill(idx);
    autoRun(app);
}

export function clearRotation(app) {
    if (!app.sim) return;
    app.sim.clearRotation();
    app._renderPalette();
    app._renderTimeline();
    document.getElementById('rotation-results').innerHTML = '';
}

export function refreshAfterBuildStateChange(app) {
    onBuildChange(app);
    app.render();
}

export function applyLoadedBuildState(app, state, rotationItems = undefined) {
    applySnapshot(app, state);
    if (rotationItems !== undefined) deserializeRotation(app, rotationItems);
    refreshAfterBuildStateChange(app);
}
