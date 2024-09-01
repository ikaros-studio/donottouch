import { updateAvgSpeed, avgspeed, targetSpeed, distortionSpeed, checkCollisionForKeyPoints, keypoint3DPositions, updateDistortionFactor, distortionFactor, distortEarth, updateDistortionSpeed } from "./distortion";
import { poses, estimatePoses } from "./poseDetection";
import { earth, drawPoseParticles } from "./createSceneObjects";
import { renderer, scene, camera, bloomComposer } from "./sceneSetup";
import { lerp, resetEarthVertices, mapRange } from "./utils";
import { fetchDataPoint, globalTemp, year } from './data.js';

let
    collision = false, // Determine if a pose collides with the earth 
    distortionFadeOutSpeed = 0.02, // How fast the distortion stops after all poses don't collide anymore
    poseCollisionStates = [], // Track collision states of poses
    frameCount = 0; // Track the frame count

export const render = () => {

    // Define Time
    let time = Date.now()

    // Reset the positions
    keypoint3DPositions.length = 0;  // This clears the array without reassigning it

    estimatePoses(); // Continuously update the pose positions
    // Reset the positions
    if (frameCount % 30 === 0) {
        resetEarthVertices() // Continuously reset the earth vertices
    }

    frameCount++; // Increment the frame count

    // ... if there is a pose detected
    if (poses.length > 0) {

        // Loop through all poses
        poses.forEach((pose, poseIndex) => {
            // Draw the pose particles
            drawPoseParticles(pose, poseIndex);

            // Check if the pose is colliding with the earth
            const isCurrentlyColliding = checkCollisionForKeyPoints(pose);

            // Ensure the poseCollisionStates array is initialized for each pose
            if (poseCollisionStates[poseIndex] === undefined) {
                poseCollisionStates[poseIndex] = false;
            }

            // Detect if a new collision with the earth has occurred
            if (isCurrentlyColliding && !poseCollisionStates[poseIndex]) {
                fetchDataPoint(); // Update temperature/year on new entry
            }

            // Update the collision state for the current pose
            poseCollisionStates[poseIndex] = isCurrentlyColliding;

            const fadeSpeed = 0.05; // Faster fade out when no collision
            updateAvgSpeed(lerp(avgspeed, targetSpeed, fadeSpeed)); // Smooth transition to the target speed

            if (isCurrentlyColliding) {
                const speed = avgspeed > 0.1 ? avgspeed : 0; // TODO: find out what this does
                const targetBlobScale = mapRange(globalTemp.data[year], -30, 50, 0.01, 0.1) + speed;
                updateDistortionFactor(lerp(distortionFactor, targetBlobScale, 0.03));
            }

            else {
                // ... if there is no pose and hence collision detected, revert the distortion to 0
                updateDistortionFactor(lerp(distortionFactor, 0.0, distortionFadeOutSpeed));
                collision = false;
            }
        });
    }

    else {
        // ... if there is no pose and hence collision detected, revert the distortion to 0
        updateDistortionFactor(lerp(distortionFactor, 0.0, distortionFadeOutSpeed));
        collision = false;
    }

    // Distort the earth
    distortEarth(time);

    // Set a contiuous rotation to the earth object
    earth.rotation.y += 0.001;

    // Render the scene with post-processing
    bloomComposer.render();

    // Keep the animation loop running
    requestAnimationFrame(render);
}