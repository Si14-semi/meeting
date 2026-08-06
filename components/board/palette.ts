// 예약 박스 색상 — 단일 톤 체계 (사용자 확정, 회의실별 색 폐지):
//  - 타인 예약: 차분한 그레이(슬레이트) — 배경 정보로 조용히
//  - 내 예약: 브랜드 인디고 파스텔 — 튀지 않으면서 확실히 구분
// 라이트/다크 각각 전용 톤을 쓴다.

export type BlockColor = {
  bg: string;
  border: string;
  text: string;
};

const OTHERS_LIGHT: BlockColor = { bg: "#f1f3f7", border: "#c9cfda", text: "#3f4652" };
const OTHERS_DARK: BlockColor = { bg: "#262b35", border: "#4a5262", text: "#ccd2db" };
const MINE_LIGHT: BlockColor = { bg: "#e0e7ff", border: "#a5b4fc", text: "#3730a3" };
const MINE_DARK: BlockColor = { bg: "#262a4d", border: "#6366f1", text: "#c7d2fe" };

export function reservationColor(mine: boolean, dark: boolean): BlockColor {
  if (mine) return dark ? MINE_DARK : MINE_LIGHT;
  return dark ? OTHERS_DARK : OTHERS_LIGHT;
}
