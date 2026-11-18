// Turns OrcaSlicer's chord text ("Ctrl+Shift+S", "PgUp", "+", "Ctrl++") into Windows virtual-key
// codes. Mirrors KeyChord::parse in OrcaSlicer's src/slic3r/GUI/KeyChord.cpp, so anything
// OrcaSlicer writes to its config parses here too.

export const VK = {
	SHIFT: 0xa0, // left Shift
	CONTROL: 0xa2, // left Ctrl
	ALT: 0xa4, // left Alt
} as const;

export type Chord = { ctrl: boolean; shift: boolean; alt: boolean; key: string };
export type KeyStroke = { modifiers: number[]; key: number };
export type CharScanner = (ch: string) => { vk: number; shift: boolean; ctrl: boolean; alt: boolean } | undefined;

const SPECIAL_KEYS: Record<string, number> = {
	backspace: 0x08, back: 0x08,
	tab: 0x09,
	enter: 0x0d, return: 0x0d,
	esc: 0x1b, escape: 0x1b,
	space: 0x20,
	pgup: 0x21, pageup: 0x21,
	pgdn: 0x22, pagedown: 0x22,
	end: 0x23,
	home: 0x24,
	left: 0x25, up: 0x26, right: 0x27, down: 0x28,
	ins: 0x2d, insert: 0x2d,
	del: 0x2e, delete: 0x2e,
};

// OrcaSlicer folds number-pad keys into these characters, so the number pad types them on any
// keyboard layout without needing Shift.
const NUMPAD_SYMBOLS: Record<string, number> = { "+": 0x6b, "-": 0x6d, "*": 0x6a, "/": 0x6f };

/** Parses chord text, or returns `undefined` when it isn't a key OrcaSlicer would accept. */
export function parseChord(text: string): Chord | undefined {
	const trimmed = text.trim();
	if (!trimmed) return undefined;

	// The key is whatever follows the last '+'; a trailing '+' is the '+' key itself.
	let keyStart = trimmed.length - 1;
	if (!trimmed.endsWith("+")) {
		const sep = trimmed.lastIndexOf("+");
		keyStart = sep === -1 ? 0 : sep + 1;
	}
	const key = trimmed.slice(keyStart).trim();
	if (!isKeyName(key)) return undefined;

	const chord: Chord = { ctrl: false, shift: false, alt: false, key: key.length === 1 ? key.toUpperCase() : key };
	const prefix = keyStart === 0 ? "" : trimmed.slice(0, keyStart - 1);
	for (const part of prefix ? prefix.split("+") : []) {
		switch (part.trim().toLowerCase()) {
			case "ctrl": case "control": case "cmd": case "command": case "rawctrl":
				chord.ctrl = true; break;
			case "shift":
				chord.shift = true; break;
			case "alt": case "option":
				chord.alt = true; break;
			default:
				return undefined;
		}
	}
	return chord;
}

function isKeyName(key: string): boolean {
	if (key.length === 1) return key > " " && key < "\x7f";
	return Object.hasOwn(SPECIAL_KEYS, key.toLowerCase()) || /^f([1-9]|1\d|2[0-4])$/i.test(key);
}

/** Text for showing a chord to people, e.g. "Ctrl + Shift + S". */
export function formatChord(chord: Chord): string {
	return [chord.ctrl && "Ctrl", chord.shift && "Shift", chord.alt && "Alt", chord.key].filter(Boolean).join(" + ");
}

/**
 * Virtual-key codes for a chord. `scan` looks up symbol keys on the current keyboard layout
 * (Windows' VkKeyScanW); it is only called for symbols other than + - * /.
 */
export function toKeyStroke(chord: Chord, scan: CharScanner): KeyStroke | undefined {
	let { ctrl, shift, alt } = chord;
	let vk: number | undefined;
	const k = chord.key;

	if (k.length === 1 && /[A-Z0-9]/.test(k)) vk = k.charCodeAt(0);
	else if (k.length === 1 && Object.hasOwn(NUMPAD_SYMBOLS, k)) vk = NUMPAD_SYMBOLS[k];
	else if (k.length === 1) {
		// OrcaSlicer reads symbols as typed characters and ignores Shift on them, so hold whatever
		// the layout needs to type the character (Shift for '?' on a US keyboard).
		const found = scan(k);
		if (!found) return undefined;
		vk = found.vk;
		shift ||= found.shift;
		ctrl ||= found.ctrl;
		alt ||= found.alt;
	} else if (/^f\d+$/i.test(k)) vk = 0x70 + Number(k.slice(1)) - 1;
	else if (Object.hasOwn(SPECIAL_KEYS, k.toLowerCase())) vk = SPECIAL_KEYS[k.toLowerCase()];

	if (vk === undefined) return undefined;
	const modifiers: number[] = [];
	if (ctrl) modifiers.push(VK.CONTROL);
	if (shift) modifiers.push(VK.SHIFT);
	if (alt) modifiers.push(VK.ALT);
	return { modifiers, key: vk };
}
