import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { createLights, createEarth } from "./createSceneObjects.js";

export let scene, camera, renderer, bloomComposer;

export const sceneSetup = () => {
    // Create the scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    // Create the camera
    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        10
    );
    camera.position.z = 2;

    // Create the renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Set soft shadow map type

    // Attach renderer to the DOM
    const container = document.getElementById("canvasContainer");
    if (container) {
        container.appendChild(renderer.domElement);
    } else {
        console.warn('Container element not found.');
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        bloomComposer.setSize(window.innerWidth, window.innerHeight);
    });

    // Handle WebGL context loss
    renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        console.error('WebGL context lost.');
        // Additional handling if needed
    });

    renderer.domElement.addEventListener('webglcontextrestored', () => {
        console.log('WebGL context restored.');
        // Recreate resources, reinitialize scene if needed
    });

    // Create the bloom composer
    bloomComposer = new EffectComposer(renderer);
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        1.5,
        0.4,
        0.85
    );
    bloomPass.threshold = 0.08;
    bloomPass.strength = 1.5;
    bloomPass.radius = 1.0;

    // Set up the composer with the render passes
    bloomComposer.setSize(window.innerWidth, window.innerHeight);
    bloomComposer.addPass(renderScene);
    bloomComposer.addPass(bloomPass);

    createEarth();
    createLights();
};
