export const PERIODS = [
  { key: "p1", label: "1時限", start: "09:00", end: "10:35" },
  { key: "p2", label: "2時限", start: "10:45", end: "12:20" },
  { key: "p3", label: "3時限", start: "13:10", end: "14:45" },
  { key: "p4", label: "4時限", start: "14:55", end: "16:30" },
  { key: "p5", label: "5時限", start: "16:40", end: "18:15" },
  { key: "p6", label: "6時限", start: "18:25", end: "20:00" },
  { key: "p7", label: "7時限", start: "20:10", end: "21:45" },
];

export const PERIOD_MAP = Object.fromEntries(PERIODS.map((period) => [period.key, period]));

export const WEEK_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export const MAX_PREFERRED_SLOTS = 5;

export const DEFAULT_STUDY_ID = "vr-notification-2026";

export const DEFAULT_EXPERIMENT_INFO = {
  title: "VR実験 参加者募集",
  description:
    "VR環境での体験や操作に関する研究実験です。公開中の日程から希望日時を選んでお申し込みください。",
  duration: "約30〜45分",
  reward: "謝礼あり（詳細は当日案内）",
  organization: "立命館大学 プレイフルインタラクション研究室",
  managerName: "川久保 空真",
  contactEmail: "is0611xi@ed.ritsumei.ac.jp",
  notes:
    "・応募後、管理者が内容を確認して日程を確定します。\n・体調不良時は無理せずご連絡ください。\n・詳細は確定後のメールでご案内します。",
};

export const SAMPLE_SLOTS = [
  {
    id: "sample-slot-1",
    studyId: DEFAULT_STUDY_ID,
    date: "2026-04-21",
    periodKey: "p3",
    capacity: 2,
    confirmedCount: 1,
    isPublished: true,
    location: "OIC 実験室A",
    note: "VR体験あり / 約30分",
  },
  {
    id: "sample-slot-2",
    studyId: DEFAULT_STUDY_ID,
    date: "2026-04-21",
    periodKey: "p4",
    capacity: 2,
    confirmedCount: 0,
    isPublished: true,
    location: "OIC 実験室A",
    note: "VR体験あり / 約30分",
  },
  {
    id: "sample-slot-3",
    studyId: DEFAULT_STUDY_ID,
    date: "2026-04-24",
    periodKey: "p3",
    capacity: 3,
    confirmedCount: 1,
    isPublished: true,
    location: "OIC 実験室B",
    note: "放課後参加しやすい枠",
  },
];

export const SAMPLE_REQUESTS = [
  {
    id: "sample-request-1",
    studyId: DEFAULT_STUDY_ID,
    name: "山田 太郎",
    email: "taro@example.com",
    affiliation: "情報理工学部 B3",
    note: "できれば午後希望",
    preferredSlotIds: ["sample-slot-1", "sample-slot-3"],
    assignedSlotId: "sample-slot-1",
    status: "confirmed",
    participantResponseToken: "sample-response-token-1",
    participantConfirmationStatus: "pending",
    participantResponseNote: "",
    operationStatus: "active",
  },
];

export const SAMPLE_STUDIES = [
  {
    id: DEFAULT_STUDY_ID,
    title: "VR通知配置に関する実験",
    description:
      "VR空間における通知の表示位置が、気づきやすさや作業への影響に与える効果を調査する実験です。",
    duration: "約60分",
    reward: "謝礼あり",
    organization: "立命館大学",
    location: "立命館大学 OIC",
    managerName: "川久保 空真",
    contactEmail: "is0611xi@ed.ritsumei.ac.jp",
    notes: "参加条件や注意事項をご確認のうえ、お申し込みください。",
    isPublished: true,
    status: "recruiting",
  },
];
