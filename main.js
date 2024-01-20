// Inspiration: https://www.shadertoy.com/view/mlfBDN
// Idea for distortion: https://tympanus.net/codrops/2019/01/17/interactive-particles-with-three-js/
// IMPLEMENT MoveNetL https://storage.googleapis.com/tfjs-models/demos/pose-detection/index.html?model=movenet

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";
import globalTemp from "./datasets/data.js";

const width = window.innerWidth,
  height = window.innerHeight;

// Init Tensorflow
tf.ready();

// Attach webcam 
const webcam = document.getElementById("webcam");
webcam.style.display = "none";
navigator.mediaDevices
  .getUserMedia({
    video: true,
    audio: false,
  })
  .then((stream) => {
    webcam.srcObject = stream;
  });

// Init Posenet Detector
const detectorConfig = {
  // TODO: consider MULTIPOSE_THUNDER
  modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
  enableTracking: true,
  trackerType: poseDetection.TrackerType.BoundingBox,
};
const detector = await poseDetection.createDetector(
  poseDetection.SupportedModels.MoveNet,
  detectorConfig
);

const camera = new THREE.PerspectiveCamera(70, width / height, 0.01, 10);
camera.position.z = 1;
camera.position.y = 0;

const scene = new THREE.Scene();

// Add light
const ambientLight = new THREE.AmbientLight(0xfffffff, 1);
scene.add(ambientLight);

const renderer = new THREE.WebGLRenderer({ antialias: true });
const pixelRatio = 1; // Get the device's pixel ratio
renderer.setPixelRatio(pixelRatio); // Set the renderer's pixel ratio
renderer.setSize(width, height);
renderer.setAnimationLoop(animation);
document.body.appendChild(renderer.domElement);

// Bloom logic
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.5,
  0.4,
  0.85
);
bloomPass.threshold = 0.1;
bloomPass.strength = 1.5;
bloomPass.radius = 1;
const bloomComposer = new EffectComposer(renderer);
bloomComposer.setSize(width * pixelRatio, height * pixelRatio);
bloomComposer.renderToScreen = true;
bloomComposer.addPass(renderScene);
bloomComposer.addPass(bloomPass);

let poses = [];
// set random Temp from JSON object
let tempKeys = Object.keys(globalTemp.data);
let randomTemp = {
  year: 0.0,
  temp: 0.0,
};


async function estimatePoses() {
  poses = await detector.estimatePoses(webcam);

  if (poses.length !== poses.length) {
    // console.log("switched to " + poses.length + " people");
    poses = poses;
  }
}

let earthMesh;

loadEarth();
// Earth and Spheres can be both Buffergeometries https://www.youtube.com/watch?v=ZYi0xGp882I&ab_channel=Genka
function loadEarth() {
  const earthGeometry = new THREE.SphereGeometry(0.4, 128, 128);

  const earthTexture = new THREE.TextureLoader().load(
    "./assets/earthTexture.jpeg"
  );

  const earthShaderMaterial = new THREE.ShaderMaterial({

    // TODO: Investigate at what value stage the sphere capsulation is created. Also use the tempdata
    vertexShader: `
uniform float tempValue;
uniform vec3 uKeypoints[128];
uniform vec3 uPrevKeypoints[128];
varying vec2 vUv;
uniform float time;
uniform float transitionTimer;
const float particleSize = 0.1;
// Define PI
const float PI = 3.1415926535897932384626433832795;

// Define noiseScale and noiseSpeed as constants
const float noiseScale = 2.0; // Adjust this value as needed
const float noiseSpeed = 0.0001; // Adjust this value as needed

// Function to create a rotation matrix around the Y-axis
mat4 rotateY(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat4(
        c, 0.0, s, 0.0,
        0.0, 1.0, 0.0, 0.0,
        -s, 0.0, c, 0.0,
        0.0, 0.0, 0.0, 1.0
    );
}

float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

float noise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);

  // Four corners in 2D of a tile
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));

  // Smooth Interpolation

  // Cubic Hermite Curve.  Same as SmoothStep()
  vec2 u = f*f*(3.0-2.0*f);

  // Mix 4 corners percentages
  return mix(a, b, u.x) +
          (c - a)* u.y * (1.0 - u.x) +
          (d - b) * u.x * u.y;
}

// Smoothing function for interpolation
float smoothInterpolation(float progress) {
    return smoothstep(0.0, 1.0, progress);
}

// Example of an easeInOutSine function
float easeInOutSine(float t) {
    return -(cos(PI * t) - 1.0) / 2.0;
}

void main() {
    float interpDuration = 10.0; // Example: 10 seconds

    // Calculate normalized time with respect to interpDuration
    float normalizedTime = mod(time, interpDuration) / interpDuration;

    // Use normalizedTime to calculate interpProgress
    float interpProgress;
    if (normalizedTime < 0.5) {
        // First half of the cycle (accelerating)
        interpProgress = easeInOutSine(normalizedTime * 2.0); // Range [0, 1]
    } else {
        // Second half of the cycle (decelerating)
        interpProgress = easeInOutSine((1.0 - normalizedTime) * 2.0); // Range [1, 0]
    }

    vUv = uv;
    float rotationSpeed = 0.15;
    mat4 rotationMatrix = rotateY(time * rotationSpeed);
    vec4 rotatedPosition = modelMatrix * rotationMatrix * vec4(position, 1.0);

    float influenceRadius = 0.3;
    float deformationStrength = 0.2; // Reduced strength for smoother effect
    vec3 deformation = vec3(0.0, 0.0, 0.0);
    mat4 inverseRotationMatrix = rotateY(0.0);

    // float interpProgress = smoothInterpolation(mod(time, interpDuration) / interpDuration);

    // Apply additional time-based distortion for fluid-like effect
    float timeBasedDistortion = sin(time * 0.5) * 2.0; // Adjust as needed for desired effect

    
    // Initialize finalPosition with rotatedPosition
    vec4 finalPosition = rotatedPosition;
    
    // Apply separate distortion for each keypoint
    for (int i = 0; i < 128; i++) {
        vec3 interpolatedKeypoint = mix(uPrevKeypoints[i], uKeypoints[i], interpProgress);
        vec4 keypointLocal = inverseRotationMatrix * vec4(interpolatedKeypoint, 1.0);
        float distance = length(keypointLocal.xyz - rotatedPosition.xyz);
        if (distance < influenceRadius) {
            float deformationFactor = deformationStrength * (1.0 - smoothstep(0.0, influenceRadius, distance)) * noiseScale;
    
            // Apply noise to the deformation factor
            vec2 noiseInput = keypointLocal.xy * noiseScale + time * noiseSpeed;
            float noiseValue = noise(noiseInput);
            deformationFactor *= noiseValue; // Scale deformation by noise value
    
            // Calculate deformation per keypoint
            vec3 keypointDeformation = normalize(keypointLocal.xyz - rotatedPosition.xyz) * deformationFactor * timeBasedDistortion;
    
            // Apply the deformation to the vertex position
            finalPosition.xyz += keypointDeformation;
        }
    }
    
    gl_Position = projectionMatrix * viewMatrix * finalPosition;


}
`,
    fragmentShader: `
    uniform sampler2D uTexture;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(uTexture, vUv);
      gl_FragColor = color;
  }
    `,
    uniforms: {
      uKeypoints: { value: new Array(128).fill(new THREE.Vector3()) }, // Initialize keypoints array
      uPrevKeypoints: { value: new Array(128).fill(new THREE.Vector3()) }, // Initialize previous keypoints array
      uTexture: { value: earthTexture },
      time: { value: 0 },
      transitionTimer: { value: 0.0 },
      tempValue: { value: randomTemp.temp  },
    },
  });

  earthMesh = new THREE.Mesh(earthGeometry, earthShaderMaterial);
  scene.add(earthMesh);
}

const vertices = [];

for (let i = 0; i < 10000; i++) {
  const x = THREE.MathUtils.randFloatSpread(2000);
  const y = THREE.MathUtils.randFloatSpread(2000);
  const z = THREE.MathUtils.randFloatSpread(2000);

  vertices.push(x, y, z);
}


function getX(xValue) {
  return -((xValue / webcam.videoWidth) * 2 - 1) //* scaleFactor;
}

function getY(yValue) {
  return -((yValue / webcam.videoHeight) * 2 - 1) //* scaleFactor;
}

const relevantKeypointNames = [
  "nose",
  "leftEye",
  "rightEye",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
]

const bodySegments = [
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['right_hip', 'right_knee'],
  ['left_knee', 'left_ankle'],
  ['right_knee', 'right_ankle'],
  ['left-eye', 'nose'],
]

const numberOfParticlesPerSegment = 10;
const particleSpread = 0.15;
let transitionTimer = 0.0;  // Initialize transition timer
const transitionDuration = 5.0;  // Duration of the transition in seconds

// Get a new random temp every 30 secs
setInterval(() => {
  randomTemp.year = tempKeys[Math.floor(Math.random() * tempKeys.length)];
  randomTemp.temp = globalTemp.data[randomTemp.year];
  console.log(randomTemp);
  earthMesh.material.uniforms.tempValue.value = randomTemp.temp;

}, 1000);


// animation
function animation(time) {

  // Update time uniform in the shader
  earthMesh.material.uniforms.time.value = performance.now() / 1000; // time in seconds
  // Update transition timer
  if (transitionTimer < 1) {
    transitionTimer += (1 / 60) / transitionDuration; // Increment timer based on frame rate (assuming 60 FPS) and duration
    transitionTimer = Math.min(transitionTimer, 1); // Clamp it to a maximum of 1
  }
  earthMesh.material.uniforms.transitionTimer.value = transitionTimer; // Pass the timer to the shader

  earthMesh.material.uniforms.uPrevKeypoints.value = earthMesh.material.uniforms.uKeypoints.value; // Update the previous keypoints to the current keypoints

  estimatePoses()
  if (poses.length == 0) {
    // Remove all spheres
    scene.children.forEach((child) => {
      if (child.isMovementObject || child.isParticle) {
        // Check if the child has the isSphere property
        scene.remove(child);
      }
    });
    // console.log("All persons left.");
  } else if (poses.length >= 1) {


    poses.forEach((pose, poseIndex) => {
      // Create the particle system per Pose
      const particlesGeometry = new THREE.BufferGeometry();
      const particlesMaterial = new THREE.PointsMaterial({ size: 0.005, color: 0xfffffff });


      const keyPointParticles = new THREE.Points(particlesGeometry, particlesMaterial);
      keyPointParticles.isParticle = true;
      keyPointParticles.index = poseIndex;
      // Update keypoints every frame
      pose.keypoints.forEach((keypoint, keypointIndex) => {
        let keypointPosition = new THREE.Vector3(getX(keypoint.x), getY(keypoint.y), 0);
        if (poseIndex != 0 && keypointIndex != null) {
          earthMesh.material.uniforms.uKeypoints.value[(poseIndex + 1) * pose.keypoints.length + keypointIndex] = keypointPosition;
        }
        else {
          earthMesh.material.uniforms.uKeypoints.value[keypointIndex] = keypointPosition;
        }
      });

      // Find the keypoints for the nose, left shoulder, and right shoulder
      const noseKeypoint = pose.keypoints.find(k => k.name === 'nose');
      const leftShoulderKeypoint = pose.keypoints.find(k => k.name === 'left_shoulder');
      const rightShoulderKeypoint = pose.keypoints.find(k => k.name === 'right_shoulder');


      pose.particlePositions = [];

      if (noseKeypoint && leftShoulderKeypoint && rightShoulderKeypoint) {
        // Calculate the midpoint between the left and right shoulders
        const midShoulderX = interpolate(getX(leftShoulderKeypoint.x), getX(rightShoulderKeypoint.x), 0.5);
        const midShoulderY = interpolate(getY(leftShoulderKeypoint.y), getY(rightShoulderKeypoint.y), 0.5);

        // Create particles in a 2D sphere around the nose
        for (let i = 0; i < numberOfParticlesPerSegment; i++) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.random() * Math.PI * 2;

          const x = getX(noseKeypoint.x) + Math.sin(theta) * Math.cos(phi) * particleSpread + Math.random() * 0.1;
          const y = getY(noseKeypoint.y) - 0.1 + Math.sin(theta) * Math.sin(phi) * particleSpread * 1.5 + Math.random() * 0.1;
          const z = 0.1; // Or calculate Z based on your needs
          pose.particlePositions.push(x, y, z);
        }

        // Create particles along the line between the nose and the midpoint between the shoulders
        for (let i = 0; i < numberOfParticlesPerSegment; i++) {
          const fraction = i / numberOfParticlesPerSegment;
          const spreadX = (Math.random() - 0.3) * particleSpread;
          const spreadY = (Math.random() - 0.3) * particleSpread;

          const x = interpolate(getX(noseKeypoint.x), midShoulderX, fraction) + spreadX + Math.random() * 0.1;
          const y = interpolate(getY(noseKeypoint.y), midShoulderY, fraction) + spreadY + Math.random() * 0.1;
          const z = 0.1; // Or calculate Z based on your needs
          pose.particlePositions.push(x, y, z);

        }
      }

      // Iterate over each segment
      bodySegments.forEach((segment, segmentIndex) => {
        const startKeypoint = pose.keypoints.find(k => k.name === segment[0]);
        const endKeypoint = pose.keypoints.find(k => k.name === segment[1]);

        if (startKeypoint && endKeypoint) {
          // Create particles along each segment
          for (let i = 0; i < numberOfParticlesPerSegment; i++) {
            const fraction = i / numberOfParticlesPerSegment;
            const x = interpolate(getX(startKeypoint.x), getX(endKeypoint.x), fraction) + (Math.random() - 0.3) * particleSpread;
            const y = interpolate(getY(startKeypoint.y), getY(endKeypoint.y), fraction) + (Math.random() - 0.3) * particleSpread;
            const z = 0.1; // Or calculate Z based on your needs

            pose.particlePositions.push(x, y, z);
          }
        }

      });



      particlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pose.particlePositions, 3));
      scene.add(keyPointParticles);

      // Make the particles rain
      // keyPointParticles.position.z -= 0.01;
      keyPointParticles.position.y += 0.01;

      setTimeout(() => {
        scene.remove(keyPointParticles);
        particlesGeometry.dispose();
        particlesMaterial.dispose();

      }, 500); // 10000 milliseconds = 10 seconds
    });
  }
  // renderer.render(scene, camera);
  bloomComposer.render();
}

function interpolate(start, end, fraction) {
  return start + (end - start) * fraction;
}