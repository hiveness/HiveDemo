import Phaser from 'phaser';

// Draw a detailed pixel-art style character onto a graphics texture
export interface CharacterConfig {
    skinColor: number;
    hairColor: number;
    shirtColor: number;
    pantsColor: number;
    shoeColor: number;
    hairStyle: 'short' | 'long' | 'spiky' | 'curly' | 'ponytail';
    accessory?: 'glasses' | 'hat' | 'headphones' | 'none';
}

const PRESETS: Record<string, CharacterConfig> = {
    player: { skinColor: 0xf5cba7, hairColor: 0x4a3728, shirtColor: 0x4f46e5, pantsColor: 0x2d3748, shoeColor: 0x1a1a2e, hairStyle: 'short', accessory: 'none' },
    Alice: { skinColor: 0xd4a574, hairColor: 0x8b4513, shirtColor: 0xcc4444, pantsColor: 0x333344, shoeColor: 0x222222, hairStyle: 'long', accessory: 'glasses' },
    Bob: { skinColor: 0xf0d5b8, hairColor: 0x222222, shirtColor: 0x44aa44, pantsColor: 0x444466, shoeColor: 0x333333, hairStyle: 'spiky', accessory: 'headphones' },
    Charlie: { skinColor: 0xe8c39e, hairColor: 0xcc8844, shirtColor: 0xcc8844, pantsColor: 0x555555, shoeColor: 0x4a3728, hairStyle: 'curly', accessory: 'none' },
    Diana: { skinColor: 0xc68642, hairColor: 0x1a1a2e, shirtColor: 0xaa44aa, pantsColor: 0x2a2a3a, shoeColor: 0x111111, hairStyle: 'ponytail', accessory: 'none' },
    Eve: { skinColor: 0xfde7d6, hairColor: 0xdaa520, shirtColor: 0x44aaaa, pantsColor: 0x3a3a4a, shoeColor: 0x2a2a2a, hairStyle: 'long', accessory: 'hat' },
    Frank: { skinColor: 0xd2a06b, hairColor: 0x555555, shirtColor: 0xaaaa44, pantsColor: 0x444444, shoeColor: 0x333333, hairStyle: 'short', accessory: 'glasses' },
};

export function getCharacterConfig(name: string): CharacterConfig {
    return PRESETS[name] || PRESETS.player;
}

export function drawCharacter(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    config: CharacterConfig,
    isPlayer: boolean
) {
    const g = scene.add.graphics();

    // Shadow
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(0, 20, 24, 8);

    // Shoes
    g.fillStyle(config.shoeColor);
    g.fillRoundedRect(-9, 14, 7, 6, 2);
    g.fillRoundedRect(2, 14, 7, 6, 2);

    // Pants/legs
    g.fillStyle(config.pantsColor);
    g.fillRoundedRect(-8, 6, 7, 10, 1);
    g.fillRoundedRect(1, 6, 7, 10, 1);

    // Shirt body
    g.fillStyle(config.shirtColor);
    g.fillRoundedRect(-10, -6, 20, 14, 3);

    // Shirt detail - collar
    g.fillStyle(config.shirtColor + 0x222222 > 0xffffff ? 0xffffff : config.shirtColor + 0x222222);
    g.fillRoundedRect(-4, -6, 8, 4, 1);

    // Arms
    g.fillStyle(config.skinColor);
    g.fillRoundedRect(-14, -4, 5, 12, 2);
    g.fillRoundedRect(9, -4, 5, 12, 2);

    // Shirt sleeves
    g.fillStyle(config.shirtColor);
    g.fillRoundedRect(-14, -4, 5, 5, 2);
    g.fillRoundedRect(9, -4, 5, 5, 2);

    // Head/face
    g.fillStyle(config.skinColor);
    g.fillRoundedRect(-8, -18, 16, 14, 4);

    // Eyes
    g.fillStyle(0xffffff);
    g.fillRoundedRect(-6, -14, 5, 5, 2);
    g.fillRoundedRect(1, -14, 5, 5, 2);
    g.fillStyle(0x1a1a2e);
    g.fillCircle(-4, -12, 1.5);
    g.fillCircle(3, -12, 1.5);

    // Eye highlights
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(-4.5, -12.5, 0.7);
    g.fillCircle(2.5, -12.5, 0.7);

    // Mouth
    g.fillStyle(0xcc7755);
    g.fillRoundedRect(-2, -8, 4, 2, 1);

    // Cheek blush
    g.fillStyle(0xff9999, 0.3);
    g.fillCircle(-6, -9, 2);
    g.fillCircle(6, -9, 2);

    // Hair
    drawHair(g, config);

    // Accessories
    drawAccessory(g, config);

    container.add(g);
}

function drawHair(g: Phaser.GameObjects.Graphics, config: CharacterConfig) {
    g.fillStyle(config.hairColor);

    switch (config.hairStyle) {
        case 'short':
            g.fillRoundedRect(-9, -22, 18, 8, 4);
            g.fillRoundedRect(-9, -18, 3, 6, 1);
            g.fillRoundedRect(6, -18, 3, 6, 1);
            break;
        case 'long':
            g.fillRoundedRect(-10, -23, 20, 10, 5);
            g.fillRoundedRect(-11, -18, 4, 18, 2);
            g.fillRoundedRect(7, -18, 4, 18, 2);
            break;
        case 'spiky':
            g.fillRoundedRect(-9, -22, 18, 8, 3);
            // Spikes
            g.fillTriangle(-6, -22, -3, -28, 0, -22);
            g.fillTriangle(0, -22, 3, -30, 6, -22);
            g.fillTriangle(4, -22, 8, -26, 9, -20);
            break;
        case 'curly':
            g.fillRoundedRect(-10, -23, 20, 10, 5);
            for (let i = -8; i <= 8; i += 4) {
                g.fillCircle(i, -22, 3);
            }
            g.fillCircle(-10, -16, 3);
            g.fillCircle(10, -16, 3);
            break;
        case 'ponytail':
            g.fillRoundedRect(-9, -22, 18, 8, 4);
            g.fillRoundedRect(4, -20, 4, 4, 2);
            g.fillRoundedRect(6, -16, 3, 14, 2);
            g.fillCircle(7, -2, 4);
            break;
    }
}

function drawAccessory(g: Phaser.GameObjects.Graphics, config: CharacterConfig) {
    switch (config.accessory) {
        case 'glasses':
            g.lineStyle(1.5, 0x333333);
            g.strokeRoundedRect(-7, -15, 6, 5, 1);
            g.strokeRoundedRect(1, -15, 6, 5, 1);
            g.lineBetween(-1, -13, 1, -13);
            break;
        case 'hat':
            g.fillStyle(0x884422);
            g.fillRoundedRect(-12, -26, 24, 4, 1);
            g.fillRoundedRect(-8, -32, 16, 8, 3);
            break;
        case 'headphones':
            g.lineStyle(2, 0x333333);
            g.beginPath();
            g.arc(0, -16, 12, Math.PI, 0, false);
            g.strokePath();
            g.fillStyle(0x444444);
            g.fillRoundedRect(-14, -18, 5, 8, 2);
            g.fillRoundedRect(9, -18, 5, 8, 2);
            break;
    }
}

export function createWalkFrames(
    scene: Phaser.Scene,
    name: string,
    config: CharacterConfig,
): string {
    const key = `char_${name}`;
    const frameW = 40;
    const frameH = 48;
    const totalW = frameW * 4;

    const rt = scene.add.renderTexture(0, 0, totalW, frameH).setVisible(false);

    for (let frame = 0; frame < 4; frame++) {
        const g = scene.add.graphics();
        const ox = frame * frameW + frameW / 2;
        const oy = frameH - 4;

        // Leg animation offsets
        let leftLegOff = 0, rightLegOff = 0;
        if (frame === 1) { leftLegOff = -3; rightLegOff = 3; }
        else if (frame === 3) { leftLegOff = 3; rightLegOff = -3; }

        // Shadow
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(ox, oy, 24, 8);

        // Shoes
        g.fillStyle(config.shoeColor);
        g.fillRoundedRect(ox - 9, oy - 6 + leftLegOff, 7, 6, 2);
        g.fillRoundedRect(ox + 2, oy - 6 + rightLegOff, 7, 6, 2);

        // Pants
        g.fillStyle(config.pantsColor);
        g.fillRoundedRect(ox - 8, oy - 14 + leftLegOff, 7, 10, 1);
        g.fillRoundedRect(ox + 1, oy - 14 + rightLegOff, 7, 10, 1);

        // Body
        g.fillStyle(config.shirtColor);
        g.fillRoundedRect(ox - 10, oy - 26, 20, 14, 3);

        // Arms with swing
        let leftArmOff = 0, rightArmOff = 0;
        if (frame === 1) { leftArmOff = 2; rightArmOff = -2; }
        else if (frame === 3) { leftArmOff = -2; rightArmOff = 2; }

        g.fillStyle(config.skinColor);
        g.fillRoundedRect(ox - 14, oy - 24 + leftArmOff, 5, 12, 2);
        g.fillRoundedRect(ox + 9, oy - 24 + rightArmOff, 5, 12, 2);
        g.fillStyle(config.shirtColor);
        g.fillRoundedRect(ox - 14, oy - 24 + leftArmOff, 5, 5, 2);
        g.fillRoundedRect(ox + 9, oy - 24 + rightArmOff, 5, 5, 2);

        // Head
        g.fillStyle(config.skinColor);
        g.fillRoundedRect(ox - 8, oy - 38, 16, 14, 4);

        // Eyes
        g.fillStyle(0xffffff);
        g.fillRoundedRect(ox - 6, oy - 34, 5, 5, 2);
        g.fillRoundedRect(ox + 1, oy - 34, 5, 5, 2);
        g.fillStyle(0x1a1a2e);
        g.fillCircle(ox - 4, oy - 32, 1.5);
        g.fillCircle(ox + 3, oy - 32, 1.5);

        // Mouth
        g.fillStyle(0xcc7755);
        g.fillRoundedRect(ox - 2, oy - 28, 4, 2, 1);

        // Hair
        g.fillStyle(config.hairColor);
        switch (config.hairStyle) {
            case 'short':
                g.fillRoundedRect(ox - 9, oy - 42, 18, 8, 4);
                break;
            case 'long':
                g.fillRoundedRect(ox - 10, oy - 43, 20, 10, 5);
                g.fillRoundedRect(ox - 11, oy - 38, 4, 18, 2);
                g.fillRoundedRect(ox + 7, oy - 38, 4, 18, 2);
                break;
            case 'spiky':
                g.fillRoundedRect(ox - 9, oy - 42, 18, 8, 3);
                g.fillTriangle(ox - 6, oy - 42, ox - 3, oy - 48, ox, oy - 42);
                g.fillTriangle(ox, oy - 42, ox + 3, oy - 50, ox + 6, oy - 42);
                break;
            case 'curly':
                g.fillRoundedRect(ox - 10, oy - 43, 20, 10, 5);
                for (let i = -8; i <= 8; i += 4) g.fillCircle(ox + i, oy - 42, 3);
                break;
            case 'ponytail':
                g.fillRoundedRect(ox - 9, oy - 42, 18, 8, 4);
                g.fillRoundedRect(ox + 6, oy - 36, 3, 14, 2);
                break;
        }

        rt.draw(g);
        g.destroy();
    }

    rt.saveTexture(key);
    rt.destroy();
    return key;
}
