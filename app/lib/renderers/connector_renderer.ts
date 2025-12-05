// lib/renderConnectors.ts
import * as THREE from "three";
import { QdfParsedFile, QdfConnector3, QdfConnector45 } from "@/app/types/qdf_containers";

export interface ConnectorRenderOptions {
    sphereRadius?: number;   // mm → convert to meters if needed
}

function decodeQdfQuaternion(ori: any): THREE.Quaternion {
    const q = new THREE.Quaternion(ori.b, ori.c, ori.d, ori.a);
    return q.normalize();
}

/** Create a Three.Group containing spheres for all connectors. */
export function renderConnectors(
    parsed: QdfParsedFile,
    materials: Map<number, THREE.Material>,
    opts: ConnectorRenderOptions = {}
): THREE.Group {
    const radius = opts.sphereRadius ?? 5; // QDF units are mm

    const group = new THREE.Group();

    const makeSphere = (conn: QdfConnector3 | QdfConnector45) => {
        const mat =
            materials.get(conn.id) ||
            new THREE.MeshStandardMaterial({ color: 0xcccccc });

        const geom = new THREE.SphereGeometry(radius, 20, 20);
        const mesh = new THREE.Mesh(geom, mat);

        // QDF is in millimeters; convert to meters
        mesh.position.set(
            conn.orientation.x,
            conn.orientation.y,
            conn.orientation.z,
        );

        // Orientation: align cylinder Y axis with (a, b, c)
        const q = decodeQdfQuaternion(
            conn.orientation
        );

        mesh.quaternion.copy(q);

        mesh.rotateZ(THREE.MathUtils.degToRad(90));
        mesh.userData.connector = conn;

        return mesh;
    };

    // connector3
    for (const c of parsed.connectors) {
        group.add(makeSphere(c));
    }

    // connector45_2
    for (const c of parsed.connector45s) {
        group.add(makeSphere(c));
    }

    return group;
}