import { createHash } from "node:crypto";
import { release } from "node:os";
import { fileURLToPath } from "node:url";
import vinext from "vinext";
import { defineConfig, loadEnv } from "vite";
import hostingConfig from "./.openai/hosting.json" with { type: "json" };
import { sites } from "./build/sites-vite-plugin.ts";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const isWslWindowsCheckout =
  process.platform === "linux" &&
  /microsoft/i.test(release()) &&
  /^\/mnt\/[a-z]\//i.test(projectRoot);

// WSL uses Linux rename semantics, but Windows can lock directories on /mnt/c.
// Keep optimizer commits on Linux storage, isolated by user and checkout.
// Use /tmp explicitly: the Sites build wrapper sets TMPDIR inside the project.
const cacheDir = isWslWindowsCheckout
  ? `/tmp/model-car-center-vite-${process.getuid!()}-${createHash("sha256").update(projectRoot).digest("hex").slice(0, 16)}`
  : undefined;

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
          migrations_dir: "drizzle",
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
  triggers: {
    crons: ["0 * * * *"],
  },
};

export default defineConfig(async ({ command, mode }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Auth and email links use SITE_URL. Keep the local server on that port
  // instead of letting Vite silently choose a different, untrusted origin.
  const siteUrl = command === "serve"
    ? new URL(loadEnv(mode, projectRoot, "SITE_URL").SITE_URL?.trim() || "http://localhost:5173")
    : undefined;
  const localPort = siteUrl && ["localhost", "127.0.0.1", "[::1]"].includes(siteUrl.hostname)
    ? Number(siteUrl.port || (siteUrl.protocol === "https:" ? 443 : 80))
    : undefined;

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    cacheDir,
    server: {
      host: "0.0.0.0",
      port: localPort,
      strictPort: true,
      allowedHosts: ["terminal.local"],
      watch: {
        // Runtime snapshots and generated files are large and change often.
        // Watching them adds startup work and can trigger unrelated reloads.
        ignored: [
          "**/.sites-runtime/**",
          "**/.wrangler/**",
          "**/.next/**",
          "**/dist/**",
          "**/coverage/**",
          "**/outputs/**",
          "**/work/**",
          "**/*.tsbuildinfo",
        ],
        // WSL misses Windows editor events on /mnt/c. Poll source files at a
        // modest interval so saving in the IDE still triggers Vite updates.
        ...(isCodexSeatbeltSandbox || isWslWindowsCheckout
          ? { useFsEvents: false, usePolling: true, interval: 500, binaryInterval: 1_000 }
          : {}),
      },
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
