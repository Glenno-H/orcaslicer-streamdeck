import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { defaultConfigPath, OrcaShortcuts, parseShortcuts } from "../src/orca-config";

test("finds OrcaSlicer.conf under %APPDATA%", () => {
	assert.equal(defaultConfigPath({ APPDATA: "/appdata" }), path.join("/appdata", "OrcaSlicer", "OrcaSlicer.conf"));
	assert.equal(defaultConfigPath({}), undefined);
});

test("reads the shortcuts section and ignores the checksum line", () => {
	const text = `{\n\t"header": "OrcaSlicer 2.5.1",\n\t"shortcuts": {\n\t\t"save_project": "Ctrl+Alt+S",\n\t\t"zoom_in": "none"\n\t}\n}\n# MD5 checksum 0123456789ABCDEF\n`;
	assert.deepEqual(parseShortcuts(text), { save_project: "Ctrl+Alt+S", zoom_in: "none" });
	assert.deepEqual(parseShortcuts(`{"app": {}}`), {});
	assert.equal(parseShortcuts(`{"shortcuts": {"save_pro`), undefined);
});

test("picks up changes to the file and survives half-written saves", () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orca-"));
	const file = path.join(dir, "OrcaSlicer.conf");
	const shortcuts = new OrcaShortcuts(file);
	assert.equal(shortcuts.override("undo"), undefined); // no file yet

	fs.writeFileSync(file, `{"shortcuts": {"undo": "Ctrl+U"}}`);
	assert.equal(shortcuts.override("undo"), "Ctrl+U");

	fs.writeFileSync(file, `{"shortcuts": {"undo": "Ctrl+`); // mid-save
	assert.equal(shortcuts.override("undo"), "Ctrl+U");

	fs.writeFileSync(file, `{"shortcuts": {"undo": "Ctrl+Alt+Z", "redo": "none"}}`);
	assert.equal(shortcuts.override("undo"), "Ctrl+Alt+Z");
	assert.equal(shortcuts.override("redo"), "none");
	fs.rmSync(dir, { recursive: true });
});
