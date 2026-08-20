"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";

type GalleryImage = {
  id: string;
  url: string;
  alt: string;
};

type Point = { x: number; y: number };

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.5;

export function ProductGallery({
  images,
  productName,
}: {
  images: GalleryImage[];
  productName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<
    | {
        pointerId: number;
        origin: Point;
        pan: Point;
      }
    | undefined
  >(undefined);

  const count = images.length;
  const activeImage = images[activeIndex];
  const activeAlt =
    activeImage?.alt || `${productName}, product photo ${activeIndex + 1}`;

  const resetView = useCallback(() => {
    setZoom(MIN_ZOOM);
    setPan({ x: 0, y: 0 });
    dragRef.current = undefined;
  }, []);

  const selectImage = useCallback(
    (index: number) => {
      if (!count) return;
      setActiveIndex((index + count) % count);
      resetView();
    },
    [count, resetView],
  );

  const closeViewer = useCallback(() => {
    setViewerOpen(false);
    resetView();
    window.requestAnimationFrame(() => openerRef.current?.focus());
  }, [resetView]);

  const openViewer = () => {
    setViewerOpen(true);
    resetView();
  };

  const clampPan = useCallback((next: Point, nextZoom: number) => {
    const stage = stageRef.current;
    if (!stage || nextZoom <= MIN_ZOOM) return { x: 0, y: 0 };
    const maxX = (stage.clientWidth * (nextZoom - 1)) / 2;
    const maxY = (stage.clientHeight * (nextZoom - 1)) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, next.x)),
      y: Math.max(-maxY, Math.min(maxY, next.y)),
    };
  }, []);

  const changeZoom = useCallback(
    (next: number) => {
      const normalized = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      setZoom(normalized);
      setPan((current) => clampPan(current, normalized));
    },
    [clampPan],
  );

  useEffect(() => {
    if (!viewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeViewer();
      } else if (event.key === "ArrowLeft" && count > 1) {
        event.preventDefault();
        selectImage(activeIndex - 1);
      } else if (event.key === "ArrowRight" && count > 1) {
        event.preventDefault();
        selectImage(activeIndex + 1);
      } else if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changeZoom(zoom + ZOOM_STEP);
      } else if (event.key === "-") {
        event.preventDefault();
        changeZoom(zoom - ZOOM_STEP);
      } else if (event.key === "0") {
        event.preventDefault();
        resetView();
      } else if (event.key === "Tab") {
        const dialog = stageRef.current?.closest("[role='dialog']");
        const controls = dialog?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), [href], [tabindex]:not([tabindex='-1'])",
        );
        if (!controls?.length) return;
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    activeIndex,
    changeZoom,
    closeViewer,
    count,
    resetView,
    selectImage,
    viewerOpen,
    zoom,
  ]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (zoom <= MIN_ZOOM) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      origin: { x: event.clientX, y: event.clientY },
      pan,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPan(
      clampPan(
        {
          x: drag.pan.x + event.clientX - drag.origin.x,
          y: drag.pan.y + event.clientY - drag.origin.y,
        },
        zoom,
      ),
    );
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    changeZoom(zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }

  if (!activeImage) {
    return (
      <section className="product-gallery product-gallery-empty" aria-label="Product photos">
        <p>Product photos coming soon</p>
      </section>
    );
  }

  return (
    <section className="product-gallery" aria-label={`${productName} photos`}>
      <div className={`gallery-layout${count === 1 ? " single-image" : ""}`}>
        {count > 1 && (
          <div className="gallery-thumbnails" aria-label="Choose a product photo">
            {images.map((image, index) => (
              <button
                className={index === activeIndex ? "active" : ""}
                type="button"
                key={image.id}
                aria-label={`View photo ${index + 1} of ${count}`}
                aria-pressed={index === activeIndex}
                onClick={() => selectImage(index)}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="96px"
                  unoptimized
                />
                <span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
        )}

        <div className="gallery-main">
          <div className="gallery-main-frame">
            <button
              className="gallery-open"
              type="button"
              ref={openerRef}
              aria-label={`Inspect photo ${activeIndex + 1} of ${count} in full screen`}
              onClick={openViewer}
            >
              <Image
                key={activeImage.id}
                src={activeImage.url}
                alt={activeAlt}
                fill
                priority={activeIndex === 0}
                sizes="(max-width: 1000px) calc(100vw - 38px), 65vw"
                unoptimized
              />
              <span className="gallery-inspect-hint">
                <b aria-hidden="true">+</b>
                Inspect details
              </span>
            </button>

            {count > 1 && (
              <div className="gallery-stepper" aria-label="Photo navigation">
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => selectImage(activeIndex - 1)}
                >
                  &larr;
                </button>
                <span aria-live="polite">
                  {activeIndex + 1} / {count}
                </span>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => selectImage(activeIndex + 1)}
                >
                  &rarr;
                </button>
              </div>
            )}
          </div>

          <div className="gallery-caption">
            <span>Full model view</span>
            <button type="button" onClick={openViewer}>
              Open inspection viewer
            </button>
          </div>
        </div>
      </div>

      {viewerOpen && (
        <div
          className="inspection-viewer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inspection-viewer-title"
        >
          <header className="inspection-toolbar">
            <div>
              <span>
                Photo {activeIndex + 1} of {count}
              </span>
              <strong id="inspection-viewer-title">{productName}</strong>
            </div>
            <div className="inspection-zoom" aria-label="Zoom controls">
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => changeZoom(zoom - ZOOM_STEP)}
              >
                &minus;
              </button>
              <button type="button" onClick={resetView} aria-label="Reset to fit full image">
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => changeZoom(zoom + ZOOM_STEP)}
              >
                +
              </button>
            </div>
            <button
              className="inspection-close"
              type="button"
              ref={closeRef}
              aria-label="Close inspection viewer"
              onClick={closeViewer}
            >
              <span>Close</span>
              &times;
            </button>
          </header>

          <div
            className={`inspection-stage${zoom > MIN_ZOOM ? " zoomed" : ""}`}
            ref={stageRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            onDoubleClick={() => changeZoom(zoom === MIN_ZOOM ? 2.5 : MIN_ZOOM)}
          >
            <Image
              key={activeImage.id}
              className="inspection-image"
              src={activeImage.url}
              alt={activeAlt}
              fill
              sizes="100vw"
              unoptimized
              draggable={false}
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              }}
            />
          </div>

          {count > 1 && (
            <>
              <button
                className="inspection-nav previous"
                type="button"
                aria-label="Previous photo"
                onClick={() => selectImage(activeIndex - 1)}
              >
                &larr;
              </button>
              <button
                className="inspection-nav next"
                type="button"
                aria-label="Next photo"
                onClick={() => selectImage(activeIndex + 1)}
              >
                &rarr;
              </button>
            </>
          )}

          <p className="inspection-help">
            100% fits the full image. Scroll or use + / &minus; to zoom. Drag to inspect.
          </p>
        </div>
      )}
    </section>
  );
}
