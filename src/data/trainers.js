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
      'Stuck on a battle? Your BAG has a RARE\nCANDY that never runs out.',
      'One candy is one level — but it stops\nfive levels above the CHAMPION.',
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
  shopkeep: {
    name: 'SHOPKEEPER',
    color: 0x4caf7d,
    shop: true,
    lines: ['Welcome! Prize money from trainers\nbuys everything on these shelves.'],
  },
  ranch_hand: {
    name: 'RANCH HAND',
    color: 0xd9b382,
    lines: [
      'I raise sheep out on ROUTE 1.',
      'A LAMBLET is gentle, but raise one far\nenough and it becomes a RAMBOLT!',
      'Here — take this one. Look after it.',
    ],
    // Handing over a monster is a one-off scripted gift.
    gift: { species: 'lamblet', level: 5 },
    afterGift: ['How is your LAMBLET doing?'],
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

// Shopkeepers open the shop instead of talking. Listed as NPCs with a `shop`
// flag so map objects place them the same way as anyone else.
export const SHOPKEEPER = 'shopkeep';

// The champion is the end of the game. `requires` names the trainers that
// must be beaten first, so the finale can't be reached early.
export const CHAMPION_ID = 'champion_maya';

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
      { species: 'birbo', level: 4 },
      { species: 'aqua', level: 5 },
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
  champion_maya: {
    name: 'CHAMPION MAYA',
    color: 0x9b59b6,
    sightRange: 1,
    isChampion: true,
    requires: ['route1:joey', 'route1:rae', 'cave:dell'],
    lockedLine: [
      'The CHAMPION only battles trainers who\nhave beaten everyone on the road.',
      'Come back when you have won all three.',
    ],
    intro: [
      'So you beat every trainer out there.',
      'I am the last one standing.',
      'Show me everything you have learned!',
    ],
    defeatLine: 'A new champion. You earned it.',
    afterLine: 'That was a fine battle. Come again any time!',
    reward: 1000,
    team: [
      { species: 'aquadon', level: 18, held: 'mysticwater' },
      { species: 'leafgore', level: 18, held: 'oranberry' },
      { species: 'rambolt', level: 20, held: 'quickclaw' },
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

// The strongest monster the CHAMPION fields — their "ace". Derived rather
// than written down twice, so retuning the champion's team moves the level
// cap with it.
export function championAceLevel() {
  return Math.max(...TRAINERS[CHAMPION_ID].team.map((m) => m.level));
}

// How far the Rare Candy will take a monster. Five levels past the ace is
// enough to walk through the story without turning the champion into a
// formality, and it is a hard ceiling: the candy simply stops working.
export const CANDY_LEVELS_OVER_ACE = 5;

export function candyLevelCap() {
  return championAceLevel() + CANDY_LEVELS_OVER_ACE;
}
