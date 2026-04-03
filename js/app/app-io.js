export async function fetchJsonAsset(path, { optional = false } = {}) {
    const res = await fetch(`${path}?t=${Date.now()}`);
    if (!res.ok) {
        if (optional) return null;
        throw new Error(`Could not load ${path}`);
    }
    return res.json();
}

export function downloadJson(filename, data) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function readJsonFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                resolve(JSON.parse(e.target.result));
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error(`Failed to read ${file?.name || 'file'}`));
        reader.readAsText(file);
    });
}

export function getRotationItems(payload) {
    return Array.isArray(payload) ? payload : payload?.rotation;
}

export async function loadPresetBundle(preset) {
    const buildData = await fetchJsonAsset(preset.build);
    let rotationItems;
    if (preset.rotation) {
        const rotationData = await fetchJsonAsset(preset.rotation, { optional: true });
        const items = getRotationItems(rotationData);
        if (Array.isArray(items)) rotationItems = items;
    }
    return { buildData, rotationItems };
}
