export type VisitResult = '대기중' | '대표부재' | '재방문필요' | '대리점상담희망' | '즉시설치' | '거절' | '불가' | '방문실패' | '';
export type InstallStatus = '미설치' | '설치예정' | '설치완료' | '';
export type TTerminalStatus = '설치' | '미설치' | '모름' | '';

export interface Merchant {
  id: string;
  groupName: string; // 업로드 시트(그룹)명
  vanCompany: string; // VAN사
  vanAgencyName: string; // VAN대리점명
  agencyContact: string; // 대리점 연락처
  name: string; // 식당명
  businessNumber: string; // 사업자등록번호
  address: string; // 주소
  assignee: string; // 담당자
  visitDate: string; // 방문일자 (YYYY-MM-DD)
  visitResult: VisitResult; // 방문결과
  installStatus: InstallStatus; // 설치상태
  installDate?: string; // 설치완료일자 (YYYY-MM-DD)
  tTerminalInstalled: TTerminalStatus; // T단말기 설치여부
  notes: string; // 비고
  contact: string; // 연락처
  createdAt?: any;
  updatedAt?: any;
}

export const MOCK_MERCHANTS: Merchant[] = [
  {
    id: '1',
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
    groupName: '1차 DB',
    vanCompany: 'KSNET',
    vanAgencyName: 'KS서초',
    agencyContact: '02-333-4444',
    name: '향긋한 커피전문점',
    businessNumber: '234-56-78901',
    address: '서울특별시 서초구 강남대로 456',
    assignee: '이영희',
    visitDate: '2023-10-25',
    visitResult: '대리점상담희망',
    installStatus: '설치예정',
    tTerminalInstalled: '설치',
    notes: '사장님이 매우 긍정적임. 단말기 2대 필요.',
    contact: '010-9876-5432',
  },
  {
    id: '3',
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
