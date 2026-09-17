# Authoritative .io Shooter

A 2D multiplayer shooter with a Phaser client and a Colyseus authoritative Node.js server.

## Stack

- Node.js 24 LTS
- TypeScript workspaces
- [Colyseus 0.18](https://docs.colyseus.io/) for rooms, WebSockets, prediction, and lag-compensated hitscan
- [Phaser 4](https://phaser.io/) for rendering and the follow camera

## Run locally

```bash
npm install
npm run dev
```

Then open two browser tabs at [http://localhost:5173](http://localhost:5173). The Colyseus server listens on `http://localhost:2567`.

## Controls

- WASD or arrow keys to move
- Mouse to aim
- Left click to shoot

The local player stays centered. The map, obstacles, and other players scroll around them. The server owns positions, collisions, and hit detection. Obstacles block both movement and bullets.

## Scripts

- `npm run dev` – client and server together
- `npm test` – shared simulation tests and room integration tests
- `npm run typecheck` – TypeScript across workspaces
- `npm run build` – production client build
