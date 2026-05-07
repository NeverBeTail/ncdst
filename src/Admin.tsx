import React, { useState, useRef, useMemo } from 'react';
import { Merchant, InstallStatus, MerchantType, AuditLog, AppUser } from './types';
import { ArrowLeft, Plus, Trash2, Edit2, Check, X, Upload, Save, Link as LinkIcon, RefreshCw, Download, FileText, History, User, Users, Calendar, Clock, ArrowUp } from 'lucide-react';
import Papa from 'papaparse';
import { normalizeAddress } from './services/jusoService';
import { useAuditLogs, useUsers, useAllPlans } from './useMerchants';
import { isFirestoreQuotaError } from './firebase/errorHandler';

const N_GREEN = '#03C75A';

interface AdminProps {
  userProfile: AppUser | null;
  merchants: Merchant[];
  assignees: string[];
  addMerchant: (m: Omit<Merchant, 'id'>) => Promise<void>;
  addMerchants: (m: Omit<Merchant, 'id'>[]) => Promise<void>;
  updateMerchant: (id: string, m: Partial<Omit<Merchant, 'id'>>) => Promise<void>;
  deleteMerchant: (id: string) => Promise<void>;
  deleteMerchants: (ids: string[]) => Promise<void>;
  updateAssignees: (a: string[]) => Promise<void>;
  updateProfile: (updates: Partial<AppUser>) => Promise<void>;
  approveUser?: (userId: string) => Promise<void>;
  onClose: () => void;
}

export default function Admin({ 
  userProfile, merchants, assignees, addMerchant, addMerchants, 
  updateMerchant, deleteMerchant, deleteMerchants, 
  updateAssignees, updateProfile, approveUser, onClose 
}: AdminProps) {
  const isAdmin = userProfile?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'merchants' | 'settings' | 'accounts' | 'audit'>(isAdmin ? 'accounts' : 'merchants');
  const { logs, loading: logsLoading } = useAuditLogs();
  const { users, loading: usersLoading } = useUsers();
  const { plans: allPlans, loading: plansLoading } = useAllPlans(isAdmin);
  const [activeType, setActiveType] = useState<'CONNECT' | 'BOOKING'>('CONNECT');
  
  // Profile settings
  const [editUserName, setEditUserName] = useState(userProfile?.name || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  
  // Settings states
  const [newAssignee, setNewAssignee] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Merchant states
  const [editingMerchantId, setEditingMerchantId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Merchant>>({});
  const [isAddingMerchant, setIsAddingMerchant] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'uploading' | 'complete'>('idle');
  
  const handleUpdateName = async () => {
    if (!editUserName.trim() || isUpdatingProfile) return;
    setIsUpdatingProfile(true);
    try {
      await updateProfile({ name: editUserName.trim() });
      alert('저장되었습니다.');
    } catch (e) {
      alert('이름 수정 실패');
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const userStats = useMemo(() => {
    if (!isAdmin) return [];
    return users.map(u => {
      // 가맹점 수는 전체 공유이므로 merchants.length (또는 실제 DB에 등록된 전체 수)
      const userPlansCount = allPlans.filter(p => p.userId === u.id).length;
      return {
        ...u,
        merchantCount: merchants.length,
        plannedCount: userPlansCount
      };
    });
  }, [isAdmin, users, merchants, allPlans]);
  const [uploadProgress, setUploadProgress] = useState<{ 
    current: number; 
    total: number; 
    success: number; 
    failed: number; 
    skipped: number;
    phase: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Address normalization logic (extracted for reuse)
  const [isNormalizing, setIsNormalizing] = useState(false);
  const [useAddressNormalization, setUseAddressNormalization] = useState(true);
  const [addressType, setAddressType] = useState<'road' | 'jibun'>('jibun');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const fileName = file.name.replace(/\.[^/.]+$/, "");

    setIsUploading(true);
    setUploadStatus('processing');
    setUploadProgress({ current: 0, total: 0, success: 0, failed: 0, skipped: 0, phase: '준비 중...' });
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data;
        const totalRows = rows.length;
        setUploadProgress(prev => ({ ...prev!, total: totalRows, phase: '데이터 분석 중...' }));
        
        const validMerchants: Omit<Merchant, 'id'>[] = [];
        const existingIdentifiers = new Set(merchants.map(m => `${m.name}|${m.address}`.replace(/\s+/g, '')));
        const existingBizNums = new Set(merchants.map(m => m.businessNumber).filter(Boolean));

        let skippedCount = 0;

        // Phase 1: Data cleaning and normalization
        setUploadStatus('processing');
        const NORM_CHUNK_SIZE = 5;
        for (let i = 0; i < totalRows; i += NORM_CHUNK_SIZE) {
          setUploadProgress(prev => ({ ...prev!, current: i, phase: `주소 정제 중 (${i}/${totalRows})` }));
          const chunk = rows.slice(i, i + NORM_CHUNK_SIZE);
          
          const chunkPromises = chunk.map(async (row: any) => {
            const name = (row['식당명'] || row['가맹점명'] || row['name'] || '').trim();
            const businessNumber = (row['사업자등록번호'] || '').trim();
            let address = (row['주소'] || row['address'] || '').trim();
            
            if (!name || !address) {
              skippedCount++;
              return null;
            }

            // Duplicate detection
            const identifier = `${name}|${address}`.replace(/\s+/g, '');
            if (existingIdentifiers.has(identifier) || (businessNumber && existingBizNums.has(businessNumber))) {
              skippedCount++;
              return null;
            }

            // Normalize address if enabled
            if (useAddressNormalization) {
              try {
                const normalized = await normalizeAddress(address, addressType);
                if (normalized) address = normalized;
              } catch (err) {
                console.error("Address normalization failed for:", address, err);
              }
            }
            
            const visitResultMap = ['대기중', '대표부재', '재방문필요', '상담희망', '즉시설치', '거절', '불가', '방문실패', '기사용', ''];
            const tTerminalMap = ['설치', '미설치', '모름', ''];

            const visitResult = visitResultMap.includes(row['방문결과']?.trim()) ? row['방문결과'].trim() : '대기중';
            
            if (activeType === 'CONNECT') {
              const installCellVal = row['설치상태']?.trim() || '';
              let installStatus: InstallStatus = '미설치';
              let installDate = '';

              if (installCellVal === '미설치' || installCellVal === '') {
                installStatus = '미설치';
              } else if (installCellVal === '설치예정') {
                installStatus = '설치예정';
              } else if (installCellVal === '설치완료') {
                installStatus = '설치완료';
              } else {
                const dateParsed = Date.parse(installCellVal);
                if (!isNaN(dateParsed)) {
                  installStatus = '설치완료';
                  installDate = new Date(dateParsed).toISOString().substring(0, 10);
                } else {
                  installStatus = '미설치';
                }
              }

              const tTerminalInstalled = tTerminalMap.includes(row['T단말기 설치여부']?.trim()) ? row['T단말기 설치여부'].trim() : '';

              return {
                merchantType: 'CONNECT' as MerchantType,
                groupName: fileName,
                vanCompany: (row['VAN사'] || '').trim(),
                vanAgencyName: (row['VAN대리점명'] || '').trim(),
                agencyContact: (row['대리점 연락처'] || '').trim(),
                name: name.trim(),
                businessNumber: (row['사업자등록번호'] || '').trim(),
                address: address.trim(),
                assignee: (row['담당자'] || '').trim(),
                visitDate: (row['방문일자'] || '').trim(),
                visitResult: visitResult as any,
                installStatus: installStatus as any,
                installDate: installDate,
                tTerminalInstalled: tTerminalInstalled as any,
                notes: (row['비고'] || '').trim(),
                contact: (row['연락처'] || '').trim()
              };
            } else {
              // BOOKING Mapping (Naver Reservation Sales)
              return {
                merchantType: 'BOOKING' as MerchantType,
                groupName: (row['시트명'] || fileName).trim(),
                name: name.trim(),
                businessNumber: (row['사업자등록번호'] || '').trim(),
                address: address.trim(),
                assignee: (row['담당자'] || (row['리드 소유자'] || '')).trim(),
                visitDate: (row['방문일자'] || '').trim(),
                visitResult: visitResult as any,
                notes: (row['비고'] || '').trim(),
                contact: (row['연락처'] || row['전화번호'] || '').trim(),
                
                // New Fields
                criteria: (row['기준'] || '').trim(),
                no: (row['No.'] || '').trim(),
                classification: (row['구분'] || '').trim(),
                placeId: (row['플레이스ID(예약)'] || row['플레이스ID'] || row['placeId'] || '').trim(),
                category: (row['카테고리 1'] || row['카테고리'] || row['category'] || '').trim(),
                category2: (row['카테고리 2'] || '').trim(),
                category3: (row['카테고리 3'] || '').trim(),
                assignedPart: (row['배정 파트'] || '').trim(),
                leadOwner: (row['리드 소유자'] || '').trim(),
                contactStage: (row['컨택 단계'] || '').trim(),
                contactStatusNotes: (row['비고(컨택 현황)'] || row['비고(컨택 현황 자유 기재)'] || '').trim(),
                
                // Contact History
                firstContactDate: (row['1차 컨택 일자'] || row['1차 컨택 성공 일자'] || '').trim(),
                firstContactAssignee: (row['1차 담당자'] || row['1차 컨택 담당자'] || '').trim(),
                secondContactDate: (row['2차 컨택 일자'] || row['2차 컨택 성공 일자'] || '').trim(),
                secondContactAssignee: (row['2차 담당자'] || row['2차 컨택 담당자'] || '').trim(),
                thirdContactDate: (row['3차 컨택 일자'] || row['3차 컨택 성공 일자'] || '').trim(),
                thirdContactAssignee: (row['3차 담당자'] || row['3차 컨택 담당자'] || '').trim(),

                bookingStatus: (row['예약상태(예약)'] || row['예약상태'] || row['bookingStatus'] || '').trim(),
              };
            }
          });

          const chunkResults = await Promise.all(chunkPromises);
          chunkResults.forEach(m => {
            if (m) validMerchants.push(m);
          });
        }

        // Phase 2: Upload to Firestore
        setUploadStatus('uploading');
        const uploadTotal = validMerchants.length;
        let successTotal = 0;
        let failedTotal = 0;

        const UPLOAD_BATCH_SIZE = 15; // Small batches for better progress tracking and error recovery
        for (let i = 0; i < uploadTotal; i += UPLOAD_BATCH_SIZE) {
          const chunk = validMerchants.slice(i, i + UPLOAD_BATCH_SIZE);
          setUploadProgress(prev => ({ 
            ...prev!, 
            current: i, 
            skipped: skippedCount,
            success: successTotal,
            failed: failedTotal,
            phase: `Firestore 업로드 중 (${i}/${uploadTotal})` 
          }));

          try {
            // Try batch upload
            await addMerchants(chunk);
            successTotal += chunk.length;
          } catch (err: any) {
            if (isFirestoreQuotaError(err)) {
              console.error("Critical: Firestore Quota exceeded during bulk upload.");
              failedTotal += (uploadTotal - successTotal);
              const quotaMsg = "데이터 처리 한도가 초과되었습니다. 업로드가 중단됩니다.";
              alert(quotaMsg);
              break; // Stop immediately
            }

            console.error("Batch upload failed, retrying individual rows in batch:", err);
            // Fallback: Retry each row in the failed batch individually
            for (const merchant of chunk) {
              try {
                await addMerchant(merchant);
                successTotal++;
              } catch (rowErr: any) {
                if (isFirestoreQuotaError(rowErr)) {
                  alert("데이터 처리 한도 초과로 업로드를 중단합니다.");
                  failedTotal += (uploadTotal - successTotal);
                  break;
                }
                console.error("Individual row upload failed:", merchant.name, rowErr);
                failedTotal++;
              }
            }
            if (isFirestoreQuotaError(err)) break; 
          }
        }

        setUploadStatus('complete');
        setUploadProgress({
          current: uploadTotal,
          total: totalRows,
          success: successTotal,
          failed: failedTotal,
          skipped: skippedCount,
          phase: '완료'
        });

        const summaryMsg = [
          `업로드가 완료되었습니다.`,
          `총 레코드: ${totalRows}`,
          `성공: ${successTotal}`,
          `실패: ${failedTotal}`,
          `중복/누락(건너뜀): ${skippedCount}`
        ].join('\n');
        
        alert(summaryMsg);
        
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => {
          setIsUploading(false);
          setUploadStatus('idle');
          setUploadProgress(null);
        }, 3000);
      },
      error: (error: Error) => {
        console.error("PapaParse error:", error);
        alert('CSV 파일 파싱 중 오류가 발생했습니다.');
        setIsUploading(false);
        setUploadStatus('idle');
        setUploadProgress(null);
      }
    });
  };

  const handleAddAssignee = async () => {
    try {
      if (newAssignee.trim() && !assignees.includes(newAssignee.trim())) {
        await updateAssignees([...assignees, newAssignee.trim()]);
        setNewAssignee('');
      }
    } catch(err: any) {
      if (isFirestoreQuotaError(err)) {
        alert("데이터 처리 한도 초과로 담당자를 추가할 수 없습니다.");
      } else {
        alert("추가 실패: " + err.message);
      }
    }
  };

  const handleDeleteAssignee = async (name: string) => {
    setConfirmDialog({
      message: `'${name}' 담당자를 삭제하시겠습니까?`,
      onConfirm: async () => {
        try {
          await updateAssignees(assignees.filter(a => a !== name));
        } catch(err: any) {
          alert("삭제 실패: " + err.message);
        }
      }
    });
  };

  const handleDownloadTemplate = () => {
    let headers = '';
    let filename = '';
    
    if (activeType === 'CONNECT') {
      headers = '시트명,VAN사,VAN대리점명,대리점 연락처,식당명,사업자등록번호,주소,담당자,방문일자,방문결과,설치상태,T단말기 설치여부,비고,연락처\n';
      filename = 'npay_connect_template.csv';
    } else {
      headers = '기준,No.,구분,식당명,주소,플레이스ID,카테고리 1,카테고리 2,카테고리 3,배정 파트,리드 소유자,컨택 단계,비고(컨택 현황),1차 컨택 일자,1차 담당자,2차 컨택 일자,2차 담당자,3차 컨택 일자,3차 담당자,연락처,사업자등록번호\n';
      filename = 'naver_booking_sales_template.csv';
    }
    
    const blob = new Blob(['\uFEFF' + headers], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddMerchantClick = () => {
    setIsAddingMerchant(true);
    setEditForm({
      merchantType: activeType as MerchantType,
      groupName: '',
      name: '',
      businessNumber: '',
      address: '',
      contact: '',
      assignee: '',
      visitDate: '',
      visitResult: '대기중',
      notes: '',
      // Connect specific
      vanCompany: '',
      vanAgencyName: '',
      agencyContact: '',
      installStatus: '미설치',
      installDate: '',
      tTerminalInstalled: '',
      // Booking specific
      placeId: '',
      bookingStatus: '',
      category: '',
      criteria: '',
      no: '',
      classification: '',
      category2: '',
      category3: '',
      assignedPart: '',
      leadOwner: '',
      contactStage: '',
      contactStatusNotes: '',
      firstContactDate: '',
      firstContactAssignee: '',
      secondContactDate: '',
      secondContactAssignee: '',
      thirdContactDate: '',
      thirdContactAssignee: ''
    });
  };

  const handleSaveMerchant = async () => {
    if (!editForm.name || !editForm.address) {
      alert('식당명과 주소를 입력해주세요.');
      return;
    }
    
    if (isAddingMerchant) {
      // Need full struct for 'addMerchant'
      const newM: Omit<Merchant, 'id'> = {
        merchantType: editForm.merchantType || activeType,
        groupName: editForm.groupName || '',
        name: editForm.name || '',
        businessNumber: editForm.businessNumber || '',
        address: editForm.address || '',
        contact: editForm.contact || '',
        assignee: editForm.assignee || '',
        visitDate: editForm.visitDate || '',
        visitResult: editForm.visitResult || '대기중',
        notes: editForm.notes || '',
        // Always include these but values depend on type
        vanCompany: editForm.vanCompany || '',
        vanAgencyName: editForm.vanAgencyName || '',
        agencyContact: editForm.agencyContact || '',
        installStatus: editForm.installStatus || '미설치',
        installDate: editForm.installDate || '',
        tTerminalInstalled: (editForm.tTerminalInstalled || '') as any,
        placeId: editForm.placeId || '',
        bookingStatus: editForm.bookingStatus || '',
        category: editForm.category || '',
        criteria: editForm.criteria || '',
        no: editForm.no || '',
        classification: editForm.classification || '',
        category2: editForm.category2 || '',
        category3: editForm.category3 || '',
        assignedPart: editForm.assignedPart || '',
        leadOwner: editForm.leadOwner || '',
        contactStage: editForm.contactStage || '',
        contactStatusNotes: editForm.contactStatusNotes || '',
        firstContactDate: editForm.firstContactDate || '',
        firstContactAssignee: editForm.firstContactAssignee || '',
        secondContactDate: editForm.secondContactDate || '',
        secondContactAssignee: editForm.secondContactAssignee || '',
        thirdContactDate: editForm.thirdContactDate || '',
        thirdContactAssignee: editForm.thirdContactAssignee || ''
      };
      await addMerchant(newM);
    } else if (editingMerchantId) {
      const { id, createdAt, updatedAt, ...updates } = editForm as any;
      await updateMerchant(editingMerchantId, updates);
    }
    
    setIsAddingMerchant(false);
    setEditingMerchantId(null);
  };

  const handleDeleteMerchantClick = async (id: string) => {
    setConfirmDialog({
      message: '이 가맹점을 삭제하시겠습니까?',
      onConfirm: async () => {
        await deleteMerchant(id);
      }
    });
  };

  const handleDeleteGroup = async (groupName: string) => {
    const groupMerchants = groupedMerchants[groupName] || [];
    setConfirmDialog({
      message: `'${groupName}' 그룹의 가맹점 ${groupMerchants.length}개를 모두 삭제하시겠습니까?`,
      onConfirm: async () => {
        try {
          await deleteMerchants(groupMerchants.map(m => m.id));
        } catch (err: any) {
          alert('그룹 삭제 중 오류가 발생했습니다: ' + err.message);
        }
      }
    });
  };

  const groupedMerchants = merchants
    .filter(m => m.merchantType === activeType)
    .reduce((acc, current) => {
      const group = current.groupName || '미분류';
      if (!acc[group]) acc[group] = [];
      acc[group].push(current);
      return acc;
    }, {} as Record<string, Merchant[]>);
  
  const sortedGroupKeys = Object.keys(groupedMerchants).sort();

  return (
    <div className="fixed inset-0 bg-[#f5f6f8] z-50 overflow-y-auto">
      {confirmDialog && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">{confirmDialog.message}</h3>
            <div className="flex gap-2">
              <button 
                onClick={async () => {
                  await confirmDialog.onConfirm();
                  setConfirmDialog(null);
                }}
                className="flex-1 py-3 text-white font-medium rounded-xl flex items-center justify-center gap-1 bg-red-500 hover:bg-red-600"
              >
                삭제
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

      {/* Header */}
      <header className="sticky top-0 z-10 bg-white shadow-sm border-b border-gray-100 px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 -ml-1 text-gray-500 hover:text-gray-900">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="text-xl font-bold" style={{ color: N_GREEN }}>관리자 페이지</h1>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 sticky top-[61px] z-10">
        <div className="flex px-4 max-w-3xl mx-auto overflow-x-auto scrollbar-hide">
          {isAdmin && (
            <button 
              className={`min-w-[100px] py-3 text-[13px] font-bold border-b-2 transition-colors ${activeTab === 'accounts' ? 'border-[#03C75A] text-[#03C75A]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('accounts')}
            >
              계정별 현황
            </button>
          )}
          <button 
            className={`min-w-[100px] py-3 text-[13px] font-bold border-b-2 transition-colors ${activeTab === 'merchants' ? 'border-[#03C75A] text-[#03C75A]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('merchants')}
          >
            가맹점 관리
          </button>
          <button 
            className={`min-w-[100px] py-3 text-[13px] font-bold border-b-2 transition-colors ${activeTab === 'settings' ? 'border-[#03C75A] text-[#03C75A]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('settings')}
          >
            프로필/담당자
          </button>
          <button 
            className={`min-w-[100px] py-3 text-[13px] font-bold border-b-2 transition-colors ${activeTab === 'audit' ? 'border-[#03C75A] text-[#03C75A]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('audit')}
          >
            변경 이력
          </button>
        </div>
      </div>

      <main className="max-w-3xl mx-auto p-4 pb-20 space-y-4">
        {activeTab === 'accounts' && isAdmin ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="p-5 border-b border-gray-50 bg-gray-50/30">
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#03C75A]" />
                  계정별 영업 현황 (관리자 전용)
                </h2>
              </div>
              
              {usersLoading ? (
                <div className="p-12 text-center text-gray-400">계정 목록을 불러오는 중...</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {userStats.map(u => (
                    <div key={u.id} className="p-5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center text-[#03C75A]">
                          <User className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-900">{u.name}</h3>
                            {u.status === 'pending' && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" /> 승인대기
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="flex gap-4">
                          <div className="text-center">
                            <div className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">가맹점</div>
                            <div className="text-lg font-bold text-gray-900">{u.merchantCount}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] font-black text-[#03C75A] uppercase tracking-tighter">방문 계획</div>
                            <div className="text-lg font-bold text-[#03C75A]">{u.plannedCount}</div>
                          </div>
                        </div>
                        {u.status === 'pending' && approveUser && (
                          <button 
                            onClick={() => approveUser(u.id)}
                            className="px-4 py-2 bg-[#03C75A] text-white text-xs font-bold rounded-lg hover:bg-[#02b351] transition-colors shadow-sm"
                          >
                            승인하기
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'audit' ? (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
               <div className="p-5 border-b border-gray-50 bg-gray-50/30">
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <History className="h-5 w-5 text-[#03C75A]" />
                    데이터 변경 이력
                  </h2>
                  <p className="text-xs text-gray-400 mt-1 uppercase tracking-tight">수정된 주요 항목들의 기록을 실시간으로 확인합니다.</p>
               </div>
               
               {logsLoading ? (
                 <div className="p-12 text-center text-gray-400">데이터를 불러오는 중...</div>
               ) : logs.length === 0 ? (
                 <div className="p-12 text-center text-gray-400 text-sm">기록된 변경 이력이 없습니다.</div>
               ) : (
                 <div className="divide-y divide-gray-50">
                    {logs.map((log) => (
                      <div key={log.id} className="p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-4 mb-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-[13px] font-bold text-gray-900 truncate">
                              [{log.merchantName}]
                            </h3>
                            <div className="flex items-center gap-1.5 mt-1">
                               <User className="h-3 w-3 text-gray-400" />
                               <span className="text-xs text-[#03C75A] font-medium">{log.userEmail}</span>
                            </div>
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono whitespace-nowrap">
                            {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('ko-KR') : '방금 전'}
                          </span>
                        </div>
                        
                        <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-2 border border-gray-100">
                          <div className="flex items-center gap-2">
                             <span className="text-[10px] font-black text-gray-400 uppercase bg-white border border-gray-100 px-1.5 py-0.5 rounded leading-none">COLUMN</span>
                             <span className="text-xs font-bold text-gray-700">{log.fieldName}</span>
                          </div>
                          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                             <div className="min-w-0">
                               <div className="text-[9px] text-gray-400 uppercase font-bold mb-1">PREVIOUS</div>
                               <div className="text-[11px] text-gray-500 bg-white p-2 rounded-lg border border-dashed border-gray-200 line-through truncate">{log.oldValue || '(없음)'}</div>
                             </div>
                             <ArrowLeft className="h-3 w-3 text-gray-300 rotate-180" />
                             <div className="min-w-0">
                               <div className="text-[9px] text-[#03C75A] uppercase font-bold mb-1">NEW VALUE</div>
                               <div className="text-[11px] text-gray-900 bg-white p-2 rounded-lg border border-gray-200 font-bold truncate shadow-sm ring-1 ring-[#03C75A]/10">{log.newValue || '(비워짐)'}</div>
                             </div>
                          </div>
                        </div>
                      </div>
                    ))}
                 </div>
               )}
            </div>
          </div>
        ) : activeTab === 'settings' ? (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-5">
              <h2 className="text-lg font-bold text-gray-900 border-b border-gray-50 pb-3 flex items-center gap-2">
                <User className="h-5 w-5 text-[#03C75A]" />
                사용자 프로필
              </h2>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-tighter ml-1">내 이름</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={editUserName}
                    onChange={e => setEditUserName(e.target.value)}
                    className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl font-bold focus:bg-white transition-colors"
                  />
                  <button 
                    onClick={handleUpdateName}
                    className="px-6 py-3 bg-[#03C75A] text-white rounded-xl font-bold hover:bg-[#02b351] transition-transform active:scale-[0.97]"
                  >
                    이름 저장
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 ml-1">영업 메모나 감사 로그에 남는 본인의 표시 이름입니다.</p>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-5">
              <h2 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3 flex items-center gap-2">
                <Users className="h-5 w-5 text-[#03C75A]" />
                내 담당자(Assignees) 관리
              </h2>
              <div className="flex gap-2 mb-6">
                <input 
                  type="text"
                  value={newAssignee}
                  onChange={e => setNewAssignee(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddAssignee()}
                  placeholder="담당자 이름 입력"
                  className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:bg-white transition-colors"
                />
                <button 
                  onClick={handleAddAssignee}
                  className="px-5 py-3 rounded-xl text-white font-medium flex items-center gap-1 shrink-0"
                  style={{ backgroundColor: N_GREEN }}
                >
                  <Plus className="h-4 w-4" /> 추가
                </button>
              </div>

              <h2 className="text-sm font-bold text-gray-500 mt-6 ml-1">나의 담당자 목록</h2>
              <ul className="space-y-2">
                {assignees.map(name => (
                  <li key={name} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="font-medium text-gray-800">{name}</span>
                    <button 
                      onClick={() => handleDeleteAssignee(name)}
                      className="p-2 text-red-400 hover:text-red-600 transition-colors bg-white rounded-lg shadow-sm"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
                {assignees.length === 0 && (
                  <p className="text-center py-6 text-gray-400 text-sm">등록된 담당자가 없습니다.</p>
                )}
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {!isAddingMerchant && !editingMerchantId && (
              <div className="flex bg-white p-1 rounded-xl shadow-sm border border-gray-100 mb-2">
                <button 
                  onClick={() => setActiveType('CONNECT')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeType === 'CONNECT' ? 'bg-[#03C75A] text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  네이버 커넥트 (VAN)
                </button>
                <button 
                  onClick={() => setActiveType('BOOKING')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeType === 'BOOKING' ? 'bg-[#007AFF] text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  네이버 예약 (Booking)
                </button>
              </div>
            )}

            {!isAddingMerchant && !editingMerchantId && (
              <div className="flex gap-2">
                <button 
                  onClick={handleAddMerchantClick}
                  className="flex-1 py-4 rounded-2xl bg-white shadow-sm border-2 border-dashed border-gray-200 text-gray-500 font-medium flex items-center justify-center gap-2 hover:border-[#03C75A] hover:text-[#03C75A] transition-colors"
                >
                  <Plus className="h-5 w-5" /> 새 가맹점 추가
                </button>
                <div className="flex-1 relative">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    ref={fileInputRef}
                    disabled={isUploading}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                  />
                  <div className={`w-full h-full py-4 rounded-2xl bg-white shadow-sm border-2 border-dashed border-gray-200 text-gray-500 font-medium flex flex-col items-center justify-center gap-2 transition-colors ${isUploading ? 'border-[#03C75A] text-[#03C75A] opacity-100' : 'hover:border-[#03C75A] hover:text-[#03C75A]'}`}>
                    {isUploading ? (
                      <div className="w-full px-6 flex flex-col items-center gap-2">
                        <Upload className={`h-5 w-5 ${uploadStatus === 'complete' ? '' : 'animate-bounce'}`} />
                        <span className="text-xs font-bold">{uploadProgress?.phase || '작업 시작...'}</span>
                        <div className="flex gap-4 text-[10px] text-gray-500">
                          <span className="text-green-600">성공: {uploadProgress?.success}</span>
                          <span className="text-red-500">실패: {uploadProgress?.failed}</span>
                          <span className="text-orange-500">제외: {uploadProgress?.skipped}</span>
                        </div>
                        {uploadProgress && (
                           <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
                             <div className="bg-[#03C75A] h-full rounded-full transition-all duration-200" style={{ width: `${Math.max(5, uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0)}%` }}></div>
                           </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <Upload className="h-5 w-5" />
                        <span className="text-center px-2">
                          {activeType === 'CONNECT' ? '커넥트' : '예약'} CSV 업로드 
                          {useAddressNormalization && <span className="block text-[10px] text-[#03C75A] font-bold mt-1">주소 자동 정제 활성</span>}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {!isAddingMerchant && !editingMerchantId && (
              <div className="bg-gray-50 p-4 rounded-xl text-sm text-gray-600 border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <p className="font-bold text-gray-800">📊 CSV 파일 업로드 양식 안내</p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadTemplate}
                      className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 flex items-center gap-1.5 text-gray-700 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" /> 양식 다운로드
                    </button>
                    <label className="flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={useAddressNormalization} 
                        onChange={e => setUseAddressNormalization(e.target.checked)}
                        className="accent-[#03C75A]"
                      />
                      <span className="text-xs font-bold text-gray-700">주소 자동 정제</span>
                    </label>
                    {useAddressNormalization && (
                      <select
                        value={addressType}
                        onChange={(e) => setAddressType(e.target.value as any)}
                        className="text-xs px-2 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm outline-none focus:ring-1 focus:ring-[#03C75A]"
                      >
                        <option value="road">도로명</option>
                        <option value="jibun">지번</option>
                      </select>
                    )}
                  </div>
                </div>
                <p className="mb-2">첫 번째 행(헤더)이 아래와 정확히 일치해야 합니다 ({activeType === 'CONNECT' ? '커넥트' : '예약'} 양식):</p>
                <code className="block bg-white p-2 rounded border border-gray-200 text-xs font-mono mb-3 overflow-x-auto whitespace-nowrap">
                  {activeType === 'CONNECT' 
                    ? '시트명,VAN사,VAN대리점명,대리점 연락처,식당명,사업자등록번호,주소,담당자,방문일자,방문결과,설치상태,T단말기 설치여부,비고,연락처'
                    : '기준,No.,구분,식당명,주소,플레이스ID,카테고리 1,카테고리 2,카테고리 3,배정 파트,리드 소유자,컨택 단계,비고(컨택 현황),1차 컨택 일자,1차 담당자,2차 컨택 일자,2차 담당자,3차 컨택 일자,3차 담당자,연락처,사업자등록번호'
                  }
                </code>
                <ul className="space-y-1 text-xs list-disc pl-4 mt-2">
                  <li><strong className="text-gray-800">식당명, 주소:</strong> 필수 입력</li>
                  <li><strong className="text-gray-800">방문결과:</strong> 대기중, 대표부재, 재방문필요, 상담희망, 즉시설치, 거절, 불가, 방문실패</li>
                  <li><strong className="text-gray-800">설치상태:</strong> 미설치, 설치예정, 설치완료</li>
                  <li><strong className="text-gray-800">방문일자:</strong> YYYY-MM-DD 형식 권장 (예: 2024-05-04)</li>
                </ul>
              </div>
            )}

            {(isAddingMerchant || editingMerchantId) && (
              <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4 border border-[#03C75A]">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold text-gray-900">{isAddingMerchant ? '가맹점 추가' : '가맹점 수정'}</h2>
                  <div className="px-3 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: editForm.merchantType === 'BOOKING' ? '#007AFF' : '#03C75A' }}>
                    {editForm.merchantType === 'BOOKING' ? '예약' : '커넥트'}
                  </div>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">시트명(그룹)</label>
                    <input type="text" value={editForm.groupName || ''} onChange={e => setEditForm({...editForm, groupName: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="예: 5월 1주차 영업" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">식당명 (필수)</label>
                    <input type="text" value={editForm.name || ''} onChange={e => setEditForm({...editForm, name: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="예: 맛있는 덮밥집" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">주소 (필수)</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={editForm.address || ''} 
                        onChange={e => setEditForm({...editForm, address: e.target.value})} 
                        className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" 
                        placeholder="전체 주소 입력" 
                      />
                      <button
                        onClick={async () => {
                          if (!editForm.address) return;
                          setIsNormalizing(true);
                          try {
                            const normalized = await normalizeAddress(editForm.address, addressType);
                            if (normalized) {
                              setEditForm({ ...editForm, address: normalized });
                            } else {
                              alert('일치하는 주소를 찾을 수 없습니다.');
                            }
                          } catch (err) {
                            alert('정제 중 오류가 발생했습니다.');
                          } finally {
                            setIsNormalizing(false);
                          }
                        }}
                        disabled={isNormalizing}
                        className="px-4 py-3 rounded-xl bg-gray-100 text-gray-700 font-bold text-xs hover:bg-gray-200 transition-colors shrink-0 disabled:opacity-50"
                      >
                        {isNormalizing ? '처리중...' : `${addressType === 'road' ? '도로명' : '지번'}정제`}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">사업자등록번호</label>
                      <input type="text" value={editForm.businessNumber || ''} onChange={e => setEditForm({...editForm, businessNumber: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="예: 123-45-67890" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">연락처</label>
                      <input type="text" value={editForm.contact || ''} onChange={e => setEditForm({...editForm, contact: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="예: 02-1234-5678" />
                    </div>
                  </div>

                  {editForm.merchantType === 'CONNECT' ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">VAN사</label>
                          <input type="text" value={editForm.vanCompany || ''} onChange={e => setEditForm({...editForm, vanCompany: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="예: NICE" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">VAN대리점명</label>
                          <input type="text" value={editForm.vanAgencyName || ''} onChange={e => setEditForm({...editForm, vanAgencyName: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="예: 나이스강남" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">대리점 연락처</label>
                          <input type="text" value={editForm.agencyContact || ''} onChange={e => setEditForm({...editForm, agencyContact: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="예: 02-111-2222" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">담당자</label>
                          <select value={editForm.assignee || ''} onChange={e => setEditForm({...editForm, assignee: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                            <option value="">담당자 선택 안함</option>
                            {assignees.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">설치상태</label>
                          <select value={editForm.installStatus || '미설치'} onChange={e => setEditForm({...editForm, installStatus: e.target.value as any})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                            <option value="미설치">미설치</option>
                            <option value="설치예정">설치예정</option>
                            <option value="설치완료">설치완료</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">T단말기 여부</label>
                          <select value={editForm.tTerminalInstalled || ''} onChange={e => setEditForm({...editForm, tTerminalInstalled: e.target.value as any})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                            <option value="">선택 안함</option>
                            <option value="설치">설치됨</option>
                            <option value="미설치">미설치</option>
                            <option value="모름">모름</option>
                          </select>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">기준</label>
                          <input type="text" value={editForm.criteria || ''} onChange={e => setEditForm({...editForm, criteria: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="기준" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">No.</label>
                          <input type="text" value={editForm.no || ''} onChange={e => setEditForm({...editForm, no: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="No." />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">구분</label>
                          <input type="text" value={editForm.classification || ''} onChange={e => setEditForm({...editForm, classification: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="구분" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">플레이스 ID</label>
                          <input type="text" value={editForm.placeId || ''} onChange={e => setEditForm({...editForm, placeId: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="예: 12345678" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">카테고리 1</label>
                          <input type="text" value={editForm.category || ''} onChange={e => setEditForm({...editForm, category: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="카테고리 1" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">카테고리 2</label>
                          <input type="text" value={editForm.category2 || ''} onChange={e => setEditForm({...editForm, category2: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="카테고리 2" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">카테고리 3</label>
                          <input type="text" value={editForm.category3 || ''} onChange={e => setEditForm({...editForm, category3: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="카테고리 3" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">배정 파트</label>
                          <input type="text" value={editForm.assignedPart || ''} onChange={e => setEditForm({...editForm, assignedPart: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="배정 파트" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">리드 소유자</label>
                          <input type="text" value={editForm.leadOwner || ''} onChange={e => setEditForm({...editForm, leadOwner: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="리드 소유자" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">컨택 단계</label>
                          <input type="text" value={editForm.contactStage || ''} onChange={e => setEditForm({...editForm, contactStage: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="컨택 단계" />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">담당자</label>
                          <select value={editForm.assignee || ''} onChange={e => setEditForm({...editForm, assignee: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                            <option value="">담당자 선택 안함</option>
                            {assignees.map(a => <option key={a} value={a}>{a}</option>)}
                          </select>
                        </div>
                      </div>

                      <div className="bg-blue-50/50 p-4 rounded-2xl space-y-3">
                        <h3 className="text-xs font-bold text-blue-800">성공 컨택 이력</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-blue-600 mb-1 block">1차 성공 일자</label>
                            <input type="date" value={editForm.firstContactDate || ''} onChange={e => setEditForm({...editForm, firstContactDate: e.target.value})} className="w-full p-2 bg-white border border-blue-100 rounded-lg text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-blue-600 mb-1 block">1차 담당자</label>
                            <input type="text" value={editForm.firstContactAssignee || ''} onChange={e => setEditForm({...editForm, firstContactAssignee: e.target.value})} className="w-full p-2 bg-white border border-blue-100 rounded-lg text-xs" placeholder="담당자" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-blue-600 mb-1 block">2차 성공 일자</label>
                            <input type="date" value={editForm.secondContactDate || ''} onChange={e => setEditForm({...editForm, secondContactDate: e.target.value})} className="w-full p-2 bg-white border border-blue-100 rounded-lg text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-blue-600 mb-1 block">2차 담당자</label>
                            <input type="text" value={editForm.secondContactAssignee || ''} onChange={e => setEditForm({...editForm, secondContactAssignee: e.target.value})} className="w-full p-2 bg-white border border-blue-100 rounded-lg text-xs" placeholder="담당자" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] font-bold text-blue-600 mb-1 block">3차 성공 일자</label>
                            <input type="date" value={editForm.thirdContactDate || ''} onChange={e => setEditForm({...editForm, thirdContactDate: e.target.value})} className="w-full p-2 bg-white border border-blue-100 rounded-lg text-xs" />
                          </div>
                          <div>
                            <label className="text-[10px] font-bold text-blue-600 mb-1 block">3차 담당자</label>
                            <input type="text" value={editForm.thirdContactAssignee || ''} onChange={e => setEditForm({...editForm, thirdContactAssignee: e.target.value})} className="w-full p-2 bg-white border border-blue-100 rounded-lg text-xs" placeholder="담당자" />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <div>
                          <label className="text-xs font-medium text-gray-500 mb-1 block">예약 활성화 상태</label>
                          <input type="text" value={editForm.bookingStatus || ''} onChange={e => setEditForm({...editForm, bookingStatus: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="예: 활성/비활성" />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                       <label className="text-xs font-medium text-gray-500 mb-1 block">방문일자</label>
                       <input type="date" value={editForm.visitDate?.substring(0, 10) || ''} onChange={e => setEditForm({...editForm, visitDate: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    </div>
                    <div>
                       <label className="text-xs font-medium text-gray-500 mb-1 block">방문결과</label>
                       <select value={editForm.visitResult || '대기중'} onChange={e => setEditForm({...editForm, visitResult: e.target.value as any})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                         <option value="대기중">대기중</option>
                         <option value="대표부재">대표부재</option>
                         <option value="재방문필요">재방문필요</option>
                         <option value="상담희망">상담희망</option>
                         <option value="즉시설치">즉시설치</option>
                         <option value="기사용">기사용</option>
                         <option value="거절">거절</option>
                         <option value="불가">불가</option>
                         <option value="방문실패">방문실패</option>
                       </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 mb-1 block">비고</label>
                    <textarea value={editForm.notes || ''} onChange={e => setEditForm({...editForm, notes: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="상담 내역 등을 입력하세요" rows={3}></textarea>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button onClick={handleSaveMerchant} className="flex-1 py-3 text-white font-medium rounded-xl flex items-center justify-center gap-1" style={{ backgroundColor: N_GREEN }}>
                      <Check className="h-4 w-4" /> 저장
                    </button>
                    <button onClick={() => { setIsAddingMerchant(false); setEditingMerchantId(null); }} className="flex-1 py-3 bg-gray-100 text-gray-600 font-medium rounded-xl flex items-center justify-center gap-1 hover:bg-gray-200">
                      <X className="h-4 w-4" /> 취소
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!isAddingMerchant && !editingMerchantId && (
              <div className="space-y-6">
                {sortedGroupKeys.map(group => (
                  <div key={`group-${group}`} className="space-y-3">
                    <div className="flex items-center justify-between px-2 py-1 border-b border-gray-100">
                      <h3 className="text-[13px] font-bold text-gray-800 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-400" />
                        {group}
                        <span className="text-gray-400 font-medium ml-1">({groupedMerchants[group].length}곳)</span>
                      </h3>
                      <button 
                        onClick={() => handleDeleteGroup(group)}
                        className="text-xs text-red-500 hover:text-red-600 font-medium px-2 py-1 rounded bg-red-50 hover:bg-red-100 transition-colors"
                      >
                        그룹삭제
                      </button>
                    </div>
                    <div className="space-y-3">
                      {groupedMerchants[group].map((m) => (
                        <div key={`merchant-${m.id}`} className="bg-white rounded-2xl p-4 shadow-sm space-y-2 relative overflow-hidden">
                          <div className={`absolute top-0 right-0 w-1.5 h-full ${m.merchantType === 'BOOKING' ? 'bg-[#007AFF]' : 'bg-[#03C75A]'}`}></div>
                          <div className="flex justify-between items-start">
                            <div className="pr-12">
                              <div className="flex items-center gap-2 mb-1">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${m.merchantType === 'BOOKING' ? 'bg-[#007AFF]/10 text-[#007AFF]' : 'bg-[#03C75A]/10 text-[#03C75A]'}`}>
                                  {m.merchantType === 'BOOKING' ? '예약' : '커넥트'}
                                </span>
                                <h3 className="font-bold text-gray-900 leading-tight">{m.name}</h3>
                              </div>
                              <p className="text-xs text-gray-500">{m.address}</p>
                              <div className="flex flex-wrap gap-2 mt-1.5">
                                {m.contact && <span className="text-[10px] text-gray-400">{m.contact}</span>}
                                {m.merchantType === 'BOOKING' && m.category && (
                                  <span className="text-[10px] font-medium bg-blue-50 text-blue-600 px-1 py-0.5 rounded">{m.category}</span>
                                )}
                                {m.merchantType === 'BOOKING' && m.contactStage && (
                                  <span className="text-[10px] font-bold bg-orange-50 text-orange-600 px-1 py-0.5 rounded border border-orange-100">{m.contactStage}</span>
                                )}
                                {m.assignee && (
                                  <span className="text-[10px] font-medium text-gray-600 bg-gray-50 px-1 py-0.5 rounded border border-gray-100">담당: {m.assignee}</span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                              <button 
                                onClick={() => { setEditingMerchantId(m.id); setEditForm(m); setIsAddingMerchant(false); }}
                                className="p-2 text-gray-400 bg-gray-50 rounded-lg hover:text-gray-700"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteMerchantClick(m.id)}
                                className="p-2 text-red-400 bg-red-50 rounded-lg hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
      
      {/* Scroll to Top */}
      <button 
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="fixed bottom-6 right-6 z-50 bg-gray-800 text-white p-3 rounded-full shadow-xl hover:bg-gray-700 transition-colors"
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </div>
  );
}
