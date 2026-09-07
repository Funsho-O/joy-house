"use client";

import { useEffect, useState } from "react";

export function PostImage({ src, alt = "" }: { src: string; alt?: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      <button type="button" className="post-image-btn" onClick={() => setOpen(true)} aria-label="View full photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="post-image" src={src} alt={alt} />
      </button>
      {open ? (
        <div
          className="post-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Full photo"
          onClick={() => setOpen(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} />
        </div>
      ) : null}
    </>
  );
}
