'use client';

import { useState } from "react";
import ThreeCanvas from "@/app/components/canvas";
import QdfSidePanel from "@/app/components/side_panel";
import LeftPanel from "@/app/components/left_panel";

import type { QdfParsedFile, QdfConnector3, QdfConnector45, QdfTube } from "@/app/types/qdf_containers";

type Pickable =
  | { kind: "connector"; value: QdfConnector3 | QdfConnector45 }
  | { kind: "tube"; value: QdfTube }
  | null;

export default function Home() {

  const [parsed, setParsed] = useState<QdfParsedFile | null>(null);
  const [selectedConnector, setSelectedConnector] =
    useState<Pickable>(null);
  const [panelVisible, setPanelVisible] = useState<boolean>(true);
  const [leftPanelVisible, setLeftPanelVisible] = useState<boolean>(true);

  // Helper to map geometry -> material hex (if available)
  const getMaterialHexFor = (geom: any): string | null => {
    if (!parsed) return null;

    // Fallback: try to match geometry id to a material id
    const tryByGeomId = parsed.materials.find((mm) => mm.id === geom?.id) ?? parsed.materials[geom?.id];
    if (tryByGeomId) return `#${tryByGeomId.colorHex.toString(16).padStart(6, "0")}`;

    return null;
  };

  return (
    <>
      <ThreeCanvas
        parsedFile={parsed}
        onSelectConnector={(conn) => {
          // normalize the callback from ThreeCanvas into our Pickable shape
          if (!conn) {
            setSelectedConnector(null);
            return;
          }

          // connector objects in ThreeCanvas include kind strings matching container types
          const kindStr = (conn as any).kind ?? "";
          if (kindStr.startsWith("connector")) {
            setSelectedConnector({ kind: "connector", value: conn as any });
          } else if (kindStr.startsWith("tube")) {
            setSelectedConnector({ kind: "tube", value: conn as any });
          } else {
            // fallback
            setSelectedConnector(null);
          }
        }}
      />

      <LeftPanel
        className={leftPanelVisible ? "" : "hidden"}
        onHidePanel={() => setLeftPanelVisible(false)}
      />
      <QdfSidePanel
        className={panelVisible ? "" : "hidden"}
        onParsed={setParsed}
        onHidePanel={() => setPanelVisible(false)}
      />

      {!panelVisible && (
        <button
          type="button"
          className="panel-toggle-button"
          onClick={() => setPanelVisible(true)}
        >
          QDF ▸
        </button>
      )}

      {!leftPanelVisible && (
        <button
          type="button"
          className="panel-toggle-button-left"
          onClick={() => setLeftPanelVisible(true)}
        >
          ◂ Tools
        </button>
      )}

      {selectedConnector && (
        <div className="coord-bubble">
          <div>
            <strong>{selectedConnector.kind}</strong>
          </div>

          {/* resolved geometry value */}
          {(() => {
            const geom: any = (selectedConnector as any).value;
            const swatch = getMaterialHexFor(geom);
            return (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {swatch ? (
                  <>
                    <span style={{ width: 18, height: 12, display: "inline-block", background: swatch, border: "1px solid rgba(0,0,0,0.6)", borderRadius: 2 }} />
                    <span style={{ fontSize: 12 }}>{swatch}</span>
                  </>
                ) : (
                  <span style={{ fontSize: 12, color: "#ccc" }}>No material</span>
                )}
              </div>
            );
          })()}
          {selectedConnector.kind === "connector" && (
            <>
              <div>
                Nearby tubes: {(((selectedConnector as any).value as any).nearbyTubeCount ?? 0)}
              </div>
            </>
          )}
          <div>
            x: {((selectedConnector as any).value.orientation.x ?? 0).toFixed(1)} mm
          </div>
          <div>
            y: {((selectedConnector as any).value.orientation.y ?? 0).toFixed(1)} mm
          </div>
          <div>
            z: {((selectedConnector as any).value.orientation.z ?? 0).toFixed(1)} mm
          </div>
          <div>
            rotation x: {(((selectedConnector as any).value.quaternion.x ?? 0) as number).toFixed(5)}
          </div>
          <div>
            rotation y: {(((selectedConnector as any).value.quaternion.y ?? 0) as number).toFixed(5)}
          </div>
          <div>
            rotation z: {(((selectedConnector as any).value.quaternion.z ?? 0) as number).toFixed(5)}
          </div>
          <div>
            rotation w: {(((selectedConnector as any).value.quaternion.w ?? 0) as number).toFixed(5)}
          </div>

        </div>
      )}
    </>
  );
}
