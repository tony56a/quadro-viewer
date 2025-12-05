import * as THREE from "three";
import { QdfParsedFile, QdfTube } from "@/app/types/qdf_containers";

export interface TubeRenderOptions {
    /** Multiplier to convert QDF units (mm) to world units (e.g., meters). */
    unitScale?: number;
    /** Tube radius in QDF units (mm). */
    tubeRadius?: number;
}

/**
 * Create a group containing cylinders for all `tube2` records.
 * - Tube axis is aligned with (a, b, c) from the orientation block.
 * - Tube center is at (x, y, z).
 */
export function renderTubes(
    parsed: QdfParsedFile,
    materials: Map<number, THREE.Material>,
    opts: TubeRenderOptions = {}
): THREE.Group {
    const group = new THREE.Group();

    const unitScale = opts.unitScale ?? 1 / 1000; // mm → meters
    const tubeRadiusMm = opts.tubeRadius ?? 4;   // 40 mm radius by default

    // Reuse one cylinder geometry if all tubes are similar
    const tubeGeometryCache = new Map<number, THREE.CylinderGeometry>();

    const getTubeGeometry = (lengthMm: number) => {
        const key = lengthMm;
        if (tubeGeometryCache.has(key)) return tubeGeometryCache.get(key)!;

        // Default Three cylinder axis is Y; height is length
        const height = lengthMm * unitScale;
        const radius = tubeRadiusMm * unitScale;
        const geom = new THREE.CylinderGeometry(radius, radius, height, 16);

        tubeGeometryCache.set(key, geom);
        return geom;
    };

    const defaultMaterial = new THREE.MeshStandardMaterial({
        color: 0xff8800,
        metalness: 0.2,
        roughness: 0.6,
    });

    const makeTubeMesh = (tube: QdfTube) => {
        const lengthMm = tube.length || 350; // fallback if missing
        const geom = getTubeGeometry(lengthMm);

        const material =
            materials.get(tube.id) ?? defaultMaterial;

        const mesh = new THREE.Mesh(geom, material);


        mesh.position.set(tube.position.x, tube.position.y, tube.position.z);

        mesh.quaternion.copy(tube.quaternion);

        mesh.userData.tube = tube;

        return mesh;
    };

    for (const tube of parsed.tubes) {
        group.add(makeTubeMesh(tube));
    }

    return group;
}