import { useState, useMemo } from 'react';
import { Search, MapPin, Phone, Calendar, User, FileText, X, Check, Settings, Download, BarChart2, List } from 'lucide-react';
import { Merchant, VisitResult, InstallStatus } from './types';
import { auth } from './firebase/config';
import { signOut } from 'firebase/auth';
import Admin from './Admin';
import Dashboard from './Dashboard';
import { useMerchants, useSettings } from './useMerchants';

// 네이버 브랜드 컬러
const N_GREEN = '#03C75A';

export default function App() {
  const { merchants, loading, updateMerchant, addMerchant, addMerchants, deleteMerchant, deleteMerchants } = useMerchants();
  const { assignees, loading: settingsLoading, updateAssignees } = useSettings();

  const [activeView, setActiveView] = useState<'list' | 'dashboard'>('list');
  const [groupBy, setGroupBy] = useState<'group' | 'dong'>('group');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [filterAssignee, setFilterAssignee] = useState<string | '전체'>('전체');
  const [filterGroup, setFilterGroup] = useState<string | '전체'>('전체');
  const [filterResult, setFilterResult] = useState<VisitResult | '전체'>('전체');
  const [filterInstall, setFilterInstall] = useState<InstallStatus | '전체'>('전체');
  const [filterTTerminal, setFilterTTerminal] = useState<string | '전체'>('전체');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);

  // CSV 다운로드 함수
  const handleDownloadCSV = () => {
    if (merchants.length === 0) {
      alert("다운로드할 데이터가 없습니다.");
      return;
    }
    
    const headers = ['시트명', 'VAN사', 'VAN대리점명', '대리점 연락처', '식당명', '사업자등록번호', '주소', '담당자', '방문일자', '방문결과', '설치상태', '설치완료일자', 'T단말기 설치여부', '비고', '연락처'];
    const csvRows = merchants.map(m => [
      `"${(m.groupName || '').replace(/"/g, '""')}"`,
      `"${(m.vanCompany || '').replace(/"/g, '""')}"`,
      `"${(m.vanAgencyName || '').replace(/"/g, '""')}"`,
      `"${(m.agencyContact || '').replace(/"/g, '""')}"`,
      `"${(m.name || '').replace(/"/g, '""')}"`,
      `"${(m.businessNumber || '').replace(/"/g, '""')}"`,
      `"${(m.address || '').replace(/"/g, '""')}"`,
      `"${(m.assignee || '').replace(/"/g, '""')}"`,
      `"${(m.visitDate || '').replace(/"/g, '""')}"`,
      `"${(m.visitResult || '').replace(/"/g, '""')}"`,
      `"${(m.installStatus || '').replace(/"/g, '""')}"`,
      `"${(m.installDate || '').replace(/"/g, '""')}"`,
      `"${(m.tTerminalInstalled || '').replace(/"/g, '""')}"`,
      `"${(m.notes || '').replace(/"/g, '""')}"`,
      `"${(m.contact || '').replace(/"/g, '""')}"`
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
                            merchant.address?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesGroup = filterGroup === '전체' || merchant.groupName === filterGroup;
      const matchesAssignee = filterAssignee === '전체' || (merchant.assignee || '미배정') === filterAssignee;
      const matchesResult = filterResult === '전체' || merchant.visitResult === filterResult;
      const matchesInstall = filterInstall === '전체' || merchant.installStatus === filterInstall;
      const matchesTTerminal = filterTTerminal === '전체' || merchant.tTerminalInstalled === filterTTerminal;
      
      // Visit Date Range Filter
      let matchesDate = true;
      if (merchant.visitDate) {
        const vDate = merchant.visitDate.substring(0, 10);
        if (startDate && vDate < startDate) matchesDate = false;
        if (endDate && vDate > endDate) matchesDate = false;
      } else if (startDate || endDate) {
        matchesDate = false;
      }

      return matchesSearch && matchesGroup && matchesAssignee && matchesResult && matchesInstall && matchesTTerminal && matchesDate;
    });
  }, [merchants, searchQuery, filterGroup, filterAssignee, filterResult, filterInstall, filterTTerminal, startDate, endDate]);

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

  const groupedMerchants = filteredItems.reduce((acc, current) => {
    const group = groupBy === 'group' 
        ? (current.groupName || '미분류') 
        : extractDong(current.address);
    if (!acc[group]) acc[group] = [];
    acc[group].push(current);
    return acc;
  }, {} as Record<string, Merchant[]>);
  
  const sortedGroupKeys = Object.keys(groupedMerchants).sort();

  const handleEditClick = (merchant: Merchant) => {
    setSelectedMerchant({ ...merchant }); // Clone for editing
    setIsEditModalOpen(true);
  };

  const handlSaveMerchant = async () => {
    if (selectedMerchant) {
      await updateMerchant(selectedMerchant.id, {
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
        contact: selectedMerchant.contact || ''
      });
      setIsEditModalOpen(false);
      setSelectedMerchant(null);
    }
  };

  const getResultColor = (result: VisitResult) => {
    switch (result) {
      case '대기중': return 'bg-gray-100 text-gray-600';
      case '대리점상담희망': return 'bg-[#e5f9ed] text-[#03C75A] font-medium';
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
    <div className="min-h-screen bg-[#f5f6f8] pb-20 font-sans text-gray-900">
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
        {activeView === 'dashboard' ? (
          <Dashboard merchants={merchants} />
        ) : (
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
                  {['전체', '대기중', '대표부재', '재방문필요', '대리점상담희망', '즉시설치', '거절', '불가', '방문실패'].map((filter) => (
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
            <div className="space-y-6">
              {sortedGroupKeys.map(group => (
                <div key={group} className="space-y-3">
                  <h3 className="text-[13px] font-bold text-gray-800 px-2 py-1 flex items-center gap-2 border-b border-gray-100">
                    <FileText className="h-4 w-4 text-gray-400" />
                    {group}
                    <span className="text-gray-400 font-medium ml-auto">{groupedMerchants[group].length}곳</span>
                  </h3>
                  <div className="space-y-3">
                    {groupedMerchants[group].map((merchant) => (
                      <div 
                        key={merchant.id}
                        onClick={() => handleEditClick(merchant)}
                        className="bg-white rounded-2xl p-5 shadow-sm active:scale-[0.98] transition-transform cursor-pointer border border-transparent hover:border-gray-200"
                      >
                        <div className="flex justify-between items-start mb-3">
                          <h3 className="text-lg font-bold text-gray-900 leading-tight">{merchant.name}</h3>
                          <div className="flex flex-col items-end gap-1.5">
                             <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-tight ${getResultColor(merchant.visitResult)}`}>
                                {merchant.visitResult}
                             </span>
                             {['대리점상담희망', '즉시설치'].includes(merchant.visitResult) && (
                                <span className={`px-2 py-0.5 rounded text-[10px] ${getInstallColor(merchant.installStatus)}`}>
                                  설치: {merchant.installStatus}
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
                             {merchant.vanCompany && (
                               <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                                 VAN: {merchant.vanCompany} {merchant.vanAgencyName && `(${merchant.vanAgencyName})`}
                               </span>
                             )}
                             {merchant.tTerminalInstalled && merchant.tTerminalInstalled !== '모름' && merchant.tTerminalInstalled !== '' && (
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
                </div>
              ))}
            </div>
          )}
        </div>
      </>
      )}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-lg border-t border-gray-100 px-safe pb-safe shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.05)]">
        <div className="max-w-3xl mx-auto flex h-16">
          <button
            onClick={() => setActiveView('list')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              activeView === 'list' ? 'text-[#03C75A]' : 'text-gray-400'
            }`}
          >
            <List className="h-6 w-6" />
            <span className="text-[10px] font-bold uppercase tracking-wider">가맹점</span>
          </button>
          <button
            onClick={() => setActiveView('dashboard')}
            className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
              activeView === 'dashboard' ? 'text-[#03C75A]' : 'text-gray-400'
            }`}
          >
            <BarChart2 className="h-6 w-6" />
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
              <div>
                <h2 className="text-xl font-bold">{selectedMerchant.name}</h2>
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
            <div className="p-6 overflow-y-auto space-y-5">
              
              {/* 시트명 & 담당자 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <FileText className="h-4 w-4" /> 시트명(그룹)
                  </label>
                  <input
                    type="text"
                    value={selectedMerchant.groupName || ''}
                    onChange={(e) => setSelectedMerchant({...selectedMerchant, groupName: e.target.value})}
                    placeholder="예: 5월 영업목록"
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <User className="h-4 w-4" /> 담당자
                  </label>
                  <select
                    value={selectedMerchant.assignee || ''}
                    onChange={(e) => setSelectedMerchant({...selectedMerchant, assignee: e.target.value})}
                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors"
                  >
                    <option value="">담당자를 선택하세요</option>
                    {assignees.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 방문일자 */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" /> 방문일자
                  </span>
                  <button 
                    onClick={() => {
                      // Get today's date in YYYY-MM-DD format based on local time
                      const offset = new Date().getTimezoneOffset() * 60000;
                      const localISOTime = (new Date(Date.now() - offset)).toISOString().slice(0, 10);
                      setSelectedMerchant({...selectedMerchant, visitDate: localISOTime});
                    }}
                    className="text-[11px] font-bold text-[#03C75A] bg-[#e5f9ed] px-2 py-0.5 rounded cursor-pointer"
                  >
                    오늘 당일
                  </button>
                </label>
                <input 
                  type="date" 
                  value={selectedMerchant.visitDate?.substring(0,10) || ''}
                  onChange={(e) => setSelectedMerchant({...selectedMerchant, visitDate: e.target.value})}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors"
                />
              </div>

              {/* 방문결과 */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">방문 결과</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['대기중', '대표부재', '재방문필요', '대리점상담희망', '즉시설치', '거절', '불가', '방문실패'] as VisitResult[]).map((result) => (
                    <button
                      key={result}
                      onClick={() => {
                        const newResult = selectedMerchant.visitResult === result ? '' : result;
                        const updates: any = { visitResult: newResult };
                        // If visitResult is not positive anymore, reset install info
                        if (!['대리점상담희망', '즉시설치'].includes(newResult)) {
                          updates.installStatus = '미설치';
                          updates.installDate = '';
                        }
                        setSelectedMerchant({...selectedMerchant, ...updates});
                      }}
                      className={`py-2.5 px-2 rounded-xl text-sm font-medium border transition-all ${
                        selectedMerchant.visitResult === result 
                          ? 'border-[#03C75A] bg-[#e5f9ed] text-[#03C75A]' 
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {result}
                    </button>
                  ))}
                </div>
              </div>

              {/* T단말기 설치여부 */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">T단말기 설치여부</label>
                <div className="flex gap-2">
                  {['설치', '미설치', '모름'].map((status) => (
                    <button
                      key={status}
                      onClick={() => setSelectedMerchant({...selectedMerchant, tTerminalInstalled: status as any})}
                      className={`flex-1 py-2 px-2 rounded-lg text-sm font-medium border transition-all ${
                        selectedMerchant.tTerminalInstalled === status 
                          ? 'border-[#03C75A] bg-[#e5f9ed] text-[#03C75A]' 
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>

              {/* 설치 상태 (대리점상담희망/즉시설치일 때만 표시) */}
              {['대리점상담희망', '즉시설치'].includes(selectedMerchant.visitResult) && (
                <div className="space-y-4 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">단말기 설치 상태</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['미설치', '설치예정', '설치완료'] as InstallStatus[]).map((status) => (
                        <button
                          key={status}
                          onClick={() => {
                            const updates: any = { installStatus: status };
                            // If switching to installed, auto-fill date with today if empty
                            if (status === '설치완료' && !selectedMerchant.installDate) {
                              const offset = new Date().getTimezoneOffset() * 60000;
                              updates.installDate = (new Date(Date.now() - offset)).toISOString().slice(0, 10);
                            }
                            setSelectedMerchant({...selectedMerchant, ...updates});
                          }}
                          className={`py-2 px-2 rounded-lg text-sm font-medium transition-all ${
                            selectedMerchant.installStatus === status 
                              ? 'bg-gray-800 text-white shadow-sm' 
                              : 'bg-white border border-gray-200 text-gray-600 md:hover:bg-gray-50'
                          }`}
                        >
                          {status}
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedMerchant.installStatus === '설치완료' && (
                    <div className="space-y-1.5 pt-2 border-t border-gray-200">
                      <label className="text-xs font-bold text-gray-500 uppercase flex items-center justify-between">
                        설치 완료일자
                        <button 
                          onClick={() => {
                            const offset = new Date().getTimezoneOffset() * 60000;
                            const localISOTime = (new Date(Date.now() - offset)).toISOString().slice(0, 10);
                            setSelectedMerchant({...selectedMerchant, installDate: localISOTime});
                          }}
                          className="text-[10px] text-[#03C75A] lowercase"
                        >
                          오늘로 설정
                        </button>
                      </label>
                      <input 
                        type="date" 
                        value={selectedMerchant.installDate || ''}
                        onChange={(e) => setSelectedMerchant({...selectedMerchant, installDate: e.target.value})}
                        className="w-full p-2 bg-white border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 비고 */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <FileText className="h-4 w-4" /> 비고 / 영업메모
                </label>
                <textarea 
                  value={selectedMerchant.notes || ''}
                  onChange={(e) => setSelectedMerchant({...selectedMerchant, notes: e.target.value})}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm min-h-[100px] resize-none focus:bg-white transition-colors"
                  placeholder="영업 특이사항이나 다음 방문시 필요한 내용을 기록하세요."
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 bg-white sm:rounded-b-2xl pb-safe">
              <button
                onClick={handlSaveMerchant}
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