These pi fixtures drive `tests/unit/ai-tool-detection.test.ts`.

`idle.txt` and `working.txt` are live captures from a bare `pi` session and the
`capture-ai-states` skill regenerates them directly.

`waiting.txt` needs the **`pi-permission-system`** extension. pi has no built-in
permission gate — by default it auto-runs bash/edits and never blocks on the
user. Installing that extension (`pi install pi-permission-system`) makes pi
gate tool calls behind a select dialog ("Permission Required … Allow this
command?"), which is pi's real "waiting" state.

To regenerate `waiting.txt`:
1. `pi install pi-permission-system` (it auto-loads on the next `pi` launch).
2. Run the `capture-ai-states` skill — the pi/waiting cell will then capture
   live. Without the extension the skill fails that cell fast with a message
   pointing back here, and the committed snapshot is used as-is.
