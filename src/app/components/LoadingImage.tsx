"use client";

import { useState, type CSSProperties } from "react";

type Props = {
  alt: string;
  className?: string;
  fallbackSrc?: string;
  loading?: "eager" | "lazy";
  showStatus?: boolean;
  src?: string | null;
  statusClassName?: string;
  style?: CSSProperties;
  wrapperClassName?: string;
};

export function LoadingImage({
  src,
  ...props
}: Props) {
  return <LoadingImageInner key={src ?? ""} src={src} {...props} />;
}

function LoadingImageInner({
  alt,
  className,
  fallbackSrc,
  loading = "lazy",
  showStatus = true,
  src,
  statusClassName,
  style,
  wrapperClassName,
}: Props) {
  const [currentSrc, setCurrentSrc] = useState(src ?? "");
  const [status, setStatus] = useState<"loading" | "loaded" | "error">(src ? "loading" : "error");

  return (
    <span className={`loading-image ${status}${wrapperClassName ? ` ${wrapperClassName}` : ""}`}>
      {currentSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={alt}
          className={className}
          loading={loading}
          onError={() => {
            if (fallbackSrc && currentSrc !== fallbackSrc) {
              setCurrentSrc(fallbackSrc);
              setStatus("loading");
              return;
            }
            setStatus("error");
          }}
          onLoad={() => setStatus("loaded")}
          src={currentSrc}
          style={style}
        />
      ) : null}
      {showStatus && status !== "loaded" ? (
        <span className={`loading-image-status${statusClassName ? ` ${statusClassName}` : ""}`}>
          {status === "error" ? "Image indisponible" : "Chargement..."}
        </span>
      ) : null}
    </span>
  );
}
