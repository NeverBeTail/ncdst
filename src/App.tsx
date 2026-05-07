import { useState, useMemo, useEffect } from 'react';
import { Search, MapPin, Phone, Calendar, User, FileText, X, Check, Settings, Download, BarChart2, List, Clock, ChevronDown, ChevronRight, Link as LinkIcon, History } from 'lucide-react';
import { Merchant, VisitResult, InstallStatus, AuditLog, CONTACT_STAGE_OPTIONS } from './types';
import { auth } from './firebase/config';
import { signOut } from 'firebase/auth';
import Admin from './Admin';
import Dashboard from './Dashboard';
import Planner from './Planner';
import { useMerchants, useSettings, useAuditLogs } from './useMerchants';

// 네이버 브랜드 컬러
const N_GREEN = '#03C75A';

export default function App() {
  const { merchants, loading, updateMerchant, addMerchant, addMerchants, deleteMerchant, deleteMerchants } = useMerchants();
  const { assignees, loading: settingsLoading, updateAssignees } = useSettings();
  const { addLog } = useAuditLogs();

  const [activeView, setActiveView] = useState<'list' | 'dashboard' | 'planner'>('list');
  const [groupBy, setGroupBy] = useState<'group' | 'dong'>('group');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [originalMerchant, setOriginalMerchant] = useState<Merchant | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'basic' | 'connect' | 'booking'>('basic');
  const [filterAssignee, setFilterAssignee] = useState<string | '전체'>('전체');
  const [filterGroup, setFilterGroup] = useState<string | '전체'>('전체');
  const [filterResult, setFilterResult] = useState<VisitResult | '전체'>('전체');
  const [filterInstall, setFilterInstall] = useState<InstallStatus | '전체'>('전체');
  const [filterTTerminal, setFilterTTerminal] = useState<string | '전체'>('전체');
  const [filterType, setFilterType] = useState<'전체' | 'CONNECT' | 'BOOKING'>('전체');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [group]: !prev[group]
    }));
  };

  // CSV 다운로드 함수
  const handleDownloadCSV = () => {
    if (merchants.length === 0) {
      alert("다운로드할 데이터가 없습니다.");
      return;
    }
    
    const headers = [
      '영업구분', '시트명', '식당명', '주소', '사업자번호', '연락처', '담당자', '방문일자', '방문결과', '비고', 
      'VAN사(커넥트)', '설치상태(커넥트)', '플레이스ID(예약)', '예약상태(예약)',
      '기준', 'No.', '구분', '카테고리 1', '카테고리 2', '카테고리 3', '배정 파트', '리드 소유자', '컨택 단계', 
      '1차 컨택 일자', '1차 담당자', '2차 컨택 일자', '2차 담당자', '3차 컨택 일자', '3차 담당자'
    ];
    const csvRows = merchants.map(m => [
      m.merchantType === 'BOOKING' ? '예약' : '커넥트',
      `"${(m.groupName || '').replace(/"/g, '""')}"`,
      `"${(m.name || '').replace(/"/g, '""')}"`,
      `"${(m.address || '').replace(/"/g, '""')}"`,
      `"${(m.businessNumber || '').replace(/"/g, '""')}"`,
      `"${(m.contact || '').replace(/"/g, '""')}"`,
      `"${(m.assignee || '').replace(/"/g, '""')}"`,
      `"${(m.visitDate || '').replace(/"/g, '""')}"`,
      `"${(m.visitResult || '').replace(/"/g, '""')}"`,
      `"${(m.notes || '').replace(/"/g, '""')}"`,
      m.merchantType === 'CONNECT' ? `"${(m.vanCompany || '').replace(/"/g, '""')}"` : '',
      m.merchantType === 'CONNECT' ? `"${(m.installStatus || '').replace(/"/g, '""')}"` : '',
      m.merchantType === 'BOOKING' ? `"${(m.placeId || '').replace(/"/g, '""')}"` : '',
      m.merchantType === 'BOOKING' ? `"${(m.bookingStatus || '').replace(/"/g, '""')}"` : '',
      `"${(m.criteria || '').replace(/"/g, '""')}"`,
      `"${(m.no || '').replace(/"/g, '""')}"`,
      `"${(m.classification || '').replace(/"/g, '""')}"`,
      `"${(m.category || '').replace(/"/g, '""')}"`,
      `"${(m.category2 || '').replace(/"/g, '""')}"`,
      `"${(m.category3 || '').replace(/"/g, '""')}"`,
      `"${(m.assignedPart || '').replace(/"/g, '""')}"`,
      `"${(m.leadOwner || '').replace(/"/g, '""')}"`,
      `"${(m.contactStage || '').replace(/"/g, '""')}"`,
      `"${(m.firstContactDate || '').replace(/"/g, '""')}"`,
      `"${(m.firstContactAssignee || '').replace(/"/g, '""')}"`,
      `"${(m.secondContactDate || '').replace(/"/g, '""')}"`,
      `"${(m.secondContactAssignee || '').replace(/"/g, '""')}"`,
      `"${(m.thirdContactDate || '').replace(/"/g, '""')}"`,
      `"${(m.thirdContactAssignee || '').replace(/"/g, '""')}"`,
    ].join(','));
    
    const csvContent = "\uFEFF" + [headers.join(','), ...csvRows].join('\n'); // Add BOM for Excel Korean support
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `NPay_영업관리_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 필터링된 가맹점 목록
  const groups = useMemo(() => Array.from(new Set(merchants.map(m => m.groupName).filter(Boolean))), [merchants]);

  const filteredItems = useMemo(() => {
    return merchants.filter(merchant => {
      const matchesSearch = merchant.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            merchant.address?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (merchant.placeId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (merchant.category || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (merchant.leadOwner || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (merchant.assignedPart || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (merchant.contactStage || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGroup = filterGroup === '전체' || merchant.groupName === filterGroup;
      const matchesAssignee = filterAssignee === '전체' || (merchant.assignee || '미배정') === filterAssignee;
      const matchesResult = filterResult === '전체' || merchant.visitResult === filterResult;
      const matchesInstall = filterInstall === '전체' || merchant.installStatus === filterInstall;
      const matchesTTerminal = filterTTerminal === '전체' || merchant.tTerminalInstalled === filterTTerminal;
      const matchesType = filterType === '전체' || merchant.merchantType === filterType;
      
      // Visit Date Range Filter
      let matchesDate = true;
      if (merchant.visitDate) {
        const vDate = merchant.visitDate.substring(0, 10);
        if (startDate && vDate < startDate) matchesDate = false;
        if (endDate && vDate > endDate) matchesDate = false;
      } else if (startDate || endDate) {
        matchesDate = false;
      }

      return matchesSearch && matchesGroup && matchesAssignee && matchesResult && matchesInstall && matchesTTerminal && matchesDate && matchesType;
    });
  }, [merchants, searchQuery, filterGroup, filterAssignee, filterResult, filterInstall, filterTTerminal, filterType, startDate, endDate]);

  const extractDong = (address: string) => {
    if (!address) return '기타';

    const parts = address.split(' ');
    // Find district (ends in '구' or '군')
    const district = parts.find(p => /^[가-힣]+[구군]$/.test(p));
    
    let dongCandidate = '';

    // 1. Check for administrative dong in parentheses
    const parenMatch = address.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const insideParen = parenMatch[1];
      const pParts = insideParen.split(',').map(p => p.trim());
      dongCandidate = pParts.find(p => /^[가-힣0-9]+[동읍면가]$/.test(p)) || '';
    }

    // 2. Fallback to space-split parts
    if (!dongCandidate) {
      dongCandidate = parts.find(p => /^[가-힣][가-힣0-9]*[동읍면가]$/.test(p)) || '';
    }

    if (district && dongCandidate) {
      return `${district} ${dongCandidate}`;
    }
    
    return dongCandidate || district || '기타';
  };

  const groupedMerchants = useMemo(() => {
    return filteredItems.reduce((acc, current) => {
      const group = groupBy === 'group' 
          ? (current.groupName || '미분류') 
          : extractDong(current.address);
      if (!acc[group]) acc[group] = [];
      acc[group].push(current);
      return acc;
    }, {} as Record<string, Merchant[]>);
  }, [filteredItems, groupBy]);
  
  const sortedGroupKeys = useMemo(() => Object.keys(groupedMerchants).sort(), [groupedMerchants]);

  const getPlannedStatus = (merchant: Merchant) => {
    if (merchant.visitDate) return null;
    if (!merchant.plannedDate) return null;
    
    const today = new Date().toISOString().split('T')[0];
    if (merchant.plannedDate < today) return { label: `지연: ${merchant.plannedDate}`, color: 'bg-red-50 text-red-600' };
    if (merchant.plannedDate === today) return { label: '오늘 방문 예정', color: 'bg-amber-50 text-amber-700 font-bold' };
    return { label: `예정: ${merchant.plannedDate}`, color: 'bg-blue-50 text-blue-600' };
  };

  const handleEditClick = (merchant: Merchant) => {
    setSelectedMerchant({ ...merchant }); // Clone for editing
    setOriginalMerchant({ ...merchant }); // Clone original for comparison
    setModalTab('basic');
    setIsEditModalOpen(true);
  };

  const handleSaveMerchant = async () => {
    if (selectedMerchant && originalMerchant) {
      // Check for changes to log
      const fieldsToLog: (keyof Merchant)[] = [
        'assignedPart', 'leadOwner', 'contactStage', 'bookingStatus', 'contactStatusNotes',
        'firstContactDate', 'firstContactAssignee',
        'secondContactDate', 'secondContactAssignee',
        'thirdContactDate', 'thirdContactAssignee'
      ];

      const email = auth.currentUser?.email || 'unknown';

      for (const field of fieldsToLog) {
        const oldValue = String(originalMerchant[field] || '');
        const newValue = String(selectedMerchant[field] || '');
        
        if (oldValue !== newValue) {
          await addLog({
            merchantId: selectedMerchant.id,
            merchantName: selectedMerchant.name,
            userEmail: email,
            fieldName: field === 'assignedPart' ? '배정 파트' :
                       field === 'leadOwner' ? '리드 소유자' :
                       field === 'contactStage' ? '컨택 단계' :
                       field === 'bookingStatus' ? '운영 상태' :
                       field === 'contactStatusNotes' ? '비고(컨택 현황)' : 
                       field === 'firstContactDate' ? '1차 컨택 일자' :
                       field === 'firstContactAssignee' ? '1차 담당자' :
                       field === 'secondContactDate' ? '2차 컨택 일자' :
                       field === 'secondContactAssignee' ? '2차 담당자' :
                       field === 'thirdContactDate' ? '3차 컨택 일자' :
                       field === 'thirdContactAssignee' ? '3차 담당자' : field,
            oldValue,
            newValue
          });
        }
      }

      await updateMerchant(selectedMerchant.id, {
        merchantType: selectedMerchant.merchantType || 'CONNECT',
        groupName: selectedMerchant.groupName || '',
        vanCompany: selectedMerchant.vanCompany || '',
        vanAgencyName: selectedMerchant.vanAgencyName || '',
        agencyContact: selectedMerchant.agencyContact || '',
        name: selectedMerchant.name || '',
        businessNumber: selectedMerchant.businessNumber || '',
        address: selectedMerchant.address || '',
        assignee: selectedMerchant.assignee || '',
        visitDate: selectedMerchant.visitDate || '',
        visitResult: selectedMerchant.visitResult !== undefined ? selectedMerchant.visitResult : '대기중',
        installStatus: selectedMerchant.installStatus || '미설치',
        installDate: selectedMerchant.installDate || '',
        tTerminalInstalled: selectedMerchant.tTerminalInstalled || '',
        notes: selectedMerchant.notes || '',
        contact: selectedMerchant.contact || '',
        plannedDate: selectedMerchant.plannedDate || '',
        placeId: selectedMerchant.placeId || '',
        bookingStatus: selectedMerchant.bookingStatus || '',
        category: selectedMerchant.category || '',
        criteria: selectedMerchant.criteria || '',
        no: selectedMerchant.no || '',
        classification: selectedMerchant.classification || '',
        category2: selectedMerchant.category2 || '',
        category3: selectedMerchant.category3 || '',
        assignedPart: selectedMerchant.assignedPart || '',
        leadOwner: selectedMerchant.leadOwner || '',
        contactStage: selectedMerchant.contactStage || '',
        contactStatusNotes: selectedMerchant.contactStatusNotes || '',
        firstContactDate: selectedMerchant.firstContactDate || '',
        firstContactAssignee: selectedMerchant.firstContactAssignee || '',
        secondContactDate: selectedMerchant.secondContactDate || '',
        secondContactAssignee: selectedMerchant.secondContactAssignee || '',
        thirdContactDate: selectedMerchant.thirdContactDate || '',
        thirdContactAssignee: selectedMerchant.thirdContactAssignee || ''
      });
      setIsEditModalOpen(false);
      setSelectedMerchant(null);
    }
  };

  const getResultColor = (result: VisitResult) => {
    switch (result) {
      case '대기중': return 'bg-gray-100 text-gray-600';
      case '상담희망': return 'bg-[#e5f9ed] text-[#03C75A] font-medium';
      case '즉시설치': return 'bg-[#e5f9ed] text-[#03C75A] font-medium';
      case '대표부재': return 'bg-orange-100 text-orange-700';
      case '재방문필요': return 'bg-blue-100 text-blue-700';
      case '거절': return 'bg-red-100 text-red-700';
      case '불가': return 'bg-gray-200 text-gray-800';
      case '방문실패': return 'bg-purple-100 text-purple-700';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getInstallColor = (status: InstallStatus) => {
    switch (status) {
      case '미설치': return 'bg-gray-100 text-gray-500';
      case '설치예정': return 'bg-yellow-100 text-yellow-700';
      case '설치완료': return 'bg-green-100 text-green-700 font-medium';
      default: return 'bg-gray-100 text-gray-500';
    }
  };

  const handleLogout = async () => {
    setConfirmDialog({
      message: '로그아웃 하시겠습니까? (스프레드시트 동기화 권한 갱신이 필요할 때 재로그인하면 됩니다)',
      onConfirm: async () => {
        await signOut(auth);
        localStorage.removeItem('gToken');
      }
    });
  };

  if (loading) {
     return <div className="min-h-screen flex items-center justify-center bg-[#f5f6f8]">로딩중...</div>;
  }

  return (
    <div className="min-h-screen bg-[#f5f6f8] pb-24 font-sans text-gray-900 overflow-x-hidden">
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{confirmDialog.message}</h3>
            <div className="flex gap-2">
              <button 
                onClick={() => {
                  confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="flex-1 py-3 text-white font-medium rounded-xl flex items-center justify-center gap-1 bg-red-500 hover:bg-red-600"
              >
                확인
              </button>
              <button 
                onClick={() => setConfirmDialog(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-600 font-medium rounded-xl flex items-center justify-center gap-1 hover:bg-gray-200"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      <header className="sticky top-0 z-40 bg-white shadow-sm border-b border-gray-100 px-safe">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <h1 className="text-lg font-black tracking-tight" style={{ color: N_GREEN }}>
            NPay
            <span className="ml-1 text-gray-900">영업관리</span>
          </h1>

          <div className="flex items-center gap-1">
            <button 
              onClick={handleDownloadCSV}
              className="p-2 text-gray-500 hover:text-gray-900 transition-colors flex items-center justify-center relative group"
            >
              <Download className="h-5 w-5" />
            </button>
            <button 
              onClick={() => setIsAdminOpen(true)}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings className="h-5 w-5" />
            </button>
            <button 
              onClick={handleLogout}
              className="ml-1 p-2 text-gray-400 hover:text-gray-900"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-4 pb-24">
        {activeView === 'list' && (
          <>
            {/* Search & Filter */}
            <div className="bg-white p-4 rounded-2xl shadow-sm space-y-4 border border-gray-100">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                      <Search className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      className="block w-full pl-10 pr-3 py-3 bg-gray-50 border-none rounded-xl text-base focus:ring-2 focus:ring-[#03C75A] focus:bg-white transition-colors outline-none"
                      placeholder="가맹점명 또는 주소 검색"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto scrollbar-hide">
                    <button 
                      onClick={() => setFilterType('전체')}
                      className={`flex-1 min-w-[70px] py-2 text-[11px] font-bold rounded-lg transition-all ${filterType === '전체' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      전체
                    </button>
                    <button 
                      onClick={() => setFilterType('CONNECT')}
                      className={`flex-1 min-w-[70px] py-2 text-[11px] font-bold rounded-lg transition-all ${filterType === 'CONNECT' ? 'bg-[#03C75A] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      커넥트
                    </button>
                    <button 
                      onClick={() => setFilterType('BOOKING')}
                      className={`flex-1 min-w-[70px] py-2 text-[11px] font-bold rounded-lg transition-all ${filterType === 'BOOKING' ? 'bg-[#007AFF] text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      예약
                    </button>
                  </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-gray-400 w-12 shrink-0 uppercase tracking-tighter">그룹</span>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1 py-1">
                    {['전체', ...groups].map((filter) => (
                      <button
                        key={filter}
                        className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                          filterGroup === filter
                            ? 'border-[#03C75A] bg-[#e5f9ed] text-[#03C75A] shadow-sm'
                            : 'bg-white border-gray-100 text-gray-500'
                        }`}
                        onClick={() => setFilterGroup(filter)}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-gray-400 w-12 shrink-0 uppercase tracking-tighter">담당</span>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1 py-1">
                    {['전체', '미배정', ...assignees].map((filter) => (
                      <button
                        key={filter}
                        className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                          filterAssignee === filter
                            ? 'border-[#03C75A] bg-[#e5f9ed] text-[#03C75A] shadow-sm'
                            : 'bg-white border-gray-100 text-gray-500'
                        }`}
                        onClick={() => setFilterAssignee(filter)}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-gray-400 w-12 shrink-0 uppercase tracking-tighter">결과</span>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1 py-1">
                    {['전체', '대기중', '대표부재', '재방문필요', '상담희망', '즉시설치', '기사용', '거절', '불가', '방문실패'].map((filter) => (
                      <button
                        key={filter}
                        className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                          filterResult === filter
                            ? 'text-white border-transparent shadow-sm'
                            : 'bg-white border-gray-100 text-gray-500'
                        }`}
                        style={{ backgroundColor: filterResult === filter ? N_GREEN : undefined }}
                        onClick={() => setFilterResult(filter as any)}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-gray-400 w-12 shrink-0 uppercase tracking-tighter">설치</span>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1 py-1">
                    {['전체', '미설치', '설치예정', '설치완료'].map((filter) => (
                      <button
                        key={filter}
                        className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                          filterInstall === filter
                            ? 'bg-gray-800 text-white border-transparent shadow-sm'
                            : 'bg-white border-gray-100 text-gray-500'
                        }`}
                        onClick={() => setFilterInstall(filter as any)}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-gray-400 w-12 shrink-0 uppercase tracking-tighter">방문일</span>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input 
                      type="date" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1 rounded-lg text-xs font-bold border border-gray-100 bg-white text-gray-700"
                    />
                    <span className="text-gray-300 text-xs">~</span>
                    <input 
                      type="date" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="flex-1 min-w-0 px-2 py-1 rounded-lg text-xs font-bold border border-gray-100 bg-white text-gray-700"
                    />
                    {(startDate || endDate) && (
                      <button 
                        onClick={() => { setStartDate(''); setEndDate(''); }}
                        className="p-1 px-2 text-[10px] font-black text-red-400 hover:text-red-600 uppercase"
                      >
                        CLEAR
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-gray-400 w-12 shrink-0 uppercase tracking-tighter"> T단말</span>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide flex-1 py-1">
                    {['전체', '설치', '미설치', '모름'].map((filter) => (
                      <button
                        key={filter}
                        className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold transition-all border ${
                          filterTTerminal === filter
                            ? 'border-[#03C75A] bg-[#e5f9ed] text-[#03C75A] shadow-sm'
                            : 'bg-white border-gray-100 text-gray-500'
                        }`}
                        onClick={() => setFilterTTerminal(filter)}
                      >
                        {filter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Merchant List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1 text-sm text-gray-500">
                <span>총 <strong className="text-gray-900">{filteredItems.length}</strong>곳의 타겟 가맹점</span>
                <div className="flex gap-1.5 bg-gray-100 p-1 rounded-xl">
                  <button 
                    onClick={() => setGroupBy('group')}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${groupBy === 'group' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    시트별
                  </button>
                  <button 
                    onClick={() => setGroupBy('dong')}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${groupBy === 'dong' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    동별
                  </button>
                </div>
              </div>

              {filteredItems.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>검색 결과가 없습니다.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedGroupKeys.map(group => {
                    const isExpanded = expandedGroups[group] || false;
                    const count = groupedMerchants[group].length;

                    return (
                      <div key={group} className="space-y-2">
                        <button 
                          onClick={() => toggleGroup(group)}
                          className="w-full h-11 px-4 flex items-center gap-3 bg-white hover:bg-gray-50 border border-gray-100 rounded-2xl shadow-[0_2px_10px_-4px_rgba(0,0,0,0.05)] transition-all active:scale-[0.99] group/header"
                        >
                          <div className={`p-1 rounded-lg transition-colors ${isExpanded ? 'bg-[#e5f9ed] text-[#03C75A]' : 'bg-gray-50 text-gray-400 group-hover/header:bg-gray-100'}`}>
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </div>
                          <span className="text-[14px] font-bold text-gray-800 flex-1 text-left flex items-center gap-2">
                            {groupBy === 'group' ? <FileText className="h-3.5 w-3.5 opacity-40" /> : <MapPin className="h-3.5 w-3.5 opacity-40" />}
                            {group}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-colors ${isExpanded ? 'bg-[#03C75A] text-white' : 'bg-gray-100 text-gray-500'}`}>
                            {count}
                          </span>
                        </button>
                        
                        {isExpanded && (
                          <div className="space-y-3 pl-1 animate-in slide-in-from-top-2 duration-200">
                            {groupedMerchants[group].map((merchant) => (
                              <div 
                                key={merchant.id}
                                onClick={() => handleEditClick(merchant)}
                                className="bg-white rounded-2xl p-5 shadow-sm active:scale-[0.98] transition-transform cursor-pointer border border-transparent hover:border-gray-200"
                              >
                                  <div className="flex justify-between items-start mb-3">
                                    <div>
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${merchant.merchantType === 'BOOKING' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#03C75A]/10 text-[#03C75A]'}`}>
                                          {merchant.merchantType === 'BOOKING' ? '예약' : '커넥트'}
                                        </span>
                                        <h3 className="text-lg font-bold text-gray-900 leading-tight">{merchant.name}</h3>
                                      </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1.5">
                                      <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-tight ${getResultColor(merchant.visitResult)}`}>
                                         {merchant.visitResult}
                                      </span>
                                      {merchant.merchantType === 'CONNECT' && ['상담희망', '즉시설치'].includes(merchant.visitResult) && (
                                         <span className={`px-2 py-0.5 rounded text-[10px] ${getInstallColor(merchant.installStatus)}`}>
                                           설치: {merchant.installStatus}
                                         </span>
                                      )}
                                      {getPlannedStatus(merchant) && (
                                         <span className={`px-2 py-0.5 rounded text-[10px] border ${getPlannedStatus(merchant)?.color} border-current opacity-80 uppercase tracking-tighter`}>
                                           {getPlannedStatus(merchant)?.label}
                                         </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="space-y-1.5 text-sm text-gray-600">
                                    <div className="flex items-start gap-2">
                                      <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                                      <span 
                                        className="break-keep hover:text-blue-600 hover:underline cursor-pointer"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(`https://map.naver.com/v5/search/${encodeURIComponent(merchant.address)}`, '_blank');
                                        }}
                                      >
                                        {merchant.address}
                                      </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-gray-50">
                                       {merchant.merchantType === 'CONNECT' && merchant.vanCompany && (
                                         <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                           VAN: {merchant.vanCompany} {merchant.vanAgencyName && `(${merchant.vanAgencyName})`}
                                         </span>
                                       )}
                                       {merchant.merchantType === 'BOOKING' && merchant.placeId && (
                                         <span className="text-[10px] font-medium bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                           플레이스: {merchant.placeId}
                                         </span>
                                       )}
                                       {merchant.merchantType === 'BOOKING' && merchant.category && (
                                         <span className="text-[10px] font-medium bg-[#007AFF]/5 text-[#007AFF] px-1.5 py-0.5 rounded">
                                           {merchant.category}
                                         </span>
                                       )}
                                       {merchant.merchantType === 'BOOKING' && merchant.contactStage && (
                                         <span className="text-[10px] font-bold bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded border border-orange-100">
                                           {merchant.contactStage}
                                         </span>
                                       )}
                                       {merchant.merchantType === 'BOOKING' && merchant.bookingStatus && (
                                         <span className="text-[10px] font-medium bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                                           상태: {merchant.bookingStatus}
                                         </span>
                                       )}
                                       {merchant.merchantType === 'CONNECT' && merchant.tTerminalInstalled && merchant.tTerminalInstalled !== '모름' && merchant.tTerminalInstalled !== '' && (
                                         <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${merchant.tTerminalInstalled === '설치' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                                           T단말기: {merchant.tTerminalInstalled}
                                         </span>
                                       )}
                                    </div>
                                    {(merchant.assignee || merchant.visitDate) && (
                                       <div className="flex flex-wrap items-center gap-4 text-xs mt-1">
                                          {merchant.assignee && (
                                            <div className="flex items-center gap-1.5">
                                              <User className="h-3.5 w-3.5 text-gray-400" />
                                              <span>담당: {merchant.assignee}</span>
                                            </div>
                                          )}
                                          {merchant.visitDate && (
                                            <div className="flex items-center gap-1.5">
                                              <Calendar className="h-3.5 w-3.5 text-gray-400" />
                                              <span>방문: {merchant.visitDate}</span>
                                            </div>
                                          )}
                                       </div>
                                    )}
                                  </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {activeView === 'dashboard' && <Dashboard merchants={merchants} />}
        {activeView === 'planner' && <Planner merchants={merchants} assignees={assignees} currentUserEmail={auth.currentUser?.email || null} onRefresh={() => {}} />}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-lg border-t border-gray-100 px-safe shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.05)] pb-safe">
        <div className="max-w-3xl mx-auto flex h-20">
          <button
            onClick={() => setActiveView('list')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
              activeView === 'list' ? 'text-[#03C75A]' : 'text-gray-400'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${activeView === 'list' ? 'bg-[#e5f9ed]' : 'bg-transparent'}`}>
              <List className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">가맹점</span>
          </button>

          <button
            onClick={() => setActiveView('planner')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
              activeView === 'planner' ? 'text-[#03C75A]' : 'text-gray-400'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${activeView === 'planner' ? 'bg-[#e5f9ed]' : 'bg-transparent'}`}>
              <Calendar className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">방문계획</span>
          </button>

          <button
            onClick={() => setActiveView('dashboard')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-all ${
              activeView === 'dashboard' ? 'text-[#03C75A]' : 'text-gray-400'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-colors ${activeView === 'dashboard' ? 'bg-[#e5f9ed]' : 'bg-transparent'}`}>
              <BarChart2 className="h-6 w-6" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">통계</span>
          </button>
        </div>
      </nav>

      {/* Edit Modal / Bottom Sheet */}
      {isEditModalOpen && selectedMerchant && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200">
          <div 
            className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom sm:slide-in-from-bottom-0 sm:zoom-in-95 duration-200"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded text-white ${selectedMerchant.merchantType === 'BOOKING' ? 'bg-[#007AFF]' : 'bg-[#03C75A]'}`}>
                    {selectedMerchant.merchantType === 'BOOKING' ? '예약' : '커넥트'}
                  </span>
                  <h2 className="text-xl font-bold">{selectedMerchant.name}</h2>
                </div>
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                   <Phone className="h-3 w-3" /> {selectedMerchant.contact}
                </p>
              </div>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 -mr-2 bg-gray-50 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="flex bg-gray-50 p-1 mx-6 mt-4 rounded-xl border border-gray-200">
              <button 
                onClick={() => setModalTab('basic')}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${modalTab === 'basic' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
              >
                기본정보
              </button>
              <button 
                onClick={() => setModalTab('connect')}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${modalTab === 'connect' ? 'bg-[#03C75A] text-white shadow-sm' : 'text-gray-400'}`}
              >
                커넥트(VAN)
              </button>
              <button 
                onClick={() => setModalTab('booking')}
                className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${modalTab === 'booking' ? 'bg-[#007AFF] text-white shadow-sm' : 'text-gray-400'}`}
              >
                예약(Booking)
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 min-h-[400px]">
              
              {modalTab === 'basic' && (
                <div className="space-y-5 animate-in fade-in slide-in-from-left-2 duration-200">
                  {/* 식당명 & 사업자번호 */}
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">식당명</label>
                      <input
                        type="text"
                        value={selectedMerchant.name || ''}
                        onChange={(e) => setSelectedMerchant({...selectedMerchant, name: e.target.value})}
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-base font-bold focus:bg-white transition-colors"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">사업자번호</label>
                        <input
                          type="text"
                          value={selectedMerchant.businessNumber || ''}
                          onChange={(e) => setSelectedMerchant({...selectedMerchant, businessNumber: e.target.value})}
                          placeholder="000-00-00000"
                          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">연락처</label>
                        <input
                          type="text"
                          value={selectedMerchant.contact || ''}
                          onChange={(e) => setSelectedMerchant({...selectedMerchant, contact: e.target.value})}
                          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 주소 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">주소</label>
                    <textarea
                      value={selectedMerchant.address || ''}
                      onChange={(e) => setSelectedMerchant({...selectedMerchant, address: e.target.value})}
                      rows={2}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors resize-none"
                    />
                  </div>

                  {/* 시트명 */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">시트명(그룹)</label>
                    <input
                      type="text"
                      value={selectedMerchant.groupName || ''}
                      onChange={(e) => setSelectedMerchant({...selectedMerchant, groupName: e.target.value})}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors"
                    />
                  </div>
                </div>
              )}

              {modalTab === 'connect' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200">
                  {/* 영업 담당 및 방문 정보 */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">영업 담당자</label>
                      <select
                        value={selectedMerchant.assignee || ''}
                        onChange={(e) => setSelectedMerchant({...selectedMerchant, assignee: e.target.value})}
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors"
                      >
                        <option value="">담당자 선택</option>
                        {assignees.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-gray-400 uppercase tracking-wider flex justify-between items-center">
                        <span>방문 실시일</span>
                        <button 
                          onClick={() => {
                            const offset = new Date().getTimezoneOffset() * 60000;
                            const localISOTime = (new Date(Date.now() - offset)).toISOString().slice(0, 10);
                            setSelectedMerchant({...selectedMerchant, visitDate: localISOTime});
                          }}
                          className="text-[10px] text-[#03C75A] lowercase"
                        >
                          오늘
                        </button>
                      </label>
                      <input 
                        type="date" 
                        value={selectedMerchant.visitDate?.substring(0,10) || ''}
                        onChange={(e) => setSelectedMerchant({...selectedMerchant, visitDate: e.target.value})}
                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                      />
                    </div>
                  </div>

                  <div className="bg-[#e5f9ed] p-4 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-[#03C75A] rounded-full"></div>
                      <h3 className="font-bold text-[#03C75A]">커넥트(VAN) 상세 정보</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[#03C75A]/60 uppercase">VAN사</label>
                          <input type="text" value={selectedMerchant.vanCompany || ''} onChange={e => setSelectedMerchant({...selectedMerchant, vanCompany: e.target.value})} className="w-full p-2.5 bg-white border border-[#03C75A]/20 rounded-xl text-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[#03C75A]/60 uppercase">대리점명</label>
                          <input type="text" value={selectedMerchant.vanAgencyName || ''} onChange={e => setSelectedMerchant({...selectedMerchant, vanAgencyName: e.target.value})} className="w-full p-2.5 bg-white border border-[#03C75A]/20 rounded-xl text-sm" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[#03C75A]/60 uppercase">대리점 연락처</label>
                        <input type="text" value={selectedMerchant.agencyContact || ''} onChange={e => setSelectedMerchant({...selectedMerchant, agencyContact: e.target.value})} className="w-full p-2.5 bg-white border border-[#03C75A]/20 rounded-xl text-sm" />
                      </div>
                    </div>
                  </div>

                  {/* 방문결과 (커넥트 상세 아래 이동) */}
                  <div className="space-y-3 bg-gray-50/50 p-5 rounded-2xl border border-gray-100">
                    <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1">방문 결과 (영업 상태)</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        '대기중', '대표부재', '방문실패',
                        '재방문필요', '상담희망', '즉시설치',
                        '거절', '불가', '기사용'
                      ] as VisitResult[]).map((result) => (
                        <button
                          key={result}
                          onClick={() => {
                            const updates: any = { visitResult: result };
                            if (!['상담희망', '즉시설치'].includes(result)) {
                              updates.installStatus = '미설치';
                              updates.installDate = '';
                            }
                            setSelectedMerchant({...selectedMerchant, ...updates});
                          }}
                          className={`py-2.5 rounded-xl text-[11px] font-bold border transition-all ${
                            selectedMerchant.visitResult === result 
                              ? 'border-[#03C75A] bg-[#e5f9ed] text-[#03C75A]' 
                              : 'border-gray-200 bg-white text-gray-400'
                          }`}
                        >
                          {result}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 단말기 설치 상태 관리 - '상담희망' 또는 '즉시설치' 일 때만 노출 */}
                  {(selectedMerchant.visitResult === '상담희망' || selectedMerchant.visitResult === '즉시설치') && (
                    <div className="space-y-3 p-5 bg-[#03C75A]/5 rounded-2xl border border-[#03C75A]/10 animate-in zoom-in-95 duration-200">
                      <label className="text-xs font-bold text-[#03C75A] uppercase flex items-center gap-1.5">
                        <Check className="h-3 w-3" /> 단말기 설치 상태 관리
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {(['미설치', '설치예정', '설치완료'] as InstallStatus[]).map((status) => (
                          <button
                            key={status}
                            onClick={() => {
                              const updates: any = { installStatus: status };
                              if (status === '설치완료' && !selectedMerchant.installDate) {
                                const offset = new Date().getTimezoneOffset() * 60000;
                                updates.installDate = (new Date(Date.now() - offset)).toISOString().slice(0, 10);
                              }
                              setSelectedMerchant({...selectedMerchant, ...updates});
                            }}
                            className={`py-3 rounded-xl text-sm font-bold transition-all ${
                              selectedMerchant.installStatus === status 
                                ? 'bg-[#03C75A] text-white shadow-sm' 
                                : 'bg-white border border-gray-200 text-gray-400 hover:border-[#03C75A]/30'
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>

                      {selectedMerchant.installStatus === '설치완료' && (
                        <div className="pt-3 border-t border-[#03C75A]/10">
                          <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">설치 완료일자</label>
                          <input 
                            type="date" 
                            value={selectedMerchant.installDate || ''}
                            onChange={(e) => setSelectedMerchant({...selectedMerchant, installDate: e.target.value})}
                            className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-[#03C75A]"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* 3. T단말기 사용 여부 (제일 하단으로 이동) */}
                  <div className="space-y-2 pt-4 border-t border-gray-100">
                    <label className="text-xs font-bold text-gray-400 uppercase">T단말기 설치여부</label>
                    <div className="flex gap-2">
                      {['설치', '미설치', '모름'].map((status) => (
                        <button
                          key={status}
                          onClick={() => setSelectedMerchant({...selectedMerchant, tTerminalInstalled: status as any})}
                          className={`flex-1 py-3 rounded-xl text-sm font-bold border transition-all ${
                            selectedMerchant.tTerminalInstalled === status 
                              ? 'border-[#03C75A] bg-[#e5f9ed] text-[#03C75A]' 
                              : 'border-gray-200 bg-white text-gray-400'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
               {modalTab === 'booking' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-2 duration-200 pb-4">
                   <div className="bg-[#e5f1ff] p-5 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-[#007AFF] rounded-full"></div>
                      <h3 className="font-bold text-[#007AFF]">예약 기본 정보 (수정불가)</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4 opacity-80">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#007AFF]/60 uppercase">기준</label>
                          <input type="text" value={selectedMerchant.criteria || ''} readOnly className="w-full p-2 bg-gray-50 border border-[#007AFF]/20 rounded-xl text-xs text-gray-500 cursor-not-allowed" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#007AFF]/60 uppercase">No.</label>
                          <input type="text" value={selectedMerchant.no || ''} readOnly className="w-full p-2 bg-gray-50 border border-[#007AFF]/20 rounded-xl text-xs text-gray-500 cursor-not-allowed" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-[#007AFF]/60 uppercase">구분</label>
                          <input type="text" value={selectedMerchant.classification || ''} readOnly className="w-full p-2 bg-gray-50 border border-[#007AFF]/20 rounded-xl text-xs text-gray-500 cursor-not-allowed" />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-[#007AFF]/60 uppercase">플레이스 ID</label>
                        <div className="flex gap-2">
                          <input type="text" value={selectedMerchant.placeId || ''} readOnly className="flex-1 p-2.5 bg-gray-50 border border-[#007AFF]/20 rounded-xl text-sm font-mono text-gray-500" />
                          {selectedMerchant.placeId && (
                            <button 
                              onClick={() => window.open(`https://map.naver.com/v5/entry/place/${selectedMerchant.placeId}`, '_blank')}
                              className="px-3 bg-white border border-[#007AFF]/20 rounded-xl text-[#007AFF] hover:bg-[#007AFF]/5 transition-colors"
                            >
                              <LinkIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#007AFF]/60 uppercase">카테고리 1</label>
                          <input type="text" value={selectedMerchant.category || ''} readOnly className="w-full p-2.5 bg-gray-50 border border-[#007AFF]/20 rounded-xl text-sm text-gray-500 cursor-not-allowed" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#007AFF]/60 uppercase">카테고리 2</label>
                          <input type="text" value={selectedMerchant.category2 || ''} readOnly className="w-full p-2.5 bg-gray-50 border border-[#007AFF]/20 rounded-xl text-sm text-gray-500 cursor-not-allowed" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-[#007AFF]/60 uppercase">카테고리 3</label>
                          <input type="text" value={selectedMerchant.category3 || ''} readOnly className="w-full p-2.5 bg-gray-50 border border-[#007AFF]/20 rounded-xl text-sm text-gray-500 cursor-not-allowed" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl space-y-4 border border-gray-200">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-6 bg-orange-400 rounded-full"></div>
                      <h3 className="font-bold text-gray-900">영업 및 컨택 상세 (기록됨)</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-400 uppercase">배정 파트</label>
                          <input type="text" value={selectedMerchant.assignedPart || ''} onChange={e => setSelectedMerchant({...selectedMerchant, assignedPart: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors" />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-400 uppercase">리드 소유자</label>
                          <input type="text" value={selectedMerchant.leadOwner || ''} onChange={e => setSelectedMerchant({...selectedMerchant, leadOwner: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-400 uppercase">컨택 단계</label>
                          <select 
                            value={selectedMerchant.contactStage || ''} 
                            onChange={e => setSelectedMerchant({...selectedMerchant, contactStage: e.target.value})} 
                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors"
                          >
                            <option value="">컨택 단계 선택</option>
                            {Object.entries(CONTACT_STAGE_OPTIONS).map(([category, options]) => (
                              <optgroup key={category} label={category}>
                                {options.map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-gray-400 uppercase">운영 상태</label>
                          <input type="text" value={selectedMerchant.bookingStatus || ''} onChange={e => setSelectedMerchant({...selectedMerchant, bookingStatus: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors" placeholder="예: 미운영/운영중" />
                        </div>
                      </div>

                      <div className="bg-gray-50 p-4 rounded-xl space-y-3 border border-gray-100">
                        <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                          <History className="h-3 w-3" /> 성공 컨택 이력
                        </h4>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="date" value={selectedMerchant.firstContactDate || ''} onChange={e => setSelectedMerchant({...selectedMerchant, firstContactDate: e.target.value})} className="p-2.5 bg-white border border-gray-200 rounded-lg text-xs" />
                          <input type="text" value={selectedMerchant.firstContactAssignee || ''} onChange={e => setSelectedMerchant({...selectedMerchant, firstContactAssignee: e.target.value})} placeholder="1차 담당자" className="p-2.5 bg-white border border-gray-200 rounded-lg text-xs" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="date" value={selectedMerchant.secondContactDate || ''} onChange={e => setSelectedMerchant({...selectedMerchant, secondContactDate: e.target.value})} className="p-2.5 bg-white border border-gray-200 rounded-lg text-xs" />
                          <input type="text" value={selectedMerchant.secondContactAssignee || ''} onChange={e => setSelectedMerchant({...selectedMerchant, secondContactAssignee: e.target.value})} placeholder="2차 담당자" className="p-2.5 bg-white border border-gray-200 rounded-lg text-xs" />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input type="date" value={selectedMerchant.thirdContactDate || ''} onChange={e => setSelectedMerchant({...selectedMerchant, thirdContactDate: e.target.value})} className="p-2.5 bg-white border border-gray-200 rounded-lg text-xs" />
                          <input type="text" value={selectedMerchant.thirdContactAssignee || ''} onChange={e => setSelectedMerchant({...selectedMerchant, thirdContactAssignee: e.target.value})} placeholder="3차 담당자" className="p-2.5 bg-white border border-gray-200 rounded-lg text-xs" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Global Notes (Visibile in Connect/Basic tabs) */}
              {modalTab !== 'booking' && (
                <div className="pt-2">
                  <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-100/50 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600">
                        <FileText className="h-4 w-4" />
                      </div>
                      <label className="text-[13px] font-bold text-gray-700">비고 / 통합 영업 메모 (전체 공유)</label>
                    </div>
                    <textarea 
                      value={selectedMerchant.notes || ''}
                      onChange={(e) => setSelectedMerchant({...selectedMerchant, notes: e.target.value})}
                      className="w-full p-4 bg-white border border-amber-200/50 rounded-xl text-sm min-h-[100px] resize-none focus:ring-2 focus:ring-amber-200 outline-none transition-shadow"
                      placeholder="영업 특이사항이나 다음 방문시 필요한 내용을 기록하세요. (모든 탭에서 보입니다)"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 bg-white sm:rounded-b-2xl pb-safe">
              <button
                onClick={handleSaveMerchant}
                className="w-full py-4 rounded-xl text-white font-bold text-lg flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
                style={{ backgroundColor: N_GREEN }}
              >
                <Check className="h-5 w-5" />
                저장하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Mode */}
      {isAdminOpen && (
        <Admin 
          merchants={merchants}
          assignees={assignees}
          addMerchant={addMerchant}
          addMerchants={addMerchants}
          updateMerchant={updateMerchant}
          deleteMerchant={deleteMerchant}
          deleteMerchants={deleteMerchants}
          updateAssignees={updateAssignees}
          onClose={() => setIsAdminOpen(false)}
        />
      )}
    </div>
  );
}