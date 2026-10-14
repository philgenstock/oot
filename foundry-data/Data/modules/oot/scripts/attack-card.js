const SETTING_AUTO_DAMAGE = "autoRollDamage";
const SETTING_REPLACE_CARD = "replaceItemCard";
const FLAG_DAMAGE = "damage";

export function initAttackCard() {
  game.settings.register("oot", SETTING_AUTO_DAMAGE, {
    name: "Auto-roll damage with attacks",
    hint: "When you make a weapon or spell attack, roll damage immediately and show it on the same chat card.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register("oot", SETTING_REPLACE_CARD, {
    name: "Replace item card with attack card",
    hint: "Delete the original item chat card once the attack and damage have been rolled from it.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  Hooks.on("dnd5e.preRollDamageV2", _applyRadiantSoul);
  Hooks.on("dnd5e.postRollAttack", _onPostRollAttack);
  Hooks.on("dnd5e.renderChatMessage", _onRenderChatMessage);
}

async function _onPostRollAttack(rolls, { subject: activity }) {
  if (!game.settings.get("oot", SETTING_AUTO_DAMAGE)) return;

  const attackRoll = rolls?.[0];
  const message = attackRoll?.parent;
  if (!activity || !message?.isAuthor) return;
  if (!activity.damage?.parts?.length) return;

  try {
    const options = attackRoll.options ?? {};
    const ammunition = options.ammunition ? activity.actor?.items.get(options.ammunition) : undefined;

    const damageRolls = await activity.rollDamage(
      { isCritical: attackRoll.isCritical, attackMode: options.attackMode, ammunition },
      { configure: false },
      { create: false }
    );
    if (!damageRolls?.length) return;

    const extra = await _rollPrimalStrike(activity, attackRoll);
    if (extra) damageRolls.push(extra);

    if (game.dice3d) {
      for (const roll of damageRolls) game.dice3d.showForRoll(roll, game.user, true);
    }

    await message.setFlag("oot", FLAG_DAMAGE, {
      rolls: damageRolls.map(r => r.toJSON()),
      critical: !!attackRoll.isCritical
    });

    if (game.settings.get("oot", SETTING_REPLACE_CARD)) {
      const original = game.messages.get(message.getFlag("dnd5e", "originatingMessage"));
      if (original?.isOwner) await original.delete();
    }
  } catch (e) {
    console.error("OOT | Auto damage roll failed", e);
  }
}

// ponytail: "once per turn" is tracked per combat round, not per combatant. Null outside combat (no limit).
function _turnKey() {
  const combat = game.combat?.started ? game.combat : null;
  return combat ? `${combat.id}:${combat.round}` : null;
}

// Blood Hunter (Order of the Profane Soul) Radiant Soul: a spell that deals Radiant or Fire
// damage gets + Wis mod on one damage roll. No per-turn limit.
function _applyRadiantSoul(config) {
  const activity = config.subject;
  const actor = activity?.actor;
  if (activity?.item?.type !== "spell" || !actor) return;
  if (!actor.items.some(i => i.system.identifier === "radiant-soul")) return;

  const roll = config.rolls?.find(r => ["radiant", "fire"].includes(r.options?.type));
  const wis = actor.system.abilities?.wis?.mod;
  if (!roll || !wis) return;

  roll.parts.push(`${wis}[Radiant Soul]`);
}

// Druid 7 Elemental Fury (Primal Strike): once per turn, a weapon or Beast form
// hit deals an extra 1d8 Cold/Fire/Lightning/Thunder (2d8 at druid 15).
async function _rollPrimalStrike(activity, attackRoll) {
  const actor = activity.actor;
  if (activity.item.type !== "weapon" || !actor) return null;

  const original = game.actors.get(actor.getFlag("dnd5e", "originalActor"));
  const druidLevel = Math.max(actor.classes?.druid?.system?.levels ?? 0, original?.classes?.druid?.system?.levels ?? 0);
  if (druidLevel < 7) return null;

  // Miss against a known target AC: no strike (a natural 20 always hits)
  if (attackRoll.isFailure && !attackRoll.isCritical) return null;

  const turnKey = _turnKey();
  if (turnKey && actor.getFlag("oot", "primalStrike") === turnKey) return null;

  const choices = ["cold", "fire", "lightning", "thunder"];
  const type = await foundry.applications.api.DialogV2.wait({
    window: { title: "Primal Strike", icon: "fa-solid fa-bolt" },
    content: "<p>Add Primal Strike damage to this hit?</p>",
    buttons: [
      ...choices.map(action => ({ action, label: CONFIG.DND5E.damageTypes[action].label })),
      { action: "skip", label: "Skip" }
    ],
    rejectClose: false
  });
  if (!choices.includes(type)) return null;

  if (turnKey) await actor.setFlag("oot", "primalStrike", turnKey);

  const roll = new CONFIG.Dice.DamageRoll(`${druidLevel >= 15 ? 2 : 1}d8`, {}, {
    type,
    isCritical: attackRoll.isCritical,
    critical: {
      multiplyNumeric: game.settings.get("dnd5e", "criticalDamageModifiers"),
      powerfulCritical: game.settings.get("dnd5e", "criticalDamageMaxDice")
    }
  });
  await roll.evaluate();
  return roll;
}

function _onRenderChatMessage(message, html) {
  const data = message.getFlag("oot", FLAG_DAMAGE);
  if (!data?.rolls?.length || !message.isContentVisible) return;

  const rolls = data.rolls.map(r => Roll.fromData(r));

  // Reuse dnd5e's own damage block (formula, total, breakdown tooltip and the
  // <damage-application> apply/multiplier tray) by letting it render into a
  // detached container, then move the result onto this card.
  const scratch = document.createElement("div");
  scratch.innerHTML = '<div class="message-content"></div>';
  message._enrichDamageTooltip(rolls, scratch);
  const parts = [...scratch.querySelector(".message-content").children];
  if (!parts.length) return;

  const section = document.createElement("div");
  section.classList.add("oot-damage-card");
  if (data.critical) section.classList.add("critical");
  section.append(...parts);
  section.querySelector("damage-application")?.setAttribute("open", "");
  section.querySelectorAll(".dice-roll").forEach(el =>
    el.addEventListener("click", message._onClickDiceRoll.bind(message)));

  const content = html.querySelector(".message-content");
  const anchor = content?.querySelector(".dice-roll");
  if (anchor) anchor.after(section);
  else content?.append(section);
}
