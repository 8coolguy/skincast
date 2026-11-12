import "./build.mjs";
import { setDefaultResultOrder } from "node:dns";
setDefaultResultOrder("ipv4first");
const { startServer } = await import("../server.mjs");
const server = await startServer();
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
