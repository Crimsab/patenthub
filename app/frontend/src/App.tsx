import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Search, Brain, MessageSquare, ExternalLink, 
  X, Send, Loader2, FileText, Layout, 
  Database, Settings, Clock, 
  Filter, ArrowRight, RefreshCw, Upload,
  Edit2, Trash2, Check, Download,
  Folder, Tag, Plus, ChevronDown, ChevronRight,
  ClipboardList, ArrowLeft
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Patent {
  id: string;
  title: string;
  abstract: string;
  inventors: string[] | string;
  publication_date: string;
  publication_number?: string;
  url: string;
  pdf_url?: string;
  pdf_path?: string;
  full_text?: string;
  has_full_text?: boolean;
  pdf_localized?: boolean;
  source: string;
  ai_explanation?: string;
  categories?: { id: number; name: string }[];
  history?: { role: string; content: string; model?: string; citations?: string[] }[];
}

interface SearchHistory {
  query: string;
}

export default function App() {
  const [query, setQuery] = useState('');
  
  const [activeQuery, setActiveQuery] = useState('');
  const [results, setResults] = useState<Patent[]>([]);
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [selectedPatent, setSelectedPatent] = useState<Patent | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [viewMode, setViewMode] = useState<'content' | 'analysis'>('content');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string; content: string; model?: string; citations?: string[] }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [embeddingModelLoaded, setEmbeddingModelLoaded] = useState<boolean>(false);
  const [managingModel, setManagingModel] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryPage, setLibraryPage] = useState(1);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [patentCategories, setPatentCategories] = useState<{ id: number; name: string }[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [comparisonResult, setComparisonResult] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [showTagDropdown, setShowTagDropdown] = useState(false);
  const [appSettings, setAppSettings] = useState<Record<string, string>>({
    ai_vector_default_on: 'false',
    system_prompt_explanation: '',
    system_prompt_chat: '',
    system_prompt_comparison: ''
  });
  const [savingSettings, setSavingSettings] = useState(false);
  
  const DEFAULT_APP_SETTINGS = {
    ai_vector_default_on: 'false',
    system_prompt_explanation: 'You are a patent expert. Explain the following patent in a simple and concise way (ELI5 style). Focus on the main innovation and the problem it solves.',
    system_prompt_chat: 'You are an AI assistant specialized in patents.',
    system_prompt_comparison: 'You are a patent analysis expert. Compare the following two documents and identify: 1. Key similarities in technical innovation. 2. Main differences in implementation or scope. 3. Potential overlaps or areas of conflict.'
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const tagDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowHistory(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
      if (tagDropdownRef.current && !tagDropdownRef.current.contains(event.target as Node)) {
        setShowTagDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchHistory();
    fetchRecentDocuments();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await axios.get('/api/categories');
      setCategories(res.data);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await axios.post('/api/categories', { name: newCategoryName });
      setNewCategoryName('');
      setShowAddCategory(false);
      fetchCategories();
    } catch (err) {
      alert("Category already exists or error occurred");
    }
  };

  const handleCompare = async () => {
    if (selectedCompareIds.length !== 2) return;
    setComparing(true);
    setComparisonResult(null);
    try {
      const res = await axios.post('/api/patents/compare', {
        id1: selectedCompareIds[0],
        id2: selectedCompareIds[1],
        model: selectedModel
      });
      setComparisonResult(res.data.comparison);
    } catch (err) {
      console.error("Comparison failed:", err);
      alert("Comparison failed");
    } finally {
      setComparing(false);
    }
  };

  const toggleCompareSelection = (id: string) => {
    setSelectedCompareIds(prev => {
      if (prev.includes(id)) return prev.filter(i => i !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const fetchRecentDocuments = async (pageNum = 1, search = '', categoryId: number | null = null) => {
    try {
      let url = `/api/patents?page=${pageNum}&q=${encodeURIComponent(search)}`;
      if (categoryId) url += `&categoryId=${categoryId}`;
      
      const res = await axios.get(url);
      if (pageNum === 1) {
        setResults(res.data);
      } else {
        setResults(prev => [...prev, ...res.data]);
      }
      setLibraryPage(pageNum);
    } catch (err) {
      console.error("Error fetching recent documents:", err);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await axios.get('/api/config');
      setAvailableModels(res.data.models);
      setSelectedModel(res.data.models[0]);
      
      
      const settingsRes = await axios.get('/api/settings');
      setAppSettings(settingsRes.data);
      
      
      if (settingsRes.data.ai_vector_default_on === 'true' && !res.data.embeddingModelLoaded) {
        await axios.post('/api/admin/embedding-load');
        setEmbeddingModelLoaded(true);
      } else {
        setEmbeddingModelLoaded(res.data.embeddingModelLoaded);
      }
    } catch (err) {
      console.error("Error fetching config:", err);
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      await axios.post('/api/settings', appSettings);
      alert("Settings saved successfully!");
    } catch (err) {
      console.error("Error saving settings:", err);
      alert("Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleResetSettings = async () => {
    if (!confirm("Reset all settings to default values?")) return;
    setAppSettings(DEFAULT_APP_SETTINGS);
    setSavingSettings(true);
    try {
      await axios.post('/api/settings', DEFAULT_APP_SETTINGS);
      alert("Settings reset to defaults!");
    } catch (err) {
      console.error("Error resetting settings:", err);
      alert("Failed to reset settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleToggleModel = async () => {
    setManagingModel(true);
    try {
      if (embeddingModelLoaded) {
        const res = await axios.post('/api/admin/embedding-unload');
        setEmbeddingModelLoaded(res.data.loaded);
      } else {
        const res = await axios.post('/api/admin/embedding-load');
        setEmbeddingModelLoaded(res.data.loaded);
      }
    } catch (err) {
      console.error("Error managing embedding model:", err);
      alert("Error managing embedding model.");
    } finally {
      setManagingModel(false);
    }
  };

  useEffect(() => {
    
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q');
    const pId = params.get('id');

    if (q && q !== query) {
      setQuery(q);
      handleSearch(null, 1, q);
    }

    if (pId && (!selectedPatent || selectedPatent.id !== pId)) {
      const fetchInitialPatent = async () => {
        try {
          const res = await axios.get(`/api/patents/${pId}`);
          setSelectedPatent(res.data);
          setChatHistory(res.data.history || []);
        } catch (err) {
          console.error("Initial patent fetch failed:", err);
        }
      };
      fetchInitialPatent();
    }

    const handlePopState = () => {
      const newParams = new URLSearchParams(window.location.search);
      const newQ = newParams.get('q');
      if (newQ) {
        setQuery(newQ);
        handleSearch(null, 1, newQ);
      }
      
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (activeQuery) params.set('q', activeQuery);
    if (selectedPatent) params.set('id', selectedPatent.id);
    
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    
    
    if (window.location.search !== `?${params.toString()}` && (activeQuery || selectedPatent)) {
      window.history.replaceState({}, '', newUrl);
    }
  }, [activeQuery, selectedPatent]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, chatLoading]);

  
  useEffect(() => {
    if (!query.trim()) {
      if (activeQuery) {
        setActiveQuery('');
        setPage(1);
        fetchRecentDocuments(1, '');
      }
      return;
    }

    const timer = setTimeout(() => {
      if (query !== activeQuery && (query.trim().length >= 3 || query.startsWith('http'))) {
        handleSearch(null, 1, query);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [query]);

  
  useEffect(() => {
    if (activeQuery) return;
    const timer = setTimeout(() => {
      fetchRecentDocuments(1, librarySearch, selectedCategoryId);
    }, 300);
    return () => clearTimeout(timer);
  }, [librarySearch, activeQuery, selectedCategoryId]);

  useEffect(() => {
    fetchHistory();
    
    const interval = setInterval(fetchHistory, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await axios.get('/api/history');
      setSearchHistory(res.data);
    } catch (err) {
      console.error("Error fetching history:", err);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("Clear all search history?")) return;
    try {
      await axios.delete('/api/history');
      setSearchHistory([]);
    } catch (err) {
      console.error("Clear history failed:", err);
    }
  };

  const handleDeleteHistoryItem = async (e: React.MouseEvent, hQuery: string) => {
    e.stopPropagation();
    try {
      await axios.delete(`/api/history/${encodeURIComponent(hQuery)}`);
      setSearchHistory(prev => prev.filter(h => h.query !== hQuery));
    } catch (err) {
      console.error("Delete history item failed:", err);
    }
  };

  const handleSearch = async (e: React.FormEvent | null, pageNum = 1, searchQuery?: string, refresh = false) => {
    if (e) e.preventDefault();
    const finalQuery = searchQuery || query;
    if (!finalQuery) return;

    
    if (finalQuery.startsWith('http')) {
      setLoading(true);
      try {
        const res = await axios.post('/api/patents/from-url', { url: finalQuery });
        selectPatent(res.data);
        setQuery('');
        setActiveQuery('');
        return;
      } catch (err) {
        console.error("Failed to process direct URL:", err);
        
      }
    }
    
    setLoading(true);
    try {
      const res = await axios.get(`/api/search?q=${encodeURIComponent(finalQuery)}&page=${pageNum}${refresh ? '&refresh=true' : ''}`);
      if (pageNum === 1) {
        setResults(res.data);
        fetchHistory(); 
        setActiveQuery(finalQuery);
      } else {
        setResults(prev => {
          const combined = [...prev, ...res.data];
          const seen = new Set<string>();
          return combined.filter(p => {
            const key = `${p.id}-${p.source}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        });
      }
      setPage(pageNum);
      setQuery(finalQuery);
      setShowHistory(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const selectPatent = async (p: Patent) => {
    setLoading(true);
    
    setSelectedPatent(p);
    setChatHistory([]);
    setViewMode('content');
    
    try {
      console.log("[DEBUG] Saving/Updating patent in DB:", p.id);
      
      await axios.post('/api/patents', p);
      
      
      const res = await axios.get(`/api/patents/${p.id}`);
      console.log("[DEBUG] Fetched updated patent data:", { 
        id: res.data.id, 
        has_full_text: !!res.data.full_text, 
        has_ai_explanation: !!res.data.ai_explanation 
      });
      setSelectedPatent(res.data);
      setChatHistory(res.data.history || []);
      
      
      const catRes = await axios.get(`/api/patents/${p.id}/categories`);
      setPatentCategories(catRes.data);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message;
      console.error("Selection error details:", err.response?.data || err.message);
      alert(`Error saving document: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExplain = async () => {
    if (!selectedPatent) return;
    setExplainLoading(true);
    try {
      const res = await axios.post(`/api/patents/${selectedPatent.id}/explain`, {
        model: selectedModel
      });
      setSelectedPatent({ ...selectedPatent, ai_explanation: res.data.explanation });
      setViewMode('analysis');
    } catch (err) {
      console.error(err);
    } finally {
      setExplainLoading(false);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMessage || !selectedPatent || chatLoading) return;
    
    const newMessage = { role: 'user', content: chatMessage };
    setChatHistory([...chatHistory, newMessage]);
    setChatMessage('');
    setChatLoading(true);

    try {
      const res = await axios.post(`/api/patents/${selectedPatent.id}/chat`, {
        message: chatMessage,
        model: selectedModel
      });
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: res.data.reply,
        model: selectedModel,
        citations: res.data.citations
      }]);
    } catch (err: any) {
      console.error(err);
      const errorMsg = err.response?.data?.error || err.message;
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: `⚠️ Error: ${errorMsg}`,
        model: 'system' 
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const processPDF = async () => {
    if (!selectedPatent) return;
    setPdfProcessing(true);
    try {
      await axios.post(`/api/patents/${selectedPatent.id}/process-pdf`);
      const detailRes = await axios.get(`/api/patents/${selectedPatent.id}`);
      setSelectedPatent(detailRes.data);
    } catch (err: any) {
      console.error("Index error:", err);
      const errorMsg = err.response?.data?.error || err.message;
      alert(`Error indexing document: ${errorMsg}`);
    } finally {
      setPdfProcessing(false);
    }
  };

  const openPdf = () => {
    if (!selectedPatent) return;
    if (selectedPatent.pdf_path) {
      window.open(`/api/patents/${selectedPatent.id}/pdf`, '_blank');
    } else if (selectedPatent.pdf_url) {
      window.open(selectedPatent.pdf_url, '_blank');
    }
  };

  const goHome = () => {
    setQuery('');
    setActiveQuery('');
    setSelectedPatent(null);
    setViewMode('content');
    setChatHistory([]);
    setChatMessage('');
    setExplainLoading(false);
    setPdfProcessing(false);
    setChatLoading(false);
    setPage(1);
    fetchRecentDocuments(1, '');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    try {
      const res = await axios.post('/api/patents/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      selectPatent(res.data);
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error("Upload failed:", err);
      alert(`Upload failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!renamingTitle.trim()) return;
    try {
      await axios.patch(`/api/patents/${id}`, { title: renamingTitle });
      setResults(prev => prev.map(p => p.id === id ? { ...p, title: renamingTitle } : p));
      if (selectedPatent?.id === id) {
        setSelectedPatent({ ...selectedPatent, title: renamingTitle });
      }
      setRenamingId(null);
    } catch (err) {
      console.error("Rename failed:", err);
      alert("Failed to rename document");
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document and all its chat history?")) return;
    try {
      await axios.delete(`/api/patents/${id}`);
      setResults(prev => prev.filter(p => p.id !== id));
      if (selectedPatent?.id === id) {
        setSelectedPatent(null);
      }
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete document");
    }
  };

  const handleAddTag = async (categoryId: number, patentId?: string) => {
    const targetId = patentId || selectedPatent?.id;
    if (!targetId) return;
    try {
      await axios.post(`/api/patents/${targetId}/categories`, { categoryId });
      
      const res = await axios.get(`/api/patents/${targetId}/categories`);
      if (targetId === selectedPatent?.id) {
        setPatentCategories(res.data);
      }
      
      
      setResults(prev => prev.map(p => 
        p.id === targetId 
          ? { ...p, categories: res.data } 
          : p
      ));
    } catch (err) {
      console.error("Add tag failed:", err);
    }
  };

  const handleRemoveTag = async (categoryId: number, patentId?: string) => {
    const targetId = patentId || selectedPatent?.id;
    if (!targetId) return;
    try {
      await axios.delete(`/api/patents/${targetId}/categories/${categoryId}`);
      
      if (targetId === selectedPatent?.id) {
        setPatentCategories(prev => prev.filter(c => c.id !== categoryId));
      }
      
      
      setResults(prev => prev.map(p => 
        p.id === targetId 
          ? { ...p, categories: (p.categories || []).filter(c => c.id !== categoryId) } 
          : p
      ));
    } catch (err) {
      console.error("Remove tag failed:", err);
    }
  };

  const handleDeleteCategory = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Delete this category? This will untag all documents in it.")) return;
    try {
      await axios.delete(`/api/categories/${id}`);
      if (selectedCategoryId === id) setSelectedCategoryId(null);
      fetchCategories();
    } catch (err) {
      console.error("Delete category failed:", err);
    }
  };

  const handleOCR = async () => {
    if (!selectedPatent) return;
    setOcrLoading(true);
    try {
      await axios.post(`/api/patents/${selectedPatent.id}/ocr`);
      const res = await axios.get(`/api/patents/${selectedPatent.id}`);
      setSelectedPatent(res.data);
    } catch (err) {
      console.error("OCR failed:", err);
      alert("OCR process failed");
    } finally {
      setOcrLoading(false);
    }
  };

  const handleExport = () => {
    if (!selectedPatent) return;
    
    let md = `# ${selectedPatent.title}\n\n`;
    md += `**ID:** ${selectedPatent.id}\n`;
    md += `**Source:** ${selectedPatent.source}\n`;
    md += `**Date:** ${selectedPatent.publication_date}\n\n`;
    
    md += `## Abstract\n${selectedPatent.abstract}\n\n`;
    
    if (selectedPatent.ai_explanation) {
      md += `## AI Analysis\n${selectedPatent.ai_explanation}\n\n`;
    }
    
    if (chatHistory.length > 0) {
      md += `## Chat History\n\n`;
      chatHistory.forEach(msg => {
        md += `### ${msg.role.toUpperCase()}${msg.model ? ` (${msg.model})` : ''}\n${msg.content}\n\n`;
        if (msg.citations && msg.citations.length > 0) {
          md += `**Sources used:**\n`;
          msg.citations.forEach(c => md += `> ${c}\n\n`);
        }
      });
    }
    
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedPatent.title.substring(0, 50).replace(/[^a-z0-9]/gi, '_')}_report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full h-screen bg-[#09090b] text-slate-300 flex flex-col overflow-hidden font-sans">
      {/* Top Navigation */}
      <nav className="h-14 border-b border-white/10 bg-[#09090b] flex items-center px-6 justify-between shrink-0 z-50">
        <button
          type="button"
          onClick={goHome}
          className="flex items-center gap-3 shrink-0 hover:opacity-90 transition-opacity"
          title="Home"
        >
          <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center shadow-lg shadow-emerald-900/20">
            <Database size={18} className="text-white" />
          </div>
          <span className="font-bold tracking-tight text-white text-lg">PatentHub</span>
        </button>

        <div className="flex-1 mx-12 relative" ref={searchRef}>
          <form onSubmit={(e) => handleSearch(e)} className="relative group">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setShowHistory(true)}
              placeholder="Search patents, technology, inventors..."
              className="w-full bg-[#18181b] border border-white/10 rounded-lg py-2 px-10 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all text-sm text-white"
            />
            <Search size={16} className="absolute left-3 top-2.5 text-slate-500 group-focus-within:text-emerald-500 transition-colors" />
            
            {showHistory && searchHistory.length > 0 && (
              <div className="absolute top-full mt-2 w-full bg-[#18181b] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-[100]">
                <div className="p-2 border-b border-white/5 flex justify-between items-center bg-white/5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2">Recent Searches</span>
                  <div className="flex items-center gap-2">
                    <button 
                      type="button" 
                      onClick={handleClearHistory}
                      className="text-[9px] font-bold text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-400/10 transition-colors"
                    >
                      Clear All
                    </button>
                    <button type="button" onClick={() => setShowHistory(false)} className="p-1 hover:bg-white/10 rounded">
                      <X size={12} />
                    </button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {searchHistory.map((h, i) => (
                    <div key={i} className="group flex items-center w-full px-4 hover:bg-white/5 border-b border-white/5 last:border-0">
                      <button
                        type="button"
                        onClick={() => handleSearch(null, 1, h.query)}
                        className="flex-1 text-left py-2 text-xs flex items-center gap-3 transition-colors"
                      >
                        <Clock size={12} className="text-slate-600" />
                        <span className="truncate">{h.query}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistoryItem(e, h.query)}
                        className="p-1.5 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all rounded hover:bg-white/5"
                        title="Delete search"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 h-9 px-3 rounded-lg border border-white/10 bg-white/5 text-[11px] font-medium text-slate-300 hover:bg-white/10 transition-all disabled:opacity-50"
            title="Upload local PDF for chat"
          >
            {uploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            <span className="hidden lg:inline">Upload PDF</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf"
            className="hidden"
          />

          {/* Embedding Model Status Toggle */}
          <button
            onClick={handleToggleModel}
            disabled={managingModel}
            className={cn(
              "flex items-center gap-2 h-9 px-3 rounded-lg border text-[11px] font-medium transition-all",
              embeddingModelLoaded 
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20" 
                : "bg-slate-500/5 border-white/10 text-slate-500 hover:bg-white/5"
            )}
            title={embeddingModelLoaded ? "Embedding Model Loaded (Click to unload and save RAM)" : "Embedding Model Offline (Click to load)"}
          >
            {managingModel ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Brain size={14} className={cn(embeddingModelLoaded && "text-emerald-400")} />
            )}
            <span className="hidden sm:inline">
              {embeddingModelLoaded ? "AI Vector ON" : "AI Vector OFF"}
            </span>
            <div className={cn(
              "w-1.5 h-1.5 rounded-full shrink-0",
              embeddingModelLoaded ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-600"
            )} />
          </button>

          {availableModels.length > 0 && (
            <div className="relative" ref={modelDropdownRef}>
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className={cn(
                  "flex items-center bg-[#18181b] border border-white/10 rounded-lg px-3 h-9 transition-all hover:border-emerald-500/50",
                  showModelDropdown && "border-emerald-500/50 ring-1 ring-emerald-500/20"
                )}
              >
                <Brain size={14} className="text-emerald-500 mr-2" />
                <span className="text-[11px] font-bold text-white mr-2 truncate max-w-[120px]">
                  {selectedModel.split('/').pop()}
                </span>
                <Filter size={10} className={cn("text-slate-500 transition-transform", showModelDropdown && "rotate-180")} />
              </button>

              {showModelDropdown && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-[#18181b] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-2 border-b border-white/5 bg-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-2">Select AI Model</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto custom-scrollbar">
                    {availableModels.map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          setSelectedModel(m);
                          setShowModelDropdown(false);
                        }}
                        className={cn(
                          "w-full text-left px-4 py-3 text-xs flex flex-col gap-0.5 transition-colors border-b border-white/5 last:border-0",
                          selectedModel === m ? "bg-emerald-500/10" : "hover:bg-white/5"
                        )}
                      >
                        <span className={cn(
                          "font-bold",
                          selectedModel === m ? "text-emerald-400" : "text-slate-200"
                        )}>
                          {m.split('/').pop()}
                        </span>
                        <span className="text-[9px] text-slate-500 truncate">{m}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
            title="Settings"
          >
            <Settings size={20} />
          </button>
        </div>
      </nav>

      {showSettings && (
        <div
          className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#0b0b0d] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Settings size={18} className="text-emerald-500" />
                <h3 className="text-sm font-black uppercase tracking-widest text-white">Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-5 text-sm text-slate-300 overflow-y-auto max-h-[70vh] custom-scrollbar">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">AI Vector Startup</div>
                    <p className="text-[10px] text-slate-600">Automatically load the embedding model when the app starts.</p>
                  </div>
                  <button
                    onClick={() => setAppSettings(prev => ({ ...prev, ai_vector_default_on: prev.ai_vector_default_on === 'true' ? 'false' : 'true' }))}
                    className={cn(
                      "w-10 h-5 rounded-full transition-all relative",
                      appSettings.ai_vector_default_on === 'true' ? "bg-emerald-600" : "bg-slate-800"
                    )}
                  >
                    <div className={cn(
                      "absolute top-1 w-3 h-3 rounded-full bg-white transition-all",
                      appSettings.ai_vector_default_on === 'true' ? "left-6" : "left-1"
                    )} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">Custom System Prompts</div>
                  
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-400">ELI5 Explanation Prompt</label>
                      <button 
                        onClick={() => setAppSettings(prev => ({ ...prev, system_prompt_explanation: DEFAULT_APP_SETTINGS.system_prompt_explanation }))}
                        className="text-[8px] text-emerald-500/50 hover:text-emerald-500 transition-colors uppercase font-bold"
                      >
                        Reset this
                      </button>
                    </div>
                    <textarea
                      value={appSettings.system_prompt_explanation}
                      onChange={e => setAppSettings(prev => ({ ...prev, system_prompt_explanation: e.target.value }))}
                      className="w-full bg-[#111113] border border-white/5 rounded-lg p-3 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 min-h-[80px]"
                      placeholder="Enter system prompt for patent explanations..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-400">Chat Assistant Prompt</label>
                      <button 
                        onClick={() => setAppSettings(prev => ({ ...prev, system_prompt_chat: DEFAULT_APP_SETTINGS.system_prompt_chat }))}
                        className="text-[8px] text-emerald-500/50 hover:text-emerald-500 transition-colors uppercase font-bold"
                      >
                        Reset this
                      </button>
                    </div>
                    <textarea
                      value={appSettings.system_prompt_chat}
                      onChange={e => setAppSettings(prev => ({ ...prev, system_prompt_chat: e.target.value }))}
                      className="w-full bg-[#111113] border border-white/5 rounded-lg p-3 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 min-h-[80px]"
                      placeholder="Enter base system prompt for the chat assistant..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-slate-400">Comparison Mode Prompt</label>
                      <button 
                        onClick={() => setAppSettings(prev => ({ ...prev, system_prompt_comparison: DEFAULT_APP_SETTINGS.system_prompt_comparison }))}
                        className="text-[8px] text-emerald-500/50 hover:text-emerald-500 transition-colors uppercase font-bold"
                      >
                        Reset this
                      </button>
                    </div>
                    <textarea
                      value={appSettings.system_prompt_comparison}
                      onChange={e => setAppSettings(prev => ({ ...prev, system_prompt_comparison: e.target.value }))}
                      className="w-full bg-[#111113] border border-white/5 rounded-lg p-3 text-xs text-slate-300 focus:outline-none focus:border-emerald-500/50 min-h-[80px]"
                      placeholder="Enter system prompt for comparative analysis..."
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleResetSettings}
                    disabled={savingSettings}
                    className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all border border-white/5 disabled:opacity-50"
                  >
                    Reset All
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    disabled={savingSettings}
                    className="flex-[2] py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20 disabled:opacity-50"
                  >
                    {savingSettings ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                    Save All Settings
                  </button>
                </div>
              </div>

              <div className="h-px bg-white/5 my-6" />

              <div className="space-y-2">
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">Navigation</div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs">
                  Clicking <span className="font-bold text-white">PatentHub</span> returns to the home view (clears the selected document).
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-500">Backend configuration</div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-2 text-xs">
                  <div><span className="font-bold text-white">SearXNG engines</span>: set <code className="text-emerald-400">SEARXNG_ENGINES</code> (comma-separated)</div>
                  <div><span className="font-bold text-white">Blocked engines</span>: set <code className="text-emerald-400">SEARXNG_BLOCK_ENGINES</code></div>
                  <div><span className="font-bold text-white">History limit</span>: set <code className="text-emerald-400">SEARCH_HISTORY_MAX</code></div>
                  <div className="text-[10px] text-slate-500 mt-2">Note: these are environment variables (Docker). Changes require container restart.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden w-full">
        {/* Left: Results sidebar */}
        <aside className="w-[350px] border-r border-white/10 bg-[#09090b] flex flex-col shrink-0">
          <div className="p-4 border-b border-white/10 flex flex-col gap-3 bg-[#111113]/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeQuery ? (
                  <button 
                    onClick={() => { setActiveQuery(''); setQuery(''); fetchRecentDocuments(); }}
                    className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400 hover:text-emerald-500 transition-colors group"
                  >
                    <ArrowLeft size={14} className="text-emerald-500 group-hover:-translate-x-0.5 transition-transform" />
                    Search Results
                  </button>
                ) : (
                  <>
                    <Filter size={14} className="text-emerald-500" />
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      My Library
                    </h2>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500">{results.length} docs</span>
                <button
                  onClick={() => {
                    setCompareMode(!compareMode);
                    setSelectedCompareIds([]);
                    setComparisonResult(null);
                  }}
                  className={cn(
                    "p-1 rounded transition-colors",
                    compareMode ? "bg-emerald-500/20 text-emerald-400" : "hover:bg-white/5 text-slate-500"
                  )}
                  title="Toggle Comparison Mode"
                >
                  <ClipboardList size={14} />
                </button>
                {results.length > 0 && activeQuery && (
                  <button
                    onClick={() => handleSearch(null, 1, activeQuery, true)}
                    disabled={loading}
                    className="p-1 hover:bg-white/5 rounded text-slate-500 hover:text-emerald-500 transition-colors"
                    title="Refresh search (bypass cache)"
                  >
                    <RefreshCw size={12} className={cn(loading && "animate-spin")} />
                  </button>
                )}
              </div>
            </div>

            {!activeQuery && (
              <div className="flex flex-col gap-2">
                <div className="relative">
                  <input
                    type="text"
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    placeholder="Search in library..."
                    className="w-full bg-[#18181b] border border-white/5 rounded-lg py-1.5 pl-8 pr-8 text-[11px] focus:outline-none focus:border-emerald-500/50 transition-all text-white placeholder:text-slate-600"
                  />
                  <Search size={12} className="absolute left-2.5 top-2.5 text-slate-600" />
                  {librarySearch && (
                    <button 
                      onClick={() => { setLibrarySearch(''); fetchRecentDocuments(1, '', selectedCategoryId); }}
                      className="absolute right-2.5 top-2 text-slate-600 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar scrollbar-hide">
                  <button
                    onClick={() => setSelectedCategoryId(null)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all border",
                      selectedCategoryId === null 
                        ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" 
                        : "bg-white/5 border-transparent text-slate-500 hover:bg-white/10"
                    )}
                  >
                    All
                  </button>
                  {categories.map(cat => (
                    <div key={cat.id} className="group/catpill relative flex items-center shrink-0">
                      <button
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap transition-all border pr-5",
                          selectedCategoryId === cat.id 
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400" 
                            : "bg-white/5 border-transparent text-slate-500 hover:bg-white/10"
                        )}
                      >
                        {cat.name}
                      </button>
                      <button
                        onClick={(e) => handleDeleteCategory(e, cat.id)}
                        className="absolute right-1.5 opacity-0 group-hover/catpill:opacity-100 p-0.5 hover:text-red-400 text-slate-600 transition-all"
                        title="Delete category"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setShowAddCategory(true)}
                    className="p-1 rounded-full bg-white/5 text-slate-500 hover:text-emerald-500 hover:bg-white/10 transition-all"
                  >
                    <Plus size={12} />
                  </button>
                </div>

                {showAddCategory && (
                  <div className="flex items-center gap-2 mt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <input
                      autoFocus
                      type="text"
                      value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreateCategory()}
                      placeholder="Category name..."
                      className="flex-1 bg-[#18181b] border border-emerald-500/30 rounded px-2 py-1 text-[10px] text-white focus:outline-none"
                    />
                    <button onClick={handleCreateCategory} className="text-emerald-500 p-1 hover:bg-emerald-500/10 rounded">
                      <Check size={12} />
                    </button>
                    <button onClick={() => setShowAddCategory(false)} className="text-slate-500 p-1 hover:bg-white/5 rounded">
                      <X size={12} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/5">
            {results.map((p) => (
              <div
                key={`${p.id}-${p.source}`}
                onClick={(e) => {
                  e.stopPropagation();
                  selectPatent(p);
                }}
                className={cn(
                  "p-5 cursor-pointer transition-all relative group",
                  selectedPatent?.id === p.id 
                    ? "bg-emerald-500/10 border-l-4 border-l-emerald-500" 
                    : "hover:bg-white/[0.03] border-l-4 border-l-transparent"
                )}
              >
                <div className="flex gap-2 items-center mb-2">
                  {compareMode && (
                    <input
                      type="checkbox"
                      checked={selectedCompareIds.includes(p.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleCompareSelection(p.id);
                      }}
                      className="w-3 h-3 rounded border-white/10 bg-white/5 accent-emerald-500"
                    />
                  )}
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-emerald-500 border border-emerald-500/20">{p.source}</span>
                  {p.categories && p.categories.length > 0 && (
                    <div className="flex gap-1 overflow-hidden flex-wrap max-w-[180px]">
                      {p.categories.map(cat => (
                        <span key={cat.id} className="group/stag flex items-center gap-1 text-[8px] font-bold px-1 py-0.5 rounded bg-white/5 text-slate-500 border border-white/5 whitespace-nowrap">
                          {cat.name}
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveTag(cat.id, p.id);
                            }}
                            className="opacity-0 group-hover/stag:opacity-100 hover:text-red-400 transition-all"
                          >
                            <X size={8} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <span className="text-[9px] text-slate-600 font-mono tracking-tighter">{p.id}</span>
                  <div className="flex-1" />
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="relative group/addsidebar">
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-emerald-500 transition-colors"
                        title="Add Tag"
                      >
                        <Tag size={10} />
                      </button>
                      <div className="absolute bottom-full right-0 mb-1 w-32 bg-[#18181b] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-50 hidden group-hover/addsidebar:block animate-in fade-in slide-in-from-bottom-1 duration-200">
                        <div className="p-1 max-h-32 overflow-y-auto custom-scrollbar">
                          {categories.filter(c => !p.categories?.some(pc => pc.id === c.id)).map(cat => (
                            <button
                              key={cat.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddTag(cat.id, p.id);
                              }}
                              className="w-full text-left px-2 py-1 text-[9px] text-slate-300 hover:bg-white/5 hover:text-emerald-400 rounded transition-colors"
                            >
                              {cat.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(p.id);
                        setRenamingTitle(p.title);
                      }}
                      className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-white transition-colors"
                      title="Rename"
                    >
                      <Edit2 size={10} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, p.id)}
                      className="p-1 hover:bg-white/10 rounded text-slate-500 hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
                {renamingId === p.id ? (
                  <div className="flex items-center gap-2 mb-2" onClick={e => e.stopPropagation()}>
                    <input
                      autoFocus
                      type="text"
                      value={renamingTitle}
                      onChange={e => setRenamingTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleRename(p.id);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      className="flex-1 bg-[#18181b] border border-emerald-500/50 rounded px-2 py-1 text-xs text-white focus:outline-none"
                    />
                    <button onClick={() => handleRename(p.id)} className="text-emerald-500 hover:text-emerald-400">
                      <Check size={14} />
                    </button>
                    <button onClick={() => setRenamingId(null)} className="text-slate-500 hover:text-slate-400">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <h3 className={cn(
                    "text-[13px] font-semibold leading-relaxed mb-2 line-clamp-2",
                    selectedPatent?.id === p.id ? "text-white" : "text-slate-300 group-hover:text-white"
                  )}>
                    {p.title}
                  </h3>
                )}
                <div className="flex items-center justify-between mt-auto">
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Clock size={10} /> {p.publication_date?.split('T')[0]}
                  </span>
                  <ArrowRight size={14} className={cn(
                    "transition-transform",
                    selectedPatent?.id === p.id ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                  )} />
                </div>
              </div>
            ))}
            
            {results.length > 0 && (
              <button
                onClick={() => activeQuery ? handleSearch(null, page + 1) : fetchRecentDocuments(libraryPage + 1, librarySearch, selectedCategoryId)}
                disabled={loading}
                className="w-full p-6 text-xs font-black text-slate-500 hover:text-emerald-500 transition-colors uppercase tracking-[0.2em]"
              >
                {loading ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Load more results"}
              </button>
            )}

            {results.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center p-12 text-center opacity-20 mt-20">
                <Layout size={48} className="mb-4" />
                <p className="text-sm font-medium">Your library is empty</p>
                <p className="text-[10px] mt-2">Search for patents or upload a PDF to get started.</p>
              </div>
            )}
          </div>

          {compareMode && (
            <div className="p-4 border-t border-white/10 bg-[#111113] space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{selectedCompareIds.length}/2 Selected</span>
                <button 
                  onClick={() => setSelectedCompareIds([])}
                  className="text-[9px] text-slate-500 hover:text-white underline"
                >
                  Reset
                </button>
              </div>
              <button
                disabled={selectedCompareIds.length !== 2 || comparing}
                onClick={handleCompare}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/20"
              >
                {comparing ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />}
                Compare Documents
              </button>
            </div>
          )}
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex overflow-hidden bg-[#09090b]">
          {compareMode && comparisonResult ? (
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-emerald-500/[0.03] to-transparent">
              <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <header className="flex justify-between items-center border-b border-white/10 pb-6">
                  <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                      <ClipboardList className="text-emerald-500" size={28} /> Comparative Analysis
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">AI-generated comparison between selected documents</p>
                  </div>
                  <button 
                    onClick={() => setComparisonResult(null)}
                    className="p-2 hover:bg-white/5 rounded-full text-slate-500 hover:text-white transition-colors"
                  >
                    <X size={20} />
                  </button>
                </header>
                <div className="prose prose-invert prose-emerald max-w-none text-slate-300 leading-relaxed font-sans">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{comparisonResult}</ReactMarkdown>
                </div>
              </div>
            </div>
          ) : selectedPatent ? (
            <>
              {/* Document/Analysis Center */}
              <div className="flex-1 flex flex-col border-r border-white/10 overflow-hidden">
                <div className="h-12 border-b border-white/10 flex items-center px-6 justify-between bg-[#111113]/50 shrink-0">
                  <div className="flex items-center gap-1 bg-[#18181b] p-1 rounded-lg">
                    <button 
                      onClick={() => setViewMode('content')}
                      className={cn(
                        "flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold tracking-tight transition-all",
                        viewMode === 'content' ? "bg-[#27272a] text-white shadow-lg shadow-black/20" : "text-slate-500 hover:text-slate-300"
                      )}
                    >
                      <FileText size={14} /> DOCUMENT
                    </button>
                    <button 
                      onClick={() => setViewMode('analysis')}
                      className={cn(
                        "flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold tracking-tight transition-all",
                        viewMode === 'analysis' ? "bg-[#27272a] text-white shadow-lg shadow-black/20" : "text-slate-500 hover:text-slate-300"
                      )}
                    >
                      <Brain size={14} /> AI INSIGHTS
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {selectedPatent && (
                      <button 
                        onClick={() => setSelectedPatent(null)}
                        className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-colors border border-white/5" 
                        title="Close document and back to list"
                      >
                        <X size={16} />
                      </button>
                    )}
                    {!selectedPatent.pdf_localized && (
                      <button 
                        onClick={processPDF}
                        disabled={pdfProcessing}
                        className="p-2 hover:bg-white/5 rounded-lg text-emerald-500 hover:text-emerald-400 transition-colors border border-emerald-500/10" 
                        title={selectedPatent.pdf_url ? "Process PDF for RAG" : "Search and Process PDF"}
                      >
                        {pdfProcessing ? <Loader2 size={16} className="animate-spin" /> : <Database size={16} />}
                      </button>
                    )}
                    {(selectedPatent.pdf_url || selectedPatent.pdf_path) && (
                      <button 
                        onClick={openPdf} 
                        className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors border border-white/5" 
                        title="View PDF Document"
                      >
                        <FileText size={16} />
                      </button>
                    )}
                    <button 
                      onClick={handleExport}
                      className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-emerald-500 transition-colors border border-white/5" 
                      title="Export Report (Markdown)"
                    >
                      <Download size={16} />
                    </button>
                    <a 
                      href={selectedPatent.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors border border-white/5" 
                      title="View on Official Source"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-white/[0.02] to-transparent">
                  <div className="w-full">
                    {viewMode === 'content' ? (
                      <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <header className="space-y-4">
                          <h1 className="text-4xl font-black text-white leading-[1.1] tracking-tight">{selectedPatent.title}</h1>
                          <div className="flex flex-wrap gap-6 text-[11px] font-mono uppercase tracking-widest text-slate-500 border-y border-white/5 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="text-slate-600">Identification</span>
                              <span className="text-emerald-500 font-bold">{selectedPatent.publication_number || selectedPatent.id}</span>
                            </div>
                            <div className="flex flex-col gap-1">
                              <span className="text-slate-600">Publication</span>
                              <span className="text-slate-300">{selectedPatent.publication_date?.split('T')[0]}</span>
                            </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-slate-600">Repository</span>
                      <span className="text-slate-300">{selectedPatent.source}</span>
                    </div>
                    {selectedPatent.has_full_text && (
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-600">Index Status</span>
                        <span className="text-emerald-500 font-bold">FULL TEXT READY (RAG ENABLED)</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-6 flex-wrap">
                    <Tag size={12} className="text-slate-500" />
                    {patentCategories.map(cat => (
                      <span key={cat.id} className="group/tag flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                        {cat.name}
                        <button onClick={() => handleRemoveTag(cat.id)} className="opacity-0 group-hover/tag:opacity-100 hover:text-white transition-opacity">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    <div className="relative" ref={tagDropdownRef}>
                      <button 
                        onClick={() => setShowTagDropdown(!showTagDropdown)}
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-500 text-[10px] font-bold hover:bg-white/10 hover:text-slate-300 transition-all",
                          showTagDropdown && "bg-white/10 text-slate-300 border-emerald-500/50"
                        )}
                      >
                        <Plus size={10} /> Add Tag
                      </button>
                      {showTagDropdown && (
                        <div className="absolute top-full left-0 mt-1 w-40 bg-[#18181b] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="p-1 max-h-40 overflow-y-auto custom-scrollbar">
                            {categories.filter(c => !patentCategories.some(pc => pc.id === c.id)).map(cat => (
                              <button
                                key={cat.id}
                                onClick={() => {
                                  handleAddTag(cat.id);
                                  setShowTagDropdown(false);
                                }}
                                className="w-full text-left px-2 py-1.5 text-[10px] text-slate-300 hover:bg-white/5 hover:text-emerald-400 rounded transition-colors"
                              >
                                {cat.name}
                              </button>
                            ))}
                            {categories.filter(c => !patentCategories.some(pc => pc.id === c.id)).length === 0 && (
                              <div className="px-2 py-1.5 text-[9px] text-slate-600 italic">No more categories</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </header>

                        <section className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="h-[1px] flex-1 bg-white/10" />
                            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500">Abstract</h4>
                            <div className="h-[1px] flex-1 bg-white/10" />
                          </div>
                          <p className="text-slate-300 leading-relaxed text-lg font-serif italic text-justify">
                            {selectedPatent.abstract}
                          </p>
                        </section>

                        <section className="space-y-6">
                          <div className="flex items-center gap-3">
                            <div className="h-[1px] flex-1 bg-white/10" />
                            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-500">Full Text</h4>
                            <div className="h-[1px] flex-1 bg-white/10" />
                          </div>
                          
                          {selectedPatent.full_text ? (
                            <div className="text-slate-400 leading-relaxed text-sm whitespace-pre-wrap font-mono bg-[#111113] p-8 rounded-xl border border-white/5 shadow-2xl">
                              {selectedPatent.full_text}
                            </div>
                          ) : (
                            <div className="p-12 rounded-2xl border-2 border-dashed border-white/5 bg-white/[0.01] text-center space-y-6">
                              <div className="space-y-2">
                                <h5 className="text-white font-bold">Deep Document Indexing</h5>
                                <p className="text-xs text-slate-500">Download the full text and generate embeddings to enable deep analysis and RAG chat.</p>
                              </div>
                              <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
                                <button 
                                  onClick={processPDF}
                                  disabled={pdfProcessing}
                                  className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-3 shadow-xl shadow-emerald-900/20 disabled:opacity-50"
                                >
                                  {pdfProcessing ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />} Index Full Document
                                </button>
                                {selectedPatent.pdf_localized && (
                                  <button 
                                    onClick={handleOCR}
                                    disabled={ocrLoading}
                                    className="px-6 py-3 bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-3 border border-white/10 disabled:opacity-50"
                                  >
                                    {ocrLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />} Run OCR (Scanned PDF)
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </section>
                      </div>
                    ) : (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center justify-between border-b border-white/10 pb-6">
                          <h2 className="text-2xl font-black text-white flex items-center gap-4">
                            <Brain className="text-emerald-500" size={28} /> AI Analysis Report
                          </h2>
                          {!selectedPatent.ai_explanation && (
                            <button 
                              onClick={handleExplain}
                              disabled={explainLoading}
                              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest rounded-lg transition-all flex items-center gap-3 shadow-xl shadow-emerald-900/20 disabled:opacity-50"
                            >
                              {explainLoading ? <Loader2 size={14} className="animate-spin" /> : <Brain size={14} />} Run AI Analysis
                            </button>
                          )}
                        </div>
                        
                        {selectedPatent.ai_explanation ? (
                          <div className="prose prose-invert prose-emerald max-w-none text-slate-300 leading-relaxed font-sans">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedPatent.ai_explanation}</ReactMarkdown>
                          </div>
                        ) : (
                          <div className="py-32 text-center space-y-6 opacity-30">
                            <div className="w-20 h-20 border-2 border-dashed border-white/20 rounded-full flex items-center justify-center mx-auto">
                              <Brain size={40} />
                            </div>
                            <p className="text-sm font-medium tracking-tight">No AI analysis available for this document yet.</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: AI Assistant sidebar */}
              <div className="w-[400px] flex flex-col bg-[#09090b] shrink-0 overflow-hidden">
                <div className="h-12 border-b border-white/10 flex items-center px-5 bg-[#111113]/50 shrink-0 justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Contextual Assistant</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span 
                      className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded border uppercase tracking-tighter cursor-help transition-all",
                        selectedPatent.has_full_text 
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20" 
                          : "bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
                      )}
                      title={
                        selectedPatent.has_full_text 
                          ? (embeddingModelLoaded 
                              ? "Deep RAG: Using the full document text for accurate, contextual answers." 
                              : "Limited RAG: Full text is indexed but only using ABSTRACT because the AI Vector model is offline.")
                          : "Basic RAG: Using only the ABSTRACT because the full document has not been indexed yet."
                      }
                    >
                      RAG: {(selectedPatent.has_full_text && embeddingModelLoaded) ? 'PDF' : 'ABSTRACT'}
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[#09090b]">
                  {chatHistory.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-6 opacity-10">
                      <MessageSquare size={64} />
                      <div className="space-y-2">
                        <p className="text-sm font-black uppercase tracking-widest">Awaiting Queries</p>
                        <p className="text-xs max-w-[200px]">Ask technical questions about this patent using the field below.</p>
                      </div>
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={cn(
                      "flex flex-col max-w-[90%] group animate-in fade-in slide-in-from-right-2 duration-300",
                      msg.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                    )}>
                      <div className={cn(
                        "px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-lg",
                        msg.role === 'user' 
                          ? "bg-emerald-600 text-white rounded-tr-none shadow-emerald-900/10" 
                          : "bg-[#18181b] text-slate-300 rounded-tl-none border border-white/5"
                      )}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-white/5">
                            <details className="group/cit">
                              <summary className="text-[10px] font-black uppercase tracking-widest text-emerald-500/50 cursor-pointer hover:text-emerald-500 transition-colors list-none flex items-center gap-2">
                                <FileText size={10} /> {msg.citations.length} Sources Used
                              </summary>
                              <div className="mt-2 space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                {msg.citations.map((cit, idx) => (
                                  <div key={idx} className="p-2 rounded bg-white/[0.02] border border-white/5 text-[11px] leading-normal text-slate-500 italic">
                                    "{cit}"
                                  </div>
                                ))}
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-600 mt-1 uppercase font-bold tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity">
                        {msg.role === 'user' ? 'You' : (msg.model ? msg.model.split('/').pop() : 'Assistant')}
                      </span>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="mr-auto flex gap-1.5 p-4 bg-[#18181b] rounded-2xl rounded-tl-none border border-white/5">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" />
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="p-6 bg-[#111113]/50 border-t border-white/10">
                  <form onSubmit={handleChat} className="relative group">
                    <input
                      type="text"
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      placeholder="Type a technical question..."
                      className="w-full bg-[#18181b] border border-white/10 rounded-xl py-3 px-4 pr-12 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all text-sm text-white"
                    />
                    <button
                      type="submit"
                      disabled={chatLoading || !chatMessage}
                      className="absolute right-3 top-2.5 p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg disabled:opacity-20 transition-all"
                    >
                      <Send size={18} />
                    </button>
                  </form>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-600 bg-[#09090b] relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
              <div className="text-center space-y-8 relative z-10 p-12">
                <div className="w-24 h-24 bg-white/[0.02] border border-white/5 rounded-3xl flex items-center justify-center mx-auto shadow-2xl animate-pulse">
                  <Layout size={48} className="text-slate-800" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black text-white tracking-tight uppercase">Select a Document</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Use the search bar above to explore global databases. 
                    Select a result to unlock AI analysis and contextual chat.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 text-left">
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <Brain size={16} className="text-emerald-500 mb-2" />
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Analysis</h4>
                    <p className="text-[10px] text-slate-600">Technical summary and document explanation.</p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <MessageSquare size={16} className="text-emerald-500 mb-2" />
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">RAG Chat</h4>
                    <p className="text-[10px] text-slate-600">Specific questions about the full text.</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
          height: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        .prose h1, .prose h2, .prose h3 {
          color: white !important;
          font-weight: 900 !important;
          text-transform: uppercase;
          letter-spacing: -0.02em;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding-bottom: 0.5rem;
          margin-top: 2rem !important;
        }
        .prose p {
          color: #94a3b8 !important;
          line-height: 1.8 !important;
        }
        .prose strong {
          color: #10b981 !important;
        }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slide-in-from-bottom-2 { from { transform: translateY(0.5rem); } to { transform: translateY(0); } }
        @keyframes slide-in-from-right-2 { from { transform: translateX(0.5rem); } to { transform: translateX(0); } }
        .animate-in { animation: fade-in 0.5s ease-out, slide-in-from-bottom-2 0.5s ease-out; }
      `}</style>
    </div>
  );
}
