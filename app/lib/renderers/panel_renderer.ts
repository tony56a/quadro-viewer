// lib/renderPanels.ts
import * as THREE from "three";
import {
    QdfParsedFile,
} from "@/app/types/qdf_containers";

export interface PanelRenderOptions {
    unitScale?: number; // mm → meters
}

/**
 * Render all panel2 parts from a parsed QDF file.
 * Panels attach to the nearest connector and use:
 *     worldRot = connectorQuat * localPanelQuat
 * Offset: panel is moved outward along its normal by half its width.
 */
export function renderPanels(
    parsed: QdfParsedFile,
    materials: Map<number, THREE.Material>,
    opts: PanelRenderOptions = {}
): THREE.Group {
    const scale = opts.unitScale ?? 1 / 1000; // mm → m
    const group = new THREE.Group();

    // --------------------------------------------------
    // 2. Render each panel
    // --------------------------------------------------
    for (const p of parsed.panels) {
        const width = p.dim1 * scale;   // panel width
        const height = p.dim3 * scale;  // panel height

        // Build basic geometry (centered plane)
        const geom = new THREE.BoxGeometry(width, height, 0.001);
        const mat =
            materials.get(p.id) ||
            new THREE.MeshStandardMaterial({
                color: 0x22aa33,
                side: THREE.DoubleSide
            });

        const mesh = new THREE.Mesh(geom, mat);

        mesh.position.set(p.position.x, p.position.y, p.position.z);

        mesh.quaternion.copy(p.quaternion);

        group.add(mesh);
    }

    return group;
}