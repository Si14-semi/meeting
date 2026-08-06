// 예약 블록 색상 — 사용자별로 은은한 파스텔 색을 결정적으로 배정한다.

export type BlockColor = {
  bg: string;
  border: string;
  text: string;
};

const PALETTE: BlockColor[] = [
  { bg: "#eef2ff", border: "#c7d2fe", text: "#3730a3" }, // indigo
  { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" }, // emerald
  { bg: "#fff7ed", border: "#fed7aa", text: "#9a3412" }, // orange
  { bg: "#fdf4ff", border: "#f5d0fe", text: "#86198f" }, // fuchsia
  { bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af" }, // blue
  { bg: "#fefce8", border: "#fde68a", text: "#854d0e" }, // yellow
  { bg: "#fdf2f8", border: "#fbcfe8", text: "#9d174d" }, // pink
  { bg: "#f0fdfa", border: "#99f6e4", text: "#115e59" }, // teal
  { bg: "#f5f3ff", border: "#ddd6fe", text: "#5b21b6" }, // violet
  { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" }, // red
];

export function colorForUser(userId: string): BlockColor {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}
