import * as Phaser from 'phaser';
import { io, Socket } from 'socket.io-client';

// ── Constants ──────────────────────────────────────────────────────────────
const SPEED = 180;
const SPRINT_MULT = 1.7;
const MAP_W = 2400;
const MAP_H = 1800;
const EMIT_INTERVAL = 50;
const FOLLOW_RADIUS = 200;
const MIN_DISTANCE = 70;

// ── Agent config interface (from SessionAgentsContext) ─────────────────────
interface AgentInitConfig {
    id: string;
    name: string;
    role: string;
    type: 'duck' | 'blu_guy' | 'system';
    tint: string; // e.g. "0x44cc88"
}

// ── Player interface ──────────────────────────────────────────────────────
interface PlayerDuck {
    sprite: Phaser.GameObjects.Sprite;
    nameTag: Phaser.GameObjects.Text;
    statusTag: Phaser.GameObjects.Text;
    shadow: Phaser.GameObjects.Ellipse;
    id: string;
    type: 'duck' | 'blu_guy' | 'system';
    agentName: string;
    agentRole: string;
    isSpecialPose?: boolean;
    currentStatus: string;
    isHovered: boolean;
}

// Status words that agents cycle through
const DEV_STATUSES = ['Coding', 'Debugging', 'Thinking', 'Reviewing', 'Testing', 'Refactoring', 'Idle', 'Architecting'];
const PM_STATUSES = ['Planning', 'Aligning', 'Scoping', 'Reviewing', 'Strategizing', 'Documenting', 'Idle', 'Prioritizing'];

// ── Scene ──────────────────────────────────────────────────────────────────
export default class DuckScene extends Phaser.Scene {
    // Players
    private localDucks: PlayerDuck[] = [];
    private activeDuckIndex = 0;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasd!: { w: Phaser.Input.Keyboard.Key; a: Phaser.Input.Keyboard.Key; s: Phaser.Input.Keyboard.Key; d: Phaser.Input.Keyboard.Key };
    private tabKey!: Phaser.Input.Keyboard.Key;
    private shiftKey!: Phaser.Input.Keyboard.Key;
    private facing = 'right';

    // Multiplayer
    private socket!: Socket;
    private lastEmitTime = 0;

    // Callbacks
    private onSpacePressed?: (agentName: string, zone?: { label: string; type: string }) => void;

    // Agent configs from session
    private agentConfigs: AgentInitConfig[] = [];

    // Timing/Idle state
    private lastTabTime = 0;
    private idleTimers: number[] = [];
    private specialPoses = ['duck_crouch', 'duck_dead', 'duck_jump_pose', 'duck_special'];
    private zones = [
        { x: 100, y: 700, w: 450, h: 300, color: 0x4f46e5, label: '🔬 Research Zone', type: 'individual' },
        { x: 650, y: 700, w: 450, h: 300, color: 0x059669, label: '💻 Workspace', type: 'individual' },
        { x: 1200, y: 700, w: 600, h: 300, color: 0xdc2626, label: '📋 Meeting / Quick Huddle Zone', type: 'group' },
    ];
    private activeZone: any = null;
    private zoneHighlightGraphics!: Phaser.GameObjects.Graphics;
    private isChatOpen = false;

    // Status cycling
    private statusTimer = 0;
    private hiveSessionId: string | null = null;  // When set, use live status instead of random cycling

    // Wandering
    private wanderTimers: number[] = [];
    private wanderTargets: { x: number; y: number }[] = [];

    constructor() {
        super('DuckScene');
    }

    init(data?: {
        onSpacePressed?: (agentName: string, zone?: { label: string; type: string }) => void;
        agents?: AgentInitConfig[];
    }) {
        if (data?.onSpacePressed) {
            this.onSpacePressed = data.onSpacePressed;
        }
        if (data?.agents && data.agents.length > 0) {
            this.agentConfigs = data.agents;
        }
    }

    public setIsChatOpen(open: boolean) {
        this.isChatOpen = open;
        if (open) {
            if (!this.input || !this.input.keyboard) return;
            // Release key captures so WASD etc. reach text inputs
            this.input.keyboard.removeCapture([
                Phaser.Input.Keyboard.KeyCodes.UP,
                Phaser.Input.Keyboard.KeyCodes.DOWN,
                Phaser.Input.Keyboard.KeyCodes.LEFT,
                Phaser.Input.Keyboard.KeyCodes.RIGHT,
                Phaser.Input.Keyboard.KeyCodes.SPACE,
                Phaser.Input.Keyboard.KeyCodes.TAB,
                Phaser.Input.Keyboard.KeyCodes.SHIFT,
            ]);
            if (this.wasd) {
                this.input.keyboard!.removeCapture([
                    Phaser.Input.Keyboard.KeyCodes.W,
                    Phaser.Input.Keyboard.KeyCodes.A,
                    Phaser.Input.Keyboard.KeyCodes.S,
                    Phaser.Input.Keyboard.KeyCodes.D,
                ]);
            }
            this.localDucks.forEach(d => {
                if (d.sprite.anims.isPlaying && d.sprite.anims.currentAnim?.key.includes('walk')) {
                    const idleAnim = d.type === 'duck' ? 'duck_idle' : `blu_idle_${this.facing}`;
                    d.sprite.play(idleAnim, true);
                }
            });
        } else {
            if (!this.input || !this.input.keyboard) return;
            // Re-capture keys for game movement
            this.input.keyboard.addCapture([
                Phaser.Input.Keyboard.KeyCodes.UP,
                Phaser.Input.Keyboard.KeyCodes.DOWN,
                Phaser.Input.Keyboard.KeyCodes.LEFT,
                Phaser.Input.Keyboard.KeyCodes.RIGHT,
                Phaser.Input.Keyboard.KeyCodes.SPACE,
                Phaser.Input.Keyboard.KeyCodes.TAB,
                Phaser.Input.Keyboard.KeyCodes.SHIFT,
            ]);
        }
    }

    // ── Preload ────────────────────────────────────────────────────────────
    preload() {
        const width = this.cameras.main.width;
        const height = this.cameras.main.height;
        const progressBar = this.add.graphics();
        const progressBox = this.add.graphics();
        progressBox.fillStyle(0x222222, 0.8);
        progressBox.fillRect(width / 2 - 160, height / 2 - 25, 320, 50);

        const loadingText = this.make.text({
            x: width / 2,
            y: height / 2 - 50,
            text: 'Loading Workspace...',
            style: { font: '20px monospace', color: '#6366f1' }
        });
        loadingText.setOrigin(0.5, 0.5);

        this.load.on('progress', (value: number) => {
            progressBar.clear();
            progressBar.fillStyle(0x6366f1, 1);
            progressBar.fillRect(width / 2 - 150, height / 2 - 15, 300 * value, 30);
        });

        this.load.on('complete', () => {
            progressBar.destroy();
            progressBox.destroy();
            loadingText.destroy();
        });

        // Duck assets
        this.load.image('duck_idle_1', '/sprites/duck/idle_001.png');
        this.load.image('duck_idle_2', '/sprites/duck/idle_002.png');
        this.load.image('duck_walk_1', '/sprites/duck/walk_001.png');
        this.load.image('duck_walk_2', '/sprites/duck/walk_002.png');
        this.load.image('duck_run_1', '/sprites/duck/run_001.png');
        this.load.image('duck_run_2', '/sprites/duck/run_002.png');
        this.load.image('duck_star', '/sprites/duck_new/Duck/Sprites/Additional/Additional 001.png');
        this.load.image('duck_crouch', '/sprites/duck_new/Duck/Sprites/Crouching/Crouching 001.png');
        this.load.image('duck_dead', '/sprites/duck_new/Duck/Sprites/Dead/Dead 001.png');
        this.load.image('duck_jump_pose', '/sprites/duck_new/Duck/Sprites/Jumping/Jumping 001.png');
        this.load.image('duck_special', '/sprites/duck_new/Duck/Sprites/Additional/Additional 001.png');

        // Blu Guy assets
        const dirs = ['Down', 'Up', 'Left', 'Right'];
        dirs.forEach(dir => {
            for (let i = 1; i <= 2; i++) {
                this.load.image(`blu_idle_${dir.toLowerCase()}_${i}`, `/sprites/blu_guy/Blu%20Guy/Sprites/Idle/${dir}%20Idle/0${i}.png`);
            }
            for (let i = 1; i <= 3; i++) {
                this.load.image(`blu_walk_${dir.toLowerCase()}_${i}`, `/sprites/blu_guy/Blu%20Guy/Sprites/Walk/${dir}%20Walk/0${i}.png`);
            }
        });
    }

    // ── Create ─────────────────────────────────────────────────────────────
    create() {
        this.cameras.main.setBackgroundColor('#ffffff');
        this.createAnimations();
        this.drawWorld();
        this.createPlayer();
        this.setupInput();
        this.setupCamera();
        this.connectMultiplayer();
        this.zoneHighlightGraphics = this.add.graphics().setDepth(2);

        // Listen for input toggle events from React UI
        window.addEventListener('toggle-input-capture', (e: any) => {
            const blocked = e.detail?.blocked;
            this.setIsChatOpen(blocked); // Reuse existing input blocking logic
        });
    }

    // ── Animations ─────────────────────────────────────────────────────────
    private createAnimations() {
        this.anims.create({
            key: 'duck_idle',
            frames: [{ key: 'duck_idle_1' }, { key: 'duck_idle_2' }],
            frameRate: 3,
            repeat: -1,
        });
        this.anims.create({
            key: 'duck_walk',
            frames: [{ key: 'duck_walk_1' }, { key: 'duck_walk_2' }],
            frameRate: 6,
            repeat: -1,
        });
        this.anims.create({
            key: 'duck_run',
            frames: [{ key: 'duck_run_1' }, { key: 'duck_run_2' }],
            frameRate: 10,
            repeat: -1,
        });

        const dirsForAnims = ['down', 'up', 'left', 'right'];
        dirsForAnims.forEach(dir => {
            this.anims.create({
                key: `blu_idle_${dir}`,
                frames: [{ key: `blu_idle_${dir}_1` }, { key: `blu_idle_${dir}_2` }],
                frameRate: 4,
                repeat: -1
            });
            this.anims.create({
                key: `blu_walk_${dir}`,
                frames: [{ key: `blu_walk_${dir}_1` }, { key: `blu_walk_${dir}_2` }, { key: `blu_walk_${dir}_3` }],
                frameRate: 6,
                repeat: -1
            });
        });
    }

    // ── World Drawing ─────────────────────────────────────────────────────
    private drawWorld() {
        const g = this.add.graphics();
        g.fillStyle(0xffffff);
        g.fillRect(0, 0, MAP_W, MAP_H);

        g.lineStyle(1, 0xf0f0f0, 0.8);
        for (let x = 0; x <= MAP_W; x += 48) g.lineBetween(x, 0, x, MAP_H);
        for (let y = 0; y <= MAP_H; y += 48) g.lineBetween(0, y, MAP_W, y);

        g.lineStyle(3, 0xe0e0e0, 1);
        g.strokeRect(0, 0, MAP_W, MAP_H);

        this.zones.forEach(z => {
            g.fillStyle(z.color, 0.04);
            g.fillRoundedRect(z.x, z.y, z.w, z.h, 16);
            g.lineStyle(2, z.color, 0.15);
            g.strokeRoundedRect(z.x, z.y, z.w, z.h, 16);
            this.add.text(z.x + z.w / 2, z.y + 24, z.label, {
                fontSize: '14px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                color: '#' + z.color.toString(16).padStart(6, '0') + '88',
                fontStyle: 'bold',
            }).setOrigin(0.5).setDepth(1);
        });
    }

    // ── Player Creation ───────────────────────────────────────────────────
    private createPlayer() {
        // Filter non-orchestrator agents for the main controllable ducks
        const controllable = this.agentConfigs.filter(a => a.id !== 'orchestrator');

        // Spawn agents at random locations across the map
        const margin = 200;

        controllable.forEach((agent, index) => {
            const posX = margin + Math.random() * (MAP_W - margin * 2);
            const posY = margin + Math.random() * (MAP_H - margin * 2);

            const isDuck = agent.type === 'duck';
            const initialImage = isDuck ? 'duck_idle_1' : 'blu_idle_down_1';
            const initialAnim = isDuck ? 'duck_idle' : 'blu_idle_down';
            const tintValue = parseInt(agent.tint.replace('0x', ''), 16);

            const duckSprite = this.add.sprite(posX, posY, initialImage)
                .setDepth(100)
                .setScale(isDuck ? 0.7 : 2.0)
                .setTint(tintValue)
                .setInteractive({ useHandCursor: true });
            duckSprite.play(initialAnim);

            // Click to switch to this agent
            duckSprite.on('pointerdown', () => {
                this.switchToAgent(index);
            });

            const duckShadow = this.add.ellipse(posX, posY + 30, 40, 12, 0x000000, 0.15)
                .setDepth(99);

            // Name tag (hidden by default, shown on hover)
            const nameLabel = ` ${agent.name} (${agent.role}) `;
            const duckNameTag = this.add.text(posX, posY - 52, nameLabel, {
                fontSize: '11px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                color: '#ffffff',
                backgroundColor: index === this.activeDuckIndex ? '#4f46e5dd' : '#666666dd',
                padding: { x: 6, y: 2 },
            }).setOrigin(0.5).setDepth(102).setAlpha(0);

            // Status tag (shown by default)
            const initialStatus = isDuck
                ? DEV_STATUSES[Math.floor(Math.random() * DEV_STATUSES.length)]
                : PM_STATUSES[Math.floor(Math.random() * PM_STATUSES.length)];

            const statusTag = this.add.text(posX, posY - 52, ` ${initialStatus} `, {
                fontSize: '10px',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                color: '#ffffff',
                backgroundColor: index === this.activeDuckIndex ? '#4f46e5cc' : '#555555cc',
                padding: { x: 6, y: 2 },
            }).setOrigin(0.5).setDepth(102);

            // Hover: show name, hide status
            duckSprite.on('pointerover', () => {
                const duck = this.localDucks[index];
                if (duck) {
                    duck.isHovered = true;
                    duck.nameTag.setAlpha(1);
                    duck.statusTag.setAlpha(0);
                }
            });
            duckSprite.on('pointerout', () => {
                const duck = this.localDucks[index];
                if (duck) {
                    duck.isHovered = false;
                    duck.nameTag.setAlpha(0);
                    duck.statusTag.setAlpha(1);
                }
            });

            this.localDucks.push({
                sprite: duckSprite,
                nameTag: duckNameTag,
                statusTag: statusTag,
                shadow: duckShadow,
                id: agent.id,
                type: agent.type,
                agentName: agent.name,
                agentRole: agent.role,
                currentStatus: initialStatus,
                isHovered: false,
            });

            this.idleTimers.push(0);
        });
    }

    // ── Switch to a specific agent ────────────────────────────────────────
    private switchToAgent(index: number) {
        if (index === this.activeDuckIndex) return;
        if (index < 0 || index >= this.localDucks.length) return;

        // Deactivate previous
        if (this.activeDuckIndex < this.localDucks.length) {
            const prevDuck = this.localDucks[this.activeDuckIndex];
            prevDuck.nameTag.setBackgroundColor('#666666dd');
            prevDuck.statusTag.setBackgroundColor('#555555cc');
        }

        this.activeDuckIndex = index;

        const newDuck = this.localDucks[this.activeDuckIndex];
        newDuck.nameTag.setBackgroundColor('#4f46e5dd');
        newDuck.statusTag.setBackgroundColor('#4f46e5cc');

        this.cameras.main.stopFollow();
        this.cameras.main.startFollow(newDuck.sprite, true, 0.09, 0.09);
        this.cameras.main.zoomTo(1.5, 500);
    }

    // ── Input Setup ───────────────────────────────────────────────────────
    private setupInput() {
        this.cursors = this.input.keyboard!.createCursorKeys();
        this.wasd = {
            w: this.input.keyboard!.addKey('W'),
            a: this.input.keyboard!.addKey('A'),
            s: this.input.keyboard!.addKey('S'),
            d: this.input.keyboard!.addKey('D'),
        };

        this.tabKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
        this.shiftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        spaceKey.on('down', () => {
            if (this.isChatOpen) return;
            if (this.activeDuckIndex < this.localDucks.length) {
                const activeDuck = this.localDucks[this.activeDuckIndex];
                this.jump(activeDuck);

                if (this.activeZone && this.activeZone.type === 'group') {
                    this.onSpacePressed?.('All Agents', { label: this.activeZone.label, type: 'group' });
                } else {
                    this.onSpacePressed?.(activeDuck.agentName, this.activeZone ? { label: this.activeZone.label, type: 'individual' } : undefined);
                }
            }
        });

        this.input.keyboard!.addCapture([
            Phaser.Input.Keyboard.KeyCodes.UP,
            Phaser.Input.Keyboard.KeyCodes.DOWN,
            Phaser.Input.Keyboard.KeyCodes.LEFT,
            Phaser.Input.Keyboard.KeyCodes.RIGHT,
            Phaser.Input.Keyboard.KeyCodes.SPACE,
            Phaser.Input.Keyboard.KeyCodes.TAB,
            Phaser.Input.Keyboard.KeyCodes.SHIFT,
        ]);
    }

    // ── Camera Setup ──────────────────────────────────────────────────────
    private setupCamera() {
        if (this.localDucks.length > 0) {
            const activeDuck = this.localDucks[this.activeDuckIndex];
            this.cameras.main.startFollow(activeDuck.sprite, true, 0.09, 0.09);
        }
        this.cameras.main.setZoom(1.5);
        this.cameras.main.setBounds(0, 0, MAP_W, MAP_H);
    }

    // ── Multiplayer Connection ────────────────────────────────────────────
    private connectMultiplayer() {
        const serverUrl = (typeof window !== 'undefined' && (window as any).__GATHER_SERVER_URL)
            || 'http://localhost:3001';
        this.socket = io(serverUrl, { transports: ['websocket'] });
        this.socket.on('connect', () => {
            console.log('[Gather] Connected as', this.socket.id);
            // Re-subscribe if we had an active session
            if (this.hiveSessionId) {
                this.socket.emit('hive:subscribe', this.hiveSessionId);
            }
        });

        // ── HIVE Realtime Events ──────────────────────────────────────────
        this.socket.on('hive:agent-status', (data: { agent: string; status: string; taskStatus: string }) => {
            // Find the duck by agent name (case-insensitive match)
            const duck = this.localDucks.find(d =>
                d.agentName.toLowerCase() === data.agent.toLowerCase() ||
                d.id.toLowerCase() === data.agent.toLowerCase()
            );
            if (!duck) return;

            duck.currentStatus = data.status;
            if (!duck.isHovered) {
                duck.statusTag.setText(` ${data.status} `);

                // Color based on task status
                const isActive = this.localDucks.indexOf(duck) === this.activeDuckIndex;
                if (data.taskStatus === 'in_progress') {
                    duck.statusTag.setBackgroundColor('#d97706cc'); // Amber for working
                } else if (data.taskStatus === 'done') {
                    duck.statusTag.setBackgroundColor('#059669cc'); // Green for done
                } else if (data.taskStatus === 'blocked') {
                    duck.statusTag.setBackgroundColor('#dc2626cc'); // Red for blocked
                } else {
                    duck.statusTag.setBackgroundColor(isActive ? '#4f46e5cc' : '#555555cc');
                }
            }
        });

        this.socket.on('hive:session-update', (data: { status: string }) => {
            console.log('[HIVE] Session status:', data.status);
        });

        this.socket.on('hive:log', (data: { agent: string; action: string; payload: any }) => {
            if (data.action === 'agent_handoff') {
                const fromAgent = data.payload.from;
                const toAgent = data.payload.to;
                this.animateHandoff(fromAgent, toAgent);
            }
        });

        (this as any).socket = this.socket;
    }

    /**
     * Subscribe to live HIVE session events.
     * Call this when a session starts from HivePanel.
     * Disables random status cycling and uses real task statuses instead.
     */
    public subscribeToHiveSession(sessionId: string | null) {
        // Unsubscribe from previous
        if (this.hiveSessionId && this.socket?.connected) {
            this.socket.emit('hive:unsubscribe', this.hiveSessionId);
        }

        this.hiveSessionId = sessionId;

        if (sessionId && this.socket?.connected) {
            this.socket.emit('hive:subscribe', sessionId);
            console.log('[HIVE] Subscribed to session', sessionId.substring(0, 8));

            // Set all agents to 'Queued' initially
            this.localDucks.forEach(duck => {
                duck.currentStatus = 'Queued';
                if (!duck.isHovered) {
                    duck.statusTag.setText(' Queued ');
                }
            });
        }
    }

    update(_time: number, delta: number) {
        this.handleTabSwitch();
        this.handleMovement(delta);
        this.updateIdleCycle(delta);
        this.updateStatusCycle(delta);
        this.updateWandering(delta);
        this.checkZones();
        this.updateOverlays();
        this.emitPosition();
    }

    public requestHuddle() {
        const meetingZone = this.zones.find(z => z.type === 'group');
        if (!meetingZone) return;

        const centerX = meetingZone.x + meetingZone.w / 2;
        const centerY = meetingZone.y + meetingZone.h / 2;

        // Arrange all agents in a circle in the meeting zone
        this.localDucks.forEach((duck, i) => {
            const angle = (i / this.localDucks.length) * Math.PI * 2 - Math.PI / 2;
            const radius = 70;
            const target = {
                x: centerX + Math.cos(angle) * radius,
                y: centerY + Math.sin(angle) * radius,
            };

            const isDuck = duck.type === 'duck';
            if (isDuck) {
                duck.sprite.play('duck_run', true);
                duck.sprite.setFlipX(target.x < duck.sprite.x);
            } else {
                const dir = Math.abs(target.x - duck.sprite.x) > Math.abs(target.y - duck.sprite.y)
                    ? (target.x < duck.sprite.x ? 'left' : 'right')
                    : (target.y < duck.sprite.y ? 'up' : 'down');
                duck.sprite.play(`blu_walk_${dir}`, true);
            }

            const dist = Phaser.Math.Distance.Between(duck.sprite.x, duck.sprite.y, target.x, target.y);
            const moveDuration = (dist / (SPEED * SPRINT_MULT)) * 1000;

            this.tweens.add({
                targets: duck.sprite,
                x: target.x,
                y: target.y,
                duration: moveDuration,
                ease: 'Cubic.easeOut',
                onComplete: () => {
                    const idleAnim = isDuck ? 'duck_idle' : 'blu_idle_down';
                    duck.sprite.play(idleAnim, true);
                }
            });
        });
    }

    public disperseAgents() {
        const margin = 200;
        this.localDucks.forEach((duck, i) => {
            if (i === this.activeDuckIndex) return; // don't move the player's active duck
            const targetX = margin + Math.random() * (MAP_W - margin * 2);
            const targetY = margin + Math.random() * (MAP_H - margin * 2);
            const isDuck = duck.type === 'duck';

            if (isDuck) {
                duck.sprite.play('duck_walk', true);
                duck.sprite.setFlipX(targetX < duck.sprite.x);
            } else {
                const dir = Math.abs(targetX - duck.sprite.x) > Math.abs(targetY - duck.sprite.y)
                    ? (targetX < duck.sprite.x ? 'left' : 'right')
                    : (targetY < duck.sprite.y ? 'up' : 'down');
                duck.sprite.play(`blu_walk_${dir}`, true);
            }

            const dist = Phaser.Math.Distance.Between(duck.sprite.x, duck.sprite.y, targetX, targetY);
            const moveDuration = (dist / SPEED) * 1000;

            this.tweens.add({
                targets: duck.sprite,
                x: targetX,
                y: targetY,
                duration: moveDuration,
                ease: 'Cubic.easeInOut',
                onComplete: () => {
                    const idleAnim = isDuck ? 'duck_idle' : 'blu_idle_down';
                    duck.sprite.play(idleAnim, true);
                }
            });
        });
    }

    // ── Autonomous wandering for non-active agents ───────────────────────
    private updateWandering(delta: number) {
        if (this.isChatOpen) return;
        const margin = 100;
        this.localDucks.forEach((duck, i) => {
            if (i === this.activeDuckIndex) return; // skip the player's active agent
            if (this.tweens.isTweening(duck.sprite)) return; // already moving via tween

            // Initialize timer if needed
            if (!this.wanderTimers[i]) this.wanderTimers[i] = 3000 + Math.random() * 5000;

            this.wanderTimers[i] -= delta;
            if (this.wanderTimers[i] > 0) return;

            // Pick a new wander target (nearby, within ~250px)
            this.wanderTimers[i] = 4000 + Math.random() * 6000; // next wander in 4-10s
            const range = 250;
            const targetX = Phaser.Math.Clamp(
                duck.sprite.x + (Math.random() - 0.5) * range * 2,
                margin, MAP_W - margin
            );
            const targetY = Phaser.Math.Clamp(
                duck.sprite.y + (Math.random() - 0.5) * range * 2,
                margin, MAP_H - margin
            );

            const isDuck = duck.type === 'duck';
            if (isDuck) {
                duck.sprite.play('duck_walk', true);
                duck.sprite.setFlipX(targetX < duck.sprite.x);
            } else {
                const dir = Math.abs(targetX - duck.sprite.x) > Math.abs(targetY - duck.sprite.y)
                    ? (targetX < duck.sprite.x ? 'left' : 'right')
                    : (targetY < duck.sprite.y ? 'up' : 'down');
                duck.sprite.play(`blu_walk_${dir}`, true);
            }

            const dist = Phaser.Math.Distance.Between(duck.sprite.x, duck.sprite.y, targetX, targetY);
            const moveDuration = (dist / SPEED) * 1000;

            this.tweens.add({
                targets: duck.sprite,
                x: targetX,
                y: targetY,
                duration: moveDuration,
                ease: 'Sine.easeInOut',
                onComplete: () => {
                    const idleAnim = isDuck ? 'duck_idle' : 'blu_idle_down';
                    duck.sprite.play(idleAnim, true);
                }
            });
        });
    }

    private checkZones() {
        if (this.activeDuckIndex >= this.localDucks.length) {
            this.activeZone = null;
            this.zoneHighlightGraphics.clear();
            return;
        }
        const activeDuck = this.localDucks[this.activeDuckIndex];
        const px = activeDuck.sprite.x;
        const py = activeDuck.sprite.y;
        const currentZone = this.zones.find(z =>
            px >= z.x && px <= z.x + z.w &&
            py >= z.y && py <= z.y + z.h
        );
        if (currentZone !== this.activeZone) {
            this.activeZone = currentZone;
            this.updateZoneHighlight();
        }
    }

    private updateZoneHighlight() {
        this.zoneHighlightGraphics.clear();
        if (!this.activeZone) return;
        const z = this.activeZone;
        this.tweens.addCounter({
            from: 0.15,
            to: 0.4,
            duration: 1000,
            yoyo: true,
            repeat: -1,
            onUpdate: (tween) => {
                this.zoneHighlightGraphics.clear();
                this.zoneHighlightGraphics.lineStyle(4, z.color, tween.getValue());
                this.zoneHighlightGraphics.strokeRoundedRect(z.x - 4, z.y - 4, z.w + 8, z.h + 8, 20);
                this.zoneHighlightGraphics.fillStyle(z.color, tween.getValue() * 0.2);
                this.zoneHighlightGraphics.fillRoundedRect(z.x, z.y, z.w, z.h, 16);
            }
        });
    }

    private updateIdleCycle(delta: number) {
        this.localDucks.forEach((duck, i) => {
            const isMoving = i === this.activeDuckIndex && (
                this.cursors.left.isDown || this.wasd.a.isDown ||
                this.cursors.right.isDown || this.wasd.d.isDown ||
                this.cursors.up.isDown || this.wasd.w.isDown
            );
            const shift = this.shiftKey.isDown;

            if (!isMoving && !shift) {
                if (!this.idleTimers[i]) this.idleTimers[i] = 0;
                this.idleTimers[i] += delta;
                if (duck.type === 'duck' && this.idleTimers[i] > 8000) {
                    this.idleTimers[i] = 0;
                    const randomPose = this.specialPoses[Math.floor(Math.random() * this.specialPoses.length)];
                    duck.sprite.setTexture(randomPose);
                    duck.isSpecialPose = true;
                    this.time.delayedCall(2000, () => {
                        if (duck.isSpecialPose) {
                            duck.isSpecialPose = false;
                            duck.sprite.play('duck_idle', true);
                        }
                    });
                }
            } else {
                this.idleTimers[i] = 0;
                if (duck.isSpecialPose) {
                    duck.isSpecialPose = false;
                    const idleAnim = duck.type === 'duck' ? 'duck_idle' : `blu_idle_${this.facing}`;
                    duck.sprite.play(idleAnim, true);
                }
            }
        });
    }

    // ── Status cycling — change agent status words periodically ──────────
    // When a HIVE session is active, this is skipped (live status comes via Socket.IO)
    private updateStatusCycle(delta: number) {
        // Skip random cycling when receiving live status from HIVE
        if (this.hiveSessionId) return;

        this.statusTimer += delta;
        if (this.statusTimer < 5000) return; // Every 5 seconds
        this.statusTimer = 0;

        this.localDucks.forEach((duck) => {
            if (duck.currentStatus === 'Chatting') return; // Don't overwrite Chatting

            const pool = duck.type === 'duck' ? DEV_STATUSES : PM_STATUSES;
            const newStatus = pool[Math.floor(Math.random() * pool.length)];
            duck.currentStatus = newStatus;
            if (!duck.isHovered) {
                duck.statusTag.setText(` ${newStatus} `);
                const isActive = this.localDucks.indexOf(duck) === this.activeDuckIndex;
                duck.statusTag.setBackgroundColor(isActive ? '#4f46e5cc' : '#555555cc');
            }
        });
    }

    public setAgentStatus(agentId: string, status: string) {
        const duck = this.localDucks.find(d => d.id === agentId);
        if (!duck) return;

        duck.currentStatus = status;
        if (!duck.isHovered) {
            duck.statusTag.setText(` ${status} `);
            if (status === 'Chatting') {
                duck.statusTag.setBackgroundColor('#6b7280ee'); // Gray
            } else {
                const isActive = this.localDucks.indexOf(duck) === this.activeDuckIndex;
                duck.statusTag.setBackgroundColor(isActive ? '#4f46e5cc' : '#555555cc');
            }
        }
    }

    public moveAgentToAgent(senderId: string, receiverId: string) {
        const sender = this.localDucks.find(d => d.id === senderId);
        const receiver = this.localDucks.find(d => d.id === receiverId);

        if (!sender || !receiver || sender === receiver) return;

        // Target position: 60px to the left of receiver (or right if blocked)
        const offset = sender.sprite.x < receiver.sprite.x ? -60 : 60;
        const targetX = receiver.sprite.x + offset;
        const targetY = receiver.sprite.y;

        const dist = Phaser.Math.Distance.Between(sender.sprite.x, sender.sprite.y, targetX, targetY);
        if (dist < 10) return; // Already there

        // Faster speed for chatting approach
        const moveDuration = (dist / (SPEED * 1.5)) * 1000;

        // Anim
        const isDuck = sender.type === 'duck';
        if (isDuck) {
            sender.sprite.play('duck_run', true);
            sender.sprite.setFlipX(targetX < sender.sprite.x);
        } else {
            const dir = Math.abs(targetX - sender.sprite.x) > Math.abs(targetY - sender.sprite.y)
                ? (targetX < sender.sprite.x ? 'left' : 'right')
                : (targetY < sender.sprite.y ? 'up' : 'down');
            sender.sprite.play(`blu_walk_${dir}`, true);
        }

        this.tweens.add({
            targets: sender.sprite,
            x: targetX,
            y: targetY,
            duration: moveDuration,
            ease: 'Power2',
            onComplete: () => {
                const idleAnim = isDuck ? 'duck_idle' : 'blu_idle_down';
                sender.sprite.play(idleAnim, true);
                if (isDuck) sender.sprite.setFlipX(offset < 0); // Face right if on left
            }
        });
    }

    // ── Tab switching: Tab=forward, Shift+Tab=backward, Double-Tab=overview
    private handleTabSwitch() {
        if (Phaser.Input.Keyboard.JustDown(this.tabKey)) {
            const now = this.time.now;
            const timeSinceLastTab = now - this.lastTabTime;
            const doubleTab = timeSinceLastTab < 400;
            this.lastTabTime = doubleTab ? 0 : now;

            const isShift = this.shiftKey.isDown;

            if (doubleTab) {
                // Double Tab: Toggle Overview Mode
                if (this.activeDuckIndex >= this.localDucks.length) {
                    // Exit overview
                    this.activeDuckIndex = 0;
                    const newDuck = this.localDucks[this.activeDuckIndex];
                    newDuck.nameTag.setBackgroundColor('#4f46e5dd');
                    newDuck.statusTag.setBackgroundColor('#4f46e5cc');
                    this.cameras.main.startFollow(newDuck.sprite, true, 0.09, 0.09);
                    this.cameras.main.zoomTo(1.5, 500);
                } else {
                    // Enter Overview Mode
                    this.activeDuckIndex = this.localDucks.length;
                    this.cameras.main.stopFollow();
                    this.cameras.main.pan(MAP_W / 2, MAP_H / 2, 800, 'Cubic.easeOut');
                    this.cameras.main.zoomTo(0.55, 800);
                    this.localDucks.forEach(d => {
                        d.nameTag.setBackgroundColor('#666666dd');
                        d.statusTag.setBackgroundColor('#555555cc');
                    });
                }
            } else {
                // Single Tab/Shift+Tab: navigate agents
                if (this.activeDuckIndex < this.localDucks.length) {
                    const prevDuck = this.localDucks[this.activeDuckIndex];
                    prevDuck.nameTag.setBackgroundColor('#666666dd');
                    prevDuck.statusTag.setBackgroundColor('#555555cc');
                }

                if (isShift) {
                    // Shift+Tab: go backward
                    this.activeDuckIndex = this.activeDuckIndex <= 0
                        ? this.localDucks.length - 1
                        : this.activeDuckIndex - 1;
                } else {
                    // Tab: go forward
                    this.activeDuckIndex = (this.activeDuckIndex + 1) % this.localDucks.length;
                }

                const newDuck = this.localDucks[this.activeDuckIndex];
                newDuck.nameTag.setBackgroundColor('#4f46e5dd');
                newDuck.statusTag.setBackgroundColor('#4f46e5cc');

                this.cameras.main.stopFollow();
                this.cameras.main.startFollow(newDuck.sprite, true, 0.09, 0.09);
                this.cameras.main.zoomTo(1.5, 500);
            }
        }
    }

    private jump(duck: PlayerDuck) {
        if (this.tweens.isTweening(duck.sprite)) return;
        this.tweens.add({
            targets: duck.sprite,
            y: duck.sprite.y - 40,
            duration: 150,
            yoyo: true,
            ease: 'Cubic.easeOut'
        });
        this.tweens.add({
            targets: duck.shadow,
            scaleX: 0.6,
            scaleY: 0.6,
            alpha: 0.05,
            duration: 150,
            yoyo: true,
            ease: 'Cubic.easeOut'
        });
    }

    // ── Movement ──────────────────────────────────────────────────────────
    private handleMovement(delta: number) {
        if (this.isChatOpen || this.activeDuckIndex >= this.localDucks.length) return;

        let vx = 0, vy = 0;
        if (this.cursors.left.isDown || this.wasd.a.isDown) vx = -1;
        else if (this.cursors.right.isDown || this.wasd.d.isDown) vx = 1;
        if (this.cursors.up.isDown || this.wasd.w.isDown) vy = -1;
        else if (this.cursors.down.isDown || this.wasd.s.isDown) vy = 1;

        if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }

        const shift = this.shiftKey.isDown;
        const speed = shift ? SPEED * SPRINT_MULT : SPEED;
        const isMoving = vx !== 0 || vy !== 0;
        const activeDuck = this.localDucks[this.activeDuckIndex];
        const duckSprite = activeDuck.sprite;

        if (isMoving) {
            const isDuck = activeDuck.type === 'duck';
            if (isDuck) {
                if (vx < 0) { this.facing = 'left'; duckSprite.setFlipX(true); }
                else if (vx > 0) { this.facing = 'right'; duckSprite.setFlipX(false); }
            } else {
                if (Math.abs(vx) > Math.abs(vy)) this.facing = vx < 0 ? 'left' : 'right';
                else this.facing = vy < 0 ? 'up' : 'down';
            }

            let animKey = isDuck ? (shift ? 'duck_run' : 'duck_walk') : `blu_walk_${this.facing}`;
            if (!duckSprite.anims.isPlaying || duckSprite.anims.currentAnim?.key !== animKey) {
                duckSprite.play(animKey, true);
            }

            const dx = vx * speed * (delta / 1000);
            const dy = vy * speed * (delta / 1000);
            duckSprite.x = Phaser.Math.Clamp(duckSprite.x + dx, 40, MAP_W - 40);
            duckSprite.y = Phaser.Math.Clamp(duckSprite.y + dy, 40, MAP_H - 40);
        } else if (shift && !isMoving) {
            if (activeDuck.type === 'duck') {
                const animKey = 'duck_walk';
                if (!duckSprite.anims.isPlaying || duckSprite.anims.currentAnim?.key !== animKey) {
                    duckSprite.play(animKey, true);
                }
            }
        } else if (!activeDuck.isSpecialPose) {
            const idleAnim = activeDuck.type === 'duck' ? 'duck_idle' : `blu_idle_${this.facing}`;
            if (!duckSprite.anims.isPlaying || duckSprite.anims.currentAnim?.key !== idleAnim) {
                duckSprite.play(idleAnim, true);
            }
        }

        // Following logic when Shift is held
        if (shift) {
            this.localDucks.forEach((otherDuck, index) => {
                if (index === this.activeDuckIndex) return;
                const dx = duckSprite.x - otherDuck.sprite.x;
                const dy = duckSprite.y - otherDuck.sprite.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < FOLLOW_RADIUS && dist > MIN_DISTANCE) {
                    const angle = Math.atan2(dy, dx);
                    const followSpeed = speed * 0.9;
                    const moveX = Math.cos(angle) * followSpeed * (delta / 1000);
                    const moveY = Math.sin(angle) * followSpeed * (delta / 1000);
                    otherDuck.sprite.x += moveX;
                    otherDuck.sprite.y += moveY;

                    const isOtherDuck = otherDuck.type === 'duck';
                    let animKey = '';
                    if (isOtherDuck) {
                        if (Math.abs(moveX) > 0.1) otherDuck.sprite.setFlipX(moveX < 0);
                        animKey = shift ? 'duck_run' : 'duck_walk';
                    } else {
                        let f = 'down';
                        if (Math.abs(moveX) > Math.abs(moveY)) f = moveX < 0 ? 'left' : 'right';
                        else f = moveY < 0 ? 'up' : 'down';
                        animKey = `blu_walk_${f}`;
                    }
                    if (!otherDuck.sprite.anims.isPlaying || otherDuck.sprite.anims.currentAnim?.key !== animKey) {
                        otherDuck.sprite.play(animKey, true);
                    }
                } else if (dist <= MIN_DISTANCE || !isMoving) {
                    const idleAnim = otherDuck.type === 'duck' ? 'duck_idle' : `blu_idle_${this.facing}`;
                    if (!otherDuck.isSpecialPose && (!otherDuck.sprite.anims.isPlaying || otherDuck.sprite.anims.currentAnim?.key !== idleAnim)) {
                        otherDuck.sprite.play(idleAnim, true);
                    }
                }
            });
        }
    }

    // ── Overlays ─────────────────────────────────────────────────────────
    private updateOverlays() {
        const camZoom = this.cameras.main.zoom;
        const labelScale = Math.max(1, 0.8 / camZoom);

        this.localDucks.forEach(duck => {
            const shadowY = duck.type === 'duck' ? 30 : 18;
            const tagY = duck.type === 'duck' ? -52 : -40;
            duck.shadow.setPosition(duck.sprite.x, duck.sprite.y + shadowY);
            duck.nameTag.setPosition(duck.sprite.x, duck.sprite.y + tagY);
            duck.statusTag.setPosition(duck.sprite.x, duck.sprite.y + tagY);
            duck.nameTag.setScale(labelScale);
            duck.statusTag.setScale(labelScale);
        });
    }

    // ── Position Emit ────────────────────────────────────────────────────
    private emitPosition() {
        const now = Date.now();
        if (now - this.lastEmitTime < EMIT_INTERVAL) return;
        this.lastEmitTime = now;

        if (this.socket?.connected && this.activeDuckIndex < this.localDucks.length) {
            const activeDuck = this.localDucks[this.activeDuckIndex];
            this.socket.emit('move', {
                x: Math.round(activeDuck.sprite.x),
                y: Math.round(activeDuck.sprite.y),
            });
        }
    }

    // ── Cleanup ──────────────────────────────────────────────────────────
    public shutdown() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    // ── Public getters for GatherApp ─────────────────────────────────────
    public getActiveAgentName(): string {
        if (this.activeDuckIndex < this.localDucks.length) {
            return this.localDucks[this.activeDuckIndex].agentName;
        }
        return 'Antigravity';
    }

    public getActiveAgentId(): string {
        if (this.activeDuckIndex < this.localDucks.length) {
            return this.localDucks[this.activeDuckIndex].id;
        }
        return 'orchestrator';
    }

    public getAgentCount(): number {
        return this.localDucks.length;
    }

    // ── Handoff Animation ────────────────────────────────────────────────
    private animateHandoff(fromAgentName: string, toAgentName: string) {
        const sender = this.localDucks.find(d =>
            d.agentName.toLowerCase() === fromAgentName.toLowerCase() ||
            d.id.toLowerCase() === fromAgentName.toLowerCase()
        );
        const receiver = this.localDucks.find(d =>
            d.agentName.toLowerCase() === toAgentName.toLowerCase() ||
            d.id.toLowerCase() === toAgentName.toLowerCase()
        );

        if (!sender || !receiver || sender === receiver) return;

        // Visual feedback
        this.setAgentStatus(sender.id, 'Chatting');
        this.setAgentStatus(receiver.id, 'Chatting');

        // Move sender to receiver
        const offset = sender.sprite.x < receiver.sprite.x ? -70 : 70;
        const targetX = receiver.sprite.x + offset;
        const targetY = receiver.sprite.y;

        const dist = Phaser.Math.Distance.Between(sender.sprite.x, sender.sprite.y, targetX, targetY);
        const moveDuration = (dist / (SPEED * 1.5)) * 1000;

        // Configure animation
        const isDuck = sender.type === 'duck';
        if (isDuck) {
            sender.sprite.play('duck_run', true);
            sender.sprite.setFlipX(targetX < sender.sprite.x);
        } else {
            const dir = Math.abs(targetX - sender.sprite.x) > Math.abs(targetY - sender.sprite.y)
                ? (targetX < sender.sprite.x ? 'left' : 'right')
                : (targetY < sender.sprite.y ? 'up' : 'down');
            sender.sprite.play(`blu_walk_${dir}`, true);
        }

        // Tween movement
        this.tweens.add({
            targets: sender.sprite,
            x: targetX,
            y: targetY,
            duration: moveDuration,
            ease: 'Power2',
            onComplete: () => {
                // Face each other
                if (isDuck) sender.sprite.setFlipX(offset < 0);

                const idleAnim = isDuck ? 'duck_idle' : 'blu_idle_down';
                sender.sprite.play(idleAnim, true);

                // Chat bubble effect (simple jump for now)
                this.tweens.add({
                    targets: sender.sprite,
                    y: sender.sprite.y - 10,
                    duration: 200,
                    yoyo: true,
                    repeat: 2
                });

                // Reset status after a delay
                this.time.delayedCall(4000, () => {
                    if (sender.currentStatus === 'Chatting') this.setAgentStatus(sender.id, 'Idle');
                    if (receiver.currentStatus === 'Chatting') this.setAgentStatus(receiver.id, 'Working');
                });
            }
        });
    }
}
