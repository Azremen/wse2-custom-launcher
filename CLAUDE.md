# Claude project instructions

@AGENTS.md

[AGENTS.md](./AGENTS.md) is the shared source of repository guidance. Follow it
for architecture, commands, localization, launch invariants and validation;
update that file instead of duplicating its rules here.

Read [README.md](./README.md) for user workflows and platform requirements.
Before changing launch behavior, inspect [main.js](./main.js),
[preload.js](./preload.js), [multiplayer.js](./multiplayer.js) and their callers
in [renderer.js](./renderer.js). Distinguish mocked tests from actual WSE2/Wine
runtime checks in the final report.
