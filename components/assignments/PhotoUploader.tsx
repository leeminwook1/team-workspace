"use client";

import { useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { resizeImage, photoUrl } from "@/lib/imageResize";

export type Photo = { pathname: string; caption: string };

const MAX = 12;

// 사진 여러 장 업로드 + 장별 설명 + 순서 변경·삭제 (레퍼런스·제출물 공용)
export default function PhotoUploader({
  value, onChange, captionPlaceholder = "사진 설명 (선택)", disabled,
}: {
  value: Photo[]; onChange: (next: Photo[]) => void; captionPlaceholder?: string; disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0); // 업로드 중인 장수
  const [err, setErr] = useState("");
  const latest = useRef(value);
  latest.current = value;

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr("");
    const room = MAX - latest.current.length;
    const list = Array.from(files).slice(0, room);
    if (files.length > room) setErr(`최대 ${MAX}장까지 올릴 수 있어요.`);
    setBusy((n) => n + list.length);
    // 순서 보존을 위해 순차 업로드
    for (const f of list) {
      try {
        const blob = await resizeImage(f);
        const fd = new FormData();
        fd.append("file", blob, "photo.jpg");
        const res = await fetch("/api/assignments/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({} as any));
        if (!res.ok) throw new Error(data.error ?? "업로드 실패");
        onChange([...latest.current, { pathname: data.pathname, caption: "" }]);
      } catch (e: any) {
        setErr(e?.message ?? "업로드에 실패했어요.");
      } finally {
        setBusy((n) => n - 1);
      }
    }
  }

  function move(i: number, d: number) {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  return (
    <div className="pu">
      {value.length > 0 && (
        <div className="pu-grid">
          {value.map((p, i) => (
            <div className="pu-item" key={p.pathname}>
              <div className="pu-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(p.pathname)} alt={p.caption || `사진 ${i + 1}`} loading="lazy" />
                <span className="pu-idx">{i + 1}</span>
                {!disabled && (
                  <div className="pu-ctrl">
                    <button type="button" aria-label="앞으로" disabled={i === 0} onClick={() => move(i, -1)}><Icon name="chevronL" size={12} /></button>
                    <button type="button" aria-label="뒤로" disabled={i === value.length - 1} onClick={() => move(i, 1)}><Icon name="chevronR" size={12} /></button>
                    <button type="button" aria-label="삭제" className="pu-x" onClick={() => onChange(value.filter((_, k) => k !== i))}>✕</button>
                  </div>
                )}
              </div>
              <input
                className="pu-caption"
                value={p.caption}
                maxLength={300}
                disabled={disabled}
                placeholder={captionPlaceholder}
                onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, caption: e.target.value } : x)))}
              />
            </div>
          ))}
        </div>
      )}

      {!disabled && value.length < MAX && (
        <button type="button" className="pu-add" onClick={() => inputRef.current?.click()} disabled={busy > 0}>
          <Icon name="plus" size={16} strokeWidth={2.4} />
          {busy > 0 ? `업로드 중… (${busy}장 남음)` : `사진 추가 (${value.length}/${MAX})`}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
      />
      {err && <p className="err-msg" style={{ marginTop: 6 }}>{err}</p>}
    </div>
  );
}
