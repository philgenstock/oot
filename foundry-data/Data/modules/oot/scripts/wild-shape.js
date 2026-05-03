const PLAYER_NAME = "Kalle";

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
    return {
      loading: this._beasts === null,
      beasts: this._beasts ?? [],
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

  async _onSelectBeast(event) {
    const { pack: packId, id } = event.currentTarget.dataset;
    const actor = this._actor;
    if (!actor) {
      ui.notifications.warn("No character assigned.");
      return;
    }

    const pack = game.packs.get(packId);
    if (!pack) return;

    let beast;
    try {
      beast = await pack.getDocument(id);
    } catch (e) {
      ui.notifications.error("Could not load beast from compendium.");
      return;
    }

    try {
      await actor.transformInto(beast, { wildShape: true });
      this.close();
    } catch (e) {
      ui.notifications.error(`Wild Shape failed: ${e.message}`);
    }
  }
}

// ---- Helpers ----

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

      beasts.push({
        pack: pack.collection,
        id: entry._id,
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
  return beasts
    .filter(b => { if (seen.has(b.name)) return false; seen.add(b.name); return true; })
    .sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name));
}

function _open() {
  const existing = Object.values(ui.windows).find(w => w instanceof WildShapeApplication);
  if (existing) { existing.bringToTop(); existing.render(true); }
  else new WildShapeApplication().render(true);
}

// ---- Init ----

export function initWildShape() {
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
