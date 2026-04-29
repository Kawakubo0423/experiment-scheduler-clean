import { PERIODS } from "./constants";
import { hasSlotEnded } from "./slot-utils";

export function generateLineLinkCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export function getParticipantConfirmationLabel(status) {
  if (status === "confirmed") return "確認済み";
  if (status === "change_requested") return "変更希望";
  if (status === "invalid") return "無効";
  return "未確認";
}

export function getParticipantConfirmationTone(status) {
  if (status === "confirmed") return "emerald";
  if (status === "change_requested") return "rose";
  if (status === "invalid") return "slate";
  return "amber";
}

export function getLineLinkLabel(request = {}) {
  if (request.lineNotifyEnabled === true && request.lineUserId) return "LINE連携済み";
  if (request.lineUserId && request.lineNotifyEnabled === false) return "LINE通知OFF";
  return "LINE未連携";
}

export function getLineLinkTone(request = {}) {
  if (request.lineNotifyEnabled === true && request.lineUserId) return "emerald";
  if (request.lineUserId && request.lineNotifyEnabled === false) return "amber";
  return "amber";
}

export function getLineLinkDetail(request = {}) {
  if (request.lineNotifyEnabled === true && request.lineUserId) {
    return request.lineDisplayName ? `連携済み（${request.lineDisplayName}）` : "連携済み";
  }
  if (request.lineUserId && request.lineNotifyEnabled === false) {
    return request.lineDisplayName ? `通知OFF（${request.lineDisplayName}）` : "通知OFF";
  }
  return "未連携";
}

export function isRequestCompleted(request) {
  return (request?.operationStatus || "active") === "completed";
}

export function isPastScheduledRequest(request, slots = []) {
  if (!request?.assignedSlotId || isRequestCompleted(request)) return false;
  const assignedSlot = slots.find((slot) => slot.id === request.assignedSlotId);
  return hasSlotEnded(assignedSlot);
}

export function getRequestTimestampValue(value) {
  if (!value) return 0;
  if (typeof value.seconds === "number") return value.seconds;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  return 0;
}

export function getRequestAssignedSlotOrder(request, slots = []) {
  const slot = slots.find((item) => item.id === request?.assignedSlotId);
  if (!slot) return Number.MAX_SAFE_INTEGER;
  const periodIndex = PERIODS.findIndex((period) => period.key === slot.periodKey);
  const safePeriodIndex = periodIndex >= 0 ? periodIndex : 99;
  return Number(`${String(slot.date || "9999-12-31").replaceAll("-", "")}${String(safePeriodIndex).padStart(2, "0")}`);
}

export function getRequestDefaultPriority(request) {
  const status = request?.participantConfirmationStatus || "pending";
  if (status === "change_requested") return 0;
  if (status === "pending") return 1;
  return 2;
}
