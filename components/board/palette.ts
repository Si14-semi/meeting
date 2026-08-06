// 회의실별 고유 색상 — 파스텔 채움색 + 같은 계열 2단계 진한 외곽선 + 진한 텍스트.
// 예약 박스, 회의실 헤더 언더라인, hover 툴팁 배경에 공통 사용한다.

export type RoomColor = {
  bg: string; // 파스텔 채움
  border: string; // 2단계 진한 외곽선/언더라인
  text: string; // 텍스트 (진한 톤)
};

const PALETTE: RoomColor[] = [
  { bg: "#e0e7ff", border: "#a5b4fc", text: "#3730a3" }, // indigo
  { bg: "#d1fae5", border: "#6ee7b7", text: "#065f46" }, // emerald
  { bg: "#ffedd5", border: "#fdba74", text: "#9a3412" }, // orange
  { bg: "#fae8ff", border: "#f0abfc", text: "#86198f" }, // fuchsia
  { bg: "#e0f2fe", border: "#7dd3fc", text: "#075985" }, // sky
  { bg: "#fef3c7", border: "#fcd34d", text: "#92400e" }, // amber
  { bg: "#fce7f3", border: "#f9a8d4", text: "#9d174d" }, // pink
  { bg: "#ccfbf1", border: "#5eead4", text: "#115e59" }, // teal
  { bg: "#ede9fe", border: "#c4b5fd", text: "#5b21b6" }, // violet
  { bg: "#ffe4e6", border: "#fda4af", text: "#9f1239" }, // rose
];

/** 회의실 ID 기준 고유색 (회의실 추가/삭제에도 각 회의실 색은 유지됨) */
export function colorForRoom(roomId: number): RoomColor {
  return PALETTE[Math.abs(roomId) % PALETTE.length];
}
