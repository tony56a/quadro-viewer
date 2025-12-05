import * as THREE from "three";
import { QdfMaterial } from "@/app/types/qdf_containers";

export function buildThreeMaterials(mats: QdfMaterial[]) {
    const map = new Map<number, THREE.Material>();

    for (const m of mats) {
        const mat = new THREE.MeshStandardMaterial({
            color: m.colorHex,
            metalness: m.meshStandard.metalness,
            roughness: m.meshStandard.roughness,
            opacity: m.meshStandard.opacity,
            transparent: m.meshStandard.transparent,
        });

        map.set(m.id, mat);
    }

    return map;
}