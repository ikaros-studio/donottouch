import * as THREE from "three";
import { createNoise3D } from 'simplex-noise';

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

// Load data
import globalTemp from "./datasets/data.js";

let scene, camera, renderer, earth, container, blobScale = .2, width = window.innerWidth, height = window.innerHeight, pixelRatio = 1, bloomComposer, poses = [],
    detector = null,
    webcam,
    numberOfParticlesPerSegment = 10,
    particleSpread = 0.1,
    earthCenter,
    earthRadius,
    keypoint3DPositions = [],
    currentForceEffects = [],
    collision = false,
    currentTemp = null,
    previousCollisionState = false,
    year = 1979;

const setup = async () => {

    // Init Tensorflow
    await tf.ready();
    console.log("TF is ready");

    // Webcam setup with error handling
    webcam = document.getElementById("webcam");
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        webcam.srcObject = stream;
        webcam.onloadedmetadata = () => webcam.play();
        console.log("Webcam is ready.");
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

    scene.fog = new THREE.Fog(0x000000, 10, 950);

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
    bloomPass.threshold = 0.01;
    bloomPass.strength = 1.5;
    bloomPass.radius = 1;
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

    const pointLight = new THREE.PointLight(0xffffff, 0.5);

    scene.add(pointLight);
    scene.add(shadowLight);
}

const createEarth = () => {
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load("/earthTexture.jpeg");
    earthTexture.anisotropy = 8;

    const icosahedronGeometry = new THREE.IcosahedronGeometry(0.7, 32);
    const lambertMaterial = new THREE.MeshPhongMaterial({ map: earthTexture });

    earth = new THREE.Mesh(icosahedronGeometry, lambertMaterial);

    // Compute the bounding sphere of the geometry
    earth.geometry.computeBoundingSphere();

    currentForceEffects = new Array(earth.geometry.attributes.position.count).fill(0);
    // Get the center and radius of the bounding sphere
    earthCenter = earth.geometry.boundingSphere.center;
    earthRadius = earth.geometry.boundingSphere.radius;
    scene.add(earth);
}


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
    console.log("Pose detector is initialized.");
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
    const particlesMaterial = new THREE.PointsMaterial({ size: 0.005, color: 0xfffffff });
    const keyPointParticles = new THREE.Points(particlesGeometry, particlesMaterial);
    keyPointParticles.isParticle = true;
    keyPointParticles.index = poseIndex;

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
            const z = 0; // Or calculate Z based on your needs
            pose.particlePositions.push(x, y, z);
        }

        // Create particles along the line between the nose and the midpoint between the shoulders
        for (let i = 0; i < numberOfParticlesPerSegment; i++) {
            const fraction = i / numberOfParticlesPerSegment;
            const spreadX = (Math.random() - 0.3) * particleSpread;
            const spreadY = (Math.random() - 0.3) * particleSpread;

            const x = interpolate(getX(noseKeypoint.x), midShoulderX, fraction) + spreadX + Math.random() * 0.1;
            const y = interpolate(getY(noseKeypoint.y), midShoulderY, fraction) + spreadY + Math.random() * 0.1;
            const z = 0; // Or calculate Z based on your needs
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
                const z = 0; // Or calculate Z based on your needs
                pose.particlePositions.push(x, y, z);
            }
        }
        particlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pose.particlePositions, 3));
        scene.add(keyPointParticles);

    });
    setTimeout(() => {
        scene.remove(keyPointParticles);
        particlesGeometry.dispose();
        particlesMaterial.dispose();

    }, 500); // 10000 milliseconds = 10 seconds
}

// Function to project 2D keypoints to 3D space and check collision
const checkCollisionForKeyPoints = (pose) => {
    let isCollisionDetected = false;
    pose.keypoints.forEach(keypoint => {
        // check if keypoint is inside the earth
        const keypoint3DPosition = new THREE.Vector3(getX(keypoint.x), getY(keypoint.y), 0);
        keypoint3DPositions.push(keypoint3DPosition);
        const distanceToEarthCenter = keypoint3DPosition.distanceTo(earthCenter);
        if (distanceToEarthCenter < earthRadius) {
            // applyDistortion(keypoint3DPosition);
            isCollisionDetected = true;
        }
        else {
        }
    });
    return isCollisionDetected;
};

const distortEarth = () => {

    const positions = earth.geometry.attributes.position;

    // Distortion effect
    let time = Date.now()

    for (let i = 0; i < positions.count; i++) {
        let v = new THREE.Vector3().fromBufferAttribute(positions, i);
        v.normalize();
        let targetForceEffect = 1.5;

        if (collision) {
            keypoint3DPositions.forEach(keypoint3D => {
                const distanceToKeypoint = keypoint3D.distanceTo(v);
                // Adjust the effect based on distance; this formula can be tweaked
                targetForceEffect += Math.max(0, 1 - distanceToKeypoint / 2); // Decrease influence with distance
            });

            // Normalize the effect based on the number of keypoints to prevent excessive distortion
            if (keypoint3DPositions.length > 0) {
                targetForceEffect /= keypoint3DPositions.length;
            }
        } else {
            targetForceEffect = 0;
        }

        // Lerp current force effect towards target force effect
        const lerpFactor = 0.1; // Adjust this factor to control the speed of the transition
        currentForceEffects[i] += (targetForceEffect - currentForceEffects[i]) * lerpFactor;

        const distance = earth.geometry.parameters.radius + noise3D(
            v.x + time * 0.0001, // reduced multiplier for x-axis
            v.y + time * 0.0001,  // reduced multiplier for y-axis
            v.z + time * 0.0001   // reduced multiplier for z-axis
        ) * blobScale * currentForceEffects[i];
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

    // Reset the positions
    keypoint3DPositions = [];

    estimatePoses();

    if (poses.length > 0) {
        poses.forEach((pose, poseIndex) => {
            drawPoseParticles(pose, poseIndex)
            collision = checkCollisionForKeyPoints(pose)

            if (collision && !previousCollisionState) {
                fetchDataPoint();
                // Assume fetchDataPoint updates a global variable 'temperature'
                let targetBlobScale = mapRange(globalTemp.data[year], -30, 50, 0.0, 1.0);
                blobScale = lerp(blobScale, targetBlobScale, 0.08);
            }

            previousCollisionState = collision;

            let targetBlobScale = collision ? 0.6 : 0.0;
            let transitionSpeed = collision ? 0.08 : 0.02; // Adjust these values as needed

            blobScale = lerp(blobScale, targetBlobScale, transitionSpeed);

        });
    }
    else {
        blobScale = lerp(blobScale, 0.0, 0.02);
        collision = false;
    }
    // Distort the earth
    distortEarth();





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


const init = async () => {
    await setup();
    await initDetector();
    fetchDataPoint();
    createLights();
    createEarth();
    render();
}

init();
