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

    /**
     * Create a 45-style connector: a central sphere, a rod extending along +X
     * for 60 units, and a second rod attached to the end of the first rod which
     * is rotated by 45 degrees. By default the second rod is rotated around the
     * Y axis (so it tilts in the XZ plane). If you want rotation about the X
     * axis instead, change the rotationAxis to (1,0,0).
     */
    const make45Connector = (conn: QdfConnector45) => {
        const group = new THREE.Group();

        const mat =
            materials.get(conn.id) ||
            new THREE.MeshStandardMaterial({ color: 0xcccccc });

        // Sphere at center (reuse sphere geometry)
        const sphereGeom = new THREE.SphereGeometry(radius * 0.9, 20, 20);
        const sphere = new THREE.Mesh(sphereGeom, mat);
        group.add(sphere);

        // First rod: along +X for 60 units
        const rodLength = 60; // units consistent with existing code (mm)
        const rodRadius = 14;
        const rodGeom = new THREE.CylinderGeometry(rodRadius, rodRadius, rodLength * 1.5, 16);
        const rod1 = new THREE.Mesh(rodGeom, mat);
        // Align cylinder to X axis (default is Y-up)
        rod1.rotation.z = Math.PI / 2;
        // Position so one end starts at sphere surface: center offset = radius + rodLength/2
        rod1.position.x = radius + rodLength / 2;
        group.add(rod1);

        // Second rod: attached at the end of first rod and rotated by 45 degrees
        const rod2 = new THREE.Mesh(rodGeom, mat);
        // Start by aligning along X like rod1
        rod2.rotation.z = Math.PI / 2;
        // Rotate rod2 by 45 degrees around Y axis so it angles in XZ plane
        const fortyFive = (45 * Math.PI) / 180;
        rod2.rotateZ(-fortyFive);
        // Compute the attachment point: end of first rod is at x = radius + rodLength
        const attachX = radius + rodLength;
        // After rotation, we need to position the rod center along its local X by rodLength/2
        // rod2 local X in world = (cos45, 0, sin45)
        const dx = Math.cos(fortyFive) * (rodLength / 2);
        const dz = Math.sin(fortyFive) * (rodLength / 2);
        // Combine the previous position and subsequent translations into a single position
        const finalX = attachX + dx - (rodLength / 2) + radius * 1.25;
        const finalY = radius;
        const finalZ = dz - radius;
        rod2.position.set(finalX, finalY, finalZ);

        // The above subtracts (rodLength/2) to account for the fact that rod1 was placed
        // using a simple x offset; ensure the second rod visually starts where the first ends.
        group.add(rod2);

        // Position and orientation for the whole group
        group.position.set(
            conn.orientation.x,
            conn.orientation.y,
            conn.orientation.z,
        );

        const q = new THREE.Quaternion(conn.quaternion.x, conn.quaternion.y, conn.quaternion.z, conn.quaternion.w);
        const zAxis = new THREE.Vector3(0, 0, -1);
        const zRotation = new THREE.Quaternion().setFromAxisAngle(zAxis, Math.PI / 2);

        group.quaternion.copy(q.multiply(zRotation).normalize());
        group.userData.connector = conn;

        return group;
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
                15, 15, 60, 16
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
        group.userData.connector = conn;

        return group;
    };


    // connector3
    for (const c of parsed.connectors) {
        group.add(makeConnector(c));
    }

    // connector45_2
    for (const c of parsed.connector45s) {
        // Use the 45-degree connector builder for connector45 types
        group.add(make45Connector(c));
    }

    return group;
}