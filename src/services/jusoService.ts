/// <reference types="vite/client" />

/**
 * 도로명주소 API 서비스
 * 링크: https://business.juso.go.kr/addrlink/addrLinkApi.do
 */

const JUSO_API_URL = 'https://business.juso.go.kr/addrlink/addrLinkApi.do';

export interface JusoResult {
  roadAddr: string;        // 전체 도로명주소
  roadAddrPart1: string;   // 도로명주소(참고항목 제외)
  roadAddrPart2: string;   // 도로명주소(참고항목)
  jibunAddr: string;       // 지번주소
  engAddr: string;         // 도로명주소(영문)
  zipNo: string;           // 우편번호
  admCd: string;           // 행정구역코드
  rnMgtSn: string;         // 도로명코드
  bdMgtSn: string;         // 건물관리번호
  detBdNmList: string;     // 상세건물명
  bdNm: string;            // 건물명
  bdKdcd: string;          // 공동주택여부
  siNm: string;            // 시도명
  sggNm: string;           // 시군구명
  emdNm: string;           // 읍면동명
  liNm: string;            // 법정리명
  rn: string;              // 도로명
  buldMnnm: string;        // 건물본번
  buldSlno: string;        // 건물부번
  mtYn: string;            // 산여부
  lnbrMnnm: string;        // 지번본번(번지)
  lnbrSlno: string;        // 지번부번(호)
  emdNo: string;           // 읍면동일련번호
}

// 캐시용 Map 정의 (모듈 레벨)
const jusoCache = new Map<string, JusoResult | null>();
const pendingRequests = new Map<string, Promise<JusoResult | null>>();

export async function searchJuso(keyword: string): Promise<JusoResult | null> {
  const confmKey = import.meta.env.VITE_JUSO_CONFIRM_KEY;
  
  if (!confmKey) {
    console.warn('VITE_JUSO_CONFIRM_KEY is not set. Address normalization skipped.');
    return null;
  }

  const fetchJuso = async (k: string): Promise<JusoResult | null> => {
    const trimmedK = k.trim().replace(/\s+/g, ' ');
    if (!trimmedK) return null;
    
    // 1. 캐시 확인
    if (jusoCache.has(trimmedK)) return jusoCache.get(trimmedK)!;

    // 2. 이미 진행 중인 동일한 요청이 있는지 확인
    if (pendingRequests.has(trimmedK)) {
      return pendingRequests.get(trimmedK)!;
    }

    // 3. 실제 API 요청 수행
    const requestPromise = (async () => {
      try {
        const params = new URLSearchParams({
          confmKey,
          currentPage: '1',
          countPerPage: '1',
          keyword: trimmedK,
          resultType: 'json'
        });

        const response = await fetch(`${JUSO_API_URL}?${params.toString()}`);
        if (!response.ok) return null;

        const data = await response.json();
        const results = data.results?.juso || [];
        
        const result = results.length > 0 ? (results[0] as JusoResult) : null;
        jusoCache.set(trimmedK, result);
        return result;
      } catch (error) {
        console.error('Juso API search error:', error);
        return null;
      } finally {
        // 완료 후 대기 목록에서 제거
        pendingRequests.delete(trimmedK);
      }
    })();

    pendingRequests.set(trimmedK, requestPromise);
    return requestPromise;
  };

  const trimmed = keyword.trim()
    .replace(/[.]$/, '') // 끝에 붙은 마침표 제거
    .replace(/\s+/g, ' '); // 다중 공백 제거
  
  // 1차 시도: 전체 주소
  let result = await fetchJuso(trimmed);
  if (result) return result;

  // 2차 시도: 쉼표 나 괄호 앞까지만 (상세 주소 제거)
  const basicMatch = trimmed.match(/^[^,([]+/);
  if (basicMatch) {
    const cleaned = basicMatch[0].trim();
    if (cleaned !== trimmed) {
      result = await fetchJuso(cleaned);
      if (result) return result;
    }
  }

  // 3차 시도: 도로명 + 건물번호 패턴 추출
  // 대로, 도로, 번길, 길, 로, 가 뒤에 숫자가 오는 패턴
  const roadMatch = trimmed.match(/(.*(?:대로|도로|번길|길|로|가))\s*(\d+(?:-\d+)?)/);
  if (roadMatch) {
    const roadWithNum = `${roadMatch[1].trim()} ${roadMatch[2].trim()}`;
    result = await fetchJuso(roadWithNum);
    if (result) return result;

    // 4차 시도: 앞의 행정구역(시/도/구)을 다 떼고 순수 도로명+번호만 시도
    // 예: "성남시 분당구 야탑로 22" -> "야탑로 22"
    const roadParts = roadMatch[1].trim().split(' ');
    for (let i = roadParts.length - 1; i >= 0; i--) {
      // 뒤에서부터 하나씩 합쳐보며 가장 짧은 도로명부터 시도
      const subRoad = roadParts.slice(i).join(' ');
      const candidate = `${subRoad} ${roadMatch[2].trim()}`;
      if (candidate !== roadWithNum) {
        result = await fetchJuso(candidate);
        if (result) return result;
      }
    }
  }

  return result;
}

/**
 * 주소를 정규화합니다.
 * @param address 검색할 주소
 * @param type 'road' (도로명) 또는 'jibun' (지번)
 */
export async function normalizeAddress(address: string, type: 'road' | 'jibun' = 'road'): Promise<string> {
  const result = await searchJuso(address);
  if (!result) return address;
  
  if (type === 'jibun') {
    // 지번 주소: 시도 + 시군구 + 읍면동 + 법정리 + 번지-호
    const parts = [
      result.siNm,
      result.sggNm,
      result.emdNm,
      result.liNm
    ].filter(Boolean);

    let jibunBase = parts.join(' ');
    if (result.lnbrMnnm) {
      jibunBase += ` ${result.lnbrMnnm}`;
      if (result.lnbrSlno && result.lnbrSlno !== '0') {
        jibunBase += `-${result.lnbrSlno}`;
      }
    }
    return jibunBase;
  }
  
  // 도로명 주소: roadAddrPart1은 참고항목(괄호) 및 상세주소를 제외한 기본 도로명 주소입니다.
  return result.roadAddrPart1 || result.roadAddr;
}
