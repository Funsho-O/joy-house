import {
  IconAward,
  IconCalendarWeek,
  IconFlame,
  IconHeart,
  IconMessageCircle,
  IconPencil,
} from "@tabler/icons-react";
import { BADGE_CATALOG } from "@/lib/badges";
import type { BadgeAward, BadgeId } from "@/lib/types";

const ICONS: Record<BadgeId, typeof IconPencil> = {
  first_post: IconPencil,
  prayer_warrior: IconAward,
  encourager: IconMessageCircle,
  trending: IconFlame,
  faithful: IconCalendarWeek,
  most_loved: IconHeart,
};

export function BadgeGrid({
  awards,
  emptyLabel = "No badges earned yet.",
}: {
  awards: BadgeAward[];
  emptyLabel?: string;
}) {
  const earned = new Map(awards.map((award) => [award.id, award.earned_at]));
  const unlocked = BADGE_CATALOG.filter((badge) => earned.has(badge.id));
  const locked = BADGE_CATALOG.filter((badge) => !earned.has(badge.id));

  if (unlocked.length === 0 && locked.length === 0) {
    return <div className="empty-state">{emptyLabel}</div>;
  }

  return (
    <div className="badge-grid">
      {unlocked.map((badge) => {
        const Icon = ICONS[badge.id];
        return (
          <div className="badge-card earned" key={badge.id}>
            <div className="badge-icon">
              <Icon size={18} />
            </div>
            <div>
              <div className="badge-name">{badge.name}</div>
              <div className="badge-desc">{badge.description}</div>
            </div>
          </div>
        );
      })}
      {locked.map((badge) => {
        const Icon = ICONS[badge.id];
        return (
          <div className="badge-card locked" key={badge.id}>
            <div className="badge-icon">
              <Icon size={18} />
            </div>
            <div>
              <div className="badge-name">{badge.name}</div>
              <div className="badge-desc">{badge.description}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
