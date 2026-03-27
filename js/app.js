import { loadAllData } from './csv-loader.js';
import { calcAttributes } from './calc-attributes.js';
import {
    PREFIXES, GEAR_SLOTS, RUNE_NAMES, FOOD_NAMES, FOOD_DATA,
    UTILITY_NAMES, UTILITY_DATA, UTILITY_CONVERSION_RATES, INFUSION_STATS,
    WEAPON_DATA, SIGIL_DATA, SIGIL_NAMES, RELIC_DATA, RELIC_NAMES,
    getActiveGearSlots,
} from './gear-data.js';
import { TRAITS, SPECIALIZATIONS } from './traits-data.js';
import { GW2API, PLACEHOLDER_ICON } from './gw2-api.js';
import { calculateSkillDamage } from './damage.js';
import { SimulationEngine } from './simulation.js';
import { GearOptimizer } from './optimizer.js';

// ─── Consumable description helpers ──────────────────────────────────────────
const STAT_ABBR = {
    'Power': 'Pwr', 'Precision': 'Prec', 'Toughness': 'Tough',
    'Vitality': 'Vit', 'Ferocity': 'Ferc', 'Condition Damage': 'CndDmg',
    'Expertise': 'Exprt', 'Concentration': 'Conc', 'Healing Power': 'Heal',
};
const DUR_ABBR = {
    'Burning Duration': 'Burn', 'Bleeding Duration': 'Bleed',
    'Poison Duration': 'Poison', 'Torment Duration': 'Torment',
    'Confusion Duration': 'Confuse',
};
function _foodDesc(name) {
    const d = FOOD_DATA[name];
    if (!d) return '';
    return [
        ...Object.entries(d.stats).map(([k, v]) => `+${v} ${STAT_ABBR[k] || k}`),
        ...Object.entries(d.durations).map(([k, v]) => `+${v}% ${DUR_ABBR[k] || k}`),
    ].join(', ');
}
function _utilityDesc(name) {
    const convs = UTILITY_DATA[name];
    if (!convs) return '';
    return convs.map(c => {
        const rate = UTILITY_CONVERSION_RATES[c.from] || 0;
        return `${rate}% ${STAT_ABBR[c.from] || c.from}→${STAT_ABBR[c.to] || c.to}`;
    }).join(', ');
}

// ─── Default build (Weaver Sword/Dagger DPS) ─────────────────────────────────
const DEFAULT_BUILD = {
    gear: {
        Helm: "Assassin's", Shoulders: "Assassin's",
        Chest: "Berserker's", Gloves: "Berserker's", Leggins: "Berserker's", Boots: "Berserker's",
        Amulet: "Berserker's", Ring1: "Berserker's", Ring2: "Berserker's",
        Accessory1: "Berserker's", Accessory2: "Berserker's", Back: "Berserker's",
        Weapon1: "Berserker's", Weapon2: "Berserker's",
    },
    weapons: ['Sword', 'Dagger'],
    rune: 'Dragonhunter',
    sigils: ['Force', 'Accuracy'],
    relic: 'Claw',
    food: 'Bowl of Sweet and Spicy Butternut Squash Soup',
    utility: 'Superior Sharpening Stone',
    jadeBotCore: true,
    specializations: [
        { name: 'Fire', traits: '1-3-1' },
        { name: 'Air', traits: '3-3-2' },
        { name: 'Weaver', traits: '1-2-1' },
    ],
    infusions: [
        { stat: 'Power',     count: 0 },
        { stat: 'Precision', count: 0 },
        { stat: 'Condition Damage', count: 0 },
    ],
};

const ATTUNEMENTS = ['Fire', 'Water', 'Air', 'Earth'];
const ATTUNEMENT_COLORS = {
    Fire: '#e05530', Water: '#4488cc', Air: '#c06ad0', Earth: '#aa7744',
};
const TH_WEAPONS = new Set(
    Object.entries(WEAPON_DATA).filter(([, d]) => d.wielding === '2h').map(([k]) => k)
);
const CONJURE_MAP = {
    'Conjure Frost Bow': 'Frost Bow',
    'Conjure Lightning Hammer': 'Lightning Hammer',
    'Conjure Fiery Greatsword': 'Fiery Greatsword',
};
const CONJURE_WEAPONS = new Set(['Frost Bow', 'Lightning Hammer', 'Fiery Greatsword']);
const DROP_BUNDLE_ICON = 'https://wiki.guildwars2.com/images/c/ce/Weapon_Swap_Button.png';
const CATALYST_ENERGY_MAX = 30;
const SLOT_LABELS = ['heal', 'util1', 'util2', 'util3', 'elite'];
const SLOT_TYPES = { heal: 'Healing', util1: 'Utility', util2: 'Utility', util3: 'Utility', elite: 'Elite' };

const SKILL_TYPE_SPEC = {
    Shout: 'Tempest', Stance: 'Weaver', Augment: 'Catalyst',
    Meditation: 'Evoker', Familiar: 'Evoker', 'Jade Sphere': 'Catalyst',
};

// Spear Etching chains (mirrors ETCHING_CHAINS in simulation.js)
const ETCHING_CHAINS_UI = {
    'Volcano':    { etching: 'Etching: Volcano',    lesser: 'Lesser Volcano',    full: 'Volcano'    },
    'Jökulhlaup':{ etching: 'Etching: Jökulhlaup', lesser: 'Lesser Jökulhlaup', full: 'Jökulhlaup' },
    'Derecho':   { etching: 'Etching: Derecho',     lesser: 'Lesser Derecho',    full: 'Derecho'    },
    'Haboob':    { etching: 'Etching: Haboob',      lesser: 'Lesser Haboob',     full: 'Haboob'     },
};
const ETCHING_LOOKUP_UI = new Map();
for (const chain of Object.values(ETCHING_CHAINS_UI)) {
    ETCHING_LOOKUP_UI.set(chain.etching, chain);
    ETCHING_LOOKUP_UI.set(chain.lesser,  chain);
    ETCHING_LOOKUP_UI.set(chain.full,    chain);
}

// Hammer orb system (mirrors simulation.js constants)
const HAMMER_ORB_SKILLS_UI = new Set(['Flame Wheel', 'Icy Coil', 'Crescent Wind', 'Rocky Loop']);
const HAMMER_DUAL_ORB_SKILLS_UI = {
    'Dual Orbits: Fire and Water':  ['Fire', 'Water'],
    'Dual Orbits: Fire and Air':    ['Fire', 'Air'],
    'Dual Orbits: Fire and Earth':  ['Fire', 'Earth'],
    'Dual Orbits: Water and Air':   ['Water', 'Air'],
    'Dual Orbits: Water and Earth': ['Water', 'Earth'],
    'Dual Orbits: Air and Earth':   ['Air', 'Earth'],
};
const HAMMER_ALL_ORB_NAMES_UI = new Set([...HAMMER_ORB_SKILLS_UI, ...Object.keys(HAMMER_DUAL_ORB_SKILLS_UI)]);
const HAMMER_ORB_DURATION_MS_UI = 15000;
const HAMMER_ORB_ICD_MS_UI = 480;

const INTENSITY_EFFECTS = new Set([
    'Burning', 'Bleeding', 'Poisoned', 'Poison', 'Torment', 'Confusion',
    'Might', 'Stability', 'Vulnerability',
    'Elemental Empowerment', 'Empowering Auras', 'Persisting Flames',
]);

const EFFECT_COLORS = {
    Burning: '#e05530', Bleeding: '#cc4444', Poisoned: '#55aa33', Poison: '#55aa33',
    Torment: '#c06ad0', Confusion: '#d0a040',
    Vulnerability: '#886644', Blindness: '#ccaa88', Chilled: '#66aadd',
    Cripple: '#8a7a5a', Weakness: '#997766', Fear: '#884488',
    Immobilize: '#998844', Slow: '#6688aa', Taunt: '#cc6644',
    Might: '#dd4444', Stability: '#aa8833', Fury: '#ff8833',
    Aegis: '#dddd44', Alacrity: '#bb66cc', Protection: '#44aadd',
    Regeneration: '#44bb44', Resistance: '#cc9944', Resolution: '#88aacc',
    Swiftness: '#ffcc44', Quickness: '#cc44cc', Vigor: '#44ddaa',
    Superspeed: '#dddddd',
    'Fire Aura': '#e05530',
    'Frost Aura': '#4488cc',
    'Shocking Aura': '#c06ad0',
    'Magnetic Aura': '#aa7744',
    'Light Aura': '#dddd44',
    'Elemental Empowerment': '#55ccbb',
    'Empowering Auras': '#cc88dd',
    'Persisting Flames': '#ff6644',
    'Dark Aura': '#884488',
    'Persisting Flames': '#ff8833',
    'Fresh Air': '#66ccff',
    'Tempestuous Aria': '#dd6699',
    'Transcendent Tempest': '#9966ff',
    'Elements of Rage': '#ff4444',
    'Elemental Empowerment': '#44ddaa',
    'Empowering Auras': '#ffaa33',
    "Familiar's Prowess": '#aa55ff',
};

function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

class App {
    constructor() {
        this.data = null;
        this.build = null;
        this.api = new GW2API();
        this.activeAttunement = 'Fire';
        this.secondaryAttunement = 'Fire';
        this.evokerElement = null;
        this.selectedSkills = { heal: null, util1: null, util2: null, util3: null, elite: null };
        this.permaBoons = {
            Might: 25,
            Fury: true,
            Protection: true,
            Resolution: true,
            Alacrity: true,
            Quickness: true,
            Regeneration: true,
            Vigor: true,
            Swiftness: true,
            Bleeding: true,
            Burning: true,
            Torment: true,
            Confusion: true,
            Poisoned: true,
            Chilled: true,
            Cripple: true,
            Slow: true,
            Weakness: true,
            Vulnerability: 25,
        };
        this.openDropdown = null;
        this.sim = null;
        this.dragIdx = null;
        this.conditions = {
            might: 0, fury: false,
            primaryAtt: 'None', secondaryAtt: 'None',
            elemEmpowerment: 0,
            freshAir: false,
            superiorElements: false,
            weaversProwess: false,
        };
    }

    async init() {
        this.setStatus('Loading CSV data...');
        try {
            this.data = await loadAllData();
        } catch (e) {
            this.setStatus('Failed to load CSV files. Make sure to run a local web server.');
            console.error(e);
            return;
        }

        this.setStatus('Fetching icons from GW2 API...');
        await this.api.init();

        this.setStatus('');
        document.getElementById('loading-overlay').style.display = 'none';

        // Initialize build state — restore from localStorage or fall back to default
        this.build = JSON.parse(JSON.stringify(DEFAULT_BUILD));
        this._restoreBuild(); // populates this.build, selectedSkills, etc. from localStorage if available
        this.data.attributes = calcAttributes(
            this.build,
            Object.values(this.selectedSkills).filter(Boolean),
        );

        this.sim = new SimulationEngine({
            skills: this.data.skills,
            skillHits: this.data.skillHits,
            weapons: WEAPON_DATA,
            attributes: this.data.attributes,
            sigils: SIGIL_DATA,
            relics: RELIC_DATA,
            activeTraits: this.data.attributes.activeTraits,
        });

        // Rotation couldn't be restored in _restoreBuild because this.sim didn't
        // exist yet.  Re-apply the saved rotation now that the engine is ready.
        if (this._pendingRotation) {
            this._deserializeRotation(this._pendingRotation);
            this._pendingRotation = null;
            if (this.sim.rotation.length > 0) this._autoRun();
        }

        this._initOptimizer();

        document.getElementById('btn-sim-clear').addEventListener('click', () => this._clearRotation());
        document.getElementById('btn-sim-rerun').addEventListener('click', () => {
            if (this.sim?.rotation.length > 0) this._autoRun();
            this.render();
        });
        document.getElementById('btn-export-rotation').addEventListener('click', () => this._exportRotation());
        document.getElementById('btn-import-rotation').addEventListener('click', () => {
            document.getElementById('rotation-file-input').click();
        });
        document.getElementById('rotation-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) { this._importRotation(file); e.target.value = ''; }
        });
        document.getElementById('btn-export-build').addEventListener('click', () => this._exportBuild());
        document.getElementById('btn-import-build').addEventListener('click', () => {
            document.getElementById('import-file-input').click();
        });
        document.getElementById('import-file-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) { this._importBuild(file); e.target.value = ''; }
        });
        document.getElementById('target-hp').addEventListener('change', () => {
            if (this.sim?.rotation.length > 0) this._autoRun();
        });

        document.addEventListener('click', (e) => {
            if (this.openDropdown && !e.target.closest('.skill-bar-slot')) {
                this.closeDropdown();
            }
        });

        this.render();
        this._loadPresets();
    }

    // ─── Build change handler ───
    _onBuildChange() {
        this.data.attributes = calcAttributes(
            this.build,
            Object.values(this.selectedSkills).filter(Boolean),
        );
        if (this.sim) {
            this.sim.attributes = this.data.attributes;
            this.sim.activeTraitNames = new Set(
                (this.data.attributes.activeTraits || []).map(t => t.name)
            );
        }
        this.renderTraits();
        this.renderAttributes();
        this.renderConditions();
        this.renderAttunementBar();
        this.renderWeaponBar();
        this.renderSkillBar();
        this.renderSkillInfoTable();
        if (this.sim?.rotation.length > 0) this._autoRun();
        else this._renderPalette();
        this._persistBuild();
    }

    setStatus(msg) {
        const el = document.getElementById('loading-status');
        if (el) el.textContent = msg;
    }

    render() {
        this.renderGear();
        this.renderWeaponSelect();
        this.renderAttributes();
        this.renderConditions();
        this.renderTraits();
        this.renderAttunementBar();
        this.renderWeaponBar();
        this.renderSkillBar();
        this.renderSkillInfoTable();
        this._renderPermaBoons();
        this.renderRotationBuilder();
    }

    // ─── Gear Panel ───
    renderGear() {
        const container = document.getElementById('gear-slots');
        const is2H = TH_WEAPONS.has(this.build.weapons?.[0] || '');

        container.innerHTML = GEAR_SLOTS.map(slot => {
            const hidden = is2H && slot === 'Weapon2';
            const label  = is2H && slot === 'Weapon1' ? 'Weapon (2H)' : slot;
            const cur = this.build.gear[slot] || PREFIXES[0];
            const opts = PREFIXES.map(p =>
                `<option value="${esc(p)}"${p === cur ? ' selected' : ''}>${esc(p)}</option>`
            ).join('');
            return `<div class="gear-row"${hidden ? ' style="display:none"' : ''}>
                <span class="gear-label">${label}</span>
                <select class="gear-select" data-slot="${slot}">${opts}</select>
            </div>`;
        }).join('');

        container.querySelectorAll('.gear-select').forEach(sel => {
            sel.addEventListener('change', () => {
                this.build.gear[sel.dataset.slot] = sel.value;
                this._onBuildChange();
            });
        });
    }

    renderWeaponSelect() {
        // Weapon types (mainhand / offhand)
        const weaponContainer = document.getElementById('weapon-select');
        const mhTypes = this._getMHTypes();
        const ohTypes = this._getOHTypes();
        const isMH2H = TH_WEAPONS.has(this.build.weapons[0] || '');

        weaponContainer.innerHTML = `
            <div class="gear-row">
                <span class="gear-label">MH Type</span>
                <select class="gear-select" id="sel-mh">
                    ${mhTypes.map(t => `<option value="${esc(t)}"${t === this.build.weapons[0] ? ' selected' : ''}>${esc(t)}</option>`).join('')}
                </select>
            </div>
            <div class="gear-row" id="oh-row" style="${isMH2H ? 'opacity:.4;pointer-events:none' : ''}">
                <span class="gear-label">OH Type</span>
                <select class="gear-select" id="sel-oh">
                    ${ohTypes.map(t => `<option value="${esc(t)}"${t === this.build.weapons[1] ? ' selected' : ''}>${esc(t)}</option>`).join('')}
                </select>
            </div>`;

        weaponContainer.querySelector('#sel-mh').addEventListener('change', e => {
            this.build.weapons[0] = e.target.value;
            const is2H = TH_WEAPONS.has(e.target.value);
            if (is2H) this.build.weapons[1] = '';
            document.getElementById('oh-row').style.opacity    = is2H ? '.4' : '';
            document.getElementById('oh-row').style.pointerEvents = is2H ? 'none' : '';
            this._onBuildChange();
            this.renderAttunementBar();
            this.renderGear();
        });
        weaponContainer.querySelector('#sel-oh').addEventListener('change', e => {
            this.build.weapons[1] = e.target.value;
            this._onBuildChange();
        });

        // Equipment info (rune, sigils, relic, food, utility, JBC, infusions)
        const eq = document.getElementById('equipment-info');
        const b  = this.build;
        const sigilNames = SIGIL_NAMES;
        const relicNames = RELIC_NAMES;

        const selRow = (label, id, options, selected, cls = '') =>
            `<div class="gear-row">
                <span class="gear-label">${label}</span>
                <select class="gear-select${cls ? ' ' + cls : ''}" id="${id}">
                    ${options.map(o => `<option value="${esc(o)}"${o === selected ? ' selected' : ''}>${esc(o)}</option>`).join('')}
                </select>
            </div>`;

        const consumableRow = (label, id, options, selected, descFn, cls = '') => {
            const hint = selected ? esc(descFn(selected)) : '';
            return `<div class="gear-row consumable-row">
                <span class="gear-label">${label}</span>
                <div class="consumable-select-wrap">
                    <select class="gear-select${cls ? ' ' + cls : ''}" id="${id}">
                        ${options.map(o => `<option value="${esc(o)}"${o === selected ? ' selected' : ''}>${esc(o)}</option>`).join('')}
                    </select>
                    <span class="consumable-hint" id="${id}-hint">${hint}</span>
                </div>
            </div>`;
        };

        eq.innerHTML = `
            ${selRow('Rune',    'sel-rune',    RUNE_NAMES,    b.rune)}
            ${selRow('Sigil 1', 'sel-sig1',    sigilNames,    b.sigils[0])}
            ${selRow('Sigil 2', 'sel-sig2',    sigilNames,    b.sigils[1])}
            ${selRow('Relic',   'sel-relic',   relicNames,    b.relic)}
            ${consumableRow('Food',    'sel-food',    FOOD_NAMES,    b.food,    _foodDesc, 'small-select')}
            ${consumableRow('Utility', 'sel-utility', UTILITY_NAMES, b.utility, _utilityDesc)}
            <div class="gear-row">
                <span class="gear-label">Jade Bot</span>
                <input type="checkbox" id="chk-jbc" class="gear-checkbox"${b.jadeBotCore ? ' checked' : ''} />
            </div>
            ${b.infusions.map((inf, i) => `
            <div class="gear-row infusion-row">
                <span class="gear-label">Infusion ${i + 1}</span>
                <div class="infusion-controls">
                    <input type="number" class="inf-count" data-inf="${i}" value="${inf.count}" min="0" max="18" step="1" />
                    <select class="gear-select inf-stat" data-inf="${i}">
                        ${INFUSION_STATS.map(s => `<option value="${esc(s)}"${s === inf.stat ? ' selected' : ''}>${esc(s)}</option>`).join('')}
                    </select>
                </div>
            </div>`).join('')}
            <div class="gear-row infusion-total-row">
                <span class="gear-label" style="color:var(--text-dim)">Total</span>
                <span id="inf-total" class="inf-total">${b.infusions.reduce((s, x) => s + x.count, 0)}/18</span>
            </div>`;

        // Attach equipment listeners
        const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('change', fn); };
        bind('sel-rune',    e => { b.rune = e.target.value; this._onBuildChange(); });
        bind('sel-sig1',    e => { b.sigils[0] = e.target.value; this._onBuildChange(); });
        bind('sel-sig2',    e => { b.sigils[1] = e.target.value; this._onBuildChange(); });
        bind('sel-relic',   e => { b.relic = e.target.value; this._onBuildChange(); });
        bind('sel-food',    e => { b.food = e.target.value;    const h = document.getElementById('sel-food-hint');    if (h) h.textContent = _foodDesc(e.target.value);    this._onBuildChange(); });
        bind('sel-utility', e => { b.utility = e.target.value; const h = document.getElementById('sel-utility-hint'); if (h) h.textContent = _utilityDesc(e.target.value); this._onBuildChange(); });
        bind('chk-jbc', e => { b.jadeBotCore = e.target.checked; this._onBuildChange(); });

        // Infusion listeners (3 slots, total capped at 18)
        eq.querySelectorAll('.inf-count').forEach(input => {
            input.addEventListener('change', () => {
                const idx = parseInt(input.dataset.inf);
                const raw = Math.max(0, parseInt(input.value) || 0);
                const otherTotal = b.infusions.reduce((s, inf, j) => j !== idx ? s + inf.count : s, 0);
                b.infusions[idx].count = Math.min(raw, 18 - otherTotal);
                input.value = b.infusions[idx].count;
                document.getElementById('inf-total').textContent = `${b.infusions.reduce((s, x) => s + x.count, 0)}/18`;
                const totalEl = document.getElementById('inf-total');
                const total = b.infusions.reduce((s, x) => s + x.count, 0);
                totalEl.textContent = `${total}/18`;
                totalEl.classList.toggle('over', total > 18);
                this._onBuildChange();
            });
        });
        eq.querySelectorAll('.inf-stat').forEach(sel => {
            sel.addEventListener('change', () => {
                const idx = parseInt(sel.dataset.inf);
                b.infusions[idx].stat = sel.value;
                this._onBuildChange();
            });
        });
    }

    _getMHTypes() {
        return Object.entries(WEAPON_DATA)
            .filter(([, d]) => d.wielding === 'mh' || d.wielding === 'mh+oh' || d.wielding === '2h')
            .map(([k]) => k);
    }

    _getOHTypes() {
        return Object.entries(WEAPON_DATA)
            .filter(([, d]) => d.wielding === 'oh' || d.wielding === 'mh+oh')
            .map(([k]) => k);
    }

    // ─── Attributes ───
    renderAttributes() {
        const container = document.getElementById('attributes-list');
        const baseAttrs = this.data.attributes.attributes;
        const condAttrs = this._getConditionalAttrs();
        const pctSet = new Set(['Critical Chance','Critical Damage','Condition Duration','Boon Duration',
            'Burning Duration','Bleeding Duration','Torment Duration','Confusion Duration','Poison Duration',
            'Quickness Duration','Might Duration','Fury Duration']);
        const fmt = (n, v) => pctSet.has(n) ? v.toFixed(2) + '%' : Math.round(v).toString();

        const primary = ['Power','Precision','Toughness','Vitality','Ferocity','Condition Damage','Expertise','Concentration','Healing Power'];
        const derived = ['Critical Chance','Critical Damage','Condition Duration','Boon Duration',
            'Burning Duration','Bleeding Duration','Torment Duration','Confusion Duration','Poison Duration'];

        // Specific condition durations are additive with the general Condition Duration.
        // Show the effective combined value so displayed numbers match what the sim uses.
        const SPEC_COND_DUR = new Set(['Burning Duration','Bleeding Duration','Torment Duration','Confusion Duration','Poison Duration']);
        const condDurBase = baseAttrs['Condition Duration']?.final ?? 0;
        const condDurCond = condAttrs?.['Condition Duration']?.final ?? condDurBase;

        const row = (n) => {
            let base = baseAttrs[n]?.final ?? 0;
            let cond = condAttrs?.[n]?.final ?? base;
            if (SPEC_COND_DUR.has(n)) { base += condDurBase; cond += condDurCond; }
            const delta = cond - base;
            const hasDelta = Math.abs(delta) > 0.005;
            const sign = delta > 0 ? '+' : '';
            return `<div class="attr-row">
                <span class="attr-name">${n}</span>
                <span class="attr-val">
                    ${hasDelta
                        ? `<span class="av-base">${fmt(n, base)}</span><span class="av-arrow">→</span><span class="av-cond">${fmt(n, cond)}</span><span class="av-delta">(${sign}${pctSet.has(n) ? delta.toFixed(2)+'%' : Math.round(delta)})</span>`
                        : fmt(n, base)}
                </span>
            </div>`;
        };

        const section = (title, keys) => {
            let h = `<div class="attr-section"><h4>${title}</h4>`;
            for (const n of keys) h += row(n);
            return h + '</div>';
        };
        container.innerHTML = section('Primary', primary) + section('Derived', derived);
    }

    // ─── Conditions panel ───
    renderConditions() {
        const container = document.getElementById('conditions-panel');
        if (!container) return;
        const c = this.conditions;
        const activeTraits = this.data.attributes?.activeTraits || [];
        const specs        = this.data.attributes?.specializations || [];

        const hasTrait = name => activeTraits.some(t => t.name === name);
        const hasPolyphony         = hasTrait('Elemental Polyphony');
        const hasEmpoweringFlame   = hasTrait('Empowering Flame');
        const hasAeroTraining      = hasTrait("Aeromancer's Training");
        const hasPowerOverwhelming = hasTrait('Power Overwhelming');
        const hasRagingStorm       = hasTrait('Raging Storm');
        const hasFreshAirTrait     = hasTrait('Fresh Air');
        const hasBurningPrecision  = hasTrait('Burning Precision');
        const hasSuperiorElements  = hasTrait('Superior Elements');
        const hasWeaversProwess    = hasTrait("Weaver's Prowess");
        const hasEnhancedPotency   = hasTrait('Enhanced Potency');
        const hasEmpEmpowerment    = hasTrait('Empowered Empowerment');

        const hasCatalyst = specs.some(s => s.name === 'Catalyst');
        const isWeaver    = specs.some(s => s.name === 'Weaver');

        // Show attunement section if any attunement-based effect is relevant
        const showAttunement = hasPolyphony || hasEmpoweringFlame || hasAeroTraining;

        const ATTS = ['None', 'Fire', 'Water', 'Air', 'Earth'];
        const attSel = (id, cur) =>
            `<select class="cond-select" id="${id}">${ATTS.map(a =>
                `<option${a === cur ? ' selected' : ''}>${a}</option>`).join('')}</select>`;

        // Dynamic hint showing what an attunement triggers (Polyphony + primary-only auto effects)
        const POLY_STAT = { Fire: 'Pwr', Water: 'Heal', Air: 'Ferocity', Earth: 'Vitality' };
        const attEffects = (att, isPrimary) => {
            if (!att || att === 'None') return '';
            const parts = [];
            if (hasPolyphony && POLY_STAT[att])                      parts.push(`+200 ${POLY_STAT[att]}`);
            if (isPrimary && hasEmpoweringFlame && att === 'Fire')    parts.push('+150 Pwr');
            if (isPrimary && hasAeroTraining    && att === 'Air')     parts.push('+150 Ferocity');
            return parts.length ? parts.join(', ') : att;
        };

        const furyLabel   = hasEnhancedPotency ? '+40% Crit Chance (Enhanced Potency)' : '+25% Crit Chance';
        const mightLabel  = hasEnhancedPotency ? '+30 Pwr / +30–35 CondDmg (Enhanced Potency)' : '+30 Pwr/CondDmg';

        // EE multiplier description
        const eeDesc = hasEmpEmpowerment
            ? 'stacks × +1.5% (max 10 → +20%)'
            : 'stacks × +1%';

        // Auto-applied effects: shown as info rows (no checkbox), only when trait is in active build
        const autoRows = [
            hasEmpoweringFlame   ? { label: 'Empowering Flame',    text: '+150 Power — primary Fire only (secondary Fire gives nothing)' }   : null,
            hasAeroTraining      ? { label: "Aeromancer's Tr.",    text: '+150 Ferocity — primary Air only (secondary Air gives nothing)' } : null,
            hasPowerOverwhelming ? { label: 'Power Overwhelm.',    text: '+300 Pwr if primary Fire, +150 Pwr otherwise — requires ≥10 Might' } : null,
            hasRagingStorm       ? { label: 'Raging Storm',        text: '+12 Crit Dmg when Fury active' }  : null,
            hasBurningPrecision  ? { label: 'Burning Precision',   text: '+20% Burn Duration (always in base stats) + 33% on-crit burning proc' } : null,
        ].filter(Boolean);

        container.innerHTML = `
            <div class="cond-header">Conditional Effects <span class="cond-hint">(for hero panel validation)</span></div>

            <div class="cond-section">Boons</div>
            <div class="cond-grid">
                <label class="cond-label">Might</label>
                <div class="cond-ctrl">
                    <input type="number" id="cond-might" class="cond-num" value="${c.might}" min="0" max="25" step="1" />
                    <span class="cond-unit">stacks × ${mightLabel}</span>
                </div>
                <label class="cond-label">Fury</label>
                <div class="cond-ctrl">
                    <input type="checkbox" id="cond-fury"${c.fury ? ' checked' : ''} />
                    <span class="cond-unit">${furyLabel}</span>
                </div>
            </div>

            ${showAttunement ? `
            <div class="cond-section">Attunement</div>
            <div class="cond-grid">
                <label class="cond-label">${isWeaver ? 'Pri. Att.' : 'Attunement'}</label>
                <div class="cond-ctrl">
                    ${attSel('cond-att-pri', c.primaryAtt)}
                    <span class="cond-unit cond-att-hint">${attEffects(c.primaryAtt, true)}</span>
                </div>
                ${isWeaver ? `
                <label class="cond-label">Sec. Att.</label>
                <div class="cond-ctrl">
                    ${attSel('cond-att-sec', c.secondaryAtt)}
                    <span class="cond-unit cond-att-hint">${attEffects(c.secondaryAtt, false)}</span>
                </div>` : ''}
            </div>` : ''}

            ${(hasFreshAirTrait || hasSuperiorElements || hasWeaversProwess) ? `
            <div class="cond-section">Trait Conditionals</div>
            <div class="cond-grid">
                ${hasFreshAirTrait ? `
                <label class="cond-label">Fresh Air</label>
                <div class="cond-ctrl">
                    <input type="checkbox" id="cond-fresh-air"${c.freshAir ? ' checked' : ''} />
                    <span class="cond-unit">+250 Ferocity (buff active)</span>
                </div>` : ''}
                ${hasSuperiorElements ? `
                <label class="cond-label">Sup. Elements</label>
                <div class="cond-ctrl">
                    <input type="checkbox" id="cond-sup-elem"${c.superiorElements ? ' checked' : ''} />
                    <span class="cond-unit">+15% Crit Chance (vs. Weakened)</span>
                </div>` : ''}
                ${hasWeaversProwess ? `
                <label class="cond-label">Weaver's Prowess</label>
                <div class="cond-ctrl">
                    <input type="checkbox" id="cond-wp"${c.weaversProwess ? ' checked' : ''} />
                    <span class="cond-unit">+20% Cond. Duration (while dual-attuned)</span>
                </div>` : ''}
            </div>` : ''}

            ${hasCatalyst ? `
            <div class="cond-section">Elemental Empowerment</div>
            <div class="cond-grid">
                <label class="cond-label">EE Stacks</label>
                <div class="cond-ctrl">
                    <input type="number" id="cond-ee" class="cond-num" value="${c.elemEmpowerment}" min="0" max="10" step="1" />
                    <span class="cond-unit">${eeDesc}</span>
                </div>
                ${hasEmpEmpowerment ? `
                <label class="cond-label"></label>
                <div class="cond-ctrl"><span class="cond-unit cond-trait-note">✓ Empowered Empowerment active</span></div>` : ''}
            </div>` : ''}

            `;
        // autoRows are still built and used by _getConditionalAttrs() via this.conditions — just not displayed.

        const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('change', fn); };
        bind('cond-might',     e => { c.might = Math.max(0, Math.min(25, parseInt(e.target.value) || 0)); e.target.value = c.might; this.renderAttributes(); });
        bind('cond-fury',      e => { c.fury = e.target.checked; this.renderAttributes(); });
        bind('cond-att-pri',   e => { c.primaryAtt = e.target.value; this.renderConditions(); this.renderAttributes(); });
        bind('cond-att-sec',   e => { c.secondaryAtt = e.target.value; this.renderConditions(); this.renderAttributes(); });
        bind('cond-ee',        e => { c.elemEmpowerment = Math.max(0, Math.min(10, parseInt(e.target.value) || 0)); e.target.value = c.elemEmpowerment; this.renderAttributes(); });
        bind('cond-fresh-air', e => { c.freshAir = e.target.checked; this.renderAttributes(); });
        bind('cond-sup-elem',  e => { c.superiorElements = e.target.checked; this.renderAttributes(); });
        bind('cond-wp',        e => { c.weaversProwess = e.target.checked; this.renderAttributes(); });
    }

    // ─── Compute attributes with conditions applied ───
    // Returns null if no conditions are active (→ renderAttributes shows base values only).
    // IMPORTANT: Only effects NOT already in calcAttributes are applied here.
    // The simulation also applies these same effects per-hit — this panel is for hero-panel validation only.
    _getConditionalAttrs() {
        const c = this.conditions;
        const base = this.data.attributes?.attributes;
        if (!base) return null;
        const activeTraits = this.data.attributes?.activeTraits || [];
        const specs = this.data.attributes?.specializations || [];

        const hasTrait = name => activeTraits.some(t => t.name === name);
        const hasPolyphony         = hasTrait('Elemental Polyphony');
        const hasEmpoweringFlame   = hasTrait('Empowering Flame');
        const hasAeroTraining      = hasTrait("Aeromancer's Training");
        const hasPowerOverwhelming = hasTrait('Power Overwhelming');
        const hasRagingStorm       = hasTrait('Raging Storm');
        const hasFreshAirTrait     = hasTrait('Fresh Air');
        const hasSuperiorElements  = hasTrait('Superior Elements');
        const hasWeaversProwess    = hasTrait("Weaver's Prowess");
        const hasEnhancedPotency   = hasTrait('Enhanced Potency');
        const hasEmpEmpowerment    = hasTrait('Empowered Empowerment');
        const isEvoker             = specs.some(s => s.name === 'Evoker');

        // Determine if any condition is effectively active
        const hasAny = c.might > 0 || c.fury
            || c.primaryAtt !== 'None' || c.secondaryAtt !== 'None'
            || c.elemEmpowerment > 0
            || c.freshAir || c.superiorElements || c.weaversProwess
            || (hasPowerOverwhelming && c.might >= 10)
            || (hasRagingStorm && c.fury);
        if (!hasAny) return null;

        const PRIMARY_STATS = ['Power','Precision','Toughness','Vitality','Ferocity','Condition Damage','Expertise','Concentration','Healing Power'];
        const out = {};
        for (const [k, v] of Object.entries(base)) out[k] = { ...v };

        const addPrimary = (stat, amount) => {
            if (!out[stat]) out[stat] = { final: 0, base: 0, gear: 0, runes: 0, food: 0, utility: 0, jbc: 0, traits: 0, sigils: 0 };
            out[stat].final += amount;
        };

        // ── Might ──
        // Enhanced Potency raises CondDmg-per-Might to +35 for Evoker in Fire attunement
        if (c.might > 0) {
            const mightCond = (hasEnhancedPotency && isEvoker && c.primaryAtt === 'Fire') ? 35 : 30;
            addPrimary('Power', c.might * 30);
            addPrimary('Condition Damage', c.might * mightCond);
        }

        // ── Elemental Polyphony (+200 per distinct active attunement) ──
        // Set deduplication: Fire/Fire gives +200 Power once, not twice.
        // Air gives Ferocity (matches simulation: polyFer = 200/15)
        const POLY = { Fire: 'Power', Water: 'Healing Power', Air: 'Ferocity', Earth: 'Vitality' };
        if (hasPolyphony) {
            const atts = new Set([c.primaryAtt, c.secondaryAtt].filter(a => a && a !== 'None'));
            for (const att of atts) {
                if (POLY[att]) addPrimary(POLY[att], 200);
            }
        }

        // ── Aeromancer's Training: +150 Ferocity when PRIMARY attunement is Air ──
        // Secondary Air does not trigger this bonus.
        if (hasAeroTraining && c.primaryAtt === 'Air') {
            addPrimary('Ferocity', 150);
        }

        // ── Empowering Flame: +150 Power when PRIMARY attunement is Fire ──
        // Secondary Fire does not trigger this bonus.
        if (hasEmpoweringFlame && c.primaryAtt === 'Fire') {
            addPrimary('Power', 150);
        }

        // ── Power Overwhelming: +300 Power if PRIMARY is Fire, +150 Power otherwise (≥10 Might) ──
        // Secondary Fire does NOT give the extra +150.
        if (hasPowerOverwhelming && c.might >= 10) {
            addPrimary('Power', c.primaryAtt === 'Fire' ? 300 : 150);
        }

        // ── Fresh Air: +250 Ferocity while buff is active ──
        // Per-hit in simulation: freshAirFerocity = 250/15 (crit dmg). Not in calcAttributes.
        if (c.freshAir && hasFreshAirTrait) {
            addPrimary('Ferocity', 250);
        }

        // ── Elemental Empowerment ──
        // EE pool = base + gear + runes + infusions + food (utility and traits excluded).
        // Empowered Empowerment: stacks × 1.5%, 10-stack cap locks to flat 20%.
        if (c.elemEmpowerment > 0) {
            const stacks = c.elemEmpowerment;
            const empMul = hasEmpEmpowerment
                ? (stacks === 10 ? 0.20 : stacks * 0.015)
                : stacks * 0.01;
            for (const s of PRIMARY_STATS) {
                const attr = base[s] || {};
                const pool = (attr.base || 0) + (attr.gear || 0) + (attr.runes || 0) + (attr.infusions || 0) + (attr.food || 0);
                if (pool > 0) addPrimary(s, Math.round(pool * empMul));
            }
        }

        // ── Recompute derived stats from updated primary finals ──
        const prec = out['Precision']?.final ?? 1000;
        const fer  = out['Ferocity']?.final ?? 0;
        const conc = out['Concentration']?.final ?? 0;
        const exp  = out['Expertise']?.final ?? 0;

        const traitCC   = base['Critical Chance']?.traits ?? 0;
        const sigilCC   = base['Critical Chance']?.sigils ?? 0;
        const newPrecCC = (prec - 895) / 21;
        // Fury: +25% base; Enhanced Potency raises it to +40%
        const furyCC       = c.fury ? (hasEnhancedPotency ? 40 : 25) : 0;
        // Superior Elements: +15% Crit Chance vs. Weakened enemies
        const supElemCC    = (c.superiorElements && hasSuperiorElements) ? 15 : 0;
        out['Critical Chance'] = { ...out['Critical Chance'], final: newPrecCC + traitCC + sigilCC + furyCC + supElemCC };

        // Critical Damage: Raging Storm adds +12 when Fury is active (simulation: ragingFerocity = 12)
        const ragingBonus  = (hasRagingStorm && c.fury) ? 12 : 0;
        out['Critical Damage'] = { ...out['Critical Damage'], final: 150 + fer / 15 + ragingBonus };

        // Boon Duration: non-concentration bonus preserved; concentration component updated
        const boonFixedBonus  = (base['Boon Duration']?.final ?? 0) - (base['Concentration']?.final ?? 0) / 15;
        out['Boon Duration']  = { ...out['Boon Duration'],  final: conc / 15 + boonFixedBonus };

        // Condition Duration: non-expertise bonus preserved; expertise component updated
        // Weaver's Prowess: +20% Condition Duration while dual-attuned with two DIFFERENT attunements
        // Matches simulation: `if (a2 !== null && a1 !== a2) bonus += 20`
        const wpBonus = (c.weaversProwess && hasWeaversProwess
            && c.secondaryAtt !== 'None' && c.primaryAtt !== c.secondaryAtt) ? 20 : 0;
        const condFixedBonus  = (base['Condition Duration']?.final ?? 0) - (base['Expertise']?.final ?? 0) / 15;
        out['Condition Duration'] = { ...out['Condition Duration'], final: exp / 15 + condFixedBonus + wpBonus };

        return out;
    }

    // ─── Traits ───
    renderTraits() {
        const container = document.getElementById('traits-panel');
        const specs = this.build.specializations;
        const usedSpecs = new Set(specs.map(s => s.name));

        container.innerHTML = specs.map((spec, slotIdx) => {
            const sd = this.api.getSpecData(spec.name);
            const bgUrl = sd?.background || '';
            const specIcon = sd?.icon || '';
            const specTraits = TRAITS.filter(t => t.specialization === spec.name);
            const choices = spec.traits.split('-').map(Number);

            const tierPairs = [
                { minor: 'Minor Adept',       major: 'Major Adept',       pick: choices[0] },
                { minor: 'Minor Master',       major: 'Major Master',      pick: choices[1] },
                { minor: 'Minor Grandmaster',  major: 'Major Grandmaster', pick: choices[2] },
            ];

            const tiersHtml = tierPairs.map((tp, tierIdx) => {
                const minor  = specTraits.find(t => t.tier === tp.minor);
                const majors = specTraits.filter(t => t.tier === tp.major).sort((a, b) => a.position - b.position);
                const mIcon  = minor ? this.api.getTraitIcon(minor.name) : null;

                return `<div class="spec-tier">
                    <div class="spec-trait-minor" title="${esc(minor?.name || '')}">
                        <img src="${mIcon || PLACEHOLDER_ICON}" />
                    </div>
                    <div class="spec-trait-majors">
                        ${majors.map(m => {
                            const ic  = this.api.getTraitIcon(m.name);
                            const sel = m.position === tp.pick;
                            return `<div class="spec-trait-major ${sel ? 'sel' : 'dim'}"
                                        data-slot="${slotIdx}" data-tier="${tierIdx}" data-pos="${m.position}"
                                        title="${esc(m.name)}">
                                <img src="${ic || PLACEHOLDER_ICON}" />
                            </div>`;
                        }).join('')}
                    </div>
                </div>${tierIdx < 2 ? '<div class="spec-line"></div>' : ''}`;
            }).join('');

            // Build spec dropdown options (exclude specs used in other slots)
            const optionsHtml = SPECIALIZATIONS.map(sn => {
                const disabled = sn !== spec.name && usedSpecs.has(sn) ? ' disabled' : '';
                const selected = sn === spec.name ? ' selected' : '';
                return `<option value="${sn}"${selected}${disabled}>${sn}</option>`;
            }).join('');

            return `<div class="spec-row" style="--spec-bg:url('${bgUrl}')">
                <div class="spec-bg"></div>
                <div class="spec-content">
                    <div class="spec-header-col">
                        <div class="spec-icon-wrap"><img src="${specIcon || PLACEHOLDER_ICON}" /></div>
                        <select class="spec-select" data-slot="${slotIdx}">${optionsHtml}</select>
                    </div>
                    <div class="spec-tiers">${tiersHtml}</div>
                </div>
            </div>`;
        }).join('');

        // ── Major trait click: select/deselect within each tier ──
        container.querySelectorAll('.spec-trait-major').forEach(el => {
            el.addEventListener('click', () => {
                const slotIdx = parseInt(el.dataset.slot);
                const tierIdx = parseInt(el.dataset.tier);
                const pos     = parseInt(el.dataset.pos);
                const picks   = this.build.specializations[slotIdx].traits.split('-').map(Number);
                // Clicking the already-selected trait deselects it (sets to 0)
                picks[tierIdx] = picks[tierIdx] === pos ? 0 : pos;
                this.build.specializations[slotIdx].traits = picks.join('-');
                this._onBuildChange();
            });
        });

        // ── Spec selector: change specialization for a slot ──
        container.querySelectorAll('.spec-select').forEach(el => {
            el.addEventListener('change', () => {
                const slotIdx = parseInt(el.dataset.slot);
                const newSpec = el.value;
                this.build.specializations[slotIdx] = { name: newSpec, traits: '1-1-1' };
                this._onBuildChange();
            });
        });
    }

    // ─── Attunement Bar ───
    renderAttunementBar() {
        const container = document.getElementById('attunement-bar');
        const eliteSpec = this._getEliteSpec();
        const baseSwaps = this.data.skills.filter(s => s.type === 'Attunement' && !s.attunement && s.weapon === 'Profession mechanic');
        const overloads = eliteSpec === 'Tempest'
            ? this.data.skills.filter(s => s.type === 'Attunement' && s.attunement && s.weapon === 'Profession mechanic')
            : [];

        container.innerHTML = ATTUNEMENTS.map(att => {
            const swap = baseSwaps.find(s => s.name.startsWith(att));
            const overload = overloads.find(s => s.attunement === att);
            const isActive = att === this.activeAttunement;
            const icon = this.api.getSkillIcon(swap?.name || `${att} Attunement`);
            const olIcon = overload ? this.api.getSkillIcon(overload.name) : null;
            const color = ATTUNEMENT_COLORS[att];

            return `<div class="att-btn ${isActive ? 'active' : ''}" data-att="${att}" style="--att-c:${color}" title="${esc(att + (overload && isActive ? '\n' + overload.name : ''))}">
                <img src="${(isActive && olIcon) ? olIcon : (icon || PLACEHOLDER_ICON)}" />
                <span class="att-key">F${ATTUNEMENTS.indexOf(att) + 1}</span>
            </div>`;
        }).join('');

        container.querySelectorAll('.att-btn').forEach(el =>
            el.addEventListener('click', () => this.setAttunement(el.dataset.att)));
    }

    setAttunement(att) {
        const elite = this._getEliteSpec();
        if (elite === 'Weaver') {
            if (att === this.activeAttunement && att === this.secondaryAttunement) return;
            this.secondaryAttunement = this.activeAttunement;
        } else {
            if (att === this.activeAttunement) return;
        }
        this.activeAttunement = att;
        this.renderAttunementBar();
        this.renderWeaponBar();
        this.renderSkillBar();
        this.renderSkillInfoTable();
        this._renderStartAttSelector();
        if (this.sim?.rotation.length > 0) {
            this._autoRun();
        } else {
            this._renderPalette();
        }
    }

    // ─── Weapon Bar (active attunement skills + chains) ───
    renderWeaponBar() {
        const container = document.getElementById('weapon-bar');
        const { weapons: weps } = this.data.attributes;
        const mh = weps[0] || '';
        const oh = weps[1] || '';
        const is2h = TH_WEAPONS.has(mh);
        const att = this.activeAttunement;
        const elite = this._getEliteSpec();
        const isWeaver = elite === 'Weaver';

        let html = '';
        for (let slot = 1; slot <= 5; slot++) {
            const weapon = is2h ? mh : (slot <= 3 ? mh : oh);
            let skills;

            if (isWeaver && slot === 3 && att !== this.secondaryAttunement) {
                skills = this._getWeaverSlot3Skills(weapon);
            } else if (isWeaver && slot >= 4) {
                skills = this._getSkillsForSlot(weapon, this.secondaryAttunement, String(slot));
            } else {
                skills = this._getSkillsForSlot(weapon, att, String(slot));
            }

            const chain = this._getChainOrderWithEtching(skills);
            const root = chain[0];

            if (slot === 4 && !is2h) html += '<div class="weapon-divider"></div>';

            html += '<div class="weapon-slot">';
            if (root) {
                const icon = this.api.getSkillIcon(root.name);
                html += `<div class="wskill main" title="${esc(root.name)}\nCast: ${root.castTime}s | CD: ${root.recharge}s">
                    <img src="${icon || PLACEHOLDER_ICON}" />
                    <span class="wslot-num">${slot}</span>
                </div>`;
                for (let c = 1; c < chain.length; c++) {
                    const ci = this.api.getSkillIcon(chain[c].name);
                    html += `<div class="wskill chain-skill" title="${esc(chain[c].name)}">
                        <img src="${ci || PLACEHOLDER_ICON}" />
                    </div>`;
                }
            } else {
                html += `<div class="wskill empty"><img src="${PLACEHOLDER_ICON}" /><span class="wslot-num">${slot}</span></div>`;
            }
            html += '</div>';
        }

        container.innerHTML = html;
    }

    _getWeaverSlot3Skills(weapon) {
        const pri = this.activeAttunement;
        const sec = this.secondaryAttunement;
        const key1 = `${pri}+${sec}`;
        const key2 = `${sec}+${pri}`;
        return this.data.skills.filter(s =>
            s.slot === '3' && s.weapon === weapon &&
            (s.attunement === key1 || s.attunement === key2));
    }

    _getSkillsForSlot(weapon, attunement, slot) {
        return this.data.skills.filter(s =>
            s.weapon === weapon && s.attunement === attunement && s.slot === slot
            && (s.type === 'Weapon skill' || s.type === 'Dual Wield'));
    }

    _getChainOrder(skills) {
        if (skills.length <= 1) return skills;
        const chainTargets = new Set(skills.filter(s => s.chainSkill).map(s => s.chainSkill));
        let root = skills.find(s => !chainTargets.has(s.name)) || skills[0];
        const order = [root];
        const visited = new Set([root.name]);
        let current = root;
        while (current.chainSkill && !visited.has(current.chainSkill)) {
            const next = skills.find(s => s.name === current.chainSkill);
            if (!next) break;
            order.push(next);
            visited.add(next.name);
            current = next;
        }
        return order;
    }

    // Returns chain order for a slot, appending Etching lesser/full variants when the root is an Etching skill.
    _getChainOrderWithEtching(skills) {
        const order = this._getChainOrder(skills);
        if (order.length === 0) return order;
        const root = order[0];
        const etchChain = ETCHING_LOOKUP_UI.get(root.name);
        if (!etchChain || root.name !== etchChain.etching) return order;
        // Append lesser then full, sourced from all loaded skills
        const allSkills = this.data.skills;
        const lesserSk = allSkills.find(s => s.name === etchChain.lesser);
        const fullSk   = allSkills.find(s => s.name === etchChain.full);
        if (lesserSk && !order.some(s => s.name === lesserSk.name)) order.push(lesserSk);
        if (fullSk   && !order.some(s => s.name === fullSk.name))   order.push(fullSk);
        return order;
    }

    // ─── Skill Bar (heal/utility/elite selection) ───
    renderSkillBar() {
        const container = document.getElementById('skill-bar');
        const labels = { heal: 'Heal', util1: 'Utility', util2: 'Utility', util3: 'Utility', elite: 'Elite' };

        container.innerHTML = SLOT_LABELS.map(slotKey => {
            const selected = this.selectedSkills[slotKey];
            const resolvedSkill = selected ? this._resolveAttunementSkill(selected) : null;
            const icon = resolvedSkill ? this.api.getSkillIcon(resolvedSkill.name) : null;
            const borderClass = slotKey === 'heal' ? 'heal-border' : slotKey === 'elite' ? 'elite-border' : '';

            return `<div class="skill-bar-slot ${borderClass}" data-slot="${slotKey}">
                <div class="sbar-icon" title="${esc(resolvedSkill?.name || labels[slotKey])}">
                    ${icon ? `<img src="${icon}" />` : `<div class="sbar-empty">${labels[slotKey][0]}</div>`}
                </div>
                <div class="sbar-arrow">▾</div>
                <div class="sbar-dropdown" id="dropdown-${slotKey}"></div>
            </div>`;
        }).join('');

        container.querySelectorAll('.skill-bar-slot').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleDropdown(el.dataset.slot);
            });
        });
    }

    toggleDropdown(slotKey) {
        if (this.openDropdown === slotKey) {
            this.closeDropdown();
            return;
        }
        this.closeDropdown();
        this.openDropdown = slotKey;

        const dd = document.getElementById(`dropdown-${slotKey}`);
        const slotType = SLOT_TYPES[slotKey];
        const available = this._getAvailableSkillsForSlot(slotType);

        dd.innerHTML = available.map(sk => {
            const icon = this.api.getSkillIcon(sk.name);
            const label = sk.displayName || sk.name;
            return `<div class="dd-item" data-skill-name="${esc(sk.name)}" title="${esc(sk.name)}">
                <img src="${icon || PLACEHOLDER_ICON}" />
                <span>${esc(label)}</span>
            </div>`;
        }).join('') || '<div class="dd-empty">No skills available</div>';

        dd.classList.add('open');
        dd.querySelectorAll('.dd-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const skillName = item.dataset.skillName;
                const skill = this.data.skills.find(s => s.name === skillName);
                if (skill) {
                    this.selectedSkills[slotKey] = skill;
                    this.closeDropdown();
                    this._onBuildChange(); // recalculates attributes (Signet of Fire passive, etc.)
                    this._renderPalette();
                }
            });
        });
    }

    closeDropdown() {
        if (this.openDropdown) {
            const dd = document.getElementById(`dropdown-${this.openDropdown}`);
            if (dd) dd.classList.remove('open');
            this.openDropdown = null;
        }
    }

    _getAvailableSkillsForSlot(slotType) {
        const selectedSpecs = new Set(this.data.attributes.specializations.map(s => s.name));
        const skills = this.data.skills.filter(s => {
            if (s.slot !== slotType) return false;
            const requiredSpec = SKILL_TYPE_SPEC[s.type];
            if (requiredSpec && !selectedSpecs.has(requiredSpec)) return false;
            return true;
        });
        const seen = new Set();
        const result = [];

        for (const sk of skills) {
            const base = sk.name.replace(/\s*\((?:Fire|Water|Air|Earth)\)$/, '');
            if (sk.attunement && base !== sk.name) {
                if (seen.has(base)) continue;
                seen.add(base);
                const variant = skills.find(s =>
                    s.name === `${base} (${this.activeAttunement})`) || sk;
                result.push({ ...variant, displayName: base });
            } else {
                if (sk.chainSkill) {
                    // Only hide if there is a root skill (recharge > 0) that chains into this one.
                    // Cyclic pairs like Weave Self ↔ Tailored Victory: Tailored Victory has no
                    // recharge, so only it is hidden; Weave Self stays visible.
                    const isChainTarget = skills.some(s =>
                        s.chainSkill === sk.name && s.slot === slotType && (s.recharge || 0) > 0);
                    if (isChainTarget) continue;
                }
                if (seen.has(sk.name)) continue;
                seen.add(sk.name);
                result.push(sk);
            }
        }
        return result;
    }

    _resolveAttunementSkill(skill) {
        const base = skill.name.replace(/\s*\((?:Fire|Water|Air|Earth)\)$/, '');
        if (base !== skill.name || (skill.displayName && skill.displayName !== skill.name)) {
            const realBase = skill.displayName || base;
            const variant = this.data.skills.find(s => s.name === `${realBase} (${this.activeAttunement})`);
            return variant || skill;
        }
        return skill;
    }

    // ─── Skill Info Table ───
    renderSkillInfoTable() {
        const container = document.getElementById('skill-info-table');
        const attrs = this.data.attributes.attributes;
        const { weapons: weps } = this.data.attributes;
        const mh = weps[0] || '';
        const oh = weps[1] || '';
        const is2h = TH_WEAPONS.has(mh);

        const hdr = `<div class="info-header">
            <span></span><span>Name</span><span>Strike</span><span>Condi</span><span>Total</span><span>DPS</span>
        </div>`;
        let html = hdr;

        for (const att of ATTUNEMENTS) {
            const color = ATTUNEMENT_COLORS[att];
            html += `<div class="info-att-header" style="color:${color}">${att}</div>`;
            html += '<div class="info-rows">';

            for (let slot = 1; slot <= 5; slot++) {
                const weapon = is2h ? mh : (slot <= 3 ? mh : oh);
                const skills = this._getSkillsForSlot(weapon, att, String(slot));
                const chain = this._getChainOrder(skills);
                for (const sk of chain) {
                    html += this._renderInfoRow(sk, weapon);
                }
            }

            const eliteSpec = this._getEliteSpec();
            if (eliteSpec === 'Tempest') {
                const overload = this.data.skills.find(s =>
                    s.weapon === 'Profession mechanic' && s.attunement === att && s.type === 'Attunement' && s.name.startsWith('Overload'));
                if (overload) html += this._renderInfoRow(overload, 'Profession mechanic');
            }
            html += '</div>';
        }

        const selectedAny = Object.values(this.selectedSkills).some(s => s);
        if (selectedAny) {
            html += '<div class="info-att-header" style="color:var(--accent)">Selected Skills</div>';
            html += '<div class="info-rows">';
            for (const slotKey of SLOT_LABELS) {
                const sel = this.selectedSkills[slotKey];
                if (!sel) continue;
                const resolved = this._resolveAttunementSkill(sel);
                const wKey = this._getWeaponForSkill(resolved);
                html += this._renderInfoRow(resolved, wKey);

                if (sel.type === 'Conjure') {
                    const conjWeapon = CONJURE_MAP[resolved.name];
                    if (conjWeapon) {
                        const conjSkills = this.data.skills.filter(s => s.weapon === conjWeapon);
                        for (const cs of conjSkills) {
                            html += this._renderInfoRow(cs, 'Conjured Weapon');
                        }
                    }
                }
            }
            html += '</div>';
        }

        container.innerHTML = html || '<div class="placeholder-text">No weapon skills found for current weapon set</div>';
    }

    _renderInfoRow(skill, weaponKey) {
        const icon = this.api.getSkillIcon(skill.name);
        const hits = this.data.skillHits[skill.name] || [];
        const wStr = WEAPON_DATA[weaponKey]?.weaponStrength || WEAPON_DATA[this._getWeaponForSkill(skill)]?.weaponStrength || 1000;
        const attrs = this.data.attributes.attributes;
        const dmg = calculateSkillDamage(skill, hits, wStr, attrs);

        return `<div class="info-row">
            <img class="info-icon" src="${icon || PLACEHOLDER_ICON}" title="${esc(skill.name)}" />
            <span class="info-name" title="${esc(skill.name)}">${esc(skill.name)}</span>
            <span class="info-val">${Math.round(dmg.totalStrike)}</span>
            <span class="info-val condi">${Math.round(dmg.totalCondition)}</span>
            <span class="info-val total">${Math.round(dmg.totalDamage)}</span>
            <span class="info-val dps">${dmg.castTime > 0 ? Math.round(dmg.dps) : '—'}</span>
        </div>`;
    }

    // ─── Helpers ───
    _getEliteSpec() {
        const elites = new Set(['Tempest', 'Weaver', 'Catalyst', 'Evoker']);
        return this.data.attributes.specializations.find(s => elites.has(s.name))?.name || null;
    }

    _getWeaponForSkill(skill) {
        const w = skill.weapon;
        if (w === 'Profession mechanic') return 'Profession mechanic';
        if (['Frost Bow', 'Lightning Hammer', 'Fiery Greatsword'].includes(w)) return 'Conjured Weapon';
        if (w) return w;
        if (['Healing', 'Utility', 'Elite'].includes(skill.slot)) return 'Unequipped';
        return this.data.attributes.weapons[0] || 'Sword';
    }

    // ─── Perma Boons & Conditions ───
    _renderPermaBoons() {
        const el = document.getElementById('perma-boons');
        if (!el) return;

        const PERMA_BOONS = [
            'Might', 'Fury', 'Quickness', 'Alacrity', 'Swiftness',
            'Protection', 'Resolution', 'Regeneration', 'Vigor',
            'Resistance', 'Stability', 'Aegis',
        ];
        const PERMA_CONDS = [
            'Vulnerability', 'Weakness', 'Blindness', 'Slow',
            'Chilled', 'Cripple', 'Immobilize',
            'Burning', 'Bleeding', 'Torment', 'Confusion', 'Poisoned',
        ];
        const STACK_EFFECTS = { Might: 25, Stability: 25, Vulnerability: 25 };

        const renderGroup = (title, list) => {
            let h = `<div class="perma-group"><span class="perma-group-label">${title}</span>`;
            for (const name of list) {
                const col = EFFECT_COLORS[name] || '#aaa';
                const maxStacks = STACK_EFFECTS[name];
                const cur = this.permaBoons[name];
                const checked = maxStacks ? (cur > 0) : !!cur;
                h += `<label class="perma-item" style="--pc:${col}">`;
                h += `<input type="checkbox" data-effect="${esc(name)}" ${checked ? 'checked' : ''} />`;
                h += `<span class="perma-name">${name}</span>`;
                if (maxStacks) {
                    const val = cur || 0;
                    h += `<input type="number" class="perma-stacks" data-effect="${esc(name)}" min="0" max="${maxStacks}" value="${val}" ${checked ? '' : 'disabled'} />`;
                }
                h += '</label>';
            }
            h += '</div>';
            return h;
        };

        el.innerHTML = renderGroup('Boons', PERMA_BOONS) + renderGroup('Conditions', PERMA_CONDS);

        el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const name = cb.dataset.effect;
                const stackInput = el.querySelector(`input[type="number"][data-effect="${name}"]`);
                if (stackInput) {
                    if (cb.checked) {
                        stackInput.disabled = false;
                        const val = parseInt(stackInput.value) || 0;
                        this.permaBoons[name] = Math.max(1, val);
                        if (val < 1) stackInput.value = '1';
                    } else {
                        stackInput.disabled = true;
                        delete this.permaBoons[name];
                    }
                } else {
                    if (cb.checked) this.permaBoons[name] = true;
                    else delete this.permaBoons[name];
                }
                if (this.sim?.rotation.length > 0) this._autoRun();
            });
        });

        el.querySelectorAll('input[type="number"]').forEach(inp => {
            inp.addEventListener('change', () => {
                const name = inp.dataset.effect;
                const cb = el.querySelector(`input[type="checkbox"][data-effect="${name}"]`);
                if (!cb?.checked) return;
                const max = parseInt(inp.max) || 25;
                const val = Math.max(0, Math.min(max, parseInt(inp.value) || 0));
                inp.value = val;
                if (val === 0) {
                    cb.checked = false;
                    inp.disabled = true;
                    delete this.permaBoons[name];
                } else {
                    this.permaBoons[name] = val;
                }
                if (this.sim?.rotation.length > 0) this._autoRun();
            });
        });
    }

    // ─── Rotation Builder ───
    renderRotationBuilder() {
        this._renderStartAttSelector();
        this._renderPalette();
        this._renderTimeline();
    }

    _renderStartAttSelector() {
        const el = document.getElementById('start-att-selector');
        if (!el) return;
        const elite = this._getEliteSpec();
        const isWeaver = elite === 'Weaver';
        let h = '';

        h += `<span class="start-att-label">${isWeaver ? 'Pri:' : 'Start:'}</span>`;
        for (const att of ATTUNEMENTS) {
            const icon = this.api.getSkillIcon(`${att} Attunement`);
            const color = ATTUNEMENT_COLORS[att];
            const active = att === this.activeAttunement ? ' active' : '';
            h += `<button class="start-att-btn${active}" data-att="${att}" data-role="primary" style="--att-c:${color}" title="${isWeaver ? 'Primary' : 'Start'}: ${att}">
                <img src="${icon || PLACEHOLDER_ICON}" /></button>`;
        }

        if (isWeaver) {
            h += `<span class="start-att-label" style="margin-left:6px">Sec:</span>`;
            for (const att of ATTUNEMENTS) {
                const icon = this.api.getSkillIcon(`${att} Attunement`);
                const color = ATTUNEMENT_COLORS[att];
                const active = att === this.secondaryAttunement ? ' active' : '';
                h += `<button class="start-att-btn${active}" data-att="${att}" data-role="secondary" style="--att-c:${color}" title="Secondary: ${att}">
                    <img src="${icon || PLACEHOLDER_ICON}" /></button>`;
            }
        }

        if (elite === 'Evoker') {
            const EVOKER_SEL_NAMES = { Fire: 'Ignite', Water: 'Splash', Air: 'Zap', Earth: 'Calcify' };
            h += `<span class="start-att-label" style="margin-left:6px">F5:</span>`;
            for (const att of ATTUNEMENTS) {
                const selName = EVOKER_SEL_NAMES[att];
                const icon = this.api.getSkillIcon(selName);
                const color = ATTUNEMENT_COLORS[att];
                const active = this.evokerElement === att ? ' active' : '';
                h += `<button class="start-att-btn${active}" data-att="${att}" data-role="evoker" style="--att-c:${color}" title="Familiar: ${selName} (${att})">
                    <img src="${icon || PLACEHOLDER_ICON}" /></button>`;
            }
        }

        el.innerHTML = h;
        el.querySelectorAll('.start-att-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.role === 'secondary') {
                    if (btn.dataset.att === this.secondaryAttunement) return;
                    this.secondaryAttunement = btn.dataset.att;
                    this._renderStartAttSelector();
                    this.renderWeaponBar();
                    if (this.sim?.rotation.length > 0) this._autoRun();
                    else this._renderPalette();
                } else if (btn.dataset.role === 'evoker') {
                    const att = btn.dataset.att;
                    if (att === this.evokerElement) return;
                    this.evokerElement = att;
                    this._renderStartAttSelector();
                    if (this.sim?.rotation.length > 0) this._autoRun();
                    else this._renderPalette();
                } else {
                    this.setAttunement(btn.dataset.att);
                    this._renderStartAttSelector();
                }
            });
        });
    }

    _skillColor(skill, skillName) {
        if (skillName === '__drop_bundle' || (skillName && skillName.startsWith('__pickup_')))
            return '#ffcc44';
        if (!skill) return 'var(--border-light)';
        if (CONJURE_WEAPONS.has(skill.weapon)) return '#ffcc44';
        if (skill.attunement) {
            const a = skill.attunement.split('+')[0];
            return ATTUNEMENT_COLORS[a] || 'var(--border-light)';
        }
        for (const att of ATTUNEMENTS) {
            if (skill.name === `${att} Attunement` || skill.name === `Overload ${att}`)
                return ATTUNEMENT_COLORS[att];
        }
        return 'var(--border-light)';
    }

    _cdKey(sk) {
        if (CONJURE_WEAPONS.has(sk.weapon)) return `${sk.name}::${sk.weapon}`;
        if (sk.type === 'Jade Sphere') return sk.name;
        const base = sk.name.replace(/\s*\((?:Fire|Water|Air|Earth)\)$/, '');
        return (base !== sk.name && sk.attunement) ? base : sk.name;
    }

    _skillInContext(name) {
        const es = this.sim?.results?.endState;
        const matches = this.data.skills.filter(s => s.name === name);
        if (matches.length <= 1) return matches[0] || null;
        if (es?.conjureEquipped) {
            return matches.find(s => s.weapon === es.conjureEquipped)
                || matches.find(s => !CONJURE_WEAPONS.has(s.weapon))
                || matches[0];
        }
        return matches.find(s => !CONJURE_WEAPONS.has(s.weapon)) || matches[0];
    }

    _isSkillAvailable(skillName) {
        const es = this.sim?.results?.endState;
        if (!es) return true;
        const sk = this._skillInContext(skillName);
        if (!sk) return false;
        const t = es.time;

        if (sk.type === 'Attunement' && !sk.name.startsWith('Overload')) {
            const target = sk.name.replace(' Attunement', '');
            if (es.eliteSpec === 'Weaver') {
                if (target === es.att && target === es.att2) return false;
            } else {
                if (target === es.att) return false;
            }
            return (es.attCD[target] || 0) <= t;
        }
        if (sk.name.startsWith('Overload ')) {
            if (es.eliteSpec !== 'Tempest') return false;
            const olAtt = sk.name.replace('Overload ', '');
            if (olAtt !== es.att) return false;
            if ((es.skillCD[skillName] || 0) > t) return false;
            const dwell = es._hasTranscendentTempest ? 4000 : 6000;
            const dwellReady = es.attEnteredAt + dwell;
            if (t < dwellReady) return false;
            return true;
        }
        if (sk.type === 'Jade Sphere') {
            if (es.eliteSpec !== 'Catalyst') return false;
            if (sk.attunement !== es.att) return false;
            if (es.energy < 10) return false;
            return (es.skillCD[this._cdKey(sk)] || 0) <= t;
        }
        if (sk.type === 'Familiar') {
            if (es.eliteSpec !== 'Evoker') return false;
            const EVOKER_EL = { Ignite: 'Fire', Splash: 'Water', Zap: 'Air', Calcify: 'Earth',
                Conflagration: 'Fire', 'Buoyant Deluge': 'Water', 'Lightning Blitz': 'Air', 'Seismic Impact': 'Earth' };
            const SELECTORS = new Set(['Ignite', 'Splash', 'Zap', 'Calcify']);
            const famEl = EVOKER_EL[skillName];
            if (!famEl) return false;
            if (es.evokerElement !== famEl) return false;
            const isBasic = SELECTORS.has(skillName);
            if (isBasic) {
                if ((es.evokerEmpowered ?? 0) >= 3) return false;
                if ((es.evokerCharges ?? 0) < 6) return false;
            } else {
                if ((es.evokerEmpowered ?? 0) < 3) return false;
            }
            return (es.skillCD[skillName] || 0) <= t;
        }

        const cdKey = this._cdKey(sk);
        if ((es.skillCD[cdKey] || 0) > t) return false;

        if (sk.maximumCount > 0 && sk.countRecharge > 0) {
            const ch = es.charges?.[cdKey];
            if (ch) {
                let count = ch.count;
                let nextAt = ch.nextChargeAt;
                const crMs = Math.round(sk.countRecharge * 1000);
                while (count < sk.maximumCount && nextAt <= t) {
                    count++;
                    nextAt = count < sk.maximumCount ? nextAt + crMs : Infinity;
                }
                if (count <= 0) return false;
            }
        }

        if (CONJURE_WEAPONS.has(sk.weapon)) {
            return es.conjureEquipped === sk.weapon;
        }
        if (es.conjureEquipped && sk.type === 'Weapon skill' && !CONJURE_WEAPONS.has(sk.weapon)) {
            return false;
        }

        if (es.aaCarryover && sk.slot === '1') {
            const carryExpected = es.chainState?.[es.aaCarryover.root];
            if (skillName === carryExpected) return true;
        }

        if (sk.attunement) {
            if (es.eliteSpec === 'Weaver') {
                if (sk.attunement.includes('+')) {
                    const [a, b] = sk.attunement.split('+');
                    if (!((a === es.att && b === es.att2) || (b === es.att && a === es.att2))) return false;
                } else {
                    const slotNum = parseInt(sk.slot);
                    if (!isNaN(slotNum) && slotNum >= 4) {
                        if (sk.attunement !== es.att2) return false;
                    } else {
                        if (sk.attunement !== es.att) return false;
                    }
                }
            } else {
                const parts = sk.attunement.split('+');
                if (!parts.includes(es.att)) return false;
            }
        }

        if (sk.chainSkill) {
            const chainRoot = this._getChainRootName(sk);
            const expected = es.chainState?.[chainRoot] || chainRoot;
            if (skillName !== expected) return false;
        }

        // Etching chain availability
        const etchChain = ETCHING_LOOKUP_UI.get(skillName);
        if (etchChain) {
            const state = es.etchingState?.[etchChain.etching];
            if (skillName === etchChain.lesser && state !== 'lesser') return false;
            if (skillName === etchChain.full   && state !== 'full')   return false;
        }

        // Hammer orb ICD (480ms between any orb skill and Grand Finale)
        if (sk.weapon === 'Hammer' && sk.type === 'Weapon skill') {
            const isGF = skillName === 'Grand Finale';
            const isOrb = HAMMER_ALL_ORB_NAMES_UI.has(skillName);
            if ((isGF || isOrb) && (es.hammerOrbLastCast ?? -Infinity) > -Infinity) {
                if (t - es.hammerOrbLastCast < HAMMER_ORB_ICD_MS_UI) return false;
            }
        }

        // Hammer Grand Finale: needs at least one active orb in current attunement context
        if (skillName === 'Grand Finale' && sk.weapon === 'Hammer') {
            const orbs = es.hammerOrbs || {};
            const activeOrbs = Object.entries(orbs).filter(([, exp]) => exp !== null && exp > t).map(([el]) => el);
            if (activeOrbs.length === 0) return false;
            // Check attunement-specific prerequisite
            const pri = es.att;
            const sec = es.att2;
            const grantedBy = es.hammerOrbGrantedBy || {};
            if (es.eliteSpec !== 'Weaver' || !sec || pri === sec) {
                if (!activeOrbs.includes(pri)) return false;
            } else {
                let qualifies = activeOrbs.includes(pri) || activeOrbs.includes(sec);
                if (!qualifies) {
                    for (const el of activeOrbs) {
                        const gb = grantedBy[el];
                        if (!gb) continue;
                        const gbSk = this.data.skills.find(s => s.name === gb);
                        if (!gbSk) continue;
                        const att = gbSk.attunement || '';
                        const parts = att.split('+');
                        if (parts.includes(pri) || parts.includes(sec)) { qualifies = true; break; }
                    }
                }
                if (!qualifies) return false;
            }
        }

        // Tailored Victory: only available while Perfect Weave is active
        if (skillName === 'Tailored Victory' && (es.perfectWeaveUntil || 0) <= t) return false;

        return true;
    }

    _getChainRootName(sk) {
        const candidates = this.data.skills.filter(s =>
            s.slot === sk.slot && s.attunement === sk.attunement && s.weapon === sk.weapon && s.chainSkill
        );
        if (candidates.length === 0) return sk.name;
        const targets = new Set(candidates.map(s => s.chainSkill));
        const root = candidates.find(s => !targets.has(s.name));
        return root ? root.name : candidates[0].name;
    }

    _isVirtualAvailable(name) {
        const es = this.sim?.results?.endState;
        if (!es) return false;
        if (name === '__drop_bundle') return !!es.conjureEquipped;
        if (name.startsWith('__pickup_')) {
            const weapon = name.slice(9);
            return (es.conjurePickups || []).some(p => p.weapon === weapon && es.time <= p.expiresAt);
        }
        return false;
    }

    _getSkillCD(skill) {
        const es = this.sim?.results?.endState;
        if (!es) return null;
        const t = es.time;
        const name = skill.name;

        // Attunement swap
        if (skill.type === 'Attunement' && !name.startsWith('Overload')) {
            const target = name.replace(' Attunement', '');
            const cd = ((es.attCD[target] || 0) - t) / 1000;
            return cd > 0 ? cd : null;
        }

        // Overload: max of skill CD and dwell time requirement
        if (name.startsWith('Overload ')) {
            const skillCd = ((es.skillCD[name] || 0) - t) / 1000;
            const dwell = es._hasTranscendentTempest ? 4000 : 6000;
            const dwellCd = (es.attEnteredAt + dwell - t) / 1000;
            const cd = Math.max(skillCd, dwellCd);
            return cd > 0 ? cd : null;
        }

        const cdKey = this._cdKey(skill);

        // Charge-based skills: show time until next charge only when fully depleted
        if (skill.maximumCount > 0 && skill.countRecharge > 0) {
            const charges = this._getChargeCount(skill);
            if (charges === null || charges > 0) return null;
            const ch = es.charges?.[cdKey];
            if (!ch || ch.nextChargeAt === Infinity) return null;
            const cd = (ch.nextChargeAt - t) / 1000;
            return cd > 0 ? cd : null;
        }

        // Regular skill
        const cd = ((es.skillCD[cdKey] || 0) - t) / 1000;
        return cd > 0 ? cd : null;
    }

    _getChargeCount(sk) {
        if (!sk.maximumCount || sk.maximumCount <= 0 || !sk.countRecharge) return null;
        const es = this.sim?.results?.endState;
        if (!es) return sk.maximumCount;
        const cdKey = this._cdKey(sk);
        const ch = es.charges?.[cdKey];
        if (!ch) return sk.maximumCount;
        let count = ch.count;
        let nextAt = ch.nextChargeAt;
        const crMs = Math.round(sk.countRecharge * 1000);
        const t = es.time;
        while (count < sk.maximumCount && nextAt <= t) {
            count++;
            nextAt = count < sk.maximumCount ? nextAt + crMs : Infinity;
        }
        return count;
    }

    _palIcon(skill, available = true) {
        const icon = this.api.getSkillIcon(skill.name);
        const c = this._skillColor(skill, skill.name);
        const cls = available ? '' : ' pal-disabled';
        const charges = this._getChargeCount(skill);
        const chargeBadge = charges !== null ? `<span class="pal-charges">${charges}</span>` : '';
        const cdSecs = this._getSkillCD(skill);
        const cdBadge = cdSecs !== null ? `<span class="pal-cd">${cdSecs.toFixed(1)}</span>` : '';
        return `<div class="pal-skill${cls}" data-skill="${esc(skill.name)}" title="${esc(skill.name)}" style="--att-border:${c}">
            <img src="${icon || PLACEHOLDER_ICON}" />${chargeBadge}${cdBadge}</div>`;
    }

    _renderPalette() {
        const el = document.getElementById('rotation-palette');
        const skills = this.data.skills;
        const { weapons: weps } = this.data.attributes;
        const mh = weps[0] || '', oh = weps[1] || '';
        const is2h = TH_WEAPONS.has(mh);
        const elite = this._getEliteSpec();
        const es = this.sim?.results?.endState;
        const wielding = es?.conjureEquipped || null;
        let h = '';

        h += '<div class="pal-group"><div class="pal-label">Att</div><div class="pal-row">';
        for (const att of ATTUNEMENTS) {
            const sw = skills.find(s => s.name === `${att} Attunement`);
            if (sw) h += this._palIcon(sw, this._isSkillAvailable(sw.name));
        }
        h += '</div></div>';

        if (elite === 'Tempest') {
            h += '<div class="pal-group"><div class="pal-label">OL</div><div class="pal-row">';
            for (const att of ATTUNEMENTS) {
                const ol = skills.find(s => s.name === `Overload ${att}`);
                if (ol) h += this._palIcon(ol, this._isSkillAvailable(ol.name));
            }
            h += '</div></div>';
        }

        if (elite === 'Catalyst') {
            const energy = es ? (es.energy ?? 30) : 30;
            const pct = Math.round((energy / CATALYST_ENERGY_MAX) * 100);
            const sphereActive = es?.sphereWindows?.some(w => w.start <= es.time && w.end > es.time) ?? false;
            h += `<div class="pal-group"><div class="pal-label" style="color:#44ddaa">F5</div><div class="pal-row" style="flex-wrap:wrap;gap:4px">`;
            h += `<div class="energy-bar-wrap">
                <div class="energy-bar-fill${sphereActive ? ' sphere-active' : ''}" style="width:${pct}%"></div>
                <span class="energy-bar-text">${energy}/${CATALYST_ENERGY_MAX}</span>
            </div>`;
            for (const att of ATTUNEMENTS) {
                const js = skills.find(s => s.type === 'Jade Sphere' && s.attunement === att);
                if (js) h += this._palIcon(js, this._isSkillAvailable(js.name));
            }
            h += '</div></div>';
        }

        if (elite === 'Evoker') {
            const EVOKER_SELECTORS = new Set(['Ignite', 'Splash', 'Zap', 'Calcify']);
            const curEl = es?.evokerElement || this.evokerElement || null;
            const charges = es?.evokerCharges ?? 6;
            const empowered = es?.evokerEmpowered ?? 0;
            const elLabel = curEl ? curEl[0] : '?';
            h += `<div class="pal-group"><div class="pal-label" style="color:${curEl ? ATTUNEMENT_COLORS[curEl] : '#888'}">F5<br><small>${elLabel}</small></div><div class="pal-row" style="flex-wrap:wrap;gap:4px">`;
            if (curEl) {
                h += `<div class="evoker-charge-wrap">`;
                h += `<div class="evoker-charge-outer">`;
                for (let i = 0; i < 6; i++) h += `<span class="evoker-pip${i < charges ? ' filled' : ''}"></span>`;
                h += `</div>`;
                h += `<div class="evoker-charge-inner">`;
                for (let i = 0; i < 3; i++) h += `<span class="evoker-emp${i < empowered ? ' filled' : ''}"></span>`;
                h += `</div>`;
                h += `</div>`;
                if (empowered >= 3) {
                    const empSkill = skills.find(s =>
                        s.type === 'Familiar' && !EVOKER_SELECTORS.has(s.name) && s.attunement === curEl
                    );
                    if (empSkill) h += this._palIcon(empSkill, this._isSkillAvailable(empSkill.name));
                } else {
                    const basicSkill = skills.find(s =>
                        s.type === 'Familiar' && EVOKER_SELECTORS.has(s.name) && s.attunement === curEl
                    );
                    if (basicSkill) h += this._palIcon(basicSkill, this._isSkillAvailable(basicSkill.name));
                }
            } else {
                h += '<span style="color:#888;font-size:11px;padding:4px">Select familiar (F5) above</span>';
            }
            h += '</div></div>';
        }

        if (es?.aaCarryover) {
            const carryRoot = es.aaCarryover.root;
            const carryAtt = es.aaCarryover.att;
            let cur = es.chainState?.[carryRoot];
            const remaining = [];
            const visited = new Set();
            while (cur && cur !== carryRoot && !visited.has(cur)) {
                const sk = skills.find(s => s.name === cur);
                if (!sk) break;
                remaining.push(sk);
                visited.add(cur);
                cur = sk.chainSkill;
            }
            if (remaining.length > 0) {
                const color = ATTUNEMENT_COLORS[carryAtt];
                h += `<div class="pal-group"><div class="pal-label" style="color:${color}">AA</div><div class="pal-row">`;
                for (const sk of remaining) h += this._palIcon(sk, this._isSkillAvailable(sk.name));
                h += '</div></div>';
            }
        }

        if (wielding) {
            const cs = skills.filter(s => s.weapon === wielding);
            if (cs.length) {
                h += `<div class="pal-group"><div class="pal-label" style="color:#ffcc44">${wielding}</div><div class="pal-row">`;
                for (const sk of cs) h += this._palIcon(sk, this._isSkillAvailable(sk.name));
                h += '</div></div>';
            }
            h += `<div class="pal-group"><div class="pal-label" style="color:#ffcc44">Act</div><div class="pal-row">`;
            h += `<div class="pal-skill" data-skill="__drop_bundle" title="Drop ${esc(wielding)}" style="--att-border:#ffcc44">
                <img src="${DROP_BUNDLE_ICON}" /></div>`;
            h += '</div></div>';
        } else if (elite === 'Weaver') {
            const priAtt = es?.att || this.activeAttunement;
            const secAtt = es?.att2 || this.secondaryAttunement;
            h += `<div class="pal-group"><div class="pal-label" style="color:${ATTUNEMENT_COLORS[priAtt]}">1-2</div><div class="pal-row">`;
            for (let slot = 1; slot <= 2; slot++) {
                const weapon = is2h ? mh : (slot <= 3 ? mh : oh);
                const chain = this._getChainOrder(this._getSkillsForSlot(weapon, priAtt, String(slot)));
                for (const sk of chain) h += this._palIcon(sk, this._isSkillAvailable(sk.name));
            }
            h += '</div></div>';

            const weapon3 = is2h ? mh : mh;
            if (priAtt !== secAtt) {
                const dualKey1 = `${priAtt}+${secAtt}`;
                const dualKey2 = `${secAtt}+${priAtt}`;
                const dualSkills = skills.filter(s =>
                    (s.attunement === dualKey1 || s.attunement === dualKey2) &&
                    s.slot === '3' && s.weapon === weapon3);
                if (dualSkills.length) {
                    h += `<div class="pal-group"><div class="pal-label" style="background:linear-gradient(${ATTUNEMENT_COLORS[priAtt]}, ${ATTUNEMENT_COLORS[secAtt]});-webkit-background-clip:text;-webkit-text-fill-color:transparent">3</div><div class="pal-row">`;
                    for (const sk of dualSkills) h += this._palIcon(sk, this._isSkillAvailable(sk.name));
                    h += '</div></div>';
                }
            } else {
                const fallback3 = this._getChainOrder(this._getSkillsForSlot(weapon3, priAtt, '3'));
                if (fallback3.length) {
                    h += `<div class="pal-group"><div class="pal-label" style="color:${ATTUNEMENT_COLORS[priAtt]}">3</div><div class="pal-row">`;
                    for (const sk of fallback3) h += this._palIcon(sk, this._isSkillAvailable(sk.name));
                    h += '</div></div>';
                }
            }

            h += `<div class="pal-group"><div class="pal-label" style="color:${ATTUNEMENT_COLORS[secAtt]}">4-5</div><div class="pal-row">`;
            for (let slot = 4; slot <= 5; slot++) {
                const weapon = is2h ? mh : oh;
                const chain = this._getChainOrder(this._getSkillsForSlot(weapon, secAtt, String(slot)));
                for (const sk of chain) h += this._palIcon(sk, this._isSkillAvailable(sk.name));
            }
            h += '</div></div>';
        } else {
            for (const att of ATTUNEMENTS) {
                h += `<div class="pal-group"><div class="pal-label" style="color:${ATTUNEMENT_COLORS[att]}">${att[0]}</div><div class="pal-row">`;
                for (let slot = 1; slot <= 5; slot++) {
                    const weapon = is2h ? mh : (slot <= 3 ? mh : oh);
                    const chain = this._getChainOrder(this._getSkillsForSlot(weapon, att, String(slot)));
                    for (const sk of chain) h += this._palIcon(sk, this._isSkillAvailable(sk.name));
                }
                h += '</div></div>';
            }
        }

        // ── Spear Etching chain variants ─────────────────────────────────────
        // Show lesser/full variants when Spear is equipped, regardless of attunement state,
        // so the user can always add them to the rotation after running a sim.
        const spearEquipped = mh === 'Spear' || oh === 'Spear';
        if (spearEquipped) {
            const etchingSkills = [];
            for (const chain of Object.values(ETCHING_CHAINS_UI)) {
                const lesserSk = skills.find(s => s.name === chain.lesser);
                const fullSk   = skills.find(s => s.name === chain.full);
                if (lesserSk) etchingSkills.push(lesserSk);
                if (fullSk)   etchingSkills.push(fullSk);
            }
            if (etchingSkills.length > 0) {
                h += '<div class="pal-group"><div class="pal-label" style="color:#cc8844">Etch</div><div class="pal-row">';
                for (const sk of etchingSkills) h += this._palIcon(sk, this._isSkillAvailable(sk.name));
                h += '</div></div>';
            }
        }

        // ── Hammer orb: Grand Finale ──────────────────────────────────────────
        // Grand Finale has no attunement in the CSV so it won't appear in the normal palette groups.
        // Show it in a dedicated group whenever Hammer is equipped.
        const hammerEquipped = mh === 'Hammer' || oh === 'Hammer';
        if (hammerEquipped) {
            const gfSk = skills.find(s => s.name === 'Grand Finale' && s.weapon === 'Hammer');
            if (gfSk) {
                h += '<div class="pal-group"><div class="pal-label" style="color:#ff9944">GF</div><div class="pal-row">';
                h += this._palIcon(gfSk, this._isSkillAvailable(gfSk.name));
                h += '</div></div>';
            }
        }

        const selSkills = [];
        const currentAtt = es?.att || this.activeAttunement;
        for (const slotKey of SLOT_LABELS) {
            const sel = this.selectedSkills[slotKey];
            if (!sel) continue;
            const base = sel.displayName || sel.name.replace(/\s*\((?:Fire|Water|Air|Earth)\)$/, '');
            const hasVars = ATTUNEMENTS.some(a => skills.find(s => s.name === `${base} (${a})`));
            if (hasVars) {
                const v = skills.find(s => s.name === `${base} (${currentAtt})`);
                if (v) selSkills.push(v);
            } else {
                selSkills.push(sel);
            }
        }
        if (selSkills.length > 0) {
            h += '<div class="pal-group"><div class="pal-label">Skill</div><div class="pal-row">';
            for (const sk of selSkills) h += this._palIcon(sk, this._isSkillAvailable(sk.name));
            h += '</div></div>';
        }

        if (!wielding) {
            for (const slotKey of SLOT_LABELS) {
                const sel = this.selectedSkills[slotKey];
                if (sel?.type === 'Conjure') {
                    const cw = CONJURE_MAP[sel.name];
                    if (cw) {
                        const cs = skills.filter(s => s.weapon === cw);
                        if (cs.length) {
                            h += `<div class="pal-group"><div class="pal-label" style="color:${ATTUNEMENT_COLORS['Fire']}">${cw[0]}</div><div class="pal-row">`;
                            for (const sk of cs) h += this._palIcon(sk, this._isSkillAvailable(sk.name));
                            h += '</div></div>';
                        }
                    }
                }
            }
        }

        const availablePickups = (es?.conjurePickups || []).filter(p => es.time <= p.expiresAt);
        if (availablePickups.length > 0 && !wielding) {
            h += `<div class="pal-group"><div class="pal-label" style="color:#ffcc44">Pick</div><div class="pal-row">`;
            for (const pickup of availablePickups) {
                const pw = pickup.weapon;
                const pickupName = `__pickup_${pw}`;
                const conjSkillName = Object.entries(CONJURE_MAP).find(([, v]) => v === pw)?.[0];
                const pickupIcon = conjSkillName ? this.api.getSkillIcon(conjSkillName) : null;
                const remaining = ((pickup.expiresAt - es.time) / 1000).toFixed(1);
                h += `<div class="pal-skill" data-skill="${esc(pickupName)}" title="Pick up ${esc(pw)} (${remaining}s left)" style="--att-border:#ffcc44; box-shadow: 0 0 6px #ffcc44">
                    <img src="${pickupIcon || PLACEHOLDER_ICON}" /></div>`;
            }
            h += '</div></div>';
        }

        el.innerHTML = h;
        el.querySelectorAll('.pal-skill').forEach(p => {
            p.addEventListener('click', (e) => {
                const skillName = p.dataset.skill;
                const sk = this.data.skills.find(s => s.name === skillName);
                const isInstant = sk && (sk.castTime || 0) === 0;
                // Shift+click on an instant skill: add as concurrent (fires during previous cast)
                if (e.shiftKey && isInstant && this.sim?.rotation.length > 0) {
                    this._addToRotation(skillName, 0);
                // Ctrl+click on a non-instant skill: fill the wait gap before it with an
                // attunement-appropriate auto-attack (Arc Lightning / Stone Shards)
                } else if (e.ctrlKey && !isInstant) {
                    this._addToRotation(skillName, null, true);
                } else {
                    this._addToRotation(skillName);
                }
            });
        });
    }

    _renderTimeline() {
        const el = document.getElementById('rotation-timeline');
        if (!this.sim || this.sim.rotation.length === 0) {
            el.innerHTML = '<div class="rot-empty">Click skills above to build rotation</div>';
            return;
        }

        const stepMap = {};
        if (this.sim.results?.steps) {
            for (const st of this.sim.results.steps) stepMap[st.ri] = st;
        }

        const elite = this._getEliteSpec();
        const isWeaver = elite === 'Weaver';
        const rows = [];
        let curAtt = this.activeAttunement || 'Fire';
        let curAtt2 = isWeaver ? (this.secondaryAttunement || curAtt) : null;
        rows.push({ att: curAtt, att2: curAtt2, skills: [] });

        for (let i = 0; i < this.sim.rotation.length; i++) {
            const rotItem = this.sim.rotation[i];
            const name = typeof rotItem === 'string' ? rotItem : rotItem.name;
            const offset = typeof rotItem === 'object' ? rotItem.offset : undefined;
            const isGapFill = typeof rotItem === 'object' && rotItem.gapFill === true;
            const skill = this.data.skills.find(s => s.name === name);
            const isSwap = skill?.type === 'Attunement' && !skill.name.startsWith('Overload');

            // Any attunement swap (concurrent or sequential) opens a new row
            if (isSwap) {
                const target = skill.name.replace(' Attunement', '');
                if (isWeaver) { curAtt2 = curAtt; }
                curAtt = target;
                if (i > 0) {
                    rows.push({ att: curAtt, att2: curAtt2, skills: [] });
                } else {
                    rows[0].att = curAtt;
                    rows[0].att2 = curAtt2;
                }
            }
            rows[rows.length - 1].skills.push({ name, idx: i, step: stepMap[i], offset, isGapFill });
        }

        let tlHtml = rows.map(row => {
            const color = ATTUNEMENT_COLORS[row.att] || 'var(--border-light)';
            const label = isWeaver && row.att2
                ? `${row.att[0]}/${row.att2[0]}`
                : row.att;
            const skillsHtml = row.skills.map(({ name, idx, step, offset, isGapFill }, si) => {
                const skill = this.data.skills.find(s => s.name === name);
                let icon, displayName;
                if (name === '__drop_bundle') {
                    icon = DROP_BUNDLE_ICON;
                    displayName = 'Drop Bundle';
                } else if (name.startsWith('__pickup_')) {
                    const pw = name.slice(9);
                    const conjName = Object.entries(CONJURE_MAP).find(([, v]) => v === pw)?.[0];
                    icon = conjName ? this.api.getSkillIcon(conjName) : null;
                    displayName = `Pick up ${pw}`;
                } else {
                    icon = this.api.getSkillIcon(name);
                    displayName = name;
                }
                const c = this._skillColor(skill, name);
                const pf = step?.partialFill;
                const ts = pf
                    ? `${(pf.startMs / 1000).toFixed(2)}s`
                    : step ? `${(step.start / 1000).toFixed(2)}s` : '';
                const castInfo = step
                    ? `\nCast: ${(step.start / 1000).toFixed(2)}s → ${(step.end / 1000).toFixed(2)}s`
                    : '';
                const isConcurrent = offset !== undefined;
                const offsetBadge = isConcurrent
                    ? `<span class="rot-offset-badge" data-idx="${idx}" title="Fires ${offset}ms into previous cast (click to edit)">⊙${offset}ms</span>`
                    : '';
                const gapFillBadge = isGapFill
                    ? `<span class="rot-gapfill-badge" title="${pf ? `${pf.durationMs}ms of ${pf.skill} filled gap` : 'Gap-fill: channels filler until this skill is ready'}">⟳${pf ? pf.durationMs + 'ms' : ''}</span>`
                    : '';
                const concurClass = isConcurrent ? ' rot-concurrent' : '';
                const gapFillClass = isGapFill ? ' rot-gapfill' : '';
                const concurInfo = isConcurrent ? `\n⊙ Fires ${offset}ms into previous cast` : '';
                const gapFillInfo = pf ? `\n⟳ ${pf.durationMs}ms of ${pf.skill} filled gap before cast` : isGapFill ? '\n⟳ Gap-fill enabled (no gap at sim time)' : '';
                return (si > 0 ? '<span class="rot-arrow">→</span>' : '') +
                    `<div class="rot-skill${concurClass}${gapFillClass}" draggable="true" data-idx="${idx}" title="${esc(displayName)}${castInfo}${concurInfo}${gapFillInfo}" style="--att-border:${c}">
                        <img src="${icon || PLACEHOLDER_ICON}" />
                        <span class="rot-x">\u00d7</span>
                        ${ts ? `<span class="rot-time">${ts}</span>` : ''}
                        ${offsetBadge}${gapFillBadge}
                    </div>`;
            }).join('');
            return `<div class="rot-row" style="--row-color:${color}">
                <div class="rot-row-label">${label}</div>
                <div class="rot-row-skills">${skillsHtml}</div>
            </div>`;
        }).join('');

        // Proc row — relic, sigil, and notable trait activations
        const PROC_COLORS = { relic_proc: '#ddaa33', sigil_proc: '#4488cc', trait_proc: '#77cc77' };
        const procSteps = (this.sim.results?.steps || [])
            .filter(s => s.ri === -1 && (s.type === 'relic_proc' || s.type === 'sigil_proc' || s.type === 'trait_proc'))
            .sort((a, b) => a.start - b.start);
        if (procSteps.length > 0) {
            const procsHtml = procSteps.map(s => {
                const ts = `${(s.start / 1000).toFixed(2)}s`;
                const pc = PROC_COLORS[s.type] || 'var(--border-light)';
                const typeLabel = s.type === 'relic_proc' ? 'Relic' : s.type === 'sigil_proc' ? 'Sigil' : 'Trait';
                return `<div class="proc-icon" title="${esc(s.skill)}\n${typeLabel} proc @ ${ts}" style="--proc-color:${pc}">
                    <img src="${s.icon || PLACEHOLDER_ICON}" />
                    <span class="proc-time">${ts}</span>
                </div>`;
            }).join('');
            tlHtml += `<div class="rot-row rot-procs-row">
                <div class="rot-row-label">Procs</div>
                <div class="rot-row-skills proc-icons-row">${procsHtml}</div>
            </div>`;
        }

        el.innerHTML = tlHtml;

        el.querySelectorAll('.rot-offset-badge').forEach(badge => {
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(badge.dataset.idx);
                const item = this.sim.rotation[idx];
                const current = typeof item === 'object' ? item.offset : 0;
                const val = prompt(`Offset (ms) from start of preceding cast:`, current);
                if (val === null) return;
                const parsed = parseInt(val);
                if (!isNaN(parsed) && parsed >= 0) {
                    this.sim.rotation[idx] = { name: item.name, offset: parsed };
                    this._autoRun();
                }
            });
        });

        el.querySelectorAll('.rot-skill').forEach(s => {
            const idx = parseInt(s.dataset.idx);
            s.querySelector('.rot-x').addEventListener('click', (e) => {
                e.stopPropagation();
                this._removeFromRotation(idx);
            });
            s.addEventListener('dragstart', (e) => {
                this.dragIdx = idx;
                s.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            s.addEventListener('dragend', () => { s.classList.remove('dragging'); this.dragIdx = null; });
            s.addEventListener('dragover', (e) => { e.preventDefault(); s.classList.add('drag-over'); });
            s.addEventListener('dragleave', () => s.classList.remove('drag-over'));
            s.addEventListener('drop', (e) => {
                e.preventDefault();
                s.classList.remove('drag-over');
                if (this.dragIdx !== null && this.dragIdx !== idx) {
                    this.sim.moveSkill(this.dragIdx, idx);
                    this._autoRun();
                }
            });
        });
    }

    _renderResults() {
        const el = document.getElementById('rotation-results');
        if (!this.sim?.results) { el.innerHTML = ''; return; }
        const r = this.sim.results;

        window._exportLogCSV = () => {
            if (!r?.log) return;
            const csv = SimulationEngine.exportLogCSV(r.log);
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'event_log.csv';
            a.click();
            URL.revokeObjectURL(url);
        };
        const dur = (r.rotationMs / 1000).toFixed(2);
        const killTime = r.deathTime !== null ? (r.deathTime / 1000).toFixed(2) : null;

        let h = `<div class="res-summary">
            <div class="res-stat"><span class="res-label">Duration</span><span class="res-val">${dur}s</span></div>`;
        if (killTime !== null) {
            h += `<div class="res-stat"><span class="res-label">Kill Time</span><span class="res-val kill-time">${killTime}s</span></div>`;
        }
        h += `<div class="res-stat"><span class="res-label">Total Damage</span><span class="res-val">${Math.round(r.totalDamage).toLocaleString()}</span></div>
            <div class="res-stat"><span class="res-label">DPS</span><span class="res-val dps">${Math.round(r.dps).toLocaleString()}</span></div>
            <div class="res-stat"><span class="res-label">Strike</span><span class="res-val">${Math.round(r.totalStrike).toLocaleString()}</span></div>
            <div class="res-stat"><span class="res-label">Condition</span><span class="res-val condi">${Math.round(r.totalCondition).toLocaleString()}</span></div>
        </div>`;

        const sorted = Object.entries(r.perSkill)
            .map(([name, d]) => [name, d.strike + d.condition, d])
            .filter(([, t]) => t > 0)
            .sort((a, b) => b[1] - a[1]);

        const dpsWindowSec = (r.dpsWindowMs ?? 0) / 1000;

        h += `<div class="res-breakdown"><div class="res-hdr">
            <span>Skill</span><span>Strike</span><span>Condi</span><span>Total</span><span>DPS</span><span>Avg/Cast</span><span>DCT</span><span>Casts</span>
        </div>`;
        // Build a name→icon map from proc steps (sigils/relics carry their icon there)
        const stepIconMap = {};
        for (const s of (r.steps || [])) {
            if (s.icon && !stepIconMap[s.skill]) stepIconMap[s.skill] = s.icon;
        }
        const _lookupIcon = (name) => {
            return this.api.getSkillIcon(name)
                || this.api.getTraitIcon(name)
                || stepIconMap[name]
                // strip common synthetic suffixes and retry
                || this.api.getSkillIcon(name.replace(/ (?:Proc|Bonus)$/, ''))
                || this.api.getTraitIcon(name.replace(/ (?:Proc|Bonus)$/, ''));
        };

        for (const [name, total, d] of sorted) {
            const icon = _lookupIcon(name);
            const skillDps   = dpsWindowSec > 0 ? Math.round(total / dpsWindowSec) : 0;
            const avgPerCast = d.casts > 0 ? Math.round(total / d.casts) : 0;
            const castTimeSec = (d.castTimeMs || 0) / 1000;
            const dct = castTimeSec > 0 ? Math.round(total / castTimeSec) : null;
            h += `<div class="res-row">
                <span class="res-skill"><img src="${icon || PLACEHOLDER_ICON}" />${esc(name)}</span>
                <span>${Math.round(d.strike).toLocaleString()}</span>
                <span class="condi">${Math.round(d.condition).toLocaleString()}</span>
                <span class="total">${Math.round(total).toLocaleString()}</span>
                <span class="dps">${skillDps.toLocaleString()}</span>
                <span>${avgPerCast.toLocaleString()}</span>
                <span>${dct !== null ? dct.toLocaleString() : '—'}</span>
                <span>${d.casts}</span>
            </div>`;
        }
        h += '</div>';

        // ── Per-condition damage breakdown ──
        const condEntries = Object.entries(r.condDamage || {})
            .map(([cond, dmg]) => ({ cond, dmg, avgStacks: (r.condAvgStacks || {})[cond] || 0 }))
            .filter(e => e.dmg > 0)
            .sort((a, b) => b.dmg - a.dmg);
        if (condEntries.length > 0) {
            const dws = (r.dpsWindowMs ?? 0) / 1000;
            let totalCondDmg = 0;
            for (const e of condEntries) totalCondDmg += e.dmg;
            h += `<div class="res-breakdown cond-breakdown"><div class="res-hdr cond-hdr">
                <span>Condition</span><span>Damage</span><span>DPS</span><span>Avg Stacks</span>
            </div>`;
            for (const e of condEntries) {
                const cdps = dws > 0 ? Math.round(e.dmg / dws) : 0;
                h += `<div class="res-row">
                    <span class="res-skill condi">${esc(e.cond)}</span>
                    <span class="condi">${Math.round(e.dmg).toLocaleString()}</span>
                    <span class="dps">${cdps.toLocaleString()}</span>
                    <span>${e.avgStacks.toFixed(2)}</span>
                </div>`;
            }
            const totalCondDps = dws > 0 ? Math.round(totalCondDmg / dws) : 0;
            h += `<div class="res-row res-total">
                <span class="res-skill"><b>Total Conditions</b></span>
                <span class="condi"><b>${Math.round(totalCondDmg).toLocaleString()}</b></span>
                <span class="dps"><b>${totalCondDps.toLocaleString()}</b></span>
                <span></span>
            </div>`;
            h += '</div>';
        }

        h += this._buildChartHtml(r);

        h += `<details class="res-log-wrap"><summary>Event Log (${r.log.length} events)</summary>`;
        h += `<button class="btn-csv-export" onclick="window._exportLogCSV()">Download CSV Log</button>`;
        h += `<div class="res-log">`;
        for (const ev of r.log) {
            const ts = `${(ev.t / 1000).toFixed(3)}s`;
            let desc = '', cls = '';
            const d = ev.diag || {};
            switch (ev.type) {
                case 'cast':      desc = `CAST ${ev.skill} [${ev.att}] (${ev.dur}ms)`; break;
                case 'cast_end':  desc = `END  ${ev.skill}`; break;
                case 'swap':      desc = `SWAP ${ev.from} → ${ev.to}`; break;
                case 'hit': {
                    let detail = `HIT  ${ev.skill} #${ev.hit}.${ev.sub} → ${ev.strike} dmg (coeff ${ev.coeff?.toFixed(3) || 0})`;
                    if (ev.isField) detail += ' [field]';
                    if (d.power) detail += ` | pwr:${d.power} ws:${d.ws} cc:${d.critCh?.toFixed(1)}% cd:${d.critDmg?.toFixed(1)}% cMul:${d.critMul?.toFixed(3)} sMul:${d.strikeMul?.toFixed(3)}`;
                    desc = detail;
                    break;
                }
                case 'apply':     desc = `EFFECT ${ev.effect} ×${ev.stacks}${ev.dur > 0 ? ` (${ev.dur}s)` : ''} [${ev.skill}]`; break;
                case 'cond_apply': {
                    let detail = `COND+ ${ev.cond} ×${ev.stacks} (${ev.durMs}ms) [${ev.skill}] total:${ev.total}`;
                    if (d.baseDurMs) detail += ` | base:${d.baseDurMs}ms +${d.bonusPct}%${d.weaversProwess ? ' [WP+20%]' : ''}`;
                    desc = detail;
                    break;
                }
                case 'cond_tick': {
                    let detail = `TICK  ${ev.cond} ×${ev.stacks} → ${ev.total} dmg (${ev.perStack}/stack)`;
                    if (d.condMul) detail += ` | condDmg:${d.condDmg} base:${d.baseTick} mul:${d.condMul?.toFixed(3)} vuln:${d.vulnMul?.toFixed(2)}`;
                    desc = detail;
                    break;
                }
                case 'field':     desc = `FIELD ${ev.field} (${ev.dur}ms) [${ev.skill}]`; break;
                case 'aura':      desc = `AURA  ${ev.aura} (${ev.dur}ms) [${ev.skill}]`; break;
                case 'conjure':   desc = `CONJURE ${ev.weapon} equipped (pickup expires ${(ev.pickupExpires / 1000).toFixed(1)}s)`; break;
                case 'jade_sphere': desc = `JADE SPHERE ${ev.att} (energy: ${ev.energy}, dur: ${ev.durMs}ms) [${ev.skill}]`; break;
                case 'familiar_select': desc = `FAMILIAR ${ev.element} selected [${ev.skill}]`; break;
                case 'drop':      desc = `DROP ${ev.weapon}`; break;
                case 'pickup':    desc = `PICKUP ${ev.weapon}`; break;
                case 'sigil_proc': desc = `SIGIL ${ev.sigil} proc [${ev.skill}]`; cls = ' sigil'; break;
                case 'relic_proc': desc = `RELIC ${ev.relic} proc [${ev.skill}]`; cls = ' relic'; break;
                case 'trait_proc': desc = `TRAIT ${ev.trait} proc [${ev.skill}]`; cls = ' trait'; break;
                case 'err':       desc = ev.msg; cls = ' err'; break;
                default:          desc = JSON.stringify(ev);
            }
            h += `<div class="log-line"><span class="log-time">${ts}</span><span class="log-desc${cls}">${desc}</span></div>`;
        }
        h += '</div></details>';

        if (r.contributions && r.contributions.length > 0) {
            h += `<div class="res-contributions">
                <h4>Modifier Contributions</h4>
                <div class="contrib-table">
                    <div class="contrib-hdr"><span>Modifier</span><span>DPS Increase</span><span>% Increase</span></div>`;
            for (const c of r.contributions) {
                const sign = c.dpsIncrease >= 0 ? '+' : '';
                h += `<div class="contrib-row">
                    <span class="contrib-name">${esc(c.name)}</span>
                    <span class="contrib-val">${sign}${Math.round(c.dpsIncrease).toLocaleString()}</span>
                    <span class="contrib-pct">${sign}${c.pctIncrease.toFixed(2)}%</span>
                </div>`;
            }
            h += `</div></div>`;
        }

        el.innerHTML = h;

        this._bindChartToggles();
    }

    // ─── Chart ───
    _buildChartHtml(r) {
        const allEffects = [...new Set((r.allCondStacks || []).map(s => s.cond))];
        const intensityEffects = allEffects.filter(e => INTENSITY_EFFECTS.has(e));
        const durationEffects = allEffects.filter(e => !INTENSITY_EFFECTS.has(e));

        let h = '<div class="chart-wrap"><div class="chart-title">DPS &amp; Effects Over Time</div>';
        h += '<div class="chart-toggles">';
        h += `<label><input type="checkbox" data-series="dps" checked /><span class="swatch" style="background:#44bb44"></span> DPS</label>`;
        for (const ct of intensityEffects) {
            const col = EFFECT_COLORS[ct] || '#aaa';
            h += `<label><input type="checkbox" data-series="${esc(ct)}" checked /><span class="swatch" style="background:${col}"></span> ${ct}</label>`;
        }
        for (const ct of durationEffects) {
            const col = EFFECT_COLORS[ct] || '#aaa';
            h += `<label><input type="checkbox" data-series="${esc(ct)}" /><span class="swatch" style="background:${col}"></span> ${ct}</label>`;
        }
        h += '</div><div class="chart-canvas-wrap"><canvas id="rotation-chart"></canvas></div></div>';
        return h;
    }

    _bindChartToggles() {
        const wrap = document.querySelector('.chart-toggles');
        if (!wrap) return;
        wrap.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => this._drawChart());
        });
        this._drawChart();
    }

    _drawChart() {
        const canvas = document.getElementById('rotation-chart');
        if (!canvas || !this.sim?.results) return;
        const r = this.sim.results;
        const maxTime = r.rotationMs;
        if (maxTime <= 0) return;

        const allStacks = r.allCondStacks || [];
        const allEffects = [...new Set(allStacks.map(s => s.cond))];

        const toggles = {};
        document.querySelectorAll('.chart-toggles input').forEach(cb => {
            toggles[cb.dataset.series] = cb.checked;
        });

        const activeDurEffects = allEffects.filter(e => !INTENSITY_EFFECTS.has(e) && toggles[e]);
        const barRowH = 8;
        const barGap = 1;
        const barZoneH = activeDurEffects.length > 0 ? activeDurEffects.length * (barRowH + barGap) + 4 : 0;

        const wrap = canvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        const cssW = wrap.clientWidth;
        const cssH = 200 + barZoneH;
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        canvas.style.height = cssH + 'px';
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        const pad = { top: 20, right: 55, bottom: 30 + barZoneH, left: 60 };
        const pw = cssW - pad.left - pad.right;
        const ph = cssH - pad.top - pad.bottom;

        const dmgEvents = [];
        for (const ev of r.log) {
            if (ev.type === 'hit' && ev.strike > 0) dmgEvents.push({ t: ev.t, d: ev.strike });
            if (ev.type === 'cond_tick') dmgEvents.push({ t: ev.t, d: ev.total });
        }
        dmgEvents.sort((a, b) => a.t - b.t);

        const interval = Math.max(50, Math.round(maxTime / 500));
        const n = Math.ceil(maxTime / interval) + 1;
        const dpsLine = [];
        let cum = 0, ei = 0;
        for (let i = 0; i < n; i++) {
            const t = i * interval;
            while (ei < dmgEvents.length && dmgEvents[ei].t <= t) { cum += dmgEvents[ei].d; ei++; }
            dpsLine.push({ t, v: t > 0 ? cum / (t / 1000) : 0 });
        }

        const STACK_CAPS = {
            Might: 25, Stability: 25, Vulnerability: 25,
            'Elemental Empowerment': 10, 'Empowering Auras': 5, 'Persisting Flames': 5,
        };
        const effectLines = {};
        let maxStacks = 0;
        for (const ct of allEffects) {
            if (!toggles[ct] || !INTENSITY_EFFECTS.has(ct)) continue;
            const stacks = allStacks.filter(s => s.cond === ct);
            const cap = STACK_CAPS[ct] || Infinity;
            const line = [];
            for (let i = 0; i < n; i++) {
                const t = i * interval;
                let cnt = 0;
                for (const s of stacks) { if (s.t <= t && s.expiresAt > t) cnt++; }
                cnt = Math.min(cnt, cap);
                line.push({ t, v: cnt });
                if (cnt > maxStacks) maxStacks = cnt;
            }
            effectLines[ct] = line;
        }

        ctx.clearRect(0, 0, cssW, cssH);
        ctx.fillStyle = '#0c0c14';
        ctx.fillRect(0, 0, cssW, cssH);

        ctx.strokeStyle = 'rgba(42,42,58,0.5)';
        ctx.lineWidth = 1;
        const yGridN = 5;
        const maxDps = Math.max(...dpsLine.map(d => d.v), 1);
        for (let i = 0; i <= yGridN; i++) {
            const y = pad.top + (ph / yGridN) * i;
            ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(cssW - pad.right, y); ctx.stroke();
            ctx.fillStyle = '#888899'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'right';
            ctx.fillText(Math.round(maxDps * (1 - i / yGridN)).toLocaleString(), pad.left - 5, y + 3);
        }

        if (maxStacks > 0) {
            const labelCount = Math.min(maxStacks, 6);
            for (let i = 0; i <= labelCount; i++) {
                const val = Math.round(maxStacks * i / labelCount);
                const y = pad.top + ph - (ph / maxStacks) * val;
                ctx.fillStyle = '#665566'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'left';
                ctx.fillText(val.toString(), cssW - pad.right + 5, y + 3);
            }
        }

        const xTicks = Math.min(10, Math.ceil(maxTime / 1000));
        for (let i = 0; i <= xTicks; i++) {
            const t = (maxTime / xTicks) * i;
            const x = pad.left + (pw / maxTime) * t;
            ctx.beginPath(); ctx.moveTo(x, pad.top + ph); ctx.lineTo(x, pad.top + ph + 5);
            ctx.strokeStyle = 'rgba(42,42,58,0.5)'; ctx.stroke();
            ctx.fillStyle = '#888899'; ctx.textAlign = 'center'; ctx.font = '10px Segoe UI';
            ctx.fillText((t / 1000).toFixed(1) + 's', x, pad.top + ph + 15);
        }

        if (toggles['dps'] !== false) {
            ctx.strokeStyle = '#44bb44'; ctx.lineWidth = 2; ctx.beginPath();
            for (let i = 0; i < dpsLine.length; i++) {
                const x = pad.left + (pw / maxTime) * dpsLine[i].t;
                const y = pad.top + ph - (ph / maxDps) * dpsLine[i].v;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        const LABEL_EFFECTS = new Set(['Elemental Empowerment', 'Empowering Auras', 'Persisting Flames']);
        for (const ct of allEffects) {
            if (!effectLines[ct]) continue;
            const col = EFFECT_COLORS[ct] || '#aaa';
            const line = effectLines[ct];
            ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.beginPath();
            for (let i = 0; i < line.length; i++) {
                const x = pad.left + (pw / maxTime) * line[i].t;
                const y = pad.top + ph - (ph / Math.max(maxStacks, 1)) * line[i].v;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke(); ctx.setLineDash([]);

            if (LABEL_EFFECTS.has(ct)) {
                ctx.font = 'bold 9px Segoe UI';
                ctx.textAlign = 'center';
                let prevVal = -1;
                for (let i = 0; i < line.length; i++) {
                    const v = line[i].v;
                    if (v === prevVal || v === 0) { prevVal = v; continue; }
                    const x = pad.left + (pw / maxTime) * line[i].t;
                    const y = pad.top + ph - (ph / Math.max(maxStacks, 1)) * v;
                    ctx.fillStyle = '#0c0c14';
                    ctx.fillRect(x - 6, y - 10, 12, 11);
                    ctx.fillStyle = col;
                    ctx.fillText(v.toString(), x, y - 1);
                    prevVal = v;
                }
            }
        }

        if (activeDurEffects.length > 0) {
            const barTop = pad.top + ph + 22;
            for (let di = 0; di < activeDurEffects.length; di++) {
                const ct = activeDurEffects[di];
                const col = EFFECT_COLORS[ct] || '#aaa';
                const stacks = allStacks.filter(s => s.cond === ct);
                const rowY = barTop + di * (barRowH + barGap);

                ctx.fillStyle = '#888899'; ctx.font = '9px Segoe UI'; ctx.textAlign = 'right';
                ctx.fillText(ct, pad.left - 4, rowY + barRowH - 1);

                for (let i = 0; i < n - 1; i++) {
                    const t = i * interval;
                    let active = false;
                    for (const s of stacks) { if (s.t <= t && s.expiresAt > t) { active = true; break; } }
                    if (!active) continue;
                    const x0 = pad.left + (pw / maxTime) * t;
                    const x1 = pad.left + (pw / maxTime) * Math.min((i + 1) * interval, maxTime);
                    ctx.fillStyle = col;
                    ctx.globalAlpha = 0.75;
                    ctx.fillRect(x0, rowY, x1 - x0 + 0.5, barRowH);
                    ctx.globalAlpha = 1;
                }
            }
        }

        ctx.fillStyle = '#888899'; ctx.font = 'bold 10px Segoe UI';
        ctx.textAlign = 'left'; ctx.fillText('DPS ▲', pad.left + 2, pad.top - 5);
        if (maxStacks > 0) {
            ctx.textAlign = 'right'; ctx.fillText('Stacks ▲', cssW - pad.right - 2, pad.top - 5);
        }
    }

    // ─── Rotation actions ───
    _getTargetHP() {
        const el = document.getElementById('target-hp');
        return el ? Math.max(0, parseInt(el.value) || 0) : 0;
    }

    _autoRun() {
        if (!this.sim || this.sim.rotation.length === 0) {
            this.sim.results = null;
            this._renderPalette();
            this._renderTimeline();
            document.getElementById('rotation-results').innerHTML = '';
            this._updateOptimizerVisibility(false);
            this._persistBuild();
            return;
        }
        const tgtHP = this._getTargetHP();
        this.sim.computeContributions(this.activeAttunement, this.secondaryAttunement, this.evokerElement, this.permaBoons, tgtHP);
        this._renderPalette();
        this._renderTimeline();
        this._renderResults();
        this._updateOptimizerVisibility(true);
        this._persistBuild();
    }

    _addToRotation(skillName, offset = null, gapFill = false) {
        if (!this.sim) return;
        if (offset !== null) {
            this.sim.addSkill({ name: skillName, offset });
        } else if (gapFill) {
            this.sim.addSkill({ name: skillName, gapFill: true });
        } else {
            this.sim.addSkill(skillName);
        }
        this._autoRun();
    }

    _removeFromRotation(idx) {
        if (!this.sim) return;
        this.sim.removeSkill(idx);
        this._autoRun();
    }

    _clearRotation() {
        if (!this.sim) return;
        this.sim.clearRotation();
        this._renderPalette();
        this._renderTimeline();
        document.getElementById('rotation-results').innerHTML = '';
    }

    // ─── Build persistence ───────────────────────────────────────────────────────

    _buildSnapshot() {
        const savedSkills = {};
        for (const [slot, skill] of Object.entries(this.selectedSkills)) {
            savedSkills[slot] = skill ? skill.name : null;
        }
        return {
            build: JSON.parse(JSON.stringify(this.build)),
            selectedSkills: savedSkills,
            activeAttunement: this.activeAttunement,
            secondaryAttunement: this.secondaryAttunement,
            evokerElement: this.evokerElement,
            permaBoons: JSON.parse(JSON.stringify(this.permaBoons)),
            rotation: this._serializeRotation(),
        };
    }

    _serializeRotation() {
        if (!this.sim) return [];
        return this.sim.rotation.map(item =>
            typeof item === 'string' ? item : { ...item }
        );
    }

    _deserializeRotation(items) {
        if (!this.sim || !Array.isArray(items)) return;
        this.sim.clearRotation();
        for (const item of items) {
            this.sim.addSkill(item);
        }
    }

    _applySnapshot(state) {
        if (state.build) this.build = state.build;
        if (state.activeAttunement) this.activeAttunement = state.activeAttunement;
        if (state.secondaryAttunement) this.secondaryAttunement = state.secondaryAttunement;
        if ('evokerElement' in state) this.evokerElement = state.evokerElement;
        if (state.permaBoons && Object.keys(state.permaBoons).length > 0) this.permaBoons = state.permaBoons;
        if (state.selectedSkills && this.data?.skills) {
            this.selectedSkills = { heal: null, util1: null, util2: null, util3: null, elite: null };
            for (const [slot, name] of Object.entries(state.selectedSkills)) {
                if (name) {
                    const sk = this.data.skills.find(s => s.name === name);
                    if (sk) this.selectedSkills[slot] = sk;
                }
            }
        }
        if (state.rotation) {
            if (this.sim) {
                this._deserializeRotation(state.rotation);
            } else {
                this._pendingRotation = state.rotation;
            }
        }
    }

    _persistBuild() {
        try {
            localStorage.setItem('gw2dps_build', JSON.stringify(this._buildSnapshot()));
        } catch (_) { /* localStorage unavailable */ }
    }

    _restoreBuild() {
        try {
            const raw = localStorage.getItem('gw2dps_build');
            if (!raw) return;
            this._applySnapshot(JSON.parse(raw));
        } catch (_) { /* corrupt or missing */ }
    }

    _exportBuild() {
        const json = JSON.stringify(this._buildSnapshot(), null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gw2-build.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ─── Presets ─────────────────────────────────────────────────────────────

    async _loadPresets() {
        try {
            const res = await fetch(`Builds/manifest.json?t=${Date.now()}`);
            if (!res.ok) return;
            const presets = await res.json();
            if (!Array.isArray(presets) || presets.length === 0) return;

            const bar  = document.getElementById('presets-bar');
            const btns = document.getElementById('presets-btns');
            btns.innerHTML = presets.map((p, i) =>
                `<button class="btn preset-btn" data-idx="${i}">${esc(p.label)}</button>`
            ).join('');

            btns.addEventListener('click', e => {
                const btn = e.target.closest('.preset-btn');
                if (!btn) return;
                this._loadPreset(presets[+btn.dataset.idx], btn);
            });

            bar.style.display = '';
        } catch (_) { /* silently skip if no manifest */ }
    }

    async _loadPreset(preset, btn) {
        if (btn) { btn.disabled = true; btn.textContent = 'Loading…'; }
        try {
            const buildRes = await fetch(`${preset.build}?t=${Date.now()}`);
            if (!buildRes.ok) throw new Error(`Could not load ${preset.build}`);
            const buildData = await buildRes.json();
            this._applySnapshot(buildData);

            if (preset.rotation) {
                const rotRes = await fetch(`${preset.rotation}?t=${Date.now()}`);
                if (rotRes.ok) {
                    const rotData = await rotRes.json();
                    const items = Array.isArray(rotData) ? rotData : rotData.rotation;
                    if (Array.isArray(items)) this._deserializeRotation(items);
                }
            }

            this._onBuildChange();
            this.render();
        } catch (err) {
            alert('Failed to load preset: ' + err.message);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = preset.label; }
        }
    }

    _importBuild(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const state = JSON.parse(e.target.result);
                this._applySnapshot(state);
                this._onBuildChange();
                this.render();
            } catch (err) {
                alert('Failed to load build file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    _exportRotation() {
        const payload = { rotation: this._serializeRotation() };
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'gw2-rotation.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    _importRotation(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                // Accept either { rotation: [...] } or a bare array
                const items = Array.isArray(parsed) ? parsed : parsed.rotation;
                if (!Array.isArray(items)) throw new Error('No rotation array found in file.');
                this._deserializeRotation(items);
                this._autoRun();
                this.render();
            } catch (err) {
                alert('Failed to load rotation file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    // ─── Gear Optimizer ──────────────────────────────────────────────────────

    _initOptimizer() {
        this._optimizer = new GearOptimizer({
            skills:    this.data.skills,
            skillHits: this.data.skillHits,
            weapons:   WEAPON_DATA,
            sigils:    SIGIL_DATA,
            relics:    RELIC_DATA,
        });
        this._optResults = [];
        this._optRunning = false;
        this._populateOptimizerCheckboxes();
        this._bindOptimizerEvents();
    }

    _updateOptimizerVisibility(show) {
        const sec = document.getElementById('optimizer-section');
        if (!sec) return;
        if (show) {
            sec.classList.remove('hidden');
        } else {
            sec.classList.add('hidden');
            // Cancel any running optimization when rotation is cleared.
            if (this._optRunning && this._optimizer) this._optimizer.cancel();
        }
    }

    _populateOptimizerCheckboxes() {
        const b = this.build;

        const makeGrid = (containerId, items, group, currentVals) => {
            const el = document.getElementById(containerId);
            if (!el) return;
            el.innerHTML = items.map(name => {
                const checked = currentVals.includes(name) ? ' checked' : '';
                const short   = name.length > 28 ? name.slice(0, 27) + '…' : name;
                return `<label title="${esc(name)}">
                    <input type="checkbox" data-group="${group}" value="${esc(name)}"${checked}>
                    ${esc(short)}
                </label>`;
            }).join('');
        };

        const makeConsumableGrid = (containerId, items, group, currentVals, descFn) => {
            const el = document.getElementById(containerId);
            if (!el) return;
            el.innerHTML = items.map(name => {
                const checked = currentVals.includes(name) ? ' checked' : '';
                const short   = name.length > 28 ? name.slice(0, 27) + '…' : name;
                const desc    = descFn(name);
                return `<label class="consumable-label" title="${esc(name)}">
                    <input type="checkbox" data-group="${group}" value="${esc(name)}"${checked}>
                    <span class="opt-consumable-name">${esc(short)}</span>${desc ? `<span class="opt-consumable-desc">${esc(desc)}</span>` : ''}
                </label>`;
            }).join('');
        };

        // Pre-check the build's current choices as sensible defaults.
        const curPrefix = Object.values(b.gear || {})[0] || PREFIXES[0];
        makeGrid('opt-prefixes',  PREFIXES,     'prefix',   [curPrefix, "Assassin's"].filter(p => PREFIXES.includes(p)));
        makeGrid('opt-runes',     RUNE_NAMES,   'rune',     [b.rune].filter(Boolean));
        makeGrid('opt-sigils',    SIGIL_NAMES,  'sigil',    (b.sigils || []).filter(Boolean));
        makeGrid('opt-relics',    RELIC_NAMES,  'relic',    [b.relic].filter(Boolean));
        makeConsumableGrid('opt-food',     FOOD_NAMES,    'food',    [b.food].filter(Boolean),    _foodDesc);
        makeConsumableGrid('opt-utility',  UTILITY_NAMES, 'utility', [b.utility].filter(Boolean), _utilityDesc);

        // Infusions — stat type checkboxes + total count input.
        const infEl = document.getElementById('opt-infusions');
        if (infEl) {
            const usedStats = new Set((b.infusions || []).filter(x => x.count > 0).map(x => x.stat));
            infEl.innerHTML = INFUSION_STATS.map(stat => {
                const checked = usedStats.has(stat) ? ' checked' : '';
                return `<label title="${esc(stat)}">
                    <input type="checkbox" data-group="infusion" value="${esc(stat)}"${checked}>
                    ${esc(stat)}
                </label>`;
            }).join('');
        }
        // Pre-fill total with current build's infusion count.
        const curInfTotal = (b.infusions || []).reduce((s, x) => s + (x.count || 0), 0);
        const infTotalEl = document.getElementById('opt-inf-total');
        if (infTotalEl && curInfTotal > 0) infTotalEl.value = curInfTotal;

        this._enforcePrefixMax();
        this._populateSlotConstraints();
    }

    _populateSlotConstraints() {
        const container = document.getElementById('opt-slot-constraints');
        if (!container) return;
        const SLOT_LABELS = {
            Helm: 'Helm', Shoulders: 'Shld', Chest: 'Coat', Gloves: 'Glov',
            Leggins: 'Legs', Boots: 'Boot', Amulet: 'Amul', Ring1: 'Rng1',
            Ring2: 'Rng2', Accessory1: 'Acc1', Accessory2: 'Acc2', Back: 'Back',
            Weapon1: 'Wep1', Weapon2: 'Wep2', Weapon2H: 'Wep(2H)',
        };
        const activeSlots = getActiveGearSlots(this.build.weapons, WEAPON_DATA);
        const checked = this._getChecked('opt-prefixes');
        container.innerHTML = activeSlots.map(slot => {
            const label = SLOT_LABELS[slot] || slot;
            const opts  = checked.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
            return `<div class="opt-slot-constraint">
                <label>${esc(label)}</label>
                <select data-slot="${esc(slot)}">
                    <option value="">Any</option>
                    ${opts}
                </select>
            </div>`;
        }).join('');
    }

    _readSlotConstraints() {
        const out = {};
        document.querySelectorAll('#opt-slot-constraints select').forEach(sel => {
            if (sel.value) out[sel.dataset.slot] = sel.value;
        });
        return out;
    }

    _getActiveSlots() {
        return getActiveGearSlots(this.build.weapons, WEAPON_DATA);
    }

    _bindOptimizerEvents() {
        const groupContainerId = g => ({
            prefix: 'opt-prefixes', rune: 'opt-runes', sigil: 'opt-sigils',
            relic: 'opt-relics', food: 'opt-food', utility: 'opt-utility',
            infusion: 'opt-infusions',
        }[g]);

        // Select-all / deselect-all buttons
        document.querySelectorAll('.opt-selall').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = groupContainerId(btn.dataset.group);
                if (id) document.querySelectorAll(`#${id} input`).forEach(cb => { cb.checked = true; });
                if (btn.dataset.group === 'prefix') this._enforcePrefixMax();
            });
        });
        document.querySelectorAll('.opt-deselall').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = groupContainerId(btn.dataset.group);
                if (id) document.querySelectorAll(`#${id} input`).forEach(cb => { cb.checked = false; });
            });
        });

        // Prefix max-3 enforcement + refresh slot constraint dropdowns
        document.getElementById('opt-prefixes')?.addEventListener('change', () => {
            this._enforcePrefixMax();
            this._populateSlotConstraints();
        });

        // Run button
        document.getElementById('btn-opt-run')?.addEventListener('click', () => this._runOptimizer());

        // Cancel button
        document.getElementById('btn-opt-cancel')?.addEventListener('click', () => {
            if (this._optimizer) this._optimizer.cancel();
        });

        // Export button
        document.getElementById('btn-opt-export')?.addEventListener('click', () => this._exportOptimizerResults());
    }

    _enforcePrefixMax() {
        const checked = [...document.querySelectorAll('#opt-prefixes input:checked')];
        const MAX = 3;
        document.querySelectorAll('#opt-prefixes label').forEach(lbl => {
            const cb = lbl.querySelector('input');
            if (checked.length >= MAX && !cb.checked) {
                lbl.classList.add('opt-prefix-disabled');
                cb.disabled = true;
            } else {
                lbl.classList.remove('opt-prefix-disabled');
                cb.disabled = false;
            }
        });
    }

    _getChecked(containerId) {
        return [...document.querySelectorAll(`#${containerId} input:checked`)].map(cb => cb.value);
    }

    // C(total + k - 1, k - 1) — number of ways to distribute `total` among `k` bins.
    _infusionComboCount(k, total) {
        if (k <= 1) return 1;
        // C(n, r) with n = total+k-1, r = k-1
        const n = total + k - 1, r = k - 1;
        let result = 1;
        for (let i = 0; i < r; i++) result = result * (n - i) / (i + 1);
        return Math.round(result);
    }

    async _runOptimizer() {
        if (this._optRunning) return;

        const infusionStats = this._getChecked('opt-infusions');
        const infusionTotal = Math.max(0, Math.min(18,
            parseInt(document.getElementById('opt-inf-total')?.value ?? '18') || 0));

        const space = {
            prefixes:      this._getChecked('opt-prefixes'),
            runes:         this._getChecked('opt-runes'),
            sigils:        this._getChecked('opt-sigils'),
            relics:        this._getChecked('opt-relics'),
            foods:         this._getChecked('opt-food'),
            utilities:     this._getChecked('opt-utility'),
            infusionStats,
            infusionTotal,
        };

        const _parseConstraint = id => {
            const v = parseFloat(document.getElementById(id)?.value);
            return isNaN(v) ? null : v;
        };
        const constraints = {
            minBoonDuration: _parseConstraint('opt-min-boon-dur'),
            minCritChance:   _parseConstraint('opt-min-crit'),
            minToughness:    _parseConstraint('opt-min-tough'),
            minVitality:     _parseConstraint('opt-min-vit'),
        };

        const slotConstraints = this._readSlotConstraints();

        if (!space.prefixes.length) { alert('Select at least one gear prefix.'); return; }

        // Combo count estimate for user feedback.
        // Sigil pairs: n*(n-1)/2 (no duplicates). Infusion distributions: C(total+k-1, k-1) where k=stats.
        const n = space.sigils.length;
        const sigilPairs = n < 2 ? 1 : (n * (n - 1)) / 2;
        const k = infusionStats.length;
        const infCombos = k === 0 ? 1 : this._infusionComboCount(k, infusionTotal);
        const combos = Math.max(space.runes.length, 1) * Math.max(space.relics.length, 1)
            * sigilPairs * Math.max(space.foods.length, 1) * Math.max(space.utilities.length, 1)
            * infCombos;

        this._optRunning = true;
        const runBtn    = document.getElementById('btn-opt-run');
        const cancelBtn = document.getElementById('btn-opt-cancel');
        const progWrap  = document.getElementById('opt-progress-wrap');
        const progFill  = document.getElementById('opt-progress-fill');
        const progLabel = document.getElementById('opt-progress-label');
        const exportBtn = document.getElementById('btn-opt-export');
        const resultsEl = document.getElementById('opt-results');

        runBtn.disabled = true;
        cancelBtn.classList.remove('hidden');
        progWrap.classList.remove('hidden');
        exportBtn.classList.add('hidden');
        if (resultsEl) resultsEl.classList.add('hidden');

        try {
            const results = await this._optimizer.optimize(
                {
                    build:          JSON.parse(JSON.stringify(this.build)),
                    selectedSkills: Object.values(this.selectedSkills).filter(Boolean),
                    rotation:       this.sim.rotation,
                    space,
                    constraints,
                    slotConstraints,
                    startAtt:       this.activeAttunement,
                    startAtt2:      this.secondaryAttunement,
                    evokerElement:  this.evokerElement,
                    permaBoons:     this.permaBoons,
                    targetHP:       this._getTargetHP(),
                },
                (done, total, top10, statusMsg) => {
                    const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0;
                    progFill.style.width  = pct.toFixed(1) + '%';
                    progLabel.textContent = statusMsg
                        ? statusMsg
                        : `${done.toLocaleString()} / ~${total.toLocaleString()} evals (${pct.toFixed(0)}%)`;
                    this._renderOptimizerResults(top10);
                }
            );

            this._optResults = results;
            progFill.style.width = '100%';
            progLabel.textContent = `Done — ${results.length} unique builds found`;
            this._renderOptimizerResults(results);
            if (results.length) {
                exportBtn.classList.remove('hidden');
                if (resultsEl) resultsEl.classList.remove('hidden');
            }
        } catch (err) {
            progLabel.textContent = 'Error: ' + err.message;
        } finally {
            this._optRunning = false;
            runBtn.disabled = false;
            cancelBtn.classList.add('hidden');
        }
    }

    _renderOptimizerResults(results) {
        const body   = document.getElementById('opt-results-body');
        const wrap   = document.getElementById('opt-results');
        if (!body || !results.length) return;

        const PFX_ABBR = {
            "Berserker's": 'Bers', "Assassin's": 'Assn', "Harrier's": 'Harr',
            "Viper's": 'Vipr', "Sinister's": 'Sins', "Grieving": 'Grvg',
            "Ritualist's": 'Ritu', "Celestial": 'Cele', "Diviner's": 'Divn',
            "Dragon's": 'Drag', "Marshal's": 'Mrsh', "Plaguedoctor's": 'PlgD',
            "Trailblazer's": 'Trbl', "Seraph's": 'Sera', "Minstrel's": 'Mnst',
        };
        const PFX_CSS = {
            "Berserker's": 'pfx-berserker', "Assassin's": 'pfx-assassin',
            "Harrier's": 'pfx-harrier', "Viper's": 'pfx-viper',
            "Sinister's": 'pfx-sinister', "Grieving": 'pfx-grieving',
            "Ritualist's": 'pfx-ritualist', "Celestial": 'pfx-celestial',
            "Diviner's": 'pfx-diviner', "Dragon's": 'pfx-dragon',
            "Marshal's": 'pfx-marshal', "Plaguedoctor's": 'pfx-plaguedoctor',
            "Trailblazer's": 'pfx-trailblazer', "Seraph's": 'pfx-seraph',
            "Minstrel's": 'pfx-minstrel',
        };

        const slotBadge = (prefix) => {
            const abbr = PFX_ABBR[prefix] || prefix?.slice(0, 4) || '?';
            const cls  = PFX_CSS[prefix] || 'pfx-default';
            return `<span class="opt-slot-badge ${cls}" title="${esc(prefix || '')}">${esc(abbr)}</span>`;
        };

        const shortName = (s) => {
            if (!s) return '—';
            const trimmed = s.replace(/^Bowl of |^Plate of |^Superior |^Furious |^Toxic |^Potent /i, '');
            return trimmed.length > 14 ? trimmed.slice(0, 13) + '…' : trimmed;
        };
        const infLabel = (infusions) => {
            if (!infusions?.length) return '—';
            return infusions.map(x => `${x.count}×${x.stat.slice(0, 3)}`).join('+');
        };

        body.innerHTML = results.map((r, i) => {
            const sigilStr = [r.sigil1, r.sigil2].filter(Boolean).join('+') || '—';
            const dpsStr   = r.dps > 0 ? Math.round(r.dps).toLocaleString() : (r.rawDps > 0 ? Math.round(r.rawDps).toLocaleString() + '*' : '—');

            const is2H = TH_WEAPONS.has(this.build.weapons?.[0] || '');
            const slotCells = GEAR_SLOTS.map(slot => {
                if (is2H && slot === 'Weapon2') return '<span class="opt-slot-badge pfx-default">—</span>';
                return slotBadge(r.gear[slot]);
            }).join('');

            return `<div class="opt-result-row" data-idx="${i}">
                <span class="opt-rank">${i + 1}</span>
                <span class="opt-dps">${dpsStr}</span>
                ${slotCells}
                <span class="opt-cell" title="${esc(r.rune || '')}">${esc(shortName(r.rune))}</span>
                <span class="opt-cell" title="${esc(r.relic || '')}">${esc(shortName(r.relic))}</span>
                <span class="opt-cell" title="${esc(sigilStr)}">${esc(sigilStr)}</span>
                <span class="opt-cell" title="${esc(r.food || '')}">${esc(shortName(r.food))}</span>
                <span class="opt-cell" title="${esc(r.utility || '')}">${esc(shortName(r.utility))}</span>
                <span class="opt-cell" title="${esc(infLabel(r.infusions))}">${esc(infLabel(r.infusions))}</span>
                <button class="opt-apply-btn" data-idx="${i}">Apply</button>
            </div>`;
        }).join('');

        wrap.classList.remove('hidden');

        body.querySelectorAll('.opt-apply-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                this._applyOptimizerResult(this._optResults[idx]);
            });
        });
    }

    _applyOptimizerResult(r) {
        if (!r) return;
        this.build.gear = { ...r.gear };
        if (r.rune)      this.build.rune      = r.rune;
        if (r.relic)     this.build.relic     = r.relic;
        if (r.sigil1)    this.build.sigils    = [r.sigil1, r.sigil2].filter(Boolean);
        if (r.food)      this.build.food      = r.food;
        if (r.utility)   this.build.utility   = r.utility;
        if (r.infusions) this.build.infusions = r.infusions.map(x => ({ ...x }));
        this._onBuildChange();
        this.renderGear();
    }

    _exportOptimizerResults() {
        if (!this._optResults?.length) return;
        const data = this._optResults.map((r, i) => ({
            rank:      i + 1,
            dps:       Math.round(r.dps),
            gear:      r.gear,
            rune:      r.rune      || null,
            relic:     r.relic     || null,
            sigils:    [r.sigil1, r.sigil2].filter(Boolean),
            food:      r.food      || null,
            utility:   r.utility   || null,
            infusions: r.infusions || null,
        }));
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'gw2-optimized-builds.json';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    }

}

window.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
