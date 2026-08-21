// =========================================================================
//  NPCs AND TRAINERS
//  Map objects reference these by id, so dialogue and teams live in one
//  place instead of being duplicated across map files.
// =========================================================================

// Plain talkers. `lines` are shown one page at a time.
export const NPCS = Object.freeze({
  townkid: {
    name: 'KID',
    color: 0x4a7fd6,
    lines: [
      'Hi! Are you a monster trainer?',
      'The tall grass on ROUTE 1 is full of\nwild monsters.',
      "Don't go in without a healthy party!",
    ],
  },
  nurse: {
    name: 'HELPER',
    color: 0xe07ba8,
    lines: [
      'Welcome to the rest house!',
      'Stand on the wooden floor and your\nparty will be fully restored.',
    ],
  },
  hiker: {
    name: 'HIKER',
    color: 0x8a6b3c,
    lines: [
      'The monsters deeper in MAAZ CAVE are\ntougher than the ones out here.',
      'Take a POTION or two with you.',
    ],
  },
});

// Trainers challenge you on sight and battle with a full team.
// `sightRange` is how many tiles ahead they watch, along their facing.
export const TRAINERS = Object.freeze({
  youngster_joey: {
    name: 'YOUNGSTER JOE',
    color: 0x5aa9e6,
    sightRange: 4,
    intro: ["Hey! You there!", "Let's battle!"],
    defeatLine: 'Aww, my monsters need more training!',
    afterLine: 'Wild monsters get tougher further east.',
    reward: 120,
    team: [
      { species: 'birbo', level: 5 },
      { species: 'aqua', level: 6 },
    ],
  },
  camper_rae: {
    name: 'CAMPER RAE',
    color: 0xe08a3c,
    sightRange: 3,
    intro: ['My team trains in the tall grass!', 'Show me what you have got.'],
    defeatLine: 'You really know your type matchups.',
    afterLine: 'Grass moves are weak to fire — remember that!',
    reward: 160,
    team: [
      { species: 'leaflet', level: 6, held: 'miracleseed' },
      { species: 'pebbo', level: 7 },
    ],
  },
  miner_dell: {
    name: 'MINER DELL',
    color: 0xc9a227,
    sightRange: 4,
    intro: ['Nobody gets past me in this cave!'],
    defeatLine: 'Bah! You dug right through my defence.',
    afterLine: 'The crystals here hide strong monsters.',
    reward: 240,
    team: [
      { species: 'pebbo', level: 8, held: 'oranberry' },
      { species: 'zapmo', level: 9, held: 'magnet' },
    ],
  },
});
