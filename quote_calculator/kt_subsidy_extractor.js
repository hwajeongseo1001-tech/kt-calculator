(async function extractAllData() {
  console.log('=== KT 공통지원금 전체 데이터 추출 시작 (휴대폰+태블릿) ===');
  var sleep = function(ms) { return new Promise(function(r) { setTimeout(r, ms); }); };

  var allSubsidyData = {};
  var allModelInfo = {};

  var subTypes = [
    { name: '신규가입', code: '01' },
    { name: '번호이동', code: '02' },
    { name: '기기변경', code: '04' }
  ];

  // deviceType별 요금제 그룹
  var deviceCategories = [
    {
      deviceType: 'HDP', label: '휴대폰',
      planGroups: [
        { name: '5G 초이스', code: '140' },
        { name: '5G 일반', code: '93' },
        { name: '5G 청소년', code: '96' },
        { name: '5G 주니어', code: '145' },
        { name: '5G 시니어', code: '147' },
        { name: '5G 군인', code: '146' },
        { name: '5G 복지', code: '99' },
        { name: '5G 외국인', code: '120' }
      ]
    },
    {
      deviceType: 'TAB', label: '태블릿',
      planGroups: [
        { name: '스마트기기', code: '92' },
        { name: '데이터투게더', code: '148' }
      ]
    }
  ];

  function decodeHtml(str) {
    var txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  function parseRes(data) {
    if (typeof data === 'string') return JSON.parse(data);
    return data;
  }

  console.log('Step 1: 요금제 목록 수집 중...');
  var allPlans = [];

  for (var c = 0; c < deviceCategories.length; c++) {
    var cat = deviceCategories[c];
    console.log('--- ' + cat.label + ' 요금제 수집 ---');

    for (var g = 0; g < cat.planGroups.length; g++) {
      var group = cat.planGroups[g];
      try {
        var raw = await $.ajax({
          url: '/oneMinuteReform/supportAmtChoiceList.json',
          type: 'POST',
          dataType: 'json',
          data: {
            pplType: '5G',
            deviceType: cat.deviceType,
            pplSelect: group.code,
            spnsMonsType: '2',
            sortPpl: 'dataDesc',
            prodType: '30'
          }
        });
        var res = parseRes(raw);
        if (res.punoPplList && res.punoPplList.length > 0) {
          for (var p = 0; p < res.punoPplList.length; p++) {
            var plan = res.punoPplList[p];
            allPlans.push({
              group: group.name,
              deviceType: cat.deviceType,
              pplNm: decodeHtml(plan.pplNm),
              onfrmCd: plan.onfrmCd,
              fee: plan.punoMonthUseChage
            });
          }
          console.log('  ' + group.name + ': ' + res.punoPplList.length + '개 요금제');
        }
      } catch (e) {
        console.error('  ' + group.name + ' 오류:', e.statusText || e);
      }
      await sleep(300);
    }
  }

  console.log('총 ' + allPlans.length + '개 요금제 발견');

  if (allPlans.length === 0) {
    console.log('요금제를 찾지 못했습니다.');
    return;
  }

  var totalCalls = allPlans.length * subTypes.length;
  var currentCall = 0;

  for (var s = 0; s < subTypes.length; s++) {
    var subType = subTypes[s];
    if (!allSubsidyData[subType.name]) allSubsidyData[subType.name] = {};

    for (var i = 0; i < allPlans.length; i++) {
      var planItem = allPlans[i];
      currentCall++;
      var pct = Math.round(currentCall / totalCalls * 100);
      console.log('[' + pct + '%] ' + subType.name + ' / ' + planItem.pplNm + ' (' + planItem.deviceType + ')');

      try {
        var allDevices = [];
        var pageNo = 1;
        var totalPages = 1;

        do {
          var raw2 = await $.ajax({
            url: '/mobile/retvSuFuList.json',
            type: 'POST',
            dataType: 'json',
            data: {
              prodNm: 'mobile',
              prdcCd: planItem.onfrmCd,
              prodType: '30',
              deviceType: planItem.deviceType,
              makrCd: '',
              sortProd: 'oBspnsrPunoDateDesc',
              spnsMonsType: 'undefined',
              dscnOptnCd: 'HT',
              sbscTypeCd: subType.code,
              pageNo: pageNo
            }
          });
          var res2 = parseRes(raw2);

          if (res2.LIST_DATA) {
            allDevices = allDevices.concat(res2.LIST_DATA);
          }
          totalPages = (res2.pageInfoBean && res2.pageInfoBean.totalPageCount) || 1;
          pageNo++;
          await sleep(100);
        } while (pageNo <= totalPages);

        for (var d = 0; d < allDevices.length; d++) {
          var device = allDevices[d];
          var modelCode = device.hndsetModelNm;
          var subsidy = parseInt(device.ktSuprtAmt) || 0;
          var planName = decodeHtml(device.pplNm || planItem.pplNm);

          if (!allSubsidyData[subType.name][planName]) {
            allSubsidyData[subType.name][planName] = {};
          }
          allSubsidyData[subType.name][planName][modelCode] = subsidy;

          if (!allModelInfo[modelCode]) {
            allModelInfo[modelCode] = {
              name: decodeHtml(device.petNm || ''),
              price: parseInt(device.ofwAmt) || 0
            };
          }
        }
      } catch (e) {
        console.error('  오류:', e.status || e);
      }
      await sleep(200);
    }
  }

  console.log('=== 추출 완료 ===');
  console.log('모델 수:', Object.keys(allModelInfo).length);

  var fullData = {
    subsidy: allSubsidyData,
    models: allModelInfo
  };

  var output = JSON.stringify(fullData);
  var b = new Blob([output], {type: 'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'kt_subsidy_data.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  console.log('kt_subsidy_data.json 다운로드 완료! (공통지원금 + 모델정보 포함)');
  return fullData;
})();
