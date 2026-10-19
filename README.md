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
- Keys 1–7, the matching numpad keys, and the mouse wheel switch the weapon menu: gun, grenades, bandage, barricade, and arm
- Left click shoots, throws the grenade in your hand, uses a bandage, places a barricade, or gathers with the arm
- Select the arm, stand beside a tree, rock, iron vein, or gold vein, and click to gather
- C opens the craft menu
- Select Barricade on the bottom panel. A faint preview shows where it will land. Left click places it if you have 3 wood, 2 stone, or 2 iron
- H uses a bandage

Trees yield wood, rocks yield stone, and the copper and yellow veins yield iron and gold. Craft grenades, bandages, and armor from those materials. Crafted armor equips immediately, each type can be made once per game, and heavier armor replaces light armor. Armor absorbs damage before health. A depleted node regrows after a short wait.

The barricade preview is only drawn for the player who has that slot selected. It does not stop bullets or movement. The placed barricade is shared with everyone else: it blocks movement and bullets, has 40 hit points, and breaks after a few shots, so a player shut inside can shoot their way out. Each player can keep 8 walls up.

The local player stays centered. The map, obstacles, and other players scroll around them. The server owns positions, collisions, hit detection, inventories, and crafting. Obstacles block both movement and bullets.

## Scripts

- `npm run dev` – client and server together
- `npm test` – shared simulation tests and room integration tests
- `npm run typecheck` – TypeScript across workspaces
- `npm run build` – production client build
