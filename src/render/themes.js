// Palettes for each world. Every world has a day and an evening variant.
export const OUTLINE = '#2a1f3d';

const meadow = {
  id: 'meadow',
  sky: ['#5ec2f2', '#bfeaff', '#e9f9ff'],
  sun: '#fff3a6', sunGlow: 'rgba(255,245,180,0.35)',
  cloud: '#ffffff', cloudShade: '#d8f0fb',
  far: '#a7dbb8', farLine: '#8cc7a0',
  mid: '#86cc6e', midLine: '#62ad55',
  near: '#6cbd57', nearLine: '#4d9a42',
  dirt: '#7d5236', dirtDark: '#633f29', dirtBand: '#704a31', stone: '#9b7353', stoneDark: '#7a5840',
  top: '#78c850', topLight: '#9ade68', topDark: '#4d9a3a',
  ice: '#bfeeff', iceLight: '#ffffff',
  dust: '#d9c3a0', decor: 'tree', treeA: '#5bb04a', treeB: '#3f8f3a', trunk: '#7a5236',
  pit: '#3b2518', shapes: 'hills', accent: '#ff8a3d',
};

const canyon = {
  id: 'canyon',
  sky: ['#ffab66', '#ffd49a', '#fff0cf'],
  sun: '#fff6d8', sunGlow: 'rgba(255,230,170,0.45)',
  cloud: '#fff4e6', cloudShade: '#ffd9b3',
  far: '#f0b27f', farLine: '#e39a66',
  mid: '#dc8452', midLine: '#c46d40',
  near: '#c76a3d', nearLine: '#a8552f',
  dirt: '#b45a33', dirtDark: '#8e4426', dirtBand: '#a34f2c', stone: '#d27a4d', stoneDark: '#9c4c2a',
  top: '#f0c27a', topLight: '#ffdca3', topDark: '#cf9552',
  ice: '#bfeeff', iceLight: '#ffffff',
  dust: '#f3c78f', decor: 'cactus', treeA: '#5fae5a', treeB: '#3f8a45', trunk: '#8a5a3a',
  pit: '#4a2014', shapes: 'mesa', accent: '#3fb6c9',
};

const snow = {
  id: 'snow',
  sky: ['#7fb8ef', '#cfe6fb', '#f2f9ff'],
  sun: '#ffffff', sunGlow: 'rgba(255,255,255,0.45)',
  cloud: '#ffffff', cloudShade: '#dbe9f7',
  far: '#c6dcf2', farLine: '#a9c4e3',
  mid: '#9fbde0', midLine: '#83a5cf',
  near: '#7fa0c9', nearLine: '#6788b4',
  dirt: '#5d6f96', dirtDark: '#48587d', dirtBand: '#52638a', stone: '#7d8fb5', stoneDark: '#4f5f84',
  top: '#f4fbff', topLight: '#ffffff', topDark: '#c3dcf0',
  ice: '#aee6ff', iceLight: '#ffffff',
  dust: '#ffffff', decor: 'pine', treeA: '#3e8a72', treeB: '#2b6b58', trunk: '#6b4a35',
  pit: '#262f4a', shapes: 'peaks', accent: '#ff5a7a', snowfall: true,
};

const volcano = {
  id: 'volcano',
  sky: ['#5a3552', '#c9604e', '#f7ae72'],
  sun: '#ffe0a0', sunGlow: 'rgba(255,170,110,0.4)',
  cloud: '#8a6a74', cloudShade: '#6d5260',
  far: '#7a4f5e', farLine: '#6a4252',
  mid: '#5a3a48', midLine: '#4a2e3c',
  near: '#46303a', nearLine: '#37252e',
  dirt: '#43343a', dirtDark: '#32262c', dirtBand: '#3b2d33', stone: '#65545a', stoneDark: '#45373d',
  top: '#6d5d5c', topLight: '#8f7d78', topDark: '#4b3e40',
  ice: '#bfeeff', iceLight: '#ffffff',
  dust: '#9a8a86', decor: 'volcano', treeA: '#3b2d31', treeB: '#2d2226', trunk: '#2d2226',
  pit: '#ff6a1f', shapes: 'volcano', accent: '#ff9a2f', lava: true, embers: true,
};

const moon = {
  id: 'moon',
  sky: ['#04050d', '#0d1230', '#222a58'],
  sun: '#ffffff', sunGlow: 'rgba(200,220,255,0.18)',
  cloud: '#ffffff', cloudShade: '#ffffff',
  far: '#353a5a', farLine: '#2c3150',
  mid: '#4b5078', midLine: '#3f4468',
  near: '#62678f', nearLine: '#53587e',
  dirt: '#7f8298', dirtDark: '#676a80', dirtBand: '#74778d', stone: '#a0a3b6', stoneDark: '#6c6f84',
  top: '#d3d6e4', topLight: '#f1f3fa', topDark: '#a2a5ba',
  ice: '#bfeeff', iceLight: '#ffffff',
  dust: '#dcdfea', decor: 'moon', treeA: '#e9edf6', treeB: '#b9c1d9', trunk: '#7a8098',
  pit: '#0b0d1c', shapes: 'craters', accent: '#7fe3ff', stars: true, earth: true, noClouds: true,
};

export const THEMES = {
  meadow,
  meadowDusk: {
    ...meadow, id: 'meadowDusk',
    sky: ['#6f7fd8', '#f7a1a8', '#ffd7a8'], sun: '#ffe3a1', sunGlow: 'rgba(255,200,150,0.45)',
    cloud: '#ffe6ec', cloudShade: '#f3b7c6',
    far: '#b79bc9', farLine: '#9d82b3', mid: '#7fae7c', midLine: '#628f63', near: '#5f9e5c', nearLine: '#4a8049',
  },
  canyon,
  canyonDusk: {
    ...canyon, id: 'canyonDusk',
    sky: ['#4b3f8f', '#d9678a', '#ffb070'], sun: '#ffd28a', sunGlow: 'rgba(255,170,110,0.5)',
    cloud: '#ffd0c0', cloudShade: '#e89aa8',
    far: '#b0648a', farLine: '#95507a', mid: '#a4523f', midLine: '#8a4234', near: '#8e4632', nearLine: '#733628',
  },
  snow,
  snowNight: {
    ...snow, id: 'snowNight',
    sky: ['#141a42', '#2d3a78', '#5e6aa8'], sun: '#f4f1ff', sunGlow: 'rgba(200,220,255,0.25)', moon: true,
    cloud: '#6d78b3', cloudShade: '#56609a',
    far: '#3e4a86', farLine: '#34407a', mid: '#34507e', midLine: '#2b426b', near: '#2c4570', nearLine: '#23385e',
    top: '#e3efff', topLight: '#ffffff', topDark: '#9fb8dc', aurora: true, stars: true,
  },
  volcano,
  volcanoDusk: {
    ...volcano, id: 'volcanoDusk',
    sky: ['#170c22', '#4e1a36', '#b43a2c'], sun: '#ffb070', sunGlow: 'rgba(255,110,60,0.35)', moon: true, stars: true,
    cloud: '#4a3040', cloudShade: '#3a2432',
    far: '#4a2436', farLine: '#3d1d2d', mid: '#3a1e2c', midLine: '#2e1722', near: '#2c1820', nearLine: '#22121a',
  },
  moon,
  moonDeep: {
    ...moon, id: 'moonDeep',
    sky: ['#07031a', '#1b0f42', '#3d2a78'], sunGlow: 'rgba(210,180,255,0.2)',
    far: '#40326e', farLine: '#352960', mid: '#55488a', midLine: '#473b78', near: '#6c62a0', nearLine: '#5c528e',
    dirt: '#80789c', dirtDark: '#686084', dirtBand: '#756d92', top: '#dcd6ee', topLight: '#f6f2ff', topDark: '#aaa2c6',
    accent: '#ff7ae0', aurora: ['rgba(200,130,255,0.10)', 'rgba(255,120,210,0.08)'],
  },
};
