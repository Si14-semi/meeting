"use client";

import { useEffect, useState } from "react";

/** 터치 기기 여부 (화면 폭이 아니라 입력 장치 기준 — 가로 회전해도 유지됨) */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);
  return isTouch;
}
