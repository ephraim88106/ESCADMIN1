// 파서 진입점. v3 양식이면 v3 파서, 아니면 구양식 파서로 자동 전환한다.
import { isV3Format, parseV3, toSections, V3_LABEL_ICONS } from './parseV3';
import { parseLegacy } from './parseLegacy';

const LEGACY_ICONS = {
  고정석: '💺',
  특이사항: '⚠️',
  온도체크: '🌡️',
  빈자리: '🪑',
  '주문/발주': '📦',
  도착: '🚚',
  전달사항: '📝',
};

export const LABEL_ICONS = { ...LEGACY_ICONS, ...V3_LABEL_ICONS };

/**
 * @returns {{ parsed: object|null, sections: Array, formatVersion: 'v3'|'legacy' }}
 */
export function parseHandoffText(text, baseTime = Date.now()) {
  if (isV3Format(text)) {
    const parsed = parseV3(text, baseTime);
    return { parsed, sections: toSections(parsed), formatVersion: 'v3' };
  }
  return { parsed: null, sections: parseLegacy(text), formatVersion: 'legacy' };
}

export { isV3Format };
