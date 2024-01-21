uniform float tempValue;
uniform vec3 uKeypoints[128];
uniform vec3 uPrevKeypoints[128];
varying vec2 vUv;
uniform float time;
uniform float transitionTimer;
const float particleSize = 0.1;
// Define PI
const float PI = 3.1415926535897932384626433832795;

// Define noiseScale and noiseSpeed as constants
const float noiseScale = 2.0; // Adjust this value as needed
const float noiseSpeed = 0.0001; // Adjust this value as needed

// Function to create a rotation matrix around the Y-axis
mat4 rotateY(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat4(c, 0.0, s, 0.0, 0.0, 1.0, 0.0, 0.0, -s, 0.0, c, 0.0, 0.0, 0.0, 0.0, 1.0);
}

float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

  // Four corners in 2D of a tile
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

  // Smooth Interpolation

  // Cubic Hermite Curve.  Same as SmoothStep()
    vec2 u = f * f * (3.0 - 2.0 * f);

  // Mix 4 corners percentages
    return mix(a, b, u.x) +
        (c - a) * u.y * (1.0 - u.x) +
        (d - b) * u.x * u.y;
}

// Smoothing function for interpolation
float smoothInterpolation(float progress) {
    return smoothstep(0.0, 1.0, progress);
}

// Example of an easeInOutSine function
float easeInOutSine(float t) {
    return -(cos(PI * t) - 1.0) / 2.0;
}

void main() {
    float interpDuration = 10.0; // Example: 10 seconds

    // Calculate normalized time with respect to interpDuration
    float normalizedTime = mod(time, interpDuration) / interpDuration;

    // Use normalizedTime to calculate interpProgress
    float interpProgress;
    if(normalizedTime < 0.5) {
        // First half of the cycle (accelerating)
        interpProgress = easeInOutSine(normalizedTime * 2.0); // Range [0, 1]
    } else {
        // Second half of the cycle (decelerating)
        interpProgress = easeInOutSine((1.0 - normalizedTime) * 2.0); // Range [1, 0]
    }

    vUv = uv;
    float rotationSpeed = 0.15;
    mat4 rotationMatrix = rotateY(time * rotationSpeed);
    vec4 rotatedPosition = modelMatrix * rotationMatrix * vec4(position, 1.0);

    float influenceRadius = 0.3;
    float deformationStrength = 0.2; // Reduced strength for smoother effect
    vec3 deformation = vec3(0.0, 0.0, 0.0);
    mat4 inverseRotationMatrix = rotateY(0.0);

    // float interpProgress = smoothInterpolation(mod(time, interpDuration) / interpDuration);

    // Apply additional time-based distortion for fluid-like effect
    float timeBasedDistortion = sin(time * 0.5) * 2.0; // Adjust as needed for desired effect

    // Initialize finalPosition with rotatedPosition
    vec4 finalPosition = rotatedPosition;

    // Apply separate distortion for each keypoint
    for(int i = 0; i < 128; i++) {
        vec3 interpolatedKeypoint = mix(uPrevKeypoints[i], uKeypoints[i], interpProgress);
        vec4 keypointLocal = inverseRotationMatrix * vec4(interpolatedKeypoint, 1.0);
        float distance = length(keypointLocal.xyz - rotatedPosition.xyz);
        if(distance < influenceRadius) {
            float deformationFactor = deformationStrength * (1.0 - smoothstep(0.0, influenceRadius, distance)) * noiseScale + tempValue;

            // Apply noise to the deformation factor
            vec2 noiseInput = keypointLocal.xy * noiseScale + time * noiseSpeed;
            float noiseValue = noise(noiseInput);
            deformationFactor *= noiseValue; // Scale deformation by noise value

            // Calculate deformation per keypoint
            vec3 keypointDeformation = normalize(keypointLocal.xyz - rotatedPosition.xyz) * deformationFactor * timeBasedDistortion;

            // Apply the deformation to the vertex position
            finalPosition.xyz += keypointDeformation;
        }
    }

    gl_Position = projectionMatrix * viewMatrix * finalPosition;
}