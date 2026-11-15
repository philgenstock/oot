# OOT Foundry module

Foundry VTT module `oot` for a D&D 5e campaign (Foundry 14, dnd5e 5.3.3). Source lives in `foundry-data/Data/modules/oot/` (`scripts/`, `styles/`, `templates/`, `lang/`, `module.json`).

## Releasing

Run `./release.sh` (macOS/Linux) or `release.ps1` (Windows). It bumps the minor version in `module.json` (`version` and `download`), zips the module folder, commits, tags (plain version, no `v`, e.g. `1.48`), pushes and creates the GitHub release with exactly two assets: `module.json` and `module.zip`. There is no CI workflow; the scripts are the release process.

The prod server (`oot.byte.pm`) polls `releases/latest/download/module.json` every ~10 seconds and installs any strictly higher version automatically, even with players connected. So:
- Every real release is a production deploy. Don't release to "just test", and only release when the user asks.
- Keep `id` = `oot`, the `manifest` URL unchanged, and `download` on `https://github.com/philgenstock/oot/`.
- Versions must be dot-separated integers (`1.48`, `1.48.1`), never `v1.48` or `1.48-beta`.
- The zip must have `module.json` at its root and the same `version` as the manifest (the script guarantees this).
- Never move or delete an existing tag or release. Deleting a bad release does not roll the server back; release a new, higher version. The server operator can restore the previous files from the server-side backup.
- Changes to `esmodules`, `styles` or `relationships` in `module.json` need a Foundry restart on the server. Tell the user.
- Don't commit `docker-compose.yml` if it contains credentials.
