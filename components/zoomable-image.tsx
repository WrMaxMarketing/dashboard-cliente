"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn, ZoomOut } from "lucide-react";

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const STEP = 0.5;

// Imagem que, ao ser clicada, abre uma previa em tela cheia com zoom in/out,
// arrasto para navegar e fechamento pelo X ou clicando no fundo escuro.
export function ZoomableImage({
  src,
  alt,
  className,
  style,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={className}
        style={{ cursor: "zoom-in", ...style }}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      />
      {open && <Lightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({ active: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0 });
  // Ponteiros ativos (para pinch com 2 dedos) e estado da pinça em andamento.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef({ active: false, startDist: 0, startScale: 1 });

  const clampScale = (v: number) =>
    Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));

  const zoomBy = useCallback((delta: number) => {
    setScale((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta));
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // Fecha com ESC; trava o scroll do body enquanto aberto.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomBy(STEP);
      else if (e.key === "-" || e.key === "_") zoomBy(-STEP);
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, zoomBy]);

  function onWheel(e: ReactWheelEvent) {
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? STEP : -STEP);
  }

  function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(e: ReactPointerEvent) {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Dois dedos: inicia pinça (zoom por gesto), o padrão em imagem em tela cheia.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { active: true, startDist: dist(a, b), startScale: scale };
      drag.current.active = false;
      setDragging(false);
      return;
    }
    // Um dedo: arrasta para navegar (só faz sentido com zoom aplicado).
    if (scale <= 1) return;
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setDragging(true);
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinch.current.active && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const next = clampScale(
        pinch.current.startScale * (dist(a, b) / pinch.current.startDist)
      );
      setScale(next);
      if (next === 1) setOffset({ x: 0, y: 0 });
      return;
    }
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
    setOffset({ x: drag.current.originX + dx, y: drag.current.originY + dy });
  }

  function onPointerUp(e: ReactPointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current.active = false;
    drag.current.active = false;
    setDragging(false);
  }

  // Clique na imagem: alterna entre zoom padrao e 2x. Se estava arrastando, ignora.
  function onImageClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (drag.current.moved) return;
    setScale((prev) => (prev > 1 ? 1 : 2));
    if (scale > 1) setOffset({ x: 0, y: 0 });
  }

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Pré-visualização da imagem"}
    >
      {/* Controles */}
      <div
        className="absolute right-[max(0.75rem,env(safe-area-inset-right))] top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => zoomBy(-STEP)}
          disabled={scale <= MIN_SCALE}
          aria-label="Diminuir zoom"
          className="rounded-full bg-white/10 p-3 text-white backdrop-blur transition-colors hover:bg-white/20 active:bg-white/30 disabled:opacity-40 md:p-2"
        >
          <ZoomOut className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => zoomBy(STEP)}
          disabled={scale >= MAX_SCALE}
          aria-label="Aumentar zoom"
          className="rounded-full bg-white/10 p-3 text-white backdrop-blur transition-colors hover:bg-white/20 active:bg-white/30 disabled:opacity-40 md:p-2"
        >
          <ZoomIn className="size-5" />
        </button>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="Fechar pré-visualização"
          className="rounded-full bg-white/10 p-3 text-white backdrop-blur transition-colors hover:bg-white/20 active:bg-white/30 md:p-2"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onWheel={onWheel}
        onClick={onImageClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(e) => e.stopPropagation()}
        draggable={false}
        className="max-h-[90vh] max-w-[92vw] select-none object-contain shadow-2xl"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: dragging ? "none" : "transform 0.15s ease-out",
          cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
          touchAction: "none",
        }}
      />
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(overlay, document.body);
}
