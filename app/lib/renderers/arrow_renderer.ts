import * as THREE from "three";

let connectorArrows: THREE.Object3D | null = null;

function clearConnectorArrows(scene: THREE.Scene) {
    if (connectorArrows) {
        scene.remove(connectorArrows);
        connectorArrows.traverse(obj => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) obj.material.dispose();
        });
        connectorArrows = null;
    }
}

function createConnectorArrows(position: THREE.Vector3): THREE.Object3D {
    const group = new THREE.Group();

    const length = 80;      // arrow length
    const headLength = 20;  // arrow head
    const headWidth = 10;

    const axes = [
        { dir: new THREE.Vector3(1, 0, 0), color: 0xff0000 }, // X
        { dir: new THREE.Vector3(0, 1, 0), color: 0x00ff00 }, // Y
        { dir: new THREE.Vector3(0, 0, 1), color: 0x0000ff }, // Z
    ];

    for (const a of axes) {
        const arrow = new THREE.ArrowHelper(
            a.dir.clone().normalize(),
            position,
            length,
            a.color,
            headLength,
            headWidth
        );
        group.add(arrow);
    }

    return group;
}