const PLAYER_NAME = "Joshi";
const SETTING_KEY = "discoveredCreatures";

let _prevDiscovered = null;

class CreatureLedger extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "creature-ledger",
      template: "modules/oot/templates/creature-ledger.hbs",
      title: "Creature Ledger",
      width: 480,
      height: 680,
      resizable: true,
      scrollY: [".creature-ledger-list"]
    });
  }

  getData() {
    const discoveredIds = new Set(game.settings.get("oot", SETTING_KEY));
    return {
      creatures: game.actors
        .filter(a => a.type === "npc" && discoveredIds.has(a.id))
        .map(a => ({
          id: a.id,
          name: a.prototypeToken.name,
          img: a.img,
          hp: a.system.attributes.hp.max,
          ac: a.system.attributes.ac.value,
          resistances: [...(a.system.traits.dr.value ?? [])].join(", ") || "—",
          immunities:  [...(a.system.traits.di.value ?? [])].join(", ") || "—"
        }))
    };
  }

  scrollTo(actorId) {
    const el = this.element.find(`[data-actor-id="${actorId}"]`)[0];
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function getDiscoveredIds() {
  return game.settings.get("oot", SETTING_KEY);
}

async function toggleDiscovery(actorId) {
  const ids = getDiscoveredIds();
  const newIds = ids.includes(actorId)
    ? ids.filter(id => id !== actorId)
    : [...ids, actorId];
  await game.settings.set("oot", SETTING_KEY, newIds);
}

function openAndScrollTo(actorId) {
  const existing = Object.values(ui.windows).find(w => w instanceof CreatureLedger);
  Hooks.once("renderCreatureLedger", app => app.scrollTo(actorId));
  if (existing) {
    existing.bringToTop();
    existing.render(true);
  } else {
    new CreatureLedger().render(true);
  }
}

function openCreatureLedger() {
  const existing = Object.values(ui.windows).find(w => w instanceof CreatureLedger);
  if (existing) { existing.bringToTop(); existing.render(true); }
  else new CreatureLedger().render(true);
}

export function initCreatureLedger() {
  game.settings.register("oot", SETTING_KEY, {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  Hooks.once("ready", () => {
    _prevDiscovered = new Set(getDiscoveredIds());
  });

  Hooks.on("getSceneControlButtons", (controls) => {
    if (game.user.name !== PLAYER_NAME && !game.user.isGM) return;
    const tokenControls = controls.tokens || controls.token;
    if (tokenControls?.tools) {
      tokenControls.tools["oot-creature-ledger"] = {
        name: "oot-creature-ledger",
        title: "Creature Ledger",
        icon: "fas fa-book-skull",
        button: true,
        onClick: () => openCreatureLedger()
      };
    }
  });

  Hooks.on("renderActorDirectory", (_app, html) => {
    if (!game.user.isGM) return;
    const discovered = new Set(getDiscoveredIds());
    $(html).find("li[data-entry-id]").each((_i, el) => {
      const actor = game.actors.get(el.dataset.entryId);
      if (!actor || actor.type !== "npc") return;

      const known = discovered.has(actor.id);
      const btn = $(
        `<a class="oot-discover-btn ${known ? "discovered" : ""}"
            title="${known ? "Remove from Ledger" : "Add to Ledger"}">
           <i class="fas fa-${known ? "eye" : "eye-slash"}"></i>
         </a>`
      );
      btn.on("click", async e => {
        e.preventDefault();
        e.stopPropagation();
        await toggleDiscovery(actor.id);
      });

      $(el).append(btn);
    });
  });

  Hooks.on("updateSetting", setting => {
    if (setting.key !== `oot.${SETTING_KEY}`) return;

    const next = new Set(setting.value);
    const added = [...next].filter(id => !_prevDiscovered?.has(id));
    _prevDiscovered = next;

    if (game.user.isGM) ui.actors?.render(false);

    if (game.user.name === PLAYER_NAME && added.length > 0) {
      openAndScrollTo(added[0]);
      return;
    }

    for (const win of Object.values(ui.windows)) {
      if (win instanceof CreatureLedger) win.render(false);
    }
  });
}
