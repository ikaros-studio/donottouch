import { setupWebcam, webcam } from "./utils";
import * as poseDetection from "@tensorflow-models/pose-detection";
import * as tf from "@tensorflow/tfjs-core";
import "@tensorflow/tfjs-backend-webgl";

export let detector = null, poses = [];

export const initDetector = async () => {

    await setupWebcam();

    // Init Posenet Detector
    await tf.ready()
    const detectorConfig = {
        // TODO: consider MULTIPOSE_THUNDER
        modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
        enableTracking: true,
        trackerType: poseDetection.TrackerType.BoundingBox,
        modelUrl: '../models/model.json', // Update path to point to your local model
    };

    detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        detectorConfig
    );
}

export const estimatePoses = async () => {
    poses = await detector.estimatePoses(webcam);
    if (poses.length > 0) {
        poses = poses;
    }
};

