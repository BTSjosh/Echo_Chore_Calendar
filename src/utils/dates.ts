// Hours at which the logical day rolls over (0–23). Times before this hour
// are treated as belonging to the previous calendar day, so chores completed
// at e.g. 1am still count against yesterday's date.
export const DAY_BOUNDARY_HOUR = 4;

/** Returns a Date shifted back by DAY_BOUNDARY_HOUR hours, so that
 *  calendar date extraction (getDate/getMonth/getFullYear) reflects the
 *  "logical" day rather than the wall-clock calendar day. */
export const getLogicalNow = (): Date =>
  new Date(Date.now() - DAY_BOUNDARY_HOUR * 60 * 60 * 1000);

export const toDateOnly = (value: Date | string | number): Date => {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const getFormattedDate = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getDateKey = (date: Date | string | number): string => getFormattedDate(toDateOnly(date));

export const parseDateKey = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

export const getStartOfWeek = (date: Date): Date => {
  const dayIndex = (date.getDay() + 6) % 7;
  const start = new Date(date);
  start.setDate(start.getDate() - dayIndex);
  start.setHours(0, 0, 0, 0);
  return start;
};

export const getEndOfWeek = (date: Date): Date => {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
};

export const getNext4Days = (date: Date): Date[] => {
  const today = toDateOnly(date);
  const dates: Date[] = [];
  const cursor = new Date(today);
  cursor.setDate(cursor.getDate() + 1);
  for (let i = 0; i < 4; i++) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

export const getStartOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), 1);

export const getEndOfMonth = (date: Date): Date => new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);

export const WEEKDAY_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

export const getDayIndex = (value: unknown): number | null => {
  if (!value) return null;
  const key = String(value).slice(0, 3).toLowerCase();
  return Object.prototype.hasOwnProperty.call(WEEKDAY_INDEX, key)
    ? WEEKDAY_INDEX[key]
    : null;
};

export const getDayOfMonth = (value: unknown): number | null => {
  if (!value) return null;
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date.getDate();
};
