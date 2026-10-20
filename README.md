# Authoritative .io Shooter

A 2D battle royale shooter with a Phaser client and a Colyseus authoritative Node.js server. Players join a waiting room; the match starts 20 seconds after at least two people are ready. Last one standing wins.

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

Then open two browser tabs at [http://localhost:5173](http://localhost:5173) and press Play in each. You land in a waiting room; the battle starts 20 seconds after the second player joins. The Colyseus server listens on `http://localhost:2567`.

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

Smoke closes in from the map edges and corners toward the center, then finishes over the whole map so no safe spot remains. Standing in the smoke damages you, so players have to fight their way inward. There are no respawns. When you are eliminated, the camera freezes and an Exit button returns you to the menu. The last living player is the winner.

The local player stays centered until they die. The map, obstacles, and other players scroll around them. The server owns positions, collisions, hit detection, inventories, crafting, the match timer, and the smoke zone. Obstacles block both movement and bullets.

## Scripts

- `npm run dev` – client and server together
- `npm test` – shared simulation tests and room integration tests
- `npm run typecheck` – TypeScript across workspaces
- `npm run build` – production client build
