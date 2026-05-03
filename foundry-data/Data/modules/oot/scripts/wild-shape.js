import { requestWildShape } from './socket.js';

const PLAYER_NAME = "Kalle";
const FAVORITES_KEY = "wildShapeFavorites";

const SIZE_LABELS = {
  tiny: "Tiny", sm: "Small", med: "Medium",
  lg: "Large", huge: "Huge", grg: "Gargantuan"
};

// ---- Application ----

class WildShapeApplication extends Application {
  constructor(options = {}) {
    super(options);
    this._beasts = null;
    this._loading = false;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "oot-wild-shape",
      title: "Wild Shape",
      template: "modules/oot/templates/wild-shape.hbs",
      classes: ["oot-wild-shape-window"],
      width: 380,
      height: 520,
      resizable: true,
      scrollY: [".wild-shape-list"]
    });
  }

  get _actor() {
    return game.user.character;
  }

  get _crCap() {
    const druidLevel = this._actor?.classes?.druid?.system?.levels ?? 0;
    return Math.max(1, Math.floor(druidLevel / 3));
  }

  getData() {
    const favorites = _getFavorites();
    const beasts = (this._beasts ?? [])
      .map(b => ({ ...b, starred: favorites.has(b.name) }))
      .sort((a, b) => {
        if (a.starred !== b.starred) return a.starred ? -1 : 1;
        return a.cr - b.cr || a.name.localeCompare(b.name);
      });

    return {
      loading: this._beasts === null,
      beasts,
      actorName: this._actor?.name ?? "",
      crCap: _formatCR(this._crCap)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    if (this._beasts === null && !this._loading) {
      this._loading = true;
      this._fetchAndRender();
    }

    html.find('.wild-shape-search').on('input', e => this._onSearch(e));
    html.find('.beast-star').on('click', e => { e.stopPropagation(); this._onToggleStar(e); });
    html.find('.beast-row').on('click', e => this._onSelectBeast(e));
  }

  async _fetchAndRender() {
    this._beasts = await _loadBeasts(this._crCap);
    this._loading = false;
    this.render(true);
  }

  _onSearch(event) {
    const query = event.target.value.toLowerCase();
    this.element.find('.beast-row').each((_, row) => {
      $(row).toggle(!query || row.dataset.name.toLowerCase().includes(query));
    });
  }

  async _onToggleStar(event) {
    const row = event.currentTarget.closest('.beast-row');
    const name = row.dataset.name;
    const favorites = _getFavorites();

    if (favorites.has(name)) {
      favorites.delete(name);
    } else {
      favorites.add(name);
    }
    await _saveFavorites(favorites);

    const isStarred = favorites.has(name);
    const icon = event.currentTarget.querySelector('i');
    icon.className = isStarred ? 'fas fa-star' : 'far fa-star';
    row.classList.toggle('starred', isStarred);

    // Re-sort rows in place without re-rendering
    const list = this.element.find('.wild-shape-list')[0];
    if (!list) return;
    const allFavorites = _getFavorites();
    [...list.querySelectorAll('.beast-row')]
      .sort((a, b) => {
        const aS = allFavorites.has(a.dataset.name) ? 0 : 1;
        const bS = allFavorites.has(b.dataset.name) ? 0 : 1;
        return aS - bS;
      })
      .forEach(r => list.appendChild(r));
  }

  async _onSelectBeast(event) {
    const { uuid } = event.currentTarget.dataset;
    const actor = this._actor;
    if (!actor) {
      ui.notifications.warn("No character assigned.");
      return;
    }

    this.element.find('.beast-row').css('pointer-events', 'none');
    try {
      await requestWildShape(actor.uuid, uuid);
      this.close();
    } catch (e) {
      ui.notifications.error(`Wild Shape failed: ${e.message}`);
      this.element.find('.beast-row').css('pointer-events', '');
    }
  }
}

// ---- Favorites helpers ----

function _getFavorites() {
  return new Set(game.settings.get("oot", FAVORITES_KEY) ?? []);
}

async function _saveFavorites(set) {
  await game.settings.set("oot", FAVORITES_KEY, [...set]);
}

// ---- Beast loading ----

function _formatCR(cr) {
  const fractions = { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" };
  return fractions[cr] ?? String(cr ?? 0);
}

async function _loadBeasts(crCap) {
  const beasts = [];

  for (const pack of game.packs) {
    if (pack.documentName !== "Actor") continue;

    const index = await pack.getIndex({ fields: [
      "system.details.cr",
      "system.details.type.value",
      "system.attributes.movement.fly",
      "system.attributes.movement.swim",
      "system.traits.size"
    ]});

    for (const entry of index) {
      if (entry.type !== "npc") continue;
      if (entry.system?.details?.type?.value !== "beast") continue;

      const cr = entry.system?.details?.cr ?? 0;
      if (cr > crCap) continue;
      if ((entry.system?.attributes?.movement?.fly ?? 0) > 0) continue;
      if ((entry.system?.attributes?.movement?.swim ?? 0) > 0) continue;

      // Construct UUID — index entries include .uuid in Foundry v11+
      const uuid = entry.uuid ?? `Compendium.${pack.collection}.Actor.${entry._id}`;

      beasts.push({
        uuid,
        name: entry.name,
        cr,
        crDisplay: _formatCR(cr),
        size: SIZE_LABELS[entry.system?.traits?.size] ?? "Medium",
        img: entry.img ?? "icons/svg/mystery-man.svg"
      });
    }
  }

  // Deduplicate by name (first compendium wins)
  const seen = new Set();
  return beasts.filter(b => {
    if (seen.has(b.name)) return false;
    seen.add(b.name);
    return true;
  });
}

// ---- Open helper ----

function _open() {
  const existing = Object.values(ui.windows).find(w => w instanceof WildShapeApplication);
  if (existing) { existing.bringToTop(); existing.render(true); }
  else new WildShapeApplication().render(true);
}

// ---- Init ----

export function initWildShape() {
  game.settings.register("oot", FAVORITES_KEY, {
    scope: "client",
    config: false,
    type: Array,
    default: []
  });

  Hooks.on("getSceneControlButtons", (controls) => {
    if (game.user.name !== PLAYER_NAME) return;
    const tokenControls = controls.tokens || controls.token;
    if (!tokenControls?.tools) return;
    tokenControls.tools["oot-wild-shape"] = {
      name: "oot-wild-shape",
      title: "Wild Shape",
      icon: "fas fa-paw",
      button: true,
      onClick: () => _open()
    };
  });
}
