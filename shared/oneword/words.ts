/** Original themed word groups for One Word. Every word is a common, single-token English noun. */
export interface WordGroup {
  theme: string;
  words: string[];
}

export const WORD_GROUPS: readonly WordGroup[] = [
  {
    theme: 'Animals',
    words: [
      'elephant', 'giraffe', 'penguin', 'dolphin', 'kangaroo', 'tiger', 'rabbit', 'squirrel', 'owl', 'zebra',
      'camel', 'panda', 'wolf', 'hedgehog', 'flamingo', 'gorilla', 'otter', 'parrot', 'lizard', 'moose',
    ],
  },
  {
    theme: 'Kitchen',
    words: [
      'spatula', 'kettle', 'toaster', 'blender', 'whisk', 'ladle', 'skillet', 'colander', 'grater', 'oven',
      'fridge', 'apron', 'saucepan', 'teapot', 'cutlery', 'napkin', 'tongs', 'microwave', 'dishwasher', 'mug',
    ],
  },
  {
    theme: 'Space',
    words: [
      'astronaut', 'rocket', 'comet', 'galaxy', 'planet', 'satellite', 'telescope', 'meteor', 'orbit', 'nebula',
      'asteroid', 'gravity', 'eclipse', 'crater', 'launchpad', 'spacesuit', 'constellation', 'moon', 'spaceship', 'alien',
    ],
  },
  {
    theme: 'Sports',
    words: [
      'referee', 'stadium', 'trophy', 'goalkeeper', 'racket', 'helmet', 'marathon', 'javelin', 'scoreboard', 'whistle',
      'hurdle', 'medal', 'coach', 'basketball', 'volleyball', 'skateboard', 'wrestler', 'archery', 'penalty', 'locker',
    ],
  },
  {
    theme: 'Music',
    words: [
      'guitar', 'drummer', 'violin', 'trumpet', 'piano', 'microphone', 'orchestra', 'melody', 'chorus', 'saxophone',
      'harmonica', 'bassline', 'conductor', 'headphones', 'lyric', 'rhythm', 'tambourine', 'concert', 'vinyl', 'flute',
    ],
  },
  {
    theme: 'Weather',
    words: [
      'thunder', 'lightning', 'blizzard', 'drizzle', 'hurricane', 'rainbow', 'tornado', 'fog', 'hailstone', 'breeze',
      'sunshine', 'monsoon', 'frost', 'humidity', 'forecast', 'umbrella', 'avalanche', 'drought', 'cloud', 'thermometer',
    ],
  },
  {
    theme: 'Clothing',
    words: [
      'sweater', 'sneaker', 'scarf', 'mitten', 'blazer', 'necktie', 'raincoat', 'pajamas', 'sandal', 'hoodie',
      'beanie', 'overalls', 'tuxedo', 'cardigan', 'sock', 'zipper', 'buckle', 'bathrobe', 'poncho', 'kilt',
    ],
  },
  {
    theme: 'Tools',
    words: [
      'hammer', 'wrench', 'screwdriver', 'chisel', 'pliers', 'drill', 'sandpaper', 'crowbar', 'toolbox', 'shovel',
      'ladder', 'tape', 'sawblade', 'clamp', 'level', 'anvil', 'mallet', 'trowel', 'nail', 'bolt',
    ],
  },
  {
    theme: 'Travel',
    words: [
      'passport', 'suitcase', 'airport', 'compass', 'itinerary', 'backpack', 'souvenir', 'hostel', 'ticket', 'cruise',
      'customs', 'tourist', 'landmark', 'jetlag', 'luggage', 'roadtrip', 'ferry', 'visa', 'postcard', 'layover',
    ],
  },
  {
    theme: 'Ocean',
    words: [
      'seaweed', 'coral', 'octopus', 'jellyfish', 'lighthouse', 'seashell', 'anchor', 'tide', 'shipwreck', 'starfish',
      'lobster', 'plankton', 'submarine', 'whale', 'seagull', 'harbor', 'surfboard', 'driftwood', 'reef', 'kelp',
    ],
  },
  {
    theme: 'Fantasy',
    words: [
      'dragon', 'wizard', 'castle', 'goblin', 'unicorn', 'potion', 'knight', 'griffin', 'dungeon', 'sorcerer',
      'enchantress', 'troll', 'phoenix', 'scroll', 'amulet', 'mermaid', 'giant', 'wand', 'quest', 'kingdom',
    ],
  },
  {
    theme: 'School',
    words: [
      'chalkboard', 'homework', 'locker', 'principal', 'textbook', 'recess', 'cafeteria', 'backpack', 'pencil', 'eraser',
      'gymnasium', 'detention', 'scholarship', 'diploma', 'library', 'quiz', 'classroom', 'notebook', 'teacher', 'ruler',
    ],
  },
  {
    theme: 'Garden',
    words: [
      'tulip', 'lawnmower', 'compost', 'greenhouse', 'seedling', 'wheelbarrow', 'sprinkler', 'hedge', 'fertilizer', 'trellis',
      'weed', 'orchard', 'birdbath', 'sunflower', 'gnome', 'shrub', 'mulch', 'rosebush', 'pumpkin', 'scarecrow',
    ],
  },
  {
    theme: 'City',
    words: [
      'skyscraper', 'subway', 'taxi', 'sidewalk', 'billboard', 'crosswalk', 'pigeon', 'streetlight', 'rooftop', 'traffic',
      'alley', 'skyline', 'fountain', 'mayor', 'parking', 'bakery', 'commuter', 'plaza', 'bridge', 'graffiti',
    ],
  },
  {
    theme: 'Movies',
    words: [
      'popcorn', 'director', 'sequel', 'trailer', 'villain', 'screenplay', 'blockbuster', 'cameo', 'stuntman', 'projector',
      'premiere', 'soundtrack', 'subtitle', 'actor', 'cinema', 'credits', 'spoiler', 'matinee', 'usher', 'plot',
    ],
  },
  {
    theme: 'Camping',
    words: [
      'tent', 'campfire', 'marshmallow', 'lantern', 'pinecone', 'canteen', 'trail', 'firewood', 'hammock', 'mosquito',
      'ranger', 'binoculars', 'kayak', 'cooler', 'flashlight', 'bonfire', 'wilderness', 'raccoon', 'thermos', 'hiker',
    ],
  },
];

/** Every word, flattened. A word may appear in more than one theme. */
export const ALL_WORDS: readonly string[] = Array.from(new Set(WORD_GROUPS.flatMap((g) => g.words)));

const THEME_BY_WORD = new Map<string, string>();
for (const group of WORD_GROUPS) {
  for (const word of group.words) {
    if (!THEME_BY_WORD.has(word)) THEME_BY_WORD.set(word, group.theme);
  }
}

/** The first theme a word belongs to, or null if it is not in any list. Case-insensitive. */
export function themeOf(word: string): string | null {
  return THEME_BY_WORD.get(word.trim().toLowerCase()) ?? null;
}

/** All words in a theme group (empty if unknown). */
export function wordsOfTheme(theme: string): readonly string[] {
  return WORD_GROUPS.find((g) => g.theme === theme)?.words ?? [];
}
