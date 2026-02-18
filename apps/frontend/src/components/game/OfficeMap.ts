// Office map data - rooms, furniture, zones
export const MAP_WIDTH = 2400;
export const MAP_HEIGHT = 1800;
export const TILE = 32;

export interface Room {
    x: number; y: number; w: number; h: number;
    label: string; floorColor: number; wallColor: number;
    type: 'office' | 'meeting' | 'lounge' | 'lobby' | 'kitchen' | 'outdoor';
}

export interface Furniture {
    x: number; y: number; w: number; h: number;
    color: number; type: string; label?: string; detail?: number;
}

export const ROOMS: Room[] = [
    // Main lobby
    { x: 320, y: 480, w: 640, h: 480, label: 'WELCOME LOBBY', floorColor: 0xd4a574, wallColor: 0x5a4a3a, type: 'lobby' },
    // Meeting room
    { x: 1040, y: 480, w: 480, h: 320, label: 'MEETING ROOM', floorColor: 0xc9b896, wallColor: 0x2d6b7a, type: 'meeting' },
    // Work area
    { x: 1040, y: 880, w: 640, h: 400, label: 'WORKSPACE', floorColor: 0xe8dcc8, wallColor: 0x5a4a3a, type: 'office' },
    // Lounge
    { x: 320, y: 1040, w: 640, h: 400, label: 'LOUNGE', floorColor: 0xb8a088, wallColor: 0x6b4a3a, type: 'lounge' },
    // Kitchen
    { x: 1760, y: 480, w: 400, h: 320, label: 'KITCHEN', floorColor: 0xf0e6d6, wallColor: 0x4a7a6b, type: 'kitchen' },
    // Outdoor garden
    { x: 320, y: 80, w: 800, h: 320, label: 'GARDEN', floorColor: 0x6b8f4a, wallColor: 0x4a6b3a, type: 'outdoor' },
    // Private office
    { x: 1760, y: 880, w: 400, h: 400, label: 'PRIVATE OFFICE', floorColor: 0xd4c4a8, wallColor: 0x8a6a4a, type: 'office' },
];

export function getFurniture(): Furniture[] {
    return [
        // LOBBY furniture
        { x: 400, y: 560, w: 128, h: 64, color: 0xc8c8d0, type: 'welcome_mat' },
        { x: 560, y: 520, w: 48, h: 48, color: 0x3a7a3a, type: 'plant' },
        { x: 800, y: 520, w: 48, h: 48, color: 0x3a7a3a, type: 'plant' },
        { x: 600, y: 700, w: 200, h: 100, color: 0x8888aa, type: 'couch' },
        { x: 400, y: 850, w: 80, h: 80, color: 0x6a5a4a, type: 'table', label: 'Info' },
        // MEETING ROOM furniture
        { x: 1120, y: 560, w: 300, h: 120, color: 0x7a5a3a, type: 'conf_table' },
        { x: 1140, y: 540, w: 32, h: 32, color: 0x4a6aaa, type: 'chair' },
        { x: 1200, y: 540, w: 32, h: 32, color: 0x4a6aaa, type: 'chair' },
        { x: 1260, y: 540, w: 32, h: 32, color: 0x4a6aaa, type: 'chair' },
        { x: 1340, y: 540, w: 32, h: 32, color: 0x4a6aaa, type: 'chair' },
        { x: 1140, y: 700, w: 32, h: 32, color: 0x4a6aaa, type: 'chair' },
        { x: 1200, y: 700, w: 32, h: 32, color: 0x4a6aaa, type: 'chair' },
        { x: 1260, y: 700, w: 32, h: 32, color: 0x4a6aaa, type: 'chair' },
        { x: 1340, y: 700, w: 32, h: 32, color: 0x4a6aaa, type: 'chair' },
        { x: 1420, y: 580, w: 60, h: 100, color: 0xeeeeee, type: 'whiteboard' },
        // WORKSPACE furniture - 4 desk clusters
        { x: 1100, y: 940, w: 100, h: 60, color: 0x8a6a4a, type: 'desk' },
        { x: 1100, y: 1020, w: 100, h: 60, color: 0x8a6a4a, type: 'desk' },
        { x: 1280, y: 940, w: 100, h: 60, color: 0x8a6a4a, type: 'desk' },
        { x: 1280, y: 1020, w: 100, h: 60, color: 0x8a6a4a, type: 'desk' },
        { x: 1460, y: 940, w: 100, h: 60, color: 0x8a6a4a, type: 'desk' },
        { x: 1460, y: 1020, w: 100, h: 60, color: 0x8a6a4a, type: 'desk' },
        { x: 1560, y: 1180, w: 48, h: 48, color: 0x3a7a3a, type: 'plant' },
        // LOUNGE furniture
        { x: 400, y: 1120, w: 200, h: 100, color: 0xaa4444, type: 'couch' },
        { x: 640, y: 1120, w: 200, h: 100, color: 0xaa4444, type: 'couch' },
        { x: 500, y: 1260, w: 120, h: 80, color: 0x5a4a3a, type: 'table', label: 'Coffee' },
        { x: 800, y: 1260, w: 64, h: 96, color: 0x333388, type: 'arcade' },
        { x: 380, y: 1320, w: 48, h: 48, color: 0x3a7a3a, type: 'plant' },
        { x: 880, y: 1100, w: 48, h: 48, color: 0x3a7a3a, type: 'plant' },
        // KITCHEN furniture
        { x: 1800, y: 520, w: 200, h: 48, color: 0xaaaaaa, type: 'counter' },
        { x: 1800, y: 600, w: 60, h: 60, color: 0x4488cc, type: 'water_cooler' },
        { x: 1900, y: 620, w: 100, h: 60, color: 0x7a5a3a, type: 'table' },
        { x: 2060, y: 520, w: 48, h: 80, color: 0xcccccc, type: 'fridge' },
        // GARDEN objects
        { x: 400, y: 160, w: 64, h: 64, color: 0x2a6a2a, type: 'tree' },
        { x: 600, y: 120, w: 64, h: 64, color: 0x2a6a2a, type: 'tree' },
        { x: 800, y: 200, w: 64, h: 64, color: 0x2a6a2a, type: 'tree' },
        { x: 500, y: 280, w: 100, h: 48, color: 0x7a5a3a, type: 'bench' },
        { x: 900, y: 280, w: 48, h: 48, color: 0x88aacc, type: 'fountain' },
        { x: 1000, y: 160, w: 48, h: 48, color: 0x3a7a3a, type: 'plant' },
        // PRIVATE OFFICE
        { x: 1820, y: 940, w: 160, h: 80, color: 0x6a4a2a, type: 'desk' },
        { x: 1860, y: 1040, w: 32, h: 32, color: 0x4a6aaa, type: 'chair' },
        { x: 2040, y: 940, w: 80, h: 160, color: 0x5a4a3a, type: 'bookshelf' },
        { x: 1820, y: 1140, w: 120, h: 80, color: 0x8888aa, type: 'couch' },
        { x: 2040, y: 1160, w: 48, h: 48, color: 0x3a7a3a, type: 'plant' },
        { x: 1820, y: 1060, w: 48, h: 32, color: 0xccaa44, type: 'lamp' },
    ];
}

export const COLLISION_RECTS = getFurniture().map(f => ({
    x: f.x, y: f.y, w: f.w, h: f.h
}));
