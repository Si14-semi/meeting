"use client";

// 예약 생성/수정/삭제 모달.
// - 생성: 시간 겹침 시 기존 예약 목록 안내, 반복 부분 충돌 시 "가능한 날짜만 예약" 플로우
// - 수정: 반복 예약이면 저장/삭제 시 "이 일정 / 이 일정 및 향후 일정 / 모든 일정" 선택

import { useMemo, useState } from "react";
import { Alert, Button, Input, Label, Modal, Select, Spinner, cn } from "@/components/ui";
import { RecurrenceEditor } from "@/components/board/recurrence-editor";
import { useIsTouch } from "@/components/use-touch";
import type { ConflictInfo, Me, RecurrenceInput, ReservationDTO, Room } from "@/components/board/types";
import { OPEN_MIN, CLOSE_MIN, SLOT_MIN, minToLabel, labelToMin, formatDateWithWeekday, kstTodayStr } from "@/lib/time";
import { Repeat, Trash2 } from "lucide-react";

export type ModalState =
  | { mode: "create"; roomId: number; date: string; startMin: number; endMin: number }
  | { mode: "edit"; reservation: ReservationDTO };

type Scope = "one" | "following" | "all";

type Props = {
  state: ModalState;
  rooms: Room[];
  me: Me;
  onClose: () => void;
  onSaved: (message?: string) => void;
};

/** 서버 응답의 충돌 목록 렌더링 */
function ConflictList({ conflicts }: { conflicts: ConflictInfo[] }) {
  return (
    <div className="max-h-40 overflow-y-auto thin-scroll rounded-lg border border-line divide-y divide-line bg-card">
      {conflicts.flatMap((c) =>
        c.items.map((item) => (
          <div key={`${c.date}-${item.id}`} className="px-3 py-2 text-[13px]">
            <span className="font-medium">{formatDateWithWeekday(c.date)}</span>{" "}
            <span className="text-gray-500">
              {minToLabel(item.startMin)}~{minToLabel(item.endMin)}
            </span>{" "}
            · {item.userName}
            {item.purpose && <span className="text-gray-400"> — {item.purpose}</span>}
          </div>
        ))
      )}
    </div>
  );
}

export function ReservationModal({ state, rooms, me, onClose, onSaved }: Props) {
  const isTouch = useIsTouch();
  const isEdit = state.mode === "edit";
  const r = isEdit ? state.reservation : null;
  // 과거 예약도 수정/취소 허용 (사용자 확정) — 권한(본인/관리자)만 체크
  const canWrite = !isEdit || r!.userId === me.id || me.role === "ADMIN";
  const isForced = isEdit && r!.userId !== me.id && me.role === "ADMIN";

  const [roomId, setRoomId] = useState(isEdit ? r!.roomId : state.roomId);
  const [date, setDate] = useState(isEdit ? r!.date : state.date);
  const [startLabel, setStartLabel] = useState(minToLabel(isEdit ? r!.startMin : state.startMin));
  const [endLabel, setEndLabel] = useState(minToLabel(isEdit ? r!.endMin : state.endMin));
  const [purpose, setPurpose] = useState(isEdit ? r!.purpose : "");
  const [recurrence, setRecurrence] = useState<RecurrenceInput | null>(isEdit ? (r!.series ?? null) : null);
  const [customRec, setCustomRec] = useState(false);

  const [error, setError] = useState("");
  const [conflicts, setConflicts] = useState<ConflictInfo[] | null>(null);
  const [partialAsk, setPartialAsk] = useState<{ availableDates: string[] } | null>(null);
  const [scopeAsk, setScopeAsk] = useState<null | "save" | "delete">(null);
  const [scope, setScope] = useState<Scope>("one");
  const [loading, setLoading] = useState(false);

  const recurrenceChanged = useMemo(() => {
    const initial = isEdit ? (r!.series ?? null) : null;
    return JSON.stringify(initial) !== JSON.stringify(recurrence);
  }, [isEdit, r, recurrence]);

  // 15분 단위로 반올림
  function normalizeTime(label: string): number | null {
    const min = labelToMin(label);
    if (min === null) return null;
    return Math.round(min / SLOT_MIN) * SLOT_MIN;
  }

  function validate(): { startMin: number; endMin: number } | null {
    const startMin = normalizeTime(startLabel);
    const endMin = normalizeTime(endLabel);
    if (startMin === null || endMin === null) {
      setError("시간 형식이 올바르지 않습니다. (예: 09:15)");
      return null;
    }
    if (startMin < OPEN_MIN || endMin > CLOSE_MIN) {
      setError(`예약은 ${minToLabel(OPEN_MIN)}~${minToLabel(CLOSE_MIN)} 사이에서 가능합니다.`);
      return null;
    }
    if (startMin >= endMin) {
      setError("종료 시간이 시작 시간보다 늦어야 합니다.");
      return null;
    }
    return { startMin, endMin };
  }

  async function submit(opts: { onlyAvailable?: boolean; chosenScope?: Scope } = {}) {
    const t = validate();
    if (!t) return;
    setError("");
    setConflicts(null);
    setPartialAsk(null);
    setLoading(true);
    try {
      let res: Response;
      if (!isEdit) {
        res = await fetch("/api/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            date,
            startMin: t.startMin,
            endMin: t.endMin,
            purpose,
            recurrence,
            onlyAvailable: opts.onlyAvailable ?? false,
          }),
        });
      } else {
        const body: Record<string, unknown> = {
          roomId,
          date,
          startMin: t.startMin,
          endMin: t.endMin,
          purpose,
          scope: opts.chosenScope ?? "one",
          onlyAvailable: opts.onlyAvailable ?? false,
        };
        // 반복 규칙 변경은 "이 일정만"에는 적용하지 않는다 (UI에서 경고 표시됨)
        const chosen = opts.chosenScope ?? "one";
        if (recurrenceChanged && (!r!.isRecurring || chosen !== "one")) body.recurrence = recurrence;
        res = await fetch(`/api/reservations/${r!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      const data = await res.json();
      if (res.ok) {
        const skipped: string[] = data.skippedDates ?? [];
        onSaved(
          skipped.length > 0
            ? `${data.createdCount}건 처리되었습니다. 겹치는 ${skipped.length}개 날짜는 제외되었습니다.`
            : undefined
        );
        return;
      }
      // 충돌 처리
      if (res.status === 409 && data.conflicts) {
        setConflicts(data.conflicts);
        if (data.availableDates && data.availableDates.length > 0) {
          setPartialAsk({ availableDates: data.availableDates });
        }
        setError(data.error ?? "예약이 겹칩니다.");
      } else {
        setError(data.error ?? "처리에 실패했습니다.");
      }
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  function onSaveClick() {
    if (!validate()) return;
    // 반복 예약 수정이면 적용 범위를 먼저 묻는다
    if (isEdit && r!.isRecurring) {
      setScope(recurrenceChanged ? "following" : "one");
      setScopeAsk("save");
      return;
    }
    submit({});
  }

  async function doDelete(chosenScope: Scope) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/reservations/${r!.id}?scope=${chosenScope}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "취소에 실패했습니다.");
        setScopeAsk(null);
        return;
      }
      onSaved(data.deletedCount > 1 ? `${data.deletedCount}건의 예약이 취소되었습니다.` : "예약이 취소되었습니다.");
    } catch {
      setError("서버에 연결할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  function onDeleteClick() {
    if (r!.isRecurring) {
      setScope("one");
      setScopeAsk("delete");
    } else if (confirm("이 예약을 취소하시겠습니까?")) {
      doDelete("one");
    }
  }

  const timeOptions = useMemo(() => {
    const opts: string[] = [];
    for (let m = OPEN_MIN; m <= CLOSE_MIN; m += SLOT_MIN) opts.push(minToLabel(m));
    return opts;
  }, []);

  const readOnly = isEdit && !canWrite;

  return (
    <Modal
      open
      onClose={onClose}
      closeOnBackdrop={false}
      draggable
      lightBackdrop
      title={
        readOnly ? "예약 정보" : isEdit ? (isForced ? "예약 수정 (관리자)" : "예약 수정") : "회의실 예약"
      }
    >
      {/* ----- 적용 범위 선택 (반복 예약 저장/삭제) ----- */}
      {scopeAsk ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-700 font-medium">
            {scopeAsk === "save" ? "반복 예약 변경을 어디에 적용할까요?" : "반복 예약을 어떻게 취소할까요?"}
          </p>
          <div className="flex flex-col gap-2">
            {(
              [
                ["one", "이 일정만"],
                ["following", "이 일정 및 향후 일정"],
                ["all", "모든 일정"],
              ] as [Scope, string][]
            ).map(([s, label]) => (
              <label
                key={s}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm cursor-pointer transition-colors",
                  scope === s ? "border-accent bg-accent-soft" : "border-line hover:bg-gray-50"
                )}
              >
                <input
                  type="radio"
                  checked={scope === s}
                  onChange={() => setScope(s)}
                  className="accent-[var(--accent)]"
                />
                {label}
                {scopeAsk === "save" && s !== "one" && recurrenceChanged && (
                  <Repeat size={13} className="text-accent ml-auto" />
                )}
              </label>
            ))}
          </div>
          {scopeAsk === "save" && recurrenceChanged && scope === "one" && (
            <Alert kind="warn">반복 규칙 변경은 &quot;이 일정만&quot;에는 적용되지 않고 시간·회의실 변경만 반영됩니다.</Alert>
          )}
          {error && <Alert>{error}</Alert>}
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setScopeAsk(null)} disabled={loading}>
              뒤로
            </Button>
            {scopeAsk === "save" ? (
              <Button onClick={() => { setScopeAsk(null); submit({ chosenScope: scope }); }} disabled={loading}>
                {loading ? <Spinner /> : "저장"}
              </Button>
            ) : (
              <Button variant="danger" onClick={() => doDelete(scope)} disabled={loading}>
                {loading ? <Spinner /> : "예약 취소"}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {isEdit && (
            <div className="flex items-center gap-2 text-[13px] text-gray-500">
              <span className="font-medium text-gray-700">{r!.userName}</span>님의 예약
              {r!.isRecurring && (
                <span className="inline-flex items-center gap-1 text-accent bg-accent-soft rounded-full px-2 py-0.5 text-[12px]">
                  <Repeat size={11} /> 반복
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <Label htmlFor="rv-room">회의실</Label>
              <Select
                id="rv-room"
                value={roomId}
                onChange={(e) => setRoomId(parseInt(e.target.value))}
                disabled={readOnly}
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.number}호
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-0">
              <Label htmlFor="rv-date">날짜</Label>
              <Input
                id="rv-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={readOnly}
                className={cn("min-w-0", isTouch && "touch-date")}
              />
            </div>
            {/* 시간 입력: 장치 기준 전환 (화면 폭 기준이면 가로 회전 시 네이티브 아이콘이
                좁은 칸에서 잘리거나 겹침) — 터치=15분 드롭다운 / 마우스=직접 입력 time input */}
            <div className="min-w-0">
              <Label htmlFor="rv-start">시작</Label>
              {isTouch ? (
                <Select
                  id="rv-start"
                  aria-label="시작 시간"
                  value={startLabel}
                  onChange={(e) => setStartLabel(e.target.value)}
                  disabled={readOnly}
                >
                  {timeOptions.slice(0, -1).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="rv-start"
                  type="time"
                  step={SLOT_MIN * 60}
                  min="09:00"
                  max="19:00"
                  list="rv-times"
                  value={startLabel}
                  onChange={(e) => setStartLabel(e.target.value)}
                  disabled={readOnly}
                  className="min-w-0"
                />
              )}
            </div>
            <div className="min-w-0">
              <Label htmlFor="rv-end">종료</Label>
              {isTouch ? (
                <Select
                  id="rv-end"
                  aria-label="종료 시간"
                  value={endLabel}
                  onChange={(e) => setEndLabel(e.target.value)}
                  disabled={readOnly}
                >
                  {timeOptions.slice(1).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="rv-end"
                  type="time"
                  step={SLOT_MIN * 60}
                  min="09:15"
                  max="19:00"
                  list="rv-times"
                  value={endLabel}
                  onChange={(e) => setEndLabel(e.target.value)}
                  disabled={readOnly}
                  className="min-w-0"
                />
              )}
              <datalist id="rv-times">
                {timeOptions.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>

          <div>
            <Label htmlFor="rv-purpose">예약 목적 (선택)</Label>
            <Input
              id="rv-purpose"
              placeholder="예: 주간 회의"
              value={purpose}
              maxLength={100}
              onChange={(e) => setPurpose(e.target.value)}
              disabled={readOnly}
            />
          </div>

          {!readOnly && (
            <div>
              <Label>반복</Label>
              <RecurrenceEditor
                anchorDate={date}
                value={recurrence}
                custom={customRec}
                onChange={(v, c) => {
                  setRecurrence(v);
                  setCustomRec(c);
                }}
              />
            </div>
          )}

          {error && <Alert>{error}</Alert>}
          {conflicts && conflicts.length > 0 && (
            <div className="space-y-2">
              <p className="text-[13px] font-medium text-gray-600">이미 예약된 내역:</p>
              <ConflictList conflicts={conflicts} />
            </div>
          )}
          {partialAsk && (
            <Alert kind="warn">
              <p className="mb-2">
                예약 가능한 <b>{partialAsk.availableDates.length}개</b> 날짜에 한해 예약하시겠습니까?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => submit({ onlyAvailable: true, chosenScope: scope })} disabled={loading}>
                  예, 가능한 날짜만 예약
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setPartialAsk(null)} disabled={loading}>
                  아니오
                </Button>
              </div>
            </Alert>
          )}

          <div className="flex items-center justify-between pt-1">
            {isEdit && canWrite ? (
              <Button variant="ghost" size="sm" onClick={onDeleteClick} disabled={loading} className="text-danger hover:bg-red-50">
                <Trash2 size={14} /> 예약 취소
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={loading}>
                닫기
              </Button>
              {!readOnly && (
                <Button onClick={onSaveClick} disabled={loading}>
                  {loading ? <Spinner /> : isEdit ? "저장" : "예약하기"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
