export type VisitResult = '대기중' | '대표부재' | '재방문필요' | '상담희망' | '즉시설치' | '거절' | '불가' | '방문실패' | '기사용' | '';
export type InstallStatus = '미설치' | '설치예정' | '설치완료' | '';
export type TTerminalStatus = '설치' | '미설치' | '모름' | '';
export type MerchantType = 'CONNECT' | 'BOOKING';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  status: 'pending' | 'active' | 'rejected';
  assignees: string[];
  createdAt?: any;
  updatedAt?: any;
}

export interface UserPlan {
  id: string; // userId_merchantId
  userId: string;
  merchantId: string;
  plannedDate: string;
  order: number;
  updatedAt: any;
}

export interface Merchant {
  id: string;
  ownerId?: string; // 소유자 UID
  ownerName?: string; // 소유자 이름 (담당자명으로 활용 가능)
  merchantType: MerchantType; // 커넥트(Connect) 또는 예약(Booking)
  groupName: string; // 업로드 시트(그룹)명
  
  // 공통 기본 정보
  name: string; // 식당명/가맹점명 (식당명)
  address: string; // 주소
  contact: string; // 연락처
  businessNumber: string; // 사업자등록번호
  
  // 영업 관리 정보
  assignee: string; // 담당자
  visitDate: string; // 방문일자 (YYYY-MM-DD)
  visitResult: VisitResult; // 방문결과
  notes: string; // 비고
  plannedDate?: string; // 방문 예정일 (YYYY-MM-DD) - Merchant 객체에서는 UI 표시용으로 머지됨
  
  // 신규 필드 (네이버 예약 영업 및 통합)
  criteria?: string; // 기준
  no?: string; // No.
  classification?: string; // 구분
  placeId?: string; // 플레이스 ID (네이버 플레이스 ID)
  category?: string; // 카테고리 (업종 카테고리)
  category2?: string; // 카테고리 2
  category3?: string; // 카테고리 3
  assignedPart?: string; // 배정 파트
  leadOwner?: string; // 리드 소유자
  contactStage?: string; // 컨택 단계
  contactStatusNotes?: string; // 비고(컨택 현황 자유 기재)

  // 방문(컨택) 성공 시 정보
  firstContactDate?: string; // 1차 컨택 성공 일자
  firstContactAssignee?: string; // 1차 컨택 담당자
  secondContactDate?: string; // 2차 컨택 성공 일자
  secondContactAssignee?: string; // 2차 컨택 담당자
  thirdContactDate?: string; // 3차 컨택 성공 일자
  thirdContactAssignee?: string; // 3차 컨택 담당자

  // 커넥트 전용
  vanCompany?: string; // VAN사
  vanAgencyName?: string; // VAN대리점명
  agencyContact?: string; // 대리점 연락처
  installStatus?: InstallStatus; // 설치상태
  installDate?: string; // 설치완료일자 (YYYY-MM-DD)
  tTerminalInstalled?: TTerminalStatus; // T단말기 설치여부

  // 기타 (기존 호환성 유지)
  bookingStatus?: string; // 예약 활성화 상태
  
  createdAt?: any;
  updatedAt?: any;
}

export const CONTACT_STAGE_CATEGORIES = {
  UNABLE: '안내불가',
  FOLLOW_UP: 'f/u 필요',
  REJECT: '거절',
  IMPOSSIBLE: '불가 또는 기가맹'
} as const;

export const CONTACT_STAGE_OPTIONS = {
  '안내불가': [
    '방문 시각 기준 의사결정자 없어 실질 컨택 및 안내 불가',
    '방문 시각 기준 브레이크, 영업시간 외로 안내 불가',
    '방문 시각 기준 피크타임으로 안내 불가',
    '방문 일자 기준 휴무로 안내 불가',
    '방문 일자 기준 공사, 행사 등의 상황으로 안내 불가'
  ],
  'f/u 필요': [
    '긍정적 반응으로 도입 절차 진행 확정',
    '긍정적 반응으로 도입 검토 중',
    '추가 확보한 담당자 연락처로 재컨택 예정',
    '즉시 결정 없이 내부 검토 예정',
    '영업 보류 (매장 특이사항 확인 후 재검토)'
  ],
  '거절': [
    '단순 거절 (추후 재검토 가능성 있음)',
    '강성 거절 (추후 재검토 가능성 없음)'
  ],
  '불가 또는 기가맹': [
    '네이버 예약 기존 사용 매장',
    '휴/폐업, 플레이스ID 확인 불가',
    '매장 환경상 도입 불가 판단'
  ]
};

export interface AuditLog {
  id: string;
  merchantId: string;
  merchantName: string;
  userEmail: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  timestamp: any;
}

export const MOCK_MERCHANTS: Merchant[] = [
  {
    id: '1',
    merchantType: 'CONNECT',
    groupName: '1차 DB',
    vanCompany: 'NICE',
    vanAgencyName: '나이스강남',
    agencyContact: '02-111-2222',
    name: '맛있는 덮밥집',
    businessNumber: '123-45-67890',
    address: '서울특별시 강남구 테헤란로 123',
    assignee: '김철수',
    visitDate: '',
    visitResult: '대기중',
    installStatus: '미설치',
    tTerminalInstalled: '미설치',
    notes: '점심시간 피해서 방문할 것',
    contact: '02-1234-5678',
  },
  {
    id: '2',
    merchantType: 'CONNECT',
    groupName: '1차 DB',
    vanCompany: 'KSNET',
    vanAgencyName: 'KS서초',
    agencyContact: '02-333-4444',
    name: '향긋한 커피전문점',
    businessNumber: '234-56-78901',
    address: '서울특별시 서초구 강남대로 456',
    assignee: '이영희',
    visitDate: '2023-10-25',
    visitResult: '상담희망',
    installStatus: '설치예정',
    tTerminalInstalled: '설치',
    notes: '사장님이 매우 긍정적임. 단말기 2대 필요.',
    contact: '010-9876-5432',
  },
  {
    id: '3',
    merchantType: 'CONNECT',
    groupName: '2차 DB',
    vanCompany: 'KICC',
    vanAgencyName: '이지체크송파',
    agencyContact: '02-555-6666',
    name: '우리동네 마트',
    businessNumber: '345-67-89012',
    address: '서울특별시 송파구 올림픽로 789',
    assignee: '김철수',
    visitDate: '2023-10-26',
    visitResult: '재방문필요',
    installStatus: '미설치',
    tTerminalInstalled: '모름',
    notes: '결정권자 부재로 다음 주 재방문',
    contact: '02-333-4444',
  },
  {
    id: '4',
    merchantType: 'CONNECT',
    groupName: '2차 DB',
    vanCompany: '',
    vanAgencyName: '',
    agencyContact: '',
    name: '신선한 과일가게',
    businessNumber: '',
    address: '서울특별시 강동구 천호대로 101',
    assignee: '',
    visitDate: '',
    visitResult: '대기중',
    installStatus: '미설치',
    tTerminalInstalled: '',
    notes: '',
    contact: '010-1111-2222',
  },
  {
    id: '5',
    merchantType: 'CONNECT',
    groupName: '3차 DB',
    vanCompany: 'SMARTRO',
    vanAgencyName: '스마트마포',
    agencyContact: '02-777-8888',
    name: '빠른 세탁소',
    businessNumber: '456-78-90123',
    address: '서울특별시 마포구 양화로 202',
    assignee: '박지민',
    visitDate: '2023-10-20',
    visitResult: '거절',
    installStatus: '미설치',
    tTerminalInstalled: '설치',
    notes: '기존 단말기 약정 남아서 거절',
    contact: '02-555-6666',
  }
];
