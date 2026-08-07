// 회의실/차량 표시명 — 평화(숫자 호실)는 "120호", 그 외(A1, 차량번호 등)는 그대로 표기.

export function roomLabel(room: { number: string; building: string }): string {
  return room.building === "평화" ? `${room.number}호` : room.number;
}
