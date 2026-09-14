/**
 * Letter Rush content. Category names are shown to players; the example answers
 * are used ONLY by bots (they pick one that starts with the round's letter).
 * Examples deliberately spread across many starting letters.
 */

export interface Category {
  name: string;
  examples: string[];
}

/** Playable letters: the alphabet minus the three that are too hard. */
export const LETTERS: readonly string[] = 'ABCDEFGHIJKLMNOPRSTUVWY'.split('');

const ARTICLE = /^(the|a|an)\s+/;

/**
 * Canonical form used for duplicate detection: lowercase, trimmed, spaces collapsed,
 * leading "the/a/an" removed, everything that is not a letter or digit dropped.
 */
export function normalize(answer: string): string {
  const lowered = answer.toLowerCase().trim().replace(/\s+/g, ' ').replace(ARTICLE, '');
  return lowered.replace(/[^a-z0-9]/g, '');
}

/** Does the answer start with the letter, ignoring case and a leading article? */
export function startsWithLetter(answer: string, letter: string): boolean {
  const body = answer.toLowerCase().trim().replace(/\s+/g, ' ').replace(ARTICLE, '');
  const first = body.replace(/^[^a-z0-9]+/, '').charAt(0);
  return first !== '' && first === letter.toLowerCase();
}

export const CATEGORIES: Category[] = [
  {
    name: 'Things in a backpack',
    examples: ['Apple', 'Books', 'Calculator', 'Deodorant', 'Eraser', 'Flashlight', 'Gum', 'Headphones', 'Ink pen', 'Jacket', 'Keys', 'Laptop', 'Marker', 'Notebook', 'Pencil', 'Ruler', 'Snacks', 'Tissues', 'Umbrella', 'Water bottle'],
  },
  {
    name: 'Movie villains',
    examples: ['Alien queen', 'Bank robber', 'Corrupt mayor', 'Dark wizard', 'Evil twin', 'Fallen hero', 'Ghost pirate', 'Hitman', 'Ice king', 'Jewel thief', 'Kidnapper', 'Loan shark', 'Mad scientist', 'Necromancer', 'Overlord', 'Poisoner', 'Rogue robot', 'Shark', 'Tyrant', 'Warlord'],
  },
  {
    name: 'Breakfast foods',
    examples: ['Avocado toast', 'Bagel', 'Cereal', 'Donut', 'Eggs', 'French toast', 'Granola', 'Hash browns', 'Instant oats', 'Jam on toast', 'Kippers', 'Latte', 'Muffin', 'Nectarine', 'Omelette', 'Pancakes', 'Rice porridge', 'Sausage', 'Toast', 'Waffles', 'Yogurt'],
  },
  {
    name: 'Reasons to be late',
    examples: ['Alarm failed', 'Bus broke down', 'Car trouble', 'Dog got loose', 'Elevator stuck', 'Flat tire', 'Got lost', 'Heavy traffic', 'Ice on the road', 'Jammed printer', 'Kids were sick', 'Long line', 'Missed the train', 'Nap ran long', 'Overslept', 'Parking was full', 'Rain', 'Spilled coffee', 'Train delay', 'Wrong address'],
  },
  {
    name: 'Board game pieces',
    examples: ['Ace card', 'Bishop', 'Coin', 'Dice', 'Egg timer', 'Figurine', 'Game board', 'Hourglass', 'Instruction sheet', 'Joker', 'King', 'Letter tile', 'Meeple', 'Notepad', 'Pawn', 'Rook', 'Spinner', 'Token', 'Wooden cube'],
  },
  {
    name: 'Things that are sticky',
    examples: ['Adhesive', 'Bubble gum', 'Caramel', 'Duct tape', 'Epoxy', 'Flypaper', 'Glue', 'Honey', 'Icing', 'Jam', 'Ketchup', 'Lollipop', 'Maple syrup', 'Nectar', 'Oil spill', 'Peanut butter', 'Resin', 'Syrup', 'Tar', 'Velcro', 'Wax'],
  },
  {
    name: 'Things you shout at a sports game',
    examples: ['Amazing', 'Boo', 'Come on', 'Defense', 'Encore', 'Foul', 'Go team', 'Hurry up', 'Incredible', 'Just shoot', 'Keep going', 'Let him play', 'Move it', 'No way', 'Offside', 'Pass it', 'Referee', 'Shoot', 'Time out', 'Unbelievable', 'We want more', 'Yes'],
  },
  {
    name: 'Kitchen gadgets',
    examples: ['Apple corer', 'Blender', 'Can opener', 'Dish rack', 'Egg slicer', 'Food processor', 'Garlic press', 'Hand mixer', 'Ice cream scoop', 'Juicer', 'Kettle', 'Ladle', 'Mandoline', 'Nutcracker', 'Oven mitt', 'Peeler', 'Rolling pin', 'Spatula', 'Toaster', 'Whisk'],
  },
  {
    name: 'Things at a wedding',
    examples: ['Aisle', 'Bouquet', 'Cake', 'Dancing', 'Engagement ring', 'Flowers', 'Guests', 'Honeymoon plans', 'Invitations', 'Jazz band', 'Kiss', 'Limousine', 'Music', 'Napkins', 'Officiant', 'Photographer', 'Rings', 'Speeches', 'Toast', 'Veil', 'Wedding dress'],
  },
  {
    name: 'Excuses for not doing homework',
    examples: ['Ate it by mistake', 'Baby sister tore it', 'Computer crashed', 'Dog ate it', 'Email did not send', 'Forgot the textbook', 'Grandma visited', 'Had a headache', 'Internet was down', 'Just too tired', 'Kept getting distracted', 'Lost my bag', 'Misread the due date', 'No printer ink', 'Out of paper', 'Power outage', 'Rain soaked it', 'Sick all night', 'Too hard', 'Wrong assignment'],
  },
  {
    name: 'Things with wheels',
    examples: ['Ambulance', 'Bicycle', 'Cart', 'Dump truck', 'Electric scooter', 'Forklift', 'Golf cart', 'Hearse', 'Ice cream truck', 'Jeep', 'Kart', 'Lawn mower', 'Motorcycle', 'Office chair', 'Pram', 'Roller skates', 'Skateboard', 'Tractor', 'Unicycle', 'Van', 'Wheelbarrow'],
  },
  {
    name: 'Ice cream flavors',
    examples: ['Almond', 'Butterscotch', 'Chocolate', 'Dulce de leche', 'Espresso', 'Fudge ripple', 'Green tea', 'Hazelnut', 'Irish cream', 'Java chip', 'Key lime', 'Lemon', 'Mint chip', 'Neapolitan', 'Orange sherbet', 'Pistachio', 'Raspberry', 'Strawberry', 'Toffee', 'Vanilla', 'Walnut'],
  },
  {
    name: 'Jobs that wear a uniform',
    examples: ['Airline pilot', 'Bus driver', 'Chef', 'Doctor', 'Electrician', 'Firefighter', 'Guard', 'Hotel porter', 'Inspector', 'Janitor', 'Kennel worker', 'Lifeguard', 'Mail carrier', 'Nurse', 'Officer', 'Paramedic', 'Referee', 'Soldier', 'Train conductor', 'Usher', 'Waiter'],
  },
  {
    name: 'Things you find at the beach',
    examples: ['Algae', 'Beach ball', 'Crab', 'Driftwood', 'Eel', 'Frisbee', 'Gulls', 'Hermit crab', 'Ice cream stand', 'Jellyfish', 'Kite', 'Lifeguard', 'Mussels', 'Net', 'Ocean', 'Pebbles', 'Rocks', 'Sand', 'Towel', 'Umbrella', 'Volleyball', 'Waves'],
  },
  {
    name: 'Ways to say hello',
    examples: ['Ahoy', 'Bonjour', 'Ciao', 'Dear friends', 'Evening', 'Fancy seeing you', 'Good day', 'Hey there', 'Is that you', 'Jolly good to see you', 'Konnichiwa', 'Long time no see', 'Morning', 'Nice to see you', 'Oh hi', 'Pleased to meet you', 'Right on time', 'Salutations', 'There you are', 'Welcome', 'Yo'],
  },
  {
    name: 'Things that glow',
    examples: ['Aurora', 'Bioluminescent algae', 'Campfire', 'Digital clock', 'Embers', 'Firefly', 'Glow stick', 'Headlights', 'Iridescent paint', 'Jellyfish', 'Kerosene lamp', 'Lava', 'Moon', 'Neon sign', 'Ocean plankton', 'Phone screen', 'Radium dial', 'Stars', 'Torch', 'Uranium glass', 'Watch face'],
  },
  {
    name: 'Halloween costumes',
    examples: ['Astronaut', 'Bat', 'Cowboy', 'Devil', 'Elf', 'Frankenstein monster', 'Ghost', 'Hot dog', 'Inflatable dinosaur', 'Jester', 'Knight', 'Lion', 'Mummy', 'Ninja', 'Ogre', 'Pirate', 'Robot', 'Skeleton', 'Toaster', 'Unicorn', 'Vampire', 'Witch', 'Yeti'],
  },
  {
    name: 'Things in a hospital',
    examples: ['Ambulance', 'Bandages', 'Crutches', 'Doctor', 'Emergency room', 'Face masks', 'Gurney', 'Hand sanitizer', 'IV drip', 'Janitor', 'Kidney machine', 'Lab', 'Medicine', 'Nurse', 'Operating room', 'Pharmacy', 'Receptionist', 'Stethoscope', 'Thermometer', 'Ultrasound', 'Visitors', 'Wheelchair', 'X-ray'],
  },
  {
    name: 'Pizza toppings',
    examples: ['Anchovies', 'Bacon', 'Chicken', 'Diced tomatoes', 'Eggplant', 'Feta', 'Garlic', 'Ham', 'Italian sausage', 'Jalapenos', 'Kale', 'Lamb', 'Mushrooms', 'Nduja', 'Onions', 'Pepperoni', 'Ricotta', 'Spinach', 'Tuna', 'Vegan cheese', 'Walnuts'],
  },
  {
    name: 'Superpowers',
    examples: ['Animal speech', 'Bulletproof skin', 'Cloning', 'Duplication', 'Elasticity', 'Flight', 'Gravity control', 'Healing', 'Invisibility', 'Jumping high', 'Kinetic blasts', 'Laser eyes', 'Mind reading', 'Night vision', 'Omniscience', 'Phasing', 'Regeneration', 'Super speed', 'Teleportation', 'Underwater breathing', 'Weather control', 'X-ray vision'],
  },
  {
    name: 'Things in a garage',
    examples: ['Air pump', 'Bicycle', 'Car', 'Drill', 'Extension cord', 'Fuel can', 'Garden hose', 'Hammer', 'Ice scraper', 'Jack', 'Kayak', 'Ladder', 'Mower', 'Nails', 'Oil', 'Paint cans', 'Rake', 'Screwdriver', 'Toolbox', 'Vise', 'Workbench'],
  },
  {
    name: 'Words a pirate might say',
    examples: ['Ahoy', 'Booty', 'Cannon', 'Doubloons', 'Eye patch', 'First mate', 'Gangplank', 'Hoist the sails', 'Island', 'Jolly Roger', 'Keelhaul', 'Landlubber', 'Matey', 'Navigator', 'Ocean', 'Plunder', 'Rum', 'Shiver me timbers', 'Treasure', 'Walk the plank', 'Yo ho ho'],
  },
  {
    name: 'Things you do on a rainy day',
    examples: ['Assemble a puzzle', 'Bake cookies', 'Clean the closet', 'Draw', 'Email old friends', 'Fold laundry', 'Game night', 'Hot cocoa', 'Indoor picnic', 'Journal', 'Knit', 'Listen to music', 'Movie marathon', 'Nap', 'Organize photos', 'Paint', 'Read a book', 'Sleep in', 'Tea and toast', 'Video call family', 'Write letters'],
  },
  {
    name: 'Animals with tails',
    examples: ['Alligator', 'Beaver', 'Cat', 'Dog', 'Elephant', 'Fox', 'Giraffe', 'Horse', 'Iguana', 'Jaguar', 'Kangaroo', 'Lemur', 'Monkey', 'Newt', 'Otter', 'Peacock', 'Rat', 'Squirrel', 'Tiger', 'Vulture', 'Wolf', 'Yak'],
  },
  {
    name: 'Things in a purse',
    examples: ['Aspirin', 'Brush', 'Coins', 'Driver license', 'Earbuds', 'Floss', 'Gum', 'Hand cream', 'ID card', 'Journal', 'Keys', 'Lip balm', 'Mirror', 'Nail file', 'Old receipts', 'Phone', 'Receipts', 'Sunglasses', 'Tissues', 'Umbrella', 'Wallet'],
  },
  {
    name: 'Ways to cook an egg',
    examples: ['Air fried', 'Boiled', 'Coddled', 'Deviled', 'Egg drop soup', 'Fried', 'Grilled', 'Hard boiled', 'In a frittata', 'Just poached', 'Kedgeree', 'Lightly scrambled', 'Microwaved', 'Nested in toast', 'Omelette', 'Poached', 'Ramen egg', 'Scrambled', 'Tea egg', 'Under a broiler', 'Whipped into a souffle'],
  },
  {
    name: 'Things that are cold',
    examples: ['Arctic', 'Blizzard', 'Cucumber', 'Dry ice', 'Eskimo pie', 'Frost', 'Glacier', 'Hail', 'Ice', 'January', 'Kitchen freezer', 'Lake in winter', 'Milkshake', 'North Pole', 'Ocean depths', 'Popsicle', 'Refrigerator', 'Snow', 'Tundra', 'Vanilla shake', 'Winter wind', 'Yeti cave'],
  },
  {
    name: 'Musical instruments',
    examples: ['Accordion', 'Banjo', 'Cello', 'Drums', 'Electric guitar', 'Flute', 'Guitar', 'Harp', 'Irish whistle', 'Jaw harp', 'Kazoo', 'Lute', 'Mandolin', 'Nose flute', 'Oboe', 'Piano', 'Recorder', 'Saxophone', 'Trumpet', 'Ukulele', 'Viola', 'Washboard', 'Xylophone'],
  },
  {
    name: 'Things you rent',
    examples: ['Apartment', 'Boat', 'Car', 'Dress', 'Equipment', 'Formal suit', 'Garage space', 'House', 'Inflatable castle', 'Jet ski', 'Karaoke machine', 'Locker', 'Moving truck', 'Nanny cam', 'Office', 'Paddleboard', 'Room', 'Scooter', 'Tent', 'Umbrella at the beach', 'Van', 'Wedding venue'],
  },
  {
    name: 'Things that are loud',
    examples: ['Airplane', 'Baby crying', 'Chainsaw', 'Drums', 'Explosion', 'Fireworks', 'Garbage truck', 'Helicopter', 'Ice cream truck jingle', 'Jackhammer', 'Karaoke night', 'Lawn mower', 'Motorcycle', 'Nightclub', 'Orchestra', 'Parade', 'Rock concert', 'Siren', 'Thunder', 'Vacuum cleaner', 'Whistle'],
  },
  {
    name: 'Things in outer space',
    examples: ['Asteroid', 'Black hole', 'Comet', 'Dwarf planet', 'Exoplanet', 'Falling star', 'Galaxy', 'Hydrogen cloud', 'Ice moon', 'Jupiter', 'Kuiper belt', 'Lunar dust', 'Meteor', 'Nebula', 'Orbit', 'Planet', 'Rocket', 'Satellite', 'Telescope', 'Universe', 'Venus', 'White dwarf'],
  },
  {
    name: 'Things you take camping',
    examples: ['Axe', 'Bug spray', 'Compass', 'Dry bag', 'Extra socks', 'Flashlight', 'Ground sheet', 'Hammock', 'Insect net', 'Jerky', 'Knife', 'Lantern', 'Matches', 'Nuts', 'Oatmeal', 'Pocket knife', 'Rope', 'Sleeping bag', 'Tent', 'Utensils', 'Water filter'],
  },
  {
    name: 'Yellow things',
    examples: ['Apricot', 'Banana', 'Canary', 'Dandelion', 'Egg yolk', 'French fries', 'Gold', 'Honey', 'Iced lemonade', 'Juicy pineapple', 'Kernels of corn', 'Lemon', 'Mustard', 'Number two pencil', 'Omelette', 'Pineapple', 'Rubber duck', 'Sunflower', 'Taxi', 'Urine', 'Vanilla pudding', 'Wax', 'Yolk'],
  },
  {
    name: 'Things at a birthday party',
    examples: ['Activities', 'Balloons', 'Cake', 'Decorations', 'Entertainment', 'Friends', 'Gifts', 'Hats', 'Ice cream', 'Juice boxes', 'Karaoke', 'Loot bags', 'Music', 'Napkins', 'Outdoor games', 'Presents', 'Ribbons', 'Streamers', 'Treats', 'Unwrapping', 'Wishes'],
  },
  {
    name: 'Things you plug in',
    examples: ['Air conditioner', 'Blender', 'Computer', 'Dishwasher', 'Electric kettle', 'Fan', 'Game console', 'Hair dryer', 'Iron', 'Juicer', 'Keyboard', 'Lamp', 'Microwave', 'Night light', 'Oven', 'Printer', 'Router', 'Speaker', 'Television', 'USB hub', 'Vacuum', 'Washing machine'],
  },
  {
    name: 'Hobbies',
    examples: ['Archery', 'Baking', 'Chess', 'Drawing', 'Embroidery', 'Fishing', 'Gardening', 'Hiking', 'Ice skating', 'Juggling', 'Knitting', 'Lego building', 'Magic tricks', 'Needlepoint', 'Origami', 'Photography', 'Reading', 'Sewing', 'Tennis', 'Upcycling', 'Video games', 'Woodworking', 'Yoga'],
  },
  {
    name: 'Things in a bathroom',
    examples: ['Aftershave', 'Bathtub', 'Comb', 'Deodorant', 'Exhaust fan', 'Faucet', 'Grout', 'Hand soap', 'Incense', 'Jar of cotton balls', 'Kids bath toys', 'Loofah', 'Mirror', 'Nail clippers', 'Ointment', 'Plunger', 'Razor', 'Shower', 'Toothbrush', 'Under-sink cabinet', 'Vanity', 'Washcloth'],
  },
  {
    name: 'Fictional creatures',
    examples: ['Alicorn', 'Basilisk', 'Centaur', 'Dragon', 'Elf', 'Fairy', 'Griffin', 'Hydra', 'Imp', 'Jackalope', 'Kraken', 'Leprechaun', 'Mermaid', 'Nymph', 'Ogre', 'Phoenix', 'Roc', 'Sphinx', 'Troll', 'Unicorn', 'Vampire', 'Werewolf', 'Yeti'],
  },
  {
    name: 'Things that are round',
    examples: ['Apple', 'Ball', 'Coin', 'Donut', 'Earth', 'Frisbee', 'Globe', 'Hula hoop', 'Iris', 'Jar lid', 'Kiwi', 'Lens', 'Marble', 'Nickel', 'Orange', 'Pizza', 'Ring', 'Sun', 'Tire', 'Umbrella top', 'Vinyl record', 'Wheel', 'Yo-yo'],
  },
  {
    name: 'Things a dog does',
    examples: ['Ambles', 'Barks', 'Chews shoes', 'Digs', 'Eats scraps', 'Fetches', 'Growls', 'Howls', 'Itches', 'Jumps', 'Kisses', 'Licks', 'Marks trees', 'Naps', 'Obeys', 'Pants', 'Rolls over', 'Sniffs', 'Tail wags', 'Urges walks', 'Whines', 'Yawns'],
  },
  {
    name: 'Reasons to call in sick',
    examples: ['Allergies', 'Back pain', 'Cold', 'Dentist appointment', 'Ear infection', 'Flu', 'Gastro bug', 'Headache', 'Injury', 'Jet lag', 'Kidney stone', 'Laryngitis', 'Migraine', 'Nausea', 'Oral surgery', 'Pink eye', 'Rash', 'Stomach ache', 'Toothache', 'Upset stomach', 'Vertigo', 'Wisdom teeth'],
  },
  {
    name: 'Things you find in a park',
    examples: ['Acorns', 'Benches', 'Cyclists', 'Ducks', 'Exercise stations', 'Fountain', 'Grass', 'Hedges', 'Ice cream cart', 'Joggers', 'Kites', 'Lake', 'Monument', 'Nature trail', 'Oak trees', 'Picnic tables', 'Roses', 'Swings', 'Trees', 'Umbrellas', 'Volleyball net', 'Water fountain'],
  },
  {
    name: 'Things that come in pairs',
    examples: ['Arms', 'Boots', 'Chopsticks', 'Dice', 'Earrings', 'Feet', 'Gloves', 'Hands', 'Ice skates', 'Jeans legs', 'Knees', 'Lungs', 'Mittens', 'Nostrils', 'Oars', 'Pants', 'Roller skates', 'Socks', 'Twins', 'Underarms', 'Vocal cords', 'Wings'],
  },
  {
    name: 'Types of weather',
    examples: ['Avalanche conditions', 'Blizzard', 'Cloudy', 'Drizzle', 'El Nino', 'Fog', 'Gale', 'Hail', 'Ice storm', 'Jet stream shift', 'Killer heat', 'Lightning', 'Mist', 'Nor easter', 'Overcast', 'Precipitation', 'Rain', 'Sleet', 'Thunderstorm', 'Umbrella weather', 'Very hot', 'Windy'],
  },
  {
    name: 'Things you wear on your feet',
    examples: ['Ankle boots', 'Boots', 'Clogs', 'Dress shoes', 'Espadrilles', 'Flip flops', 'Galoshes', 'High heels', 'Insoles', 'Jelly shoes', 'Kicks', 'Loafers', 'Moccasins', 'Nylon socks', 'Oxfords', 'Pumps', 'Rain boots', 'Sandals', 'Trainers', 'Ugly slippers', 'Velcro sneakers', 'Wedges', 'Yoga socks'],
  },
  {
    name: 'Things that are sweet',
    examples: ['Apple pie', 'Brownies', 'Candy', 'Doughnut', 'Eclair', 'Fudge', 'Gummy bears', 'Honey', 'Ice cream', 'Jelly beans', 'Kettle corn', 'Lollipop', 'Marshmallow', 'Nougat', 'Oatmeal cookies', 'Pudding', 'Rock candy', 'Sugar', 'Toffee', 'Upside-down cake', 'Vanilla cake', 'Whipped cream'],
  },
  {
    name: 'Things you do at the gym',
    examples: ['Aerobics', 'Bench press', 'Cardio', 'Deadlift', 'Elliptical', 'Free weights', 'Get sweaty', 'Hip thrusts', 'Interval training', 'Jump rope', 'Kettlebells', 'Lunges', 'Mountain climbers', 'Neck stretches', 'Overhead press', 'Push ups', 'Rowing', 'Squats', 'Treadmill', 'Upright rows', 'Vertical jumps', 'Warm up', 'Yoga'],
  },
  {
    name: 'Things with buttons',
    examples: ['Accordion', 'Blender', 'Calculator', 'Doorbell', 'Elevator', 'Fire alarm', 'Game controller', 'Hoodie', 'Intercom', 'Jacket', 'Keyboard', 'Lift panel', 'Microwave', 'Nightstand clock', 'Overcoat', 'Phone', 'Remote control', 'Shirt', 'Traffic crossing pole', 'Uniform', 'Vending machine', 'Watch'],
  },
  {
    name: 'Things that bounce',
    examples: ['Acorn', 'Basketball', 'Checks', 'Dodgeball', 'Emails', 'Football', 'Golf ball', 'Hail', 'Inflatable castle', 'Jumping bean', 'Kangaroo', 'Light off a mirror', 'Marbles', 'Net ball', 'Orange', 'Ping pong ball', 'Rubber ball', 'Spring', 'Tennis ball', 'Uneven road', 'Volleyball', 'Water balloon'],
  },
  {
    name: 'Things at a carnival',
    examples: ['Arcade', 'Bumper cars', 'Cotton candy', 'Dunk tank', 'Elephant ears', 'Ferris wheel', 'Games', 'Haunted house', 'Ice cream', 'Juggler', 'Kettle corn', 'Lights', 'Merry-go-round', 'Noise', 'Overpriced tickets', 'Popcorn', 'Ring toss', 'Stuffed animals', 'Tickets', 'Unicycle rider', 'Vendors', 'Whack-a-mole'],
  },
  {
    name: 'Things in a classroom',
    examples: ['Alphabet chart', 'Blackboard', 'Chairs', 'Desks', 'Eraser', 'Flag', 'Globe', 'Homework bin', 'Interactive board', 'Jars of pencils', 'Kids', 'Lockers', 'Maps', 'Notebooks', 'Overhead projector', 'Pencils', 'Ruler', 'Students', 'Teacher', 'Uniforms', 'Vocabulary wall', 'Whiteboard'],
  },
  {
    name: 'Things you can spread',
    examples: ['Almond butter', 'Butter', 'Cream cheese', 'Dip', 'Egg salad', 'Frosting', 'Gossip', 'Hummus', 'Icing', 'Jam', 'Kindness', 'Lard', 'Mayonnaise', 'Nut butter', 'Olive tapenade', 'Peanut butter', 'Rumors', 'Salsa', 'Tahini', 'Under-eye cream', 'Vegetable pate', 'Wildfire'],
  },
  {
    name: 'Things a baby needs',
    examples: ['Affection', 'Bottle', 'Crib', 'Diapers', 'Ear checks', 'Formula', 'Gentle songs', 'High chair', 'Immunizations', 'Jumper', 'Kisses', 'Lullabies', 'Milk', 'Naps', 'Onesie', 'Pacifier', 'Rattle', 'Stroller', 'Teether', 'Undershirt', 'Vitamins', 'Wipes'],
  },
  {
    name: 'Things on a farm',
    examples: ['Alpaca', 'Barn', 'Cows', 'Ducks', 'Eggs', 'Fence', 'Goats', 'Hay', 'Irrigation', 'Jugs of milk', 'Kittens', 'Lambs', 'Mud', 'Nest boxes', 'Orchard', 'Pigs', 'Rooster', 'Silo', 'Tractor', 'Udders', 'Vegetables', 'Wheat'],
  },
  {
    name: 'Things you can climb',
    examples: ['Apple tree', 'Boulder', 'Cliff', 'Drainpipe', 'Escalator', 'Fence', 'Gutter', 'Hill', 'Ivy wall', 'Jungle gym', 'Kilimanjaro', 'Ladder', 'Mountain', 'Net', 'Oak tree', 'Pole', 'Rope', 'Stairs', 'Tree', 'Uphill trail', 'Volcano', 'Wall'],
  },
  {
    name: 'Things that smell bad',
    examples: ['Ammonia', 'Bad breath', 'Compost', 'Dumpster', 'Expired milk', 'Fish market', 'Garbage', 'Hockey bag', 'Insect repellent', 'Jockstrap', 'Kitty litter', 'Landfill', 'Moldy bread', 'Nail polish remover', 'Onions', 'Porta potty', 'Rotten eggs', 'Skunk', 'Trash', 'Unwashed socks', 'Vomit', 'Wet dog'],
  },
  {
    name: 'Things you do before bed',
    examples: ['Adjust the thermostat', 'Brush teeth', 'Charge phone', 'Dim lights', 'Eat a snack', 'Floss', 'Get pajamas on', 'Hug the kids', 'Iron tomorrow shirt', 'Journal', 'Kiss goodnight', 'Lock the door', 'Meditate', 'Night cream', 'Open a window', 'Pray', 'Read', 'Set alarm', 'Turn off TV', 'Unwind', 'Visit the bathroom', 'Wash face'],
  },
  {
    name: 'Things made of wood',
    examples: ['Axe handle', 'Bookshelf', 'Chair', 'Desk', 'Easel', 'Fence', 'Guitar', 'Hockey stick', 'Ice cream stick', 'Jewelry box', 'Kayak paddle', 'Ladder', 'Match', 'Nesting dolls', 'Oar', 'Pencil', 'Rolling pin', 'Spoon', 'Table', 'Ukulele', 'Violin', 'Wardrobe'],
  },
  {
    name: 'Things that fly',
    examples: ['Airplane', 'Bat', 'Crow', 'Dragonfly', 'Eagle', 'Falcon', 'Goose', 'Helicopter', 'Insects', 'Jet', 'Kite', 'Ladybug', 'Moth', 'Nightingale', 'Owl', 'Parrot', 'Rocket', 'Seagull', 'Time', 'UFO', 'Vulture', 'Wasp'],
  },
  {
    name: 'Card game words',
    examples: ['Ace', 'Bluff', 'Cut the deck', 'Deal', 'Eights wild', 'Flush', 'Go fish', 'Hand', 'In the pot', 'Joker', 'King', 'Lay down', 'Match', 'No trumps', 'Order of play', 'Pair', 'Raise', 'Shuffle', 'Trump', 'Under the gun', 'Void', 'Wild card'],
  },
  {
    name: 'Things you find in a desert',
    examples: ['Antelope', 'Beetle', 'Cactus', 'Dunes', 'Erosion', 'Fennec fox', 'Gecko', 'Heat', 'Iguana', 'Jackrabbit', 'Kangaroo rat', 'Lizard', 'Mirage', 'Nomads', 'Oasis', 'Palm trees', 'Rattlesnake', 'Sand', 'Tumbleweed', 'Unbearable sun', 'Vulture', 'Wind'],
  },
  {
    name: 'Things you say when you are surprised',
    examples: ['Aha', 'Blimey', 'Crikey', 'Dear me', 'Eek', 'For real', 'Goodness', 'Holy moly', 'I did not see that coming', 'Jeez', 'Knock me over', 'Look at that', 'My word', 'No way', 'Oh my', 'Pinch me', 'Really', 'Seriously', 'That cannot be', 'Unreal', 'Very unexpected', 'Whoa', 'You are kidding'],
  },
  {
    name: 'Things in a toolbox',
    examples: ['Allen key', 'Bolts', 'Chisel', 'Drill bits', 'Electrical tape', 'File', 'Glue', 'Hammer', 'Impact driver', 'Jigsaw blade', 'Knife', 'Level', 'Measuring tape', 'Nails', 'Oil can', 'Pliers', 'Ratchet', 'Screwdriver', 'Tape', 'Utility knife', 'Vise grips', 'Wrench'],
  },
  {
    name: 'Green things',
    examples: ['Avocado', 'Broccoli', 'Cucumber', 'Dill', 'Emerald', 'Frog', 'Grass', 'Herbs', 'Iguana', 'Jade', 'Kale', 'Lime', 'Moss', 'Nettle', 'Olive', 'Pea', 'Rosemary', 'Spinach', 'Turtle', 'Unripe banana', 'Vine', 'Wasabi'],
  },
  {
    name: 'Things that are fast',
    examples: ['Ambulance', 'Bullet', 'Cheetah', 'Drag racer', 'Express train', 'Falcon', 'Greyhound', 'Hare', 'Internet fiber', 'Jet', 'Kingfisher dive', 'Lightning', 'Motorbike', 'News travel', 'Ostrich', 'Peregrine falcon', 'Rocket', 'Sprinter', 'Time', 'Underground express', 'Velociraptor', 'Wind'],
  },
  {
    name: 'Things with stripes',
    examples: ['Awning', 'Barber pole', 'Candy cane', 'Deck chair', 'Ermine tail', 'Flag', 'Gift wrap', 'Highway', 'Igloo cooler', 'Jail uniform', 'Kayak', 'Lemur tail', 'Mattress', 'Necktie', 'Okapi', 'Pajamas', 'Referee shirt', 'Skunk', 'Tiger', 'Umbrella', 'Vest', 'Wasp', 'Zebra'],
  },
  {
    name: 'Things you order at a cafe',
    examples: ['Americano', 'Bagel', 'Cappuccino', 'Danish', 'Espresso', 'Flat white', 'Green tea', 'Hot chocolate', 'Iced coffee', 'Juice', 'Kombucha', 'Latte', 'Mocha', 'Nut milk latte', 'Oat latte', 'Pastry', 'Rooibos', 'Scone', 'Tea', 'Upside cake', 'Vanilla steamer', 'Water'],
  },
];

export const CATEGORY_NAMES: readonly string[] = CATEGORIES.map((c) => c.name);
