/**
 * KT 공통지원금 자동 업데이트 스크립트
 * - KT API에서 모든 공통지원금 데이터를 추출
 * - kt_subsidy_data.json 저장
 * - calculator_1.html의 MODEL_MAP, PRICE_MAP, SUBSIDY_DATA 자동 업데이트
 *
 * Node.js 내장 모듈만 사용 (외부 npm 패키지 불필요)
 * 실행: node kt_auto_update.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── 설정 ──
const BASE_DIR = __dirname;
const JSON_OUTPUT = path.join(BASE_DIR, 'kt_subsidy_data.json');
const HTML_FILE = path.join(BASE_DIR, 'calculator_1.html');
const ADMIN_HTML_FILE = path.join(BASE_DIR, 'calculator_admin.html');
const SLEEP_MS = 300; // 요청 간 대기 시간

const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
  'Referer': 'https://shop.kt.com/smart/supportAmtList.do'
};

// 가입유형 코드
const SBSC_TYPES = [
  { code: '01', name: '신규가입' },
  { code: '02', name: '번호이동' },
  { code: '04', name: '기기변경' }
];

// ── KT 요금제명 → calculator 요금제명 매핑 규칙 ──
// KT API의 pplNm을 calculator의 PLAN_DATA 키로 변환
function mapPlanName(ktName, groupName) {
  let name = decodeHtmlEntities(ktName).trim();

  // 괄호 안 내용 처리: "(유튜브 프리미엄) 초이스 프리미엄" → "유튜브 프리미엄 초이스 프리미엄"
  const parenMatch = name.match(/^\((.+?)\)\s*(.+)$/);
  if (parenMatch) {
    name = parenMatch[1] + ' ' + parenMatch[2];
  }

  // "5G" prefix가 이미 있으면 그대로
  if (name.startsWith('5G ')) {
    // 특수 매핑
    // "5G Y슬림" → "5G Y 슬림"
    name = name.replace(/^5G Y슬림/, '5G Y 슬림');
    // "5G 슬림 21GB(이월)" → "5G 슬림(이월) 21GB"
    name = name.replace(/^(5G 슬림)\s+(\d+GB)\(이월\)/, '$1(이월) $2');
    return name;
  }

  // "5G" prefix 붙이기
  // 초이스 요금제: "티빙/지니/밀리 초이스 프리미엄" → "5G 티빙/지니/밀리 초이스 프리미엄"
  // 일반 요금제: "스페셜" → "5G 스페셜"
  let mapped = '5G ' + name;

  // "5G Y슬림" → "5G Y 슬림"
  mapped = mapped.replace(/^5G Y슬림/, '5G Y 슬림');
  // "5G 슬림 21GB(이월)" → "5G 슬림(이월) 21GB"
  mapped = mapped.replace(/^(5G 슬림)\s+(\d+GB)\(이월\)/, '$1(이월) $2');

  return mapped;
}

// ── HTML entity 디코딩 ──
function decodeHtmlEntities(str) {
  if (!str) return str;
  const entities = {
    '&#x2F;': '/',
    '&#40;': '(',
    '&#41;': ')',
    '&#39;': "'",
    '&#34;': '"',
    '&#38;': '&',
    '&#60;': '<',
    '&#62;': '>',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#x27;': "'",
    '&#x28;': '(',
    '&#x29;': ')',
    '&#43;': '+',
    '&#x2B;': '+'
  };
  let result = str;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.split(entity).join(char);
  }
  // 숫자 기반 entity 처리: &#NNN;
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  // hex 기반 entity 처리: &#xHH;
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return result;
}

// ── 기존 calculator 모델코드 alias 매핑 ──
// KT 모델코드 → calculator에서 사용하던 alias 코드들
const MODEL_ALIASES = {
  'AIP17-256': ['IPHONE17_256'],
  'AIP17-512': ['IPHONE17_512'],
  'AIP17P-256': ['IPHONE17PRO_256'],
  'AIP17P-512': ['IPHONE17PRO_512'],
  'AIP17P-1T': ['IPHONE17PRO_1T'],
  'AIP17PM-256': ['IPHONE17PROMAX_256'],
  'AIP17PM-512': ['IPHONE17PROMAX_512'],
  'AIP17PM-1T': ['IPHONE17PROMAX_1T'],
  'AIP17PM-2T': ['IPHONE17PROMAX_2T'],
  'AIP17E-256': [],
  'AIP17E-512': [],
  'AIPA-256': ['IPHONEAIR_256'],
  'AIPA-512': ['IPHONEAIR_512'],
  'AIPA-1T': ['IPHONEAIR_1T'],
  'AIP16-128': ['IPHONE16_128'],
  'AIP16-256': ['IPHONE16_256'],
  'AIP16-512': ['IPHONE16_512'],
  'AIP16PS-128': ['IPHONE16PLUS_128'],
  'AIP16PS-256': ['IPHONE16PLUS_256'],
  'AIP16PS-512': ['IPHONE16PLUS_512'],
  'AIP16P-128': ['IPHONE16PRO_128'],
  'AIP16P-256': ['IPHONE16PRO_256'],
  'AIP16P-512': ['IPHONE16PRO_512'],
  'AIP16P-1T': ['IPHONE16PRO_1T'],
  'AIP16PM-256': ['IPHONE16PROMAX_256'],
  'AIP16PM-512': ['IPHONE16PROMAX_512'],
  'AIP16PM-1T': ['IPHONE16PROMAX_1T'],
  'AIP16E-128': ['IPHONE16E_128'],
  'AIP16E-256': ['IPHONE16E_256'],
  'AIP16E-512': ['IPHONE16E_512'],
  'AIP15-128': ['IPHONE15_128'],
  'AIP15-256': ['IPHONE15_256'],
  'AIP15-512': ['IPHONE15_512'],
  'AIP15PS-128': ['IPHONE15PLUS_128'],
  'AIP15PS-256': ['IPHONE15PLUS_256'],
  'AIP15PS-512': ['IPHONE15PLUS_512'],
  'AIP15P-128': ['IPHONE15PRO_128'],
  'AIP15P-256': ['IPHONE15PRO_256'],
  'AIP15P-512': ['IPHONE15PRO_512'],
  'AIP15P-1T': ['IPHONE15PRO_1T'],
  'AIP15PM-256': ['IPHONE15PROMAX_256'],
  'AIP15PM-512': ['IPHONE15PROMAX_512'],
  'AIP15PM-1T': ['IPHONE15PROMAX_1T'],
  'AIP13-128': ['IPHONE13_128'],
  'SM-S931NK': ['SM-S931N0'],
  'SM-S931NK512': [],
  'SM-S937NK': ['SM-S937N0'],
  'SM-S937NK512': ['SM-S937N0512'],
  'SM-S937NKIB': ['SM-S937NKIB'],
  'SM-S937NK512IB': ['SM-S937NK512IB'],
  'SM-S731NK': ['SM-S731N0'],
  'SM-F766NK': ['SM-F766N0'],
  'SM-A175NK': ['SM-A175N0'],
  'XT2601-2K': ['EDGE50'],
  'XT2429-2K': [],
  'XT2529-2K': ['MOTOG56'],
  'XT2363-3K': ['G34'],
  'MI-RM14CK': ['REDMI14C'],
  'MI-XM14TK': ['XIAOMI14T'],
  'MI-RMN14P5GK': ['REDMINOTE14PRO'],
  'MI-RMN14P5GK512': ['REDMINOTE14PRO512'],
  'MI-RMN14K': ['REDMINOTE14'],
  'SM-M366K': [],
  'SM-M366K-MOM': [],
  'SM-A366NK': [],
  'SM-A175NK-KP': [],
  'Z2339K': ['SM-A032NK', 'CINNAMOROLL'],
  'AT-M130K': ['CLASSIC_FOLDER'],
  'SM-F741NK': ['SM-F741NK_MARU'],
  'SM-A165NK': [],
  'SM-A156NK': [],
  'SM-A146NK': [],
  'SM-S931NK_CROCS': []
};

// ── HTTP POST 함수 ──
function postRequest(urlStr, bodyStr) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Length': Buffer.byteLength(bodyStr, 'utf8')
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          let parsed = typeof data === 'string' ? data : data.toString();
          // 응답이 JSON 문자열일 수 있음
          try {
            parsed = JSON.parse(parsed);
          } catch {
            // 이미 파싱 실패면 raw string 반환
          }
          if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch {}
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error(`JSON parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.write(bodyStr);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Step 1: 요금제 그룹 목록 조회 ──
async function fetchPlanGroups() {
  const body = 'pplType=5G&deviceType=HDP&prodType=30&spnsMonsType=2';
  const res = await postRequest('https://shop.kt.com/oneMinuteReform/supportAmtChoiceGroupList.json', body);
  const data = typeof res === 'string' ? JSON.parse(res) : res;
  return data.punoPplGroupList || [];
}

// ── Step 2: 그룹별 요금제 목록 조회 ──
async function fetchPlansInGroup(groupCode) {
  const body = `pplType=5G&deviceType=HDP&pplSelect=${groupCode}&spnsMonsType=2&sortPpl=dataDesc&prodType=30`;
  const res = await postRequest('https://shop.kt.com/oneMinuteReform/supportAmtChoiceList.json', body);
  const data = typeof res === 'string' ? JSON.parse(res) : res;
  // punoPplList 또는 punoPpIList (대소문자 주의)
  return data.punoPplList || data.punoPpIList || [];
}

// ── Step 3: 요금제별 단말기 공통지원금 조회 (모든 페이지) ──
async function fetchSubsidyForPlan(onfrmCd, sbscTypeCd) {
  let allDevices = [];
  let pageNo = 1;
  let totalPages = 1;

  while (pageNo <= totalPages) {
    const body = `prodNm=mobile&prdcCd=${onfrmCd}&prodType=30&deviceType=HDP&makrCd=&sortProd=oBspnsrPunoDateDesc&spnsMonsType=undefined&dscnOptnCd=HT&sbscTypeCd=${sbscTypeCd}&pageNo=${pageNo}`;
    let res;
    for (let retry = 0; retry < 3; retry++) {
      try {
        res = await postRequest('https://shop.kt.com/mobile/retvSuFuList.json', body);
        break;
      } catch (e) {
        if (retry < 2) { console.log(`    재시도 ${retry+1}/3...`); await sleep(3000); }
        else throw e;
      }
    }
    const data = typeof res === 'string' ? JSON.parse(res) : res;

    const list = data.LIST_DATA || [];
    allDevices = allDevices.concat(list);

    if (pageNo === 1 && data.pageInfoBean) {
      totalPages = parseInt(data.pageInfoBean.totalPageCount) || 1;
    }

    pageNo++;
    if (pageNo <= totalPages) {
      await sleep(SLEEP_MS);
    }
  }

  return allDevices;
}

// ── 숫자 파싱: "183,000" → 183000 ──
function parseAmount(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  return parseInt(String(val).replace(/,/g, ''), 10) || 0;
}

// ── 메인 실행 ──
async function main() {
  const startTime = Date.now();
  console.log('=== KT 공통지원금 자동 업데이트 ===\n');

  // ── Step 1: 요금제 그룹 + 요금제 목록 ──
  console.log('[1/3] 요금제 목록 수집 중...');

  const groups = await fetchPlanGroups();
  if (!groups.length) {
    console.error('요금제 그룹을 가져올 수 없습니다.');
    process.exit(1);
  }

  // 그룹별 요금제 수집
  const allPlans = []; // { onfrmCd, pplNm, groupName, monthFee }
  for (const group of groups) {
    await sleep(SLEEP_MS);
    const plans = await fetchPlansInGroup(group.pplGrpCd);
    const groupName = decodeHtmlEntities(group.pplGrpNm || '');
    console.log(`  ${groupName}: ${plans.length}개 요금제`);

    for (const p of plans) {
      allPlans.push({
        onfrmCd: p.onfrmCd,
        pplNm: decodeHtmlEntities(p.pplNm || ''),
        groupName: groupName,
        monthFee: parseAmount(p.punoMonthUseChage)
      });
    }
  }

  console.log(`총 ${allPlans.length}개 요금제 발견\n`);

  // ── Step 2: 공통지원금 데이터 수집 ──
  console.log('[2/3] 공통지원금 데이터 수집 중...');

  const subsidyResult = {}; // { 가입유형: { planName: { modelCode: amount } } }
  const modelsMap = {};     // { modelCode: { name, price } }

  const totalTasks = SBSC_TYPES.length * allPlans.length;
  let completedTasks = 0;

  for (const sbscType of SBSC_TYPES) {
    subsidyResult[sbscType.name] = {};

    for (const plan of allPlans) {
      await sleep(SLEEP_MS);
      const devices = await fetchSubsidyForPlan(plan.onfrmCd, sbscType.code);

      const calcPlanName = mapPlanName(plan.pplNm, plan.groupName);
      const planSubsidy = {};

      for (const dev of devices) {
        const modelCode = dev.hndsetModelNm;
        const subsidyAmt = parseAmount(dev.ktSuprtAmt);
        const price = parseAmount(dev.ofwAmt);
        const deviceName = decodeHtmlEntities(dev.petNm || '');

        if (modelCode && subsidyAmt > 0) {
          planSubsidy[modelCode] = subsidyAmt;
        }

        // 모델 정보 수집 (최신 정보로 업데이트)
        if (modelCode && !modelsMap[modelCode]) {
          modelsMap[modelCode] = { name: deviceName, price: price };
        }
      }

      if (Object.keys(planSubsidy).length > 0) {
        subsidyResult[sbscType.name][calcPlanName] = planSubsidy;
      }

      completedTasks++;
      const pct = Math.round((completedTasks / totalTasks) * 100);
      console.log(`  [${pct}%] ${sbscType.name} / ${plan.pplNm} (${devices.length}건)`);
    }
  }

  // ── JSON 저장 ──
  const jsonData = {
    subsidy: subsidyResult,
    models: modelsMap,
    updated: new Date().toISOString()
  };

  fs.writeFileSync(JSON_OUTPUT, JSON.stringify(jsonData, null, 2), 'utf8');
  console.log(`\nkt_subsidy_data.json 저장 완료 (${Object.keys(modelsMap).length}개 모델)\n`);

  // ── Step 3: calculator_1.html 업데이트 ──
  console.log('[3/3] calculator_1.html 업데이트 중...');

  if (!fs.existsSync(HTML_FILE)) {
    console.error('calculator_1.html 파일을 찾을 수 없습니다.');
    process.exit(1);
  }

  let html = fs.readFileSync(HTML_FILE, 'utf8');

  // MODEL_MAP 생성: KT 모델코드 + alias 코드
  const newModelMap = {};
  for (const [code, info] of Object.entries(modelsMap)) {
    newModelMap[code] = info.name;
    // alias 추가
    const aliases = MODEL_ALIASES[code] || [];
    for (const alias of aliases) {
      if (alias !== code) {
        newModelMap[alias] = info.name;
      }
    }
  }

  // PRICE_MAP 생성: KT 모델코드 + alias 코드
  const newPriceMap = {};
  for (const [code, info] of Object.entries(modelsMap)) {
    newPriceMap[code] = info.price;
    const aliases = MODEL_ALIASES[code] || [];
    for (const alias of aliases) {
      if (alias !== code) {
        newPriceMap[alias] = info.price;
      }
    }
  }

  // SUBSIDY_DATA 생성: alias 코드도 추가
  const newSubsidyData = {};
  for (const [typeName, plans] of Object.entries(subsidyResult)) {
    newSubsidyData[typeName] = {};
    for (const [planName, devices] of Object.entries(plans)) {
      const planDevices = {};
      for (const [modelCode, amount] of Object.entries(devices)) {
        planDevices[modelCode] = amount;
        // alias 추가
        const aliases = MODEL_ALIASES[modelCode] || [];
        for (const alias of aliases) {
          if (alias !== modelCode) {
            planDevices[alias] = amount;
          }
        }
      }
      newSubsidyData[typeName][planName] = planDevices;
    }
  }

  // HTML 내 변수 교체
  // MODEL_MAP 교체
  html = html.replace(
    /const MODEL_MAP = \{[^;]*\};/,
    'const MODEL_MAP = ' + JSON.stringify(newModelMap) + ';'
  );

  // PRICE_MAP 교체
  html = html.replace(
    /const PRICE_MAP = \{[^;]*\};/,
    'const PRICE_MAP = ' + JSON.stringify(newPriceMap) + ';'
  );

  // SUBSIDY_DATA 교체 (중첩된 JSON이므로 정규식 대신 indexOf 사용)
  const sdStart = html.indexOf('const SUBSIDY_DATA = {');
  const sdSearchFrom = sdStart + 'const SUBSIDY_DATA = '.length;
  // JSON 끝 찾기: 중괄호 매칭
  let braceCount = 0;
  let sdEnd = -1;
  for (let i = sdSearchFrom; i < html.length; i++) {
    if (html[i] === '{') braceCount++;
    else if (html[i] === '}') { braceCount--; if (braceCount === 0) { sdEnd = i + 1; break; } }
  }
  if (sdStart !== -1 && sdEnd !== -1) {
    // ';' 포함
    while (sdEnd < html.length && (html[sdEnd] === ';' || html[sdEnd] === '\n')) sdEnd++;
    html = html.substring(0, sdStart) + 'const SUBSIDY_DATA = ' + JSON.stringify(newSubsidyData) + ';\n' + html.substring(sdEnd);
  }

  // Notes 섹션 날짜 업데이트
  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
  html = html.replace(
    /공통지원금 데이터 기준일: .*?\(KT 공식 온라인샵 기준\)/,
    `공통지원금 데이터 기준일: ${dateStr} (KT 공식 온라인샵 기준)`
  );

  fs.writeFileSync(HTML_FILE, html, 'utf8');

  // ── calculator_admin.html 업데이트 ──
  if (fs.existsSync(ADMIN_HTML_FILE)) {
    console.log('  calculator_admin.html 업데이트 중...');
    let adminHtml = fs.readFileSync(ADMIN_HTML_FILE, 'utf8');

    adminHtml = adminHtml.replace(
      /const MODEL_MAP = \{[^;]*\};/,
      'const MODEL_MAP = ' + JSON.stringify(newModelMap) + ';'
    );
    adminHtml = adminHtml.replace(
      /const PRICE_MAP = \{[^;]*\};/,
      'const PRICE_MAP = ' + JSON.stringify(newPriceMap) + ';'
    );
    // SUBSIDY_DATA 교체 (중첩 JSON → indexOf 사용)
    const asdStart = adminHtml.indexOf('const SUBSIDY_DATA = {');
    const asdSearchFrom = asdStart + 'const SUBSIDY_DATA = '.length;
    let aBraceCount = 0;
    let asdEnd = -1;
    for (let i = asdSearchFrom; i < adminHtml.length; i++) {
      if (adminHtml[i] === '{') aBraceCount++;
      else if (adminHtml[i] === '}') { aBraceCount--; if (aBraceCount === 0) { asdEnd = i + 1; break; } }
    }
    if (asdStart !== -1 && asdEnd !== -1) {
      while (asdEnd < adminHtml.length && (adminHtml[asdEnd] === ';' || adminHtml[asdEnd] === '\n')) asdEnd++;
      adminHtml = adminHtml.substring(0, asdStart) + 'const SUBSIDY_DATA = ' + JSON.stringify(newSubsidyData) + ';\n' + adminHtml.substring(asdEnd);
    }
    adminHtml = adminHtml.replace(
      /공통지원금 데이터 기준일: .*?\(KT 공식 온라인샵 기준\)/,
      `공통지원금 데이터 기준일: ${dateStr} (KT 공식 온라인샵 기준)`
    );

    fs.writeFileSync(ADMIN_HTML_FILE, adminHtml, 'utf8');
    console.log('  calculator_admin.html 업데이트 완료!');
  } else {
    console.log('  calculator_admin.html 파일 없음 - 건너뜀');
  }

  // 통계 출력
  const modelCount = Object.keys(newModelMap).length;
  const priceCount = Object.keys(newPriceMap).length;
  const typeCount = Object.keys(newSubsidyData).length;
  const planCount = new Set(
    Object.values(newSubsidyData).flatMap(plans => Object.keys(plans))
  ).size;

  console.log(`  MODEL_MAP: ${modelCount}개 모델`);
  console.log(`  PRICE_MAP: ${priceCount}개`);
  console.log(`  SUBSIDY_DATA: ${typeCount}개 가입유형 x ${planCount}개 요금제`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const todayFmt = today.toISOString().split('T')[0];
  console.log(`\n업데이트 완료! (${todayFmt}) [${elapsed}초 소요]`);

  // ── Step 4: GitHub Pages 자동 배포 ──
  console.log('\n[4/4] GitHub Pages 배포 중...');
  const { execSync } = require('child_process');
  try {
    execSync('git add calculator_1.html calculator_admin.html kt_subsidy_data.json', { cwd: BASE_DIR, stdio: 'pipe' });
    execSync(`git commit -m "data: ${todayFmt} KT auto-update"`, { cwd: BASE_DIR, stdio: 'pipe' });
    execSync('git push', { cwd: BASE_DIR, stdio: 'pipe' });
    console.log('  GitHub Pages 배포 완료!');
  } catch (e) {
    const msg = e.stderr ? e.stderr.toString() : e.message;
    if (msg.includes('nothing to commit')) {
      console.log('  변경사항 없음 - push 건너뜀');
    } else {
      console.error('  GitHub push 실패:', msg);
    }
  }
}

// ── 실행 ──
main().catch(err => {
  console.error('오류 발생:', err.message);
  console.error(err.stack);
  process.exit(1);
});
