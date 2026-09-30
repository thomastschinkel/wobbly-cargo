// Purely visual unlocks. `cost` in coins, or `stars` / `dailies` requirements.
export const SKINS = [
  { id: 'classic', name: 'Cherry Courier', cost: 0, body: '#ef4b4b', dark: '#c23636', accent: '#fff1d6', bed: '#8d5a3b', bedDark: '#6b412a', trim: '#4a4a5e' },
  { id: 'sky', name: 'Sky Hopper', cost: 120, body: '#4aa8ff', dark: '#2f83d6', accent: '#ffffff', bed: '#ffd166', bedDark: '#e0a93f', trim: '#3b4a6b' },
  { id: 'mint', name: 'Mint Mover', cost: 150, body: '#4fd6a8', dark: '#2fae86', accent: '#fdfdfd', bed: '#ff8fa3', bedDark: '#e0667d', trim: '#355a55' },
  { id: 'banana', name: 'Banana Van', cost: 200, body: '#ffd23f', dark: '#e5ad1f', accent: '#3b3b58', bed: '#5e8cff', bedDark: '#3f69d6', trim: '#3b3b58' },
  { id: 'grape', name: 'Grape Hauler', cost: 250, body: '#9b6bff', dark: '#7a48e0', accent: '#ffe066', bed: '#63d0ff', bedDark: '#3aa6d9', trim: '#3e2d6b' },
  { id: 'taxi', name: 'Cargo Cab', cost: 320, body: '#ffcc1a', dark: '#e0a800', accent: '#2a1f3d', bed: '#3a3a4f', bedDark: '#26263a', trim: '#2a1f3d', deco: 'checker' },
  { id: 'mail', name: 'Post Express', cost: 400, body: '#f5f7fb', dark: '#cfd6e6', accent: '#3066ff', bed: '#3066ff', bedDark: '#1f4ad0', trim: '#46506b', deco: 'mail' },
  { id: 'fire', name: 'Fire Wagon', cost: 480, body: '#ff3b30', dark: '#cc2a22', accent: '#ffe14d', bed: '#d9d9e3', bedDark: '#a9a9b8', trim: '#3a3a4a', deco: 'siren' },
  { id: 'icecream', name: 'Scoop Truck', cost: 560, body: '#ffb6d9', dark: '#f28bbd', accent: '#7ee0d2', bed: '#fff4e0', bedDark: '#e8d6b8', trim: '#8b5a7a', deco: 'cone' },
  { id: 'camo', name: 'Trail Boss', cost: 650, body: '#6f8f4e', dark: '#536d38', accent: '#c9b27a', bed: '#5a4a3a', bedDark: '#3f3328', trim: '#34392a', deco: 'camo' },
  { id: 'midnight', name: 'Midnight Run', cost: 750, body: '#2f3150', dark: '#1f2038', accent: '#39f5d0', bed: '#45476e', bedDark: '#2f3150', trim: '#16172a', deco: 'neon' },
  { id: 'gold', name: 'Golden Wheels', stars: 60, body: '#ffcf3f', dark: '#d99a1c', accent: '#fff4c2', bed: '#e5b53a', bedDark: '#b8861c', trim: '#7a5412', deco: 'shine' },
  { id: 'daily', name: 'Daily Legend', dailies: 5, body: '#ff7a3d', dark: '#d9591f', accent: '#ffffff', bed: '#2fc4c4', bedDark: '#1f9a9a', trim: '#2a1f3d', deco: 'stripes' },
  { id: 'rainbow', name: 'Rainbow Rocket', stars: 90, body: '#ff5ea8', dark: '#d9407f', accent: '#ffffff', bed: '#7a5cff', bedDark: '#5a3fd6', trim: '#2a1f3d', deco: 'rainbow' },
  { id: 'magma', name: 'Magma Hauler', stars: 110, body: '#3d2c33', dark: '#261b20', accent: '#ff8a3d', bed: '#ff6a1f', bedDark: '#c2410f', trim: '#1a1216', deco: 'neon' },
  { id: 'astro', name: 'Lunar Rover', stars: 140, body: '#f2f4fa', dark: '#c9cfe0', accent: '#4aa8ff', bed: '#5a6488', bedDark: '#3f4868', trim: '#2a3050', deco: 'stripes' },
];

export const HATS = [
  { id: 'cap', name: 'Courier Cap', cost: 0 },
  { id: 'none', name: 'No Hat', cost: 0 },
  { id: 'beanie', name: 'Cozy Beanie', cost: 80 },
  { id: 'party', name: 'Party Hat', cost: 100 },
  { id: 'cowboy', name: 'Cowboy Hat', cost: 180 },
  { id: 'chef', name: 'Chef Hat', cost: 220 },
  { id: 'propeller', name: 'Propeller Cap', cost: 280 },
  { id: 'tophat', name: 'Fancy Top Hat', cost: 350 },
  { id: 'viking', name: 'Viking Helmet', cost: 420 },
  { id: 'cone', name: 'Traffic Cone', cost: 500 },
  { id: 'crown', name: 'Royal Crown', stars: 45 },
  { id: 'astro', name: 'Space Helmet', stars: 125 },
];

export function skinById(id) { return SKINS.find((s) => s.id === id) || SKINS[0]; }
export function hatById(id) { return HATS.find((h) => h.id === id) || HATS[0]; }
