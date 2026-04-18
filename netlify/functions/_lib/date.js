function toIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getWeekStartIso(dateLike) {
  const date = dateLike instanceof Date ? new Date(dateLike.getTime()) : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;

  // Convert Sunday=0 to ISO Monday=0
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return toIsoDate(date);
}

function getCurrentOrNextWeekStartIso(dateLike) {
  const date = dateLike instanceof Date ? new Date(dateLike.getTime()) : new Date(dateLike);
  if (Number.isNaN(date.getTime())) return null;

  const day = (date.getUTCDay() + 6) % 7;
  if (day === 0) {
    return toIsoDate(date);
  }

  date.setUTCDate(date.getUTCDate() + (7 - day));
  return toIsoDate(date);
}

module.exports = {
  toIsoDate,
  getWeekStartIso,
  getCurrentOrNextWeekStartIso
};
