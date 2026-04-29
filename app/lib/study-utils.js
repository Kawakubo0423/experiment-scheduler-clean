import { DEFAULT_STUDY_ID, DEFAULT_EXPERIMENT_INFO } from "./constants";

export function normalizeExperimentInfo(raw = {}) {
  return {
    title: raw.title ?? DEFAULT_EXPERIMENT_INFO.title,
    description: raw.description ?? DEFAULT_EXPERIMENT_INFO.description,
    duration: raw.duration ?? DEFAULT_EXPERIMENT_INFO.duration,
    reward: raw.reward ?? DEFAULT_EXPERIMENT_INFO.reward,
    organization: raw.organization ?? DEFAULT_EXPERIMENT_INFO.organization,
    location: raw.location ?? "",
    managerName: raw.managerName ?? DEFAULT_EXPERIMENT_INFO.managerName,
    contactEmail: raw.contactEmail ?? DEFAULT_EXPERIMENT_INFO.contactEmail,
    notes: raw.notes ?? DEFAULT_EXPERIMENT_INFO.notes,
  };
}

export function normalizeStudyInfo(raw = {}, id = DEFAULT_STUDY_ID) {
  return {
    id,
    title: raw.title ?? DEFAULT_EXPERIMENT_INFO.title,
    description: raw.description ?? DEFAULT_EXPERIMENT_INFO.description,
    duration: raw.duration ?? DEFAULT_EXPERIMENT_INFO.duration,
    reward: raw.reward ?? DEFAULT_EXPERIMENT_INFO.reward,
    organization: raw.organization ?? DEFAULT_EXPERIMENT_INFO.organization,
    location: raw.location ?? "",
    managerName: raw.managerName ?? DEFAULT_EXPERIMENT_INFO.managerName,
    contactEmail: raw.contactEmail ?? DEFAULT_EXPERIMENT_INFO.contactEmail,
    notes: raw.notes ?? DEFAULT_EXPERIMENT_INFO.notes,
    isPublished: raw.isPublished === true,
    status: raw.status ?? "recruiting",
    ownerEmail: raw.ownerEmail ?? "",
    adminEmails: Array.isArray(raw.adminEmails) ? raw.adminEmails : [],
    createdAt: raw.createdAt ?? null,
    updatedAt: raw.updatedAt ?? null,
  };
}

export function studyToExperimentInfo(study, fallback = DEFAULT_EXPERIMENT_INFO) {
  const safeStudy = study ? normalizeStudyInfo(study, study.id || DEFAULT_STUDY_ID) : null;

  if (!safeStudy) {
    return normalizeExperimentInfo(fallback);
  }

  return normalizeExperimentInfo({
    title: safeStudy.title || fallback.title,
    description: safeStudy.description || fallback.description,
    duration: safeStudy.duration || fallback.duration,
    reward: safeStudy.reward || fallback.reward,
    organization: safeStudy.organization || fallback.organization,
    location: safeStudy.location || fallback.location || "",
    managerName: safeStudy.managerName || fallback.managerName,
    contactEmail: safeStudy.contactEmail || fallback.contactEmail,
    notes: safeStudy.notes || fallback.notes,
  });
}

export function getStudyStatusLabel(status) {
  if (status === "draft") return "準備中";
  if (status === "paused") return "一時停止中";
  if (status === "closed") return "募集終了";
  return "募集中";
}

export function getStudyStatusTone(status) {
  if (status === "draft") return "slate";
  if (status === "paused") return "amber";
  if (status === "closed") return "slate";
  return "emerald";
}

export function buildStudyFormFromStudy(study = {}, adminEmail = "") {
  const safeStudy = normalizeStudyInfo(study, study.id || DEFAULT_STUDY_ID);
  const adminEmails = safeStudy.adminEmails.length > 0 ? safeStudy.adminEmails : [adminEmail].filter(Boolean);

  return {
    studyId: safeStudy.id || "",
    title: safeStudy.title || "",
    description: safeStudy.description || "",
    duration: safeStudy.duration || "",
    reward: safeStudy.reward || "",
    organization: safeStudy.organization || "",
    location: safeStudy.location || "",
    managerName: safeStudy.managerName || "",
    contactEmail: safeStudy.contactEmail || "",
    notes: safeStudy.notes || "",
    ownerEmail: safeStudy.ownerEmail || adminEmail || "",
    adminEmailsText: adminEmails.join("\n"),
    isPublished: safeStudy.isPublished === true,
    status: safeStudy.status || "recruiting",
  };
}

export function buildStudyFormFromExperimentInfo(experimentInfo = DEFAULT_EXPERIMENT_INFO, adminEmail = "") {
  return {
    studyId: DEFAULT_STUDY_ID,
    title: experimentInfo.title || DEFAULT_EXPERIMENT_INFO.title,
    description: experimentInfo.description || DEFAULT_EXPERIMENT_INFO.description,
    duration: experimentInfo.duration || DEFAULT_EXPERIMENT_INFO.duration,
    reward: experimentInfo.reward || DEFAULT_EXPERIMENT_INFO.reward,
    organization: experimentInfo.organization || DEFAULT_EXPERIMENT_INFO.organization,
    location: "立命館大学 OIC",
    managerName: experimentInfo.managerName || DEFAULT_EXPERIMENT_INFO.managerName,
    contactEmail: experimentInfo.contactEmail || DEFAULT_EXPERIMENT_INFO.contactEmail,
    notes: experimentInfo.notes || DEFAULT_EXPERIMENT_INFO.notes,
    ownerEmail: adminEmail || "",
    adminEmailsText: adminEmail || "",
    isPublished: true,
    status: "recruiting",
  };
}

export function normalizeStudyId(value = "") {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function createAutoStudyId() {
  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `study-${timestamp}-${random}`;
}

export function getRecordStudyId(item = {}) {
  return normalizeStudyId(item?.studyId || "") || DEFAULT_STUDY_ID;
}

export function isRecordInStudy(item = {}, studyId = DEFAULT_STUDY_ID) {
  const targetStudyId = normalizeStudyId(studyId || "") || DEFAULT_STUDY_ID;
  return getRecordStudyId(item) === targetStudyId;
}

export function withStudyId(item = {}, fallbackStudyId = DEFAULT_STUDY_ID) {
  return {
    ...item,
    studyId: getRecordStudyId({ ...item, studyId: item?.studyId || fallbackStudyId }),
  };
}

export function parseAdminEmails(text = "", fallbackEmail = "") {
  const emails = text
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  if (fallbackEmail && !emails.includes(fallbackEmail.toLowerCase())) {
    emails.unshift(fallbackEmail.toLowerCase());
  }

  return Array.from(new Set(emails));
}

export function buildStudyPayloadFromForm(form, adminEmail = "") {
  const ownerEmail = (form.ownerEmail || adminEmail || "").trim().toLowerCase();
  const adminEmails = parseAdminEmails(form.adminEmailsText, ownerEmail || adminEmail);

  return {
    title: form.title.trim(),
    description: form.description.trim(),
    duration: form.duration.trim(),
    reward: form.reward.trim(),
    organization: form.organization.trim(),
    location: form.location.trim(),
    managerName: form.managerName.trim(),
    contactEmail: form.contactEmail.trim(),
    notes: form.notes || "",
    ownerEmail,
    adminEmails,
    isPublished: form.isPublished === true,
    status: form.status || "recruiting",
  };
}
