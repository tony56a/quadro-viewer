// components/ThreeCanvas.tsx
"use client";

import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';
import type { QdfParsedFile, QdfConnector3, QdfConnector45, QdfTube } from "@/app/types/qdf_containers";
import { buildThreeMaterials } from "@/app/lib/renderers/material_renderer";
import { renderConnectors } from "@/app/lib/renderers/connector_renderer";
import { renderTubes } from "@/app/lib/renderers/tube_renderer";
import { renderPanels } from "../lib/renderers/panel_renderer";
import { renderSlides, renderSlideEnds } from "../lib/renderers/slide_renderer";
import { renderWheels } from "../lib/renderers/wheel_renderer";

interface ThreeCanvasProps {
    parsedFile: QdfParsedFile | null;
    onSelectConnector?: (conn: (QdfParsedFile["connectors"][0] | QdfParsedFile["connector45s"][0] | QdfParsedFile["tubes"][0]) | null) => void;
}

function setGlow(
    mesh: THREE.Mesh | THREE.Group | null,
    currentGlowingRef: { current: THREE.Mesh | THREE.Group | null },
    originalMaterials: WeakMap<THREE.Mesh, THREE.Material>
): void {
    // Helper to recursively apply or restore glow on a mesh
    const applyGlowToMesh = (m: THREE.Mesh, shouldGlow: boolean) => {
        if (!m.material) return;

        if (shouldGlow) {
            // Turn ON glow
            originalMaterials.set(m, m.material as THREE.Material);
            if (Array.isArray(m.material)) {
                // skip multi-material
            } else {
                const glowMat = m.material.clone();
                (glowMat as any).emissive = new THREE.Color(0xFFffff);
                (glowMat as any).emissiveIntensity = 0.8;
                m.material = glowMat;
            }
        } else {
            // Turn OFF glow
            const original = originalMaterials.get(m);
            if (original) {
                m.material = original;
                originalMaterials.delete(m);
            }
        }
    };

    // 1) Turn OFF glow on previous one
    const currentGlowing = currentGlowingRef.current;
    if (currentGlowing && currentGlowing !== mesh) {
        // Restore material on the previously glowing mesh or group
        if (currentGlowing instanceof THREE.Group) {
            currentGlowing.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    applyGlowToMesh(child as THREE.Mesh, false);
                }
            });
        } else {
            applyGlowToMesh(currentGlowing, false);
        }
        currentGlowingRef.current = null;
    }

    // 2) If mesh is null, just clear and return
    if (!mesh) {
        currentGlowingRef.current = null;
        return;
    }

    // 3) Turn ON glow on the new one (traverse if it's a group, apply if it's a mesh)
    if (mesh instanceof THREE.Group) {
        mesh.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                applyGlowToMesh(child as THREE.Mesh, true);
            }
        });
        currentGlowingRef.current = mesh;
    } else {
        applyGlowToMesh(mesh, true);
        currentGlowingRef.current = mesh;
    }

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
    const currentGlowingRef = useRef<THREE.Mesh | THREE.Group | null>(null);

    const tubesGroupRef = useRef<THREE.Group | null>(null);
    const tubeBoxes: THREE.Box3[] = [];

    const panelGroupRef = useRef<THREE.Group | null>(null);
    const textileGroupRef = useRef<THREE.Group | null>(null);
    const slidesGroupRef = useRef<THREE.Group | null>(null);
    const slideEndsGroupRef = useRef<THREE.Group | null>(null);
    const wheelsGroupRef = useRef<THREE.Group | null>(null);
    const arrowGroupRef = useRef<THREE.Group | null>(null);
    const mainSceneGroupRef = useRef<THREE.Group | null>(null);
    const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
    const reticleRef = useRef<THREE.Mesh | null>(null);
    const modelPlacedRef = useRef<boolean>(false);

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

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x050505, 1);
        renderer.xr.enabled = true;
        container.appendChild(renderer.domElement);
        rendererRef.current = renderer;

        // Add AR button
        const arButton = ARButton.createButton(renderer, {
            requiredFeatures: ['hit-test'],
            optionalFeatures: ['dom-overlay'],
            domOverlay: { root: document.body }
        });
        container.appendChild(arButton);

        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Create a main group to hold all scene content (for scaling in AR)
        const mainSceneGroup = new THREE.Group();
        scene.add(mainSceneGroup);
        mainSceneGroupRef.current = mainSceneGroup;

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

        const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x222222, 0.9);
        mainSceneGroup.add(hemisphereLight);
        const dir = new THREE.DirectionalLight(0xffffff, 0.6);
        dir.position.set(300, 500, 300);
        mainSceneGroup.add(dir);

        const grid = new THREE.GridHelper(2, 40, 0x444444, 0x222222);
        mainSceneGroup.add(grid);

        // Create a reticle (placement indicator) for AR hit-testing
        const reticleGeometry = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
        const reticleMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
        const reticle = new THREE.Mesh(reticleGeometry, reticleMaterial);
        reticle.matrixAutoUpdate = false;
        reticle.visible = false;
        scene.add(reticle);
        reticleRef.current = reticle;

        // Handle XR session start/end for scaling and hit-test
        renderer.xr.addEventListener('sessionstart', async () => {
            // Scale down the entire scene by 1000 when entering AR
            mainSceneGroup.scale.setScalar(1 / 1000);

            // Reset model placement state
            modelPlacedRef.current = false;
            mainSceneGroup.visible = false; // Hide until placed
            reticle.visible = false;

            // Request hit-test source
            const session = renderer.xr.getSession();
            if (session && session.requestHitTestSource) {
                try {
                    const viewerSpace = await session.requestReferenceSpace('viewer');
                    const hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
                    if (hitTestSource) {
                        hitTestSourceRef.current = hitTestSource;
                    }
                } catch (err) {
                    console.error('Hit test not supported:', err);
                }
            }
        });

        renderer.xr.addEventListener('sessionend', () => {
            // Restore original scale when exiting AR
            mainSceneGroup.scale.setScalar(1);
            mainSceneGroup.visible = true;
            reticle.visible = false;

            // Clean up hit-test source
            if (hitTestSourceRef.current) {
                hitTestSourceRef.current.cancel();
                hitTestSourceRef.current = null;
            }
            modelPlacedRef.current = false;
        });

        const onResize = () => {
            if (!rendererRef.current || !cameraRef.current) return;
            const w = window.innerWidth;
            const h = window.innerHeight;
            cameraRef.current.aspect = w / h;
            cameraRef.current.updateProjectionMatrix();
            rendererRef.current.setSize(w, h);
        };

        window.addEventListener("resize", onResize);

        // Handle AR placement on select (tap/click in AR)
        const onSelect = () => {
            if (reticleRef.current && reticleRef.current.visible && !modelPlacedRef.current) {
                // Place the model at the reticle position
                mainSceneGroup.position.setFromMatrixPosition(reticleRef.current.matrix);
                mainSceneGroup.visible = true;
                modelPlacedRef.current = true;
                reticleRef.current.visible = false;
            }
        };

        // Use setAnimationLoop instead of requestAnimationFrame for XR compatibility
        renderer.setAnimationLoop((timestamp, frame) => {
            controls.update();

            // Handle hit-testing in AR
            if (frame && hitTestSourceRef.current && !modelPlacedRef.current) {
                const referenceSpace = renderer.xr.getReferenceSpace();
                if (referenceSpace) {
                    const hitTestResults = frame.getHitTestResults(hitTestSourceRef.current);

                    if (hitTestResults.length > 0) {
                        const hit = hitTestResults[0];
                        const pose = hit.getPose(referenceSpace);

                        if (pose && reticleRef.current) {
                            reticleRef.current.visible = true;
                            reticleRef.current.matrix.fromArray(pose.transform.matrix);
                        }
                    } else if (reticleRef.current) {
                        reticleRef.current.visible = false;
                    }
                }
            }

            renderer.render(scene, camera);
        });

        // Add select listener for AR placement
        const controller = renderer.xr.getController(0);
        controller.addEventListener('select', onSelect);
        scene.add(controller);

        return () => {
            renderer.setAnimationLoop(null); // Stop animation loop
            window.removeEventListener("resize", onResize);

            // Remove select listener
            const controller = renderer.xr.getController(0);
            controller.removeEventListener('select', onSelect);

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
        const mainSceneGroup = mainSceneGroupRef.current;
        if (!scene || !mainSceneGroup) return;

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
            mainSceneGroup.remove(connectorsGroupRef.current);
            connectorsGroupRef.current = null;
        }
        if (tubesGroupRef.current) {
            mainSceneGroup.remove(tubesGroupRef.current);
            tubesGroupRef.current = null;
        }
        if (panelGroupRef.current) {
            mainSceneGroup.remove(panelGroupRef.current);
            panelGroupRef.current = null;
        }
        if (textileGroupRef.current) {
            mainSceneGroup.remove(textileGroupRef.current);
            textileGroupRef.current = null;
        }
        if (slidesGroupRef.current) {
            mainSceneGroup.remove(slidesGroupRef.current);
            slidesGroupRef.current = null;
        }
        if (slideEndsGroupRef.current) {
            mainSceneGroup.remove(slideEndsGroupRef.current);
            slideEndsGroupRef.current = null;
        }
        if (wheelsGroupRef.current) {
            mainSceneGroup.remove(wheelsGroupRef.current);
            wheelsGroupRef.current = null;
        }

        // Clear arrow indicators (dispose their geometries/materials)
        clearArrowIndicators(scene);

        if (!parsedFile) return;

        const materialMap = buildThreeMaterials(parsedFile.materials);
        const connectorsGroup = renderConnectors(parsedFile, materialMap, {
            sphereRadius: 20, // mm
        });

        mainSceneGroup.add(connectorsGroup);
        connectorsGroupRef.current = connectorsGroup;

        const tubesGroup = renderTubes(parsedFile, materialMap, {
            tubeRadius: 10,   // mm
            unitScale: 1,
        });
        mainSceneGroup.add(tubesGroup);
        tubesGroupRef.current = tubesGroup;
        for (const tubeMesh of tubesGroup.children) {
            tubeMesh.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(tubeMesh);
            tubeBoxes.push(box);
        }

        const panelsGroup = renderPanels(parsedFile, materialMap, {
            unitScale: 1
        });
        mainSceneGroup.add(panelsGroup);
        panelGroupRef.current = panelsGroup;

        // Render textiles (use same renderer as panels, they share the same structure)
        const textilesParsed = {
            ...parsedFile,
            panels: parsedFile.textiles.map(t => ({ ...t, kind: "panel2" as const }))
        };
        const textileGroup = renderPanels(textilesParsed, materialMap, {
            unitScale: 1
        });
        mainSceneGroup.add(textileGroup);
        textileGroupRef.current = textileGroup;

        // Render slides (simple box representations). Use same unitScale as panels/tubes.
        const slidesGroup = renderSlides(parsedFile, materialMap, {
            unitScale: 1,
            defaultLength: 1050,
            defaultWidth: 350,
            defaultDepth: 20
        });
        mainSceneGroup.add(slidesGroup);
        slidesGroupRef.current = slidesGroup;

        // Render slide ends (simple box representations)
        const slideEndsGroup = renderSlideEnds(parsedFile, materialMap, {
            unitScale: 1,
            defaultWidth: 350,
            defaultDepth: 20
        });
        mainSceneGroup.add(slideEndsGroup);
        slideEndsGroupRef.current = slideEndsGroup;

        // Render wheels (multi-wheel2 components)
        const wheelsGroup = renderWheels(parsedFile, materialMap, {
            unitScale: 1,
            axleRadius: 10,
            axleLength: 50,
            wheelRadius: 150,
            wheelThickness: 15
        });
        mainSceneGroup.add(wheelsGroup);
        wheelsGroupRef.current = wheelsGroup;

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

            const intersects = raycaster.intersectObjects(targets, true);

            if (intersects.length > 0) {
                const first = intersects[0].object as THREE.Mesh;
                let targetMesh: THREE.Mesh;

                if (first.parent !== null && first.parent.userData.connector !== undefined) {
                    targetMesh = first.parent as THREE.Mesh;
                } else {
                    targetMesh = first as THREE.Mesh;
                }
                const conn = targetMesh.userData.connector as
                    | QdfConnector3
                    | QdfConnector45
                    | undefined;
                const tube = targetMesh.userData.tube as QdfTube | undefined;

                // Remove existing arrows
                //clearArrowIndicators(scene);

                setGlow(targetMesh, currentGlowingRef, originalMaterialsRef.current);

                if (conn && onSelectConnector) {

                    const connectorPos = new THREE.Vector3();
                    targetMesh.getWorldPosition(connectorPos);

                    /*
                    // Create new arrow group
                    const connectorArrows = createConnectorArrows(connectorPos, raycaster, tubesGroupRef.current!);

                    // Add to scene
                    scene.add(connectorArrows);
                    arrowGroupRef.current = connectorArrows;
                    */

                    onSelectConnector(conn as any);

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