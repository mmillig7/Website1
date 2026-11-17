const STRANDS = [
  { src: "TinselStrands/tinsel_01.png", sx: 30, sw: 97, sh: 548 },
  { src: "TinselStrands/tinsel_02.png", sx: 25, sw: 113, sh: 468 },
  { src: "TinselStrands/tinsel_03.png", sx: 26, sw: 111, sh: 493 },
  { src: "TinselStrands/tinsel_04.png", sx: 32, sw: 96, sh: 633 },
  { src: "TinselStrands/tinsel_05.png", sx: 44, sw: 68, sh: 571 },
  { src: "TinselStrands/tinsel_06.png", sx: 24, sw: 111, sh: 428 },
  { src: "TinselStrands/tinsel_07.png", sx: 43, sw: 73, sh: 486 },
  { src: "TinselStrands/tinsel_08.png", sx: 18, sw: 130, sh: 535 },
  { src: "TinselStrands/tinsel_09.png", sx: 28, sw: 103, sh: 431 },
  { src: "TinselStrands/tinsel_10.png", sx: 42, sw: 76, sh: 509 },
  { src: "TinselStrands/tinsel_11.png", sx: 32, sw: 96, sh: 526 },
  { src: "TinselStrands/tinsel_12.png", sx: 35, sw: 89, sh: 618 },
];

const GRAVITY = 0.32;
const DAMPING = 0.986;
const ITERATIONS = 6;
const STIFFNESS = 0.78;
const MAX_SPEED = 32;

const canvas = document.querySelector("#curtain");
const ctx = canvas.getContext("2d");
const tintLayer = document.createElement("canvas");
const tintCtx = tintLayer.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let ropes = [];
let viewWidth = 0;
let viewHeight = 0;
let pointer = null;
let previousPointer = null;
let tintHue = null;

function hash(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

function loadImages() {
  return Promise.all(
    STRANDS.map(
      (strand) =>
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve({ ...strand, image });
          image.onerror = () => reject(new Error(`Could not load ${strand.src}`));
          image.src = strand.src;
        })
    )
  );
}

function buildCurtain(images) {
  const longest = Math.max(...images.map((image) => image.sh));
  const reach = viewHeight + 48;
  ropes = [];

  const sample = images[0];
  const sampleHeight = (sample.sh / longest) * reach;
  const sampleWidth = sampleHeight * (sample.sw / sample.sh);
  const spacing = Math.max(34, Math.min(64, sampleWidth * 0.4));
  const count = Math.ceil((viewWidth + spacing * 4) / spacing);

  for (let i = 0; i < count; i += 1) {
    const image = images[Math.floor(hash(i + 1) * images.length)];
    const scale = 0.9 + hash(i + 5) * 0.22;
    const length = (image.sh / longest) * reach * scale;
    const width = length * (image.sw / image.sh);
    const segments = Math.max(8, Math.round(11 * (image.sh / longest)));
    const anchorX = -spacing * 2 + i * spacing + (hash(i + 9) - 0.5) * spacing * 0.35;
    const anchorY = -12 - hash(i + 13) * 24;

    const points = [];
    const rest = length / segments;

    for (let p = 0; p <= segments; p += 1) {
      const sway = Math.sin(p * 0.45 + hash(i + 2) * 6) * p * 0.35;
      points.push({
        x: anchorX + sway,
        y: anchorY + p * rest,
        px: anchorX + sway,
        py: anchorY + p * rest,
        pinned: p === 0,
      });
    }

    ropes.push({
      image: image.image,
      sx: image.sx,
      sw: image.sw,
      sh: image.sh,
      width,
      rest,
      anchorX,
      anchorY,
      points,
      depth: hash(i + 17),
    });
  }

  ropes.sort((a, b) => a.depth - b.depth);
}

function pin(rope) {
  const top = rope.points[0];
  top.x = rope.anchorX;
  top.y = rope.anchorY;
  top.px = rope.anchorX;
  top.py = rope.anchorY;
}

function integrate(point) {
  if (point.pinned) return;

  let vx = (point.x - point.px) * DAMPING;
  let vy = (point.y - point.py) * DAMPING;
  vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx));
  vy = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vy));

  point.px = point.x;
  point.py = point.y;
  point.x += vx;
  point.y += vy + GRAVITY;
}

function constrain(a, b, rest) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const diff = ((dist - rest) / dist) * STIFFNESS;

  if (a.pinned) {
    b.x -= dx * diff;
    b.y -= dy * diff;
    return;
  }

  const half = diff * 0.5;
  a.x += dx * half;
  a.y += dy * half;
  b.x -= dx * half;
  b.y -= dy * half;
}

function brush(x0, y0, x1, y1) {
  const travel = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(travel / 10));

  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    const stepX = (x1 - x0) / steps;
    const stepY = (y1 - y0) / steps;

    ropes.forEach((rope) => {
      const reach = rope.width * 0.55 + 28;
      rope.points.forEach((point) => {
        if (point.pinned) return;
        const dx = point.x - x;
        const dy = point.y - y;
        const dist = Math.hypot(dx, dy);
        if (dist > reach) return;

        const influence = 1 - dist / reach;
        const side = Math.sign(dx) || (stepX >= 0 ? 1 : -1);
        const pushX = stepX * 1.35 * influence + side * influence * 7;
        const pushY = stepY * 0.55 * influence;

        point.x += pushX;
        point.y += pushY;
        point.px += pushX * 0.28;
        point.py += pushY * 0.28;
      });
    });
  }
}

function simulate() {
  if (pointer && previousPointer && !reducedMotion) {
    brush(previousPointer.x, previousPointer.y, pointer.x, pointer.y);
  }

  ropes.forEach((rope) => {
    rope.points.forEach(integrate);
    pin(rope);

    for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
      for (let i = 0; i < rope.points.length - 1; i += 1) {
        constrain(rope.points[i], rope.points[i + 1], rope.rest);
      }
      pin(rope);
    }
  });

  previousPointer = pointer ? { ...pointer } : null;
}

function drawRope(rope) {
  const { points, image, sx, sw, sh, width } = rope;
  const slice = sh / (points.length - 1);

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) continue;

    ctx.save();
    ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
    ctx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
    ctx.drawImage(
      image,
      sx,
      slice * i,
      sw,
      slice + 1,
      -width / 2,
      -length / 2,
      width,
      length + 1
    );
    ctx.restore();
  }
}

function applyTint() {
  if (tintHue == null) return;

  const width = tintLayer.width;
  const height = tintLayer.height;
  tintCtx.setTransform(1, 0, 0, 1, 0, 0);
  tintCtx.globalCompositeOperation = "source-over";
  tintCtx.globalAlpha = 1;
  tintCtx.clearRect(0, 0, width, height);
  tintCtx.fillStyle = `hsl(${tintHue} 100% 50%)`;
  tintCtx.fillRect(0, 0, width, height);
  tintCtx.globalCompositeOperation = "destination-in";
  tintCtx.drawImage(canvas, 0, 0);
  tintCtx.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "multiply";
  ctx.drawImage(tintLayer, 0, 0);
  ctx.restore();
}

function frame() {
  simulate();
  ctx.clearRect(0, 0, viewWidth, viewHeight);
  ropes.forEach(drawRope);
  applyTint();
  requestAnimationFrame(frame);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewWidth = window.innerWidth;
  viewHeight = window.innerHeight;
  canvas.width = Math.round(viewWidth * dpr);
  canvas.height = Math.round(viewHeight * dpr);
  tintLayer.width = canvas.width;
  tintLayer.height = canvas.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

window.addEventListener("pointermove", (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  if (!previousPointer) previousPointer = { ...pointer };
});

window.addEventListener("pointerdown", (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  previousPointer = { ...pointer };
  tintHue = Math.random() * 360;
});

window.addEventListener("pointerleave", () => {
  pointer = null;
  previousPointer = null;
});

window.addEventListener("resize", () => {
  resize();
  if (window.tinselImages) buildCurtain(window.tinselImages);
});

resize();

loadImages().then((images) => {
  window.tinselImages = images;
  buildCurtain(images);
  requestAnimationFrame(frame);
});
