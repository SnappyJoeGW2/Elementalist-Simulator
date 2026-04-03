// Event queue rules are chronology-sensitive.
// For equal timestamps, newly queued events are inserted after existing ones.
// That preserves the legacy same-time ordering used by the current simulator.

let nextQueueSeq = 1;

function getEventPriority(event) {
    return event.priority ?? 0;
}

function ensureQueueMetadata(event) {
    if (event._queueSeq === undefined) event._queueSeq = nextQueueSeq++;
    return event;
}

export function compareQueuedEvents(a, b) {
    if (a.time !== b.time) return a.time - b.time;

    const aPriority = getEventPriority(a);
    const bPriority = getEventPriority(b);
    if (aPriority !== bPriority) return aPriority - bPriority;

    return (a._queueSeq ?? 0) - (b._queueSeq ?? 0);
}

export function enqueueOrdered(queue, event) {
    ensureQueueMetadata(event);
    let lo = 0;
    let hi = queue.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (compareQueuedEvents(queue[mid], event) <= 0) lo = mid + 1;
        else hi = mid;
    }
    queue.splice(lo, 0, event);
}

export function sortQueuedEvents(queue) {
    for (const event of queue) ensureQueueMetadata(event);
    queue.sort(compareQueuedEvents);
}

export function takeNextEvent(queue) {
    return queue.shift();
}
