import * as THREE from "three";
import { createNoise3D } from 'simplex-noise';

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

// Load data
import globalTemp from "../../datasets/data.js";

let scene, camera, renderer, earth,
    container,
    distortionFactor = 0.3,
    width = window.innerWidth,
    height = window.innerHeight,
    pixelRatio = 1,
    bloomComposer,
    poses = [],
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
    scene.background = new THREE.Color(0xffffff);
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


    const ambientLight = new THREE.AmbientLight(0xffffff, 2.5);
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


const distortEarth = (time, collision) => {
    const positions = earth.geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
        let v = new THREE.Vector3().fromBufferAttribute(positions, i);
        v.normalize();

        let totalDistortion;

        totalDistortion = noise3D(
            v.x + time * 0.0003,
            v.y + time * 0.0003,
            v.z + time * 0.0003,
        ) * 0.2; // * avgspeed;


        // totalDistortion = Math.min(totalDistortion, maxDistortion);
        const distance = earth.geometry.parameters.radius + totalDistortion;

        v.multiplyScalar(distance);
        positions.setXYZ(i, v.x, v.y, v.z);
    }

    positions.needsUpdate = true;
    earth.geometry.computeVertexNormals();
}

const render = () => {

    // Distortion effect
    let time = Date.now()
    // Reset the positions
    keypoint3DPositions = [];

    if (time - lastNoiseUpdateTime > 3000) {
        resetEarthVertices()

    }


    // ... update the previous collision state
    previousCollisionState = collision;

    // only distort every 100ms
    if (time - lastNoiseUpdateTime > 3000) {
        // Distort the earth
        distortEarth(time, collision);
    }


    earth.rotation.y += 0.001;
    renderer.render(scene, camera);
    // bloomComposer.render();
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
    // fetchDataPoint();
    createLights();
    createEarth();
    render();
}

init();
