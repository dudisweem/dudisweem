"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/ui/Icon";

/**
 * Drawn signature (pointer events: finger, stylus, mouse). Writes a PNG data URL into a hidden
 * input named `name`. Optional by design: the typed full name next to it is the accessible,
 * required signature for anyone who can't or prefers not to draw.
 */
export function SignaturePad({ name, label }: { name: string; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  // size the bitmap to the element (crisp on retina), keep 2:1-ish strokes
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const rect = c.getBoundingClientRect();
    c.width = Math.round(rect.width * ratio);
    c.height = Math.round(rect.height * ratio);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#0E2F4B";
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const commit = () => {
    const c = canvasRef.current;
    if (c && inputRef.current) inputRef.current.value = c.toDataURL("image/png");
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = "#0E2F4B";
      ctx.fill();
    }
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || !last.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    if (!hasInk) setHasInk(true);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    if (hasInk) commit();
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    if (inputRef.current) inputRef.current.value = "";
    setHasInk(false);
  };

  return (
    <div className="stack-s">
      <span className="lab" id={`${name}-label`} style={{ fontWeight: 700, fontSize: 14.5 }}>{label}</span>
      <div className="sig">
        <canvas
          ref={canvasRef}
          role="img"
          aria-labelledby={`${name}-label`}
          aria-describedby={`${name}-hint`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onPointerLeave={up}
        />
        <span className="base" />
        <span className="ph" id={`${name}-hint`}>{hasInk ? "נחתם" : "חתמו כאן באצבע או בעכבר (לא חובה — השם המוקלד הוא החתימה)"}</span>
      </div>
      <input ref={inputRef} type="hidden" name={name} defaultValue="" />
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn quiet sm" onClick={clear} disabled={!hasInk}>
          <Icon name="refresh" small />
          ניקוי החתימה
        </button>
      </div>
    </div>
  );
}
