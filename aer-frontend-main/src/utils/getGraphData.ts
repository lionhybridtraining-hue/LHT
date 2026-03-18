interface PaceData {
  km: number;
  pace_s: number;
  km_h: number;
  pace: string;
}

function convertPace(paceStr: string): number {
  const [minutes, seconds] = paceStr.split(":").map(Number);
  return minutes * 60 + seconds;
}

export function processData(inputStr: string): PaceData[] {
  const pattern = /(\d+(\.\d+)?)km-(\d{2}:\d{2})/g;

  let totalKm = 0;
  const data: PaceData[] = [];

  let match: RegExpExecArray | null;
  let firstItemProcessed = false;

  while ((match = pattern.exec(inputStr)) !== null) {
    const km = parseFloat(match[1]);
    const paceStr = match[3];

    const pace_s = convertPace(paceStr);

    // If it's the second item, store its pace
    if (!firstItemProcessed) {
      firstItemProcessed = true;
    }

    // For the first item, set km: 0 and pace from the second item
    if (data.length === 0) {
      data.push({
        km: 0, // First item has km: 0
        pace_s: pace_s, // Set pace_s from the second item pace
        pace: "", // Set pace from the second item
        km_h: 3600 / pace_s,
      });
    }

    // Update cumulative distance and add the subsequent items
    totalKm += km;
    data.push({
      km: parseFloat(totalKm.toFixed(1)), // Round to 1 decimal place
      pace_s,
      pace: paceStr,
      km_h: 3600 / pace_s,
    });
  }

  return data;
}
