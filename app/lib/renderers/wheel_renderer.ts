// lib/renderers/wheel_renderer.ts
import * as THREE from "three";
import { QdfParsedFile, QdfWheel } from "@/app/types/qdf_containers";

export interface WheelRenderOptions {
    unitScale?: number; // mm → meters
    axleRadius?: number; // mm
    axleLength?: number; // mm
    wheelRadius?: number; // mm
    wheelThickness?: number; // mm
}

/**
 * Render multi-wheel2 components from a parsed QDF file.
 * Based on the OpenGL render_tube_with_end_flanges function which renders
 * a cylindrical axle with wheel/flange structures at both ends.
 */
export function renderWheels(
    parsed: QdfParsedFile,
    materials: Map<number, THREE.Material>,
    opts: WheelRenderOptions = {}
): THREE.Group {
    const scale = opts.unitScale ?? 1; // default mm → m
    const axleRadius = (opts.axleRadius ?? 10) * scale;
    const axleLength = (opts.axleLength ?? 100) * scale;
    const wheelRadius = (opts.wheelRadius ?? 150) * scale;
    const wheelThickness = (opts.wheelThickness ?? 15) * scale;

    const group = new THREE.Group();

    for (const wheel of parsed.wheels) {
        // Use material by materialId when available, otherwise a neutral material
        const mat =
            wheel.materialId !== undefined && materials.get(wheel.id)
                ? materials.get(wheel.id)!
                : new THREE.MeshStandardMaterial({ color: 0x666666 });

        // Create a group for this wheel assembly
        const wheelGroup = new THREE.Group();

        // Create the axle (central cylinder)
        const axleGeometry = new THREE.CylinderGeometry(
            axleRadius,
            axleRadius,
            axleLength,
            16
        );
        // Rotate to align with X-axis (default cylinder is along Y-axis)
        axleGeometry.rotateZ(Math.PI / 2);
        const axle = new THREE.Mesh(axleGeometry, mat);
        wheelGroup.add(axle);

        // Create wheel/flange at left end
        const leftWheelGeometry = new THREE.CylinderGeometry(
            wheelRadius,
            wheelRadius,
            wheelThickness,
            32
        );
        leftWheelGeometry.rotateZ(Math.PI / 2);
        const leftWheel = new THREE.Mesh(leftWheelGeometry, mat);
        leftWheel.position.set(-axleLength / 2, 0, 0);
        wheelGroup.add(leftWheel);

        // Apply transformation from QDF
        wheelGroup.position.copy(wheel.position);
        wheelGroup.quaternion.copy(wheel.quaternion);

        wheelGroup.rotateZ(90 * Math.PI / 180); // Rotate to match OpenGL coord system
        group.add(wheelGroup);
    }

    return group;
}
