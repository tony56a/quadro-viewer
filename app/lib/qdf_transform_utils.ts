
import * as THREE from "three";
import type { QdfOrientation } from "@/app/types/qdf_containers";


function decodeQdfQuaternion(ori: QdfOrientation): THREE.Quaternion {
    // Step 1: Reverse the squared scaling with sign preservation
    // Original formula was: sign(x) * x² * scale
    // Reverse: sign(value) * sqrt(abs(value))
    const reverseSquaredScaling = (value: number): number => {
        const sign = value < 0 ? -1 : 1;
        return sign * Math.sqrt(Math.abs(value));
    };

    const qa = reverseSquaredScaling(ori.a);  // w
    const qb = reverseSquaredScaling(ori.b);  // x
    const qc = reverseSquaredScaling(ori.c);  // y
    const qd = reverseSquaredScaling(ori.d);  // z

    // Step 2: Create Three.js quaternion (x, y, z, w order)
    // Note: Three.js uses (x, y, z, w) while QDF uses (w, x, y, z)
    const q = new THREE.Quaternion(qb, qc, qd, qa);

    // Step 3: Normalize (should already be normalized, but ensure it)
    q.normalize();

    // Step 4: Apply QUADRO's coordinate system transformations
    // Based on analysis: 90° around Z-axis

    // Second rotation: 45 degrees around Z-axis
    const zAxis = new THREE.Vector3(0, 0, 1);
    const zRotation = new THREE.Quaternion().setFromAxisAngle(zAxis, Math.PI / 2);

    // Apply rotations: object rotation first, then coordinate system transforms
    return q.multiply(zRotation).normalize();
}

function addHalfTubeOffset(lengthMm: number, unitScale: number, qFinal: THREE.Quaternion): THREE.Vector3 {
    const half = (lengthMm / 2) * unitScale;
    const localOffset = new THREE.Vector3(0, -half, 0).applyQuaternion(qFinal);
    return localOffset
}

export {
    decodeQdfQuaternion,
    addHalfTubeOffset,
};