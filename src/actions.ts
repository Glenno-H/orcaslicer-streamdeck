import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import streamDeck, {
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type KeyUpEvent,
	type SendToPluginEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { type Command, commandsIn, describe, findCommand, type Resolved, resolveCommand, resolveCustom } from "./commands";
import { formatChord, toKeyStroke } from "./keys";
import { OrcaShortcuts } from "./orca-config";
import { focusOrca, orcaIsForeground, scanChar, sendKeyStroke } from "./win32";

export const PLUGIN_UUID = "au.gkw.orcaslicer";

const REPEAT_DELAY_MS = 400; // like a held keyboard key: wait, then repeat
const REPEAT_EVERY_MS = 90;
const REPEAT_MAX_MS = 30_000; // safety stop if a key-up never arrives
const FOCUS_SETTLE_MS = 120;

const orcaShortcuts = new OrcaShortcuts();
const pluginDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imageCache = new Map<string, string | undefined>();

type Settings = JsonObject & { command?: string; chord?: string; focus?: boolean };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function keyImage(id: string): string | undefined {
	if (!imageCache.has(id)) {
		try {
			const png = fs.readFileSync(path.join(pluginDir, "imgs", "keys", `${id}.png`));
			imageCache.set(id, `data:image/png;base64,${png.toString("base64")}`);
		} catch {
			imageCache.set(id, undefined);
		}
	}
	return imageCache.get(id);
}

function escapeXml(text: string): string {
	return text.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Key art for a custom shortcut: the chord itself, drawn as text. */
function customImage(resolved: Resolved): string {
	const label = resolved.ok ? formatChord(resolved.chord).replace(/ \+ /g, "+") : "?";
	const size = label.length <= 4 ? 40 : label.length <= 8 ? 26 : label.length <= 12 ? 19 : 15;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="#161a1a"/>
<rect x="14" y="30" width="116" height="62" rx="10" fill="none" stroke="#009688" stroke-width="4"/>
<text x="72" y="${61 + size * 0.36}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="700" font-size="${size}" fill="#ffffff">${escapeXml(label)}</text>
<text x="72" y="126" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="600" font-size="20" fill="#9fb3b0">Shortcut</text>
</svg>`;
}

/** Shared behaviour: press the shortcut in OrcaSlicer, repeat while held, keep the settings panel informed. */
abstract class ShortcutAction extends SingletonAction<Settings> {
	#repeaters = new Map<string, { timer: NodeJS.Timeout; started: number }>();
	#held = new Set<string>();

	protected abstract resolve(settings: Settings): Resolved;
	protected abstract repeats(settings: Settings): boolean;
	protected abstract refresh(action: KeyAction<Settings>, settings: Settings): Promise<void>;

	override async onWillAppear(ev: WillAppearEvent<Settings>): Promise<void> {
		if (ev.action.isKey()) await this.refresh(ev.action, ev.payload.settings);
	}

	override onWillDisappear(ev: WillDisappearEvent<Settings>): void {
		this.#held.delete(ev.action.id);
		this.#stopRepeat(ev.action.id);
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<Settings>): Promise<void> {
		if (ev.action.isKey()) await this.refresh(ev.action, ev.payload.settings);
		await this.#describeTo(ev.payload.settings);
	}

	override async onSendToPlugin(ev: SendToPluginEvent<JsonObject, Settings>): Promise<void> {
		if (ev.payload?.event === "describe") await this.#describeTo(await ev.action.getSettings());
	}

	override async onKeyDown(ev: KeyDownEvent<Settings>): Promise<void> {
		const { settings } = ev.payload;
		this.#held.add(ev.action.id);
		const ok = await this.#press(ev.action, settings, true);
		// The key may have been let go while OrcaSlicer was being brought forward.
		if (!ok || !this.#held.has(ev.action.id) || !this.repeats(settings) || ev.action.isInMultiAction()) return;

		this.#stopRepeat(ev.action.id);
		const started = Date.now();
		const timer = setTimeout(() => {
			const interval = setInterval(() => {
				if (Date.now() - started > REPEAT_MAX_MS) return this.#stopRepeat(ev.action.id);
				// Stop for good once a repeat fails (OrcaSlicer lost focus, input blocked...).
				void this.#press(ev.action, settings, false).then((sent) => sent || this.#stopRepeat(ev.action.id));
			}, REPEAT_EVERY_MS);
			this.#repeaters.set(ev.action.id, { timer: interval, started });
		}, REPEAT_DELAY_MS);
		this.#repeaters.set(ev.action.id, { timer, started });
	}

	override onKeyUp(ev: KeyUpEvent<Settings>): void {
		this.#held.delete(ev.action.id);
		this.#stopRepeat(ev.action.id);
	}

	#stopRepeat(id: string): void {
		const repeater = this.#repeaters.get(id);
		if (!repeater) return;
		clearTimeout(repeater.timer);
		clearInterval(repeater.timer);
		this.#repeaters.delete(id);
	}

	/** @returns `true` when the key press reached OrcaSlicer. */
	async #press(action: KeyAction<Settings>, settings: Settings, firstPress: boolean): Promise<boolean> {
		const resolved = this.resolve(settings);
		try {
			if (!resolved.ok) throw new Error(resolved.reason);
			const stroke = toKeyStroke(resolved.chord, scanChar);
			if (!stroke) throw new Error(`Can't type "${resolved.chord.key}" on this keyboard layout.`);

			if (!orcaIsForeground()) {
				if (!firstPress) return false; // focus moved away mid-repeat: stop quietly
				if (settings.focus === false) throw new Error("OrcaSlicer isn't the window in front.");
				if (!focusOrca()) throw new Error("OrcaSlicer isn't running.");
				await sleep(FOCUS_SETTLE_MS);
				if (!orcaIsForeground()) throw new Error("Couldn't bring OrcaSlicer to the front.");
			}
			sendKeyStroke(stroke);
			return true;
		} catch (err) {
			streamDeck.logger.warn(`Key not sent: ${err instanceof Error ? err.message : String(err)}`);
			if (firstPress) await action.showAlert();
			return false;
		}
	}

	async #describeTo(settings: Settings): Promise<void> {
		await streamDeck.ui.sendToPropertyInspector({ event: "describe", text: describe(this.resolve(settings)) });
	}
}

/**
 * One action per category, where the settings panel picks which OrcaSlicer command the key runs,
 * or a dedicated action that always runs one command.
 */
export class CommandAction extends ShortcutAction {
	override readonly manifestId: string;
	readonly #commands: Command[];

	constructor(id: string, commands: Command[]) {
		super();
		if (!commands.length) throw new Error(`Action ${id} has no commands.`);
		this.manifestId = `${PLUGIN_UUID}.${id.replace(/_/g, "-")}`; // manifest ids allow only a-z 0-9 - .
		this.#commands = commands;
	}

	static forCategory(category: string): CommandAction {
		return new CommandAction(category, commandsIn(category));
	}

	static dedicatedTo(commandId: string): CommandAction {
		const command = findCommand(commandId);
		if (!command) throw new Error(`Unknown command ${commandId}.`);
		return new CommandAction(commandId, [command]);
	}

	#command(settings: Settings): Command {
		const chosen = findCommand(settings.command);
		return chosen && this.#commands.includes(chosen) ? chosen : this.#commands[0];
	}

	protected resolve(settings: Settings): Resolved {
		const command = this.#command(settings);
		return resolveCommand(command, orcaShortcuts.override(command.id));
	}

	protected repeats(settings: Settings): boolean {
		return !!this.#command(settings).repeat;
	}

	protected async refresh(action: KeyAction<Settings>, settings: Settings): Promise<void> {
		const command = this.#command(settings);
		await action.setImage(keyImage(command.id));
	}
}

/** Any key combination the person types in. */
export class CustomAction extends ShortcutAction {
	override readonly manifestId = `${PLUGIN_UUID}.custom`;

	protected resolve(settings: Settings): Resolved {
		return resolveCustom(settings.chord);
	}

	protected repeats(): boolean {
		return false;
	}

	protected async refresh(action: KeyAction<Settings>, settings: Settings): Promise<void> {
		await action.setImage(customImage(this.resolve(settings)));
	}
}
