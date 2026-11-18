import catalogue from "./catalogue.json";
import { type Chord, formatChord, parseChord } from "./keys";
import { UNBOUND } from "./orca-config";

export type Command = {
	id: string;
	category: string;
	label: string;
	short: string;
	chord: string;
	icon: string | null;
	glyph?: string;
	repeat?: boolean;
};

export type Category = { id: string; name: string; tooltip: string; icon: string };
export type Dedicated = { command: string; name: string; tooltip: string };

export const categories: Category[] = catalogue.categories;
export const commands: Command[] = catalogue.commands;
export const dedicated: Dedicated[] = catalogue.dedicated;

const byId = new Map(commands.map((c) => [c.id, c]));

export function findCommand(id: string | undefined): Command | undefined {
	return id === undefined ? undefined : byId.get(id);
}

export function commandsIn(category: string): Command[] {
	return commands.filter((c) => c.category === category);
}

export type Resolved =
	| { ok: true; chord: Chord; source: "default" | "orca" | "custom" }
	| { ok: false; reason: string };

/**
 * The chord to send for a command: the user's own key from OrcaSlicer's settings when they changed
 * it, otherwise OrcaSlicer's default.
 */
export function resolveCommand(command: Command, override: string | undefined): Resolved {
	if (override === UNBOUND) return { ok: false, reason: `"${command.label}" has no key in OrcaSlicer. Give it one in Preferences > Keyboard shortcuts.` };
	if (override !== undefined) {
		const chord = parseChord(override);
		if (chord) return { ok: true, chord, source: "orca" };
	}
	if (!command.chord) return { ok: false, reason: `"${command.label}" has no key by default. Give it one in OrcaSlicer's Preferences > Keyboard shortcuts.` };
	const chord = parseChord(command.chord);
	return chord ? { ok: true, chord, source: "default" } : { ok: false, reason: `Bad default key "${command.chord}".` };
}

export function resolveCustom(text: string | undefined): Resolved {
	if (!text?.trim()) return { ok: false, reason: "Type a shortcut, for example Ctrl+Shift+K." };
	const chord = parseChord(text);
	return chord ? { ok: true, chord, source: "custom" } : { ok: false, reason: `"${text}" isn't a key combination this plugin understands.` };
}

/** One line for the settings panel saying what a key will send. */
export function describe(resolved: Resolved): string {
	if (!resolved.ok) return resolved.reason;
	const keys = formatChord(resolved.chord);
	switch (resolved.source) {
		case "orca": return `Sends ${keys} (your key from OrcaSlicer's settings)`;
		case "custom": return `Sends ${keys}`;
		default: return `Sends ${keys} (OrcaSlicer default)`;
	}
}
