// AFTERBEAT art source (pxl). Build: node <pxl>/bin/pxl.js build art/afterbeat.px.js --out art/out
// One palette for the whole game. Light comes from the top-left. Characters are 14px designs + 1px outline.
pal({
  k: "#0b0a14", K: "#1f1b2e", n: "#3a3355", N: "#514a72", g: "#6f6a94", G: "#9e9bbd", w: "#d6d4ea", W: "#ffffff",
  a: "#4a1f1a", b: "#8a3324", c: "#d4572a", d: "#f39a3a", e: "#ffd27a", f: "#fff3c4",
  s: "#f2c6a0", S: "#c98a6a",
  m: "#561a55", M: "#9a2c86", p: "#e04aa8", P: "#ff9ad6",
  h: "#0f3a5c", i: "#1f6fa3", j: "#2fa3d6", J: "#7fe3ff", l: "#d4fbff",
  q: "#3d0c18", r: "#8c1a2c", R: "#e0343c", t: "#ff7a6a",
  u: "#17301a", v: "#2d6a2a", x: "#59b04a", X: "#b6e85a",
  Y: "#3a2a10", y: "#7a5a1c", z: "#c8962e", Z: "#f2d266",
  A: "#0e2524", B: "#17403c", C: "#26655c", D: "#3f9a86", E: "#7fd4b4",
  F: "#0e1530", H: "#1a2856", I: "#2c4686", L: "#4f74c0", O: "#8fb0ee",
})
ramps("kKnNgGwW", "kYyzZf", "kqrRt", "kabcde", "kSs", "kmMpP", "khijJl", "kuvxX", "kABCDE", "kFHILO")

// ---------------------------------------------------------------- player: Kit, a courier kid
// head (12x8), torso (9x5), legs; frames are stamped from parts so the face never drifts.
sprite("_kit_head", `
  ...nnnnn....
  ..nmmmmmmn..
  .nmmmMMmmmm.
  mMMmmmmmMmmm
  MpMmmmssssmm
  MMMmmsWssWsm
  mMMmsskssksm
  .m.mSssssssS`)
sprite("_kit_torso", `
  ..cdddddc
  .cdeedddc
  .cdddddds
  .ccdddddc
  ..cnnnnc.`)
sprite("_kit_legs_stand", `
  ..nn..nn.
  .ff...ff.`)
sprite("_kit_legs_step", `
  ..nn.nn..
  .ff...ff.`)
sprite("_kit_legs_tuck", `
  ..nnnnn..
  ..ff.ff..`)
sprite("_kit_fork", `
  .J.J
  .Z.Z
  ..Z.
  .Z..`)
sprite("_kit_fork_swing", `
  ...JJ
  ZZZZ.
  ...JJ`)

const kitFrame = (name, { hy = 0, ty = 8, legs = "_kit_legs_stand", ly = 13, fork = "_kit_fork", fx = 10, fy = 7, tx = 2 } = {}) =>
  sprite(name, { w: 14, h: 15, outline: "k" },
    stamp(legs, tx, ly), stamp("_kit_torso", tx, ty), stamp("_kit_head", 1, hy), stamp(fork, fx, fy))

kitFrame("kit_idle0")
kitFrame("kit_idle1", { hy: 1, ty: 9, fy: 8 })
kitFrame("kit_hop", { hy: 0, ty: 7, legs: "_kit_legs_tuck", ly: 12, fy: 6 })
kitFrame("kit_step", { legs: "_kit_legs_step" })
kitFrame("kit_attack", { hy: 0, tx: 3, ty: 8, fork: "_kit_fork_swing", fx: 10, fy: 9 })
sprite("kit_hurt", { base: "kit_idle1", swap: { W: "k", s: "t", S: "R" } })

// the echo: same frames in the cyan ramp, values kept
const ECHO = { n: "h", m: "h", M: "i", p: "J", c: "i", d: "j", e: "J", f: "l", s: "J", S: "j", W: "l", Z: "l", J: "W", K: "h", k: "F" }
for (const f of ["idle0", "idle1", "hop", "step", "attack"]) sprite("echo_" + f, { base: "kit_" + f, swap: ECHO })

// ---------------------------------------------------------------- Buzz: mosquito drone (front, symmetric)
sprite("buzz0", { mx: true, outline: "k" }, `
  .GG....
  ..wG...
  ...n...
  ..nNNn.
  .nNggNN
  .NgRtgN
  .NgrRgN
  ..NggNN
  ...NN..
  ....g..`)
sprite("buzz1", { mx: true, outline: "k" }, `
  .......
  ..GwG..
  ...n...
  ..nNNn.
  .nNggNN
  .NgRtgN
  .NgrRgN
  ..NggNN
  ...NN..
  ...g...`)

// ---------------------------------------------------------------- Clank: tin-can patrol bot (front, symmetric)
sprite("clank0", { mx: true, outline: "k" }, `
  ...yZ..
  ..yzzzz
  ..zZZZZ
  .yzkRkz
  .yzzzzz
  .yYYYYY
  .yzzZzz
  .yzzzzz
  .YyyyyY
  ..nn...`)
sprite("clank1", { mx: true, outline: "k" }, `
  ...yZ..
  ..yzzzz
  ..zZZZZ
  .yzkRkz
  .yzzzzz
  .yYYYYY
  .yzzZzz
  .yzzzzz
  .YyyyyY
  ...nn..`)

// ---------------------------------------------------------------- Warden: riot bot (body) + brass shield part on its facing side
sprite("warden0", { mx: true, outline: "k" }, `
  ...HHHH
  ..HLLLL
  .HLOOLL
  .HLLLLL
  .HtRRRR
  .HIIIII
  ..HIIII
  .HILLLL
  .HIIIII
  .HHIIII
  ..HII..
  ..kk...`)
sprite("warden1", { mx: true, outline: "k" }, `
  .......
  ...HHHH
  ..HLLLL
  .HLOOLL
  .HLLLLL
  .HtRRRR
  .HIIIII
  .HILLLL
  .HIIIII
  .HHIIII
  ..HII..
  ..kk...`)
sprite("shield_h", { outline: "k" }, `
  zy
  Zz
  Zz
  Zz
  zz
  zz
  zz
  zy
  yy`)
sprite("shield_v", { outline: "k" }, `
  yzZZZzzy
  yzzzzzzy`)

// ---------------------------------------------------------------- Ram: mechanical ram, side view facing right
sprite("ram0", { outline: "k" }, `
  ..........ff.
  .........fGGf
  ..rrrrr.fGrGf
  .rRRRRRrfrrr.
  rRttRRRRrRRZr
  rRRRRRRRRRRRR
  rrRRRRRRRrRrr
  .rrrrrrrrrr..
  .rr.rr..rr.rr
  .kk.kk..kk.kk`)
sprite("ram_rev", { outline: "k" }, `
  ...........ff
  ..........fGGf
  ...rrrrr.fGrGf
  ..rRRRRRrfrrr.
  .rRttRRRRrRRZZ
  .rRRRRRRRRRRRR
  .rrRRRRRRRrRrr
  ..rrrrrrrrrr..
  .rr..rr.rr.rr.
  .kk..kk.kk.kk.`)

// ---------------------------------------------------------------- Woofer: speaker-cabinet creature (front)
sprite("woofer0", { mx: true, outline: "k" }, `
  .mmmmmm
  mMMPMMM
  mMnnnnn
  mMnNNNN
  mMnNggg
  mMnNgkk
  mMnNgkk
  mMnNggg
  mMnNNNN
  mMnnnnn
  mMMMMMM
  .mmmmmm
  ..kk...`)
sprite("woofer1", { base: "woofer0", swap: { g: "w", N: "G", k: "g", P: "R", n: "N" } })

// ---------------------------------------------------------------- Conductor: metronome bot, pendulum swings each beat
sprite("_metro_body", { mx: "c" }, `
  .....y
  ....yz
  ....zZ
  ...yzZ
  ...zkZ
  ..yzZZ
  ..zZZZ
  .yzZZZ
  .zZZZZ
  yyyyyy
  yYYYYY
  .k..k.`)
sprite("_pend_l", `
  RR....
  RR....
  ..G...
  ...G..
  ....G.
  .....G`)
sprite("_pend_r", `
  ....RR
  ....RR
  ...G..
  ..G...
  .G....
  G.....`)
sprite("conductor0", { w: 11, h: 12, outline: "k" }, stamp("_metro_body", 0, 0), stamp("_pend_l", 0, 1))
sprite("conductor1", { w: 11, h: 12, outline: "k" }, stamp("_metro_body", 0, 0), stamp("_pend_r", 5, 1))

// ---------------------------------------------------------------- Golem: bass-drum heavy, armoured
sprite("golem0", { mx: true, outline: "k" }, `
  ...yyyy
  ..yZZZZ
  ..ywwww
  ..yZZZZ
  zrRRRRR
  zrRtRRR
  yrRRkRR
  .rRRRRR
  .rRZRRR
  .rRRRRR
  ..yZZZZ
  ..yyyyy
  ...nn..
  ..kkk..`)
sprite("golem_wind", { mx: true, outline: "k" }, `
  ZZ.....
  wz.yyyy
  .zyZZZZ
  .zywwww
  .yyZZZZ
  .rRRRRR
  .rRtRRR
  .rRRkRR
  .rRRRRR
  .rRZRRR
  .rRRRRR
  ..yZZZZ
  ..yyyyy
  ..kkk..`)

// ---------------------------------------------------------------- Spotlight turret: lamp head per direction on a tripod
sprite("_tripod", `
  ....nn....
  ....nN....
  ...nNNn...
  ..nN..Nn..
  .nN....Nn.
  kk......kk`)
sprite("spot_r", { w: 14, h: 14, outline: "k" }, stamp("_tripod", 1, 8), grid(2, 1, `
  .nnnnnn....
  nNGGGGNnf..
  nGwwwwGNfZ.
  nGwwwwGNfZZ
  nNGGGGNnf..
  .nnnnnnn...
  ....nn.....`))
sprite("spot_u", { w: 14, h: 14, outline: "k" }, stamp("_tripod", 2, 8), grid(3, 0, `
  ..ZZ..
  .ZffZ.
  .ffff.
  nNNNNn
  nGwwGn
  nGwwGn
  nGwwGn
  nNGGNn
  .nnnn.`))
sprite("spot_d", { w: 14, h: 14, outline: "k" }, stamp("_tripod", 2, 8), grid(3, 0, `
  .nnnn.
  nNGGNn
  nGwwGn
  nGwwGn
  nGwwGn
  nNNNNn
  .ffff.
  .ZffZ.
  ..ZZ..`))

// ---------------------------------------------------------------- MAESTRO HUSH: clock-faced conductor, 32x32
const boss = (name, { bob = 0, baton = 0, eye = "R" } = {}) =>
  sprite(name, { w: 30, h: 31, outline: "k" },
    // coat tails and body
    poly([8, 31, 22, 31, 24, 17 + bob, 6, 17 + bob], "K"),
    poly([10, 31, 14, 31, 13, 20 + bob, 9, 20 + bob], "n"),
    poly([16, 31, 20, 31, 21, 20 + bob, 17, 20 + bob], "n"),
    rect(11, 15 + bob, 8, 5, "w"),
    grid(12, 16 + bob, `
      RR..RR
      .RRRR.
      RR..RR`),
    // clock head
    circ(15, 7 + bob, 7, "y"), circ(15, 7 + bob, 6, "z"), circ(15, 7 + bob, 5, "f"),
    px(15, 3 + bob, "k"), px(15, 11 + bob, "k"), px(11, 7 + bob, "k"), px(19, 7 + bob, "k"),
    vline(15, 4 + bob, 3, "n"), hline(16, 7 + bob, 2, "n"),
    px(13, 6 + bob, eye), px(17, 6 + bob, eye),
    // arms + gloves + baton
    poly([6, 17 + bob, 3, 24 + bob, 5, 25 + bob, 8, 19 + bob], "K"),
    poly([24, 17 + bob, 27, 22 + bob - baton, 25, 23 + bob - baton, 22, 19 + bob], "K"),
    rect(2, 24 + bob, 3, 3, "W"),
    rect(25, 21 + bob - baton, 3, 3, "W"),
    (c) => {
      for (let i = 0; i < 6; i++) c.px(27 + (i >> 1), 20 + bob - baton - i, i > 3 ? "J" : "w")
    },
    shade([6, 24, 18, 7]))
boss("boss0")
boss("boss1", { bob: 1 })
boss("boss_cast", { baton: 6, eye: "Z" })
sprite("boss_hurt", { base: "boss1", swap: { f: "t", z: "R", y: "r", K: "q", n: "r" } })

// ================================================================ TILES (16x16, walls 16x24: 8px top + 16px face)
// Each zone gets its own material language; variants differ by a cause (crack, puddle, seam).

// --- zone 0: subway (teal ceramic, safety yellow)
sprite("f0_0", { w: 16, h: 16 }, rect(0, 0, 16, 16, "B"), hline(0, 0, 16, "A"), hline(0, 8, 16, "A"), vline(0, 0, 16, "A"), vline(8, 0, 16, "A"),
  px(1, 1, "C"), px(9, 1, "C"), px(1, 9, "C"), px(9, 9, "C"), px(2, 1, "C"), px(10, 9, "C"))
sprite("f0_1", { base: "f0_0" }, grid(10, 2, `
  A...
  .A..
  .A..
  ..AA`))
sprite("f0_2", { base: "f0_0" }, rect(2, 10, 5, 4, "C"), px(3, 11, "D"), px(4, 11, "D"))
// walls: 16x22 = 16px top surface (cap) + 6px front face; drawn 6px above the tile so rows overlap seamlessly
sprite("w0", { w: 16, h: 22 },
  rect(0, 0, 16, 16, "k"), rect(1, 1, 14, 14, "K"), rect(3, 3, 10, 10, "n"), rect(4, 4, 8, 8, "K"), hline(0, 0, 16, "g"), px(1, 1, "N"), px(2, 1, "N"),
  rect(0, 16, 16, 6, "D"), hline(0, 16, 16, "E"), vline(5, 17, 2, "C"), vline(11, 17, 2, "C"),
  rect(0, 19, 16, 2, "z"), (c) => { for (let x = 0; x < 16; x += 4) { c.px(x, 19, "k"); c.px(x + 1, 20, "k") } }, hline(0, 21, 16, "A"))
sprite("w0_1", { base: "w0" }, rect(5, 16, 6, 3, "K"), hline(6, 17, 4, "e"), px(7, 17, "c"))

// --- zone 1: neon market (wet violet cobbles, neon spill)
sprite("f1_0", { w: 16, h: 16 }, rect(0, 0, 16, 16, "K"),
  grid(0, 0, `
    nnnnnnn.nnnnnnnn
    n......n.......n
    n......n.......n
    n......n.......n
    .nnnnnnnnnnnnnn.
    ...n.......n....
    ...n.......n....
    ...n.......n....
    nnnnnnnnnnnnnnnn
    .....n.......n..
    .....n.......n..
    .....n.......n..
    nnnnnnnnnnnnnnnn
    ..n.......n.....
    ..n.......n.....
    nnnnnnnnnnnnnnnn`), px(2, 1, "N"), px(9, 5, "N"), px(6, 9, "N"), px(12, 13, "N"))
sprite("f1_1", { base: "f1_0" }, rect(3, 6, 9, 5, "m"), hline(4, 7, 3, "p"), hline(8, 9, 2, "J"), px(10, 7, "P"))
sprite("f1_2", { base: "f1_0" }, px(4, 2, "p"), px(12, 6, "J"), px(7, 13, "p"))
sprite("w1", { w: 16, h: 22 },
  rect(0, 0, 16, 16, "m"), hline(0, 0, 16, "M"), hline(0, 4, 16, "K"), hline(0, 8, 16, "K"), hline(0, 12, 16, "K"),
  px(3, 2, "M"), px(10, 6, "M"), px(6, 10, "M"), px(13, 14, "M"),
  rect(0, 16, 16, 6, "N"), (c) => { for (let x = 1; x < 16; x += 3) c.vline(x, 17, 4, "n") }, hline(0, 16, 16, "g"), hline(0, 21, 16, "K"))
sprite("w1_1", { base: "w1" }, rect(2, 17, 12, 4, "k"), hline(3, 18, 4, "p"), hline(8, 18, 5, "P"), hline(3, 19, 7, "J"))
sprite("w1_2", { base: "w1" }, rect(5, 2, 6, 6, "K"), rect(6, 3, 4, 4, "e"), vline(8, 3, 4, "y"), hline(6, 5, 4, "y"))

// --- zone 2: rooftop substation (night concrete, amber lamps)
sprite("f2_0", { w: 16, h: 16 }, rect(0, 0, 16, 16, "H"), hline(0, 0, 16, "F"), vline(0, 0, 16, "F"),
  px(4, 3, "I"), px(11, 6, "I"), px(6, 12, "I"), px(13, 13, "F"), px(2, 9, "F"))
sprite("f2_1", { base: "f2_0" }, hline(0, 8, 16, "F"), px(3, 7, "I"), px(12, 9, "I"))
sprite("f2_2", { base: "f2_0" }, grid(3, 4, `
  ..yy......
  .y..y.....
  ......yy..
  .....y..y.`))
sprite("w2", { w: 16, h: 22 },
  rect(0, 0, 16, 16, "I"), hline(0, 0, 16, "L"), vline(0, 0, 16, "L"), hline(0, 15, 16, "H"), vline(8, 1, 14, "H"), px(4, 5, "L"), px(12, 10, "L"),
  rect(0, 16, 16, 6, "H"), hline(0, 16, 16, "F"), hline(0, 18, 16, "G"), vline(3, 18, 3, "g"), vline(12, 18, 3, "g"), hline(0, 21, 16, "F"))
sprite("w2_1", { base: "w2" }, rect(6, 17, 4, 4, "Y"), rect(7, 18, 2, 2, "Z"), px(7, 18, "f"))
sprite("w2_2", { base: "w2" }, rect(2, 3, 12, 10, "n"), rect(3, 4, 10, 8, "N"), hline(4, 6, 8, "x"), hline(4, 9, 8, "x"), px(5, 6, "X"))

// --- zone 3: clocktower (oiled boards, brass)
sprite("f3_0", { w: 16, h: 16 }, rect(0, 0, 16, 16, "y"), hline(0, 0, 16, "Y"), hline(0, 4, 16, "Y"), hline(0, 8, 16, "Y"), hline(0, 12, 16, "Y"),
  px(3, 2, "z"), px(13, 6, "z"), px(7, 10, "z"), px(1, 14, "z"), vline(10, 1, 3, "Y"), vline(5, 5, 3, "Y"), vline(12, 9, 3, "Y"), vline(6, 13, 3, "Y"))
sprite("f3_1", { base: "f3_0" }, circ(8, 8, 5, "z"), circ(8, 8, 3, "Y"), px(8, 8, "Z"), px(8, 2, "z"), px(14, 8, "z"), px(2, 8, "z"), px(8, 14, "z"))
sprite("f3_2", { base: "f3_0" })
sprite("w3", { w: 16, h: 22 },
  rect(0, 0, 16, 16, "Y"), hline(0, 0, 16, "z"), hline(0, 5, 16, "k"), hline(0, 10, 16, "k"), hline(0, 15, 16, "k"),
  vline(6, 1, 4, "k"), vline(12, 6, 4, "k"), vline(3, 11, 4, "k"), px(2, 2, "y"), px(9, 7, "y"), px(14, 12, "y"),
  rect(0, 16, 16, 6, "q"), hline(0, 16, 16, "r"), vline(4, 17, 2, "k"), vline(12, 17, 2, "k"), rect(0, 19, 16, 2, "z"), hline(0, 19, 16, "Z"), hline(0, 21, 16, "Y"))
sprite("w3_1", { base: "w3" }, circ(8, 8, 5, "z"), circ(8, 8, 4, "f"), vline(8, 5, 3, "k"), hline(9, 8, 2, "k"))

// --- shared ground pieces (neutral keys; recoloured per zone at runtime is not needed: they are metal)
sprite("rail_h", { w: 16, h: 16 }, rect(0, 0, 16, 16, "A"),
  (c) => { for (let x = 1; x < 16; x += 5) c.rect(x, 2, 3, 12, "Y") }, hline(0, 4, 16, "G"), hline(0, 5, 16, "g"), hline(0, 10, 16, "G"), hline(0, 11, 16, "g"))
sprite("rail_v", { base: "rail_h", rot: 90 })
sprite("rail_warn", { w: 16, h: 16 }, rect(0, 0, 16, 16, "q"), hline(0, 4, 16, "R"), hline(0, 11, 16, "R"))
sprite("vent", { w: 16, h: 16 }, rect(1, 1, 14, 14, "n"), rect(2, 2, 12, 12, "k"), (c) => { for (let y = 3; y < 14; y += 2) c.hline(3, y, 10, "N") }, hline(1, 1, 14, "g"))
sprite("vent_hot", { base: "vent", swap: { N: "c", g: "d" } })
sprite("plate", { w: 16, h: 16 }, rect(2, 2, 12, 12, "N"), rect(3, 3, 10, 10, "g"), hline(3, 3, 10, "G"), rect(6, 6, 4, 4, "J"), px(6, 6, "l"))
sprite("plate_on", { w: 16, h: 16 }, rect(2, 2, 12, 12, "n"), rect(3, 4, 10, 9, "N"), rect(6, 7, 4, 4, "J"), rect(7, 8, 2, 2, "l"))
sprite("gate", { w: 16, h: 22 }, rect(0, 0, 16, 22, "k"), (c) => { for (let x = 1; x < 16; x += 3) c.vline(x, 3, 18, "g") }, rect(0, 0, 16, 3, "n"), hline(0, 0, 16, "G"), rect(0, 11, 16, 2, "R"), hline(0, 11, 16, "t"))
sprite("gate_open", { w: 16, h: 22 }, rect(0, 0, 16, 3, "n"), hline(0, 0, 16, "G"), (c) => { for (let x = 1; x < 16; x += 3) c.vline(x, 3, 2, "g") }, px(7, 1, "x"), px(8, 1, "x"))
sprite("exit", { w: 16, h: 16 }, rect(1, 1, 14, 14, "n"), rect(2, 2, 12, 12, "K"), vline(7, 2, 12, "k"), vline(8, 2, 12, "N"), rect(2, 2, 12, 1, "R"), px(3, 4, "R"), px(12, 4, "R"))
sprite("exit_open", { w: 16, h: 16 }, rect(1, 1, 14, 14, "n"), rect(2, 2, 12, 12, "h"), rect(3, 3, 10, 10, "j"), rect(5, 5, 6, 6, "J"), rect(7, 7, 2, 2, "l"), hline(2, 2, 12, "x"))

// ================================================================ PROPS
sprite("crate0", { w: 14, h: 14, outline: "k", pivot: "bottom" }, rect(0, 2, 14, 12, "z"), rect(0, 0, 14, 3, "Z"),
  (c) => { for (let x = 0; x < 14; x += 4) { c.px(x, 6, "k"); c.px(x + 1, 7, "k"); c.px(x + 2, 8, "k") } }, rect(0, 6, 14, 3, "Z"),
  (c) => { for (let x = 0; x < 14; x += 4) { c.px(x + 1, 6, "k"); c.px(x + 2, 7, "k"); c.px(x + 3, 8, "k") } }, shade([0, 11, 14, 3]))
sprite("crate1", { w: 14, h: 12, outline: "k", pivot: "bottom" }, rect(0, 3, 14, 8, "N"), rect(1, 0, 12, 4, "g"), hline(1, 0, 12, "G"), rect(2, 5, 3, 4, "n"), rect(9, 5, 3, 4, "n"), rect(0, 11, 2, 1, "n"), rect(12, 11, 2, 1, "n"))
sprite("crate2", { w: 14, h: 14, outline: "k", pivot: "bottom" }, rect(0, 2, 14, 12, "y"), rect(0, 0, 14, 3, "z"), hline(0, 0, 14, "Z"),
  vline(4, 3, 11, "Y"), vline(9, 3, 11, "Y"), hline(0, 8, 14, "Y"), px(2, 5, "c"), px(11, 11, "c"))
sprite("crate3", { w: 14, h: 14, outline: "k", pivot: "bottom" }, rect(0, 4, 14, 10, "m"), rect(0, 0, 14, 5, "p"),
  (c) => { for (let x = 0; x < 14; x += 4) c.rect(x, 0, 2, 5, "P") }, rect(2, 7, 10, 5, "k"), hline(3, 8, 3, "J"), hline(7, 10, 4, "e"))
sprite("crate4", { w: 14, h: 13, outline: "k", pivot: "bottom" }, rect(0, 2, 14, 11, "g"), rect(0, 0, 14, 3, "G"), hline(0, 0, 14, "w"),
  circ(5, 7, 3, "n"), circ(5, 7, 2, "N"), px(5, 7, "k"), (c) => { for (let y = 4; y < 11; y += 2) c.hline(10, y, 3, "n") })
sprite("crate5", { w: 14, h: 14, outline: "k", pivot: "bottom" }, rect(3, 0, 8, 14, "n"), rect(4, 0, 6, 14, "N"), rect(0, 3, 14, 3, "g"), rect(0, 9, 14, 3, "g"), px(7, 1, "R"))
sprite("crate6", { w: 14, h: 14, outline: "k", pivot: "bottom" }, rect(0, 2, 14, 12, "Y"), rect(0, 0, 14, 3, "y"), circ(7, 8, 4, "z"), circ(7, 8, 2, "Y"), px(7, 8, "Z"))
sprite("crate7", { w: 12, h: 15, outline: "k", pivot: "bottom" }, rect(0, 4, 12, 11, "q"), rect(1, 0, 10, 5, "r"), rect(2, 6, 8, 6, "z"), rect(3, 7, 6, 4, "f"), vline(6, 7, 2, "k"))

sprite("relay_off", { w: 14, h: 16, outline: "k", pivot: "bottom" },
  rect(6, 7, 2, 9, "n"), rect(3, 14, 8, 2, "N"),
  poly([2, 1, 10, 1, 13, 4, 13, 7, 10, 9, 2, 9], "g"), poly([3, 2, 9, 2, 12, 5, 9, 8, 3, 8], "N"), rect(3, 3, 3, 4, "n"), rect(4, 4, 1, 2, "k"),
  px(12, 2, "R"), px(1, 6, "d"))
sprite("relay_on0", { w: 14, h: 16, outline: "k", pivot: "bottom" },
  rect(6, 7, 2, 9, "h"), rect(3, 14, 8, 2, "i"),
  poly([2, 1, 10, 1, 13, 4, 13, 7, 10, 9, 2, 9], "Z"), poly([3, 2, 9, 2, 12, 5, 9, 8, 3, 8], "z"), rect(3, 3, 3, 4, "J"), rect(4, 4, 1, 2, "l"), px(12, 2, "x"))
sprite("relay_on1", { base: "relay_on0", swap: { J: "l", z: "Z" } })
sprite("chest", { w: 14, h: 12, outline: "k", pivot: "bottom" }, rect(0, 3, 14, 9, "i"), rect(0, 0, 14, 4, "j"), hline(0, 4, 14, "h"), vline(3, 0, 12, "Z"), vline(10, 0, 12, "Z"), rect(6, 4, 2, 3, "e"), shade([0, 9, 14, 3]))
sprite("chest_open", { w: 14, h: 12, outline: "k", pivot: "bottom" }, rect(0, 5, 14, 7, "i"), rect(1, 3, 12, 3, "k"), rect(0, 0, 14, 3, "h"), vline(3, 5, 7, "Z"), vline(10, 5, 7, "Z"))
sprite("pedestal", { w: 12, h: 16, outline: "k", pivot: "bottom" }, rect(2, 11, 8, 5, "g"), rect(1, 10, 10, 2, "G"), hline(3, 13, 6, "N"),
  grid(3, 0, `
    J....J
    l....l
    J....J
    .J..J.
    ..JJ..
    ...J..
    ...l..
    ...J..`))
sprite("pedestal_empty", { w: 12, h: 6, outline: "k", pivot: "bottom" }, rect(2, 1, 8, 5, "g"), rect(1, 0, 10, 2, "G"), hline(3, 3, 6, "N"))
sprite("battery", { w: 8, h: 10, outline: "k" }, rect(2, 0, 4, 1, "G"), rect(0, 1, 8, 9, "v"), rect(1, 2, 6, 7, "x"), rect(3, 3, 2, 5, "X"), rect(2, 4, 4, 1, "X"))
sprite("tape", { w: 12, h: 8, outline: "k" }, rect(0, 0, 12, 8, "i"), rect(1, 1, 10, 3, "J"), circ(3, 5, 1, "k"), circ(8, 5, 1, "k"), hline(4, 6, 4, "h"))

// ================================================================ UI + FX
sprite("ui_heart", { w: 7, h: 9, outline: "k" }, rect(2, 0, 3, 1, "G"), rect(0, 1, 7, 8, "x"), rect(1, 2, 2, 6, "X"), hline(0, 8, 7, "v"))
sprite("ui_heart_empty", { w: 7, h: 9, outline: "k" }, rect(2, 0, 3, 1, "n"), rect(0, 1, 7, 8, "K"), rect(1, 2, 5, 6, "k"))
sprite("ui_charge", { w: 9, h: 9, outline: "k" }, circ(4, 4, 4, "j"), circ(4, 4, 2, "h"), px(4, 4, "l"), px(2, 2, "J"))
sprite("ui_charge_empty", { w: 9, h: 9, outline: "k" }, circ(4, 4, 4, "K"), circ(4, 4, 2, "k"))
sprite("ui_note", { w: 7, h: 9 }, vline(5, 0, 7, "e"), hline(5, 0, 2, "e"), px(6, 1, "e"), rect(2, 6, 3, 3, "e"), px(3, 7, "f"))
sprite("ui_relay", { w: 9, h: 8, outline: "k" }, poly([0, 2, 3, 2, 7, 0, 7, 7, 3, 5, 0, 5], "g"))
sprite("ui_relay_on", { w: 9, h: 8, outline: "k" }, poly([0, 2, 3, 2, 7, 0, 7, 7, 3, 5, 0, 5], "Z"))
sprite("fx_spark0", { w: 7, h: 7 }, px(3, 3, "W"), px(3, 1, "f"), px(3, 5, "f"), px(1, 3, "f"), px(5, 3, "f"))
sprite("fx_spark1", { w: 7, h: 7 }, px(3, 0, "e"), px(3, 6, "e"), px(0, 3, "e"), px(6, 3, "e"), px(1, 1, "d"), px(5, 5, "d"), px(1, 5, "d"), px(5, 1, "d"))
sprite("fx_spark2", { w: 7, h: 7 }, px(0, 0, "c"), px(6, 6, "c"), px(0, 6, "c"), px(6, 0, "c"))
sprite("fx_dust0", { w: 6, h: 4 }, rect(1, 1, 4, 3, "G"), px(2, 0, "G"))
sprite("fx_dust1", { w: 6, h: 4 }, px(0, 2, "g"), px(5, 1, "g"), px(2, 3, "g"))
sprite("fx_foot", { w: 4, h: 3 }, rect(0, 0, 4, 3, "j"), rect(1, 1, 2, 1, "J"))
sprite("train_h", { w: 32, h: 14, outline: "k" }, rect(0, 0, 32, 14, "N"), rect(0, 0, 32, 3, "w"), rect(0, 11, 32, 3, "n"),
  (c) => { for (let x = 3; x < 28; x += 6) c.rect(x, 4, 4, 5, "e") }, rect(29, 4, 3, 6, "Z"), hline(0, 10, 32, "R"))
sprite("train_v", { base: "train_h", rot: 90 })

sheet("atlas", ["kit_*", "echo_*", "buzz*", "clank*", "warden*", "shield_*", "ram*", "woofer*", "conductor*", "golem*", "spot_*", "boss*",
  "f0_*", "f1_*", "f2_*", "f3_*", "w0*", "w1*", "w2*", "w3*", "rail_*", "vent*", "plate*", "gate*", "exit*",
  "crate*", "relay_*", "chest*", "pedestal*", "battery", "tape", "ui_*", "fx_*", "train_*"], { pad: 1 })
