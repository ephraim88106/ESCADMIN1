// 구양식(v3 이전) 폴백 파서.
// v3 문자(■ 머리표)가 아닐 때만 호출된다.
//
// 원래 이 파서는 `■`로 시작하는 줄을 매장 헤더로 보고 통째로 버렸다.
// 그 탓에 v3 문자를 붙여넣으면 한 줄도 등록되지 않았다.
// 이제 v3는 parseV3 가 처리하고, 여기서는 대괄호/매장명 헤더만 건너뛴다.

export function parseLegacy(text) {
  const result = {
    고정석: [],
    특이사항: [],
    온도: [],
    빈자리: [],
    주문: [],
    도착: [],
    전달: [],
  };

  const lines = text.split('\n');
  let mode = null;
  let tempZone = '';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // --- 매장명 헤더 (스킵) ---
    if (
      /^[●▣]/.test(line) ||
      /^\[.+\]/.test(line) ||
      (/^.+점\s*$/.test(line) && lines.indexOf(raw) === 0)
    ) {
      const cleanMatch = line.match(/\(([^)]*청소[^)]*)\)/);
      if (cleanMatch) result.전달.push('청소 일정: ' + cleanMatch[1]);
      const extraMatch = line.match(/\(사무실[^)]+\)/);
      if (extraMatch) result.전달.push(extraMatch[0]);
      mode = null;
      tempZone = '';
      continue;
    }

    // --- 고정석/지정석 ---
    if (/고정석|지정석/.test(line)) {
      const seats = line
        .replace(/.*(?:고정석|지정석)[:\s]*/i, '')
        .replace(/[[\]()]/g, '')
        .trim();
      if (seats) result.고정석.push(seats);
      mode = null;
      continue;
    }
    if (/^ㄴ\s*지정석/.test(line)) {
      const seats = line.replace(/ㄴ\s*지정석[:\s]*/i, '').trim();
      if (seats) result.고정석.push(seats);
      mode = null;
      continue;
    }
    if (/^\(\d[\d\s,]+\)$/.test(line) && result.고정석.length === 0 && result.온도.length === 0) {
      result.고정석.push(line.replace(/[()]/g, '').trim());
      mode = null;
      continue;
    }

    // --- 특이사항 ---
    if (/^[▶★☆*]/.test(line)) {
      result.특이사항.push(line.replace(/^[▶★☆*]\s*/, ''));
      mode = null;
      continue;
    }
    if (
      /고장|안꺼짐|안켜짐|오류|교체\s*필요|초기화\s*금지|떨어진|더러움|악취|청소\s*完/.test(line) &&
      !isTemperature(line)
    ) {
      result.특이사항.push(line.replace(/^[ㄴ]\s*/, ''));
      mode = null;
      continue;
    }

    // --- 빈자리 ---
    if (/^[ㄴ]?\s*빈\s?(자리|좌석)/i.test(line)) {
      mode = 'empty';
      continue;
    }
    if (mode === 'empty') {
      result.빈자리.push(line);
      mode = null;
      continue;
    }

    // --- 주문 ---
    if (/^이전\s*주문$|^주문$/i.test(line)) {
      mode = 'order';
      continue;
    }
    if (mode === 'order') {
      if (isSectionHeader(line)) {
        mode = null;
      } else {
        result.주문.push(line);
        continue;
      }
    }

    // --- 도착 ---
    if (/^도착$/i.test(line)) {
      mode = 'arrive';
      continue;
    }
    if (mode === 'arrive') {
      if (isSectionHeader(line)) {
        mode = null;
      } else {
        result.도착.push(line);
        continue;
      }
    }

    // --- 온도 구역 ---
    if (/^스터디/i.test(line)) {
      tempZone = '스터디';
      mode = 'temp';
      continue;
    }
    if (/^카페(존|테리아)?$/i.test(line) || /^\s*카페존/.test(line)) {
      tempZone = '카페존';
      mode = 'temp';
      continue;
    }

    if (isTemperature(line)) {
      const prefix = tempZone ? `[${tempZone}] ` : '';
      result.온도.push(prefix + line.replace(/^[ㄴ]\s*/, ''));
      mode = 'temp';
      continue;
    }

    if (mode === 'temp' && /냉난방|가동/.test(line)) {
      result.온도.push(line.replace(/[[\]]/g, ''));
      continue;
    }

    if (/^\[물풀|^\[공용/.test(line)) {
      result.전달.push(line.replace(/[[\]]/g, ''));
    } else {
      result.전달.push(line);
    }
    mode = null;
  }

  const sections = [];
  const push = (label, arr) => {
    if (arr.length > 0) sections.push({ label, content: arr.join('\n'), checked: false });
  };
  push('고정석', result.고정석);
  push('특이사항', result.특이사항);
  push('온도체크', result.온도);
  push('빈자리', result.빈자리);
  push('주문/발주', result.주문);
  push('도착', result.도착);
  push('전달사항', result.전달);

  return sections;
}

export function isTemperature(line) {
  const cleaned = line.replace(/^[ㄴ]\s*/, '').trim();
  if (/^\d+\s*:\s*\d+/.test(cleaned)) return true;
  if (/^\(?\d+번\)?\s*[:)]\s*\d+/.test(cleaned)) return true;
  if (/\d+\s*자리\s+\d+/.test(cleaned)) return true;
  if (/(?:카페테리아|담요|휴게실|냉장고|스터디룸|창가|신발장|자리|번\s).*\d{2,}/.test(cleaned)) return true;
  if (/^\d+번\s+\d{2}/.test(cleaned)) return true;
  if (/^\(\d+번\)\s*\d+/.test(cleaned)) return true;
  return false;
}

function isSectionHeader(line) {
  return /^[ㄴ]?\s*빈\s?(자리|좌석)|^도착$|^주문$|^이전\s*주문$|^스터디|^카페/i.test(line);
}
