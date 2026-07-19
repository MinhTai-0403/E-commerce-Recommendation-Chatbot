const fs = require('node:fs/promises');
const path = require('node:path');
const { VectorTile } = require('@mapbox/vector-tile');
const { PbfReader } = require('pbf');

const SOURCE_TILEJSON_URL = 'https://gis.hcm.edu.vn/martin/v_school_tiles';
const SOURCE_WARDS_TILEJSON_URL = 'https://gis.hcm.edu.vn/martin/wards';
const DEFAULT_OUTPUT = path.resolve(
  __dirname,
  '../../cellphones-clone/public/data/hcmc-education-institutions.json',
);
const DEFAULT_ZOOM = 8;

function readArgument(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? argument.slice(prefix.length) : fallback;
}

function longitudeLatitudeToTile(longitude, latitude, zoom) {
  const scale = 2 ** zoom;
  const latitudeRadians = latitude * Math.PI / 180;
  return {
    x: Math.floor((longitude + 180) / 360 * scale),
    y: Math.floor(
      (1 - Math.asinh(Math.tan(latitudeRadians)) / Math.PI) / 2 * scale,
    ),
  };
}

function getTileCoordinates(bounds, zoom) {
  const northWest = longitudeLatitudeToTile(bounds[0], bounds[3], zoom);
  const southEast = longitudeLatitudeToTile(bounds[2], bounds[1], zoom);
  const coordinates = [];

  for (let x = northWest.x; x <= southEast.x; x += 1) {
    for (let y = northWest.y; y <= southEast.y; y += 1) {
      coordinates.push({ x, y, zoom });
    }
  }

  return coordinates;
}

function normalizeSchoolName(value = '', level = '') {
  const name = String(value).replace(/\s+/g, ' ').trim();
  if (!name) return '';

  const replacements = [
    [/^MN\s+/iu, 'Trường Mầm non '],
    [/^TH\s+/iu, 'Trường Tiểu học '],
    [/^THCS\s+/iu, 'Trường THCS '],
    [/^THPT\s+/iu, 'Trường THPT '],
  ];

  for (const [pattern, replacement] of replacements) {
    if (pattern.test(name)) return name.replace(pattern, replacement);
  }

  if (/^(trường|trung tâm|cơ sở|hộ kinh doanh)/iu.test(name)) return name;
  if (level === 'Mầm non') return `Trường Mầm non ${name}`;
  return name;
}

function getLevels(properties) {
  return [
    properties.is_cap_mn ? 'Mầm non' : '',
    properties.is_cap_th ? 'Tiểu học' : '',
    properties.is_cap_thcs ? 'THCS' : '',
    properties.is_cap_thpt ? 'THPT' : '',
    properties.is_cap_gdtx ? 'GDTX' : '',
  ].filter(Boolean);
}

function getSchoolType(value) {
  const types = {
    cong_lap: 'Công lập',
    ngoai_cong_lap: 'Ngoài công lập',
  };
  return types[value] || 'Chưa phân loại';
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'CellphoneS-Clone-Education-Directory/1.0' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} khi tải ${url}`);
  return response.json();
}

async function fetchTile(sourceUrl, layerName, coordinate) {
  const url = `${sourceUrl}/${coordinate.zoom}/${coordinate.x}/${coordinate.y}`;
  const response = await fetch(url, {
    headers: { 'user-agent': 'CellphoneS-Clone-Education-Directory/1.0' },
  });
  if (response.status === 204) return [];
  if (!response.ok) throw new Error(`HTTP ${response.status} khi tải ${url}`);

  const bytes = Buffer.from(await response.arrayBuffer());
  const tile = new VectorTile(new PbfReader(bytes));
  const layer = tile.layers[layerName];
  if (!layer) return [];

  return Array.from({ length: layer.length }, (_, index) => ({
    ...layer.feature(index).properties,
  }));
}

async function mapWithConcurrency(values, concurrency, worker) {
  const results = new Array(values.length);
  let cursor = 0;

  async function consume() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, consume),
  );
  return results;
}

function mergeSchool(existing, properties, wardsById) {
  const levels = getLevels(properties);
  const level = levels.join(' - ') || 'Khác';
  const sourceName = String(properties.ten_truong || properties.ten_diem_truong || '').trim();
  const campusName = String(properties.ten_diem_truong || '').trim();
  const latitude = Number(properties.lat);
  const longitude = Number(properties.lng);
  const ward = wardsById.get(String(properties.id_xa || ''));

  if (!existing) {
    return {
      id: `hcm-${properties.id_truong || properties.id_diem_truong}`,
      sourceId: String(properties.id_truong || ''),
      name: normalizeSchoolName(sourceName, level),
      sourceName,
      shortName: level,
      level,
      schoolType: getSchoolType(properties.loai_hinh),
      domains: [],
      wardName: ward ? `${ward.ward_type} ${ward.name}` : '',
      latitude: Number.isFinite(latitude) ? Number(latitude.toFixed(6)) : null,
      longitude: Number.isFinite(longitude) ? Number(longitude.toFixed(6)) : null,
      campusCount: 1,
      campusNames: campusName && campusName !== sourceName ? [campusName] : [],
    };
  }

  existing.campusCount += 1;
  if (
    campusName
    && campusName !== sourceName
    && !existing.campusNames.includes(campusName)
  ) {
    existing.campusNames.push(campusName);
  }
  return existing;
}

async function main() {
  const output = path.resolve(readArgument('output', DEFAULT_OUTPUT));
  const zoom = Number(readArgument('zoom', DEFAULT_ZOOM));
  const concurrency = Math.max(1, Number(readArgument('concurrency', 6)) || 6);
  const tileJson = await fetchJson(SOURCE_TILEJSON_URL);
  const wardsTileJson = await fetchJson(SOURCE_WARDS_TILEJSON_URL);
  const coordinates = getTileCoordinates(tileJson.bounds, zoom);
  const wardCoordinates = getTileCoordinates(wardsTileJson.bounds, zoom);
  const tileSource = `${new URL(SOURCE_TILEJSON_URL).origin}/martin/v_school_tiles`;
  const wardTileSource = `${new URL(SOURCE_WARDS_TILEJSON_URL).origin}/martin/wards`;

  const wardBatches = await mapWithConcurrency(
    wardCoordinates,
    concurrency,
    (coordinate) => fetchTile(wardTileSource, 'wards', coordinate),
  );
  const wardsById = new Map();
  for (const ward of wardBatches.flat()) {
    if (ward.id_xa) wardsById.set(String(ward.id_xa), ward);
  }

  console.log(`Đang tải ${coordinates.length} ô dữ liệu trường học ở zoom ${zoom}...`);
  const batches = await mapWithConcurrency(
    coordinates,
    concurrency,
    async (coordinate, index) => {
      const features = await fetchTile(tileSource, 'v_school_tiles', coordinate);
      console.log(
        `[${index + 1}/${coordinates.length}] ${coordinate.zoom}/${coordinate.x}/${coordinate.y}: ${features.length}`,
      );
      return features;
    },
  );

  const features = batches.flat();
  const schools = new Map();
  for (const properties of features) {
    const sourceId = String(properties.id_truong || '').trim();
    const sourceName = String(properties.ten_truong || properties.ten_diem_truong || '').trim();
    if (!sourceName) continue;
    const key = sourceId || `${sourceName}|${properties.lng}|${properties.lat}`;
    schools.set(key, mergeSchool(schools.get(key), properties, wardsById));
  }

  const levelOrder = new Map([
    ['Mầm non', 0],
    ['Tiểu học', 1],
    ['THCS', 2],
    ['THPT', 3],
    ['GDTX', 4],
    ['Khác', 5],
  ]);
  const institutions = [...schools.values()]
    .map((school) => ({
      ...school,
      campusNames: school.campusNames.sort((a, b) => a.localeCompare(b, 'vi')),
    }))
    .sort((left, right) => {
      const byLevel = (levelOrder.get(left.level) ?? 99) - (levelOrder.get(right.level) ?? 99);
      return byLevel || left.name.localeCompare(right.name, 'vi');
    });

  const summary = institutions.reduce((result, school) => {
    result[school.level] = (result[school.level] || 0) + 1;
    return result;
  }, {});
  const payload = {
    metadata: {
      source: SOURCE_TILEJSON_URL,
      wardSource: SOURCE_WARDS_TILEJSON_URL,
      generatedAt: new Date().toISOString(),
      city: 'Thành phố Hồ Chí Minh',
      schoolCount: institutions.length,
      campusCount: features.length,
      summary,
    },
    institutions,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(payload)}\n`, 'utf8');
  console.log(`Đã lưu ${institutions.length} trường (${features.length} điểm trường) vào ${output}`);
  console.log(summary);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
