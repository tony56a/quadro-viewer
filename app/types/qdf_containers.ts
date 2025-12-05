
export interface QdfOrientation {
    a: number;
    b: number;
    c: number;
    d: number;
    x: number;
    y: number;
    z: number;
}

export interface QdfGeomBase {
    id: number;
    orientation: QdfOrientation;

    // Threejs mapped orientation fields

    position: { x: number; y: number; z: number };

    /** Orientation as a unit quaternion (Three.js convention). */
    quaternion: { x: number; y: number; z: number; w: number };
}

export enum QdfConnectorKind {
    STRAIGHT = "STRAIGHT_CONNECTOR",
    L_CONNECTOR = "L_CONNECTOR",
    T_CONNECTOR = "T_CONNECTOR",
    CORNER_CONNECTOR = "CORNER_CONNECTOR",
    FOUR_WAY_CONNECTOR = "FOUR_WAY_CONNECTOR",
    CROSS_CONNECTOR = "CROSS_CONNECTOR",
    FIVE_WAY_CONNECTOR = "FIVE_WAY_CONNECTOR",
    HUB_CONNECTOR = "HUB_CONNECTOR",
    INVALID = "INVALID",
}

export interface QdfConnector3 extends QdfGeomBase {
    kind: "connector3";
    colorId: number;
    variant1: number;
    variant2: number;
    variant3: number;
    variant4: number;
    reserved: number;

    connectorKind: QdfConnectorKind;
}

export interface QdfConnector45 extends QdfGeomBase {
    kind: "connector45_2";
    connectorType: number;
    flag1: number;
    flag2: number;
}

export interface QdfTube extends QdfGeomBase {
    kind: "tube2";
    materialId: number;
    length: number;
    dim2: number;
    dim3: number;
}

export interface QdfPanelBase extends QdfGeomBase {
    materialId: number;
    dim1: number;
    dim2: number;
    dim3: number;
    offset1: number;
    offset2: number;
}

export interface QdfPanel extends QdfPanelBase {
    kind: "panel2";
}

export interface QdfDisplayPanel extends QdfPanelBase {
    kind: "display2";
}

export interface QdfTextile extends QdfPanelBase {
    kind: "textil2";
}

export interface QdfClamp extends QdfGeomBase {
    kind: "clamp2";
    materialId: number;
    flag: number;
}

export interface QdfSlide extends QdfGeomBase {
    kind: "slide2";
    materialId: number;
    flag: number;
}

export interface QdfWheel extends QdfGeomBase {
    kind: "multi-wheel2";

    materialId: number;
    flag: number;
}

export type QdfGeometry =
    | QdfConnector3
    | QdfConnector45
    | QdfTube
    | QdfPanel
    | QdfDisplayPanel
    | QdfTextile
    | QdfClamp
    | QdfSlide
    | QdfWheel;

export interface QdfMaterial {
    kind: "material3";
    id: number;
    name: string;
    materialType: number;

    linearColor: {
        r: number; // 0–1
        g: number;
        b: number;
    };

    colorHex: number;

    srgbColor: {
        r: number; // 0–1
        g: number;
        b: number;
    };

    meshStandard: {
        color: number;
        metalness: number;
        roughness: number;
        opacity: number;
        transparent: boolean;
    };

    flags: number;
}




export interface QdfParsedFile {
    rawText: string;
    materials: QdfMaterial[];
    geometries: QdfGeometry[];
    connectors: QdfConnector3[];
    connector45s: QdfConnector45[];
    tubes: QdfTube[];
    panels: QdfPanel[];
    displayPanels: QdfDisplayPanel[];
    textiles: QdfTextile[];
    clamps: QdfClamp[];
    slides: QdfSlide[];
    //wheels: QdfWheel[];
}