import React, { useState, useMemo, useEffect } from 'react';
import { 
  Camera, 
  Aperture, 
  Lightbulb, 
  Mic, 
  Plus, 
  Search, 
  Trash2, 
  X,
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  LogOut,
  LogIn,
  Edit,
  LayoutGrid,
  Triangle,
  MoreHorizontal,
  Wand2,
  User,
  History,
  Loader2,
  Wifi,
  WifiOff,
  List,
  Download
} from 'lucide-react';

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

// 환경 변수 및 하드코딩 폴백을 안전하게 가져오는 헬퍼 함수
const getEnv = (key, fallback) => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
      return import.meta.env[key];
    }
  } catch (e) {
    // 환경 변수를 불러올 수 없는 경우 무시
  }
  return fallback;
};

// Firebase 설정 (Vercel 환경변수를 우선 적용하고, 없으면 제공해주신 키 사용)
let firebaseConfig;
if (typeof __firebase_config !== 'undefined') {
  firebaseConfig = JSON.parse(__firebase_config);
} else {
  firebaseConfig = {
    apiKey: getEnv('VITE_FIREBASE_API_KEY', "AIzaSyAw_hDTzzOXhbHpzIcZ4f58XYSZDa2u_cE"),
    authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN', "shooting-gear-manger.firebaseapp.com"),
    projectId: getEnv('VITE_FIREBASE_PROJECT_ID', "shooting-gear-manger"),
    storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET', "shooting-gear-manger.firebasestorage.app"),
    messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID', "668298898658"),
    appId: getEnv('VITE_FIREBASE_APP_ID', "1:668298898658:web:69c5f84554775d8f48c2bb"),
  };
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 데이터베이스 구조를 위한 고유 ID
const DB_APP_ID = typeof __app_id !== 'undefined' ? __app_id : "gear-manager-app"; 

// Cloudinary 설정
const CLOUDINARY_CLOUD_NAME = getEnv('VITE_CLOUDINARY_CLOUD_NAME', "dwjkpawch");
const CLOUDINARY_UPLOAD_PRESET = getEnv('VITE_CLOUDINARY_UPLOAD_PRESET', "shooting_gear");

// 카테고리 설정
const CATEGORIES = [
  { name: '전체', icon: LayoutGrid },
  { name: '카메라바디', icon: Camera },
  { name: '카메라렌즈', icon: Aperture },
  { name: '조명', icon: Lightbulb },
  { name: '삼각대', icon: Triangle },
  { name: '음향장비', icon: Mic },
  { name: '특수장비', icon: Wand2 },
  { name: '기타', icon: MoreHorizontal },
];

const STATUS_OPTIONS = ['대여가능', '사용중', '수리중'];

const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 이미지 압축 유틸리티 함수
const compressImage = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpeg", {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        }, 'image/jpeg', 0.7);
      };
    };
  });
};

const Package = (props) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.27 6.96 8.73 5.04 8.73-5.04"/><path d="M12 22.08V12"/></svg>
);

export default function App() {
  const [equipmentList, setEquipmentList] = useState([]);
  const [logs, setLogs] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [uploadErrorMsg, setUploadErrorMsg] = useState("");
  
  const [activeCategory, setActiveCategory] = useState('전체');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [checkoutItem, setCheckoutItem] = useState(null);
  const [checkoutUser, setCheckoutUser] = useState('');
  const [enlargedImage, setEnlargedImage] = useState(null);

  const [formData, setFormData] = useState({
    mgmtNum: '',
    name: '',
    category: '카메라바디',
    status: '대여가능',
    notes: '',
    imageUrl: null,
    currentUser: ''
  });

  // 누구나 접근할 수 있도록 인증 처리
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 데이터 동기화
  useEffect(() => {
    if (!user) return;

    const equipRef = collection(db, 'artifacts', DB_APP_ID, 'public', 'data', 'equipment');
    const unsubEquip = onSnapshot(equipRef, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      setEquipmentList(data);
      setIsConnected(true);
    }, (err) => {
      console.error(err);
      setIsConnected(false);
    });

    const logsRef = collection(db, 'artifacts', DB_APP_ID, 'public', 'data', 'logs');
    const unsubLogs = onSnapshot(logsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      data.sort((a, b) => Number(b.id) - Number(a.id));
      setLogs(data);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => {
      unsubEquip();
      unsubLogs();
    };
  }, [user]);

  // 백업 기능: 엑셀(CSV) 다운로드 함수
  const handleExportCSV = () => {
    const BOM = "\uFEFF";
    const headers = ['관리번호', '카테고리', '장비명', '상태', '현재사용자', '특이사항(메모)'];
    
    const csvRows = [headers.join(',')];

    filteredEquipment.forEach(item => {
      const row = [
        `"${String(item.mgmtNum).toLowerCase().replace(/"/g, '""')}"`,
        `"${String(item.category).replace(/"/g, '""')}"`,
        `"${String(item.name).replace(/"/g, '""')}"`,
        `"${String(item.status).replace(/"/g, '""')}"`,
        `"${String(item.currentUser || '').replace(/"/g, '""')}"`,
        `"${String(item.notes || '').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    });

    const csvContent = BOM + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `장비관리대장_${formatDate(new Date()).replace(/[:. ]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Cloudinary 이미지 압축 및 업로드
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploadingImage(true);
    setUploadErrorMsg("");

    try {
      const compressedFile = await compressImage(file);

      const uploadData = new FormData();
      uploadData.append('file', compressedFile);
      uploadData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

      const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'POST',
        body: uploadData,
      });
      
      const data = await response.json();
      
      if (data.secure_url) {
        setFormData({ ...formData, imageUrl: data.secure_url });
      } else {
        throw new Error(data.error?.message || "업로드 응답 오류");
      }
    } catch (error) {
      console.error("이미지 업로드 실패:", error);
      setUploadErrorMsg("이미지 업로드에 실패했습니다. (Cloudinary Preset 설정을 확인해주세요)");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    if (!user) return;
    const itemToUpdate = equipmentList.find(i => i.id === id);
    if (!itemToUpdate) return;

    const now = formatDate(new Date());

    if (itemToUpdate.status === '사용중' && (newStatus === '대여가능' || newStatus === '수리중')) {
      const activeLog = logs.find(log => log.equipmentId === id && log.returnDate === null);
      if (activeLog) {
        await setDoc(doc(db, 'artifacts', DB_APP_ID, 'public', 'data', 'logs', activeLog.id.toString()), { 
          ...activeLog, 
          returnDate: now 
        });
      }
    }

    const resetUser = (newStatus === '대여가능' || newStatus === '수리중') ? '' : itemToUpdate.currentUser;
    await setDoc(doc(db, 'artifacts', DB_APP_ID, 'public', 'data', 'equipment', id.toString()), { 
      ...itemToUpdate, 
      status: newStatus, 
      currentUser: resetUser 
    });
  };

  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (!user || !checkoutUser.trim()) return;
    
    const now = formatDate(new Date());
    const newLogId = Date.now().toString();

    const newLog = {
      id: newLogId,
      equipmentId: checkoutItem.id,
      mgmtNum: checkoutItem.mgmtNum,
      equipmentName: checkoutItem.name,
      userName: checkoutUser,
      checkoutDate: now,
      returnDate: null
    };
    
    await setDoc(doc(db, 'artifacts', DB_APP_ID, 'public', 'data', 'logs', newLogId), newLog);
    await setDoc(doc(db, 'artifacts', DB_APP_ID, 'public', 'data', 'equipment', checkoutItem.id.toString()), { 
      ...checkoutItem, 
      status: '사용중', 
      currentUser: checkoutUser 
    });

    setCheckoutItem(null);
    setCheckoutUser('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !formData.mgmtNum || !formData.name) return;

    const now = formatDate(new Date());

    if (editingItem) {
      const oldItem = equipmentList.find(i => i.id === editingItem.id);
      
      if (oldItem.status === '사용중' && formData.status !== '사용중') {
        const activeLog = logs.find(log => log.equipmentId === editingItem.id && log.returnDate === null);
        if (activeLog) {
          await setDoc(doc(db, 'artifacts', DB_APP_ID, 'public', 'data', 'logs', activeLog.id.toString()), { ...activeLog, returnDate: now });
        }
      } else if (oldItem.status !== '사용중' && formData.status === '사용중') {
        const newLogId = Date.now().toString();
        await setDoc(doc(db, 'artifacts', DB_APP_ID, 'public', 'data', 'logs', newLogId), {
          id: newLogId,
          equipmentId: oldItem.id,
          mgmtNum: formData.mgmtNum,
          equipmentName: formData.name,
          userName: formData.currentUser || '관리자 강제 변경',
          checkoutDate: now,
          returnDate: null
        });
      }
      
      await setDoc(doc(db, 'artifacts', DB_APP_ID, 'public', 'data', 'equipment', editingItem.id.toString()), { ...formData, id: editingItem.id });
    } else {
      const newItemId = Date.now().toString();
      await setDoc(doc(db, 'artifacts', DB_APP_ID, 'public', 'data', 'equipment', newItemId), { ...formData, id: newItemId });
    }
    handleCloseModal();
  };

  const confirmDelete = async () => {
    if (!user || !itemToDelete) return;
    try {
      await deleteDoc(doc(db, 'artifacts', DB_APP_ID, 'public', 'data', 'equipment', itemToDelete.id.toString()));
      setItemToDelete(null);
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingItem(null);
    setUploadErrorMsg("");
    setFormData({ mgmtNum: '', name: '', category: '카메라바디', status: '대여가능', notes: '', imageUrl: null, currentUser: '' });
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setUploadErrorMsg("");
    setFormData({ ...item, notes: item.notes || '', imageUrl: item.imageUrl || null, currentUser: item.currentUser || '' });
    setIsModalOpen(true);
  };

  // 장비 필터링 및 관리번호(mgmtNum) 순 정렬
  const filteredEquipment = useMemo(() => {
    const filtered = equipmentList.filter(item => {
      const matchCategory = activeCategory === '전체' || item.category === activeCategory;
      const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          item.mgmtNum.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });

    // 숫자 값을 인식하여 자연스러운 순서로 오름차순 정렬 (예: cam-2가 cam-10보다 앞으로 오도록 처리)
    return filtered.sort((a, b) => 
      String(a.mgmtNum).toLowerCase().localeCompare(String(b.mgmtNum).toLowerCase(), undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [equipmentList, activeCategory, searchQuery]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-gray-500 font-medium">실시간 데이터베이스 연결 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Camera className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">촬영장비 통합관리</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isConnected ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 uppercase">
                    <Wifi className="w-2.5 h-2.5" /> 공유 중
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-red-500 uppercase">
                    <WifiOff className="w-2.5 h-2.5" /> 오프라인
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsLogModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-all text-sm font-semibold"
            >
              <History className="w-4 h-4" /> <span className="hidden sm:inline">기록</span>
            </button>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-all shadow-md text-sm font-bold"
            >
              <Plus className="w-4 h-4" /> <span className="hidden sm:inline">등록</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto px-4 py-6 w-full">
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="relative group flex-1 w-full max-w-xl">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
              <input 
                type="text" 
                placeholder="장비명 또는 관리번호로 검색하세요" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all shadow-sm bg-white"
              />
            </div>
            
            <div className="flex items-center bg-gray-200/60 p-1.5 rounded-2xl w-full sm:w-auto">
              <button 
                onClick={() => setViewMode('grid')} 
                className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${viewMode === 'grid' ? 'bg-white shadow-md text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <LayoutGrid className="w-4 h-4"/> 카드 뷰
              </button>
              <button 
                onClick={() => setViewMode('list')} 
                className={`flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${viewMode === 'list' ? 'bg-white shadow-md text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <List className="w-4 h-4"/> 관리대장
              </button>
            </div>
          </div>

          <div className="flex overflow-x-auto pb-2 gap-2 scrollbar-hide touch-pan-x">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.name;
              return (
                <button
                  key={cat.name}
                  onClick={() => setActiveCategory(cat.name)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl whitespace-nowrap transition-all border text-sm font-bold
                    ${isActive 
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-200 scale-105' 
                      : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-300 hover:text-indigo-600'
                    }`}
                >
                  <Icon className="w-4 h-4" /> {cat.name}
                </button>
              )
            })}
          </div>
        </div>

        {filteredEquipment.length > 0 ? (
          viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEquipment.map((item) => (
                <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-all group flex flex-col relative">
                  <div className="h-44 w-full bg-gray-100 relative overflow-hidden shrink-0 flex items-center justify-center">
                    {item.imageUrl ? (
                      <img 
                        src={item.imageUrl} 
                        alt={item.name} 
                        onClick={() => setEnlargedImage(item.imageUrl)}
                        className="w-full h-full object-contain cursor-pointer group-hover:scale-105 transition-transform duration-500 p-2" 
                      />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full text-gray-300 bg-gradient-to-br from-gray-50 to-gray-100">
                        <ImageIcon className="w-12 h-12" />
                      </div>
                    )}
                    <div className="absolute top-3 left-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border bg-white/90 backdrop-blur-sm shadow-sm
                        ${item.status === '대여가능' ? 'text-emerald-600 border-emerald-200' : 
                          item.status === '사용중' ? 'text-blue-600 border-blue-200' : 'text-red-600 border-red-200'}`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="absolute top-3 right-3 flex gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity z-10">
                      <button onClick={(e) => { e.stopPropagation(); openEditModal(item); }} className="p-2.5 bg-white/90 backdrop-blur-sm rounded-full text-gray-700 hover:text-indigo-600 shadow-md transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setItemToDelete(item); }} className="p-2.5 bg-white/90 backdrop-blur-sm rounded-full text-gray-700 hover:text-red-600 shadow-md transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-black text-indigo-600 tracking-tight bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100">
                        {String(item.mgmtNum).toLowerCase()}
                      </span>
                      <span className="text-xs text-gray-400 font-medium">{item.category}</span>
                    </div>
                    <h3 className="text-base font-bold text-gray-900 mb-3 truncate">{item.name}</h3>
                    
                    {item.status === '사용중' && item.currentUser && (
                      <div className="bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2.5 flex items-center gap-2 mb-4 animate-pulse-subtle">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                          <User className="w-3.5 h-3.5 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-[10px] text-blue-500 font-bold uppercase tracking-tight">현재 대여자</p>
                          <p className="text-sm font-bold text-blue-900 leading-none">{item.currentUser}</p>
                        </div>
                      </div>
                    )}

                    {item.notes && !item.currentUser && (
                      <p className="text-xs text-gray-500 line-clamp-2 mb-4 min-h-[2rem] bg-gray-50 p-2 rounded-lg italic">
                        "{item.notes}"
                      </p>
                    )}

                    <div className="mt-auto pt-4 flex gap-2">
                      {item.status === '대여가능' && (
                        <button onClick={() => setCheckoutItem(item)} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 text-white py-2.5 rounded-xl font-bold hover:bg-indigo-700 transition-all text-xs">
                          <LogOut className="w-4 h-4" /> 반출하기
                        </button>
                      )}
                      {item.status === '사용중' && (
                        <button onClick={() => handleStatusChange(item.id, '대여가능')} className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-white py-2.5 rounded-xl font-bold hover:bg-emerald-600 transition-all text-xs">
                          <LogIn className="w-4 h-4" /> 반입 완료
                        </button>
                      )}
                      {item.status === '수리중' && (
                        <button onClick={() => handleStatusChange(item.id, '대여가능')} className="flex-1 flex items-center justify-center gap-2 bg-gray-800 text-white py-2.5 rounded-xl font-bold hover:bg-black transition-all text-xs">
                          <CheckCircle2 className="w-4 h-4" /> 수리 완료
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex-1">
              <div className="flex justify-between items-center p-5 border-b bg-gray-50/50">
                <h2 className="font-bold text-gray-800 flex items-center gap-2"><List className="w-5 h-5 text-indigo-500"/> 장비 목록 대장</h2>
                <button onClick={handleExportCSV} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-colors">
                  <Download className="w-4 h-4"/> 엑셀 백업
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 text-gray-500 font-bold border-b text-xs uppercase tracking-wider">
                    <tr>
                      <th className="p-4 pl-6">관리번호</th>
                      <th className="p-4">카테고리</th>
                      <th className="p-4">장비명</th>
                      <th className="p-4">상태</th>
                      <th className="p-4">현재 사용자</th>
                      <th className="p-4">특이사항 (메모)</th>
                      <th className="p-4 pr-6 text-center">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredEquipment.map(item => (
                      <tr key={String(item.id)} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="p-4 pl-6 font-mono text-indigo-600 font-black text-sm">{String(item.mgmtNum).toLowerCase()}</td>
                        <td className="p-4 text-gray-600 font-medium">{String(item.category)}</td>
                        <td className="p-4 font-bold text-gray-900">{String(item.name)}</td>
                        <td className="p-4">
                           <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border
                              ${item.status === '대여가능' ? 'text-emerald-600 border-emerald-100 bg-emerald-50' : 
                                item.status === '사용중' ? 'text-blue-600 border-blue-100 bg-blue-50' : 'text-red-600 border-red-100 bg-red-50'}`}>
                              {String(item.status)}
                            </span>
                        </td>
                        <td className="p-4 font-bold text-gray-700">{item.currentUser ? String(item.currentUser) : '-'}</td>
                        <td className="p-4 text-gray-500 max-w-xs truncate" title={item.notes ? String(item.notes) : ''}>
                          {item.notes ? String(item.notes) : '-'}
                        </td>
                        <td className="p-4 pr-6 text-center">
                           <button onClick={() => openEditModal(item)} className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors mx-1" title="수정">
                             <Edit className="w-4 h-4" />
                           </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-24 bg-white rounded-3xl border-2 border-dashed border-gray-200">
            <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Package className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-gray-900 font-bold text-lg">표시할 장비가 없습니다</h3>
            <p className="text-gray-400 text-sm mt-1">새로운 촬영 장비를 등록하거나 검색어를 확인해주세요.</p>
          </div>
        )}
      </main>

      {/* 대여 기록 모달 */}
      {isLogModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600"><History className="w-5 h-5" /></div>
                <h2 className="text-xl font-bold text-gray-900">장비 대여 히스토리</h2>
              </div>
              <button onClick={() => setIsLogModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-900"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {logs.length > 0 ? (
                <div className="overflow-x-auto rounded-2xl border border-gray-200">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-200">
                      <tr>
                        <th className="px-6 py-4">상태</th>
                        <th className="px-6 py-4">장비명 / ID</th>
                        <th className="px-6 py-4">사용자</th>
                        <th className="px-6 py-4">시간 기록</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="px-6 py-4">
                            {log.returnDate ? (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">반납완료</span>
                            ) : (
                              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100 animate-pulse">사용중</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-gray-900">{log.equipmentName}</p>
                            <p className="text-[10px] text-gray-500 font-bold mt-0.5">{String(log.mgmtNum).toLowerCase()}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-600">{log.userName.charAt(0)}</div>
                              <span className="font-semibold text-gray-700">{log.userName}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-[11px] text-gray-500 leading-relaxed font-medium">
                            <div className="flex items-center gap-1.5"><LogOut className="w-3 h-3 text-gray-300" /> {log.checkoutDate}</div>
                            {log.returnDate && <div className="flex items-center gap-1.5 mt-1"><LogIn className="w-3 h-3 text-gray-300" /> {log.returnDate}</div>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-20 text-center"><History className="w-12 h-12 text-gray-200 mx-auto mb-3" /><p className="text-gray-400 font-medium">기록된 대여 내역이 아직 없습니다.</p></div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 장비 등록/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">{editingItem ? '장비 정보 수정' : '새 촬영장비 등록'}</h2>
              <button onClick={handleCloseModal} className="text-gray-400 hover:text-gray-900"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              
              {/* 이미지 업로드 영역 */}
              <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <div className="w-20 h-20 rounded-xl bg-white border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden shrink-0 relative group">
                  {isUploadingImage ? (
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                  ) : formData.imageUrl ? (
                    <img src={formData.imageUrl} alt="미리보기" className="w-full h-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="w-6 h-6 text-gray-300" />
                  )}
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed" disabled={isUploadingImage} />
                </div>
                <div className="flex-1">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">장비 이미지 {isUploadingImage && "(압축 및 업로드 중...)"}</p>
                  <label className={`inline-block text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${isUploadingImage ? 'text-gray-400 bg-gray-100 border-gray-200' : 'text-indigo-600 bg-indigo-50 border-indigo-100 cursor-pointer hover:bg-indigo-100'}`}>
                    {isUploadingImage ? '처리 중...' : '사진 올리기'}
                  </label>
                  {uploadErrorMsg && <p className="text-[10px] text-red-500 mt-1 font-semibold">{uploadErrorMsg}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">관리번호 *</label>
                  <input required type="text" value={formData.mgmtNum} onChange={e => setFormData({...formData, mgmtNum: e.target.value})} placeholder="예: CAM-001" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-sm font-bold" />
                </div>
                <div className="col-span-1">
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">분류</label>
                  <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-sm font-bold bg-white">
                    {CATEGORIES.filter(c => c.name !== '전체').map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">장비명 *</label>
                <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="장비 이름을 입력하세요" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-sm font-bold" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">현재 상태</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-sm font-bold bg-white">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {formData.status === '사용중' && (
                  <div>
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">현재 대여자</label>
                    <input type="text" value={formData.currentUser} onChange={e => setFormData({...formData, currentUser: e.target.value})} placeholder="대여자 성함" className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-sm font-bold" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">특이사항 (메모)</label>
                <textarea value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="장비의 상태나 특이사항을 자유롭게 적어주세요." className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-sm font-medium h-24 resize-none bg-white"></textarea>
              </div>

              <button type="submit" disabled={isUploadingImage} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 mt-2 disabled:bg-indigo-300 disabled:cursor-not-allowed">
                {editingItem ? '정보 수정하기' : '장비 등록 완료'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 반출하기 모달 */}
      {checkoutItem && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900">장비 반출 승인</h2>
              <button onClick={() => setCheckoutItem(null)} className="text-gray-400 hover:text-gray-900"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleCheckoutSubmit} className="p-6 space-y-6">
              <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">반출 장비 정보</p>
                <p className="text-base font-bold text-indigo-900 leading-tight">[{String(checkoutItem.mgmtNum).toLowerCase()}] {checkoutItem.name}</p>
              </div>
              <div>
                <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">장비를 빌려가는 분의 성함 *</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                  <input required autoFocus type="text" value={checkoutUser} onChange={e => setCheckoutUser(e.target.value)} placeholder="실명을 입력해 주세요" className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all text-sm font-bold shadow-inner bg-gray-50/50" />
                </div>
              </div>
              <button type="submit" className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100">반출 기록 및 승인</button>
            </form>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {itemToDelete && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-8 text-center animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">장비 삭제</h3>
            <p className="text-sm text-gray-400 leading-relaxed mb-6 font-medium">[{String(itemToDelete.mgmtNum).toLowerCase()}] {itemToDelete.name}를 목록에서 삭제하시겠습니까? 데이터는 복구되지 않습니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setItemToDelete(null)} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors">취소</button>
              <button onClick={confirmDelete} className="flex-1 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-colors shadow-lg shadow-red-100">삭제</button>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 크게 보기 모달 */}
      {enlargedImage && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 cursor-pointer"
          onClick={() => setEnlargedImage(null)}
        >
          <button 
            onClick={() => setEnlargedImage(null)} 
            className="absolute top-4 right-4 sm:top-8 sm:right-8 p-2 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-8 h-8 sm:w-10 sm:h-10" />
          </button>
          <img 
            src={enlargedImage} 
            alt="확대된 장비 이미지" 
            className="max-w-full max-h-[90vh] object-contain animate-in zoom-in-95 duration-200 cursor-default shadow-2xl rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

    </div>
  );
}