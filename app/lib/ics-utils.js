import { PERIOD_MAP } from "./constants";

function padTwo(n) {
  return String(n).padStart(2, "0");
}

// "2026-04-21" + "13:10" → "20260421T131000"
function formatIcsLocalDateTime(dateString, timeString) {
  const [year, month, day] = dateString.split("-");
  const [hour, minute] = timeString.split(":");
  return `${year}${padTwo(month)}${padTwo(day)}T${padTwo(hour)}${padTwo(minute)}00`;
}

// Escape special characters per RFC 5545
function escapeIcsText(text = "") {
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Fold long lines to <= 75 octets per RFC 5545
function foldIcsLine(line) {
  const encoded = new TextEncoder().encode(line);
  if (encoded.length <= 75) return line;
  const parts = [];
  let pos = 0;
  let first = true;
  while (pos < line.length) {
    const prefix = first ? "" : " ";
    const available = first ? 75 : 74;
    let chunk = "";
    let byteCount = 0;
    for (const char of line.slice(pos)) {
      const charBytes = new TextEncoder().encode(char).length;
      if (byteCount + charBytes > available) break;
      chunk += char;
      byteCount += charBytes;
    }
    parts.push(prefix + chunk);
    pos += chunk.length;
    first = false;
  }
  return parts.join("\r\n");
}

/**
 * Build a .ics VEVENT block from a slot object.
 * @param {object} slot  - { date, periodKey, location, note }
 * @param {string} summary - Event title (SUMMARY field)
 * @param {string} description - Optional description
 * @param {string} uid - Unique identifier for the event
 */
function buildVEvent({ slot, summary, description = "", uid }) {
  const period = PERIOD_MAP[slot.periodKey];
  if (!period || !slot.date) return "";

  const dtStart = formatIcsLocalDateTime(slot.date, period.start);
  const dtEnd = formatIcsLocalDateTime(slot.date, period.end);
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${padTwo(now.getUTCMonth() + 1)}${padTwo(now.getUTCDate())}T${padTwo(now.getUTCHours())}${padTwo(now.getUTCMinutes())}${padTwo(now.getUTCSeconds())}Z`;

  const lines = [
    "BEGIN:VEVENT",
    foldIcsLine(`UID:${escapeIcsText(uid)}`),
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=Asia/Tokyo:${dtStart}`,
    `DTEND;TZID=Asia/Tokyo:${dtEnd}`,
    foldIcsLine(`SUMMARY:${escapeIcsText(summary)}`),
  ];

  if (slot.location) {
    lines.push(foldIcsLine(`LOCATION:${escapeIcsText(slot.location)}`));
  }

  const descParts = [description, slot.note].filter(Boolean).join("\\n");
  if (descParts) {
    lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(descParts)}`));
  }

  lines.push("END:VEVENT");
  return lines.join("\r\n");
}

/**
 * Generate a complete .ics calendar file content string.
 * @param {Array<{slot, summary, description, uid}>} events
 * @param {string} calendarName - X-WR-CALNAME value
 */
export function generateIcsContent(events, calendarName = "LabLink") {
  const vevents = events.map(buildVEvent).filter(Boolean);
  if (vevents.length === 0) return "";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LabLink//LabLink//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldIcsLine(`X-WR-CALNAME:${escapeIcsText(calendarName)}`),
    "X-WR-TIMEZONE:Asia/Tokyo",
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Tokyo",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:JST",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n");
}

/**
 * Trigger a .ics file download in the browser.
 * @param {string} filename
 * @param {Array} events
 * @param {string} calendarName
 */
export function downloadIcsFile(filename, events, calendarName = "LabLink") {
  const content = generateIcsContent(events, calendarName);
  if (!content) return;
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
