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
import { DeactivateAccountButton } from "@/components/DeactivateAccountButton";
import { BIRTHDAY_MONTHS, formatSavedBirthday, splitStoredBirthday } from "@/lib/birthday";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const { profile, groups } = await getAuthContext();
  if (!profile) redirect("/login");

  const query = await searchParams;
  const awards = await fetchBadgeAwards(profile.id);
  const birthday = splitStoredBirthday(profile.date_of_birth);
  const savedBirthday = formatSavedBirthday(profile.date_of_birth);

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
          {query.saved ? <div className="banner-ok">Profile saved.</div> : null}
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
            <p className="form-label" id="birthday-label">
              Birthday
            </p>
            <div
              className="birthday-fields"
              role="group"
              aria-labelledby="birthday-label"
              key={profile.date_of_birth || "birthday-empty"}
            >
              <label className="sr-only" htmlFor="birth_month">
                Month
              </label>
              <select className="form-input" id="birth_month" name="birth_month" defaultValue={birthday.month}>
                <option value="">Month</option>
                {BIRTHDAY_MONTHS.map((month) => (
                  <option key={month.value} value={String(month.value)}>
                    {month.label}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="birth_day">
                Day
              </label>
              <select className="form-input" id="birth_day" name="birth_day" defaultValue={birthday.day}>
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={String(day)}>
                    {day}
                  </option>
                ))}
              </select>
              <label className="sr-only" htmlFor="birth_year">
                Year (optional)
              </label>
              <input
                className="form-input"
                id="birth_year"
                name="birth_year"
                inputMode="numeric"
                maxLength={4}
                placeholder="Year (optional)"
                defaultValue={birthday.year}
                autoComplete="off"
              />
            </div>
            {savedBirthday ? (
              <p className="banner-ok birthday-saved">Saved: {savedBirthday}</p>
            ) : (
              <p className="anon-hint">Optional. Month and day are enough. Year is not required.</p>
            )}
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
        <DeactivateAccountButton userId={profile.id} name={profile.display_name} isSelf />
      </div>
      <div className="section-label">Your badges</div>
      <p className="auth-sub">Earned from community posts, comments, and likes. Other members can see these on your profile.</p>
      <BadgeGrid awards={awards} />
    </>
  );
}
