// lib/renderConnectors.ts
import * as THREE from "three";
import { QdfParsedFile, QdfConnector3, QdfConnector45 } from "@/app/types/qdf_containers";

export interface ConnectorRenderOptions {
    sphereRadius?: number;   // mm → convert to meters if needed
}

/** Create a Three.Group containing spheres for all connectors. */
export function renderConnectors(
    parsed: QdfParsedFile,
    materials: Map<number, THREE.Material>,
    opts: ConnectorRenderOptions = {}
): THREE.Group {
    const radius = opts.sphereRadius ?? 5; // QDF units are mm

    const group = new THREE.Group();

    const getTubeDirections = (connector: QdfConnector3): THREE.Vector3[] => {
        const directions: THREE.Vector3[] = [];

        if ((connector.variant2 & 0x01) !== 0) {
            directions.push(new THREE.Vector3(1, 0, 0));
        }
        if ((connector.variant2 & 0x02) !== 0) {
            directions.push(new THREE.Vector3(-1, 0, 0));
        }
        if ((connector.variant2 & 0x04) !== 0) {
            directions.push(new THREE.Vector3(0, 1, 0));
        }
        if ((connector.variant2 & 0x08) !== 0) {
            directions.push(new THREE.Vector3(0, -1, 0));
        }
        if ((connector.variant2 & 0x10) !== 0) {
            directions.push(new THREE.Vector3(0, 0, 1));
        }
        if ((connector.variant2 & 0x20) !== 0) {
            directions.push(new THREE.Vector3(0, 0, -1));
        }

        return directions;
    }

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

        mesh.quaternion.copy(conn.quaternion);

        mesh.userData.connector = conn;

        return mesh;
    };

    const makeConnector = (conn: QdfConnector3) => {
        const group = new THREE.Group();

        const mat =
            materials.get(conn.id) ||
            new THREE.MeshStandardMaterial({ color: 0xcccccc });

        const directions = getTubeDirections(conn as QdfConnector3);

        const geom = new THREE.SphereGeometry(radius, 20, 20);
        const mesh = new THREE.Mesh(geom, mat);
        group.add(mesh);

        directions.forEach(dir => {
            const armGeometry = new THREE.CylinderGeometry(
                10, 10, 40, 16
            );
            const arm = new THREE.Mesh(armGeometry, mat);

            // Rotate cylinder to point in the correct direction
            // Default cylinder is Y-up, so rotate to align with direction
            if (dir.x !== 0) {
                arm.rotation.z = Math.PI / 2;
                arm.position.x = dir.x * (40 / 2 + 2);
            } else if (dir.y !== 0) {
                arm.position.y = dir.y * (40 / 2 + 2);
            } else if (dir.z !== 0) {
                arm.rotation.x = Math.PI / 2;
                arm.position.z = dir.z * (40 / 2 + 2);
            }

            group.add(arm);
        });

        // QDF is in millimeters; convert to meters
        group.position.set(
            conn.orientation.x,
            conn.orientation.y,
            conn.orientation.z,
        );

        const q = new THREE.Quaternion(conn.quaternion.x, conn.quaternion.y, conn.quaternion.z, conn.quaternion.w);

        const zAxis = new THREE.Vector3(0, 0, -1);
        const zRotation = new THREE.Quaternion().setFromAxisAngle(zAxis, Math.PI / 2);
        group.quaternion.copy(q.multiply(zRotation).normalize());
        group.renderOrder = 1
        group.userData.connector = conn;

        return group;
    };


    // connector3
    for (const c of parsed.connectors) {
        group.add(makeConnector(c));
    }

    // connector45_2
    for (const c of parsed.connector45s) {
        group.add(makeSphere(c));
    }

    return group;
}