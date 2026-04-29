import { PERIODS, PERIOD_MAP } from "./constants";

export function getPeriodLabel(periodKey) {
  return PERIOD_MAP[periodKey]?.label || periodKey || "";
}

export function sortSlots(slots) {
  return [...slots].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return PERIODS.findIndex((item) => item.key === a.periodKey) - PERIODS.findIndex((item) => item.key === b.periodKey);
  });
}

export function getSlotLabel(slot) {
  const period = PERIOD_MAP[slot.periodKey];
  return `${period.label} (${period.start}〜${period.end})`;
}

export function getSlotMetrics(slot, requests = []) {
  const confirmed = typeof slot.confirmedCount === "number"
    ? slot.confirmedCount
    : requests.filter((request) => request.assignedSlotId === slot.id).length;
  const interested = requests.length
    ? requests.filter((request) => (request.preferredSlotIds || []).includes(slot.id)).length
    : 0;
  const remaining = Math.max(Number(slot.capacity || 1) - confirmed, 0);

  return {
    confirmed,
    interested,
    remaining,
    full: remaining <= 0,
  };
}

export function getSlotEndDate(slot) {
  if (!slot?.date) return null;
  const period = PERIOD_MAP[slot.periodKey];
  const endTime = period?.end || "23:59";
  const date = new Date(`${slot.date}T${endTime}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function hasSlotEnded(slot) {
  const endDate = getSlotEndDate(slot);
  return !!endDate && endDate.getTime() < Date.now();
}

export function getDaySummary(dateKey, slots) {
  const daySlots = slots.filter((slot) => slot.date === dateKey && slot.isPublished !== false);
  const slotCount = daySlots.length;
  const totalRemaining = daySlots.reduce((sum, slot) => sum + getSlotMetrics(slot).remaining, 0);
  const fullCount = daySlots.filter((slot) => getSlotMetrics(slot).full).length;

  return {
    slotCount,
    totalRemaining,
    fullCount,
  };
}

export function getAdminDaySummary(dateKey, slots, requests = []) {
  const daySlots = slots.filter((slot) => slot.date === dateKey);
  const slotCount = daySlots.length;
  const publishedCount = daySlots.filter((slot) => slot.isPublished !== false).length;
  const hiddenCount = daySlots.filter((slot) => slot.isPublished === false).length;
  const totalCapacity = daySlots.reduce((sum, slot) => sum + Number(slot.capacity || 0), 0);
  const totalConfirmed = daySlots.reduce((sum, slot) => sum + getSlotMetrics(slot, requests).confirmed, 0);
  const totalRemaining = daySlots.reduce((sum, slot) => sum + getSlotMetrics(slot, requests).remaining, 0);
  const fullCount = daySlots.filter((slot) => getSlotMetrics(slot, requests).full).length;

  return {
    slotCount,
    publishedCount,
    hiddenCount,
    totalCapacity,
    totalConfirmed,
    totalRemaining,
    fullCount,
  };
}
