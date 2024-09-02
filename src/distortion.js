import * as THREE from "three";
import { getX, getY } from "./utils"
import { earthCenter, earthRadius, earth } from "./createSceneObjects"
import { createNoise3D } from 'simplex-noise';

let
    previousKeypoint3DPositions = [], // previous positions of poses
    maxSpeed = 0.7; // set maximum Speed

export let keypoint3DPositions = [],
    targetSpeed = 0, // set target speed (based on current speed)
    avgspeed = 0,
    pose2DMovement = new THREE.Vector2(0, 0),
    previousLeftWrist = { x: 0, y: 0 },
    previousRightWrist = { x: 0, y: 0 };


export const checkCollisionForKeyPoints = (pose) => {

    let isCollisionDetected = false;

    // const leftWrist = pose.keypoints[9];
    // const rightWrist = pose.keypoints[10];
    // const leftWrist2D = new THREE.Vector2(getX(leftWrist.x), getY(leftWrist.y));
    // const rightWrist2D = new THREE.Vector2(getX(rightWrist.x), getY(rightWrist.y));

    // // Calculate the current average position
    // const currentPose2DMovement = new THREE.Vector2(
    //     (leftWrist2D.x + rightWrist2D.x) / 2,
    //     (leftWrist2D.y + rightWrist2D.y) / 2
    // );

    // // Track previous wrist positions (ensure these are updated correctly in your loop)
    // const previousLeftWrist2D = new THREE.Vector2(getX(previousLeftWrist.x), getY(previousLeftWrist.y));
    // const previousRightWrist2D = new THREE.Vector2(getX(previousRightWrist.x), getY(previousRightWrist.y));

    // // Calculate the average of the previous wrist positions
    // const previousPose2DMovement = new THREE.Vector2(
    //     (previousLeftWrist2D.x + previousRightWrist2D.x) / 2,
    //     (previousLeftWrist2D.y + previousRightWrist2D.y) / 2
    // );

    // // Define a threshold for movement relevance
    // const movementThreshold = 0.2;
    // console.log(previousPose2DMovement.distanceTo(currentPose2DMovement))
    // // Check if the movement is relevant by comparing with the previous position
    // if (previousPose2DMovement.distanceTo(currentPose2DMovement) >= movementThreshold) {
    //     // Smoothen the movement by averaging with the previous position
    //     pose2DMovement.lerp(currentPose2DMovement, 0.01); // 0.05 is the smoothing factor, adjust as needed
    // } else {
    //     // If the movement is not relevant, set the movement to zero or maintain current
    // }

    // // Update previous positions for the next frame
    // previousLeftWrist = leftWrist;
    // previousRightWrist = rightWrist;

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
    // Convert 2D movement to 3D vector
    // const direction = new THREE.Vector3(pose2DMovement.x, pose2DMovement.y, 0).normalize();

    for (let i = 0; i < positions.count; i++) {
        let v = new THREE.Vector3().fromBufferAttribute(positions, i).normalize();
        v.normalize();

        let totalDistortion;
        // Calculate alignment with smoothed direction
        // const alignment = v.dot(direction);

        totalDistortion = noise3D(
            v.x + time * distortionSpeed,
            v.y + time * distortionSpeed,
            v.z + time * distortionSpeed,
        ) * distortionFactor; // * avgspeed;

        // Amplify distortion based on alignment with smoothed direction
        // totalDistortion += alignment * .2; // Scale this factor as needed

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