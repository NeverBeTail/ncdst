import React, { useState, useRef } from 'react';
import { Merchant, InstallStatus } from './types';
import { ArrowLeft, Plus, Trash2, Edit2, Check, X, Upload, Save, Link as LinkIcon, RefreshCw, Download, FileText } from 'lucide-react';
import Papa from 'papaparse';

const N_GREEN = '#03C75A';

interface AdminProps {
  merchants: Merchant[];
  assignees: string[];
  addMerchant: (m: Omit<Merchant, 'id'>) => Promise<void>;
  addMerchants: (m: Omit<Merchant, 'id'>[]) => Promise<void>;
  updateMerchant: (id: string, m: Partial<Omit<Merchant, 'id'>>) => Promise<void>;
  deleteMerchant: (id: string) => Promise<void>;
  deleteMerchants: (ids: string[]) => Promise<void>;
  updateAssignees: (a: string[]) => Promise<void>;
  onClose: () => void;
}

export default function Admin({ merchants, assignees, addMerchant, addMerchants, updateMerchant, deleteMerchant, deleteMerchants, updateAssignees, onClose }: AdminProps) {
  const [activeTab, setActiveTab] = useState<'merchants' | 'settings'>('merchants');
  
  // Settings states
  const [newAssignee, setNewAssignee] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Merchant states
  const [editingMerchantId, setEditingMerchantId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Merchant>>({});
  const [isAddingMerchant, setIsAddingMerchant] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const fileName = file.name.replace(/\.[^/.]+$/, "");

    setIsUploading(true);
    setUploadProgress(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        let successCount = 0;
        const totalRows = results.data.length;
        setUploadProgress({ current: 0, total: totalRows });
        
        const newMerchantsData: Omit<Merchant, 'id'>[] = [];
        for (let i = 0; i < totalRows; i++) {
          const row = results.data[i] as any;
          const name = row['식당명'] || row['가맹점명'] || row['name'];
          const address = row['주소'] || row['address'];
          if (!name || !address) {
            setUploadProgress({ current: i + 1, total: totalRows });
            continue; // Skip if mandatory fields are missing
          }
          
          const visitResultMap = ['대기중', '대표부재', '재방문필요', '대리점상담희망', '즉시설치', '거절', '불가', '방문실패', ''];
          const installStatusMap = ['미설치', '설치예정', '설치완료', ''];
          const tTerminalMap = ['설치', '미설치', '모름', ''];

          const visitResult = visitResultMap.includes(row['방문결과']?.trim()) ? row['방문결과'].trim() : '대기중';
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
            // Check if it's a date
            const dateParsed = Date.parse(installCellVal);
            if (!isNaN(dateParsed)) {
              installStatus = '설치완료';
              installDate = new Date(dateParsed).toISOString().substring(0, 10);
            } else {
              installStatus = '미설치';
            }
          }

          const tTerminalInstalled = tTerminalMap.includes(row['T단말기 설치여부']?.trim()) ? row['T단말기 설치여부'].trim() : '';

          const newM: Omit<Merchant, 'id'> = {
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
          newMerchantsData.push(newM);
          successCount++;
          setUploadProgress({ current: i + 1, total: totalRows });
        }
        
        try {
          await addMerchants(newMerchantsData);
          alert(`${successCount}개의 가맹점이 성공적으로 업로드되었습니다.`);
        } catch(err) {
          console.error("Error adding merchants", err);
          alert('가맹점 등록 중 오류가 발생했습니다. 권한이나 데이터 형식을 확인해주세요.');
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
        setIsUploading(false);
        setUploadProgress(null);
      },
      error: (error: Error) => {
        console.error(error);
        alert('CSV 파일 파싱 중 오류가 발생했습니다.');
        setIsUploading(false);
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
      alert("추가 실패: " + err.message);
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
    const headers = '시트명,VAN사,VAN대리점명,대리점 연락처,식당명,사업자등록번호,주소,담당자,방문일자,방문결과,설치상태,T단말기 설치여부,비고,연락처\n';
    const blob = new Blob(['\uFEFF' + headers], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'npay_merchant_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddMerchantClick = () => {
    setIsAddingMerchant(true);
    setEditForm({
      groupName: '',
      vanCompany: '',
      vanAgencyName: '',
      agencyContact: '',
      name: '',
      businessNumber: '',
      address: '',
      contact: '',
      assignee: '',
      visitDate: '',
      visitResult: '대기중',
      installStatus: '미설치',
      installDate: '',
      tTerminalInstalled: '',
      notes: ''
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
        groupName: editForm.groupName || '',
        vanCompany: editForm.vanCompany || '',
        vanAgencyName: editForm.vanAgencyName || '',
        agencyContact: editForm.agencyContact || '',
        name: editForm.name || '',
        businessNumber: editForm.businessNumber || '',
        address: editForm.address || '',
        contact: editForm.contact || '',
        assignee: editForm.assignee || '',
        visitDate: editForm.visitDate || '',
        visitResult: editForm.visitResult || '대기중',
        installStatus: editForm.installStatus || '미설치',
        installDate: editForm.installDate || '',
        tTerminalInstalled: editForm.tTerminalInstalled || '',
        notes: editForm.notes || ''
      };
      await addMerchant(newM);
    } else if (editingMerchantId) {
      const { id, createdAt, updatedAt, ...updates } = editForm as any; // Strip internal/id fields
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
        await deleteMerchants(groupMerchants.map(m => m.id));
      }
    });
  };

  const groupedMerchants = merchants.reduce((acc, current) => {
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
                onClick={() => {
                  confirmDialog.onConfirm();
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
        <div className="flex px-4 max-w-3xl mx-auto">
          <button 
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'merchants' ? 'border-[#03C75A] text-[#03C75A]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('merchants')}
          >
            가맹점 관리
          </button>
          <button 
            className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'settings' ? 'border-[#03C75A] text-[#03C75A]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => setActiveTab('settings')}
          >
            환경설정 & 연동
          </button>
        </div>
      </div>

      <main className="max-w-3xl mx-auto p-4 pb-20 space-y-4">
        {activeTab === 'settings' ? (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm p-5 space-y-5">
              <h2 className="text-lg font-bold text-gray-900">담당자 추가</h2>
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

              <h2 className="text-lg font-bold text-gray-900 mt-6 pt-4 border-t border-gray-100">담당자 목록</h2>
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
                        <Upload className="h-5 w-5 animate-bounce" />
                        <span className="text-xs">업로드 중... {uploadProgress ? `(${uploadProgress.current}/${uploadProgress.total})` : ''}</span>
                        {uploadProgress && (
                           <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
                             <div className="bg-[#03C75A] h-full rounded-full transition-all duration-200" style={{ width: `${Math.max(5, uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0)}%` }}></div>
                           </div>
                        )}
                      </div>
                    ) : (
                      <>
                        <Upload className="h-5 w-5" />
                        <span>CSV 파일 업로드</span>
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
                  <button
                    onClick={handleDownloadTemplate}
                    className="text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 flex items-center gap-1.5 text-gray-700 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" /> 양식 다운로드
                  </button>
                </div>
                <p className="mb-2">첫 번째 행(헤더)이 아래와 정확히 일치해야 합니다 (시트명 컬럼은 선택적이며 없으면 파일명 사용):</p>
                <code className="block bg-white p-2 rounded border border-gray-200 text-xs font-mono mb-3 overflow-x-auto whitespace-nowrap">
                  시트명,VAN사,VAN대리점명,대리점 연락처,식당명,사업자등록번호,주소,담당자,방문일자,방문결과,설치상태,T단말기 설치여부,비고,연락처
                </code>
                <ul className="space-y-1 text-xs list-disc pl-4 mt-2">
                  <li><strong className="text-gray-800">식당명, 주소:</strong> 필수 입력</li>
                  <li><strong className="text-gray-800">방문결과:</strong> 대기중, 대표부재, 재방문필요, 대리점상담희망, 즉시설치, 거절, 불가, 방문실패</li>
                  <li><strong className="text-gray-800">설치상태:</strong> 미설치, 설치예정, 설치완료</li>
                  <li><strong className="text-gray-800">방문일자:</strong> YYYY-MM-DD 형식 권장 (예: 2024-05-04)</li>
                </ul>
              </div>
            )}

            {(isAddingMerchant || editingMerchantId) && (
              <div className="bg-white rounded-2xl shadow-sm p-5 space-y-4 border border-[#03C75A]">
                <h2 className="text-lg font-bold text-gray-900">{isAddingMerchant ? '가맹점 추가' : '가맹점 수정'}</h2>
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
                    <input type="text" value={editForm.address || ''} onChange={e => setEditForm({...editForm, address: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" placeholder="전체 주소 입력" />
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
                       <label className="text-xs font-medium text-gray-500 mb-1 block">방문일자</label>
                       <input type="date" value={editForm.visitDate?.substring(0, 10) || ''} onChange={e => setEditForm({...editForm, visitDate: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                    </div>
                    <div>
                       <label className="text-xs font-medium text-gray-500 mb-1 block">방문결과</label>
                       <select value={editForm.visitResult || '대기중'} onChange={e => setEditForm({...editForm, visitResult: e.target.value as any})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                         <option value="대기중">대기중</option>
                         <option value="대표부재">대표부재</option>
                         <option value="재방문필요">재방문필요</option>
                         <option value="대리점상담희망">대리점상담희망</option>
                         <option value="즉시설치">즉시설치</option>
                         <option value="거절">거절</option>
                         <option value="불가">불가</option>
                         <option value="방문실패">방문실패</option>
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
                    {editForm.installStatus === '설치완료' && (
                      <div>
                        <label className="text-xs font-medium text-gray-500 mb-1 block">설치완료일자</label>
                        <input type="date" value={editForm.installDate || ''} onChange={e => setEditForm({...editForm, installDate: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm" />
                      </div>
                    )}
                    <div>
                       <label className="text-xs font-medium text-gray-500 mb-1 block">T단말기 여부</label>
                       <select value={editForm.tTerminalInstalled || ''} onChange={e => setEditForm({...editForm, tTerminalInstalled: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                         <option value="">선택 안함</option>
                         <option value="설치">설치됨</option>
                         <option value="미설치">미설치</option>
                         <option value="모름">모름</option>
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
                        <div key={`merchant-${m.id}`} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="font-bold text-gray-900">{m.name}</h3>
                              <p className="text-xs text-gray-500 mt-0.5">{m.address}</p>
                              {m.contact && <p className="text-xs text-gray-400 mt-0.5">{m.contact}</p>}
                            </div>
                            <div className="flex gap-1.5">
                              <button 
                                onClick={() => { setEditingMerchantId(m.id); setEditForm(m); setIsAddingMerchant(false); }}
                                className="p-2 text-gray-400 bg-gray-50 rounded-lg shrink-0 hover:text-gray-700"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteMerchantClick(m.id)}
                                className="p-2 text-red-400 bg-red-50 rounded-lg shrink-0 hover:text-red-600"
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
    </div>
  );
}
