// Kagebunshin no Jutsu (Kusan): shadow clones that can't be told apart from the real one.
//   - Smoke ring around the caster and a puff on each clone when they appear (Sequencer + JB2A, optional).
//   - Clones mirror the summoner's current/max/temp HP, so Health Estimate shows the same state for all of them.
//     Clones only change when the summoner does, so a clone below the summoner's HP was hit: it vanishes in smoke.
//   - During the summoner's turn the core turn marker spins under every clone as well.
// Clones are recognised by dnd5e's summon flag pointing at an item named "Kagebunshin no Jutsu".

const JUTSU = "kagebunshin-no-jutsu";
const RING = "jb2a.smoke.puff.ring.01.white";
const PUFF = "jb2a.smoke.puff.centered.grey";

const slug = name => String(name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const hasSequencer = () => !!game.modules.get("sequencer")?.active;
const isPrimaryGM = () => !!game.users.activeGM?.isSelf;

/** The summoning actor of a Kagebunshin clone, or null. */
function summonerOf(actor) {
  const origin = actor?.getFlag?.("dnd5e", "summon")?.origin;
  const item = origin ? fromUuidSync(origin) : null;
  return slug(item?.name) === JUTSU ? item.actor : null;
}

const hpOf = actor => {
  const { value, max, temp } = actor.system.attributes.hp;
  return { value, max, temp: temp ?? 0 };
};

function clonesOf(summoner) {
  return game.scenes.contents.flatMap(scene => scene.tokens.filter(t => summonerOf(t.actor)?.id === summoner.id));
}

function syncHp(cloneToken, summoner) {
  const { value, max, temp } = hpOf(summoner);
  return cloneToken.actor.update({
    "system.attributes.hp.value": value, "system.attributes.hp.max": max, "system.attributes.hp.temp": temp
  });
}

async function pop(cloneToken) {
  if (hasSequencer() && cloneToken.parent?.isView) {
    const size = cloneToken.parent.grid.size;
    const center = { x: cloneToken.x + (cloneToken.width * size) / 2, y: cloneToken.y + (cloneToken.height * size) / 2 };
    new Sequence().effect().file(PUFF).atLocation(center).size(size * 1.8).randomRotation().play();
  }
  await cloneToken.delete();
}

function refreshCloneMarkers() {
  if (!canvas.ready) return;
  for (const token of canvas.tokens.placeables) {
    if (summonerOf(token.actor)) token.renderFlags.set({ refreshTurnMarker: true });
  }
}

// Same logic as core Token#_refreshTurnMarker (Foundry 14.363), except a clone treats its summoner's turn as its own.
function patchTurnMarker() {
  const Token = foundry.canvas.placeables.Token;
  const original = Token.prototype._refreshTurnMarker;
  Token.prototype._refreshTurnMarker = function () {
    const summoner = summonerOf(this.actor);
    if (!summoner || game.combat?.combatant?.actorId !== summoner.id) return original.call(this);
    const enabled = CONFIG.Combat.settings.turnMarker.enabled
      && this.document.turnMarker.mode !== CONST.TOKEN_TURN_MARKER_MODES.DISABLED;
    if (enabled) {
      if (!this.turnMarker) this.turnMarker = this.addChildAt(new foundry.canvas.placeables.tokens.TokenTurnMarker(this), 0);
      canvas.tokens.turnMarkers.add(this);
      this.turnMarker.draw();
    } else if (this.turnMarker) {
      canvas.tokens.turnMarkers.delete(this);
      this.turnMarker.destroy();
      this.turnMarker = null;
    }
  };
}

export function initKagebunshin() {
  patchTurnMarker();

  Hooks.on("dnd5e.postSummon", (activity, _profile, tokens) => {
    if (slug(activity?.item?.name) !== JUTSU || !hasSequencer()) return;
    const caster = activity.actor?.getActiveTokens()?.[0];
    const seq = new Sequence();
    if (caster) seq.effect().file(RING).atLocation(caster).scaleToObject(2.5);
    for (const token of tokens ?? []) seq.effect().file(PUFF).atLocation(token).scaleToObject(1.8).randomRotation();
    seq.play();
  });

  Hooks.on("createToken", tokenDoc => {
    if (!isPrimaryGM()) return;
    const summoner = summonerOf(tokenDoc.actor);
    if (summoner) syncHp(tokenDoc, summoner);
  });

  Hooks.on("updateActor", (actor, changes) => {
    if (!isPrimaryGM() || !foundry.utils.hasProperty(changes, "system.attributes.hp")) return;
    const summoner = summonerOf(actor);
    if (summoner) {
      const total = hp => hp.value + hp.temp;
      if (actor.token && total(hpOf(actor)) < total(hpOf(summoner))) pop(actor.token);
      return;
    }
    if (actor.items?.some(i => slug(i.name) === JUTSU)) for (const clone of clonesOf(actor)) syncHp(clone, actor);
  });

  for (const hook of ["updateCombat", "combatStart", "deleteCombat"]) Hooks.on(hook, refreshCloneMarkers);
}
