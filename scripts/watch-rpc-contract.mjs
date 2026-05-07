import { readdir, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const watchPath = resolve(root, "packages/shared/src/rpc");
let child;
let snapshot = "";

async function readSnapshot() {
  const entries = await readdir(watchPath, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const stats = await Promise.all(
    files.map(async (file) => {
      const fileStat = await stat(resolve(watchPath, file));
      return `${file}:${fileStat.mtimeMs}`;
    })
  );

  return stats.join("|");
}

function runGenerate() {
  if (child) {
    child.kill();
  }

  child = spawn("pnpm", ["rpc:generate"], {
    cwd: root,
    stdio: "inherit"
  });

  child.on("exit", () => {
    child = undefined;
  });
}

async function poll() {
  const nextSnapshot = await readSnapshot();
  if (nextSnapshot !== snapshot) {
    snapshot = nextSnapshot;
    runGenerate();
  }
}

snapshot = await readSnapshot();
runGenerate();
setInterval(() => {
  void poll().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}, 500);
console.log(`Watching RPC contract sources in ${watchPath}`);
