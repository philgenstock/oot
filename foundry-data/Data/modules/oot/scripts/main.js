import { PartyInventoryApplication } from './party-inventory-app.js';
import { registerPartyInventorySettings } from './party-inventory-data.js';
import { registerPartyInventorySocket } from './party-inventory-socket.js';

Hooks.on('getSceneControlButtons', (controls) => {
  const tokenControls = controls.tokens || controls.token;
  if (tokenControls && tokenControls.tools) {
    tokenControls.tools['oot-party-inventory'] = {
      name: "oot-party-inventory",
      title: "Party Inventory",
      icon: "fas fa-boxes-stacked",
      button: true,
      onClick: () => game.oot.openPartyInventory()
    };
    tokenControls.tools['oot-creature-export'] = {
      name: "oot-creature-export",
      title: "Export Creatures",
      icon: "fas fa-dragon",
      button: true,
      visible: game.user.isGM,
      onClick: () => game.oot.exportCreatures()
    };
  }
});

registerPartyInventorySocket();
Hooks.once('init', async function() {
  registerHandlebarsHelpers();
  registerPartyInventorySettings();

  game.oot = {
    PartyInventoryApplication: PartyInventoryApplication,
    openPartyInventory: () => {
      const existing = Object.values(ui.windows).find(w => w instanceof PartyInventoryApplication);
      if (existing) {
        existing.bringToTop();
        existing.render(true);
      } else {
        new PartyInventoryApplication().render(true);
      }
    },
    exportCreatures: exportCreaturesByFolder
  };

  game.keybindings.register("oot", "openPartyInventory", {
    name: "Open Party Inventory",
    hint: "Opens the party inventory window",
    editable: [{ key: "KeyI", modifiers: ["Control", "Shift"] }],
    onDown: () => {
      game.oot.openPartyInventory();
      return true;
    },
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL
  });

  await loadTemplates([
    "modules/oot/templates/party-inventory.hbs"
  ]);
});

Hooks.once('ready', async function() {
  console.log('OOT | Module ready');
});

Hooks.on('renderChatMessage', async function(message, html) {
  collapseDnd5eMessageByDefault(html);
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

function exportCreaturesByFolder() {
  if (!game.user.isGM) {
    ui.notifications.error("Only GMs can export creatures.");
    return;
  }

  const folderMap = new Map();

  for (const actor of game.actors) {
    if (!actor.folder) continue;

    const folderName = actor.folder.name;
    const cr = actor.system?.details?.cr;

    if (!folderMap.has(folderName)) {
      folderMap.set(folderName, []);
    }

    folderMap.get(folderName).push({
      name: actor.name,
      cr: cr ?? null
    });
  }

  const exportData = [];
  for (const [folderName, creatures] of folderMap) {
    creatures.sort((a, b) => a.name.localeCompare(b.name));
    exportData.push({
      folder: folderName,
      creatures: creatures
    });
  }

  exportData.sort((a, b) => a.folder.localeCompare(b.folder));

  const jsonString = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "creatures-export.json";
  link.click();

  URL.revokeObjectURL(url);
  ui.notifications.info(`Exported ${folderMap.size} folders with creatures.`);
}
