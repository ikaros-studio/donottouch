Promise.all([
  faceapi.nets.tinyFaceDetector.loadFromUri("/models"),
  faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
  faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
  faceapi.nets.faceExpressionNet.loadFromUri("/models"),
]).then(startVideo);

function startVideo() {
  navigator.getUserMedia(
    { video: {} },
    (stream) => (video.srcObject = stream),
    (err) => console.error(err)
  );
}
const video = document.getElementById("video");
const faceCanvas = document.getElementById("faceCanvas");
var winwidth = window.innerWidth;
var winheight = window.innerHeight;
const orbitCanvas = document.getElementById("orbitCanvas");

var ctx = orbitCanvas.getContext("2d", {
  antialias: true,
  willReadFrequently: true,
});
var faceX;
var faceY;

// Draw Initial GLOBE Image
window.onload = function () {
  orbitCanvas.width = winwidth;
  orbitCanvas.height = winheight;
  faceCanvas.width = winwidth;
  faceCanvas.height = winheight;
  video.width = winwidth;
  video.height = winheight;
  var img = document.getElementById("earth");

  var earthradius = 650;
  // var scale = Math.min(orbitCanvas.width / earthradius, orbitCanvas.height / earthradius);
  var left = orbitCanvas.width / 2 - earthradius / 2;
  var top = orbitCanvas.height / 2 - earthradius / 2;

  ctx.drawImage(img, left, top, earthradius, earthradius);
};

// RESET Globe
function reset() {
  const { width, height } = ctx.canvas;
  const wd2 = width / 2;
  ctx.globalAlpha = 1;
  ctx.fillStyle = "black";
  var img = document.getElementById("earth");
  ctx.drawImage(img, 0, 0);
}
reset();

// SET BRUSH VARIABLES
var brushradius = 55;
var brushhardness = 0.2;
var brushalpha = 0.5;

function getCanvasRelativePosition(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((faceX - rect.left) / rect.width) * canvas.width,
    y: ((faceY - rect.top) / rect.height) * canvas.height,
  };
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function setupLine(x, y, targetX, targetY) {
  const deltaX = targetX - x;
  const deltaY = targetY - y;
  const deltaRow = Math.abs(deltaX);
  const deltaCol = Math.abs(deltaY);
  const counter = Math.max(deltaCol, deltaRow);
  const axis = counter == deltaCol ? 1 : 0;

  // setup a line draw.
  return {
    position: [x, y],
    delta: [deltaX, deltaY],
    deltaPerp: [deltaRow, deltaCol],
    inc: [Math.sign(deltaX), Math.sign(deltaY)],
    accum: Math.floor(counter / 2),
    counter: counter,
    endPnt: counter,
    axis: axis,
    u: 0,
  };
}

function advanceLine(line) {
  --line.counter;
  line.u = 1 - line.counter / line.endPnt;
  if (line.counter <= 0) {
    return false;
  }
  const axis = line.axis;
  const perp = 1 - axis;
  line.accum += line.deltaPerp[perp];
  if (line.accum >= line.endPnt) {
    line.accum -= line.endPnt;
    line.position[perp] += line.inc[perp];
  }
  line.position[axis] += line.inc[axis];
  return true;
}

let lastX;
let lastY;
let lastForce;
let drawing = true;
let alpha = 0.5;

const brushCtx = document.createElement("canvas").getContext("2d");
let featherGradient;

function createFeatherGradient(brushradius, brushhardness) {
  const innerRadius = Math.min(brushradius * brushhardness, brushradius - 1);
  const gradient = brushCtx.createRadialGradient(
    0,
    0,
    innerRadius,
    0,
    0,
    brushradius
  );
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 1)");
  return gradient;
}

// Initiate Brush
function initBrush() {
  const radius = brushradius;
  const hardness = brushhardness;
  alpha = brushalpha;
  featherGradient = createFeatherGradient(radius, hardness);
  brushCtx.canvas.width = radius * 2;
  brushCtx.canvas.height = radius * 2;
}
initBrush();

function feather(ctx) {
  // feather the brush
  ctx.save();
  ctx.fillStyle = featherGradient;
  ctx.globalCompositeOperation = "destination-out";
  const { width, height } = ctx.canvas;
  ctx.translate(width / 2, height / 2);
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.restore();
}

function updateBrush(x, y) {
  let width = brushCtx.canvas.width;
  let height = brushCtx.canvas.height;
  let srcX = x - width / 2;
  let srcY = y - height / 2;
  // draw it in the middle of the brush
  let dstX = (brushCtx.canvas.width - width) / 2;
  let dstY = (brushCtx.canvas.height - height) / 2;

  // // clear the brush canvas
  // brushCtx.clearRect(0, 0, brushCtx.canvas.width, brushCtx.canvas.height);

  // clip the rectangle to be
  // inside
  if (srcX < 0) {
    width += srcX;
    dstX -= srcX;
    srcX = 0;
  }
  const overX = srcX + width - ctx.canvas.width;
  if (overX > 0) {
    width -= overX;
  }

  if (srcY < 0) {
    dstY -= srcY;
    height += srcY;
    srcY = 0;
  }
  const overY = srcY + height - ctx.canvas.height;
  if (overY > 0) {
    height -= overY;
  }

  if (width <= 0 || height <= 0) {
    return;
  }

  brushCtx.drawImage(
    ctx.canvas,
    srcX,
    srcY,
    width,
    height,
    dstX,
    dstY,
    width,
    height
  );

  feather(brushCtx);
}

function startTouch(e) {
  var pos = getCanvasRelativePosition(e, ctx.canvas);
  lastX = pos.x;
  lastY = pos.y;
}

function draw(e) {
  if (!lastX && !lastY) {
    lastX = faceX;
    lastY = faceY;
  }
  const pos = getCanvasRelativePosition(e, ctx.canvas);
  const force = 1;

  const line = setupLine(lastX, lastY, pos.x, pos.y);
  for (let more = true; more; ) {
    more = advanceLine(line);
    ctx.globalAlpha = alpha * lerp(lastForce, force, line.u);
    ctx.drawImage(
      brushCtx.canvas,
      line.position[0] - brushCtx.canvas.width / 2,
      line.position[1] - brushCtx.canvas.height / 2
    );
    updateBrush(line.position[0], line.position[1]);
  }
  lastX = faceX;
  lastY = faceY;
  lastForce = force;
}

video.addEventListener("play", () => {
  const canvas = faceapi.createCanvasFromMedia(video);
  document.body.append(canvas);
  const displaySize = { width: winwidth, height: winheight };
  faceapi.matchDimensions(canvas, displaySize);
  faceapi.matchDimensions(faceCanvas, displaySize);

  setInterval(async () => {
    const detections = await faceapi
      .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();

    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    faceCanvas
      .getContext("2d")
      .clearRect(0, 0, faceCanvas.width, faceCanvas.height);

    // faceapi.draw.drawFaceLandmarks(faceCanvas, resizedDetections);


    mirroredX = faceCanvas.width - resizedDetections[0].landmarks.getNose()[7].x;

    faceX = mirroredX;
    faceY = resizedDetections[0].landmarks.getNose()[7].y;

    draw();
  }, 60);
});

// window.addEventListener("mousemove", draw);
// window.addEventListener(
//   "touchstart",
//   (e) => {
//     e.preventDefault();
//     startTouch(e.touches[0]);
//   },
//   { passive: false }
// );
// window.addEventListener(
//   "touchmove",
//   (e) => {
//     e.preventDefault();
//     draw(e.touches[0]);
//   },
//   { passive: false }
// );
