import * as THREE from "three";
import { getX, getY } from "./utils"
import { earthCenter, earthRadius, earth } from "./createSceneObjects"
import { createNoise3D } from 'simplex-noise';

let
    previousKeypoint3DPositions = [], // previous positions of poses
    maxSpeed = 0.7; // set maximum Speed

export let keypoint3DPositions = [],
    targetSpeed = 0, // set target speed (based on current speed)
    avgspeed = 0;


export const checkCollisionForKeyPoints = (pose) => {
    let isCollisionDetected = false;

    // Loop through poses
    pose.keypoints.forEach((keypoint, index) => {

        // Check if keypoint is inside the earth
        const keypoint3DPosition = new THREE.Vector3(getX(keypoint.x), getY(keypoint.y), 0);

        // Ensure previousKeypoint3DPositions has an entry at this index
        if (previousKeypoint3DPositions[index]) {
            const speed = keypoint3DPosition.distanceTo(previousKeypoint3DPositions[index]); // Calculate speed of keypoints relative to their previous position
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

    // Average the target speed and set a base speed
    targetSpeed = Math.min(maxSpeed, Math.max(0.05, targetSpeed / pose.keypoints.length / 0.2));

    // Ensure avgspeed doesn't exceed maxSpeed
    avgspeed = Math.min(maxSpeed, avgspeed);

    return isCollisionDetected;
};


// Create noise function
const noise3D = createNoise3D();

export let distortionSpeed = 0.00045,
    distortionFactor = 0.0;

export const distortEarth = (time) => {
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

export function updateAvgSpeed(newSpeed) {
    avgspeed = Math.min(maxSpeed, newSpeed); // Update avgspeed safely
}

export function updateDistortionSpeed(newSpeed) {
    distortionSpeed = newSpeed
}

export function updateDistortionFactor(newFactor) {
    distortionFactor = newFactor
}