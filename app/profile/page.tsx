import { redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { fetchBadgeAwards } from "@/lib/activity";
import { Navbar } from "@/components/Navbar";
import { updateProfile } from "@/app/actions/account";
import { removeAvatar, saveAvatarUrl } from "@/app/actions/avatar";
import { AvatarEditor } from "@/components/AvatarEditor";
import { NotificationSettings } from "@/components/NotificationSettings";
import { BadgeGrid } from "@/components/BadgeGrid";

export default async function ProfilePage() {
  const { profile, groups } = await getAuthContext();
  if (!profile) redirect("/login");

  const awards = await fetchBadgeAwards(profile.id);

  return (
    <>
      <Navbar profile={profile} groups={groups} />
      <a className="back-link" href="/">
        <IconArrowLeft size={16} /> Back to feed
      </a>
      <div className="auth-card">
        <h1 className="auth-title">Your profile</h1>
        <p className="auth-sub">This name is shown on posts unless you post anonymously.</p>
        <AvatarEditor profile={profile} saveAvatarUrl={saveAvatarUrl} removeAvatar={removeAvatar} />
        <NotificationSettings profile={profile} />
        <form action={updateProfile}>
          <div className="form-row">
            <label className="form-label" htmlFor="display_name">
              Display name
            </label>
            <input
              className="form-input"
              id="display_name"
              name="display_name"
              defaultValue={profile.display_name}
              required
            />
          </div>
          <div className="form-row">
            <label className="form-label" htmlFor="date_of_birth">
              Date of birth
            </label>
            <input
              className="form-input"
              id="date_of_birth"
              name="date_of_birth"
              type="date"
              defaultValue={(profile.date_of_birth || "").slice(0, 10)}
            />
            <p className="anon-hint">Optional. Used only for birthday celebrations.</p>
          </div>
          <div className="form-row">
            <p className="form-label">Birthday privacy</p>
            <div className="anon-options" role="radiogroup" aria-label="Birthday privacy">
              <label className={`anon-option${profile.celebrate_birthday ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="celebrate_birthday"
                  value="true"
                  defaultChecked={profile.celebrate_birthday}
                />
                Celebrate my birthday publicly
              </label>
              <label className={`anon-option${!profile.celebrate_birthday ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="celebrate_birthday"
                  value="false"
                  defaultChecked={!profile.celebrate_birthday}
                />
                Keep private
              </label>
            </div>
            <p className="anon-hint">
              Public posts go on the feed with your name and photo. Private birthdays are only shown to admins.
            </p>
          </div>
          <p className="form-label">Role: {profile.role === "admin" ? "Admin" : "Member"}</p>
          <button className="submit-btn" type="submit">
            Save
          </button>
        </form>
      </div>
      <div className="section-label">Your badges</div>
      <p className="auth-sub">Earned from community posts, comments, and likes. Other members can see these on your profile.</p>
      <BadgeGrid awards={awards} />
    </>
  );
}
