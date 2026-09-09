/** Stored when the member shares month and day but not a year. Leap year so 29 Feb is valid. */
export const BIRTHDAY_YEAR_OMITTED = 1904;

export const BIRTHDAY_MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
] as const;

export function splitStoredBirthday(value: string | null | undefined) {
  const match = (value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return { month: "", day: "", year: "" };
  const yearNum = Number(match[1]);
  return {
    month: String(Number(match[2])),
    day: String(Number(match[3])),
    year: yearNum === BIRTHDAY_YEAR_OMITTED ? "" : String(yearNum),
  };
}

export function formatSavedBirthday(value: string | null | undefined) {
  const { month, day, year } = splitStoredBirthday(value);
  if (!month || !day) return null;
  const monthName = BIRTHDAY_MONTHS.find((item) => String(item.value) === month)?.label;
  if (!monthName) return null;
  return year ? `${day} ${monthName} ${year}` : `${day} ${monthName}`;
}

function isRealDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function buildDateOfBirth(monthRaw: string, dayRaw: string, yearRaw: string) {
  const monthText = monthRaw.trim();
  const dayText = dayRaw.trim();
  const yearText = yearRaw.trim();
  if (!monthText && !dayText && !yearText) return null;
  if (!monthText || !dayText) {
    throw new Error("Choose a birth month and day, or clear the birthday fields.");
  }

  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error("Enter a valid birthday.");
  }

  let year = BIRTHDAY_YEAR_OMITTED;
  if (yearText) {
    year = Number(yearText);
    if (!Number.isInteger(year) || year < 1905) {
      throw new Error("Enter a valid birth year, or leave it blank.");
    }
    const today = new Date();
    if (Date.UTC(year, month - 1, day) > Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) {
      throw new Error("Birthday cannot be in the future.");
    }
    if (today.getFullYear() - year > 120) {
      throw new Error("Enter a valid birth year, or leave it blank.");
    }
  }

  if (!isRealDate(year, month, day)) {
    throw new Error("Enter a valid birthday.");
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function pretoriaDateKey(value?: string | number | Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value ? new Date(value) : new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

export function isBirthdayToday(post: { is_birthday?: boolean; created_at: string }) {
  return Boolean(post.is_birthday) && pretoriaDateKey(post.created_at) === pretoriaDateKey();
}
