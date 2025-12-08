// lib/qdfParser.ts
import {
    QdfParsedFile,
    QdfOrientation,
    QdfConnector3,
    QdfConnector45,
    QdfTube,
    QdfPanel,
    QdfDisplayPanel,
    QdfTextile,
    QdfClamp,
    QdfSlide,
    QdfSlideEnd,
    QdfWheel,
    QdfMaterial,
    QdfGeometry,
    QdfConnectorKind,
} from "@/app/types/qdf_containers";
import {
    decodeQdfQuaternion,
    addHalfTubeOffset
} from "@/app/lib/qdf_transform_utils";
import * as THREE from "three";


function parseOrientationBlock(block: string): QdfOrientation | null {
    // block is like "{a, b, c, d, x, y, z}"
    const stripped = block.replace(/[{}]/g, "");
    const parts = stripped
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

    if (parts.length < 7) return null;

    const nums = parts.slice(0, 7).map((v) => parseFloat(v));
    if (nums.some((n) => Number.isNaN(n))) return null;

    const [a, b, c, d, x, y, z] = nums;
    return { a, b, c, d, x, y, z };
}

function extractInnerBraceBlock(content: string): {
    before: string;
    block: string | null;
    after: string;
} {
    const start = content.indexOf("{");
    if (start === -1) return { before: content, block: null, after: "" };

    let depth = 0;
    let end = -1;
    for (let i = start; i < content.length; i++) {
        const ch = content[i];
        if (ch === "{") depth++;
        if (ch === "}") {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }

    if (end === -1) {
        return { before: content, block: null, after: "" };
    }

    const before = content.slice(0, start);
    const block = content.slice(start, end + 1);
    const after = content.slice(end + 1);
    return { before, block, after };
}

function splitCommaParams(s: string): string[] {
    return s
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
}

// Split top-level CSV-like fields, respecting quoted strings.
function splitCsvRespectQuotes(s: string): string[] {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
            current += ch;
        } else if (ch === "," && !inQuotes) {
            result.push(current.trim());
            current = "";
        } else {
            current += ch;
        }
    }

    if (current.trim().length > 0) {
        result.push(current.trim());
    }

    return result;
}

function parseMaterialLine(line: string): QdfMaterial | null {
    const start = line.indexOf("{");
    const end = line.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;

    const content = line.slice(start + 1, end).trim();
    const fields = splitCsvRespectQuotes(content);

    if (fields.length < 16) {
        return null;
    }

    const parseIntField = (idx: number): number =>
        parseInt(fields[idx], 10);
    const parseFloatField = (idx: number): number =>
        parseFloat(fields[idx]);

    const id = parseIntField(0);

    const rawName = fields[1];
    const name =
        rawName.startsWith('"') && rawName.endsWith('"')
            ? rawName.slice(1, -1)
            : rawName;

    const materialType = parseIntField(2);

    const r1 = parseFloatField(3);
    const g1 = parseFloatField(4);
    const b1 = parseFloatField(5);

    const flags = parseIntField(fields.length - 1);

    // For now we treat linearColor≈sRGB; you can add gamma if needed.
    const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
    const lr = clamp01(r1);
    const lg = clamp01(g1);
    const lb = clamp01(b1);

    const sr = lr;
    const sg = lg;
    const sb = lb;

    const to255 = (v: number) => Math.round(v * 255);
    const colorHex =
        (to255(sr) << 16) | (to255(sg) << 8) | to255(sb);

    const material: QdfMaterial = {
        kind: "material3",
        id,
        name,
        materialType,
        linearColor: { r: lr, g: lg, b: lb },
        srgbColor: { r: sr, g: sg, b: sb },
        colorHex,
        meshStandard: {
            color: colorHex,
            metalness: 0.0,
            roughness: 0.4,
            opacity: 1.0,
            transparent: false,
        },
        flags,
    };

    return material;
}

// helpers for connector kind determination

function countConnectorBits(n: number): number {
    let count = 0;
    while (n) {
        count += n & 1;
        n >>= 1;
    }
    return count;
}

function isStraight(bitmask: number): boolean {
    // Check if exactly one axis has both directions set
    const xAxis = (bitmask & 0x03) === 0x03; // bits 0,1
    const yAxis = (bitmask & 0x0C) === 0x0C; // bits 2,3
    const zAxis = (bitmask & 0x30) === 0x30; // bits 4,5

    return (xAxis && !yAxis && !zAxis) ||
        (!xAxis && yAxis && !zAxis) ||
        (!xAxis && !yAxis && zAxis);
}

function isCornerConnector(bitmask: number): boolean {
    // Corner connector: exactly one direction per axis
    const xBits = bitmask & 0x03; // +X and -X
    const yBits = bitmask & 0x0C; // +Y and -Y
    const zBits = bitmask & 0x30; // +Z and -Z

    // Each axis should have exactly one bit set (not both, not neither)
    const xCount = countConnectorBits(xBits);
    const yCount = countConnectorBits(yBits);
    const zCount = countConnectorBits(zBits);

    const totalConnections = xCount + yCount + zCount;

    // For 2-way: two axes with 1 connection each, one axis with 0
    // For 3-way: all three axes with 1 connection each
    if (totalConnections === 2) {
        return (xCount <= 1 && yCount <= 1 && zCount <= 1) &&
            ((xCount === 0) || (yCount === 0) || (zCount === 0));
    }

    if (totalConnections === 3) {
        return xCount === 1 && yCount === 1 && zCount === 1;
    }

    return false;
}

function isCrossConnector(bitmask: number): boolean {
    // Cross connector: missing connectors on 1 axis
    const xBits = bitmask & 0x03; // +X and -X
    const yBits = bitmask & 0x0C; // +Y and -Y
    const zBits = bitmask & 0x30; // +Z and -Z

    // Each axis should have exactly one bit set (not both, not neither)
    const xCount = countConnectorBits(xBits);
    const yCount = countConnectorBits(yBits);
    const zCount = countConnectorBits(zBits);

    const totalConnections = xCount + yCount + zCount;

    // For 2-way: two axes with 1 connection each, one axis with 0
    // For 3-way: all three axes with 1 connection each
    return (xCount == 0 && yCount > 0 && zCount > 0) ||
        (yCount == 0 && xCount > 0 && zCount > 0) ||
        (zCount == 0 && xCount > 0 && yCount > 0);
}

function getConnectorCategory(bitmask: number): QdfConnectorKind {
    // Count number of set bits
    const connectionCount = countConnectorBits(bitmask);

    switch (connectionCount) {
        case 0:
        case 1:
            return QdfConnectorKind.INVALID;

        case 2:
            // Check if opposite directions (straight) or perpendicular (elbow/corner)
            return isStraight(bitmask)
                ? QdfConnectorKind.STRAIGHT
                : QdfConnectorKind.L_CONNECTOR

        case 3:
            // Check if corner (3 perpendicular) or T-junction
            return isCornerConnector(bitmask)
                ? QdfConnectorKind.CORNER_CONNECTOR
                : QdfConnectorKind.T_CONNECTOR;

        case 4:
            return isCrossConnector(bitmask) ? QdfConnectorKind.CROSS_CONNECTOR : QdfConnectorKind.FOUR_WAY_CONNECTOR;

        case 5:
            return QdfConnectorKind.FIVE_WAY_CONNECTOR;

        case 6:
            return QdfConnectorKind.HUB_CONNECTOR;

        default:
            return QdfConnectorKind.INVALID;
    }
}

// --- Per-geometry parsers ---


function parseConnector3Line(line: string): QdfConnector3 | null {
    const start = line.indexOf("{");
    const end = line.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const content = line.slice(start + 1, end).trim();

    const { before, block, after } = extractInnerBraceBlock(content);
    if (!block) return null;

    const orientation = parseOrientationBlock(block);
    if (!orientation) return null;

    const idStr = before.split(",")[0].trim();
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) return null;

    const params = splitCommaParams(after);
    if (params.length < 6) return null;

    const colorId = parseInt(params[0], 10);
    const rotationIndex = parseInt(params[1], 10);
    const connectorType = parseInt(params[2], 10);
    const gridJ = parseInt(params[3], 10);
    const flags = parseInt(params[4], 10);
    const reserved = parseInt(params[5], 10);

    // Optional render range fields (last two numbers if present)
    let renderRangeStart: number | undefined;
    let renderRangeEnd: number | undefined;

    if (params.length >= 7) {
        renderRangeStart = parseInt(params[6], 10);
    }
    if (params.length >= 8) {
        renderRangeEnd = parseInt(params[7], 10);
    }

    const positionVector = new THREE.Vector3(orientation.x, orientation.y, orientation.z);
    const quaternion = decodeQdfQuaternion(
        orientation);

    const connectorKind = getConnectorCategory(connectorType);

    // Reject connectors with render range restrictions (only render "always visible" objects)
    if (renderRangeStart !== undefined) {
        return null;
    }

    return {
        kind: "connector3",
        id,
        orientation,
        position: positionVector,
        quaternion: quaternion,
        colorId: colorId,
        variant1: rotationIndex,
        variant2: connectorType,
        variant3: gridJ,
        variant4: flags,
        connectorKind: connectorKind,
        reserved,
        renderRangeStart,
        renderRangeEnd,
    };
}

function parseConnector45Line(line: string): QdfConnector45 | null {
    const start = line.indexOf("{");
    const end = line.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const content = line.slice(start + 1, end).trim();

    const { before, block, after } = extractInnerBraceBlock(content);
    if (!block) return null;

    const orientation = parseOrientationBlock(block);
    if (!orientation) return null;

    const idStr = before.split(",")[0].trim();
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) return null;

    const params = splitCommaParams(after);
    if (params.length < 3) return null;

    const connectorType = parseInt(params[0], 10);
    const flag1 = parseInt(params[1], 10);
    const flag2 = parseInt(params[2], 10);

    // Optional render range fields
    let renderRangeStart: number | undefined;
    let renderRangeEnd: number | undefined;

    if (params.length >= 4) {
        renderRangeStart = parseInt(params[3], 10);
    }
    if (params.length >= 5) {
        renderRangeEnd = parseInt(params[4], 10);
    }

    const positionVector = new THREE.Vector3(orientation.x, orientation.y, orientation.z);
    const quaternion = decodeQdfQuaternion(
        orientation);

    // Reject connectors with render range restrictions (only render "always visible" objects)
    if (renderRangeStart !== undefined) {
        return null;
    }

    return {
        kind: "connector45_2",
        id,
        orientation,
        position: positionVector,
        quaternion: quaternion,
        connectorType,
        connectorKind: QdfConnectorKind.FOURTY_FIVE_DEGREE_CONNECTOR,
        flag1,
        flag2,
        renderRangeStart,
        renderRangeEnd,
    };
}

function parseTubeLine(line: string): QdfTube | null {
    const start = line.indexOf("{");
    const end = line.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const content = line.slice(start + 1, end).trim();

    const { before, block, after } = extractInnerBraceBlock(content);
    if (!block) return null;

    const orientation = parseOrientationBlock(block);
    if (!orientation) return null;

    const idStr = before.split(",")[0].trim();
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) return null;

    const params = splitCommaParams(after);
    if (params.length < 4) return null;

    const materialId = parseInt(params[0], 10);
    const dim1 = parseFloat(params[1]);
    const dim2 = parseFloat(params[2]);
    const dim3 = parseFloat(params[3]);

    // Optional render range fields
    let renderRangeStart: number | undefined;
    let renderRangeEnd: number | undefined;

    if (params.length >= 5) {
        renderRangeStart = parseInt(params[4], 10);
    }
    if (params.length >= 6) {
        renderRangeEnd = parseInt(params[5], 10);
    }

    const quaternion = decodeQdfQuaternion(
        orientation);
    const offset = addHalfTubeOffset(dim1, 1, quaternion);

    const positionVector = new THREE.Vector3(orientation.x, orientation.y, orientation.z);
    positionVector.add(offset);

    // Reject tubes with render range restrictions (only render "always visible" objects)
    if (renderRangeStart !== undefined) {
        return null;
    }

    return {
        kind: "tube2",
        id,
        orientation,
        position: positionVector,
        quaternion: quaternion,
        materialId,
        length: dim1,
        dim2,
        dim3,
        renderRangeStart,
        renderRangeEnd,
    };
}

function parsePanelLike(
    line: string,
    kind: "panel2" | "display2" | "textil2",
): QdfPanel | QdfDisplayPanel | QdfTextile | null {
    const start = line.indexOf("{");
    const end = line.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const content = line.slice(start + 1, end).trim();

    const { before, block, after } = extractInnerBraceBlock(content);
    if (!block) return null;

    const orientation = parseOrientationBlock(block);
    if (!orientation) return null;

    const idStr = before.split(",")[0].trim();
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) return null;

    const params = splitCommaParams(after);
    if (params.length < 6) return null;

    const materialId = parseInt(params[0], 10);
    const dim1 = parseFloat(params[1]);
    const dim2 = parseFloat(params[2]);
    const dim3 = parseFloat(params[3]);
    const offset1 = parseFloat(params[4]);
    const offset2 = parseFloat(params[5]);

    // Optional render range fields
    let renderRangeStart: number | undefined;
    let renderRangeEnd: number | undefined;

    if (params.length >= 7) {
        renderRangeStart = parseInt(params[6], 10);
    }
    if (params.length >= 8) {
        renderRangeEnd = parseInt(params[7], 10);
    }

    const q = decodeQdfQuaternion(
        orientation
    );
    const positionVector = new THREE.Vector3(orientation.x, orientation.y, orientation.z);

    // Reject panels with render range restrictions (only render "always visible" objects)
    if (renderRangeStart !== undefined) {
        return null;
    }

    const base = {
        id,
        orientation,
        position: positionVector,
        quaternion: q,
        materialId,
        dim1,
        dim2,
        dim3,
        offset1,
        offset2,
        renderRangeStart,
        renderRangeEnd,
    };

    if (kind === "panel2") {
        return { kind, ...base } as QdfPanel;
    } else if (kind === "display2") {
        return { kind, ...base } as QdfDisplayPanel;
    } else {
        return { kind, ...base } as QdfTextile;
    }
}

function parseClampLike(
    line: string,
    kind: "clamp2" | "slide2" | "slide-end2" | "multi-wheel2",
): QdfClamp | QdfSlide | QdfSlideEnd | QdfWheel | null {
    const start = line.indexOf("{");
    const end = line.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    const content = line.slice(start + 1, end).trim();

    const { before, block, after } = extractInnerBraceBlock(content);
    if (!block) return null;

    const orientation = parseOrientationBlock(block);
    if (!orientation) return null;

    const idStr = before.split(",")[0].trim();
    const id = parseInt(idStr, 10);
    if (Number.isNaN(id)) return null;

    const params = splitCommaParams(after);
    if (params.length < 2) return null;

    const materialId = parseInt(params[0], 10);
    const flag = parseInt(params[1], 10);

    // Optional render range fields
    let renderRangeStart: number | undefined;
    let renderRangeEnd: number | undefined;

    if (params.length >= 3) {
        renderRangeStart = parseInt(params[2], 10);
    }
    if (params.length >= 4) {
        renderRangeEnd = parseInt(params[3], 10);
    }

    const q = decodeQdfQuaternion(
        orientation
    );

    const positionVector = new THREE.Vector3(orientation.x, orientation.y, orientation.z);

    // Reject clamps/slides/wheels with render range restrictions (only render "always visible" objects)
    if (renderRangeStart !== undefined) {
        return null;
    }

    const base = {
        id,
        orientation,
        position: positionVector,
        quaternion: q,

        materialId,
        flag,
        renderRangeStart,
        renderRangeEnd,
    };

    if (kind === "clamp2") {
        return { kind, ...base } as QdfClamp;
    } else if (kind === "slide-end2") {
        return { kind, ...base } as QdfSlideEnd;
    } else if (kind === "multi-wheel2") {
        return { kind, ...base } as QdfWheel;
    } else {
        return { kind, ...base } as QdfSlide;
    }
}

// --- Main entrypoint ---

export function parseQdf(text: string): QdfParsedFile {
    const lines = text.split(/\r?\n/);

    const materials: QdfMaterial[] = [];
    const geometries: QdfGeometry[] = [];

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        if (line.startsWith("0,") && line.endsWith(";")) continue; // header
        if (line.startsWith("//") || line.startsWith("#")) continue;

        if (line.startsWith("material3")) {
            const mat = parseMaterialLine(line);
            if (mat) materials.push(mat);
            continue;
        }

        if (line.startsWith("connector3")) {
            const c = parseConnector3Line(line);
            if (c) geometries.push(c);
            continue;
        }

        if (line.startsWith("connector45_2")) {
            const c45 = parseConnector45Line(line);
            if (c45) geometries.push(c45);
            continue;
        }

        if (line.startsWith("tube2")) {
            const t = parseTubeLine(line);
            if (t) geometries.push(t);
            continue;
        }

        if (line.startsWith("panel2")) {
            const p = parsePanelLike(line, "panel2");
            if (p) geometries.push(p);
            continue;
        }

        if (line.startsWith("display2")) {
            const p = parsePanelLike(line, "display2");
            if (p) geometries.push(p);
            continue;
        }

        if (line.startsWith("textil2")) {
            const p = parsePanelLike(line, "textil2");
            if (p) geometries.push(p);
            continue;
        }

        if (line.startsWith("clamp2")) {
            const c = parseClampLike(line, "clamp2");
            if (c) geometries.push(c);
            continue;
        }

        if (line.startsWith("slide2")) {
            const s = parseClampLike(line, "slide2");
            if (s) {
                geometries.push(s);
            }
            continue;
        }

        // Some QDF variants use `slide-new2` as the slide record name; treat it the same as `slide2`.
        if (line.startsWith("slide-new2")) {
            const s = parseClampLike(line, "slide2");
            if (s) geometries.push(s);
            continue;
        }

        if (line.startsWith("slide-end2")) {
            const se = parseClampLike(line, "slide-end2");
            if (se) geometries.push(se);
            continue;
        }

        if (line.startsWith("multi-wheel2")) {
            const w = parseClampLike(line, "multi-wheel2");
            if (w) geometries.push(w);
            continue;
        }

        // ignore camera2 and anything else for now
    }

    // Split geometry arrays by kind for convenience
    const connectors: QdfConnector3[] = [];
    const connector45s: QdfConnector45[] = [];
    const tubes: QdfTube[] = [];
    const panels: QdfPanel[] = [];
    const displayPanels: QdfDisplayPanel[] = [];
    const textiles: QdfTextile[] = [];
    const clamps: QdfClamp[] = [];
    const slides: QdfSlide[] = [];
    const slideEnds: QdfSlideEnd[] = [];
    const wheels: QdfWheel[] = [];

    for (const g of geometries) {
        switch (g.kind) {
            case "connector3":
                connectors.push(g);
                break;
            case "connector45_2":
                connector45s.push(g);
                break;
            case "tube2":
                tubes.push(g);
                break;
            case "panel2":
                panels.push(g);
                break;
            case "display2":
                displayPanels.push(g);
                break;
            case "textil2":
                textiles.push(g);
                break;
            case "clamp2":
                clamps.push(g);
                break;
            case "slide2":
                slides.push(g);
                break;
            case "slide-end2":
                slideEnds.push(g);
                break;
            case "multi-wheel2":
                wheels.push(g);
                break;
            default:
                break;
        }
    }

    const parsed: QdfParsedFile = {
        rawText: text,
        materials,
        geometries,
        connectors,
        connector45s,
        tubes,
        panels,
        displayPanels,
        textiles,
        clamps,
        slides,
        slideEnds,
        wheels,
    };

    return parsed;
}