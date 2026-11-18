// Copies the OrcaSlicer icons the catalogue uses out of an OrcaSlicer source checkout into
// assets/orca-icons. Prefers each icon's *_dark.svg variant (drawn for dark backgrounds).
//   node scripts/vendor-orca-icons.mjs <path-to-OrcaSlicer-checkout>
import fs from "node:fs";
import path from "node:path";

const orca = process.argv[2];
if (!orca) {
	console.error("Usage: node scripts/vendor-orca-icons.mjs <path-to-OrcaSlicer-checkout>");
	process.exit(1);
}
const images = path.join(orca, "resources", "images");
const out = "assets/orca-icons";
const catalogue = JSON.parse(fs.readFileSync("src/catalogue.json", "utf8"));
const names = new Set([...catalogue.commands.map((c) => c.icon), ...catalogue.categories.map((c) => c.icon)].filter(Boolean));

fs.mkdirSync(out, { recursive: true });
let missing = 0;
for (const name of [...names].sort()) {
	const dark = path.join(images, `${name}_dark.svg`);
	const plain = path.join(images, `${name}.svg`);
	// Some *_dark.svg files are empty placeholders (just an invisible rect); skip those.
	const hasArt = (file) => fs.existsSync(file) && /<(path|circle|ellipse|line|polyline|polygon|text)\b/.test(fs.readFileSync(file, "utf8"));
	const from = hasArt(dark) ? dark : hasArt(plain) ? plain : undefined;
	if (!from) {
		console.warn(`missing: ${name}`);
		missing++;
		continue;
	}
	fs.copyFileSync(from, path.join(out, `${name}.svg`));
}
console.log(`copied ${names.size - missing} icons to ${out}${missing ? `, ${missing} missing` : ""}`);
