"use client";

import React from "react";

interface LeftPanelProps {
    className?: string;
    onHidePanel?: () => void;
}

const LeftPanel: React.FC<LeftPanelProps> = ({ className = "", onHidePanel }) => {
    return (
        <div id="left-panel" className={className}>
            <div className="panel-header">
                <span>Tools</span>
                {onHidePanel && (
                    <button
                        type="button"
                        className="panel-header-close"
                        onClick={onHidePanel}
                        aria-label="Close left panel"
                    >
                        ✕
                    </button>
                )}
            </div>

            <div className="panel-tabs" style={{ flexDirection: "column", padding: "8px" }}>
                <button
                    type="button"
                    className={`tab-button left-tab-button`}
                    onClick={() => {
                        // placeholder: wire this up if you want
                        console.log("Left panel button 1 clicked");
                    }}
                >
                    Import QDF
                </button>

                <button
                    type="button"
                    className={`tab-button left-tab-button`}
                    onClick={() => {
                        console.log("Left panel button 2 clicked");
                    }}
                >
                    Settings
                </button>
            </div>
        </div>
    );
};

export default LeftPanel;
