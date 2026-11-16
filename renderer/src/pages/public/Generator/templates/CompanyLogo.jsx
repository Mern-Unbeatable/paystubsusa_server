import { useState } from "react";

/**
 * Company logo fitted inside a `boxWidth` × `boxHeight` area with its original colors,
 * transparency and aspect ratio. Renders nothing when there is no usable image.
 * With `shrink`, the logo takes only the width it needs (up to `boxWidth`), so content
 * placed after it in a row sits right next to the image.
 */
const CompanyLogo = ({ src, boxWidth, boxHeight, align = "left", shrink = false, className, style }) => {
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src || failedSrc === src) return null;

  if (shrink) {
    return (
      <img
        src={src}
        alt=""
        onError={() => setFailedSrc(src)}
        className={className}
        style={{
          display: "block",
          flexShrink: 0,
          width: "auto",
          height: "auto",
          maxWidth: boxWidth,
          maxHeight: boxHeight,
          objectFit: "contain",
          ...style,
        }}
      />
    );
  }

  return (
    <div
      className={className}
      style={{
        width: boxWidth,
        height: boxHeight,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: align === "left" ? "flex-start" : "center",
        ...style,
      }}
    >
      <img
        src={src}
        alt=""
        onError={() => setFailedSrc(src)}
        style={{
          display: "block",
          width: "auto",
          height: "auto",
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
        }}
      />
    </div>
  );
};

export default CompanyLogo;
