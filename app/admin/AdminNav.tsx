export function AdminNav({
  active,
}: {
  active: "queue" | "activity" | "groups" | "members";
}) {
  const title =
    active === "queue"
      ? "Admin queue"
      : active === "activity"
        ? "Activity"
        : active === "groups"
          ? "Manage groups"
          : "Assign admins";

  return (
    <div className="admin-tabs">
      <span className="section-label">{title}</span>
      <div className="admin-tab-links">
        {active !== "queue" ? (
          <a className="back-link" href="/admin">
            Admin queue
          </a>
        ) : null}
        {active !== "activity" ? (
          <a className="back-link" href="/admin/activity">
            Activity
          </a>
        ) : null}
        {active !== "groups" ? (
          <a className="back-link" href="/admin/groups">
            Manage groups
          </a>
        ) : null}
        {active !== "members" ? (
          <a className="back-link" href="/admin/members">
            Assign admins
          </a>
        ) : null}
      </div>
    </div>
  );
}
