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
    const [searchText, setSearchText] = useState<string>("");

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

    const handleSearchSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!searchText.trim()) return;

        const proxyUrls = [
            `/proxy/qdf/files/qdf/${searchText}.qdf`,
            `/proxy/mynthquadro/quadro/diy_qdf/${searchText}.qdf`,
            `/proxy/yougenmdb/sites/default/files/mdb/${searchText}/${searchText}-public.qdf`,
        ];

        for (const url of proxyUrls) {
            try {
                const response = await fetch(url);
                if (response.ok) {
                    const text = await response.text();
                    setFileContents(text);
                    return;
                }
            } catch (err) {
                // Try next URL
                console.debug(`Failed to fetch ${url}:`, err);
            }
        }

        // If we get here, none of the URLs worked
        setFileContents(`Error: Could not find QDF file for "${searchText}" in any of the template sites.`);
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
        lines.push(`  Connectors:   ${connectors.length}`);

        // Segment connectors by type (connectorKind) — include both connector3 and connector45 entries
        if (connectors.length > 0 || connector45s.length > 0) {
            const connectorsByKind = new Map<string, number>();
            for (const conn of connectors) {
                const kind = (conn as any).connectorKind ?? "unknown";
                connectorsByKind.set(kind, (connectorsByKind.get(kind) ?? 0) + 1);
            }
            for (const conn of connector45s) {
                const kind = (conn as any).connectorKind ?? "45";
                connectorsByKind.set(kind, (connectorsByKind.get(kind) ?? 0) + 1);
            }
            if (connectorsByKind.size > 0) {
                lines.push("    by type:");
                const sortedKinds = Array.from(connectorsByKind.keys()).sort();
                for (const kind of sortedKinds) {
                    const count = connectorsByKind.get(kind)!;
                    lines.push(`      ${kind}: ${count}`);
                }
            }
        }

        lines.push(`  Tubes:        ${tubes.length}`);

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

        lines.push(`  Panels:       ${panels.length}`);
        // Segment panels by size using dim1 and dim3
        if (panels.length > 0) {
            const panelsBySize = new Map<string, number>();
            for (const p of panels) {
                const key = `${p.dim1} x ${p.dim3}`;
                panelsBySize.set(key, (panelsBySize.get(key) ?? 0) + 1);
            }
            if (panelsBySize.size > 0) {
                lines.push("    by size (dim1 x dim3):");
                const sortedKeys = Array.from(panelsBySize.keys()).sort((a, b) => {
                    const [aDim, aDim3] = a.split(' x ').map(Number);
                    const [bDim, bDim3] = b.split(' x ').map(Number);
                    return aDim - bDim || aDim3 - bDim3;
                });
                for (const key of sortedKeys) {
                    const count = panelsBySize.get(key)!;
                    lines.push(`      ${key}: ${count}`);
                }
            }
        }
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

            <form onSubmit={handleSearchSubmit} style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <label htmlFor="qdf-search" style={{ fontSize: "12px", fontWeight: "600" }}>
                    Search template sites:
                </label>
                <input
                    id="qdf-search"
                    type="text"
                    placeholder="Enter QDF name (e.g., 'example')"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    style={{
                        padding: "6px 8px",
                        borderRadius: "6px",
                        border: "1px solid rgba(255, 255, 255, 0.2)",
                        background: "rgba(255, 255, 255, 0.05)",
                        color: "#eee",
                        fontSize: "12px",
                        outline: "none",
                    }}
                />
                <button
                    type="submit"
                    style={{
                        padding: "6px 8px",
                        borderRadius: "6px",
                        border: "none",
                        background: "rgba(92, 200, 255, 0.6)",
                        color: "#fff",
                        fontSize: "12px",
                        fontWeight: "600",
                        cursor: "pointer",
                        transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(92, 200, 255, 0.9)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(92, 200, 255, 0.6)")}
                >
                    Search
                </button>
            </form>

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