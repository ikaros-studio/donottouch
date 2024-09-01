import * as THREE from "three";
import { scene } from './sceneSetup.js'; // Ensure the correct path to sceneSetup.js
import { interpolate, getX, getY } from "./utils.js";
import { bodySegments } from "./constants.js";

export const createLights = () => {
    let shadowLight = new THREE.DirectionalLight(0xff8f16, 0.4);
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
    light.position.set(-0.3, 0, 3); // position the light
    scene.add(light);
};

export let earth, earthCenter, earthRadius, originalEarthVertices;

export const createEarth = () => {
    const textureLoader = new THREE.TextureLoader();
    const earthTexture = textureLoader.load("/textures/earthTexture.jpeg");
    earthTexture.anisotropy = 4;

    const icosahedronGeometry = new THREE.IcosahedronGeometry(0.7, 16);
    const lambertMaterial = new THREE.MeshPhongMaterial({ map: earthTexture });

    earth = new THREE.Mesh(icosahedronGeometry, lambertMaterial);

    // Compute the bounding sphere of the geometry
    earth.geometry.computeBoundingSphere();

    // Get the center and radius of the bounding sphere
    earthCenter = earth.geometry.boundingSphere.center;
    earthRadius = earth.geometry.boundingSphere.radius;

    // Store original vertex positions
    originalEarthVertices = earth.geometry.attributes.position.array.slice();

    scene.add(earth);
};

let numberOfParticlesPerSegment = 4,
    particleSpread = 0.1;

export const drawPoseParticles = (pose, poseIndex) => {

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