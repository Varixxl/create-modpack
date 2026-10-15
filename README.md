# Create Modpack

The master modpack repository for **Create Server** (Minecraft 1.20.1 Forge 47.4.20).

This repository is maintained and synchronized directly by **Antigravity**.

---

## Structure

- `mods/`: Curated mod jars.
- `config/`: Synchronized server & client configurations.
- `fancymenu_data/`: In-game update log and custom menu assets.
- `libraries/` & `version.json`: Pre-configured Forge 1.20.1 launcher metadata.
- `manifest.json`: Version manifest defining the base pack and sequential delta patches.

---

## Publishing Updates

All updates can be triggered via Antigravity or by running:

```bash
./scripts/publish-patch.sh <NEW_VERSION> "<CHANGELOG_SUMMARY>"
```

The script automatically detects changed and deleted files, packages the tiny delta patch (`patch-vX.Y.Z.zip`), uploads it to GitHub Releases, and updates `manifest.json`.
