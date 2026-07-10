"use client";

// 추천 색상(프리셋) + 직접 선택(OS 색상 피커) + HEX 직접 입력
export const PRESET_COLORS = ["#3182f6", "#f0466e", "#8b5cf6", "#12b3a6", "#e8951b", "#f97316", "#22c55e", "#64748b"];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const v = value ?? "";
  const isHex = /^#[0-9a-fA-F]{6}$/.test(v);
  const isPreset = PRESET_COLORS.includes(v.toLowerCase());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c} type="button" aria-label={c} onClick={() => onChange(c)}
            style={{
              width: 30, height: 30, borderRadius: 9, background: c, border: 0, cursor: "pointer",
              outline: v.toLowerCase() === c ? "3px solid var(--accent-soft)" : "none",
              boxShadow: v.toLowerCase() === c ? `0 0 0 2px ${c}` : "none",
            }}
          />
        ))}
        {/* 직접 선택 — OS 색상 피커 */}
        <label title="직접 선택" style={{ position: "relative", width: 30, height: 30, cursor: "pointer", flex: "none" }}>
          <input
            type="color"
            value={isHex ? v : "#3182f6"}
            onChange={(e) => onChange(e.target.value)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }}
          />
          <span
            aria-hidden
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 9, fontSize: 17, fontWeight: 700, color: "#fff",
              background: "conic-gradient(from 0deg, #f0466e, #e8951b, #22c55e, #12b3a6, #3182f6, #8b5cf6, #f0466e)",
              outline: isHex && !isPreset ? "3px solid var(--accent-soft)" : "none",
              boxShadow: isHex && !isPreset ? `0 0 0 2px ${v}` : "none",
            }}
          >
            +
          </span>
        </label>
      </div>

      {/* HEX 직접 입력 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: isHex ? v : "transparent", border: "1px solid var(--line)", flex: "none" }} />
        <input
          type="text" value={v} maxLength={7} spellCheck={false} placeholder="#RRGGBB"
          onChange={(e) => {
            let s = e.target.value.trim();
            if (s && !s.startsWith("#")) s = "#" + s.replace(/#/g, "");
            onChange(s);
          }}
          style={{
            width: 120, padding: "7px 10px", fontSize: 13, fontFamily: "monospace",
            border: "1px solid var(--line)", borderRadius: "var(--r-sm)", background: "var(--surface)", color: "var(--ink)",
          }}
        />
      </div>
    </div>
  );
}
