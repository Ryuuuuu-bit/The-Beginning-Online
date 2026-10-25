import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
const textureFile = fileURLToPath(
	new URL("./public/texture-manifest.json", import.meta.url),
);
function textureURLs() {
	const manifest = existsSync(textureFile)
		? JSON.parse(readFileSync(textureFile, "utf8"))
		: {};
	return {
		name: "painted-texture-urls",
		transform(code: string, id: string) {
			if (!id.endsWith(".css")) return;
			for (const [url, asset] of Object.entries(manifest) as [
				string,
				{ webp: string },
			][])
				code = code.replaceAll(url, asset.webp);
			return code;
		},
		transformIndexHtml(html: string) {
			for (const [url, asset] of Object.entries(manifest) as [
				string,
				{ webp: string },
			][])
				html = html.replaceAll(url, asset.webp);

			return html;
		},
	};
}
const buildId =
	process.env.VITE_BUILD_ID ||
	process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) ||
	new Date().toISOString().slice(0, 10);
export default defineConfig(({ command }) => ({
	plugins: [textureURLs()],
	define: {
		"import.meta.env.VITE_BUILD_ID": JSON.stringify(
			command === "build" ? buildId : "dev",
		),
	},
	server: {
		proxy: {
			"/api": { target: "http://127.0.0.1:8787", ws: true },
			"/healthz": "http://127.0.0.1:8787",
		},
		watch: { ignored: ["**/art/**", "**/public/assets/**"] },
	},
	build: {
		target: "es2022",
		rollupOptions: {
			input: {
				adminEconomy: fileURLToPath(new URL('./admin-economy.html',import.meta.url)),
				worldGuide: fileURLToPath(new URL('./world.html',import.meta.url)),
				items: fileURLToPath(new URL('./items.html',import.meta.url)),
				lootArt: fileURLToPath(new URL('./loot-art-review.html',import.meta.url)),
				cityLayoutEditor: fileURLToPath(new URL('./city-layout-editor.html',import.meta.url)),
				worldDesign: fileURLToPath(new URL('./world-design.html',import.meta.url)),
				portal: fileURLToPath(new URL("./index.html", import.meta.url)),
                bestiary: fileURLToPath(new URL("./monsters.html", import.meta.url)),
				login: fileURLToPath(new URL("./login.html", import.meta.url)),
				characters: fileURLToPath(
					new URL("./characters.html", import.meta.url),
				),
				play: fileURLToPath(new URL("./play.html", import.meta.url)),
				character: fileURLToPath(new URL("./character.html", import.meta.url)),
				equipmentPreview: fileURLToPath(new URL("./equipment-preview.html", import.meta.url)),
				shadowScene: fileURLToPath(new URL("./shadow-scene.html", import.meta.url)),
				cityReview: fileURLToPath(new URL("./city-2d-review.html", import.meta.url)),
				cityAssets: fileURLToPath(new URL("./city-assets-review.html", import.meta.url)),
				cityResidents: fileURLToPath(new URL("./city-residents-review.html", import.meta.url)),
			},
		},
	},
}));
