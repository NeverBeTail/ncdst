import React, { useState, useMemo } from 'react';
import { Merchant, VisitResult } from './types';
import { Calendar as CalendarIcon, MapPin, User, ChevronRight, CheckCircle2, Clock, Filter, Search, PlusCircle, Trash2 } from 'lucide-react';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';
import { handleFirestoreError, OperationType, isFirestoreQuotaError } from './firebase/errorHandler';

interface PlannerProps {
  merchants: Merchant[];
  assignees: string[];
  currentUserEmail: string | null;
  onRefresh: () => void;
}

export default function Planner({ merchants, assignees, currentUserEmail, onRefresh }: PlannerProps) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().substring(0, 10));
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterAssignee, setFilterAssignee] = useState<string>('전체');
  const [isUpdating, setIsUpdating] = useState(false);

  // Extract Dong from address
  const extractDong = (address: string) => {
    if (!address) return '기타';
    const districtMatch = address.match(/([가-힣]+[구|시])\s+([가-힣]+[동|가|로|길])/);
    const dongMatch = address.match(/([가-힣]+[동|가|로|길])(\s|\d|$)/);
    
    const district = districtMatch ? districtMatch[1] : '';
    const dongCandidate = dongMatch ? dongMatch[1] : '';
    
    return dongCandidate || district || '기타';
  };

  // Candidates for planning: visitResult is empty or '대기중' or '재방문필요'
  // AND they don't have a visitDate yet (or it's in the past and they need revisit)
  const planningCandidates = useMemo(() => {
    return merchants.filter(m => {
      const needsVisit = !m.visitResult || ['대기중', '재방문필요', '대표부재', '방문실패'].includes(m.visitResult);
      const isSearchMatch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           m.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (m.leadOwner || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (m.assignedPart || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (m.contactStage || '').toLowerCase().includes(searchQuery.toLowerCase());
      const isAssigneeMatch = filterAssignee === '전체' || (m.assignee || '미배정') === filterAssignee;
      
      // If it has a plannedDate for the future, maybe exclude it? 
      // Actually let's show anyway so they can change it.
      return needsVisit && isSearchMatch && isAssigneeMatch;
    });
  }, [merchants, searchQuery, filterAssignee]);

  // Planned for the selectedDate
  const plannedForDate = useMemo(() => {
    return merchants.filter(m => m.plannedDate === selectedDate);
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
      const CHUNK_SIZE = 500;
      for (let i = 0; i < selectedMerchants.length; i += CHUNK_SIZE) {
        const chunk = selectedMerchants.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach(id => {
          const merchantRef = doc(db, 'merchants', id);
          batch.update(merchantRef, {
            plannedDate: selectedDate,
            updatedAt: serverTimestamp()
          });
        });
        await batch.commit();
      }
      
      setSelectedMerchants([]);
      onRefresh();
    } catch (error: any) {
      console.error('Error assigning plan:', error);
      if (isFirestoreQuotaError(error)) {
        alert('데이터 처리 한도를 초과했습니다. 잠시 후 다시 시도하거나 요금제를 확인해주세요.');
      } else {
        handleFirestoreError(error, OperationType.UPDATE, 'merchants/plan-batch');
        alert('일정 수립 중 오류가 발생했습니다.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveFromPlan = async (id: string) => {
    try {
      const merchantRef = doc(db, 'merchants', id);
      const batch = writeBatch(db);
      batch.update(merchantRef, {
        plannedDate: '',
        updatedAt: serverTimestamp()
      });
      await batch.commit();
      onRefresh();
    } catch (error) {
      console.error('Error removing plan:', error);
      handleFirestoreError(error, OperationType.UPDATE, `merchants/${id}/remove-plan`);
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
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-[#03C75A]" />
            방문 일정 수립
          </h2>
          <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
            <span className="text-sm font-medium text-gray-600">계획 일자:</span>
            <input 
              type="date" 
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent border-none text-sm font-bold focus:ring-0 cursor-pointer"
            />
          </div>
        </div>

        {plannedForDate.length > 0 ? (
          <div className="space-y-2">
            <div className="w-full text-[11px] text-gray-400 mb-1 uppercase font-bold tracking-wider">
              {new Date(selectedDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} 일정 ({plannedForDate.length}건)
            </div>
            <div className="flex flex-wrap gap-2">
              {plannedForDate.map(m => (
                <div key={`planned-${m.id}`} className="bg-[#e5f9ed] text-[#03C75A] px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 border border-[#c3f0d4] group">
                  <CheckCircle2 className="h-3 w-3" />
                  {m.name}
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFromPlan(m.id);
                    }} 
                    className="p-0.5 hover:bg-white rounded-full transition-colors"
                  >
                    <Trash2 className="h-3 w-3 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic">선택한 날짜에 수립된 일정이 없습니다.</div>
        )}
      </div>

      {/* Main Layout: Selector & Candidates */}
      <div className="px-1">
        {/* Candidates List */}
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input 
                type="text"
                placeholder="가맹점명 또는 주소 검색"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#03C75A] outline-none"
              />
            </div>
            <select 
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-[#03C75A]"
            >
              <option value="전체">모든 담당자</option>
              {assignees.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-500">
                대상 가맹점 <span className="font-bold text-gray-900">{planningCandidates.length}</span>곳
              </div>
              {planningCandidates.length > 0 && (
                <button 
                  onClick={toggleSelectAll}
                  className="text-xs font-bold text-[#03C75A] hover:underline"
                >
                  {selectedMerchants.length === planningCandidates.length ? '선택 해제' : '전체 선택'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {planningCandidates.map(m => {
              (m as any).dong = extractDong(m.address);
              const isSelected = selectedMerchants.includes(m.id);
              const isPlannedForSelectedDate = m.plannedDate === selectedDate;
              const isPlannedForOtherDate = m.plannedDate && m.plannedDate !== '' && m.plannedDate !== selectedDate;

              return (
                <div 
                  key={m.id}
                  onClick={() => handleToggleSelect(m.id)}
                  className={`relative p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected 
                      ? 'border-[#03C75A] bg-[#f0fdf4] ring-1 ring-[#03C75A]' 
                      : isPlannedForSelectedDate
                        ? 'border-green-100 bg-green-50/30'
                        : 'border-gray-100 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded leading-none ${m.merchantType === 'BOOKING' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#03C75A]/10 text-[#03C75A]'}`}>
                          {m.merchantType === 'BOOKING' ? '예약' : '커넥트'}
                        </span>
                        {isPlannedForSelectedDate && (
                          <span className="text-[9px] bg-[#03C75A] text-white px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                            <CheckCircle2 className="h-2 w-2" /> 선택일 예정
                          </span>
                        )}
                        {isPlannedForOtherDate && (
                          <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">
                            {m.plannedDate.substring(5)} 예정
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-gray-900 truncate">{m.name}</h4>
                      <div className="flex items-start gap-1 text-[11px] text-gray-500">
                        <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                        <span className="truncate leading-tight">{(m as any).dong} • {m.address}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                          <User className="h-3 w-3" />
                          {m.assignee || '미배정'}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                          <Clock className="h-3 w-3" />
                          {m.visitResult || '미처리'}
                        </div>
                        {m.merchantType === 'BOOKING' && m.contactStage && (
                          <div className="flex items-center gap-1 text-[10px] text-[#007AFF] font-bold">
                            {m.contactStage}
                          </div>
                        )}
                        {m.merchantType === 'BOOKING' && m.assignedPart && (
                          <div className="flex items-center gap-1 text-[10px] text-gray-500">
                            {m.assignedPart}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 mt-0.5 ${
                      isSelected ? 'bg-[#03C75A] border-[#03C75A]' : 'border-gray-200 bg-gray-50'
                    }`}>
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                    </div>
                  </div>
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
    </div>
  );
}
