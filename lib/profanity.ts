const BLOCKED = [
  "anal",
  "anus",
  "arse",
  "asshole",
  "bastard",
  "bitch",
  "bollock",
  "cock",
  "crap",
  "cunt",
  "damn",
  "dick",
  "dildo",
  "fag",
  "fuck",
  "goddamn",
  "homo",
  "jerkoff",
  "nigger",
  "nigga",
  "piss",
  "porn",
  "pussy",
  "rape",
  "shit",
  "slut",
  "tit",
  "twat",
  "wank",
  "whore",
];

const PATTERN = new RegExp(`\\b(${BLOCKED.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\w*\\b`, "i");

export function findProfanity(text: string): string | null {
  const match = text.match(PATTERN);
  return match ? match[0] : null;
}

export function assertCleanText(...parts: string[]) {
  for (const part of parts) {
    const hit = findProfanity(part);
    if (hit) {
      throw new Error("Please keep language respectful. That word is not allowed here.");
    }
  }
}
