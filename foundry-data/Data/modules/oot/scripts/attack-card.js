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
  section.querySelectorAll(".dice-roll").forEach(el =>
    el.addEventListener("click", message._onClickDiceRoll.bind(message)));

  const content = html.querySelector(".message-content");
  const anchor = content?.querySelector(".dice-roll");
  if (anchor) anchor.after(section);
  else content?.append(section);
}
