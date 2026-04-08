const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('kt_subsidy_data.json', 'utf8'));

// 새 형식(subsidy+models) 또는 이전 형식(subsidy만) 지원
const data = raw.subsidy || raw;
const ktModels = raw.models || {};

// KT 모델코드 → calculator 모델코드 역매핑 (iPhone, 기타 브랜드)
const MODEL_CODE_MAP = {
  'IPHONE17_256': 'AIP17-256', 'IPHONE17_512': 'AIP17-512',
  'IPHONEAIR_256': 'AIPA-256', 'IPHONEAIR_512': 'AIPA-512', 'IPHONEAIR_1T': 'AIPA-1T',
  'IPHONE17PRO_256': 'AIP17P-256', 'IPHONE17PRO_512': 'AIP17P-512', 'IPHONE17PRO_1T': 'AIP17P-1T',
  'IPHONE17PROMAX_256': 'AIP17PM-256', 'IPHONE17PROMAX_512': 'AIP17PM-512', 'IPHONE17PROMAX_1T': 'AIP17PM-1T', 'IPHONE17PROMAX_2T': 'AIP17PM-2T',
  'IPHONE16E_128': 'AIP16E-128', 'IPHONE16E_256': 'AIP16E-256', 'IPHONE16E_512': 'AIP16E-512',
  'IPHONE16_128': 'AIP16-128', 'IPHONE16_256': 'AIP16-256', 'IPHONE16_512': 'AIP16-512',
  'IPHONE16PLUS_128': 'AIP16PS-128', 'IPHONE16PLUS_256': 'AIP16PS-256', 'IPHONE16PLUS_512': 'AIP16PS-512',
  'IPHONE16PRO_128': 'AIP16P-128', 'IPHONE16PRO_256': 'AIP16P-256', 'IPHONE16PRO_512': 'AIP16P-512', 'IPHONE16PRO_1T': 'AIP16P-1T',
  'IPHONE16PROMAX_256': 'AIP16PM-256', 'IPHONE16PROMAX_512': 'AIP16PM-512', 'IPHONE16PROMAX_1T': 'AIP16PM-1T',
  'IPHONE15_128': 'AIP15-128', 'IPHONE15_256': 'AIP15-256', 'IPHONE15_512': 'AIP15-512',
  'IPHONE15PLUS_128': 'AIP15PS-128', 'IPHONE15PLUS_256': 'AIP15PS-256', 'IPHONE15PLUS_512': 'AIP15PS-512',
  'IPHONE15PRO_128': 'AIP15P-128', 'IPHONE15PRO_256': 'AIP15P-256', 'IPHONE15PRO_512': 'AIP15P-512', 'IPHONE15PRO_1T': 'AIP15P-1T',
  'IPHONE15PROMAX_256': 'AIP15PM-256', 'IPHONE15PROMAX_512': 'AIP15PM-512', 'IPHONE15PROMAX_1T': 'AIP15PM-1T',
  'IPHONE13_128': 'AIP13-128',
  'SM-S937NK': 'SM-S937NKIB', 'SM-S937NK512': 'SM-S937NK512IB',
  'SM-S937N0': 'SM-S937NKIB', 'SM-S937N0512': 'SM-S937NK512IB',
  'EDGE50': 'XT2601-2K', 'REDMI14C': 'MI-RM14CK', 'XIAOMI14T': 'MI-XM14TK',
  'REDMINOTE14': 'MI-RMN14K', 'REDMINOTE14PRO': 'MI-RMN14P5GK', 'REDMINOTE14PRO512': 'MI-RMN14P5GK512',
  'MOTOG56': 'XT2529-2K', 'G34': 'XT2363-3K',
  'SM-S931N0': 'SM-S931NK', 'SM-S731N0': 'SM-S731NK', 'SM-F766N0': 'SM-F766NK',
  'SM-A175N0': 'SM-A175NK', 'SM-F741NK_MARU': 'SM-F741NK',
  'CLASSIC_FOLDER': 'AT-M130K', 'SM-A032NK': 'Z2339K',
  'CINNAMOROLL': 'Z2339K',
  'SM-A156NK': 'SM-M366K', 'SM-A146NK': 'SM-M366K-MOM',
};

const PLAN_NAME_MAP = {
  '5G 스페셜': '스페셜', '5G 베이직': '베이직',
  '5G Y 스페셜': 'Y 스페셜', '5G Y 베이직': 'Y 베이직',
  '5G 심플 110GB': '5G 심플 110GB', '5G 심플 90GB': '5G 심플 90GB',
  '5G 심플 70GB': '5G 심플 70GB', '5G 심플 50GB': '5G 심플 50GB', '5G 심플 30GB': '5G 심플 30GB',
  '5G 슬림 21GB': '5G 슬림 21GB', '5G 슬림 14GB': '5G 슬림 14GB(이월)',
  '5G 슬림 10GB': '5G 슬림 10GB', '5G 슬림 7GB': '5G 슬림 7GB(이월)', '5G 슬림 4GB': '5G 슬림 4GB',
  '5G 슬림(이월) 21GB': '5G 슬림 21GB(이월)', '5G 슬림(이월) 14GB': '5G 슬림 14GB(이월)',
  '5G 슬림(이월) 10GB': '5G 슬림 10GB(이월)', '5G 슬림(이월) 7GB': '5G 슬림 7GB(이월)',
  '5G 슬림(이월) 4GB': '5G 슬림 4GB(이월)',
  '5G Y 슬림': '5G Y슬림', '5G Y틴': '5G Y틴',
  '5G 주니어': '5G 주니어', '5G 주니어 슬림': '5G 주니어 슬림',
  '5G 시니어 베이직': '5G 시니어 베이직', '5G 시니어 A형': '5G 시니어 A형',
  '5G 시니어 B형': '5G 시니어 B형', '5G 시니어 C형': '5G 시니어 C형',
  '5G 티빙/지니/밀리 초이스 프리미엄': '티빙/지니/밀리 초이스 프리미엄',
  '5G 티빙/지니/밀리 초이스 스페셜': '티빙/지니/밀리 초이스 스페셜',
  '5G 티빙/지니/밀리 초이스 베이직': '티빙/지니/밀리 초이스 베이직',
  '5G 넷플릭스 초이스 프리미엄': '넷플릭스 초이스 프리미엄',
  '5G 넷플릭스 초이스 스페셜': '넷플릭스 초이스 스페셜',
  '5G 넷플릭스 초이스 베이직': '넷플릭스 초이스 베이직',
  '5G 유튜브 프리미엄 초이스 프리미엄': '(유튜브 프리미엄) 초이스 프리미엄',
  '5G 유튜브 프리미엄 초이스 스페셜': '(유튜브 프리미엄) 초이스 스페셜',
  '5G 유튜브 프리미엄 초이스 베이직': '(유튜브 프리미엄) 초이스 베이직',
  '5G 디즈니+ 초이스 프리미엄': '디즈니+ 초이스 프리미엄',
  '5G 디즈니+ 초이스 스페셜': '디즈니+ 초이스 스페셜',
  '5G 디즈니+ 초이스 베이직': '디즈니+ 초이스 베이직',
  '5G 삼성 초이스 프리미엄': '삼성 초이스 프리미엄',
  '5G 삼성 초이스 스페셜': '삼성 초이스 스페셜',
  '5G 삼성 초이스 베이직': '삼성 초이스 베이직',
  '5G 디바이스 초이스 프리미엄': '디바이스 초이스 프리미엄',
  '5G 디바이스 초이스 스페셜': '디바이스 초이스 스페셜',
  '5G 디바이스 초이스 베이직': '디바이스 초이스 베이직',
  '5G 위버스 초이스 프리미엄': '위버스 초이스 프리미엄',
  '5G 위버스 초이스 스페셜': '위버스 초이스 스페셜',
  '5G 위버스 초이스 베이직': '위버스 초이스 베이직',
  '5G 폰케어 초이스 프리미엄': '폰케어 초이스 프리미엄',
  '5G 폰케어 초이스 스페셜': '폰케어 초이스 스페셜',
  '5G 폰케어 초이스 베이직': '폰케어 초이스 베이직',
  '5G 가전구독 초이스 프리미엄': '가전구독 초이스 프리미엄',
  '5G 가전구독 초이스 스페셜': '가전구독 초이스 스페셜',
  '5G 가전구독 초이스 베이직': '가전구독 초이스 베이직',
  // 태블릿 요금제
  '5G 스마트기기 14GB': '5G 스마트기기 14GB',
  '5G 스마트기기 28GB': '5G 스마트기기 28GB',
  '5G 데이터투게더': '5G 데이터투게더',
  '데이터투게더 Large': '데이터투게더 Large',
};

// === 1. Build SUBSIDY_DATA ===
const SUBSIDY_DATA = {};
for (const openType of ['기기변경', '번호이동', '신규가입']) {
  SUBSIDY_DATA[openType] = {};
  for (const [planCalc, planKt] of Object.entries(PLAN_NAME_MAP)) {
    if (!data[openType][planKt]) continue;
    const ktPlanData = data[openType][planKt];
    const planSubsidies = {};
    for (const ktModel of Object.keys(ktPlanData)) {
      planSubsidies[ktModel] = ktPlanData[ktModel];
    }
    for (const [calcCode, ktCode] of Object.entries(MODEL_CODE_MAP)) {
      if (ktPlanData[ktCode] !== undefined) {
        planSubsidies[calcCode] = ktPlanData[ktCode];
      }
    }
    SUBSIDY_DATA[openType][planCalc] = planSubsidies;
  }
}

// === 2. Build MODEL_MAP and PRICE_MAP from KT data ===
const MODEL_MAP = {};
const PRICE_MAP = {};

// KT 코드 → calculator 코드 역매핑
const REVERSE_MAP = {};
for (const [calcCode, ktCode] of Object.entries(MODEL_CODE_MAP)) {
  if (!REVERSE_MAP[ktCode]) REVERSE_MAP[ktCode] = [];
  REVERSE_MAP[ktCode].push(calcCode);
}

for (const [ktCode, info] of Object.entries(ktModels)) {
  // KT 코드 그대로 추가 (삼성 등)
  MODEL_MAP[ktCode] = info.name;
  PRICE_MAP[ktCode] = info.price;

  // calculator 코드도 추가 (iPhone 등)
  if (REVERSE_MAP[ktCode]) {
    for (const calcCode of REVERSE_MAP[ktCode]) {
      MODEL_MAP[calcCode] = info.name;
      PRICE_MAP[calcCode] = info.price;
    }
  }
}

// === 3. Output ===
const output = {
  SUBSIDY_DATA: SUBSIDY_DATA,
  MODEL_MAP: MODEL_MAP,
  PRICE_MAP: PRICE_MAP
};

fs.writeFileSync('subsidy_data_for_calc.json', JSON.stringify(output));
console.log('Generated subsidy_data_for_calc.json');
console.log('Models:', Object.keys(MODEL_MAP).length);
console.log('Plans per openType:', Object.keys(SUBSIDY_DATA['기기변경']).length);

// Verify
console.log('\nSample MODEL_MAP:');
const samples = Object.entries(MODEL_MAP).slice(0, 10);
samples.forEach(([k, v]) => console.log('  ' + k + ': ' + v));
console.log('\nSample PRICE_MAP:');
const pSamples = Object.entries(PRICE_MAP).slice(0, 10);
pSamples.forEach(([k, v]) => console.log('  ' + k + ': ' + v));
