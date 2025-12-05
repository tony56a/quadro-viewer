// lib/renderSlides.ts
import * as THREE from "three";
import { QdfParsedFile, QdfSlide } from "@/app/types/qdf_containers";

export interface SlideRenderOptions {
    unitScale?: number; // mm → meters
    // default size for slides when specific dims are not available
    defaultLength?: number; // along X (mm)
    defaultWidth?: number;  // along Y (mm)
    defaultDepth?: number;  // along Z (mm)
}

/**
 * Render slide2 parts from a parsed QDF file.
 * This is intentionally simple: slides often have small, fixed geometry.
 * The renderer accepts optional size overrides for cases where slide
 * geometry needs to be represented more accurately.
 */
export function renderSlides(
    parsed: QdfParsedFile,
    materials: Map<number, THREE.Material>,
    opts: SlideRenderOptions = {}
): THREE.Group {
    const scale = opts.unitScale ?? 1; // default mm → m
    const defaultLength = opts.defaultLength ?? 1400; // mm
    const defaultWidth = opts.defaultWidth ?? 350; // mm
    const defaultDepth = opts.defaultDepth ?? 4; // mm

    const group = new THREE.Group();

    for (const s of parsed.slides) {
        // Use material by materialId when available, otherwise a neutral material
        const mat =
            (s as QdfSlide).materialId !== undefined && materials.get((s as QdfSlide).id)
                ? materials.get((s as QdfSlide).id)!
                : new THREE.MeshStandardMaterial({ color: 0x999999 });

        // Map: length -> X, width -> Y, depth -> Z
        const lx = defaultLength * scale;
        const ly = (s as any).width ? (s as any).width * scale : defaultWidth * scale;
        const lz = defaultDepth * scale;

        const geom = new THREE.BoxGeometry(lx, ly, lz);

        // Create a local group for this slide
        const slideGroup = new THREE.Group();

        // Main slide mesh
        // OpenGL origin is at top-front-center, so offset the mesh to match
        // Y extends downward (negative), Z extends backward (positive)
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(0, -ly / 2, lz / 2);  // Shift to match OpenGL origin
        slideGroup.add(mesh);

        // Add side rails: each rail is 1/4 of the slide width and runs the full length
        const railThickness = ly / 8; // in world units (after scale)
        const railGeom = new THREE.BoxGeometry(lx, railThickness, railThickness);

        // Rails positioned relative to the OpenGL origin (top-front-center)
        const railLeft = new THREE.Mesh(railGeom, mat);
        railLeft.position.set(0, -ly, lz / 2);  // Same Y/Z as main mesh
        slideGroup.add(railLeft);

        const railRight = new THREE.Mesh(railGeom, mat);
        railRight.position.set(0, 0, lz / 2);
        slideGroup.add(railRight);

        // Apply transformation from QDF directly - no extra translations or rotations
        slideGroup.position.copy(s.position);
        slideGroup.quaternion.copy(s.quaternion);

        slideGroup.translateZ(defaultLength * 0.35 * scale);
        slideGroup.translateX(-defaultLength * 0.35 * scale);
        slideGroup.translateY(defaultLength * 0.16 * scale);
        slideGroup.rotateY(45 * Math.PI / 180); // Rotate to match OpenGL coord system

        group.add(slideGroup);
    }

    return group;
}

/**
 * Render slide-end2 components from a parsed QDF file.
 * Slide ends are rendered as simple boxes with defaultWidth x defaultWidth x defaultDepth dimensions.
 */
export function renderSlideEnds(
    parsed: QdfParsedFile,
    materials: Map<number, THREE.Material>,
    opts: SlideRenderOptions = {}
): THREE.Group {
    const scale = opts.unitScale ?? 1; // default mm → m
    const defaultWidth = opts.defaultWidth ?? 350; // mm
    const defaultDepth = opts.defaultDepth ?? 4; // mm

    const group = new THREE.Group();

    for (const se of parsed.slideEnds) {
        // Use material by materialId when available, otherwise a neutral material
        const mat =
            se.materialId !== undefined && materials.get(se.id)
                ? materials.get(se.id)!
                : new THREE.MeshStandardMaterial({ color: 0x999999 });

        // Create a box with width x width x depth dimensions
        const size = defaultWidth * scale;
        const depth = defaultDepth * scale;
        const geom = new THREE.BoxGeometry(size, size, depth);

        const slideEndGroup = new THREE.Group();

        // Position mesh with origin at top-front-center to match OpenGL convention
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(0, -size / 2, depth / 2);
        slideEndGroup.add(mesh);

        // Apply transformation from QDF directly
        slideEndGroup.position.copy(se.position);
        slideEndGroup.quaternion.copy(se.quaternion);

        // Apply additional transforms to match OpenGL coordinate system (same as renderSlides)
        slideEndGroup.translateZ(-defaultWidth * 0.75 * scale);
        slideEndGroup.translateX(defaultDepth * 2 * scale);
        slideEndGroup.translateY(defaultWidth * 0.5 * scale);
        slideEndGroup.rotateY(90 * Math.PI / 180);

        group.add(slideEndGroup);
    }

    return group;
}
