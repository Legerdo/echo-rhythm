import { describe, expect, it } from 'vitest';
import { Bot } from '../../src/sim/bot';
import { applyReward, finishFloor, FLOORS, newRun, rollChest, rollRewards, startFloor } from '../../src/sim/run';
import { applyChestMod, step } from '../../src/sim/world';

// The bot plays through the real rules (same step() as the game) to prove every floor,
// the boss and the ending are reachable. It is a search player, not a rules bypass.
function playRun(seed: number, maxTurnsPerFloor = 2500) {
  const run = newRun(seed);
  const log: string[] = [];
  while (run.floor < FLOORS.length) {
    const w = startFloor(run);
    const bot = new Bot();
    let t = 0;
    while (!w.dead && !w.cleared && t < maxTurnsPerFloor) {
      step(w, bot.choose(w));
      if (w.pendingChest) {
        const pick = rollChest(Object.keys(w.mods) as never, seed, run.floor)[0];
        if (pick) applyChestMod(w, pick);
        else w.pendingChest = 0;
      }
      t++;
    }
    log.push(`${FLOORS[run.floor].id}: ${w.cleared ? 'clear' : w.dead ? 'dead:' + w.deathCause : 'timeout'} t=${t} hp=${w.player.hp} relays=${w.relaysOn}/${w.relaysTotal}${w.boss ? ' boss=' + w.boss.hp : ''}`);
    if (!w.cleared) return { ok: false, log, run };
    const done = finishFloor(run, w);
    if (done) return { ok: true, log, run };
    applyReward(run, rollRewards(run, 'bot')[run.hp < run.maxHp ? 2 : 0]);
  }
  return { ok: true, log, run };
}

describe('autoplay', () => {
  it('a search bot can clear the full run (tutorial -> boss -> ending) on several seeds', () => {
    const results = [11, 22, 33].map((s) => playRun(s));
    for (const r of results) console.log(r.log.join('\n'));
    expect(results.filter((r) => r.ok).length).toBeGreaterThanOrEqual(2);
  });
});
