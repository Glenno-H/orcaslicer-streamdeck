// Builds everything in the .sdPlugin folder that comes from src/catalogue.json:
//   imgs/keys/<command>.png        key art for each OrcaSlicer command (144x144)
//   imgs/actions/<category>/...     action list icons and default key art
//   imgs/plugin/...                 plugin and category icons
//   ui/<category>.html, ui/custom.html   settings panels (property inspectors)
//   manifest.json
// Run with: npm run assets
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import path from "node:path";

const SD = "au.gkw.orcaslicer.sdPlugin";
const UUID = "au.gkw.orcaslicer";
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const catalogue = JSON.parse(fs.readFileSync("src/catalogue.json", "utf8"));
const FONT = "assets/fonts/DejaVuSans-Bold.ttf";

const TEAL = "#009688";
const TEAL_LIGHT = "#26c6b0";
const KEY_BG = "#151a1a";
const LABEL = "#ffffff";

// ---------- SVG helpers ----------

function escapeXml(text) {
	return String(text).replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function luminance(hex) {
	let h = hex.slice(1);
	if (h.length === 3) h = [...h].map((c) => c + c).join("");
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Loads an OrcaSlicer icon and returns it as a nested <svg> placed at x,y with the given size.
 * mode "key": dark colours are lightened so they show on a black key.
 * mode "mono": every colour becomes `mono` (action list icons are single-colour).
 */
function icon(name, x, y, size, { mode = "key", mono = "#ffffff" } = {}) {
	const src = fs.readFileSync(path.join("assets/orca-icons", `${name}.svg`), "utf8");
	const root = src.match(/<svg\b[^>]*>/)?.[0];
	if (!root) throw new Error(`${name}.svg has no <svg> element`);
	let viewBox = root.match(/viewBox="([^"]+)"/)?.[1];
	if (!viewBox) {
		const w = parseFloat(root.match(/width="([\d.]+)/)?.[1] ?? "40");
		const h = parseFloat(root.match(/height="([\d.]+)/)?.[1] ?? "40");
		viewBox = `0 0 ${w} ${h}`;
	}
	let inner = src.slice(src.indexOf(root) + root.length, src.lastIndexOf("</svg>"));
	inner = inner.replace(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, (hex) => {
		if (mode === "mono") return mono;
		return luminance(hex) < 0.3 ? "#e6e6e6" : hex;
	});
	if (mode === "mono") inner = inner.replace(/\b(fill|stroke)\s*:\s*(white|black)\b/g, `$1:${mono}`);
	// Keep the root's paint settings (some icons are stroke-only with fill="none" on the root).
	const recolor = (value) => (mode === "mono" && value !== "none" ? mono : value);
	const rootAttr = (name) => root.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
	const paint = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]
		.map((name) => [name, rootAttr(name)])
		.filter(([, value]) => value !== undefined)
		.map(([name, value]) => ` ${name}="${name === "fill" || name === "stroke" ? recolor(value) : value}"`)
		.join("");
	const fill = rootAttr("fill") === undefined ? ` fill="${mode === "mono" ? mono : "#e6e6e6"}"` : ""; // default for shapes that set none
	const namespaces = (root.match(/\sxmlns:\w+="[^"]*"/g) ?? []).join("");
	return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="${viewBox}"${namespaces}><g${fill}${paint}>${inner}</g></svg>`;
}

/** Font size that fits `text` in `width` pixels (DejaVu Sans Bold is ~0.68em per glyph on average). */
function fitSize(text, width, max) {
	return Math.min(max, Math.floor(width / (Math.max(text.length, 1) * 0.68)));
}

function label(text, y = 130, max = 22) {
	const size = fitSize(text, 136, max);
	return `<text x="72" y="${y}" text-anchor="middle" font-family="DejaVu Sans" font-weight="700" font-size="${size}" fill="${LABEL}">${escapeXml(text)}</text>`;
}

function glyph(text) {
	const size = [...text].length <= 1 ? 66 : fitSize(text, 112, 44);
	return `<text x="72" y="${58 + size * 0.36}" text-anchor="middle" font-family="DejaVu Sans" font-weight="700" font-size="${size}" fill="${TEAL_LIGHT}">${escapeXml(text)}</text>`;
}

function keySvg(art, text) {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="${KEY_BG}"/>
<rect x="0" y="0" width="144" height="4" fill="${TEAL}"/>
${art}
${label(text)}
</svg>`;
}

// Our own mark (not OrcaSlicer's logo): a nozzle over three printed layers.
function markSvg(color) {
	return `<path d="M30 10h40v14l-12 14h-16l-12-14z" fill="${color}"/>
<rect x="46" y="38" width="8" height="8" fill="${color}"/>
<rect x="14" y="54" width="72" height="9" rx="4.5" fill="${color}"/>
<rect x="14" y="68" width="72" height="9" rx="4.5" fill="${color}"/>
<rect x="14" y="82" width="72" height="9" rx="4.5" fill="${color}"/>`;
}

function render(svg, size, file) {
	const png = new Resvg(svg, {
		fitTo: { mode: "width", value: size },
		font: { fontFiles: [FONT], loadSystemFonts: false, defaultFontFamily: "DejaVu Sans" },
	}).render().asPng();
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, png);
}

// ---------- images ----------

fs.rmSync(path.join(SD, "imgs"), { recursive: true, force: true });

for (const cmd of catalogue.commands) {
	const art = cmd.icon ? icon(cmd.icon, 28, 12, 88) : glyph(cmd.glyph ?? cmd.short);
	render(keySvg(art, cmd.short), 144, path.join(SD, "imgs/keys", `${cmd.id}.png`));
}

for (const cat of catalogue.categories) {
	const dir = path.join(SD, "imgs/actions", cat.id);
	const listIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${icon(cat.icon, 0, 0, 40, { mode: "mono" })}</svg>`;
	render(listIcon, 20, path.join(dir, "icon.png"));
	render(listIcon, 40, path.join(dir, "icon@2x.png"));
	const key = keySvg(icon(cat.icon, 28, 12, 88), cat.name.split(" ")[0]);
	render(key, 72, path.join(dir, "key.png"));
	render(key, 144, path.join(dir, "key@2x.png"));
}

// Dedicated actions: list icon from the command's icon (or its glyph), key art = the command's key art.
for (const d of catalogue.dedicated) {
	const cmd = catalogue.commands.find((c) => c.id === d.command);
	if (!cmd) throw new Error(`dedicated action for unknown command ${d.command}`);
	const dir = path.join(SD, "imgs/actions", cmd.id);
	const art = cmd.icon
		? icon(cmd.icon, 0, 0, 40, { mode: "mono" })
		: `<text x="20" y="30" text-anchor="middle" font-family="DejaVu Sans" font-weight="700" font-size="${fitSize(cmd.glyph ?? cmd.short, 40, 28)}" fill="#ffffff">${escapeXml(cmd.glyph ?? cmd.short)}</text>`;
	const listIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${art}</svg>`;
	render(listIcon, 20, path.join(dir, "icon.png"));
	render(listIcon, 40, path.join(dir, "icon@2x.png"));
	const key = keySvg(cmd.icon ? icon(cmd.icon, 28, 12, 88) : glyph(cmd.glyph ?? cmd.short), cmd.short);
	render(key, 72, path.join(dir, "key.png"));
	render(key, 144, path.join(dir, "key@2x.png"));
}

{
	const dir = path.join(SD, "imgs/actions/custom");
	const kb = (color) => `<rect x="3" y="10" width="34" height="21" rx="3" fill="none" stroke="${color}" stroke-width="2.5"/>
<g fill="${color}"><rect x="8" y="15" width="4" height="4"/><rect x="14" y="15" width="4" height="4"/><rect x="20" y="15" width="4" height="4"/><rect x="26" y="15" width="4" height="4"/><rect x="11" y="23" width="18" height="3.5"/></g>`;
	const listIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">${kb("#ffffff")}</svg>`;
	render(listIcon, 20, path.join(dir, "icon.png"));
	render(listIcon, 40, path.join(dir, "icon@2x.png"));
	const key = keySvg(`<svg x="28" y="12" width="88" height="88" viewBox="0 0 40 40">${kb(TEAL_LIGHT)}</svg>`, "Shortcut");
	render(key, 72, path.join(dir, "key.png"));
	render(key, 144, path.join(dir, "key@2x.png"));
}

{
	const dir = path.join(SD, "imgs/plugin");
	const category = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${markSvg("#ffffff")}</svg>`;
	render(category, 28, path.join(dir, "category-icon.png"));
	render(category, 56, path.join(dir, "category-icon@2x.png"));
	const marketplace = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#00b3a1"/><stop offset="1" stop-color="#00695c"/></linearGradient></defs>
<rect width="100" height="100" rx="18" fill="url(#g)"/>
<g transform="translate(14 12) scale(0.72)">${markSvg("#ffffff")}</g>
</svg>`;
	render(marketplace, 256, path.join(dir, "marketplace.png"));
	render(marketplace, 512, path.join(dir, "marketplace@2x.png"));
}

// ---------- settings panels ----------

const sdpi = `<script src="sdpi-components.js"></script>`;
const style = `<style>
	#sends { font-size: 9pt; color: #9a9a9a; line-height: 1.4; padding-top: 4px; }
</style>`;
const describeScript = `<script>
	const client = SDPIComponents.streamDeckClient;
	client.sendToPropertyInspector.subscribe((msg) => {
		if (msg.payload?.event === "describe") document.getElementById("sends").textContent = msg.payload.text;
	});
	client.send("sendToPlugin", { event: "describe" });
</script>`;
const focusItem = `<sdpi-item label="If hidden">
		<sdpi-checkbox setting="focus" default="true" label="Bring OrcaSlicer to the front first"></sdpi-checkbox>
	</sdpi-item>`;

function page(title, body) {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>${escapeXml(title)}</title>
	${sdpi}
	${style}
</head>
<body>
	${body}
	<sdpi-item label=""><div id="sends"></div></sdpi-item>
	${focusItem}
	${describeScript}
</body>
</html>
`;
}

fs.rmSync(path.join(SD, "ui"), { recursive: true, force: true });
fs.mkdirSync(path.join(SD, "ui"), { recursive: true });
fs.copyFileSync("assets/sdpi-components.js", path.join(SD, "ui/sdpi-components.js"));

for (const cat of catalogue.categories) {
	const cmds = catalogue.commands.filter((c) => c.category === cat.id);
	const options = cmds.map((c) => `\t\t\t<option value="${c.id}">${escapeXml(c.label)}</option>`).join("\n");
	const body = `<sdpi-item label="Command">
		<sdpi-select setting="command" default="${cmds[0].id}">
${options}
		</sdpi-select>
	</sdpi-item>`;
	fs.writeFileSync(path.join(SD, "ui", `${cat.id}.html`), page(cat.name, body));
}

for (const d of catalogue.dedicated) {
	const cmd = catalogue.commands.find((c) => c.id === d.command);
	fs.writeFileSync(path.join(SD, "ui", `${cmd.id}.html`), page(d.name, `<sdpi-item label="Command"><span>${escapeXml(cmd.label)}</span></sdpi-item>`));
}

fs.writeFileSync(
	path.join(SD, "ui/custom.html"),
	page(
		"Custom Shortcut",
		`<sdpi-item label="Shortcut">
		<sdpi-textfield setting="chord" placeholder="e.g. Ctrl+Shift+K"></sdpi-textfield>
	</sdpi-item>`,
	),
);

// ---------- licence ----------

// The plugin ships OrcaSlicer's AGPL icons, so the licence and credits travel with it.
fs.copyFileSync("LICENSE", path.join(SD, "LICENSE.txt"));
fs.copyFileSync("NOTICE.md", path.join(SD, "NOTICE.md"));

// ---------- manifest ----------

const action = (id, name, tooltip) => ({
	Name: name,
	UUID: `${UUID}.${id.replace(/_/g, "-")}`, // action ids allow only a-z 0-9 - .
	Icon: `imgs/actions/${id}/icon`,
	Tooltip: tooltip,
	PropertyInspectorPath: `ui/${id}.html`,
	Controllers: ["Keypad"],
	SupportedInMultiActions: true,
	States: [{ Image: `imgs/actions/${id}/key`, ShowTitle: true, TitleAlignment: "bottom" }],
});

const [major, minor, patch] = pkg.version.split(".");
const manifest = {
	$schema: "https://schemas.elgato.com/streamdeck/plugins/manifest.json",
	Name: "OrcaSlicer",
	Version: `${major}.${minor}.${patch}.0`,
	Author: "GKW",
	Description:
		"Free, open-source OrcaSlicer shortcuts for Stream Deck. Pick any of OrcaSlicer's commands per key, with OrcaSlicer's own icons. Follows the shortcuts you've changed in OrcaSlicer, and brings OrcaSlicer to the front when needed.",
	URL: pkg.homepage,
	UUID,
	Category: "OrcaSlicer",
	CategoryIcon: "imgs/plugin/category-icon",
	Icon: "imgs/plugin/marketplace",
	CodePath: "bin/plugin.js",
	SDKVersion: 3,
	Software: { MinimumVersion: "7.1" },
	OS: [{ Platform: "windows", MinimumVersion: "10" }],
	Nodejs: { Version: "24", Debug: "disabled" },
	Actions: [
		...catalogue.categories.map((c) => action(c.id, c.name, c.tooltip)),
		...catalogue.dedicated.map((d) => action(d.command, d.name, d.tooltip)),
		action("custom", "Custom Shortcut", "Send any key combination to OrcaSlicer."),
	],
};
if (!manifest.URL) delete manifest.URL;
fs.writeFileSync(path.join(SD, "manifest.json"), JSON.stringify(manifest, null, "\t") + "\n");

console.log(`Built ${catalogue.commands.length} key images, ${catalogue.categories.length + 1} actions.`);
