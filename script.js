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

const SILVER = { r: 202, g: 204, b: 206 };
const SHADES = [
  [224, 179, 166], [205, 125, 140], [197, 118, 124], [202, 126, 132], [210, 141, 151], [196, 142, 163], [224, 178, 162],
  [144, 66, 80], [120, 54, 67], [128, 69, 92], [125, 66, 92], [131, 71, 99], [122, 51, 87], [205, 131, 149],
  [109, 41, 70], [115, 50, 66], [138, 84, 107], [141, 84, 105], [139, 77, 89], [99, 34, 59], [114, 51, 78],
  [126, 110, 66], [144, 129, 88], [160, 149, 107], [164, 153, 109], [163, 152, 109], [131, 115, 71], [124, 108, 64],
  [218, 183, 150], [145, 98, 78], [142, 103, 89], [164, 121, 101], [206, 156, 129], [207, 154, 120], [225, 189, 175],
  [238, 214, 190], [242, 222, 204], [236, 209, 197], [230, 197, 188], [228, 193, 185], [209, 169, 188], [188, 157, 147],
  [246, 228, 211], [245, 222, 206], [242, 217, 196], [239, 212, 190], [235, 210, 196], [189, 137, 146], [188, 140, 162],
].map(([r, g, b]) => ({ r, g, b }));

const canvas = document.querySelector("#curtain");
const ctx = canvas.getContext("2d");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let ropes = [];
let viewWidth = 0;
let viewHeight = 0;
let pixelRatio = 1;

let pointer = null;
let previousPointer = null;
let metal = { ...SILVER };
let metalFrom = { ...SILVER };
let metalTo = { ...SILVER };
let shiftStart = 0;
let shiftDuration = 0;
let paintedKey = "";
let canReadPixels = true;
const colorBuffers = new Map();
const foilReference = new Map();

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
      source: image.image,
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

function drawRope(rope, target) {
  const { points, image, sx, sw, sh, width } = rope;
  const slice = sh / (points.length - 1);

  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) continue;

    target.save();
    target.translate((a.x + b.x) / 2, (a.y + b.y) / 2);
    target.rotate(Math.atan2(dy, dx) - Math.PI / 2);
    target.drawImage(
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
    target.restore();
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function luminanceAt(data, index) {
  return data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722;
}

function referenceFor(source, data) {
  const cached = foilReference.get(source);
  if (cached) return cached;

  const lums = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 24) continue;
    lums.push(luminanceAt(data, i));
  }
  lums.sort((a, b) => a - b);
  const reference = lums[Math.floor(lums.length * 0.7)] || 210;
  foilReference.set(source, reference);
  return reference;
}

function recolorSource(source, color) {
  let buffer = colorBuffers.get(source);
  if (!buffer) {
    buffer = document.createElement("canvas");
    buffer.width = source.naturalWidth || source.width;
    buffer.height = source.naturalHeight || source.height;
    colorBuffers.set(source, buffer);
  }

  const bufferCtx = buffer.getContext("2d", { willReadFrequently: true });
  bufferCtx.globalCompositeOperation = "source-over";
  bufferCtx.globalAlpha = 1;
  bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
  bufferCtx.drawImage(source, 0, 0);

  if (canReadPixels) {
    try {
      const imageData = bufferCtx.getImageData(0, 0, buffer.width, buffer.height);
      const data = imageData.data;
      const reference = referenceFor(source, data);
      const highlightSpan = Math.max(0.08, 254 / reference - 1);

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 8) continue;
        const gain = luminanceAt(data, i) / reference;
        if (gain <= 1) {
          data[i] = color.r * gain;
          data[i + 1] = color.g * gain;
          data[i + 2] = color.b * gain;
        } else {
          const lift = Math.min(1, (gain - 1) / highlightSpan) * 0.62;
          data[i] = color.r + (255 - color.r) * lift;
          data[i + 1] = color.g + (255 - color.g) * lift;
          data[i + 2] = color.b + (255 - color.b) * lift;
        }
      }

      bufferCtx.putImageData(imageData, 0, 0);
      return buffer;
    } catch (error) {
      canReadPixels = false;
      bufferCtx.globalCompositeOperation = "source-over";
      bufferCtx.globalAlpha = 1;
      bufferCtx.clearRect(0, 0, buffer.width, buffer.height);
      bufferCtx.drawImage(source, 0, 0);
    }
  }

  const rgb = `rgb(${Math.round(color.r)} ${Math.round(color.g)} ${Math.round(color.b)})`;
  bufferCtx.globalCompositeOperation = "screen";
  bufferCtx.globalAlpha = 0.5;
  bufferCtx.fillStyle = "#ffffff";
  bufferCtx.fillRect(0, 0, buffer.width, buffer.height);
  bufferCtx.globalAlpha = 1;
  bufferCtx.globalCompositeOperation = "multiply";
  bufferCtx.fillStyle = rgb;
  bufferCtx.fillRect(0, 0, buffer.width, buffer.height);
  bufferCtx.globalCompositeOperation = "destination-in";
  bufferCtx.drawImage(source, 0, 0);
  bufferCtx.globalCompositeOperation = "source-over";
  bufferCtx.globalAlpha = 1;
  return buffer;
}

function paintStrands(color) {
  const painted = new Map();

  ropes.forEach((rope) => {
    let colored = painted.get(rope.source);
    if (!colored) {
      colored = recolorSource(rope.source, color);
      painted.set(rope.source, colored);
    }
    rope.image = colored;
  });
}

function currentMetal(now) {
  if (!shiftDuration) return metal;
  const t = Math.min(1, (now - shiftStart) / shiftDuration);
  if (t >= 1) {
    metal = { ...metalTo };
    shiftDuration = 0;
    return metal;
  }

  const ease = 1 - (1 - t) ** 3;
  return {
    r: lerp(metalFrom.r, metalTo.r, ease),
    g: lerp(metalFrom.g, metalTo.g, ease),
    b: lerp(metalFrom.b, metalTo.b, ease),
  };
}

function applyColor(now) {
  const tone = currentMetal(now);
  const key = `${Math.round(tone.r)},${Math.round(tone.g)},${Math.round(tone.b)}`;
  if (key === paintedKey) return;

  paintStrands(tone);
  paintedKey = key;
  const ground = `rgb(${Math.round(tone.r)} ${Math.round(tone.g)} ${Math.round(tone.b)})`;
  document.documentElement.style.background = ground;
  document.body.style.background = ground;
}

function pickShade() {
  let next = SHADES[Math.floor(Math.random() * SHADES.length)];

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const same =
      Math.abs(next.r - metal.r) < 2 &&
      Math.abs(next.g - metal.g) < 2 &&
      Math.abs(next.b - metal.b) < 2;
    if (!same) break;
    next = SHADES[Math.floor(Math.random() * SHADES.length)];
  }

  return { r: next.r, g: next.g, b: next.b };
}

function frame(now) {
  try {
    simulate();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    applyColor(now);
    ropes.forEach((rope) => drawRope(rope, ctx));
  } finally {
    requestAnimationFrame(frame);
  }
}

function resize() {
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  viewWidth = window.innerWidth;
  viewHeight = window.innerHeight;
  canvas.width = Math.round(viewWidth * pixelRatio);
  canvas.height = Math.round(viewHeight * pixelRatio);
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

window.addEventListener("pointermove", (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  if (!previousPointer) previousPointer = { ...pointer };
});

window.addEventListener("pointerdown", (event) => {
  pointer = { x: event.clientX, y: event.clientY };
  previousPointer = { ...pointer };
  const now = performance.now();
  metalFrom = { ...currentMetal(now) };
  metalTo = pickShade();
  if (reducedMotion) {
    metal = { ...metalTo };
    shiftDuration = 0;
    return;
  }
  shiftStart = now;
  shiftDuration = 520;
});

window.addEventListener("pointerleave", () => {
  pointer = null;
  previousPointer = null;
});

window.addEventListener("resize", () => {
  resize();
  if (window.tinselImages) {
    buildCurtain(window.tinselImages);
    paintedKey = "";
  }
});

resize();

loadImages().then((images) => {
  window.tinselImages = images;
  buildCurtain(images);
  requestAnimationFrame(frame);
});
