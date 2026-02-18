import Phaser from 'phaser';
import { MAP_WIDTH, MAP_HEIGHT, ROOMS, getFurniture, COLLISION_RECTS } from './OfficeMap';

const SPEED = 160;
const SPRINT_MULT = 1.8;
const LPC_FRAME_W = 64;
const LPC_FRAME_H = 64;
const LPC_COLS = 9;
// LPC row order: 0=up, 1=left, 2=down, 3=right
const LPC_DIR_ROW: Record<string, number> = { up: 0, left: 1, down: 2, right: 3 };

// Character layer definitions for compositing
interface CharacterDef {
    name: string;
    layers: string[];  // layer filenames in render order (bottom to top)
    startX: number;
    startY: number;
}

const PLAYER_DEF: CharacterDef = {
    name: 'You',
    layers: ['BODY_male', 'LEGS_pants_greenish', 'TORSO_leather_armor_shirt_white', 'FEET_shoes_brown', 'HEAD_hair_blonde'],
    startX: 680,
    startY: 700,
};

const NPC_DEFS: CharacterDef[] = [
    {
        name: 'Alice', startX: 1200, startY: 620,
        layers: ['BODY_male', 'LEGS_plate_armor_pants', 'TORSO_chain_armor_torso', 'FEET_plate_armor_shoes', 'HEAD_chain_armor_helmet'],
    },
    {
        name: 'Bob', startX: 500, startY: 740,
        layers: ['BODY_male', 'LEGS_pants_greenish', 'TORSO_leather_armor_torso', 'TORSO_leather_armor_bracers', 'TORSO_leather_armor_shoulders', 'FEET_shoes_brown', 'HEAD_leather_armor_hat'],
    },
    {
        name: 'Charlie', startX: 1400, startY: 980,
        layers: ['BODY_male', 'LEGS_robe_skirt', 'TORSO_robe_shirt_brown', 'HEAD_robe_hood'],
    },
    {
        name: 'Diana', startX: 1900, startY: 600,
        layers: ['BODY_male', 'LEGS_plate_armor_pants', 'TORSO_plate_armor_torso', 'TORSO_plate_armor_arms_shoulders', 'FEET_plate_armor_shoes', 'HANDS_plate_armor_gloves', 'HEAD_plate_armor_helmet'],
    },
    {
        name: 'Eve', startX: 600, startY: 250,
        layers: ['BODY_male', 'LEGS_pants_greenish', 'TORSO_leather_armor_shirt_white', 'BELT_rope', 'FEET_shoes_brown', 'HEAD_hair_blonde', 'BEHIND_quiver'],
    },
    {
        name: 'Frank', startX: 1900, startY: 1000,
        layers: ['BODY_skeleton'],
    },
    {
        name: 'Grace', startX: 700, startY: 1200,
        layers: ['BODY_male', 'LEGS_pants_greenish', 'TORSO_chain_armor_jacket_purple', 'BELT_leather', 'FEET_shoes_brown', 'HEAD_chain_armor_hood'],
    },
    {
        name: 'Henry', startX: 1300, startY: 1100,
        layers: ['BODY_male', 'LEGS_robe_skirt', 'TORSO_robe_shirt_brown', 'FEET_shoes_brown', 'HEAD_robe_hood', 'BEHIND_quiver'],
    },
];

// Collect all unique layer filenames
function getAllLayerNames(): string[] {
    const set = new Set<string>();
    [PLAYER_DEF, ...NPC_DEFS].forEach(def => def.layers.forEach(l => set.add(l)));
    return Array.from(set);
}

interface NpcData {
    composite: Phaser.GameObjects.Container;
    sprites: Phaser.GameObjects.Sprite[];
    nameTag: Phaser.GameObjects.Text;
    statusDot: Phaser.GameObjects.Arc;
    shadow: Phaser.GameObjects.Ellipse;
    targetX: number;
    targetY: number;
    speed: number;
    timer: number;
    name: string;
    facing: string;
    isMoving: boolean;
    def: CharacterDef;
}

export default class OfficeScene extends Phaser.Scene {
    private playerContainer!: Phaser.GameObjects.Container;
    private playerSprites: Phaser.GameObjects.Sprite[] = [];
    private playerShadow!: Phaser.GameObjects.Ellipse;
    private playerNameTag!: Phaser.GameObjects.Text;
    private playerDot!: Phaser.GameObjects.Arc;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
    private facing = 'down';
    private npcs: NpcData[] = [];
    private minimap!: Phaser.Cameras.Scene2D.Camera;
    private proximityTexts: Phaser.GameObjects.Text[] = [];

    constructor() {
        super('OfficeScene');
    }

    preload() {
        // Load all unique LPC layer spritesheets
        const allLayers = getAllLayerNames();
        allLayers.forEach(layer => {
            this.load.spritesheet(layer,
                `/sprites/lpc/walkcycle/${layer}.png`,
                { frameWidth: LPC_FRAME_W, frameHeight: LPC_FRAME_H }
            );
        });

        // Load tilesets
        this.load.image('tileset_grasslands', '/sprites/spritesheets/grasslands.png');
        this.load.image('tileset_village', '/sprites/spritesheets/village.png');
        this.load.image('tileset_ground', '/sprites/spritesheets/ground.png');
    }

    create() {
        this.cameras.main.setBackgroundColor('#5a8a3a');

        this.createAnimationsForAllLayers();
        this.drawEnvironment();
        this.createPlayer();
        this.createNPCs();
        this.createAmbientEffects();
        this.setupCamera();
        this.setupInput();
        this.createMinimap();
        this.createUI();
    }

    private createAnimationsForAllLayers() {
        const allLayers = getAllLayerNames();
        allLayers.forEach(layer => {
            // Walk animations for each direction
            ['up', 'left', 'down', 'right'].forEach(dir => {
                const row = LPC_DIR_ROW[dir];
                this.anims.create({
                    key: `${layer}_walk_${dir}`,
                    frames: this.anims.generateFrameNumbers(layer, {
                        start: row * LPC_COLS + 1,
                        end: row * LPC_COLS + 8,
                    }),
                    frameRate: 10,
                    repeat: -1,
                });
                this.anims.create({
                    key: `${layer}_idle_${dir}`,
                    frames: [{ key: layer, frame: row * LPC_COLS }],
                    frameRate: 1,
                });
            });
        });
    }

    // Create a composited character from multiple layers
    private createCompositeCharacter(def: CharacterDef, x: number, y: number, depth: number): { container: Phaser.GameObjects.Container; sprites: Phaser.GameObjects.Sprite[] } {
        const container = this.add.container(x, y);
        const sprites: Phaser.GameObjects.Sprite[] = [];

        def.layers.forEach((layer, idx) => {
            const sprite = this.add.sprite(0, 0, layer);
            sprite.play(`${layer}_idle_down`);
            sprites.push(sprite);
            container.add(sprite);
        });

        container.setDepth(depth);
        container.setSize(LPC_FRAME_W, LPC_FRAME_H);
        return { container, sprites };
    }

    // Play an animation on all layers of a composite character
    private playCompositeAnim(sprites: Phaser.GameObjects.Sprite[], def: CharacterDef, animType: string, dir: string) {
        def.layers.forEach((layer, idx) => {
            const key = `${layer}_${animType}_${dir}`;
            if (sprites[idx] && this.anims.exists(key)) {
                sprites[idx].play(key, true);
            }
        });
    }

    private drawEnvironment() {
        const g = this.add.graphics();

        // Base grass
        g.fillStyle(0x5a8a3a);
        g.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

        // Grass texture
        for (let i = 0; i < 2000; i++) {
            const shade = Phaser.Math.Between(0, 2);
            const colors = [0x4a7a2a, 0x6a9a4a, 0x7aaa5a];
            g.fillStyle(colors[shade], 0.35);
            g.fillCircle(Phaser.Math.Between(0, MAP_WIDTH), Phaser.Math.Between(0, MAP_HEIGHT), Phaser.Math.Between(1, 3));
        }

        // Flower clusters
        for (let i = 0; i < 100; i++) {
            const fx = Phaser.Math.Between(20, MAP_WIDTH - 20);
            const fy = Phaser.Math.Between(20, MAP_HEIGHT - 20);
            const flowerColors = [0xff6666, 0xffaa44, 0xff66aa, 0x66aaff, 0xffff66, 0xaa66ff];
            g.fillStyle(flowerColors[i % 6], 0.6);
            g.fillCircle(fx, fy, 2);
            g.fillStyle(0x4a9a3a, 0.5);
            g.fillCircle(fx + 2, fy + 2, 1.5);
        }

        // Dirt paths between rooms
        this.drawPaths(g);

        // Rooms
        ROOMS.forEach(room => this.drawRoom(g, room));

        // Furniture
        getFurniture().forEach(f => this.drawFurnitureItem(g, f));
    }

    private drawPaths(g: Phaser.GameObjects.Graphics) {
        const pathColor = 0xc8b088;
        const paths = [
            { x: 600, y: 380, w: 100, h: 100 },
            { x: 960, y: 560, w: 80, h: 120 },
            { x: 560, y: 960, w: 100, h: 80 },
            { x: 1200, y: 800, w: 80, h: 80 },
            { x: 1520, y: 560, w: 240, h: 80 },
            { x: 1680, y: 640, w: 80, h: 240 },
            { x: 1680, y: 960, w: 80, h: 80 },
        ];

        paths.forEach(p => {
            // Path shadow
            g.fillStyle(0x000000, 0.08);
            g.fillRoundedRect(p.x + 2, p.y + 2, p.w, p.h, 4);
            // Path base
            g.fillStyle(pathColor, 0.9);
            g.fillRoundedRect(p.x, p.y, p.w, p.h, 4);
            // Path detail
            for (let i = 0; i < 8; i++) {
                g.fillStyle(0xb09060, 0.3);
                g.fillCircle(
                    Phaser.Math.Between(p.x + 8, p.x + p.w - 8),
                    Phaser.Math.Between(p.y + 8, p.y + p.h - 8),
                    Phaser.Math.Between(1, 3)
                );
            }
        });
    }

    private drawRoom(g: Phaser.GameObjects.Graphics, room: typeof ROOMS[0]) {
        // Wall shadow
        g.fillStyle(0x000000, 0.2);
        g.fillRoundedRect(room.x + 8, room.y + 8, room.w, room.h, 4);

        // Outer wall
        g.fillStyle(room.wallColor);
        g.fillRoundedRect(room.x - 10, room.y - 10, room.w + 20, room.h + 20, 3);

        // Inner wall trim
        const trimColor = Math.min(room.wallColor + 0x151515, 0xffffff);
        g.fillStyle(trimColor);
        g.fillRoundedRect(room.x - 6, room.y - 6, room.w + 12, room.h + 12, 2);

        // Floor
        g.fillStyle(room.floorColor);
        g.fillRect(room.x, room.y, room.w, room.h);

        // Floor patterns
        switch (room.type) {
            case 'lobby':
            case 'lounge':
                for (let tx = room.x; tx < room.x + room.w; tx += 48) {
                    for (let ty = room.y; ty < room.y + room.h; ty += 48) {
                        const alt = ((tx - room.x) / 48 + (ty - room.y) / 48) % 2 === 0;
                        g.fillStyle(0x000000, alt ? 0.04 : 0.08);
                        g.fillRect(tx, ty, 24, 48);
                        g.fillRect(tx + 24, ty, 24, 48);
                    }
                }
                break;
            case 'outdoor':
                for (let i = 0; i < 300; i++) {
                    g.fillStyle(Phaser.Math.Between(0, 1) ? 0x4a7a2a : 0x6aaa4a, 0.3);
                    g.fillCircle(
                        Phaser.Math.Between(room.x + 4, room.x + room.w - 4),
                        Phaser.Math.Between(room.y + 4, room.y + room.h - 4),
                        Phaser.Math.Between(1, 4)
                    );
                }
                for (let i = 0; i < 25; i++) {
                    const fc = [0xff6666, 0xffaa44, 0xff66ff, 0x6666ff, 0xffff44];
                    g.fillStyle(fc[i % 5], 0.7);
                    const fx = Phaser.Math.Between(room.x + 20, room.x + room.w - 20);
                    const fy = Phaser.Math.Between(room.y + 20, room.y + room.h - 20);
                    g.fillCircle(fx, fy, 3);
                    g.fillCircle(fx + 3, fy - 2, 2);
                }
                break;
            case 'meeting':
                g.fillStyle(0x8a6a5a, 0.3);
                g.fillRoundedRect(room.x + 16, room.y + 16, room.w - 32, room.h - 32, 6);
                g.lineStyle(2, 0x7a5a4a, 0.2);
                g.strokeRoundedRect(room.x + 28, room.y + 28, room.w - 56, room.h - 56, 4);
                break;
            case 'kitchen':
                for (let tx = room.x; tx < room.x + room.w; tx += 32) {
                    for (let ty = room.y; ty < room.y + room.h; ty += 32) {
                        g.fillStyle(0x000000, ((tx - room.x) / 32 + (ty - room.y) / 32) % 2 === 0 ? 0.02 : 0.06);
                        g.fillRect(tx, ty, 32, 32);
                        g.lineStyle(0.5, 0x000000, 0.06);
                        g.strokeRect(tx, ty, 32, 32);
                    }
                }
                break;
            default:
                for (let ty = room.y; ty < room.y + room.h; ty += 16) {
                    g.lineStyle(0.5, 0x000000, 0.06);
                    g.lineBetween(room.x, ty, room.x + room.w, ty);
                }
        }

        // Doorways
        if (room.type !== 'outdoor') {
            g.fillStyle(room.floorColor);
            g.fillRect(room.x + room.w / 2 - 30, room.y + room.h - 2, 60, 14);
            g.fillRect(room.x + room.w / 2 - 30, room.y - 10, 60, 14);
            g.fillRect(room.x - 10, room.y + room.h / 2 - 30, 14, 60);
            g.fillRect(room.x + room.w - 2, room.y + room.h / 2 - 30, 14, 60);
        }

        // Room label
        this.add.text(room.x + room.w / 2, room.y + room.h - 16, room.label, {
            fontFamily: 'monospace', fontSize: '11px', color: '#00000033',
            fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(5);
    }

    private drawFurnitureItem(g: Phaser.GameObjects.Graphics, f: { x: number; y: number; w: number; h: number; color: number; type: string; label?: string }) {
        g.fillStyle(0x000000, 0.15);
        g.fillRoundedRect(f.x + 4, f.y + 4, f.w, f.h, 3);
        g.fillStyle(f.color);
        g.fillRoundedRect(f.x, f.y, f.w, f.h, 3);

        switch (f.type) {
            case 'desk':
                g.fillStyle(Math.min(f.color + 0x111111, 0xffffff));
                g.fillRect(f.x + 4, f.y + 4, f.w - 8, f.h - 8);
                g.fillStyle(0x222233);
                g.fillRoundedRect(f.x + f.w / 2 - 18, f.y + 6, 36, 24, 2);
                g.fillStyle(0x3366aa);
                g.fillRect(f.x + f.w / 2 - 16, f.y + 8, 32, 20);
                g.fillStyle(0x88bbff, 0.15);
                g.fillRect(f.x + f.w / 2 - 20, f.y + 4, 40, 28);
                g.fillStyle(0x444455);
                g.fillRoundedRect(f.x + f.w / 2 - 14, f.y + 34, 28, 10, 2);
                break;
            case 'chair':
                g.fillStyle(0x000000, 0.1);
                g.fillCircle(f.x + f.w / 2, f.y + f.h / 2, f.w / 2.2);
                g.fillStyle(Math.min(f.color + 0x222222, 0xffffff));
                g.fillCircle(f.x + f.w / 2, f.y + f.h / 2, f.w / 2.8);
                for (let a = 0; a < 5; a++) {
                    const angle = (a / 5) * Math.PI * 2;
                    g.fillStyle(0x333333);
                    g.fillCircle(f.x + f.w / 2 + Math.cos(angle) * (f.w / 2.5), f.y + f.h / 2 + Math.sin(angle) * (f.h / 2.5), 2);
                }
                break;
            case 'couch':
                g.fillStyle(Math.max(f.color - 0x222222, 0));
                g.fillRoundedRect(f.x, f.y, f.w, 20, 6);
                g.fillStyle(Math.min(f.color + 0x111111, 0xffffff));
                g.fillRoundedRect(f.x + 6, f.y + 18, f.w / 2 - 8, f.h - 24, 4);
                g.fillRoundedRect(f.x + f.w / 2 + 2, f.y + 18, f.w / 2 - 8, f.h - 24, 4);
                g.fillStyle(Math.max(f.color - 0x111111, 0));
                g.fillRoundedRect(f.x, f.y + 16, 8, f.h - 20, 3);
                g.fillRoundedRect(f.x + f.w - 8, f.y + 16, 8, f.h - 20, 3);
                break;
            case 'plant':
                g.fillStyle(0x8a5a3a);
                g.fillRoundedRect(f.x + 10, f.y + 28, 28, 18, 3);
                g.fillStyle(0x9a6a4a);
                g.fillRect(f.x + 8, f.y + 26, 32, 6);
                g.fillStyle(0x2a8a2a);
                g.fillCircle(f.x + 24, f.y + 16, 16);
                g.fillStyle(0x3a9a3a);
                g.fillCircle(f.x + 18, f.y + 12, 12);
                g.fillCircle(f.x + 30, f.y + 12, 11);
                g.fillStyle(0x4aaa4a);
                g.fillCircle(f.x + 24, f.y + 8, 8);
                break;
            case 'tree':
                g.fillStyle(0x5a3a1a);
                g.fillRoundedRect(f.x + 22, f.y + 34, 20, 30, 3);
                g.fillStyle(0x000000, 0.1);
                g.fillEllipse(f.x + 32, f.y + 62, 40, 10);
                g.fillStyle(0x1a6a1a);
                g.fillCircle(f.x + 32, f.y + 22, 30);
                g.fillStyle(0x2a7a2a);
                g.fillCircle(f.x + 24, f.y + 16, 22);
                g.fillCircle(f.x + 40, f.y + 18, 20);
                g.fillStyle(0x3a8a3a);
                g.fillCircle(f.x + 32, f.y + 10, 16);
                break;
            case 'conf_table':
                g.fillStyle(0x000000, 0.06);
                g.fillRoundedRect(f.x + 8, f.y + 8, f.w - 16, f.h - 16, 6);
                g.fillStyle(0xeeeeee);
                g.fillRoundedRect(f.x + 20, f.y + f.h / 2 - 8, 20, 12, 2);
                break;
            case 'whiteboard':
                g.lineStyle(3, 0x888888);
                g.strokeRect(f.x + 2, f.y + 2, f.w - 4, f.h - 4);
                g.fillStyle(0xfafafa);
                g.fillRect(f.x + 5, f.y + 5, f.w - 10, f.h - 10);
                g.lineStyle(1.5, 0x3366aa, 0.5);
                g.lineBetween(f.x + 12, f.y + 20, f.x + f.w - 16, f.y + 28);
                g.lineStyle(1.5, 0xcc3333, 0.4);
                g.lineBetween(f.x + 12, f.y + 40, f.x + f.w - 20, f.y + 38);
                g.fillStyle(0xaaaaaa);
                g.fillRect(f.x + 10, f.y + f.h - 8, f.w - 20, 4);
                break;
            case 'bookshelf':
                for (let row = 0; row < 4; row++) {
                    g.fillStyle(0x6a4a2a);
                    g.fillRect(f.x + 4, f.y + 6 + row * 38, f.w - 8, 3);
                    const bColors = [0xaa2222, 0x2222aa, 0x22aa22, 0xaaaa22, 0xaa22aa];
                    for (let col = 0; col < 4; col++) {
                        g.fillStyle(bColors[(row * 4 + col) % bColors.length]);
                        g.fillRect(f.x + 8 + col * 17, f.y + 10 + row * 38, Phaser.Math.Between(8, 14), 32);
                    }
                }
                break;
            case 'arcade':
                g.fillStyle(0x222244);
                g.fillRoundedRect(f.x + 4, f.y + 4, f.w - 8, f.h - 8, 4);
                g.fillStyle(0x001100);
                g.fillRect(f.x + 10, f.y + 8, f.w - 20, f.h / 3);
                g.fillStyle(0x00ff00, 0.8);
                for (let px = 0; px < 5; px++) for (let py = 0; py < 3; py++) {
                    if (Math.random() > 0.4) g.fillRect(f.x + 14 + px * 8, f.y + 12 + py * 8, 6, 6);
                }
                g.fillStyle(0xcc0000);
                g.fillCircle(f.x + f.w / 2 - 8, f.y + f.h - 20, 5);
                g.fillStyle(0x0000cc);
                g.fillCircle(f.x + f.w / 2 + 8, f.y + f.h - 20, 5);
                this.add.text(f.x + f.w / 2, f.y - 10, 'ARCADE', {
                    fontSize: '8px', fontFamily: 'monospace', color: '#ffcc00', fontStyle: 'bold',
                }).setOrigin(0.5).setDepth(5);
                break;
            case 'water_cooler':
                g.fillStyle(0x88ccff, 0.8);
                g.fillRoundedRect(f.x + 12, f.y + 4, 36, 28, 8);
                g.fillStyle(0xcccccc);
                g.fillRoundedRect(f.x + 8, f.y + 30, 44, f.h - 34, 3);
                break;
            case 'fountain':
                g.fillStyle(0x6699bb);
                g.fillCircle(f.x + 24, f.y + 28, 24);
                g.fillStyle(0x77aacc);
                g.fillCircle(f.x + 24, f.y + 28, 18);
                g.fillStyle(0x99ccee, 0.7);
                g.fillCircle(f.x + 24, f.y + 26, 14);
                g.fillStyle(0xaaaaaa);
                g.fillRect(f.x + 20, f.y + 12, 8, 20);
                g.fillStyle(0xccddff, 0.5);
                g.fillCircle(f.x + 24, f.y + 10, 6);
                break;
            case 'bench':
                g.fillStyle(0x7a5a3a);
                g.fillRoundedRect(f.x, f.y + 12, f.w, 16, 3);
                g.fillStyle(0x6a4a2a);
                g.fillRoundedRect(f.x + 4, f.y, f.w - 8, 14, 3);
                g.fillStyle(0x5a3a1a);
                g.fillRect(f.x + 6, f.y + 28, 6, 20);
                g.fillRect(f.x + f.w - 12, f.y + 28, 6, 20);
                break;
            case 'counter':
                g.fillStyle(0xbbbbbb);
                g.fillRoundedRect(f.x, f.y, f.w, f.h, 2);
                g.fillStyle(0x999999);
                g.fillRoundedRect(f.x + f.w / 2 - 20, f.y + 8, 40, 30, 4);
                g.fillStyle(0x7799bb);
                g.fillRoundedRect(f.x + f.w / 2 - 16, f.y + 12, 32, 22, 3);
                break;
            case 'fridge':
                g.fillStyle(0xdddddd);
                g.fillRoundedRect(f.x, f.y, f.w, f.h, 3);
                g.lineStyle(1, 0xbbbbbb);
                g.lineBetween(f.x, f.y + f.h * 0.4, f.x + f.w, f.y + f.h * 0.4);
                g.fillStyle(0x999999);
                g.fillRect(f.x + f.w - 8, f.y + 10, 3, 16);
                break;
            case 'welcome_mat':
                g.fillStyle(0xccccdd, 0.6);
                g.fillRoundedRect(f.x, f.y, f.w, f.h, 8);
                g.lineStyle(1, 0xaaaabb, 0.4);
                for (let i = 0; i < f.w; i += 16) {
                    g.lineBetween(f.x + i, f.y, f.x + i + 8, f.y + f.h / 2);
                    g.lineBetween(f.x + i + 8, f.y + f.h / 2, f.x + i, f.y + f.h);
                }
                this.add.text(f.x + f.w / 2, f.y + f.h / 2, 'WELCOME', {
                    fontSize: '10px', fontFamily: 'monospace', color: '#88888866', fontStyle: 'bold',
                }).setOrigin(0.5).setDepth(5);
                break;
            case 'lamp':
                g.fillStyle(0xffee88, 0.15);
                g.fillCircle(f.x + f.w / 2, f.y + f.h / 2, 48);
                g.fillStyle(0xffee88, 0.25);
                g.fillCircle(f.x + f.w / 2, f.y + f.h / 2, 28);
                g.fillStyle(0xffeecc);
                g.fillRoundedRect(f.x + 4, f.y, f.w - 8, 18, 4);
                g.fillStyle(0xffff88, 0.8);
                g.fillCircle(f.x + f.w / 2, f.y + 8, 5);
                break;
            case 'table':
                g.fillStyle(Math.min(f.color + 0x111111, 0xffffff));
                g.fillRoundedRect(f.x + 4, f.y + 4, f.w - 8, f.h - 8, 4);
                g.fillStyle(0xeeeeee);
                g.fillCircle(f.x + f.w / 2, f.y + f.h / 2, 8);
                break;
        }

        if (f.label && f.type !== 'welcome_mat') {
            this.add.text(f.x + f.w / 2, f.y - 12, f.label, {
                fontSize: '9px', fontFamily: 'monospace', color: '#666666',
            }).setOrigin(0.5).setDepth(5);
        }
    }

    private createPlayer() {
        const { container, sprites } = this.createCompositeCharacter(PLAYER_DEF, PLAYER_DEF.startX, PLAYER_DEF.startY, 100);
        this.playerContainer = container;
        this.playerSprites = sprites;

        // Shadow
        this.playerShadow = this.add.ellipse(PLAYER_DEF.startX, PLAYER_DEF.startY + 28, 32, 10, 0x000000, 0.25).setDepth(99);

        // Name tag
        this.playerNameTag = this.add.text(PLAYER_DEF.startX, PLAYER_DEF.startY - 36, '  You  ', {
            fontSize: '11px', fontFamily: 'system-ui, sans-serif',
            color: '#ffffff', backgroundColor: '#4f46e5cc',
            padding: { x: 6, y: 2 },
        }).setOrigin(0.5).setDepth(101);

        // Online dot
        this.playerDot = this.add.circle(0, 0, 4, 0x22cc66).setDepth(102);
        this.tweens.add({
            targets: this.playerDot, scale: { from: 0.8, to: 1.2 },
            duration: 600, yoyo: true, repeat: -1,
        });
    }

    private createNPCs() {
        NPC_DEFS.forEach(def => {
            const { container, sprites } = this.createCompositeCharacter(def, def.startX, def.startY, 50);
            const shadow = this.add.ellipse(def.startX, def.startY + 28, 28, 8, 0x000000, 0.2).setDepth(49);

            const nameTag = this.add.text(def.startX, def.startY - 36, ` ${def.name} `, {
                fontSize: '9px', fontFamily: 'system-ui, sans-serif',
                color: '#ffffff', backgroundColor: '#333333bb',
                padding: { x: 4, y: 1 },
            }).setOrigin(0.5).setDepth(51);

            const statusDot = this.add.circle(0, 0, 3, 0x22cc66).setDepth(52);

            this.npcs.push({
                composite: container, sprites, nameTag, statusDot, shadow, def,
                targetX: def.startX, targetY: def.startY,
                speed: Phaser.Math.Between(30, 55),
                timer: Phaser.Math.Between(1500, 5000),
                name: def.name,
                facing: 'down',
                isMoving: false,
            });
        });
    }

    private createAmbientEffects() {
        const pg = this.add.graphics();
        pg.fillStyle(0x88aa44, 0.7);
        pg.fillEllipse(2, 2, 4, 3);
        pg.generateTexture('leaf', 4, 4);
        pg.destroy();

        this.add.particles(0, 0, 'leaf', {
            x: { min: 320, max: 1120 }, y: { min: 80, max: 400 },
            lifespan: 6000, speed: { min: 5, max: 20 },
            scale: { start: 1, end: 0.3 }, alpha: { start: 0.5, end: 0 },
            frequency: 1200, rotate: { min: 0, max: 360 },
            gravityY: 3, blendMode: 'NORMAL',
        }).setDepth(200);

        const dust = this.add.graphics();
        dust.fillStyle(0xffeecc, 0.5);
        dust.fillCircle(1, 1, 1);
        dust.generateTexture('dust', 2, 2);
        dust.destroy();

        this.add.particles(0, 0, 'dust', {
            x: { min: 320, max: 960 }, y: { min: 480, max: 960 },
            lifespan: 3000, speed: { min: 2, max: 8 },
            scale: { start: 1.5, end: 0 }, alpha: { start: 0.3, end: 0 },
            frequency: 2000, blendMode: 'ADD',
        }).setDepth(150);
    }

    private setupCamera() {
        this.cameras.main.startFollow(this.playerContainer, true, 0.08, 0.08);
        this.cameras.main.setZoom(1.8);
        this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    }

    private setupInput() {
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.wasd = {
            w: this.input.keyboard!.addKey('W'),
            a: this.input.keyboard!.addKey('A'),
            s: this.input.keyboard!.addKey('S'),
            d: this.input.keyboard!.addKey('D'),
        };

        // Prevent browser default for arrow keys and space (scrolling)
        this.input.keyboard!.addCapture([
            Phaser.Input.Keyboard.KeyCodes.UP,
            Phaser.Input.Keyboard.KeyCodes.DOWN,
            Phaser.Input.Keyboard.KeyCodes.LEFT,
            Phaser.Input.Keyboard.KeyCodes.RIGHT,
            Phaser.Input.Keyboard.KeyCodes.SPACE,
        ]);
    }

    private createMinimap() {
        this.minimap = this.cameras.add(10, 10, 200, 150)
            .setZoom(0.083).setName('minimap')
            .setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT)
            .setBackgroundColor(0x1a1a2e).setAlpha(0.9);
        this.minimap.startFollow(this.playerContainer);
        this.minimap.setRoundPixels(true);
    }

    private createUI() {
        this.add.text(16, 175, '🏢 Virtual Office\nArrow Keys / WASD to move\nHold Shift to sprint', {
            fontSize: '10px', fontFamily: 'system-ui, sans-serif',
            color: '#ffffffcc', backgroundColor: '#1a1a2ecc',
            padding: { x: 8, y: 6 }, lineSpacing: 4,
        }).setScrollFactor(0).setDepth(1000);
    }

    update(_time: number, delta: number) {
        this.handleMovement(delta);
        this.updateNPCs(delta);
        this.updateOverlays();
        this.checkProximity();
    }

    private handleMovement(delta: number) {
        let vx = 0, vy = 0;
        if (this.cursors.left.isDown || this.wasd.a.isDown) vx = -1;
        else if (this.cursors.right.isDown || this.wasd.d.isDown) vx = 1;
        if (this.cursors.up.isDown || this.wasd.w.isDown) vy = -1;
        else if (this.cursors.down.isDown || this.wasd.s.isDown) vy = 1;

        if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

        const shift = this.input.keyboard!.addKey('SHIFT').isDown;
        const speed = shift ? SPEED * SPRINT_MULT : SPEED;
        const isMoving = vx !== 0 || vy !== 0;

        if (isMoving) {
            let dir = this.facing;
            if (vy < 0) dir = 'up';
            else if (vy > 0) dir = 'down';
            else if (vx < 0) dir = 'left';
            else if (vx > 0) dir = 'right';

            if (dir !== this.facing || !this.playerSprites[0]?.anims?.isPlaying || !this.playerSprites[0]?.anims?.currentAnim?.key?.includes('walk')) {
                this.facing = dir;
                this.playCompositeAnim(this.playerSprites, PLAYER_DEF, 'walk', dir);
                if (shift) {
                    this.playerSprites.forEach(s => { if (s.anims) s.anims.timeScale = 1.6; });
                } else {
                    this.playerSprites.forEach(s => { if (s.anims) s.anims.timeScale = 1; });
                }
            }

            const dx = vx * speed * (delta / 1000);
            const dy = vy * speed * (delta / 1000);
            const newX = Phaser.Math.Clamp(this.playerContainer.x + dx, 32, MAP_WIDTH - 32);
            const newY = Phaser.Math.Clamp(this.playerContainer.y + dy, 32, MAP_HEIGHT - 32);

            let canX = true, canY = true;
            COLLISION_RECTS.forEach(r => {
                if (newX + 16 > r.x && newX - 16 < r.x + r.w &&
                    this.playerContainer.y + 16 > r.y && this.playerContainer.y - 16 < r.y + r.h) canX = false;
                if (this.playerContainer.x + 16 > r.x && this.playerContainer.x - 16 < r.x + r.w &&
                    newY + 16 > r.y && newY - 16 < r.y + r.h) canY = false;
            });

            if (canX) this.playerContainer.x = newX;
            if (canY) this.playerContainer.y = newY;
        } else {
            if (this.playerSprites[0]?.anims?.isPlaying && this.playerSprites[0]?.anims?.currentAnim?.key?.includes('walk')) {
                this.playCompositeAnim(this.playerSprites, PLAYER_DEF, 'idle', this.facing);
            }
        }
    }

    private updateOverlays() {
        const px = this.playerContainer.x;
        const py = this.playerContainer.y;
        this.playerShadow.setPosition(px, py + 28);
        this.playerNameTag.setPosition(px, py - 36);
        this.playerDot.setPosition(px + this.playerNameTag.width / 2 + 6, py - 36);
    }

    private updateNPCs(delta: number) {
        this.npcs.forEach(npc => {
            npc.timer -= delta;
            if (npc.timer <= 0) {
                npc.targetX = Phaser.Math.Clamp(npc.composite.x + Phaser.Math.Between(-120, 120), 50, MAP_WIDTH - 50);
                npc.targetY = Phaser.Math.Clamp(npc.composite.y + Phaser.Math.Between(-120, 120), 50, MAP_HEIGHT - 50);
                npc.timer = Phaser.Math.Between(2500, 6000);
                npc.isMoving = true;
            }

            const dx = npc.targetX - npc.composite.x;
            const dy = npc.targetY - npc.composite.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 6 && npc.isMoving) {
                npc.composite.x += (dx / dist) * npc.speed * (delta / 1000);
                npc.composite.y += (dy / dist) * npc.speed * (delta / 1000);

                let dir = 'down';
                if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
                else dir = dy > 0 ? 'down' : 'up';

                if (dir !== npc.facing) {
                    npc.facing = dir;
                    this.playCompositeAnim(npc.sprites, npc.def, 'walk', dir);
                } else if (!npc.sprites[0]?.anims?.isPlaying) {
                    this.playCompositeAnim(npc.sprites, npc.def, 'walk', dir);
                }
            } else if (npc.isMoving) {
                npc.isMoving = false;
                this.playCompositeAnim(npc.sprites, npc.def, 'idle', npc.facing);
            }

            // Update overlays
            npc.shadow.setPosition(npc.composite.x, npc.composite.y + 28);
            npc.nameTag.setPosition(npc.composite.x, npc.composite.y - 36);
            npc.statusDot.setPosition(npc.composite.x + npc.nameTag.width / 2 + 6, npc.composite.y - 36);
        });
    }

    private checkProximity() {
        this.proximityTexts.forEach(t => t.destroy());
        this.proximityTexts = [];

        this.npcs.forEach(npc => {
            const dx = this.playerContainer.x - npc.composite.x;
            const dy = this.playerContainer.y - npc.composite.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 100) {
                const bubble = this.add.text(
                    npc.composite.x, npc.composite.y - 54,
                    `💬 Press E to chat with ${npc.name}`,
                    {
                        fontSize: '9px', fontFamily: 'system-ui', color: '#ffffff',
                        backgroundColor: '#333333dd', padding: { x: 6, y: 3 }
                    }
                ).setOrigin(0.5).setDepth(200);
                this.proximityTexts.push(bubble);
            }
        });
    }
}
