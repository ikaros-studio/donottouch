import { fetchDataPoint } from "./data.js";
import { sceneSetup } from "./sceneSetup.js";
import { initDetector } from "./poseDetection.js";
import { render } from "./render.js";

const init = async () => {
    try {
        // Initiate the tensorflow / movement pose detection via webcam
        await initDetector();

        // Setup the three.js scene and create lights & objects
        sceneSetup();

        // Fetch an initial year
        fetchDataPoint();

        // Continuously render the three.js scene, apply transformations, and observe changes.
        render();
    } catch (error) {
        console.error("Initialization failed:", error);
    }
};

init();