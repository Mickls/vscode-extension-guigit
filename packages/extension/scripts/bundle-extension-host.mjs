import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: ["src/extension/activate.ts"],
  external: ["vscode"],
  format: "cjs",
  logLevel: "info",
  outfile: "out/extension/activate.js",
  platform: "node",
  sourcemap: false,
  target: "node16"
});
