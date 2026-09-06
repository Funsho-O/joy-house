import { redirect } from "next/navigation";
import { IconArrowLeft } from "@tabler/icons-react";
import { getAuthContext } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";
import { updateDisplayName } from "@/app/actions/account";
import { removeAvatar, saveAvatarUrl } from "@/app/actions/avatar";
import { AvatarEditor } from "@/components/AvatarEditor";

export default async function ProfilePage() {
  const { profile } = await getAuthContext();
  if (!profile) redirect("/login");

  return (
    <>
      <Navbar profile={profile} />
      <a className="back-link" href="/">
        <IconArrowLeft size={16} /> Back to feed
      </a>
      <div className="auth-card">
        <h1 className="auth-title">Your profile</h1>
        <p className="auth-sub">
          This name is shown on posts unless you post anonymously. Leaders can still see who wrote anonymous posts.
        </p>
        <AvatarEditor profile={profile} saveAvatarUrl={saveAvatarUrl} removeAvatar={removeAvatar} />
        <form action={updateDisplayName}>
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
          <p className="form-label">Role: {profile.role === "admin" ? "Admin" : "Member"}</p>
          <button className="submit-btn" type="submit">
            Save
          </button>
        </form>
      </div>
    </>
  );
}
