// Rebuilds the sprite atlas from art/afterbeat.px.js with the pxl tool and copies it into src/assets.
// The game only needs the committed PNG/JSON; pxl is a dev-time dependency (set PXL to its bin/pxl.js).
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const pxl = process.env.PXL ?? join(homedir(), '.kiro', 'skills', 'pxl-pixel-art', 'bin', 'pxl.js');
execFileSync(process.execPath, [pxl, 'build', 'art/afterbeat.px.js', '--only', 'atlas', '--out', 'art/out'], { stdio: 'inherit' });
mkdirSync('src/assets', { recursive: true });
copyFileSync('art/out/atlas.png', 'src/assets/atlas.png');
copyFileSync('art/out/atlas.json', 'src/assets/atlas.json');
console.log('atlas copied to src/assets');
