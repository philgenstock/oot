const PLAYER_NAME = "Joshi";

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
    return {
      creatures: game.actors.filter(a => a.type === "npc").map(a => ({
        name: a.name,
        img: a.img,
        hp: a.system.attributes.hp.max,
        ac: a.system.attributes.ac.value,
        resistances: [...(a.system.traits.dr.value ?? [])].join(", ") || "—",
        immunities: [...(a.system.traits.di.value ?? [])].join(", ") || "—"
      }))
    };
  }
}

export function initCreatureLedger() {
  Hooks.on("getSceneControlButtons", (controls) => {
    if (game.user.name !== PLAYER_NAME && !game.user.isGM) return;
    const tokenControls = controls.tokens || controls.token;
    if (tokenControls?.tools) {
      tokenControls.tools["oot-creature-ledger"] = {
        name: "oot-creature-ledger",
        title: "Creature Ledger",
        icon: "fas fa-book-skull",
        button: true,
        onClick: () => {
          const existing = Object.values(ui.windows).find(w => w instanceof CreatureLedger);
          if (existing) { existing.bringToTop(); existing.render(true); }
          else new CreatureLedger().render(true);
        }
      };
    }
  });
}
