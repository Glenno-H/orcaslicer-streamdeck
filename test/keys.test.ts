import assert from "node:assert/strict";
import { test } from "node:test";

import { formatChord, parseChord, toKeyStroke, VK } from "../src/keys";

const usLayout = (ch: string) => ({ "?": { vk: 0xbf, shift: true, ctrl: false, alt: false }, ",": { vk: 0xbc, shift: false, ctrl: false, alt: false } })[ch];
const stroke = (text: string) => toKeyStroke(parseChord(text)!, usLayout);

test("parses OrcaSlicer chord text", () => {
	assert.deepEqual(parseChord("Ctrl+Shift+S"), { ctrl: true, shift: true, alt: false, key: "S" });
	assert.deepEqual(parseChord("q"), { ctrl: false, shift: false, alt: false, key: "Q" });
	assert.deepEqual(parseChord("+"), { ctrl: false, shift: false, alt: false, key: "+" });
	assert.deepEqual(parseChord("Ctrl++"), { ctrl: true, shift: false, alt: false, key: "+" });
	assert.deepEqual(parseChord("Shift+PgUp"), { ctrl: false, shift: true, alt: false, key: "PgUp" });
	assert.deepEqual(parseChord("Ctrl+F12"), { ctrl: true, shift: false, alt: false, key: "F12" });
	assert.deepEqual(parseChord(" Control + Alt + Del "), { ctrl: true, shift: false, alt: true, key: "Del" });
});

test("rejects things that aren't keys", () => {
	for (const bad of ["", "   ", "Ctrl+", "Hyper+A", "F25", "Enterprise", "Ctrl+Shift", "toString", "Ctrl+constructor"]) assert.equal(parseChord(bad), undefined, bad);
});

test("maps keys to Windows virtual-key codes", () => {
	assert.deepEqual(stroke("Ctrl+Shift+S"), { modifiers: [VK.CONTROL, VK.SHIFT], key: 0x53 });
	assert.deepEqual(stroke("Ctrl+0"), { modifiers: [VK.CONTROL], key: 0x30 });
	assert.deepEqual(stroke("PgDn"), { modifiers: [], key: 0x22 });
	assert.deepEqual(stroke("Ctrl+Shift+Enter"), { modifiers: [VK.CONTROL, VK.SHIFT], key: 0x0d });
	assert.deepEqual(stroke("F5"), { modifiers: [], key: 0x74 });
	assert.deepEqual(stroke("Delete"), { modifiers: [], key: 0x2e });
});

test("sends + and - on the number pad so no Shift is needed", () => {
	assert.deepEqual(stroke("+"), { modifiers: [], key: 0x6b });
	assert.deepEqual(stroke("-"), { modifiers: [], key: 0x6d });
});

test("holds whatever the layout needs to type a symbol", () => {
	assert.deepEqual(stroke("?"), { modifiers: [VK.SHIFT], key: 0xbf });
	assert.deepEqual(stroke("Ctrl+,"), { modifiers: [VK.CONTROL], key: 0xbc });
	assert.equal(stroke("~"), undefined); // not on this (fake) layout
});

test("formats chords for people", () => {
	assert.equal(formatChord(parseChord("ctrl+shift+s")!), "Ctrl + Shift + S");
});
