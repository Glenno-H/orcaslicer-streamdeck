// Reads the shortcuts people have changed in OrcaSlicer (Preferences > Keyboard shortcuts). OrcaSlicer
// stores them in OrcaSlicer.conf, a JSON file, under "shortcuts": { "<id>": "Ctrl+Shift+S" | "none" }.
// Only changed keys are stored; everything else uses the default from the catalogue.
import fs from "node:fs";
import path from "node:path";

export const UNBOUND = "none";

export function defaultConfigPath(env: NodeJS.ProcessEnv = process.env): string | undefined {
	return env.APPDATA ? path.join(env.APPDATA, "OrcaSlicer", "OrcaSlicer.conf") : undefined;
}

/** Pulls the "shortcuts" section out of OrcaSlicer.conf text: `{}` when there is none, `undefined` when the file isn't valid JSON. */
export function parseShortcuts(text: string): Record<string, string> | undefined {
	// OrcaSlicer may append a "# MD5 checksum ..." line after the JSON.
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start === -1 || end <= start) return undefined;
	try {
		const shortcuts = JSON.parse(text.slice(start, end + 1))?.shortcuts;
		if (!shortcuts || typeof shortcuts !== "object") return {};
		return Object.fromEntries(Object.entries(shortcuts).filter((e): e is [string, string] => typeof e[1] === "string"));
	} catch {
		return undefined;
	}
}

/** Re-reads OrcaSlicer.conf whenever it changes on disk (checked on each lookup; a stat is cheap). */
export class OrcaShortcuts {
	#file: string | undefined;
	#mtime = -1;
	#size = -1;
	#overrides: Record<string, string> = {};

	constructor(file = defaultConfigPath()) {
		this.#file = file;
	}

	get file(): string | undefined {
		return this.#file;
	}

	/** The user's own chord for a shortcut id, `UNBOUND` if they removed it, or `undefined` if unchanged. */
	override(id: string): string | undefined {
		this.#refresh();
		return this.#overrides[id];
	}

	#refresh(): void {
		if (!this.#file) return;
		try {
			const stat = fs.statSync(this.#file);
			if (stat.mtimeMs === this.#mtime && stat.size === this.#size) return;
			const parsed = parseShortcuts(fs.readFileSync(this.#file, "utf8"));
			if (!parsed) return; // half-written; try again next time
			this.#overrides = parsed;
			this.#mtime = stat.mtimeMs;
			this.#size = stat.size;
		} catch {
			// Not installed yet, or mid-save: keep what we had.
		}
	}
}
