// Candyland, chocolate manufactory: the chocolate rises level by level.
//
// The scene is a bowl built from Foundry 14 scene levels. The flag `flags.oot.chocolateFlood` holds
//   levels:         [levelId ring 0, ring 1, ring 2]           (the gallery never floods)
//   images:         { "0": {dry, ankle, waist, flooded}, "1": {...}, "2": {...} }   background per state
//   stages:         [[state index per ring], ...]               stage 0 = all dry
//   roundsPerStage: 2
// and the running state, written by this script:
//   state: { running, stage, lastRiseRound, set }
//
// Flow (active GM only):
//   - combat starts on the scene -> the flood starts (stage 0, rises every roundsPerStage rounds)
//   - each new round: rise one stage when due and swap the level backgrounds
//   - GM tool "Schokoflut" (token controls) to close/reopen the tap, open the drain, step, reset
// Nothing is posted to chat: the DM announces depths and saves at the table.

const KEY = "chocolateFlood";
const STATES = ["dry", "ankle", "waist", "flooded"];
const isPrimaryGM = () => !!game.users.activeGM?.isSelf;
const cfgOf = scene => scene?.getFlag("oot", KEY);

function statesAt(cfg, stage) {
  const row = cfg.stages[Math.max(0, Math.min(stage, cfg.stages.length - 1))];
  return row.map(i => STATES[i]);
}

async function applyStage(scene, stage) {
  const cfg = cfgOf(scene);
  stage = Math.max(0, Math.min(stage, cfg.stages.length - 1));
  const states = statesAt(cfg, stage);
  await scene.updateEmbeddedDocuments("Level", cfg.levels.map((id, k) => ({
    _id: id, "background.src": cfg.images[String(k)][states[k]]
  })));
  await scene.setFlag("oot", KEY, { state: { ...(cfg.state ?? {}), stage } });
}

async function setState(scene, patch) {
  const state = { ...(cfgOf(scene).state ?? {}), ...patch };
  await scene.setFlag("oot", KEY, { state });
  return state;
}

// ---------- hooks ----------

async function onCombatStart(combat) {
  if (!isPrimaryGM()) return;
  const scene = combat.scene;
  if (!cfgOf(scene)) return;
  await setState(scene, { running: true, set: false, lastRiseRound: combat.round || 1, stage: 0 });
  await applyStage(scene, 0);
  ui.notifications.info("Schokoflut läuft.");
}

async function onTurnChange(combat, previous, current) {
  if (!isPrimaryGM() || !current || !previous) return;
  const scene = combat.scene;
  const cfg = cfgOf(scene);
  if (!cfg?.state) return;
  const forward = current.round > previous.round
    || (current.round === previous.round && current.turn > previous.turn);
  if (!forward) return;

  // new round: rise when due
  if (current.round > previous.round && cfg.state.running) {
    const per = cfg.roundsPerStage ?? 2;
    if (current.round - (cfg.state.lastRiseRound ?? current.round) >= per) {
      const next = Math.min((cfg.state.stage ?? 0) + 1, cfg.stages.length - 1);
      await setState(scene, { lastRiseRound: current.round });
      if (next !== cfg.state.stage) await applyStage(scene, next);
    }
  }
}

// ---------- GM controls ----------

async function controlDialog() {
  const scene = canvas.scene;
  const cfg = cfgOf(scene);
  if (!cfg) return ui.notifications.warn("Diese Szene hat keine Schokoflut.");
  const st = cfg.state ?? {};
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: `Schokoflut · Stufe ${st.stage ?? 0}${st.running ? " · läuft" : " · gestoppt"}` },
    buttons: [
      { action: "tap", label: "Haupthahn zu (stoppt, Schokolade erstarrt)", icon: "fa-solid fa-faucet" },
      { action: "reopen", label: "Haupthahn wieder auf (Gespenst)", icon: "fa-solid fa-ghost" },
      { action: "drain", label: "Ablauf offen (läuft ab)", icon: "fa-solid fa-arrow-down" },
      { action: "up", label: "Eine Stufe höher", icon: "fa-solid fa-plus" },
      { action: "down", label: "Eine Stufe tiefer", icon: "fa-solid fa-minus" },
      { action: "reset", label: "Zurücksetzen (trocken, gestoppt)", icon: "fa-solid fa-rotate-left" }
    ],
    rejectClose: false
  });
  const round = game.combat?.round ?? 0;
  switch (action) {
    case "tap": await setState(scene, { running: false, set: true }); break;
    case "reopen": await setState(scene, { running: true, set: false, lastRiseRound: round }); break;
    case "drain": await setState(scene, { running: false, set: false }); await applyStage(scene, 0); break;
    case "up": await applyStage(scene, (st.stage ?? 0) + 1); break;
    case "down": await applyStage(scene, (st.stage ?? 0) - 1); break;
    case "reset":
      await setState(scene, { running: false, set: false, stage: 0, lastRiseRound: round });
      await applyStage(scene, 0);
      break;
  }
}

export function initChocolateFlood() {
  Hooks.on("combatStart", onCombatStart);
  Hooks.on("combatTurnChange", onTurnChange);
  Hooks.on("getSceneControlButtons", controls => {
    const tools = (controls.tokens || controls.token)?.tools;
    if (!tools) return;
    tools["oot-chocolate-flood"] = {
      name: "oot-chocolate-flood",
      title: "Schokoflut",
      icon: "fas fa-water",
      button: true,
      visible: game.user.isGM && !!cfgOf(canvas.scene),
      onChange: () => controlDialog()
    };
  });
}
