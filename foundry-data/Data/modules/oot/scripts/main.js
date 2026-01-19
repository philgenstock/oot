import { CraftingApplication } from './crafting-app.js';

Hooks.on('getSceneControlButtons', (controls) => {
  const tokenControls = controls.tokens || controls.token;
  if (tokenControls && tokenControls.tools) {
    tokenControls.tools['oot-crafting'] = {
      name: "oot-crafting",
      title: "OOT Crafting",
      icon: "fas fa-hammer",
      button: true,
      onClick: () => new CraftingApplication().render(true)
    };
  }
});

Hooks.once('init', async function() {
  registerHandlebarsHelpers();

  game.oot = {
    CraftingApplication: CraftingApplication,
    openCrafting: () => new CraftingApplication().render(true),
    pendingChecks: {},
    handleCheckResult: handleCheckResult
  };

  game.keybindings.register("oot", "openCrafting", {
    name: "Open Crafting Window",
    hint: "Opens the OOT Crafting application",
    editable: [{ key: "KeyC", modifiers: ["Control", "Shift"] }],
    onDown: () => {
      game.oot.openCrafting();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  await loadTemplates([
    "modules/oot/templates/crafting-app.hbs",
    "modules/oot/templates/item-picker.hbs"
  ]);
});

Hooks.once('ready', async function() {
  console.log('OOT | Module ready');
});

Hooks.on('renderChatMessage', async function(message, html) {
  collapseDnd5eMessageByDefault(html);
  attachCraftingCheckButtonHandler(html, message);
});

function registerHandlebarsHelpers() {
  Handlebars.registerHelper('eq', (a, b) => a === b);
  Handlebars.registerHelper('gt', (a, b) => a > b);
  Handlebars.registerHelper('and', (...args) => { args.pop(); return args.every(Boolean); });
  Handlebars.registerHelper('or', (...args) => { args.pop(); return args.some(Boolean); });
  Handlebars.registerHelper('not', (value) => !value);
}

function collapseDnd5eMessageByDefault(html) {
  const toggleButton = html.find('.fa-chevron-down');
  if (toggleButton.length > 0) {
    toggleButton.click();
  }
}

function attachCraftingCheckButtonHandler(html, message) {
  html.find('.oot-perform-check').on('click', async (event) => {
    event.preventDefault();
    const checkId = event.currentTarget.dataset.checkId;
    await performCraftingCheck(checkId, message);
  });
}

function extractRollFromDnd5eResponse(rollData) {
  if (!rollData) return null;
  if (rollData instanceof Roll) return rollData;
  if (Array.isArray(rollData)) return rollData[0];
  if (rollData.rolls) return rollData.rolls[0];
  if (rollData.roll) return rollData.roll;
  return rollData;
}

async function performCraftingCheck(checkId, originalMessage) {
  const pendingCheck = game.oot.pendingChecks[checkId];
  if (!pendingCheck) {
    ui.notifications.error("This crafting check is no longer available.");
    return;
  }

  const actor = game.user.character;
  if (!actor) {
    ui.notifications.error("You need an assigned character to perform this check.");
    return;
  }

  const { skillConfig, dc, checkName, existingBoons, itemType, rarity } = pendingCheck;
  const rollResult = await performSkillOrToolRoll(actor, skillConfig, checkName);

  if (!rollResult) return;

  const { getQuirkOutcome, rollFlaws, rollBoons, CRAFTING_CONFIG } = await import('./crafting-data.js');
  const outcome = getQuirkOutcome(rollResult.total, dc);

  let flaws = [];
  let boons = [];

  if (!outcome.destroyed) {
    if (outcome.flaws > 0) {
      flaws = rollFlaws(outcome.flaws, itemType);
    }
    if (outcome.boons > 0) {
      const maxBoons = CRAFTING_CONFIG.maxEnchantingBoons[rarity];
      const remainingBoons = Math.max(0, maxBoons - existingBoons);
      boons = rollBoons(Math.min(outcome.boons, remainingBoons), itemType, remainingBoons);
    }
  }

  const result = {
    roll: rollResult,
    dc: dc,
    outcome: outcome,
    flaws: flaws,
    boons: boons,
    destroyed: outcome.destroyed,
    actorName: actor.name,
    actorId: actor.id
  };

  await postCheckResultToChat(checkName, skillConfig, result, pendingCheck.itemName, rarity);
  await handleCheckResult(checkId, result);

  delete game.oot.pendingChecks[checkId];
  await markCheckAsCompleted(originalMessage, actor.name);
}

async function performSkillOrToolRoll(actor, skillConfig, checkName) {
  if (skillConfig.type === "skill") {
    const rollData = await actor.rollSkill({ skill: skillConfig.id });
    return extractRollFromDnd5eResponse(rollData);
  }

  const toolItem = findToolInInventory(actor, skillConfig.name);

  if (toolItem) {
    const rollData = await toolItem.rollToolCheck({});
    return extractRollFromDnd5eResponse(rollData);
  }

  ui.notifications.warn(`${skillConfig.name} not found in inventory. Rolling with proficiency bonus only.`);
  const profBonus = actor.system.attributes?.prof || 0;
  const rollResult = await new Roll(`1d20 + ${profBonus}`).evaluate();
  await rollResult.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${checkName} (${skillConfig.name})`
  });
  return rollResult;
}

function findToolInInventory(actor, toolName) {
  const searchTerm = toolName.toLowerCase().replace("'s tools", "").replace("'s supplies", "").trim();
  return actor.items.find(i => i.type === "tool" && i.name.toLowerCase().includes(searchTerm));
}

async function markCheckAsCompleted(message, actorName) {
  const newContent = message.content.replace(
    /<button[^>]*class="oot-perform-check"[^>]*>[\s\S]*?<\/button>/,
    `<p class="check-completed"><i class="fas fa-check-circle"></i> Check completed by ${actorName}</p>`
  );
  await message.update({ content: newContent });
}

async function postCheckResultToChat(checkName, skillConfig, result, itemName, rarity) {
  const { CRAFTING_CONFIG } = await import('./crafting-data.js');

  const outcomeClass = getOutcomeClass(result);
  const content = buildCheckResultHtml(checkName, skillConfig, result, itemName, rarity, outcomeClass, CRAFTING_CONFIG);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: game.actors.get(result.actorId) }),
    content: content,
    flags: { oot: { craftingCheck: true, checkName: checkName } }
  });
}

function getOutcomeClass(result) {
  if (result.destroyed) return "destroyed";
  if (result.boons.length > 0) return "success";
  if (result.flaws.length > 0) return "failure";
  return "neutral";
}

function buildCheckResultHtml(checkName, skillConfig, result, itemName, rarity, outcomeClass, config) {
  let content = `
    <div class="oot-crafting-check">
      <h3>${checkName} - ${result.actorName}</h3>
      <p><strong>Item:</strong> ${itemName} (${config.rarityLabels[rarity]})</p>
      <p><strong>Skill:</strong> ${skillConfig.name}</p>
      <p><strong>Roll:</strong> ${result.roll.total} vs DC ${result.dc}</p>
      <p class="outcome ${outcomeClass}"><strong>Result:</strong> ${result.outcome.label}</p>
  `;

  if (result.destroyed) {
    content += `<p class="destroyed-message"><i class="fas fa-skull"></i> Item destroyed!</p>`;
  } else {
    content += buildQuirksHtml(result.flaws, "flaws", "Flaws");
    content += buildQuirksHtml(result.boons, "boons", "Boons");

    if (result.flaws.length === 0 && result.boons.length === 0) {
      content += `<p><em>No quirks.</em></p>`;
    }
  }

  content += `</div>`;
  return content;
}

function buildQuirksHtml(quirks, cssClass, label) {
  if (quirks.length === 0) return "";

  let html = `<div class="quirks ${cssClass}"><strong>${label}:</strong><ul>`;
  for (const quirk of quirks) {
    html += `<li><strong>${quirk.name}</strong> (d20: ${quirk.roll}): ${quirk.description}</li>`;
  }
  html += `</ul></div>`;
  return html;
}

async function handleCheckResult(checkId, result) {
  const pendingCheck = game.oot.pendingChecks[checkId];
  if (!pendingCheck) return;

  const { checkType, craftingAppId, requesterId } = pendingCheck;

  const craftingApp = Object.values(ui.windows).find(w =>
    w instanceof CraftingApplication && w.appId === craftingAppId
  );

  if (craftingApp) {
    if (checkType === "creation") {
      craftingApp.creationResult = result;
    } else if (checkType === "enchanting") {
      craftingApp.enchantingResult = result;
      craftingApp.craftingComplete = true;
    }
    craftingApp.render();
  } else if (game.user.id === requesterId) {
    ui.notifications.info(`${pendingCheck.checkName} completed by ${result.actorName}. Reopen crafting window to continue.`);
  }
}
