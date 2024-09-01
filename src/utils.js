import { camera } from "./sceneSetup";
import { earth, originalEarthVertices } from "./createSceneObjects";
export let webcam

export const setupWebcam = async () => {
    // Get the webcam element
    webcam = document.getElementById("webcam");

    try {
        // Request access to the webcam
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        webcam.srcObject = stream;

        // Play the webcam feed when metadata is loaded
        webcam.onloadedmetadata = () => webcam.play();

        console.log("Webcam is ready.");
    } catch (error) {
        console.error("Error accessing the webcam", error);
    }

};


// Converts x-coordinate from webcam space to scene space
export const getX = (xValue) => {
    const normalizedX = (xValue / webcam.videoWidth) * 2 - 1; // normalize to [-1, 1]
    const sceneX = normalizedX * (camera.aspect * camera.fov * Math.PI / 180); // convert to scene coordinates
    return -sceneX;
};

// Converts y-coordinate from webcam space to scene space
export const getY = (yValue) => {
    const normalizedY = 1 - (yValue / webcam.videoHeight) * 2; // normalize to [-1, 1], flip y axis
    const sceneY = normalizedY * (camera.fov * Math.PI / 180); // convert to scene coordinates
    return sceneY;
};

// Linearly interpolates between start and end by fraction
export const interpolate = (start, end, fraction) => {
    return start + (end - start) * fraction;
};

// Linearly interpolates between start and end based on t (0 to 1)
export const lerp = (start, end, t) => {
    return start * (1 - t) + end * t;
};

// Maps a value from one range to another range
export const mapRange = (value, in_min, in_max, out_min, out_max) => {
    return (value - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
};

// reset the earth Vertices to avoid complex object structure
export const resetEarthVertices = () => {
    const positions = earth.geometry.attributes.position;
    positions.array = originalEarthVertices.slice();
    positions.needsUpdate = true;
}