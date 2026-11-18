import commonjs from "@rollup/plugin-commonjs";
import json from "@rollup/plugin-json";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const isWatching = !!process.env.ROLLUP_WATCH;
const sdPlugin = "au.gkw.orcaslicer.sdPlugin";

/**
 * koffi is a native module, so it can't be bundled: copy just its Windows builds next to the plugin,
 * where Node's require() finds them (bin/node_modules/koffi).
 */
function copyKoffi() {
	return {
		name: "copy-koffi",
		writeBundle() {
			const from = "node_modules/koffi";
			const to = `${sdPlugin}/bin/node_modules/koffi`;
			fs.rmSync(to, { recursive: true, force: true });
			for (const file of ["package.json", "index.js", "LICENSE.txt"]) {
				fs.mkdirSync(to, { recursive: true });
				fs.copyFileSync(path.join(from, file), path.join(to, file));
			}
			for (const triplet of ["win32_x64", "win32_arm64"]) {
				const dir = path.join(to, "build/koffi", triplet);
				fs.mkdirSync(dir, { recursive: true });
				fs.copyFileSync(path.join(from, "build/koffi", triplet, "koffi.node"), path.join(dir, "koffi.node"));
			}
		},
	};
}

/** @type {import('rollup').RollupOptions} */
export default {
	input: "src/plugin.ts",
	external: ["koffi"],
	output: {
		file: `${sdPlugin}/bin/plugin.js`,
		sourcemap: isWatching,
		sourcemapPathTransform: (relativeSourcePath, sourcemapPath) =>
			url.pathToFileURL(path.resolve(path.dirname(sourcemapPath), relativeSourcePath)).href,
	},
	plugins: [
		{
			name: "watch-externals",
			buildStart() {
				this.addWatchFile(`${sdPlugin}/manifest.json`);
			},
		},
		typescript({ mapRoot: isWatching ? "./" : undefined, noEmit: false, outDir: undefined }),
		json(),
		nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
		commonjs(),
		!isWatching && terser(),
		copyKoffi(),
		{
			name: "emit-module-package-file",
			generateBundle() {
				this.emitFile({ fileName: "package.json", source: `{ "type": "module" }`, type: "asset" });
			},
		},
	],
};
