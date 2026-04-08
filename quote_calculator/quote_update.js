/**
 * 납품 정책 견적서 데이터 추출 스크립트
 * - KT Shop API에서 휴대폰 모델/출고가, 전체 요금제 추출
 * - quote_data.js 파일로 출력 (quote_calculator.html이 로드)
 *
 * Node.js 내장 모듈만 사용 (외부 npm 패키지 불필요)
 * 실행: node quote_update.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── 설정 ──
const BASE_DIR = __dirname;
const OUTPUT_FILE = path.join(BASE_DIR, 'quote_data.js');
const SLEEP_MS = 300;

const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
  'Referer': 'https://shop.kt.com/smart/supportAmtList.do'
};

// ── HTML entity 디코딩 ──
function decodeHtmlEntities(str) {
  if (!str) return str;
  const entities = {
    '&#x2F;':'/','&#40;':'(','&#41;':')','&#39;':"'",'&#34;':'"',
    '&#38;':'&','&#60;':'<','&#62;':'>','&amp;':'&','&lt;':'<',
    '&gt;':'>','&quot;':'"','&apos;':"'",'&#x27;':"'",'&#x28;':'(',
    '&#x29;':')','&#43;':'+','&#x2B;':'+'
  };
  let result = str;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return result;
}

// ── 요금제명 변환 ──
function mapPlanName(ktName, groupName) {
  let name = decodeHtmlEntities(ktName).trim();
  const parenMatch = name.match(/^\((.+?)\)\s*(.+)$/);
  if (parenMatch) name = parenMatch[1] + ' ' + parenMatch[2];

  if (name.startsWith('5G ')) {
    name = name.replace(/^5G Y슬림/, '5G Y 슬림');
    name = name.replace(/^(5G 슬림)\s+(\d+GB)\(이월\)/, '$1(이월) $2');
    return name;
  }

  let mapped = '5G ' + name;
  mapped = mapped.replace(/^5G Y슬림/, '5G Y 슬림');
  mapped = mapped.replace(/^(5G 슬림)\s+(\d+GB)\(이월\)/, '$1(이월) $2');
  return mapped;
}

// ── 태블릿 요금제명 변환 ──
function mapTabletPlanName(ktName) {
  let name = decodeHtmlEntities(ktName).trim();
  // "스마트기기 14GB" → "5G 스마트기기 14GB" 등
  if (!name.startsWith('5G ') && !name.startsWith('LTE ')) {
    name = '5G ' + name;
  }
  return name;
}

// ── HTTP POST ──
function postRequest(urlStr, bodyStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: { ...HEADERS, 'Content-Length': Buffer.byteLength(bodyStr, 'utf8') }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          let parsed = data;
          try { parsed = JSON.parse(parsed); } catch {}
          if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch {} }
          resolve(parsed);
        } catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function parseAmount(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseInt(String(val).replace(/,/g, ''), 10) || 0;
}

// ── API 호출 (재시도 포함) ──
async function fetchWithRetry(url, body, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await postRequest(url, body);
    } catch (e) {
      if (i < retries - 1) { console.log(`    재시도 ${i+1}/${retries}...`); await sleep(3000); }
      else throw e;
    }
  }
}

// ── Step 1: 요금제 그룹 조회 ──
async function fetchPlanGroups(deviceType) {
  const body = `pplType=5G&deviceType=${deviceType}&prodType=30&spnsMonsType=2`;
  const res = await fetchWithRetry('https://shop.kt.com/oneMinuteReform/supportAmtChoiceGroupList.json', body);
  const data = typeof res === 'string' ? JSON.parse(res) : res;
  return data.punoPplGroupList || [];
}

// ── Step 2: 그룹별 요금제 조회 ──
async function fetchPlansInGroup(groupCode, deviceType) {
  const body = `pplType=5G&deviceType=${deviceType}&pplSelect=${groupCode}&spnsMonsType=2&sortPpl=dataDesc&prodType=30`;
  const res = await fetchWithRetry('https://shop.kt.com/oneMinuteReform/supportAmtChoiceList.json', body);
  const data = typeof res === 'string' ? JSON.parse(res) : res;
  return data.punoPplList || data.punoPpIList || [];
}

// ── Step 3: 단말 목록 조회 (페이지네이션) ──
async function fetchDevices(onfrmCd, deviceType) {
  let allDevices = [];
  let pageNo = 1;
  let totalPages = 1;

  while (pageNo <= totalPages) {
    const body = `prodNm=mobile&prdcCd=${onfrmCd}&prodType=30&deviceType=${deviceType}&makrCd=&sortProd=oBspnsrPunoDateDesc&spnsMonsType=undefined&dscnOptnCd=HT&sbscTypeCd=01&pageNo=${pageNo}`;
    const res = await fetchWithRetry('https://shop.kt.com/mobile/retvSuFuList.json', body);
    const data = typeof res === 'string' ? JSON.parse(res) : res;

    const list = data.LIST_DATA || [];
    allDevices = allDevices.concat(list);

    if (pageNo === 1 && data.pageInfoBean) {
      totalPages = parseInt(data.pageInfoBean.totalPageCount) || 1;
    }

    pageNo++;
    if (pageNo <= totalPages) await sleep(SLEEP_MS);
  }

  return allDevices;
}

// ── 메인 ──
async function main() {
  const startTime = Date.now();
  console.log('=== 납품 정책 견적서 데이터 업데이트 ===\n');

  const PHONE_MODEL_MAP = {};
  const PHONE_PRICE_MAP = {};
  const PLAN_DATA = {};

  // ────────────────────────────────────
  // 1. 휴대폰 요금제 수집
  // ────────────────────────────────────
  console.log('[1/4] 휴대폰 요금제 수집 중...');
  const phoneGroups = await fetchPlanGroups('HDP');
  if (!phoneGroups.length) {
    console.error('휴대폰 요금제 그룹을 가져올 수 없습니다.');
    process.exit(1);
  }

  let firstPlanCode = null;
  for (const group of phoneGroups) {
    await sleep(SLEEP_MS);
    const plans = await fetchPlansInGroup(group.pplGrpCd, 'HDP');
    const groupName = decodeHtmlEntities(group.pplGrpNm || '');
    console.log(`  ${groupName}: ${plans.length}개 요금제`);

    for (const p of plans) {
      const planName = mapPlanName(p.pplNm, groupName);
      const fee = parseAmount(p.punoMonthUseChage);
      if (planName && fee > 0) {
        PLAN_DATA[planName] = { fee, type: 'phone' };
        if (!firstPlanCode) firstPlanCode = p.onfrmCd;
      }
    }
  }
  console.log(`  → 휴대폰 요금제 ${Object.keys(PLAN_DATA).length}개 수집\n`);

  // ────────────────────────────────────
  // 2. 휴대폰 모델 + 출고가 수집
  // ────────────────────────────────────
  console.log('[2/4] 휴대폰 모델/출고가 수집 중...');
  if (!firstPlanCode) {
    console.error('요금제 코드가 없어 모델 조회 불가');
    process.exit(1);
  }

  const devices = await fetchDevices(firstPlanCode, 'HDP');
  console.log(`  API 응답: ${devices.length}개 단말`);

  for (const d of devices) {
    const code = d.hndsetModelNm;
    const name = decodeHtmlEntities(d.petNm || '').trim();
    const price = parseAmount(d.ofwAmt);
    if (code && name && price > 0) {
      PHONE_MODEL_MAP[code] = name;
      PHONE_PRICE_MAP[code] = price;
    }
  }
  console.log(`  → ${Object.keys(PHONE_MODEL_MAP).length}개 모델 수집\n`);

  // ────────────────────────────────────
  // 3. 태블릿(스마트기기) 요금제 수집
  // ────────────────────────────────────
  console.log('[3/4] 스마트기기(태블릿) 요금제 수집 중...');
  let tabletPlanCount = 0;
  try {
    const tabGroups = await fetchPlanGroups('TAB');
    if (tabGroups.length > 0) {
      for (const group of tabGroups) {
        await sleep(SLEEP_MS);
        const plans = await fetchPlansInGroup(group.pplGrpCd, 'TAB');
        const groupName = decodeHtmlEntities(group.pplGrpNm || '');
        console.log(`  ${groupName}: ${plans.length}개 요금제`);

        for (const p of plans) {
          const planName = mapTabletPlanName(p.pplNm);
          const fee = parseAmount(p.punoMonthUseChage);
          if (planName && fee > 0 && !PLAN_DATA[planName]) {
            PLAN_DATA[planName] = { fee, type: 'tablet' };
            tabletPlanCount++;
          }
        }
      }
    }
  } catch (e) {
    console.log(`  태블릿 API 조회 실패: ${e.message}`);
  }

  // API에서 태블릿 요금제를 못 가져온 경우 폴백
  if (tabletPlanCount === 0) {
    console.log('  API 응답 없음 → 기본 스마트기기 요금제 사용');
    const FALLBACK_TABLET_PLANS = {
      '5G 스마트기기 14GB': 19800,
      '5G 스마트기기 28GB': 30000,
      '5G 데이터투게더': 19800,
      '데이터투게더 Large': 11000
    };
    for (const [name, fee] of Object.entries(FALLBACK_TABLET_PLANS)) {
      PLAN_DATA[name] = { fee, type: 'tablet' };
      tabletPlanCount++;
    }
  }
  console.log(`  → 스마트기기 요금제 ${tabletPlanCount}개 수집\n`);

  // ────────────────────────────────────
  // 4. quote_data.js 출력
  // ────────────────────────────────────
  console.log('[4/4] quote_data.js 생성 중...');

  // 유효성 검사
  const modelCount = Object.keys(PHONE_MODEL_MAP).length;
  const planCount = Object.keys(PLAN_DATA).length;
  if (modelCount < 10) {
    console.error(`모델 수가 너무 적습니다 (${modelCount}개). 업데이트를 중단합니다.`);
    process.exit(1);
  }
  if (planCount < 20) {
    console.error(`요금제 수가 너무 적습니다 (${planCount}개). 업데이트를 중단합니다.`);
    process.exit(1);
  }

  const now = new Date().toISOString();
  const output = `// Auto-generated by quote_update.js - DO NOT EDIT MANUALLY
// Updated: ${now}

const PHONE_MODEL_MAP = ${JSON.stringify(PHONE_MODEL_MAP, null, 0)};

const PHONE_PRICE_MAP = ${JSON.stringify(PHONE_PRICE_MAP, null, 0)};

const PLAN_DATA = ${JSON.stringify(PLAN_DATA, null, 0)};
`;

  fs.writeFileSync(OUTPUT_FILE, output, 'utf8');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== 완료 ===`);
  console.log(`  모델: ${modelCount}개`);
  console.log(`  요금제: ${planCount}개 (휴대폰 ${planCount - tabletPlanCount} + 스마트기기 ${tabletPlanCount})`);
  console.log(`  출력: ${OUTPUT_FILE}`);
  console.log(`  소요: ${elapsed}초`);
}

main().catch(err => {
  console.error('\n오류 발생:', err.message);
  process.exit(1);
});
