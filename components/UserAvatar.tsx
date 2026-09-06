"use client";

import { IconUserOff } from "@tabler/icons-react";
import { avatarTone, initials } from "@/lib/format";

export function UserAvatar({
  name,
  src,
  className = "post-avatar",
  anonymous = false,
}: {
  name: string;
  src?: string | null;
  className?: string;
  anonymous?: boolean;
}) {
  if (anonymous) {
    return (
      <div className={`${className} av-anon`}>
        <IconUserOff size={14} />
      </div>
    );
  }
  if (src) {
    return (
      <div className={`${className} has-photo`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
      </div>
    );
  }
  return <div className={`${className} ${avatarTone(name)}`}>{initials(name)}</div>;
}
