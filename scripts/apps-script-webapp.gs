/**
 * Google Apps Script Web App endpoint for dynamic LHT content.
 *
 * Expected sheets (header in row 1):
 * - METADATA: key | value
 * - METRICS: value | label
 * - REVIEWS: name | stars | text | meta | date
 * - LINKS: key | url
 */
function doGet() {
  try {
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

    var payload = {
      metadata: readKeyValueSheet_(spreadsheet, 'METADATA', 'key', 'value'),
      metrics: readMetricsSheet_(spreadsheet, 'METRICS'),
      reviews: readReviewsSheet_(spreadsheet, 'REVIEWS'),
      links: readLinksSheet_(spreadsheet, 'LINKS')
    };

    // Optional aggregate rating computed from reviews.
    payload.aggregateRating = computeAggregateRating_(payload.reviews);

    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: true, message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function readKeyValueSheet_(spreadsheet, sheetName, keyHeader, valueHeader) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return {};

  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return {};

  var headerMap = mapHeader_(rows[0]);
  var keyCol = headerMap[keyHeader];
  var valueCol = headerMap[valueHeader];
  if (keyCol === undefined || valueCol === undefined) return {};

  var out = {};
  for (var i = 1; i < rows.length; i++) {
    var key = String(rows[i][keyCol] || '').trim();
    if (!key) continue;
    out[key] = rows[i][valueCol];
  }
  return out;
}

function readMetricsSheet_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  var headerMap = mapHeader_(rows[0]);
  var valueCol = pickHeader_(headerMap, ['value', 'valor', 'numero', 'n']);
  var labelCol = pickHeader_(headerMap, ['label', 'rotulo', 'rótulo', 'descricao', 'descrição', 'texto']);
  if (valueCol === undefined || labelCol === undefined) return [];

  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var value = String(rows[i][valueCol] || '').trim();
    var label = String(rows[i][labelCol] || '').trim();
    if (!value && !label) continue;
    out.push({ value: value, label: label });
  }
  return out;
}

function readReviewsSheet_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return [];

  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];

  var headerMap = mapHeader_(rows[0]);
  var nameCol = pickHeader_(headerMap, ['name', 'nome', 'atleta', 'author', 'autor']);
  var starsCol = pickHeader_(headerMap, ['stars', 'star', 'estrelas', 'classificacao', 'classificação', 'rating']);
  var textCol = pickHeader_(headerMap, ['text', 'texto', 'review', 'avaliacao', 'avaliação', 'comentario', 'comentário']);
  var metaCol = pickHeader_(headerMap, ['meta', 'categoria', 'subtitulo', 'subtítulo']);
  var dateCol = pickHeader_(headerMap, ['date', 'data']);

  if (nameCol === undefined || starsCol === undefined || textCol === undefined) return [];

  var out = [];
  for (var i = 1; i < rows.length; i++) {
    var name = String(rows[i][nameCol] || '').trim();
    var stars = Number(rows[i][starsCol] || 5);
    var text = String(rows[i][textCol] || '').trim();
    var meta = metaCol === undefined ? '' : String(rows[i][metaCol] || '').trim();
    var date = dateCol === undefined ? '' : normalizeDate_(rows[i][dateCol]);

    if (!name && !text) continue;

    out.push({
      name: name || 'Atleta LHT',
      stars: clamp_(stars, 1, 5),
      text: text,
      meta: meta || 'ATHLETIC ENDURANCE RUNNER',
      date: date
    });
  }
  return out;
}

function readLinksSheet_(spreadsheet, sheetName) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return {};

  var rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return {};

  var headerMap = mapHeader_(rows[0]);
  var keyCol = pickHeader_(headerMap, ['key', 'chave', 'nome']);
  var urlCol = pickHeader_(headerMap, ['url', 'link', 'href']);
  if (keyCol === undefined || urlCol === undefined) return {};

  var out = {};
  for (var i = 1; i < rows.length; i++) {
    var key = String(rows[i][keyCol] || '').trim();
    var url = String(rows[i][urlCol] || '').trim();
    if (!key || !url) continue;
    out[key] = url;
  }
  return out;
}

function mapHeader_(headerRow) {
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    var key = String(headerRow[i] || '').trim().toLowerCase();
    if (key) map[key] = i;
  }
  return map;
}

function pickHeader_(headerMap, aliases) {
  for (var i = 0; i < aliases.length; i++) {
    var key = aliases[i];
    if (headerMap[key] !== undefined) return headerMap[key];
  }
  return undefined;
}

function computeAggregateRating_(reviews) {
  if (!reviews || !reviews.length) {
    return { ratingValue: 4.9, reviewCount: 0 };
  }

  var sum = 0;
  for (var i = 0; i < reviews.length; i++) {
    sum += Number(reviews[i].stars || 5);
  }

  var avg = Math.round((sum / reviews.length) * 10) / 10;
  return {
    ratingValue: avg,
    reviewCount: reviews.length
  };
}

function normalizeDate_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  var str = String(value).trim();
  return str;
}

function clamp_(num, min, max) {
  if (num < min) return min;
  if (num > max) return max;
  return num;
}
