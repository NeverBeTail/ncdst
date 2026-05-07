import React, { useState, useMemo } from 'react';
import { Merchant, VisitResult } from './types';
import { Calendar as CalendarIcon, MapPin, User, ChevronRight, CheckCircle2, Clock, Filter, Search, PlusCircle, Trash2, ArrowUp } from 'lucide-react';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';
import { handleFirestoreError, OperationType, isFirestoreQuotaError } from './firebase/errorHandler';

interface PlannerProps {
  merchants: Merchant[];
  assignees: string[];
  currentUserEmail: string | null;
  onRefresh: () => void;
  updatePlannedDate: (id: string, date: string) => Promise<void>;
  batchUpdatePlannedDate: (ids: string[], date: string) => Promise<void>;
  updatePlanOrder: (id: string, order: number) => Promise<void>;
  onMerchantClick?: (merchant: Merchant) => void;
}

export default function Planner({ 
  merchants, assignees, currentUserEmail, onRefresh, 
  updatePlannedDate, batchUpdatePlannedDate, updatePlanOrder,
  onMerchantClick 
}: PlannerProps) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().substring(0, 10));
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssignee, setFilterAssignee] = useState<string>('전체');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [expandedDongs, setExpandedDongs] = useState<Record<string, boolean>>({});
  const [refreshCounter, setRefreshCounter] = useState(0);

  const forceRefresh = () => {
    setRefreshCounter(prev => prev + 1);
    onRefresh();
  };

  // Extract Dong from address (Synchronized with App.tsx)
  const extractDong = (address: string) => {
    if (!address) return '기타';
    const parts = address.split(' ').filter(p => p.length > 0);
    const district = parts.find(p => /^[가-힣]+[구군]$/.test(p));
    let dongCandidate = '';
    const parenMatch = address.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const insideParen = parenMatch[1];
      const pParts = insideParen.split(',').map(p => p.trim());
      dongCandidate = pParts.find(p => /^[가-힣0-9]+[동읍면가]$/.test(p)) || '';
    }
    if (!dongCandidate) {
      dongCandidate = parts.find(p => /^[가-힣][가-힣0-9]*[동읍면가]$/.test(p)) || '';
    }
    if (district && dongCandidate) return `${district} ${dongCandidate}`;
    return dongCandidate || district || '기타';
  };

  // Candidates for planning
  const planningCandidates = useMemo(() => {
    return merchants.filter(m => {
      const needsVisit = !m.visitResult || ['대기중', '재방문필요', '대표부재', '방문실패'].includes(m.visitResult);
      const isSearchMatch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           m.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (m.leadOwner || '').toLowerCase().includes(searchQuery.toLowerCase());
      const isAssigneeMatch = filterAssignee === '전체' || (m.assignee || '미배정') === filterAssignee;
      
      return needsVisit && isSearchMatch && isAssigneeMatch;
    });
  }, [merchants, searchQuery, filterAssignee]);

  // Grouped candidates by Dong
  const groupedCandidates = useMemo(() => {
    const groups: Record<string, Merchant[]> = {};
    planningCandidates.forEach(m => {
      const dong = extractDong(m.address);
      if (!groups[dong]) groups[dong] = [];
      groups[dong].push(m);
    });
    return groups;
  }, [planningCandidates]);

  // Planned for the selectedDate, sorted by order
  const plannedForDate = useMemo(() => {
    return merchants
      .filter(m => m.plannedDate === selectedDate)
      .sort((a, b) => ((a as any).plannedOrder || 0) - ((b as any).plannedOrder || 0));
  }, [merchants, selectedDate]);

  const handleToggleSelect = (id: string) => {
    setSelectedMerchants(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBatchAssign = async () => {
    if (selectedMerchants.length === 0) return;
    setIsUpdating(true);
    try {
      await batchUpdatePlannedDate(selectedMerchants, selectedDate);
      setSelectedMerchants([]);
      setIsSelectorOpen(false); // Close selector after confirmation
      forceRefresh();
    } catch (error: any) {
      console.error('Error assigning plan:', error);
      alert('일정 수립 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveFromPlan = async (id: string) => {
    try {
      await updatePlannedDate(id, '');
      forceRefresh();
    } catch (error) {
      console.error('Error removing plan:', error);
      alert('일정 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleRemoveAllFromPlan = async () => {
    setIsUpdating(true);
    console.log('Removing plans for merchants:', plannedForDate.map(m => m.id));
    try {
      await batchUpdatePlannedDate(plannedForDate.map(m => m.id), '');
      forceRefresh();
    } catch (error) {
      console.error('Error removing all plans:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedMerchants.length === planningCandidates.length) {
      setSelectedMerchants([]);
    } else {
      setSelectedMerchants(planningCandidates.map(m => m.id));
    }
  };

  return (
    <div className="space-y-6 pb-32">
      {/* Header & Date Selector */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 sticky top-0 z-20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-[#03C75A]" />
              방문 계획
            </h2>
            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer p-0"
              />
            </div>
          </div>
          <button 
            onClick={() => setIsSelectorOpen(!isSelectorOpen)}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              isSelectorOpen 
                ? 'bg-gray-100 text-gray-600' 
                : 'bg-[#03C75A] text-white shadow-lg shadow-green-100'
            }`}
          >
            {isSelectorOpen ? (
              <>일정 수립 닫기</>
            ) : (
              <>
                <PlusCircle className="h-4 w-4" />
                일정만들기
              </>
            )}
          </button>
        </div>

        {plannedForDate.length > 0 ? (
          <div className="space-y-2">
            <div className="w-full flex items-center justify-between mb-1">
              <div className="text-[11px] text-gray-400 uppercase font-bold tracking-wider">
                {new Date(selectedDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 확정 일정 ({plannedForDate.length}건)
              </div>
              <button 
                onClick={handleRemoveAllFromPlan}
                disabled={isUpdating}
                className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase disabled:opacity-50"
              >
                전체 삭제
              </button>
            </div>
            <div className="space-y-2">
              {plannedForDate.map((m, idx) => (
                <div 
                  key={`planned-${m.id}`} 
                  onClick={() => onMerchantClick?.(m)}
                  className="bg-white border border-[#c3f0d4] p-3 rounded-xl flex items-center gap-3 shadow-sm group cursor-pointer hover:border-[#03C75A] transition-colors"
                >
                  <div className="w-6 h-6 bg-[#03C75A] text-white rounded-full flex items-center justify-center text-[10px] font-black shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-900 truncate">{m.name}</div>
                    <div className="text-[10px] text-gray-400 truncate flex items-center gap-1 leading-none">
                      <MapPin className="h-2.5 w-2.5" /> {m.address}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        updatePlanOrder(m.id, idx - 1.5);
                      }} 
                      disabled={idx === 0}
                      className="p-1 px-1.5 text-[10px] font-bold text-gray-500 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30"
                    >
                      UP
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        updatePlanOrder(m.id, idx + 1.5);
                      }} 
                      disabled={idx === plannedForDate.length - 1}
                      className="p-1 px-1.5 text-[10px] font-bold text-gray-500 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-30"
                    >
                      DN
                    </button>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFromPlan(m.id);
                    }} 
                    className="p-2 text-red-500 hover:text-red-700 transition-colors bg-red-50 rounded-lg"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic bg-gray-50 p-4 rounded-xl text-center border border-dashed border-gray-200">
            {isSelectorOpen 
              ? '아래 목록에서 가맹점을 선택하여 일정을 수립하세요.' 
              : '선택한 날짜에 수립된 일정이 없습니다. "일정만들기" 버튼을 눌러보세요.'}
          </div>
        )}
      </div>

      {/* Selector Mode (Only shown if isSelectorOpen) */}
      {isSelectorOpen && (
        <div className="px-1 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-3 bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input 
                  type="text"
                  placeholder="대상 검색"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-[#03C75A] outline-none"
                />
              </div>
              <select 
                value={filterAssignee}
                onChange={(e) => setFilterAssignee(e.target.value)}
                className="bg-gray-50 border-none rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[#03C75A]"
              >
                <option value="전체">모든 담당자</option>
                {assignees.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-4">
                <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                  대상 가맹점 <span className="text-gray-900">{planningCandidates.length}</span>곳
                </div>
                {planningCandidates.length > 0 && (
                  <button 
                    onClick={toggleSelectAll}
                    className="text-[11px] font-black text-[#03C75A] hover:underline uppercase tracking-tighter"
                  >
                    {selectedMerchants.length === planningCandidates.length ? '선택 해제' : '전체 선택'}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {(Object.entries(groupedCandidates) as [string, Merchant[]][]).sort((a, b) => a[0].localeCompare(b[0])).map(([dong, group]) => {
                const isExpanded = expandedDongs[dong] === true; // Default closed
                return (
                  <div key={dong} className="space-y-2">
                    <button 
                      onClick={() => setExpandedDongs(prev => ({ ...prev, [dong]: !isExpanded }))}
                      className="flex items-center justify-between w-full p-2 hover:bg-white rounded-xl transition-colors group"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`h-1.5 w-1.5 rounded-full transition-transform duration-300 ${isExpanded ? 'bg-[#03C75A] scale-125' : 'bg-gray-300'}`} />
                        <h3 className="text-sm font-black text-gray-900">{dong} ({group.length})</h3>
                      </div>
                      <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-90' : 'rotate-0'}`} />
                    </button>
                    
                    {isExpanded && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                        {group.map(m => {
                          const isSelected = selectedMerchants.includes(m.id);
                          const isPlannedForSelectedDate = m.plannedDate === selectedDate;
                          const isPlannedForOtherDate = m.plannedDate && m.plannedDate !== '' && m.plannedDate !== selectedDate;

                          return (
                            <div 
                              key={m.id}
                              onClick={() => handleToggleSelect(m.id)}
                              className={`relative p-3 rounded-xl border transition-all cursor-pointer ${
                                isSelected 
                                  ? 'border-[#03C75A] bg-[#f0fdf4] ring-1 ring-[#03C75A]' 
                                  : isPlannedForSelectedDate
                                    ? 'border-green-100 bg-green-50/30'
                                    : 'border-gray-100 bg-white hover:border-gray-300'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="space-y-1 flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {isPlannedForSelectedDate && (
                                      <span className="text-[8px] bg-[#03C75A] text-white px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                                        <CheckCircle2 className="h-2 w-2" /> 선택일 예정
                                      </span>
                                    )}
                                    {isPlannedForOtherDate && (
                                      <span className="text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                                        {m.plannedDate.substring(5)} 예정
                                      </span>
                                    )}
                                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded leading-none ${m.merchantType === 'BOOKING' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#03C75A]/10 text-[#03C75A]'}`}>
                                      {m.merchantType === 'BOOKING' ? '예약' : '커넥트'}
                                    </span>
                                  </div>
                                  <h4 className="text-xs font-bold text-gray-900 truncate">{m.name}</h4>
                                  <p className="text-[10px] text-gray-500 truncate leading-none">{m.address}</p>
                                </div>
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                                  isSelected ? 'bg-[#03C75A] border-[#03C75A]' : 'border-gray-200 bg-gray-50'
                                }`}>
                                  {isSelected && <CheckCircle2 className="h-3 w-3 text-white" />}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {planningCandidates.length === 0 && (
              <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                <CalendarIcon className="h-10 w-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400">대상 가맹점이 없습니다.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Prominent Action Bar */}
      {selectedMerchants.length > 0 && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 z-40 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-gray-900 text-white rounded-2xl p-4 shadow-2xl flex items-center justify-between border border-gray-800">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">일정 예약 중</span>
              <span className="text-sm font-bold">{selectedMerchants.length}건 선택됨</span>
            </div>
            <button 
              onClick={handleBatchAssign}
              disabled={isUpdating}
              className="bg-[#03C75A] hover:bg-[#02b351] text-white px-6 py-2.5 rounded-xl text-sm font-black shadow-lg hover:scale-[1.03] active:scale-[0.97] transition-all flex items-center gap-2"
            >
              {isUpdating ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <PlusCircle className="h-4 w-4" />
              )}
              {selectedDate.substring(5)} 계획 확정
            </button>
          </div>
        </div>
      )}
      
      {/* Scroll to Top */}
      <button 
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-28 right-6 z-30 bg-gray-800 text-white p-3 rounded-full shadow-xl hover:bg-gray-700 transition-colors"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </div>
  );
}
