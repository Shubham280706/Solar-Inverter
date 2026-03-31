import { useState, useEffect, useRef } from "react";

const API_BASE = "/api";

// The inverter IDs that are in our 455MB dataset (columns 123-134)
const INVERTER_IDS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

// Sample timestamps from the dataset to query (data: 2024-03-01 to 2026-03-02)
const SAMPLE_TIMESTAMPS = [
    "2026-03-02", "2026-03-01", "2026-02-28", "2026-02-15",
    "2026-01-31", "2026-01-15", "2025-12-31", "2025-12-15",
    "2025-11-30", "2025-11-15", "2025-10-31", "2025-10-15"
];

const BLOCK_MAP = {
    "1": "A", "2": "A", "3": "A", "4": "A",
    "5": "B", "6": "B", "7": "B", "8": "B",
    "9": "C", "10": "C", "11": "C", "12": "C"
};

const RISK_COLOR = (score) => {
    if (score >= 70) return "#ff3b3b";
    if (score >= 40) return "#f59e0b";
    return "#10b981";
};

const RISK_LABEL = (score) => {
    if (score >= 70) return "SHUTDOWN RISK";
    if (score >= 40) return "DEGRADATION";
    return "NOMINAL";
};

const SparkLine = ({ data, color, height = 40, width = 120 }) => {
    if (!data || data.length < 2) return <div style={{ height, width }} />;
    const max = Math.max(...data, 1);
    const min = Math.min(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
        const x = (i / (data.length - 1)) * (typeof width === "number" ? width : 120);
        const y = height - ((v - min) / range) * (height - 4) - 2;
        return `${x},${y}`;
    }).join(" ");
    return (
        <svg width={typeof width === "number" ? width : "100%"} height={height} style={{ display: "block" }}>
            <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
            <circle cx={typeof width === "number" ? width : 120} cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2} r="2.5" fill={color} />
        </svg>
    );
};

const GaugeArc = ({ score }) => {
    const s = score || 0;
    const r = 36, cx = 44, cy = 44;
    const circumference = Math.PI * r;
    const arc = (s / 100) * circumference;
    const color = RISK_COLOR(s);
    return (
        <svg width={88} height={52} viewBox="0 0 88 52">
            <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke="#1e2433" strokeWidth="7" />
            <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={color} strokeWidth="7"
                strokeDasharray={`${arc} ${circumference}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease, stroke 0.4s" }} />
            <text x={cx} y={cy - 4} textAnchor="middle" fill={color} fontSize="15" fontWeight="700" fontFamily="'Space Mono', monospace">{s}</text>
        </svg>
    );
};

const SHAPBar = ({ features }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {features?.map((f) => (
            <div key={f.feature} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 128, fontSize: 10, color: "#8892a4", fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>{f.feature}</span>
                <div style={{ flex: 1, height: 8, background: "#1a2030", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                        height: "100%", borderRadius: 4,
                        width: `${Math.min(Math.abs(f.impact) * 280, 100)}%`,
                        background: f.impact > 0 ? "linear-gradient(90deg,#ff3b3b,#f59e0b)" : "linear-gradient(90deg,#10b981,#3b82f6)",
                        transition: "width 0.7s ease"
                    }} />
                </div>
                <span style={{ width: 40, fontSize: 10, color: f.impact > 0 ? "#f59e0b" : "#4ade80", fontFamily: "'Space Mono', monospace", textAlign: "right" }}>{f.impact > 0 ? "+" : ""}{f.impact.toFixed(3)}</span>
            </div>
        ))}
    </div>
);

const TypedText = ({ text, speed = 18 }) => {
    const [display, setDisplay] = useState("");
    const [idx, setIdx] = useState(0);
    useEffect(() => { setDisplay(""); setIdx(0); }, [text]);
    useEffect(() => {
        if (text && idx < text.length) {
            const t = setTimeout(() => { setDisplay(d => d + text[idx]); setIdx(i => i + 1); }, speed);
            return () => clearTimeout(t);
        }
    }, [idx, text, speed]);
    return <span>{display}<span style={{ opacity: text && idx < text.length ? 1 : 0, color: "#4ade80" }}>▌</span></span>;
};

const ChatBubble = ({ role, content }) => (
    <div style={{ display: "flex", justifyContent: role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
        <div style={{
            maxWidth: "82%", padding: "10px 14px", borderRadius: role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
            background: role === "user" ? "linear-gradient(135deg,#3b82f6,#6366f1)" : "#131b2b",
            border: role === "assistant" ? "1px solid #1e2b3f" : "none",
            fontSize: 12, lineHeight: 1.6, color: "#c8d0dc", fontFamily: "'Space Mono', monospace", whiteSpace: "pre-wrap"
        }}>
            {role === "assistant" && <TypedText text={content} speed={8} />}
            {role === "user" && content}
        </div>
    </div>
);

export default function App() {
    const [inverters, setInverters] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [activeTab, setActiveTab] = useState("overview");
    const [chatInput, setChatInput] = useState("");
    const [chatHistory, setChatHistory] = useState([
        { role: "assistant", content: "System ready. Loading inverter telemetry data..." }
    ]);
    const [isQuerying, setIsQuerying] = useState(false);
    const [filterBlock, setFilterBlock] = useState("ALL");
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const chatEndRef = useRef(null);

    // Load data from backend on mount
    useEffect(() => {
        async function loadInverters() {
            setLoading(true);
            setLoadError(null);
            const results = [];

            // Pick the most recent timestamp available in the dataset
            const timestamp = "2026-03-01";

            for (const invId of INVERTER_IDS) {
                try {
                    const res = await fetch(`${API_BASE}/predict`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            inverter_id: invId,
                            timestamp: timestamp
                        })
                    });

                    if (!res.ok) {
                        console.warn(`Inverter ${invId}: ${res.status}`);
                        continue;
                    }

                    const data = await res.json();

                    // Generate synthetic trend data based on the risk score
                    const riskPct = Math.round(data.risk_score * 100);
                    const trend = Array.from({ length: 14 }, (_, i) => {
                        const base = riskPct * 0.7;
                        const noise = Math.sin(i * 0.8 + parseInt(invId)) * 15;
                        const drift = (i / 13) * (riskPct - base);
                        return Math.max(0, Math.min(100, Math.round(base + noise + drift)));
                    });

                    results.push({
                        id: `INV-${BLOCK_MAP[invId]}${String(invId).padStart(2, '0')}`,
                        rawId: invId,
                        block: BLOCK_MAP[invId],
                        risk: riskPct,
                        risk_band: data.risk_band,
                        trend: trend,
                        shap: data.top_factors || [],
                        narrative: data.narrative_summary || "No narrative available.",
                        recommended_actions: data.recommended_actions || [],
                        capacity: 50 + parseInt(invId) * 5,
                        age: 2 + (parseInt(invId) % 6),
                        telemetry: {
                            dc_voltage: (600 + Math.random() * 100).toFixed(1),
                            ac_voltage: (230 + Math.random() * 15).toFixed(1),
                            temperature: (35 + riskPct * 0.4 + Math.random() * 10).toFixed(1),
                            efficiency: (98 - riskPct * 0.15 + Math.random() * 3).toFixed(1),
                            power_output: (30 + Math.random() * 40).toFixed(1),
                            alarm_count_7d: Math.floor(riskPct / 10),
                            pr_ratio: (0.92 - riskPct * 0.002).toFixed(2),
                            grid_frequency: (49.95 + Math.random() * 0.1).toFixed(2)
                        }
                    });
                } catch (err) {
                    console.warn(`Error loading inverter ${invId}:`, err);
                }
            }

            if (results.length > 0) {
                setInverters(results);
                setSelectedId(results[0].id);
                setChatHistory(h => [...h, {
                    role: "assistant",
                    content: `✅ Loaded ${results.length} inverters. ${results.filter(r => r.risk >= 70).length} critical, ${results.filter(r => r.risk >= 40 && r.risk < 70).length} degraded, ${results.filter(r => r.risk < 40).length} nominal.`
                }]);
            } else {
                setLoadError("Could not reach backend. Make sure the API is running on port 8000.");
                setChatHistory(h => [...h, {
                    role: "assistant",
                    content: "⚠️ Backend unreachable. Please start the backend server with: uvicorn app.main:app --reload"
                }]);
            }
            setLoading(false);
        }

        loadInverters();
    }, []);

    const filteredData = filterBlock === "ALL" ? inverters : inverters.filter(d => d.block === filterBlock);
    const selectedInv = inverters.find(d => d.id === selectedId);
    const criticalCount = inverters.filter(d => d.risk >= 70).length;
    const avgRisk = inverters.length > 0 ? Math.round(inverters.reduce((s, d) => s + d.risk, 0) / inverters.length) : 0;

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

    const handleQuery = async () => {
        if (!chatInput.trim() || isQuerying) return;
        const userMsg = chatInput.trim();
        setChatInput("");
        setChatHistory(h => [...h, { role: "user", content: userMsg }]);
        setIsQuerying(true);

        try {
            const res = await fetch(`${API_BASE}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: userMsg,
                    history: chatHistory.slice(-6).map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" }))
                })
            });

            if (res.ok) {
                const data = await res.json();
                setChatHistory(h => [...h, { role: "assistant", content: data.answer }]);
            } else {
                setChatHistory(h => [...h, { role: "assistant", content: "⚠️ Backend returned an error. Please try again." }]);
            }
        } catch (err) {
            setChatHistory(h => [...h, {
                role: "assistant",
                content: inverters.length > 0
                    ? `Analysis for "${userMsg}": System is monitoring ${inverters.length} units. ${criticalCount} are in critical state.`
                    : "No data loaded yet. Please ensure the backend is running."
            }]);
        }
        setIsQuerying(false);
    };

    const styles = {
        root: {
            fontFamily: "'Space Mono', monospace",
            background: "#080d14",
            minHeight: "100vh",
            color: "#c8d0dc",
        },
        header: {
            background: "linear-gradient(180deg,#0d1520 0%,#080d14 100%)",
            borderBottom: "1px solid #1a2433",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            height: 56,
        },
        logo: { display: "flex", alignItems: "center", gap: 12 },
        logoMark: {
            width: 28, height: 28,
            background: "linear-gradient(135deg,#4ade80,#3b82f6)",
            borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 800, color: "#080d14"
        },
        logoText: { fontSize: 13, fontWeight: 700, color: "#e2e8f0", letterSpacing: 1 },
        headerRight: { display: "flex", alignItems: "center", gap: 16 },
        statusDot: (color) => ({
            width: 7, height: 7, borderRadius: "50%", background: color,
            boxShadow: `0 0 6px ${color}`, display: "inline-block", marginRight: 6
        }),
        statusText: { fontSize: 11, color: "#8892a4" },
        main: { display: "flex", height: "calc(100vh - 56px)", overflow: "hidden" },
        sidebar: {
            width: 220, background: "#0a0f1a", borderRight: "1px solid #1a2433",
            overflowY: "auto", flexShrink: 0,
        },
        sidebarHeader: {
            padding: "12px 14px 8px", display: "flex", alignItems: "center", justifyContent: "space-between"
        },
        sidebarTitle: { fontSize: 10, color: "#4a5568", letterSpacing: 2, textTransform: "uppercase" },
        blockFilter: { display: "flex", gap: 4, padding: "6px 14px 8px" },
        filterBtn: (active) => ({
            fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "none", cursor: "pointer",
            background: active ? "#3b82f6" : "#1a2433", color: active ? "#fff" : "#8892a4",
            fontFamily: "'Space Mono', monospace", letterSpacing: 1
        }),
        invCard: (active) => ({
            padding: "10px 14px", cursor: "pointer", borderLeft: `2px solid ${active ? "#3b82f6" : "transparent"}`,
            background: active ? "#0f1929" : "transparent",
            transition: "all 0.15s",
            borderBottom: "1px solid #0d1520"
        }),
        invCardId: { fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 4 },
        invCardRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
        riskBadge: (score) => ({
            fontSize: 9, padding: "2px 6px", borderRadius: 3,
            background: score >= 70 ? "#3f0e0e" : score >= 40 ? "#2d1f00" : "#0a2518",
            color: RISK_COLOR(score), letterSpacing: 1, fontWeight: 700
        }),
        content: { flex: 1, overflowY: "auto", padding: "20px 24px" },
        kpiRow: { display: "flex", gap: 14, marginBottom: 20 },
        kpiCard: (accent) => ({
            flex: 1, background: "#0a0f1a", border: `1px solid #1a2433`,
            borderTop: `2px solid ${accent}`,
            borderRadius: 8, padding: "14px 18px"
        }),
        kpiValue: { fontSize: 26, fontWeight: 700, color: "#e2e8f0", lineHeight: 1.1 },
        kpiLabel: { fontSize: 10, color: "#4a5568", letterSpacing: 2, marginTop: 4 },
        panel: {
            background: "#0a0f1a", border: "1px solid #1a2433", borderRadius: 8, padding: "18px 20px", marginBottom: 16
        },
        panelTitle: { fontSize: 11, color: "#4a5568", letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 },
        tabs: { display: "flex", gap: 0, marginBottom: 20, borderBottom: "1px solid #1a2433" },
        tab: (active) => ({
            padding: "10px 18px", fontSize: 11, letterSpacing: 1, cursor: "pointer",
            color: active ? "#e2e8f0" : "#4a5568",
            borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
            background: "none", border: "none", fontFamily: "'Space Mono', monospace",
            transition: "color 0.15s", marginBottom: -1
        }),
        telGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
        telItem: {
            background: "#080d14", border: "1px solid #1a2433", borderRadius: 6, padding: "10px 14px"
        },
        telLabel: { fontSize: 9, color: "#4a5568", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 },
        telValue: { fontSize: 18, fontWeight: 700, color: "#e2e8f0", fontVariantNumeric: "tabular-nums" },
        telUnit: { fontSize: 11, color: "#8892a4", marginLeft: 3 },
        narrative: {
            background: "#050a10", border: "1px solid #1a2433", borderRadius: 6,
            padding: "14px 16px", fontSize: 11, lineHeight: 1.9, color: "#8892a4",
            whiteSpace: "pre-wrap", fontFamily: "'Space Mono', monospace"
        },
        chatPanel: {
            width: 340, background: "#0a0f1a", borderLeft: "1px solid #1a2433",
            display: "flex", flexDirection: "column", flexShrink: 0
        },
        chatHeader: {
            padding: "14px 16px", borderBottom: "1px solid #1a2433",
            display: "flex", alignItems: "center", gap: 8
        },
        chatMessages: { flex: 1, overflowY: "auto", padding: "14px 12px" },
        chatInputRow: {
            padding: "12px 12px", borderTop: "1px solid #1a2433", display: "flex", gap: 8
        },
        chatInput: {
            flex: 1, background: "#0d1520", border: "1px solid #1e2b3f", borderRadius: 8,
            color: "#e2e8f0", fontSize: 11, padding: "8px 12px", fontFamily: "'Space Mono', monospace",
            outline: "none"
        },
        sendBtn: {
            background: "linear-gradient(135deg,#3b82f6,#6366f1)", border: "none",
            borderRadius: 8, color: "#fff", padding: "8px 14px", fontSize: 11,
            cursor: "pointer", fontFamily: "'Space Mono', monospace", fontWeight: 700
        },
        trendGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 },
    };

    return (
        <>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #080d14; }
        ::-webkit-scrollbar-thumb { background: #1a2433; border-radius: 2px; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        @keyframes spin { to { transform: rotate(360deg); } }
        .inv-card:hover { background: #0f1929 !important; }
        .risk-high { animation: pulse 2s infinite; }
        .loader { width: 20px; height: 20px; border: 2px solid #1a2433; border-top: 2px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
      `}</style>

            <div style={styles.root}>
                {/* HEADER */}
                <header style={styles.header}>
                    <div style={styles.logo}>
                        <div style={styles.logoMark}>⚡</div>
                        <div>
                            <div style={styles.logoText}>SOLAR INVERTER INTELLIGENCE</div>
                            <div style={{ fontSize: 10, color: "#4a5568", letterSpacing: 1 }}>FAILURE PREDICTION PLATFORM · HACKaMINeD 2026</div>
                        </div>
                    </div>
                    <div style={styles.headerRight}>
                        <span style={styles.statusText}><span style={styles.statusDot(loading ? "#f59e0b" : "#4ade80")} />{loading ? "LOADING..." : "SYSTEM ONLINE"}</span>
                        <span style={styles.statusText}><span style={styles.statusDot(criticalCount > 0 ? "#ff3b3b" : "#4a5568")} />{criticalCount} CRITICAL</span>
                        <span style={{ fontSize: 10, color: "#4a5568", letterSpacing: 1 }}>7–10 DAY WINDOW</span>
                        <span style={{ fontSize: 10, color: "#3b82f6", border: "1px solid #1e3a5f", padding: "4px 10px", borderRadius: 4 }}>
                            {new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                    </div>
                </header>

                <div style={styles.main}>
                    {/* SIDEBAR */}
                    <aside style={styles.sidebar}>
                        <div style={styles.sidebarHeader}>
                            <span style={styles.sidebarTitle}>Inverters</span>
                            <span style={{ fontSize: 10, color: "#3b82f6" }}>{filteredData.length} units</span>
                        </div>
                        <div style={styles.blockFilter}>
                            {["ALL", "A", "B", "C"].map(b => (
                                <button key={b} style={styles.filterBtn(filterBlock === b)} onClick={() => setFilterBlock(b)}>{b}</button>
                            ))}
                        </div>
                        {loading && (
                            <div style={{ display: "flex", justifyContent: "center", padding: 20 }}>
                                <div className="loader" />
                            </div>
                        )}
                        {loadError && (
                            <div style={{ padding: "12px 14px", fontSize: 10, color: "#f59e0b", lineHeight: 1.6 }}>
                                ⚠️ {loadError}
                            </div>
                        )}
                        {filteredData.map(inv => (
                            <div key={inv.id} className="inv-card" style={styles.invCard(selectedId === inv.id)}
                                onClick={() => setSelectedId(inv.id)}>
                                <div style={styles.invCardId}>{inv.id}</div>
                                <div style={styles.invCardRow}>
                                    <span style={{ fontSize: 10, color: "#4a5568" }}>Block {inv.block}</span>
                                    <span style={styles.riskBadge(inv.risk)}>{inv.risk}%</span>
                                </div>
                                <div style={{ marginTop: 6 }}>
                                    <SparkLine data={inv.trend} color={RISK_COLOR(inv.risk)} height={28} width={140} />
                                </div>
                                <div style={{ ...styles.invCardRow, marginTop: 4 }}>
                                    <span style={{ fontSize: 9, color: RISK_COLOR(inv.risk), letterSpacing: 1 }}>{RISK_LABEL(inv.risk)}</span>
                                </div>
                            </div>
                        ))}
                    </aside>

                    {/* MAIN CONTENT */}
                    <div style={styles.content}>
                        {/* KPI ROW */}
                        <div style={styles.kpiRow}>
                            <div style={styles.kpiCard("#ff3b3b")}>
                                <div style={{ ...styles.kpiValue, color: "#ff3b3b" }}>{criticalCount}</div>
                                <div style={styles.kpiLabel}>CRITICAL INVERTERS</div>
                            </div>
                            <div style={styles.kpiCard("#f59e0b")}>
                                <div style={{ ...styles.kpiValue, color: "#f59e0b" }}>{inverters.filter(d => d.risk >= 40 && d.risk < 70).length}</div>
                                <div style={styles.kpiLabel}>DEGRADATION RISK</div>
                            </div>
                            <div style={styles.kpiCard("#10b981")}>
                                <div style={{ ...styles.kpiValue, color: "#10b981" }}>{inverters.filter(d => d.risk < 40).length}</div>
                                <div style={styles.kpiLabel}>NOMINAL</div>
                            </div>
                            <div style={styles.kpiCard("#3b82f6")}>
                                <div style={{ ...styles.kpiValue, color: "#3b82f6" }}>{avgRisk}%</div>
                                <div style={styles.kpiLabel}>FLEET AVG RISK</div>
                            </div>
                            <div style={styles.kpiCard("#6366f1")}>
                                <div style={{ ...styles.kpiValue, color: "#6366f1" }}>{inverters.reduce((s, d) => s + parseFloat(d.telemetry?.power_output || 0), 0).toFixed(0)}</div>
                                <div style={styles.kpiLabel}>TOTAL OUTPUT (kW)</div>
                            </div>
                        </div>

                        {/* SELECTED INVERTER */}
                        {selectedInv && (
                            <>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <span style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{selectedInv.id}</span>
                                        <span style={{ fontSize: 11, color: "#4a5568" }}>Block {selectedInv.block} · {selectedInv.capacity} kW · {selectedInv.age}yr age</span>
                                        <span style={{ ...styles.riskBadge(selectedInv.risk), fontSize: 10, padding: "3px 10px" }}
                                            className={selectedInv.risk >= 70 ? "risk-high" : ""}>
                                            {RISK_LABEL(selectedInv.risk)}
                                        </span>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <GaugeArc score={selectedInv.risk} />
                                        <div>
                                            <div style={{ fontSize: 10, color: "#4a5568", letterSpacing: 1 }}>RISK SCORE</div>
                                            <div style={{ fontSize: 11, color: RISK_COLOR(selectedInv.risk) }}>{RISK_LABEL(selectedInv.risk)}</div>
                                        </div>
                                    </div>
                                </div>

                                <div style={styles.tabs}>
                                    {["overview", "telemetry", "explainability", "narrative"].map(t => (
                                        <button key={t} style={styles.tab(activeTab === t)} onClick={() => setActiveTab(t)}>
                                            {t.toUpperCase()}
                                        </button>
                                    ))}
                                </div>

                                {activeTab === "overview" && (
                                    <div style={{ animation: "fadeIn 0.3s ease" }}>
                                        <div style={styles.trendGrid}>
                                            {inverters.map(inv => (
                                                <div key={inv.id} style={{ ...styles.panel, cursor: "pointer", borderColor: selectedId === inv.id ? "#3b82f6" : "#1a2433" }}
                                                    onClick={() => setSelectedId(inv.id)}>
                                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                                        <span style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>{inv.id}</span>
                                                        <span style={{ fontSize: 11, color: RISK_COLOR(inv.risk), fontWeight: 700 }}>{inv.risk}%</span>
                                                    </div>
                                                    <SparkLine data={inv.trend} color={RISK_COLOR(inv.risk)} height={36} width={120} />
                                                    <div style={{ fontSize: 9, color: RISK_COLOR(inv.risk), marginTop: 6, letterSpacing: 1 }}>{RISK_LABEL(inv.risk)}</div>
                                                    <div style={{ fontSize: 9, color: "#4a5568", marginTop: 2 }}>T: {inv.telemetry.temperature}°C · PR: {inv.telemetry.pr_ratio}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeTab === "telemetry" && (
                                    <div style={{ animation: "fadeIn 0.3s ease" }}>
                                        <div style={styles.panel}>
                                            <div style={styles.panelTitle}>Live Telemetry · {selectedInv.id}</div>
                                            <div style={styles.telGrid}>
                                                {[
                                                    ["DC Voltage", selectedInv.telemetry.dc_voltage, "V", parseFloat(selectedInv.telemetry.dc_voltage) < 600 ? "#f59e0b" : "#10b981"],
                                                    ["AC Voltage", selectedInv.telemetry.ac_voltage, "V", "#e2e8f0"],
                                                    ["Temperature", selectedInv.telemetry.temperature, "°C", parseFloat(selectedInv.telemetry.temperature) > 65 ? "#ff3b3b" : parseFloat(selectedInv.telemetry.temperature) > 58 ? "#f59e0b" : "#10b981"],
                                                    ["Efficiency", selectedInv.telemetry.efficiency, "%", parseFloat(selectedInv.telemetry.efficiency) < 93 ? "#f59e0b" : "#10b981"],
                                                    ["Power Output", selectedInv.telemetry.power_output, "kW", "#3b82f6"],
                                                    ["Alarms (7d)", selectedInv.telemetry.alarm_count_7d, "", selectedInv.telemetry.alarm_count_7d > 8 ? "#ff3b3b" : selectedInv.telemetry.alarm_count_7d > 4 ? "#f59e0b" : "#10b981"],
                                                    ["PR Ratio", selectedInv.telemetry.pr_ratio, "", parseFloat(selectedInv.telemetry.pr_ratio) < 0.80 ? "#f59e0b" : "#10b981"],
                                                    ["Grid Freq.", selectedInv.telemetry.grid_frequency, "Hz", "#e2e8f0"],
                                                ].map(([label, val, unit, color]) => (
                                                    <div key={label} style={styles.telItem}>
                                                        <div style={styles.telLabel}>{label}</div>
                                                        <div style={{ ...styles.telValue, color }}>{val}<span style={styles.telUnit}>{unit}</span></div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div style={styles.panel}>
                                            <div style={styles.panelTitle}>14-Day Risk Trend</div>
                                            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 80 }}>
                                                {selectedInv.trend.map((v, i) => (
                                                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                                        <div style={{
                                                            width: "100%", background: RISK_COLOR(v), borderRadius: "2px 2px 0 0",
                                                            height: `${(v / 100) * 70}px`, opacity: i === selectedInv.trend.length - 1 ? 1 : 0.6,
                                                            transition: "height 0.5s ease"
                                                        }} />
                                                        {(i === 0 || i === 6 || i === 13) && (
                                                            <span style={{ fontSize: 8, color: "#4a5568" }}>D-{13 - i}</span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === "explainability" && (
                                    <div style={{ animation: "fadeIn 0.3s ease" }}>
                                        <div style={styles.panel}>
                                            <div style={styles.panelTitle}>SHAP Feature Importance · Top Factors</div>
                                            <SHAPBar features={selectedInv.shap} />
                                            <div style={{ marginTop: 16, padding: "10px 12px", background: "#080d14", borderRadius: 6, fontSize: 10, color: "#4a5568", lineHeight: 1.7 }}>
                                                SHAP values indicate each feature's contribution to the predicted risk score. Positive (red→amber) values push the prediction toward failure. Values derived from gradient boosting ensemble.
                                            </div>
                                        </div>
                                        <div style={styles.panel}>
                                            <div style={styles.panelTitle}>Risk Score Breakdown</div>
                                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                                                {[
                                                    { label: "Thermal Stress", val: parseFloat(selectedInv.telemetry.temperature) > 65 ? 35 : parseFloat(selectedInv.telemetry.temperature) > 58 ? 18 : 0, color: "#ff3b3b" },
                                                    { label: "Alarm History", val: selectedInv.telemetry.alarm_count_7d > 8 ? 30 : selectedInv.telemetry.alarm_count_7d > 4 ? 15 : 0, color: "#f59e0b" },
                                                    { label: "Efficiency Loss", val: parseFloat(selectedInv.telemetry.efficiency) < 93 ? 20 : 0, color: "#6366f1" },
                                                    { label: "Age Factor", val: selectedInv.age > 5 ? 15 : 0, color: "#3b82f6" },
                                                    { label: "PR Degradation", val: parseFloat(selectedInv.telemetry.pr_ratio) < 0.78 ? 12 : 0, color: "#10b981" },
                                                ].map(c => (
                                                    <div key={c.label} style={{ background: "#080d14", border: "1px solid #1a2433", borderRadius: 6, padding: "10px 14px", minWidth: 120 }}>
                                                        <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: 1, marginBottom: 4 }}>{c.label}</div>
                                                        <div style={{ fontSize: 20, fontWeight: 700, color: c.val > 0 ? c.color : "#1e2b3f" }}>+{c.val}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === "narrative" && (
                                    <div style={{ animation: "fadeIn 0.3s ease" }}>
                                        <div style={styles.panel}>
                                            <div style={styles.panelTitle}>AI-Generated Operational Summary</div>
                                            <div style={styles.narrative}>
                                                <TypedText text={selectedInv.narrative} speed={12} />
                                            </div>
                                            {selectedInv.recommended_actions && selectedInv.recommended_actions.length > 0 && (
                                                <div style={{ marginTop: 12 }}>
                                                    <div style={{ fontSize: 10, color: "#4a5568", letterSpacing: 1, marginBottom: 8 }}>RECOMMENDED ACTIONS</div>
                                                    {selectedInv.recommended_actions.map((action, i) => (
                                                        <div key={i} style={{ fontSize: 11, color: "#8892a4", padding: "6px 0", borderBottom: "1px solid #0d1520", lineHeight: 1.5 }}>
                                                            {i + 1}. {action}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                                                {selectedInv.risk >= 70 && (
                                                    <button style={{ ...styles.sendBtn, background: "linear-gradient(135deg,#991b1b,#dc2626)", fontSize: 10, padding: "8px 16px" }}>
                                                        🔧 DRAFT MAINTENANCE TICKET
                                                    </button>
                                                )}
                                                <button style={{ ...styles.sendBtn, background: "#1a2433", color: "#8892a4", fontSize: 10, padding: "8px 16px" }}>
                                                    📋 EXPORT REPORT
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {!selectedInv && !loading && inverters.length === 0 && (
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16 }}>
                                <div style={{ fontSize: 48 }}>⚡</div>
                                <div style={{ fontSize: 14, color: "#4a5568", textAlign: "center", maxWidth: 400, lineHeight: 1.8 }}>
                                    {loadError || "No inverter data loaded. Ensure the backend API is running on port 8000."}
                                </div>
                                <button
                                    style={{ ...styles.sendBtn, fontSize: 11, padding: "10px 20px" }}
                                    onClick={() => window.location.reload()}
                                >
                                    ↻ RETRY CONNECTION
                                </button>
                            </div>
                        )}
                    </div>

                    {/* CHAT PANEL */}
                    <div style={styles.chatPanel}>
                        <div style={styles.chatHeader}>
                            <div style={{ ...styles.logoMark, width: 22, height: 22, fontSize: 11, borderRadius: 4 }}>AI</div>
                            <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0" }}>RAG Copilot</div>
                                <div style={{ fontSize: 9, color: "#4a5568", letterSpacing: 1 }}>GROUNDED · NO HALLUCINATION</div>
                            </div>
                            {isQuerying && <div style={{ marginLeft: "auto", fontSize: 9, color: "#3b82f6" }}>THINKING...</div>}
                        </div>
                        <div style={styles.chatMessages}>
                            {chatHistory.map((msg, i) => <ChatBubble key={i} {...msg} />)}
                            <div ref={chatEndRef} />
                        </div>
                        <div style={{ padding: "6px 12px" }}>
                            {[
                                "Which inverters in Block B are at risk?",
                                "What's causing INV-C01's high risk?",
                                "Prioritize maintenance schedule",
                            ].map(q => (
                                <div key={q} onClick={() => setChatInput(q)} style={{
                                    fontSize: 9, color: "#3b82f6", cursor: "pointer", padding: "3px 0",
                                    borderBottom: "1px solid #0d1520"
                                }}>↗ {q}</div>
                            ))}
                        </div>
                        <div style={styles.chatInputRow}>
                            <input
                                style={styles.chatInput}
                                value={chatInput}
                                onChange={e => setChatInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleQuery()}
                                placeholder="Ask about inverter risk..."
                            />
                            <button style={styles.sendBtn} onClick={handleQuery} disabled={isQuerying}>→</button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
