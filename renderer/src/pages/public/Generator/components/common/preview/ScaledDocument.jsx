import React, { useLayoutEffect, useRef, useState } from "react";

/**
 * Renders fixed-width content scaled to the container width.
 * `height` is the content's unscaled height (measured when omitted);
 * `visibleHeight` (unscaled px) crops the bottom, e.g. for card thumbnails.
 */
const ScaledDocument = ({ width, height, visibleHeight, className = "", children }) => {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [scale, setScale] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState(height ?? 0);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return undefined;
    const update = () => {
      setScale(container.clientWidth / width);
      if (height === undefined) setMeasuredHeight(content.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(content);
    return () => observer.disconnect();
  }, [width, height]);

  const contentHeight = height ?? measuredHeight;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden ${className}`}
      style={{ height: (visibleHeight ?? contentHeight) * scale }}
    >
      <div
        ref={contentRef}
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default ScaledDocument;
