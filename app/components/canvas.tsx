// components/ThreeCanvas.tsx
"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { QdfParsedFile, QdfConnector3, QdfConnector45, QdfTube } from "@/app/types/qdf_containers";
import { buildThreeMaterials } from "@/app/lib/renderers/material_renderer";
import { renderConnectors } from "@/app/lib/renderers/connector_renderer";
import { renderTubes } from "@/app/lib/renderers/tube_renderer";
import { renderPanels } from "../lib/renderers/panel_renderer";

interface ThreeCanvasProps {
    parsedFile: QdfParsedFile | null;
    onSelectConnector?: (conn: (QdfParsedFile["connectors"][0] | QdfParsedFile["connector45s"][0] | QdfParsedFile["tubes"][0]) | null) => void;
}

function setGlow(
    mesh: THREE.Mesh | null,
    currentGlowingRef: { current: THREE.Mesh | null },
    originalMaterials: WeakMap<THREE.Mesh, THREE.Material>
): void {
    // 1) Turn OFF glow on previous one
    const currentGlowing = currentGlowingRef.current;
    if (currentGlowing && currentGlowing !== mesh) {
        const original = originalMaterials.get(currentGlowing);
        if (original) {
            currentGlowing.material = original;
            originalMaterials.delete(currentGlowing);
        }
        currentGlowingRef.current = null;
    }

    // 2) If mesh is null, just clear and return
    if (!mesh) {
        currentGlowingRef.current = null;
        return;
    }

    // 3) Turn ON glow on the new one
    originalMaterials.set(mesh, mesh.material as THREE.Material);

    if (Array.isArray(mesh.material)) {
        // do nothing, no multi-material geometries exist
    } else {
        const glowMat = mesh.material.clone();
        (glowMat as any).emissive = new THREE.Color(0xFFffff);
        (glowMat as any).emissiveIntensity = 0.8;
        mesh.material = glowMat;
    }

    currentGlowingRef.current = mesh;

}

function createConnectorArrows(position: THREE.Vector3,
    raycaster: THREE.Raycaster,
    tubes: THREE.Group): THREE.Group {
    const group = new THREE.Group();

    const length = 200;      // arrow length
    const headLength = 60;  // arrow head
    const headWidth = 50;

    const axes = [
        { dir: new THREE.Vector3(1, 0, 0), color: 0xff0000 }, // X
        { dir: new THREE.Vector3(0, 1, 0), color: 0x00ff00 }, // Y
        { dir: new THREE.Vector3(0, 0, 1), color: 0x0000ff }, // Z

        { dir: new THREE.Vector3(-1, 0, 0), color: 0xff0000 }, // X
        { dir: new THREE.Vector3(0, -1, 0), color: 0x00ff00 }, // Y
        { dir: new THREE.Vector3(0, 0, -1), color: 0x0000ff }, // Z
    ];

    for (const def of axes) {
        const dir = def.dir.clone().normalize();

        // Raycast from the connector outward along this arrow direction
        raycaster.set(position, dir);
        const hits = raycaster.intersectObjects(tubes.children, true);

        let blocked = false;
        if (hits.length > 0) {
            const first = hits[0];
            if (first.distance <= length / 5) {
                blocked = true;
            }
        }

        if (!blocked) {
            const arrow = new THREE.ArrowHelper(
                dir,
                position,
                length,
                def.color,
                headLength,
                headWidth
            );
            group.add(arrow);
        }
    }

    return group;
}

const ThreeCanvas: React.FC<ThreeCanvasProps> = ({ parsedFile, onSelectConnector }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const connectorsGroupRef = useRef<THREE.Group | null>(null);

    const originalMaterialsRef = useRef<WeakMap<THREE.Mesh, THREE.Material>>(new WeakMap());
    const currentGlowingRef = useRef<THREE.Mesh | null>(null);

    const tubesGroupRef = useRef<THREE.Group | null>(null);
    const tubeBoxes: THREE.Box3[] = [];

    const panelGroupRef = useRef<THREE.Group | null>(null);
    const arrowGroupRef = useRef<THREE.Group | null>(null);

    const clearArrowIndicators = (scene: THREE.Scene) => {
        if (arrowGroupRef.current) {
            scene.remove(arrowGroupRef.current);
            arrowGroupRef.current.traverse(function (object) {
                // Narrow the object to THREE.Mesh for TypeScript so geometry/material are accessible
                if ((object as THREE.Mesh).isMesh) {
                    const mesh = object as THREE.Mesh;

                    // Dispose of geometry
                    if (mesh.geometry) {
                        mesh.geometry.dispose();
                    }

                    // Dispose of material(s)
                    if (mesh.material) {
                        if (Array.isArray(mesh.material)) {
                            mesh.material.forEach(function (material) {
                                material.dispose();
                                // Dispose of textures if they exist on the material
                                if ((material as any).map) (material as any).map.dispose();
                                if ((material as any).lightMap) (material as any).lightMap.dispose();
                            });
                        } else {
                            mesh.material.dispose();
                            if ((mesh.material as any).map) (mesh.material as any).map.dispose();
                        }
                    }
                }
            });
            arrowGroupRef.current = null;
        }
    }

    useEffect(() => {
        if (!containerRef.current) return;

        const container = containerRef.current;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x050505, 1);
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        const camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            90000,
        );
        camera.position.set(600, 400, 600);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 0.9));
        const dir = new THREE.DirectionalLight(0xffffff, 0.6);
        dir.position.set(300, 500, 300);
        scene.add(dir);

        const grid = new THREE.GridHelper(2, 40, 0x444444, 0x222222);
        scene.add(grid);

        const onResize = () => {
            if (!rendererRef.current || !cameraRef.current) return;
            const w = window.innerWidth;
            const h = window.innerHeight;
            cameraRef.current.aspect = w / h;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(w, h);
        };

        window.addEventListener("resize", onResize);

        let animId: number;
        const animate = () => {
            animId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener("resize", onResize);

            // Restore any glow before disposing renderer/scene so original materials aren't lost
            try {
                setGlow(null, currentGlowingRef, originalMaterialsRef.current);
            } catch (e) {
                // ignore
            }

            controls.dispose();
            renderer.dispose();
            scene.clear();
            container.removeChild(renderer.domElement);
        };
    }, []);

    // 🔥 React to new parsedFile — rebuild connector balls
    useEffect(() => {
        const scene = sceneRef.current;
        if (!scene) return;

        // Restore any glow on a selected mesh before we remove/dispose meshes
        try {
            setGlow(null, currentGlowingRef, originalMaterialsRef.current);
        } catch (e) {
            // ignore errors during cleanup
            // (defensive: setGlow is lightweight and should not throw)
            // console.warn("setGlow cleanup failed:", e);
        }

        // Remove old connectors/groups
        if (connectorsGroupRef.current) {
            scene.remove(connectorsGroupRef.current);
            connectorsGroupRef.current = null;
        }
        if (tubesGroupRef.current) {
            scene.remove(tubesGroupRef.current);
            tubesGroupRef.current = null;
        }
        if (panelGroupRef.current) {
            scene.remove(panelGroupRef.current);
            panelGroupRef.current = null;
        }

        // Clear arrow indicators (dispose their geometries/materials)
        clearArrowIndicators(scene);

        if (!parsedFile) return;

        const materialMap = buildThreeMaterials(parsedFile.materials);
        const connectorsGroup = renderConnectors(parsedFile, materialMap, {
            sphereRadius: 50, // mm
        });

        scene.add(connectorsGroup);
        connectorsGroupRef.current = connectorsGroup;

        const tubesGroup = renderTubes(parsedFile, materialMap, {
            tubeRadius: 10,   // mm
            unitScale: 1,
        });
        scene.add(tubesGroup);
        tubesGroupRef.current = tubesGroup;
        for (const tubeMesh of tubesGroup.children) {
            tubeMesh.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(tubeMesh);
            tubeBoxes.push(box);
        }

        const panelsGroup = renderPanels(parsedFile, materialMap, {
            unitScale: 1
        });
        scene.add(panelsGroup);
        panelGroupRef.current = panelsGroup;

    }, [parsedFile]);

    // 🔍 Click picking
    useEffect(() => {
        const container = containerRef.current;
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const renderer = rendererRef.current;

        if (!container || !scene || !camera || !renderer) return;

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        const handleClick = (event: MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
            const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
            pointer.set(x, y);

            raycaster.setFromCamera(pointer, camera);

            const targets: THREE.Object3D[] = [];
            if (connectorsGroupRef.current) {
                // Raycast against all children of the connectors group
                targets.push(...connectorsGroupRef.current.children);
            }
            if (tubesGroupRef.current) {
                targets.push(...tubesGroupRef.current.children);
            }

            const intersects = raycaster.intersectObjects(targets, false);

            if (intersects.length > 0) {
                const first = intersects[0].object as THREE.Mesh;
                const conn = first.userData.connector as
                    | QdfConnector3
                    | QdfConnector45
                    | undefined;
                const tube = first.userData.tube as QdfTube | undefined;

                // Remove existing arrows
                //clearArrowIndicators(scene);

                setGlow(first, currentGlowingRef, originalMaterialsRef.current);

                if (conn && onSelectConnector) {

                    const connectorPos = new THREE.Vector3();
                    first.getWorldPosition(connectorPos);

                    // Count tubes that intersect with a sphere based on the connector mesh
                    let intersectCount = 0;
                    try {
                        const tubesGroup = tubesGroupRef.current;

                        // Derive an effective sphere radius from the connector mesh's geometry
                        let localRadius = 0;
                        const geom = (first.geometry as THREE.BufferGeometry | undefined) ?? undefined;
                        if (geom) {
                            if (!geom.boundingSphere) geom.computeBoundingSphere();
                            localRadius = geom.boundingSphere?.radius ?? 0;
                        }
                        const effectiveRadius = localRadius + 30; // reuse connector size + margin
                        const sphere = new THREE.Sphere(connectorPos.clone(), effectiveRadius);

                        if (tubesGroup) {
                            for (const tubeMesh of tubesGroup.children) {
                                const box = new THREE.Box3().setFromObject(tubeMesh as THREE.Object3D);
                                if (box.intersectsSphere(sphere)) {
                                    intersectCount++;
                                }
                            }
                        }
                    } catch (err) {
                        console.error("Error computing nearby tube intersections:", err);
                    }

                    // Merge the nearbyTubeCount into the connector object we pass back so UI can show it
                    const connWithCount = Object.assign({}, conn, { nearbyTubeCount: intersectCount });
                    onSelectConnector(connWithCount as any);

                    // attach to the picked mesh userData too for convenience
                    (first.userData as any).nearbyTubeCount = intersectCount;

                    /*
                    // Create new arrow group
                    const connectorArrows = createConnectorArrows(connectorPos, raycaster, tubesGroupRef.current!);

                    // Add to scene
                    scene.add(connectorArrows);
                    arrowGroupRef.current = connectorArrows;
                    */

                } else if (tube && onSelectConnector) {
                    // reuse same callback & bubble, but feed tube data
                    onSelectConnector(tube as any); // or make a broader onSelect callback type later
                }
            } else {
                clearArrowIndicators(scene);
                setGlow(null, currentGlowingRef, originalMaterialsRef.current);
                if (onSelectConnector) {
                    onSelectConnector(null);
                }
            }
        };

        renderer.domElement.addEventListener("click", handleClick);

        return () => {
            renderer.domElement.removeEventListener("click", handleClick);
        };
    }, [onSelectConnector]);

    return <div ref={containerRef} className="app-canvas-container" />;
};

export default ThreeCanvas;