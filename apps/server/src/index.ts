import { createGameServer } from "./app.config";

const port = Number.parseInt(process.env.PORT ?? "2567", 10);
const server = createGameServer();

await server.listen(port);
console.log(`Game server listening on http://localhost:${port}`);
