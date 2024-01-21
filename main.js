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
import fragmentShader from '/shaders/earthFs.glsl?raw';
import vertexShader from '/shaders/earthVs.glsl?raw';


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
bloomPass.strength = .5;
bloomPass.radius = 1;
const bloomComposer = new EffectComposer(renderer);
bloomComposer.setSize(width * pixelRatio, height * pixelRatio);
bloomComposer.renderToScreen = true;
bloomComposer.addPass(renderScene);
bloomComposer.addPass(bloomPass);

let poses = [];
let detector = null;
// set random Temp from JSON object
let tempKeys = Object.keys(globalTemp.data);
let randomTemp = {
  year: 0.0,
  temp: 0.0,
};

main();

async function main() {
  // Init Posenet Detector
  const detectorConfig = {
    // TODO: consider MULTIPOSE_THUNDER
    modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
    enableTracking: true,
    trackerType: poseDetection.TrackerType.BoundingBox,
  };
  detector = await poseDetection.createDetector(
    poseDetection.SupportedModels.MoveNet,
    detectorConfig
  );

}

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
    "./public/earthTexture.jpeg"
  );

  const earthShaderMaterial = new THREE.ShaderMaterial({

    // TODO: Investigate at what value stage the sphere capsulation is created. Also use the tempdata
    vertexShader,
    fragmentShader,
    uniforms: {
      uKeypoints: { value: new Array(128).fill(new THREE.Vector3()) }, // Initialize keypoints array
      uPrevKeypoints: { value: new Array(128).fill(new THREE.Vector3()) }, // Initialize previous keypoints array
      uTexture: { value: earthTexture },
      time: { value: 0 },
      transitionTimer: { value: 0.0 },
      tempValue: { value: 0.0 },
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
  console.log(randomTemp.temp);
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