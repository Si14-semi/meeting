export type Room = {
  id: number;
  number: string;
  floor: number;
  alias: string | null;
  capacity: number | null;
  description: string | null;
};

export type ReservationDTO = {
  id: string;
  roomId: number;
  roomNumber: string;
  floor: number;
  date: string;
  dateLabel: string;
  startMin: number;
  endMin: number;
  purpose: string;
  userId: string;
  userName: string;
  seriesId: string | null;
  isRecurring: boolean;
  series: RecurrenceInput | null;
};

export type Holiday = { date: string; name: string };

export type ConflictInfo = {
  date: string;
  items: {
    id: string;
    startMin: number;
    endMin: number;
    userName: string;
    purpose: string;
  }[];
};

export type RecurrenceInput = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  weekdays: number[];
  monthlyMode: "DAY_OF_MONTH" | "NTH_WEEKDAY" | null;
  endDate: string | null;
  count: number | null;
};

export type Me = {
  id: string;
  name: string;
  role: "USER" | "ADMIN";
};
