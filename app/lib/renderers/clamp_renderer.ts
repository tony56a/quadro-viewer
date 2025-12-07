// lib/renderClamps.ts
import * as THREE from "three";
import { QdfParsedFile, QdfClamp } from "@/app/types/qdf_containers";

export interface ClampRenderOptions {
    radius?: number;   // mm
    length?: number;   // mm
}

/**
 * Render clamp2 parts from a parsed QDF file.
 * Creates two cylinders offset on the Y axis by the radius.
 */
export function renderClamps(
    parsed: QdfParsedFile,
    materials: Map<number, THREE.Material>,
    opts: ClampRenderOptions = {}
): THREE.Group {
    const radius = opts.radius ?? 15; // mm (QDF units)
    const length = opts.length ?? 25; // mm

    const group = new THREE.Group();

    for (const clamp of parsed.clamps) {
        // Use material by materialId when available, otherwise a default material
        const mat =
            materials.get(clamp.materialId) ||
            new THREE.MeshStandardMaterial({ color: 0x888888 });

        // Create a local group for this clamp
        const clampGroup = new THREE.Group();

        // Create two cylinders
        // Cylinder geometry in Three.js: radiusTop, radiusBottom, height, radialSegments
        const cylinderGeom = new THREE.CylinderGeometry(radius, radius, length, 16);

        // First cylinder - offset by +radius on Y axis
        const cylinder1 = new THREE.Mesh(cylinderGeom, mat);
        clampGroup.add(cylinder1);

        // Second cylinder - offset by -radius on Y axis
        const cylinder2 = new THREE.Mesh(cylinderGeom, mat);
        cylinder2.position.z = -2 * radius;
        clampGroup.add(cylinder2);

        // Position and orient the entire clamp group
        clampGroup.position.set(
            clamp.orientation.x,
            clamp.orientation.y,
            clamp.orientation.z
        );

        // Apply quaternion rotation
        clampGroup.quaternion.copy(clamp.quaternion);

        // Store reference to original clamp data
        clampGroup.userData.clamp = clamp;

        group.add(clampGroup);
    }

    return group;
}
