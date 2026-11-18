import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { categories, commands, commandsIn, dedicated, describe, findCommand, resolveCommand, resolveCustom } from "../src/commands";
import { toKeyStroke } from "../src/keys";

test("command ids are unique and every category has commands", () => {
	assert.equal(new Set(commands.map((c) => c.id)).size, commands.length);
	for (const cat of categories) assert.ok(commandsIn(cat.id).length > 0, cat.id);
	for (const cmd of commands) assert.ok(categories.some((c) => c.id === cmd.category), cmd.id);
});

test("every default key parses and maps to a key code", () => {
	const noScan = () => undefined;
	for (const cmd of commands) {
		const resolved = resolveCommand(cmd, undefined);
		if (!cmd.chord) {
			assert.equal(resolved.ok, false, cmd.id); // the go-to-tab commands have no default
			continue;
		}
		assert.ok(resolved.ok, `${cmd.id}: ${cmd.chord}`);
		// "?" needs the keyboard layout (Windows only); everything else maps without it.
		if (cmd.chord !== "?") assert.ok(toKeyStroke(resolved.chord, noScan), cmd.id);
	}
});

test("every command has key art and its icon exists", () => {
	for (const cmd of commands) {
		if (cmd.icon) assert.ok(fs.existsSync(`assets/orca-icons/${cmd.icon}.svg`), `${cmd.id}: ${cmd.icon}`);
		else assert.ok(cmd.glyph, `${cmd.id} needs an icon or a glyph`);
	}
});

test("the user's OrcaSlicer keys win over the defaults", () => {
	const save = findCommand("save_project")!;
	assert.equal(describe(resolveCommand(save, undefined)), "Sends Ctrl + S (OrcaSlicer default)");
	assert.equal(describe(resolveCommand(save, "Ctrl+Alt+S")), "Sends Ctrl + Alt + S (your key from OrcaSlicer's settings)");
	assert.equal(resolveCommand(save, "none").ok, false);
	assert.equal(describe(resolveCommand(save, "garbage+")), "Sends Ctrl + S (OrcaSlicer default)");
	assert.equal(resolveCommand(findCommand("go_to_home")!, "F9").ok, true);
});

test("custom shortcuts", () => {
	assert.equal(describe(resolveCustom("ctrl+shift+k")), "Sends Ctrl + Shift + K");
	assert.equal(resolveCustom("").ok, false);
	assert.equal(resolveCustom("Ctrl+").ok, false);
});

test("dedicated actions point at real commands and don't clash with group ids", () => {
	assert.ok(dedicated.length > 0);
	for (const d of dedicated) {
		assert.ok(findCommand(d.command), d.command);
		assert.ok(!categories.some((c) => c.id === d.command), d.command);
		assert.notEqual(d.command, "custom");
	}
	assert.ok(dedicated.some((d) => d.command === "reload_from_disk"));
});
