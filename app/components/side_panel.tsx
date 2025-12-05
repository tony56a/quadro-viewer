// components/QdfSidePanel.tsx
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { QdfParsedFile } from "@/app/types/qdf_containers"; // for later parsing
import { parseQdf } from "@/app/lib/qdf_parser";

type ActiveTab = "file-view" | "parsed-view";

interface QdfSidePanelProps {
    onParsed: (p: QdfParsedFile | null) => void;
    onHidePanel: () => void;
    className: string;
}

const QdfSidePanel: React.FC<QdfSidePanelProps> = ({ onParsed, onHidePanel, className }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>("file-view");
    const [rawText, setRawText] = useState<string>("(no file loaded yet)");
    const [parsedFile, setParsedFile] = useState<QdfParsedFile | null>(null);

    const dropZoneRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const setFileContents = useCallback((text: string) => {
        const normalized = text || "(empty file)";
        setRawText(normalized);

        try {
            const parsed = parseQdf(text);
            setParsedFile(parsed);
            onParsed(parsed);      // <-- send to canvas!
        } catch (err) {
            console.error("Failed to parse QDF:", err);
            setParsedFile(null);
        }
    }, []);

    const handleFiles = useCallback(
        (fileList: FileList | null) => {
            if (!fileList || fileList.length === 0) return;
            const file = fileList[0];
            const reader = new FileReader();
            reader.onload = (evt) => {
                const text = String(evt.target?.result ?? "");
                setFileContents(text);
            };
            reader.onerror = (err) => {
                setFileContents(`Error reading file: ${err}`);
            };
            reader.readAsText(file);
        },
        [setFileContents],
    );

    // Drag & drop events within component
    useEffect(() => {
        const dropZone = dropZoneRef.current;
        if (!dropZone) return;

        const preventDefaults = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const handleDragEnter = (e: DragEvent) => {
            preventDefaults(e);
            dropZone.classList.add("drag-over");
        };

        const handleDragOver = (e: DragEvent) => {
            preventDefaults(e);
            dropZone.classList.add("drag-over");
        };

        const handleDragLeave = (e: DragEvent) => {
            preventDefaults(e);
            dropZone.classList.remove("drag-over");
        };

        const handleDrop = (e: DragEvent) => {
            preventDefaults(e);
            dropZone.classList.remove("drag-over");
            const dt = e.dataTransfer;
            handleFiles(dt?.files ?? null);
        };

        dropZone.addEventListener("dragenter", handleDragEnter);
        dropZone.addEventListener("dragover", handleDragOver);
        dropZone.addEventListener("dragleave", handleDragLeave);
        dropZone.addEventListener("dragend", handleDragLeave);
        dropZone.addEventListener("drop", handleDrop);

        // Prevent browser from navigating away on file drop anywhere
        const windowPrevent = (e: DragEvent) => {
            e.preventDefault();
        };
        window.addEventListener("dragover", windowPrevent);
        window.addEventListener("drop", windowPrevent);

        return () => {
            dropZone.removeEventListener("dragenter", handleDragEnter);
            dropZone.removeEventListener("dragover", handleDragOver);
            dropZone.removeEventListener("dragleave", handleDragLeave);
            dropZone.removeEventListener("dragend", handleDragLeave);
            dropZone.removeEventListener("drop", handleDrop);

            window.removeEventListener("dragover", windowPrevent);
            window.removeEventListener("drop", windowPrevent);
        };
    }, [handleFiles]);

    const handleClickDropZone = () => {
        if (!fileInputRef.current) return;
        fileInputRef.current.value = "";
        fileInputRef.current.click();
    };

    const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (
        e,
    ) => {
        handleFiles(e.target.files);
    };

    const renderParsedView = () => {
        if (!parsedFile) {
            return "(no parsed data yet — load a QDF file)";
        }

        const {
            materials,
            connectors,
            connector45s,
            tubes,
            panels,
            displayPanels,
            textiles,
            clamps,
            slides,
        } = parsedFile;

        const lines: string[] = [];

        lines.push("Materials:");
        lines.push(`  total: ${materials.length}`);
        for (const m of materials) {
            lines.push(
                `  [${m.id}] ${m.name}  color=#${m.colorHex
                    .toString(16)
                    .padStart(6, "0")}`,
            );
        }

        lines.push("");
        lines.push("Geometry counts:");
        lines.push(`  connector3:   ${connectors.length}`);

        // Segment connectors by type (connectorKind)
        if (connectors.length > 0) {
            const connectorsByKind = new Map<string, number>();
            for (const conn of connectors) {
                const kind = conn.connectorKind;
                connectorsByKind.set(kind, (connectorsByKind.get(kind) ?? 0) + 1);
            }
            lines.push("    by type:");
            const sortedKinds = Array.from(connectorsByKind.keys()).sort();
            for (const kind of sortedKinds) {
                const count = connectorsByKind.get(kind)!;
                lines.push(`      ${kind}: ${count}`);
            }
        }

        lines.push(`  connector45_2:${connector45s.length}`);
        lines.push(`  tube2:        ${tubes.length}`);

        // Segment tubes by length
        if (tubes.length > 0) {
            const tubesByLength = new Map<number, number>();
            for (const tube of tubes) {
                const len = tube.length;
                tubesByLength.set(len, (tubesByLength.get(len) ?? 0) + 1);
            }
            lines.push("    by length:");
            const sortedLengths = Array.from(tubesByLength.keys()).sort((a, b) => a - b);
            for (const len of sortedLengths) {
                const count = tubesByLength.get(len)!;
                lines.push(`      ${len}: ${count}`);
            }
        }

        lines.push(`  panel2:       ${panels.length}`);
        lines.push(`  display2:     ${displayPanels.length}`);
        lines.push(`  textil2:      ${textiles.length}`);
        lines.push(`  clamp2:       ${clamps.length}`);
        lines.push(`  slide2:       ${slides.length}`);

        return lines.join("\n");
    };

    return (
        <div id="side-panel" className={className}>
            <div className="panel-header">
                <span>QDF Loader</span>
                <button
                    type="button"
                    className="panel-header-close"
                    onClick={onHidePanel}
                >
                    ✕
                </button>
            </div>

            <div className="panel-tabs">
                <button
                    className={`tab-button ${activeTab === "file-view" ? "active" : ""
                        }`}
                    onClick={() => setActiveTab("file-view")}
                >
                    File view
                </button>
                <button
                    className={`tab-button ${activeTab === "parsed-view" ? "active" : ""
                        }`}
                    onClick={() => setActiveTab("parsed-view")}
                >
                    Parsed view
                </button>
            </div>

            <div
                id="drop-zone"
                ref={dropZoneRef}
                onClick={handleClickDropZone}
            >
                <span>
                    Drop .qdf file here
                    <br />
                    or click to choose
                </span>
            </div>

            <input
                ref={fileInputRef}
                type="file"
                accept=".qdf,.txt"
                style={{ display: "none" }}
                onChange={handleFileInputChange}
            />

            <div id="tab-contents"
                className={`tab-content ${activeTab === "file-view" ? "tab-content-active" : ""
                    }`}>


                <pre
                    id="file-contents"
                    className={`tab-content ${activeTab === "file-view" ? "tab-content-active" : ""
                        }`}
                >
                    {rawText}
                </pre>
                <pre
                    id="parsed-view"
                    className={`tab-content ${activeTab === "parsed-view" ? "tab-content-active" : ""
                        }`}
                >
                    {renderParsedView()}
                </pre>
            </div>
        </div>
    );
};

export default QdfSidePanel;