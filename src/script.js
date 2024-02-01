import * as THREE from "three";
import { createNoise3D } from 'simplex-noise';

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

// Load data
import globalTemp from "../datasets/data.js";

let scene, camera, renderer, earth,
    container,
    distortionFactor = 0.0,
    width = window.innerWidth,
    height = window.innerHeight,
    pixelRatio = 1,
    bloomComposer, poses = [],
    detector = null,
    webcam,
    numberOfParticlesPerSegment = 4,
    particleSpread = 0.1,
    earthCenter,
    earthRadius,
    keypoint3DPositions = [],
    collision = false,
    previousCollisionState = false,
    year = 1979,
    distortionFadeOutSpeed = 0.02,
    previousKeypoint3DPositions = [],
    lastNoiseUpdateTime = Date.now(),
    avgspeed = 0,
    targetSpeed = 0,
    maxSpeed = 1,
    distortionSpeed = 0.0006,
    originalEarthVertices,
    maxDistortionFactor = 0.9,
    baseDistortionSpeed = 0.00008
    ;


const setup = async () => {

    // Init Tensorflow
    await tf.ready();
    // console.log("TF is ready");

    // Webcam setup with error handling
    webcam = document.getElementById("webcam");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        webcam.srcObject = stream;
        webcam.onloadedmetadata = () => webcam.play();
        // console.log("Webcam is ready.");
    } catch (error) {
        console.error("Error accessing the webcam", error);
    }

    // Init scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        10
    );
    camera.position.z = 2;
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMapSoft = true;

    // scene.fog = new THREE.Fog(0x000000, 10, 950);

    container = document.getElementById("canvasContainer");
    container.appendChild(renderer.domElement);
    bloomComposer = new EffectComposer(renderer);

    // Bloom logic
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5,
        0.4,
        0.85
    );
    bloomPass.threshold = .08;
    bloomPass.strength = 1.5;
    bloomPass.radius = 1.0;
    bloomComposer.setSize(width * pixelRatio, height * pixelRatio);
    bloomComposer.renderToScreen = true;
    bloomComposer.addPass(renderScene);
    bloomComposer.addPass(bloomPass);
}

const createLights = () => {

    let shadowLight

    shadowLight = new THREE.DirectionalLight(0xff8f16, .4);
    shadowLight.position.set(0, 450, 350);
    shadowLight.castShadow = true;

    shadowLight.shadow.camera.left = -650;
    shadowLight.shadow.camera.right = 650;
    shadowLight.shadow.camera.top = 650;
    shadowLight.shadow.camera.bottom = -650;
    shadowLight.shadow.camera.near = 1;
    shadowLight.shadow.camera.far = 1000;

    shadowLight.shadow.mapSize.width = 4096;
    shadowLight.shadow.mapSize.height = 4096;


    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);

    scene.add(shadowLight);

    let light = new THREE.PointLight(0xffffff, 1, 0);
    light.position.set(-.3, 0, 3); // position the light
    scene.add(light);
}

const createEarth = () => {
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load("/textures/earthTexture.jpeg");
    earthTexture.anisotropy = 4;

    const icosahedronGeometry = new THREE.IcosahedronGeometry(0.7, 16);
    const lambertMaterial = new THREE.MeshPhongMaterial({ map: earthTexture });

    earth = new THREE.Mesh(icosahedronGeometry, lambertMaterial);

    // Compute the bounding sphere of the geometry
    earth.geometry.computeBoundingSphere();

    // currentForceEffects = new Array(earth.geometry.attributes.position.count).fill(0);
    // Get the center and radius of the bounding sphere
    earthCenter = earth.geometry.boundingSphere.center;
    earthRadius = earth.geometry.boundingSphere.radius;

    // Store original vertex positions
    originalEarthVertices = earth.geometry.attributes.position.array.slice();

    scene.add(earth);
}

// Create noise function
const noise3D = createNoise3D();

const initDetector = async () => {
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
    // console.log("Pose detector is initialized.");
}

const estimatePoses = async () => {
    poses = await detector.estimatePoses(webcam);
    if (poses.length > 0) {
        poses = poses;
    }
};

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
];

const getX = (xValue) => {
    const normalizedX = (xValue / webcam.videoWidth) * 2 - 1; // normalize to [-1, 1]
    const sceneX = normalizedX * (camera.aspect * camera.fov * Math.PI / 180); // convert to scene coordinates
    return -sceneX;
}

const getY = (yValue) => {
    const normalizedY = 1 - (yValue / webcam.videoHeight) * 2; // normalize to [-1, 1], flip y axis
    const sceneY = normalizedY * (camera.fov * Math.PI / 180); // convert to scene coordinates
    return sceneY;
}

const interpolate = (start, end, fraction) => {
    return start + (end - start) * fraction;
}

const drawPoseParticles = (pose, poseIndex) => {

    // Create the particle system per Pose
    const particlesGeometry = new THREE.BufferGeometry();
    const size = Math.random() * (0.01 - 0.001) + 0.001;
    const particlesMaterial = new THREE.PointsMaterial({ size: size, color: 0xfffffff });
    const keyPointParticles = new THREE.Points(particlesGeometry, particlesMaterial);
    keyPointParticles.isParticle = true;
    keyPointParticles.index = poseIndex;

    const positions = [];
    // Convert positions to THREE.Vector3 array

    // Optimized function to add particles
    const addParticles = (x, y, z, spread, count, heightFactor = 1) => {
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI * 2;

            positions.push(
                x + Math.sin(theta) * Math.cos(phi) * spread + Math.random() * 0.1,
                y + Math.sin(theta) * Math.sin(phi) * spread * heightFactor + Math.random() * 0.1,
                z
            );
        }
    };

    // Find the keypoints for the nose, left shoulder, and right shoulder to draw the neck
    const noseKeypoint = pose.keypoints.find(k => k.name === 'nose');
    const leftShoulderKeypoint = pose.keypoints.find(k => k.name === 'left_shoulder');
    const rightShoulderKeypoint = pose.keypoints.find(k => k.name === 'right_shoulder');

    if (noseKeypoint && leftShoulderKeypoint && rightShoulderKeypoint) {
        // Calculate the midpoint between the left and right shoulders
        const midShoulderX = interpolate(getX(leftShoulderKeypoint.x), getX(rightShoulderKeypoint.x), 0.5);
        const midShoulderY = interpolate(getY(leftShoulderKeypoint.y), getY(rightShoulderKeypoint.y), 0.5);

        addParticles(getX(noseKeypoint.x), (getY(noseKeypoint.y) - 0.1), 0, particleSpread, numberOfParticlesPerSegment, 1.5);

        // Particles along the line between the nose and the midpoint between the shoulders
        for (let i = 0; i < numberOfParticlesPerSegment; i++) {
            const fraction = i / numberOfParticlesPerSegment;
            positions.push(
                interpolate(getX(noseKeypoint.x), midShoulderX, fraction) + (Math.random() - 0.3) * particleSpread,
                interpolate(getY(noseKeypoint.y), midShoulderY, fraction) + (Math.random() - 0.3) * particleSpread,
                0
            );
        }
    }
    // Iterate over each segment
    bodySegments.forEach(([startName, endName]) => {
        const startKeypoint = pose.keypoints.find(k => k.name === startName);
        const endKeypoint = pose.keypoints.find(k => k.name === endName);
        if (startKeypoint && endKeypoint) {
            for (let i = 0; i < numberOfParticlesPerSegment; i++) {
                const fraction = i / numberOfParticlesPerSegment;
                positions.push(
                    interpolate(getX(startKeypoint.x), getX(endKeypoint.x), fraction) + (Math.random() - 0.3) * particleSpread,
                    interpolate(getY(startKeypoint.y), getY(endKeypoint.y), fraction) + (Math.random() - 0.3) * particleSpread,
                    0
                );

            }
        }
    });

    particlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    if (!scene.children.includes(keyPointParticles)) {
        scene.add(keyPointParticles);
    }

    // increase transparency of the particles over time
    const startTime = Date.now();
    particlesMaterial.opacity = 1 - (Date.now() - startTime) / 500;


    setTimeout(() => {
        scene.remove(keyPointParticles);
        particlesGeometry.dispose();
        particlesMaterial.dispose();
    }, 500); // 10000 milliseconds = 10 seconds
}

const checkCollisionForKeyPoints = (pose) => {
    let isCollisionDetected = false;

    pose.keypoints.forEach((keypoint, index) => {

        // check if keypoint is inside the earth
        const keypoint3DPosition = new THREE.Vector3(getX(keypoint.x), getY(keypoint.y), 0);

        // Ensure previousKeypoint3DPositions has an entry at this index
        if (previousKeypoint3DPositions[index]) {
            const speed = keypoint3DPosition.distanceTo(previousKeypoint3DPositions[index]);
            targetSpeed += speed; // Accumulate speeds for averaging
            // Only consider speeds above a threshold
            if (speed > 0.3) {
                avgspeed += speed / pose.keypoints.length
            }
        }

        keypoint3DPositions.push(keypoint3DPosition);
        const distanceToEarthCenter = keypoint3DPosition.distanceTo(earthCenter);
        if (distanceToEarthCenter < earthRadius) {
            // applyDistortion(keypoint3DPosition);
            isCollisionDetected = true;
        }
        previousKeypoint3DPositions[index] = keypoint3DPosition; // Update the position for the current index

    });


    // Average the target speed
    targetSpeed = Math.min(maxSpeed, Math.max(.3, targetSpeed / pose.keypoints.length / 0.2));

    // Ensure avgspeed doesn't exceed maxSpeed
    avgspeed = Math.min(maxSpeed, avgspeed);

    return isCollisionDetected;
};

const distortEarth = (time, collision) => {
    const positions = earth.geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
        let v = new THREE.Vector3().fromBufferAttribute(positions, i);
        v.normalize();

        let totalDistortion;

        totalDistortion = noise3D(
            v.x + time * distortionSpeed,
            v.y + time * distortionSpeed,
            v.z + time * distortionSpeed,
        ) * distortionFactor; // * avgspeed;

        // totalDistortion = Math.min(totalDistortion, maxDistortion);
        const distance = earth.geometry.parameters.radius + totalDistortion;

        v.multiplyScalar(distance);
        positions.setXYZ(i, v.x, v.y, v.z);
    }

    positions.needsUpdate = true;
    earth.geometry.computeVertexNormals();
}



const lerp = (start, end, t) => {
    return start * (1 - t) + end * t;
}

// Function to map a value from one range to another
const mapRange = (value, in_min, in_max, out_min, out_max) => {
    return (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}


const render = () => {

    // Distortion effect
    let time = Date.now()
    // Reset the positions
    keypoint3DPositions = [];

    if (time - lastNoiseUpdateTime > 3000) {
        estimatePoses();
        resetEarthVertices()

    }
    // ... if there is a pose detected
    if (poses.length > 0) {

        // For each person detected...
        poses.forEach((pose, poseIndex) => {
            // ... draw the particles
            drawPoseParticles(pose, poseIndex)

            // .. check for any collision with the earth
            collision = checkCollisionForKeyPoints(pose)

            const fadeSpeed = collision ? 0.05 : 0.1; // Faster fade out when no collision
            avgspeed = lerp(avgspeed, targetSpeed, fadeSpeed); // Smooth transition to the target speed

            // .. if there is a new collision, update the temperature
            if (collision && !previousCollisionState) {
                fetchDataPoint();
            }

            if (time - lastNoiseUpdateTime > 3000) {

                // ... if the average speed is above a threshold, increase the distortion speed
                if (collision && (avgspeed > 0.3)) {
                    distortionSpeed = lerp(distortionSpeed, 0.0009, 0.000000000001);
                }
                // ... if the average speed is below a threshold, decrease the distortion speed
                else if (distortionSpeed > baseDistortionSpeed) {
                    distortionSpeed = lerp(distortionSpeed, baseDistortionSpeed, 0.00000000001);
                }
                else {
                    distortionSpeed = baseDistortionSpeed
                }
            }

            // ... if there is a collision, update the temperature and init the distortion
            if (collision) {
                let speed = 0;
                if (avgspeed > 0.3) {
                    speed = avgspeed
                }
                // ... set distortion factor based on temperature
                let targetBlobScale = (mapRange(globalTemp.data[year], -30, 50, .01, .1)) + (speed);
                // ... lerp the distortion factor (fade in)
                distortionFactor = lerp(distortionFactor, targetBlobScale, 0.1);
            }
            else {
                // ... if there is no collision, revert to 0 (fade out)
                distortionFactor = lerp(distortionFactor, 0.0, distortionFadeOutSpeed);
            }

        });
    }
    else {
        // ... if there is no pose detected, revert the distortion to 0
        distortionFactor = lerp(distortionFactor, 0.0, distortionFadeOutSpeed);
        collision = false;
        // reset earth vertices
    }

    // ... update the previous collision state
    previousCollisionState = collision;

    // only distort every 100ms
    if (time - lastNoiseUpdateTime > 3000) {
        // Distort the earth
        distortEarth(time, collision);
    }


    earth.rotation.y += 0.001;
    // renderer.render(scene, camera);
    bloomComposer.render();
    requestAnimationFrame(render);
}

const fetchDataPoint = () => {

    year += 1;
    if (year > 2023) {
        year = 1979;
    }

    const newYear = year.toString();
    const newTemp = globalTemp.data[year];

    document.getElementById("yearNumber").innerText = "Year: " + newYear + " | Temp: " + newTemp + "°C";

    // return randomTemp.temp;
}

const resetEarthVertices = () => {
    const positions = earth.geometry.attributes.position;
    positions.array = originalEarthVertices.slice();
    positions.needsUpdate = true;
}

const init = async () => {
    await setup();
    await initDetector();
    fetchDataPoint();
    createLights();
    createEarth();
    render();
}

init();
