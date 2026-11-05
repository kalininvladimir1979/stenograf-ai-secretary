import { execFileSync } from "node:child_process";
import net from "node:net";

const port = 8012;
const container = "multibot-llm-gateway";

function gatewayAddress() {
  const address = execFileSync("docker", ["inspect", container, "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}"], { encoding: "utf8" }).trim();
  if (!address) throw new Error(`У контейнера ${container} нет внутреннего IP-адреса.`);
  return address;
}

const target = gatewayAddress();
const server = net.createServer((client) => {
  const upstream = net.connect({ host: target, port });
  client.pipe(upstream).pipe(client);
  const close = () => { client.destroy(); upstream.destroy(); };
  client.on("error", close);
  upstream.on("error", close);
});

server.listen(port, "127.0.0.1", () => console.log(`LLM Gateway loopback http://127.0.0.1:${port}`));
const stop = () => server.close(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
