// Kagebunshin no Jutsu (Kusan): when the summon activity places the shadow clones, a smoke ring bursts
// around the caster and a smoke puff pops on every clone. Needs Sequencer + JB2A (free); does nothing without them.

const JUTSU = "kagebunshin-no-jutsu";
const RING = "jb2a.smoke.puff.ring.01.white";
const PUFF = "jb2a.smoke.puff.centered.grey";

const slug = name => String(name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

export function initKagebunshin() {
  Hooks.on("dnd5e.postSummon", (activity, _profile, tokens) => {
    if (slug(activity?.item?.name) !== JUTSU || !game.modules.get("sequencer")?.active) return;
    const caster = activity.actor?.getActiveTokens()?.[0];
    const seq = new Sequence();
    if (caster) seq.effect().file(RING).atLocation(caster).scaleToObject(2.5);
    for (const token of tokens ?? []) seq.effect().file(PUFF).atLocation(token).scaleToObject(1.8).randomRotation();
    seq.play();
  });
}
