import net from "node:net";
import { defineConfig, loadEnv } from "vite";
import { nitroV2Plugin as nitro } from "@solidjs/vite-plugin-nitro-2";

import { solidStart } from "@solidjs/start/config";

function parsePort(rawPort: string, envKey: string): number {
  const parsedPort = Number.parseInt(rawPort, 10);

  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`Invalid ${envKey} value: ${rawPort}`);
  }

  return parsedPort;
}

function configuredPorts(env: Record<string, string>): number[] {
  const rawPorts = [env.PORT ?? "5173", env.PORT_FALLBACK ?? "5174"];

  return rawPorts
    .flatMap(rawValue => rawValue.split(","))
    .map(value => value.trim())
    .filter(Boolean)
    .map((value, index) => parsePort(value, index === 0 ? "PORT" : "PORT_FALLBACK"))
    .filter((value, index, values) => values.indexOf(value) === index);
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "127.0.0.1");
  });
}

async function resolveDevPort(env: Record<string, string>): Promise<number> {
  const ports = configuredPorts(env);

  for (const port of ports) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(
    `None of the configured frontend dev ports are available: ${ports.join(", ")}`,
  );
}

function buildApiProxy(target: string) {
  return {
    target,
    changeOrigin: true,
  };
}

export default defineConfig(async ({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiProxyTarget = env.VITE_DEV_API_PROXY_TARGET || "http://127.0.0.1:8080";

  return {
    plugins: [solidStart(), nitro({ preset: "vercel" })],
    server:
      command === "serve"
        ? {
            port: await resolveDevPort(env),
            strictPort: true,
            proxy: {
              "/auth": buildApiProxy(apiProxyTarget),
              "/markets": buildApiProxy(apiProxyTarget),
              "/events": buildApiProxy(apiProxyTarget),
              "/categories": buildApiProxy(apiProxyTarget),
              "/tags": buildApiProxy(apiProxyTarget),
            },
          }
        : undefined,
  };
});
