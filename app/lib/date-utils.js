// Year-keyed cache so getJapaneseHolidayMap is computed at most once per year per session
const _holidayMapCache = new Map();

export function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatJapaneseDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return date.toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export function formatMonthTitle(date) {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return safeDate.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
  });
}

export function nthWeekdayOfMonth(year, monthIndex, weekday, nth) {
  const first = new Date(year, monthIndex, 1);
  const offset = (7 + weekday - first.getDay()) % 7;
  return new Date(year, monthIndex, 1 + offset + (nth - 1) * 7);
}

export function calcVernalEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

export function calcAutumnalEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

export function getJapaneseHolidayMap(year) {
  if (_holidayMapCache.has(year)) return _holidayMapCache.get(year);

  const holidays = new Map();
  const addHoliday = (monthIndex, day, name) => {
    const key = formatDateKey(new Date(year, monthIndex, day));
    holidays.set(key, name);
  };

  addHoliday(0, 1, "元日");
  addHoliday(1, 11, "建国記念の日");
  addHoliday(1, 23, "天皇誕生日");
  addHoliday(3, 29, "昭和の日");
  addHoliday(4, 3, "憲法記念日");
  addHoliday(4, 4, "みどりの日");
  addHoliday(4, 5, "こどもの日");
  addHoliday(7, 11, "山の日");
  addHoliday(10, 3, "文化の日");
  addHoliday(10, 23, "勤労感謝の日");

  holidays.set(formatDateKey(nthWeekdayOfMonth(year, 0, 1, 2)), "成人の日");
  holidays.set(formatDateKey(nthWeekdayOfMonth(year, 6, 1, 3)), "海の日");
  holidays.set(formatDateKey(nthWeekdayOfMonth(year, 8, 1, 3)), "敬老の日");
  holidays.set(formatDateKey(nthWeekdayOfMonth(year, 9, 1, 2)), "スポーツの日");

  addHoliday(2, calcVernalEquinoxDay(year), "春分の日");
  addHoliday(8, calcAutumnalEquinoxDay(year), "秋分の日");

  const substituteTargets = Array.from(holidays.keys()).sort();
  substituteTargets.forEach((key) => {
    const holidayDate = new Date(`${key}T00:00:00`);
    if (holidayDate.getDay() !== 0) return;
    const substitute = new Date(holidayDate);
    substitute.setDate(substitute.getDate() + 1);
    while (holidays.has(formatDateKey(substitute))) {
      substitute.setDate(substitute.getDate() + 1);
    }
    holidays.set(formatDateKey(substitute), "振替休日");
  });

  const firstDay = new Date(year, 0, 1);
  const lastDay = new Date(year, 11, 31);
  for (let current = new Date(firstDay); current <= lastDay; current.setDate(current.getDate() + 1)) {
    const key = formatDateKey(current);
    if (holidays.has(key)) continue;
    const prev = new Date(current);
    prev.setDate(prev.getDate() - 1);
    const next = new Date(current);
    next.setDate(next.getDate() + 1);
    if (holidays.has(formatDateKey(prev)) && holidays.has(formatDateKey(next)) && current.getDay() !== 0) {
      holidays.set(key, "国民の休日");
    }
  }

  _holidayMapCache.set(year, holidays);
  return holidays;
}

export function getJapaneseHolidayName(date) {
  return getJapaneseHolidayMap(date.getFullYear()).get(formatDateKey(date)) || "";
}

export function getMonthGrid(baseMonth) {
  const safeBaseMonth = baseMonth instanceof Date && !Number.isNaN(baseMonth.getTime()) ? baseMonth : new Date();
  const firstDay = new Date(safeBaseMonth.getFullYear(), safeBaseMonth.getMonth(), 1);
  const lastDay = new Date(safeBaseMonth.getFullYear(), safeBaseMonth.getMonth() + 1, 0);

  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - firstDay.getDay());

  const end = new Date(lastDay);
  end.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

  const days = [];
  const current = new Date(start);
  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return days;
}
