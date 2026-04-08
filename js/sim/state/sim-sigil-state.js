export function createSigilState() {
    return {
        severanceUntil: 0,
    };
}

export function getSigilState(S) {
    if (!S._sigilState) S._sigilState = createSigilState();
    return S._sigilState;
}

export function resetSigilState(S) {
    S._sigilState = createSigilState();
    return S._sigilState;
}

export function isSeveranceActive(S, time) {
    return getSigilState(S).severanceUntil > time;
}