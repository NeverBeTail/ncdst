import React, { useMemo, useState } from 'react';
import { Merchant, CONTACT_STAGE_OPTIONS } from './types';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, AreaChart, Area } from 'recharts';
import { MapPin, CheckCircle, Clock, Users, ArrowUpRight } from 'lucide-react';

interface DashboardProps {
  merchants: Merchant[];
}

const N_GREEN = '#03C75A';
const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ff7300'];

const RESULT_COLORS: Record<string, string> = {
  '대기중': '#D1D5DB', // gray-300
  '대표부재': '#FDBA74', // orange-300
  '재방문필요': '#93C5FD', // blue-300
  '상담희망': '#86EFAC', // green-300
  '즉시설치': '#03C75A', // N_GREEN
  '거절': '#FCA5A5', // red-300
  '불가': '#9CA3AF', // gray-400
  '방문실패': '#C084FC', // purple-400
  '미처리': '#E5E7EB', // gray-200
};

export default function Dashboard({ merchants }: DashboardProps) {
  const [selectedAssignee, setSelectedAssignee] = useState<string | '전체'>('전체');
  const [selectedGroup, setSelectedGroup] = useState<string | '전체'>('전체');
  const [selectedType, setSelectedType] = useState<'전체' | 'CONNECT' | 'BOOKING'>('전체');

  const {
    filteredMerchants,
    total,
    resultData,
    assigneeData,
    tTerminalData,
    installTargets,
    positiveCount,
    installedCount,
    pendingInstallCount,
    dateData,
    totalAttempted,
    totalCompleted,
    avgLeadTime,
    visitSuccessRate,
    visitPositiveRate,
    positiveInstallRate,
    groups,
    assignees,
    bookingStatusData,
    contactStageData,
    assignedPartData,
    contactHistoryStats
  } = useMemo(() => {
    const assigneesList = Array.from(new Set(merchants.map(m => m.assignee || '미배정')));
    const groupsList = Array.from(new Set(merchants.map(m => m.groupName).filter(Boolean)));

    const filtered = merchants.filter(m => {
      const matchAssignee = selectedAssignee === '전체' || (m.assignee || '미배정') === selectedAssignee;
      const matchGroup = selectedGroup === '전체' || m.groupName === selectedGroup;
      const matchType = selectedType === '전체' || m.merchantType === selectedType;
      return matchAssignee && matchGroup && matchType;
    });

    const totalCount = filtered.length;

    // 1. 상태별 통계
    const resultCounts = filtered.reduce((acc, curr) => {
      const res = curr.visitResult || '미처리';
      acc[res] = (acc[res] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const resultDataArr = Object.entries(resultCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 2. 담당자별 처리 현황
    const assigneeStats = filtered.reduce((acc, curr) => {
      const assignee = curr.assignee || '미배정';
      if (!acc[assignee]) {
        acc[assignee] = { name: assignee, total: 0, '미처리': 0, '대기중': 0, '대표부재': 0, '재방문필요': 0, '상담희망': 0, '즉시설치': 0, '거절': 0, '불가': 0, '방문실패': 0, '기사용': 0 };
      }
      const result = curr.visitResult || '미처리';
      if (acc[assignee][result] !== undefined) {
        acc[assignee][result] += 1;
      }
      acc[assignee].total += 1;
      return acc;
    }, {} as Record<string, any>);
    const assigneeDataArr = Object.values(assigneeStats)
      .filter((a: any) => a.name !== '미배정')
      .sort((a: any, b: any) => b.total - a.total);

    // 3. T단말기 설치 여부 통계 (방문 시도 기준) - 고정 순서로 개선
    const attempted = filtered.filter(m => m.visitDate && m.visitDate.trim() !== '');
    const tTerminalCounts: Record<string, number> = { '설치': 0, '미설치': 0, '모름': 0 };
    attempted.forEach(curr => {
      const status = curr.tTerminalInstalled || '모름'; // Empty also goes to '모름'
      const key = (status === '설치' || status === '미설치' || status === '모름') ? status : '모름';
      tTerminalCounts[key] = (tTerminalCounts[key] || 0) + 1;
    });
    const tTerminalDataArr = ['설치', '미설치', '모름'].map(name => ({
      name,
      value: tTerminalCounts[name] || 0
    })).filter(d => d.value > 0);

    // 4. 설치 상태 통계 (대상: 대리점상담희망, 즉시설치)
    const targets = filtered.filter(m => ['상담희망', '즉시설치'].includes(m.visitResult));
    const posCount = targets.length;
    const instCount = targets.filter(m => m.installStatus === '설치완료').length;
    const pendCount = targets.filter(m => m.installStatus === '설치예정').length;

    // 5. 방문 일자별 트렌드
    const dateCounts = filtered.reduce((acc, curr) => {
      if (!curr.visitDate) return acc;
      const d = curr.visitDate.substring(0, 10);
      acc[d] = (acc[d] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const dateDataArr = Object.entries(dateCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Summary stats
    const totalAtt = attempted.length;
    const totalComp = filtered.filter(m => m.visitDate && m.visitDate.trim() !== '' && m.visitResult !== '방문실패').length;
    
    const installDoneWithDates = targets.filter(m => m.installStatus === '설치완료' && m.visitDate && m.installDate);
    const totalLeadTimeDays = installDoneWithDates.reduce((sum, m) => {
      const start = new Date(m.visitDate);
      const end = new Date(m.installDate!);
      const diff = Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      return sum + diff;
    }, 0);

    // 6. 예약 전용: 예약 상태 통계
    const bookingStatusCounts = filtered.filter(m => m.merchantType === 'BOOKING').reduce((acc, curr) => {
      const status = curr.bookingStatus || '미입력';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const bookingStatusDataArr = Object.entries(bookingStatusCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 7. 예약 전용: 컨택 단계 통계 (버킷팅 적용)
    const contactStageCounts = filtered.filter(m => m.merchantType === 'BOOKING').reduce((acc, curr) => {
      const stage = curr.contactStage || '미입력';
      
      // 버킷팅 로직
      let bucket = '미입력';
      if (stage === '미입력') {
        bucket = '미입력';
      } else {
        const found = Object.entries(CONTACT_STAGE_OPTIONS).find(([category, options]) => 
          options.includes(stage)
        );
        bucket = found ? found[0] : '기타';
      }

      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const bucketOrder = ['안내불가', 'f/u 필요', '거절', '불가 또는 기가맹', '기타', '미입력'];
    const contactStageDataArr = bucketOrder
      .map(name => ({ name, value: contactStageCounts[name] || 0 }))
      .filter(d => d.value > 0);

    // 8. 예약 전용: 배정 파트 통계
    const assignedPartCounts = filtered.filter(m => m.merchantType === 'BOOKING').reduce((acc, curr) => {
      const part = curr.assignedPart || '미지정';
      acc[part] = (acc[part] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const assignedPartDataArr = Object.entries(assignedPartCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 9. 예약 전용: 컨택 성공 이력 통계
    const bookingMerchants = filtered.filter(m => m.merchantType === 'BOOKING');
    const contactHistoryStatsObj = {
      first: bookingMerchants.filter(m => m.firstContactDate).length,
      second: bookingMerchants.filter(m => m.secondContactDate).length,
      third: bookingMerchants.filter(m => m.thirdContactDate).length,
      total: bookingMerchants.length
    };

    return {
      filteredMerchants: filtered,
      total: totalCount,
      resultData: resultDataArr,
      assigneeData: assigneeDataArr,
      tTerminalData: tTerminalDataArr,
      installTargets: targets,
      positiveCount: posCount,
      installedCount: instCount,
      pendingInstallCount: pendCount,
      dateData: dateDataArr,
      totalAttempted: totalAtt,
      totalCompleted: totalComp,
      avgLeadTime: installDoneWithDates.length > 0 ? (totalLeadTimeDays / installDoneWithDates.length).toFixed(1) : '0',
      visitSuccessRate: totalAtt > 0 ? ((totalComp / totalAtt) * 100).toFixed(1) : '0',
      visitPositiveRate: totalComp > 0 ? ((posCount / totalComp) * 100).toFixed(1) : '0',
      positiveInstallRate: posCount > 0 ? ((instCount / posCount) * 100).toFixed(1) : '0',
      groups: groupsList,
      assignees: assigneesList,
      bookingStatusData: bookingStatusDataArr,
      contactStageData: contactStageDataArr,
      assignedPartData: assignedPartDataArr,
      contactHistoryStats: contactHistoryStatsObj
    };
  }, [merchants, selectedAssignee, selectedGroup, selectedType]);

  return (
    <div className="space-y-6">
      {/* 🟢 대시보드 필터 */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">영업 구분</label>
          <div className="flex bg-gray-50 p-1 rounded-lg border border-gray-100">
            <button 
              onClick={() => setSelectedType('전체')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${selectedType === '전체' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              전체
            </button>
            <button 
              onClick={() => setSelectedType('CONNECT')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${selectedType === 'CONNECT' ? 'bg-[#03C75A] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              커넥트
            </button>
            <button 
              onClick={() => setSelectedType('BOOKING')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${selectedType === 'BOOKING' ? 'bg-[#007AFF] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
              예약
            </button>
          </div>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">시트(그룹) 필터</label>
          <select 
            value={selectedGroup} 
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#03C75A] focus:border-[#03C75A] block p-2"
          >
            <option value="전체">모든 시트(그룹)</option>
            {groups.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="text-xs font-bold text-gray-500 mb-1.5 block">담당자 필터</label>
          <select 
            value={selectedAssignee} 
            onChange={(e) => setSelectedAssignee(e.target.value)}
            className="w-full bg-gray-50 border border-gray-200 text-gray-800 text-sm rounded-lg focus:ring-[#03C75A] focus:border-[#03C75A] block p-2"
          >
            <option value="전체">모든 담당자</option>
            {assignees.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 🟢 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2 shadow-sm">
        <div className="bg-white p-3 rounded-2xl border border-gray-100 flex flex-col justify-center min-h-[90px]">
          <div className="flex items-center gap-1 mb-1">
            <MapPin className="h-3.5 w-3.5 text-gray-400" />
            <h3 className="text-gray-500 text-[10px] font-bold">배정 가맹점</h3>
          </div>
          <p className="text-lg font-black text-gray-900 leading-none">
            {total} <span className="text-xs font-medium text-gray-400">건</span>
          </p>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-gray-100 flex flex-col justify-center min-h-[90px]">
          <div className="flex items-center gap-1 mb-1">
            <CheckCircle className="h-3.5 w-3.5 text-purple-400" />
            <h3 className="text-gray-500 text-[10px] font-bold">방문 시도</h3>
          </div>
          <p className="text-lg font-black text-gray-900 leading-none">
            {totalAttempted} <span className="text-xs font-medium text-gray-400">건</span>
          </p>
          <p className="text-[10px] font-semibold text-purple-600 mt-1">시도율 {total > 0 ? ((totalAttempted / total) * 100).toFixed(0) : 0}%</p>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-gray-100 flex flex-col justify-center min-h-[90px]">
          <div className="flex items-center gap-1 mb-1">
            <Users className="h-3.5 w-3.5 text-blue-400" />
            <h3 className="text-gray-500 text-[10px] font-bold">방문 성공</h3>
          </div>
          <p className="text-lg font-black text-gray-900 leading-none">
            {totalCompleted} <span className="text-xs font-medium text-gray-400">건</span>
          </p>
          <p className="text-[10px] font-semibold text-blue-600 mt-1 whitespace-nowrap">방문 성공률 {visitSuccessRate}%</p>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-gray-100 flex flex-col justify-center min-h-[90px]">
          <div className="flex items-center gap-1 mb-1">
            <CheckCircle className="h-3.5 w-3.5 text-green-400" />
            <h3 className="text-gray-500 text-[10px] font-bold">긍정(상담/즉시)</h3>
          </div>
          <p className="text-lg font-black text-gray-900 leading-none">
            {positiveCount} <span className="text-xs font-medium text-gray-400">건</span>
          </p>
          <p className="text-[10px] font-semibold text-green-600 mt-1 whitespace-nowrap">방문시 긍정율 {visitPositiveRate}%</p>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-gray-100 flex flex-col justify-center min-h-[90px]">
          <div className="flex items-center gap-1 mb-1">
            <Clock className="h-3.5 w-3.5 text-yellow-500" />
            <h3 className="text-gray-500 text-[10px] font-bold">설치 대기</h3>
          </div>
          <p className="text-lg font-black text-gray-900 leading-none">
            {pendingInstallCount} <span className="text-xs font-medium text-gray-400">건</span>
          </p>
        </div>

        <div className="bg-white p-3 rounded-2xl border border-gray-100 flex flex-col justify-center min-h-[90px] relative overflow-hidden bg-gradient-to-br from-white to-[#f0fff4]">
          <div className="absolute -right-2 -bottom-2 opacity-5 pointer-events-none">
            <CheckCircle className="h-12 w-12 text-[#03C75A]" />
          </div>
          <div className="flex items-center gap-1 mb-1 relative z-10">
            <CheckCircle className="h-3.5 w-3.5 text-[#03C75A]" />
            <h3 className="text-gray-500 text-[10px] font-bold">설치 완료</h3>
          </div>
          <p className="text-lg font-black text-[#03C75A] relative z-10 leading-none">
            {installedCount} <span className="text-xs font-medium text-[#03C75A]/70">건</span>
          </p>
          <p className="text-[10px] font-semibold text-[#03C75A] mt-1 relative z-10 flex items-center gap-1 whitespace-nowrap">
            <ArrowUpRight className="w-2.5 h-2.5"/> 긍정 대비 설치율 {positiveInstallRate}%
          </p>
        </div>

        <div className="bg-[#1a1a1a] p-3 rounded-2xl flex flex-col justify-center min-h-[90px]">
          <div className="flex items-center gap-1 mb-1">
            <ArrowUpRight className="h-3.5 w-3.5 text-green-400" />
            <h3 className="text-gray-400 text-[10px] font-bold">평균 리드타임</h3>
          </div>
          <p className="text-lg font-black text-white leading-none">
            {avgLeadTime} <span className="text-xs font-medium text-gray-500">일</span>
          </p>
          <p className="text-[9px] text-gray-500 mt-1">방문→설치완료</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 🟢 차트 1: 방문결과 파이 차트 */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">📊 방문 결과 현황</h3>
          {total === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">데이터가 없습니다.</div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={resultData}
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                    nameKey="name"
                    labelLine={true}
                    label={({ name, value, percent }) => percent > 0.05 ? `${name} ${value}건 (${(percent * 100).toFixed(0)}%)` : ''}
                  >
                    {resultData.map((entry, index) => (
                      <Cell key={`cell-result-${entry.name}`} fill={RESULT_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* 🟢 차트 2: T단말기 설치 여부 (커넥트일 때만 혹은 전체일 때) */}
        {(selectedType === '전체' || selectedType === 'CONNECT') && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-0.5 flex items-center gap-2">💳 T단말기 현황 (커넥트)</h3>
            <p className="text-[11px] text-gray-500 mb-4">방문 시도 완료된 커넥트 가맹점 기준</p>
            {tTerminalData.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">데이터가 없습니다.</div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={tTerminalData}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={60}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      labelLine={true}
                      label={({ name, value, percent }) => percent > 0.05 ? `${name} ${value}건 (${(percent * 100).toFixed(0)}%)` : ''}
                    >
                      {tTerminalData.map((entry, index) => (
                        <Cell key={`cell-tterm-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* 🟢 차트 2-2: 예약 상태 현황 (예약일 때만 혹은 전체일 때) */}
        {(selectedType === '전체' || selectedType === 'BOOKING') && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-0.5 flex items-center gap-2">📅 예약 운영 현황</h3>
            <p className="text-[11px] text-gray-500 mb-4">예약 영업 가맹점의 현재 예약 설정 상태</p>
            {bookingStatusData.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">데이터가 없습니다.</div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={bookingStatusData}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={60}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      labelLine={true}
                      label={({ name, value, percent }) => percent > 0.05 ? `${name} ${value}건 (${(percent * 100).toFixed(0)}%)` : ''}
                    >
                      {bookingStatusData.map((entry, index) => (
                        <Cell key={`cell-booking-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* 🟢 차트 2-3: 예약 컨택 단계 현황 (예약일 때만 혹은 전체일 때) */}
        {(selectedType === '전체' || selectedType === 'BOOKING') && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-0.5 flex items-center gap-2">📞 컨택 단계 현황</h3>
            <p className="text-[11px] text-gray-500 mb-4">예약 영업 가맹점의 진행 단계별 분포</p>
            {contactStageData.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">데이터가 없습니다.</div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={contactStageData} layout="vertical" margin={{ left: 20, right: 30 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#4b5563' }} width={80} />
                    <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="value" name="가맹점 수" fill="#007AFF" radius={[0, 4, 4, 0]} barSize={20} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* 🟢 차트 2-4: 배정 파트 분포 (예약일 때만 혹은 전체일 때) */}
        {(selectedType === '전체' || selectedType === 'BOOKING') && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 mb-0.5 flex items-center gap-2">🏢 배정 파트 분포</h3>
            <p className="text-[11px] text-gray-500 mb-4">예약 영업 가맹점의 파트별 비율</p>
            {assignedPartData.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">데이터가 없습니다.</div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={assignedPartData}
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={60}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, value }) => `${name} (${value})`}
                    >
                      {assignedPartData.map((entry, index) => (
                        <Cell key={`cell-part-${entry.name}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🟢 예약 컨택 성공율 요약 (예약/전체일 때) */}
      {(selectedType === '전체' || selectedType === 'BOOKING') && contactHistoryStats.total > 0 && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">✅ 컨택 회차별 성공 현황</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-gray-500">1차 컨택 성공</span>
                <span className="text-blue-600">{contactHistoryStats.first} / {contactHistoryStats.total} ({((contactHistoryStats.first / contactHistoryStats.total) * 100).toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${(contactHistoryStats.first / contactHistoryStats.total) * 100}%` }}></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-gray-500">2차 컨택 성공</span>
                <span className="text-indigo-600">{contactHistoryStats.second} / {contactHistoryStats.total} ({((contactHistoryStats.second / contactHistoryStats.total) * 100).toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div className="bg-indigo-500 h-full transition-all duration-500" style={{ width: `${(contactHistoryStats.second / contactHistoryStats.total) * 100}%` }}></div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-gray-500">3차 컨택 성공</span>
                <span className="text-purple-600">{contactHistoryStats.third} / {contactHistoryStats.total} ({((contactHistoryStats.third / contactHistoryStats.total) * 100).toFixed(1)}%)</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full transition-all duration-500" style={{ width: `${(contactHistoryStats.third / contactHistoryStats.total) * 100}%` }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 차트 3: 담당자별 처리 현황 스택 바 차트 (전체 보기일 때만) */}
      {selectedAssignee === '전체' && (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">👥 담당자별 상세 실적</h3>
          {assigneeData.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">데이터가 없습니다.</div>
          ) : (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={assigneeData}
                  margin={{ top: 5, right: 0, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#6b7280' }} />
                  <YAxis axisLine={false} tickLine={false} fontSize={12} tick={{ fill: '#6b7280' }} />
                  <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }} />
                  <Bar key="bar-unprocessed" dataKey="미처리" stackId="a" fill={RESULT_COLORS['미처리']} barSize={32} />
                  <Bar key="bar-waiting" dataKey="대기중" stackId="a" fill={RESULT_COLORS['대기중']} />
                  <Bar key="bar-absent" dataKey="대표부재" stackId="a" fill={RESULT_COLORS['대표부재']} />
                  <Bar key="bar-revisit" dataKey="재방문필요" stackId="a" fill={RESULT_COLORS['재방문필요']} />
                  <Bar key="bar-consult" dataKey="상담희망" stackId="a" fill={RESULT_COLORS['상담희망']} />
                  <Bar key="bar-install" dataKey="즉시설치" stackId="a" fill={RESULT_COLORS['즉시설치']} />
                  <Bar key="bar-reject" dataKey="거절" stackId="a" fill={RESULT_COLORS['거절']} />
                  <Bar key="bar-impossible" dataKey="불가" stackId="a" fill={RESULT_COLORS['불가']} />
                  <Bar key="bar-failed" dataKey="방문실패" stackId="a" fill={RESULT_COLORS['방문실패']} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* 🟢 차트 4: 일자별 방문 트렌드 라인 차트 */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
        <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">📈 일자별 방문 추이</h3>
        {dateData.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">데이터가 없습니다.</div>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={dateData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={N_GREEN} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={N_GREEN} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} fontSize={12} tickFormatter={(tick) => tick.substring(5)} tick={{ fill: '#6b7280' }} />
                <YAxis axisLine={false} tickLine={false} fontSize={12} allowDecimals={false} tick={{ fill: '#6b7280' }} />
                <Tooltip cursor={{ stroke: '#e5e7eb', strokeWidth: 2 }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="count" name="방문 수" stroke={N_GREEN} strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" activeDot={{ r: 6, fill: N_GREEN, strokeWidth: 2, stroke: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

    </div>
  );
}
