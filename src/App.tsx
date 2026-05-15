import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  Shield, 
  ShieldCheck,
  Zap,
  Rocket,
  Download,
  BarChart4,
  Users, 
  DollarSign, 
  Activity,
  Activity as ActivityIcon, 
  BarChart3, 
  Search,
  Plus,
  LayoutDashboard,
  Star,
  PieChart as PieChartIcon,
  Briefcase,
  X,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  LogOut,
  LogIn,
  Trash2,
  RefreshCcw,
  Filter,
  Calendar,
  MapPin,
  Globe,
  ExternalLink,
  Check
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  ZAxis,
  Legend
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import { MOCK_STARTUPS } from './data/mockStartups';
import { getAIInvestmentThesis } from './services/aiService';
import { ExternalApiService } from './services/externalApiService';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy,
  Timestamp,
  User
} from './firebase';
import { StartupScorer } from './utils/startupScorer';

// --- Types ---
interface Startup {
  id: string;
  name: string;
  sector: string;
  stage: string;
  market_potential: number;
  funding_total: number;
  burn_rate: number;
  revenue_growth_pct: number;
  team_pedigree: number;
  competitive_moat: string;
  location?: string;
  founded_date?: string;
  last_funding_round?: string;
  last_funding_date?: string;
  total_score: number;
  market_score: number;
  growth_score: number;
  financial_score: number;
  ai_insight?: string | null;
  uid: string;
  createdAt?: any;
}

interface AIInsight {
  thesis: string;
  green_flag: string;
  red_flag: string;
  risk_analysis: {
    level: 'Low' | 'Moderate' | 'High';
    factors: string[];
    interpretation: string;
  };
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [startups, setStartups] = useState<Startup[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStartup, setSelectedStartup] = useState<Startup | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [dateFilter, setDateFilter] = useState('all'); // all, 6months, 1year
  const [locationFilter, setLocationFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');

  const [externalResults, setExternalResults] = useState<Partial<Startup>[]>([]);
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);
  const [showExternalResults, setShowExternalResults] = useState(false);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Firestore Listener
  useEffect(() => {
    if (!isAuthReady || !user) {
      setStartups([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'startups'),
      where('uid', '==', user.uid),
      orderBy('total_score', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Startup));
      setStartups(data);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAuthReady, user]);

  // External Search Logic
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setIsSearchingExternal(true);
        setShowExternalResults(true);
        try {
          const results = await ExternalApiService.fetchCompanies(searchQuery);
          setExternalResults(results as any);
        } catch (error) {
          console.error("External search failed:", error);
        } finally {
          setIsSearchingExternal(false);
        }
      } else {
        setExternalResults([]);
        setShowExternalResults(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleSeedData = async () => {
    if (!user) return;
    setSeeding(true);
    try {
      for (const mock of MOCK_STARTUPS) {
        // Calculate scores for mock data
        const scores = StartupScorer.calculateScore(mock as any);
        const newStartup = {
          ...mock,
          ...scores,
          uid: user.uid,
          ai_insight: null,
          createdAt: Timestamp.now()
        };
        const startupRef = doc(collection(db, 'startups'));
        await setDoc(startupRef, newStartup);
      }
    } catch (error) {
      console.error("Seeding failed:", error);
    } finally {
      setSeeding(false);
    }
  };

  const handleSyncFromAPI = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const externalCompanies = await ExternalApiService.fetchCompanies(searchQuery);
      
      for (const company of externalCompanies) {
        await addExternalCompany(company);
      }
    } catch (error) {
      console.error("Sync failed:", error);
    } finally {
      setSyncing(false);
    }
  };

  const addExternalCompany = async (company: Partial<Startup>) => {
    if (!user) return;
    // Check if already exists by name
    const exists = startups.some(s => s.name.toLowerCase() === company.name?.toLowerCase());
    if (exists) return;

    const scores = StartupScorer.calculateScore(company as any);
    const newStartup = {
      ...company,
      ...scores,
      uid: user.uid,
      ai_insight: null,
      createdAt: Timestamp.now()
    };
    const startupRef = doc(collection(db, 'startups'));
    await setDoc(startupRef, newStartup);
  };

  const filteredStartups = useMemo(() => {
    let list = startups;
    
    // Date Filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const months = dateFilter === '6months' ? 6 : 12;
      const cutoff = new Date(now.setMonth(now.getMonth() - months));
      
      list = list.filter(s => {
        const fundingDate = s.last_funding_date ? new Date(s.last_funding_date) : null;
        return fundingDate && fundingDate >= cutoff;
      });
    }

    // Location Filter
    if (locationFilter !== 'all') {
      list = list.filter(s => s.location?.toLowerCase().includes(locationFilter.toLowerCase()));
    }

    // Sector Filter
    if (sectorFilter !== 'all') {
      list = list.filter(s => s.sector === sectorFilter);
    }

    if (activeTab === 'top') {
      list = [...list].sort((a, b) => b.total_score - a.total_score).slice(0, 3);
    }
    return list.filter(s => 
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.sector.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [startups, searchQuery, activeTab, dateFilter, locationFilter]);

  const locations = useMemo(() => {
    const locs = new Set(startups.map(s => s.location).filter(Boolean));
    return Array.from(locs) as string[];
  }, [startups]);

  const stats = useMemo(() => {
    const total = startups.length;
    const avgScore = total > 0 ? Math.round(startups.reduce((acc, s) => acc + s.total_score, 0) / total) : 0;
    const highPotential = startups.filter(s => s.total_score >= 80).length;
    const sectors = new Set(startups.map(s => s.sector)).size;
    return { total, avgScore, highPotential, sectors };
  }, [startups]);

  const handleViewInsights = async (startup: Startup) => {
    setSelectedStartup(startup);
    setIsModalOpen(true);
    
    if (!startup.ai_insight) {
      setGeneratingAI(true);
      try {
        const insight = await getAIInvestmentThesis(startup);
        // Save to Firestore
        await updateDoc(doc(db, 'startups', startup.id), { ai_insight: insight });
        // Local state is updated by onSnapshot
      } catch (error) {
        console.error("AI generation failed:", error);
      } finally {
        setGeneratingAI(false);
      }
    }
  };

  const handleDeleteStartup = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this startup?")) {
      try {
        await deleteDoc(doc(db, 'startups', id));
      } catch (error) {
        console.error("Delete failed:", error);
      }
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-emerald-50 text-emerald-600 border-emerald-100';
    if (score >= 50) return 'bg-amber-50 text-amber-600 border-amber-100';
    return 'bg-rose-50 text-rose-600 border-rose-100';
  };

  const getScoreDot = (score: number) => {
    if (score >= 80) return 'bg-emerald-500';
    if (score >= 50) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Low': return 'text-emerald-500 bg-emerald-50 border-emerald-100';
      case 'Moderate': return 'text-amber-500 bg-amber-50 border-amber-100';
      case 'High': return 'text-rose-500 bg-rose-50 border-rose-100';
      default: return 'text-slate-500 bg-slate-50 border-slate-100';
    }
  };

  const getRiskDot = (level: string) => {
    switch (level) {
      case 'Low': return 'bg-emerald-500';
      case 'Moderate': return 'bg-amber-500';
      case 'High': return 'bg-rose-500';
      default: return 'bg-slate-500';
    }
  };

  const parseInsight = (insight: string | null | undefined): AIInsight | null => {
    if (!insight) return null;
    try {
      return JSON.parse(insight);
    } catch (e) {
      // Handle old legacy string format if necessary, but here we assume new format
      return null;
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">
        <Loader2 className="w-8 h-8 text-slate-900 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F9FA] p-4">
        <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-8 shadow-xl shadow-slate-900/20">
          <TrendingUp className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-2 tracking-tight">VenturePulse</h1>
        <p className="text-slate-500 mb-8 text-center max-w-md">The AI-Driven Startup Intelligence Platform for modern VCs and Angel Investors.</p>
        <button 
          onClick={handleLogin}
          className="flex items-center gap-3 bg-white border border-slate-200 px-8 py-4 rounded-2xl font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-sm hover:shadow-md"
        >
          <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#F8F9FA] text-slate-700 font-sans">
      {/* Sidebar */}
      <aside className="w-20 lg:w-64 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen z-40">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-900 rounded flex items-center justify-center shrink-0">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-slate-900 tracking-tight hidden lg:block">VenturePulse</span>
        </div>
        
        <nav className="flex-1 px-4 space-y-2 mt-4">
          <SidebarItem 
            icon={<LayoutDashboard size={20} />} 
            label="All Startups" 
            active={activeTab === 'all'} 
            onClick={() => setActiveTab('all')}
          />
          <SidebarItem 
            icon={<Star size={20} />} 
            label="Top Picks" 
            active={activeTab === 'top'} 
            onClick={() => setActiveTab('top')}
          />
          <SidebarItem 
            icon={<PieChartIcon size={20} />} 
            label="Analytics" 
            active={activeTab === 'analytics'} 
            onClick={() => setActiveTab('analytics')}
          />
          <SidebarItem 
            icon={<Briefcase size={20} />} 
            label="Investor View" 
            active={activeTab === 'investors'} 
            onClick={() => setActiveTab('investors')}
          />
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-all group"
          >
            <LogOut size={20} />
            <span className="text-sm font-medium hidden lg:block">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 px-8 flex items-center justify-between sticky top-0 z-30">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search startups, sectors..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => searchQuery.length >= 2 && setShowExternalResults(true)}
            />

            {/* External Search Results Dropdown */}
            <AnimatePresence>
              {showExternalResults && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden max-h-[400px] flex flex-col"
                >
                  <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">External Results (Tracxn/Web)</span>
                    <button onClick={() => setShowExternalResults(false)} className="text-slate-400 hover:text-slate-600">
                      <Plus size={14} className="rotate-45" />
                    </button>
                  </div>
                  
                  <div className="overflow-y-auto">
                    {isSearchingExternal ? (
                      <div className="p-8 flex flex-col items-center justify-center gap-3">
                        <Loader2 size={24} className="animate-spin text-slate-400" />
                        <span className="text-xs text-slate-500">Searching global databases...</span>
                      </div>
                    ) : externalResults.length > 0 ? (
                      <div className="divide-y divide-slate-50">
                        {externalResults.map((result, idx) => {
                          const isAlreadyAdded = startups.some(s => s.name.toLowerCase() === result.name?.toLowerCase());
                          return (
                            <div key={idx} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                                  <Globe size={18} />
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">{result.name}</div>
                                  <div className="text-[10px] text-slate-500 flex items-center gap-2">
                                    <span>{result.sector}</span>
                                    <span>•</span>
                                    <span>{result.location}</span>
                                  </div>
                                </div>
                              </div>
                              <button 
                                onClick={() => addExternalCompany(result)}
                                disabled={isAlreadyAdded}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  isAlreadyAdded 
                                  ? 'bg-emerald-50 text-emerald-600 cursor-default' 
                                  : 'bg-slate-900 text-white hover:bg-slate-800'
                                }`}
                              >
                                {isAlreadyAdded ? (
                                  <>
                                    <Check size={14} />
                                    <span>Added</span>
                                  </>
                                ) : (
                                  <>
                                    <Plus size={14} />
                                    <span>Add to Portfolio</span>
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-8 text-center">
                        <div className="text-slate-300 mb-2">
                          <Search size={32} className="mx-auto opacity-20" />
                        </div>
                        <p className="text-xs text-slate-500">No external matches found for "{searchQuery}"</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                    <p className="text-[10px] text-slate-400">Data powered by Tracxn & Market Intelligence APIs</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={handleSyncFromAPI}
              disabled={syncing}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Sync from External API (e.g. Tracxn)"
            >
              <RefreshCcw size={18} className={syncing ? 'animate-spin' : ''} />
              <span className="hidden lg:inline">{syncing ? 'Syncing...' : 'Sync API'}</span>
            </button>
            <button 
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <Plus size={18} />
              <span className="hidden sm:inline">Add Startup</span>
            </button>
            <div className="w-8 h-8 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
              <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-full h-full object-cover" />
            </div>
          </div>
        </header>

        <div className="p-8 space-y-8">
          {activeTab === 'analytics' ? (
            <AnalyticsView 
              startups={startups} 
              dateFilter={dateFilter}
              setDateFilter={setDateFilter}
              sectorFilter={sectorFilter}
              setSectorFilter={setSectorFilter}
            />
          ) : activeTab === 'investors' ? (
            <InvestorView startups={startups} />
          ) : (
            <>
              {/* Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="Total Tracked" value={stats.total} icon={<Users className="text-blue-500" />} />
                <StatCard label="Avg. Success Score" value={stats.avgScore} suffix="%" icon={<Activity className="text-emerald-500" />} />
                <StatCard label="High-Potential" value={stats.highPotential} icon={<Star className="text-amber-500" />} />
                <StatCard label="Sector Diversity" value={stats.sectors} icon={<PieChartIcon className="text-purple-500" />} />
              </div>

              {/* Startup List */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h2 className="font-semibold text-slate-900">
                    {activeTab === 'top' ? 'Top Investment Picks' : 'Startup Intelligence List'}
                  </h2>
                  
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Date Filter */}
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                      <Calendar size={14} className="text-slate-400" />
                      <select 
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="bg-transparent text-xs font-medium focus:outline-none text-slate-600"
                      >
                        <option value="all">All Time</option>
                        <option value="6months">Past 6 Months</option>
                        <option value="1year">Past Year</option>
                      </select>
                    </div>

                    {/* Location Filter */}
                    <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                      <MapPin size={14} className="text-slate-400" />
                      <select 
                        value={locationFilter}
                        onChange={(e) => setLocationFilter(e.target.value)}
                        className="bg-transparent text-xs font-medium focus:outline-none text-slate-600"
                      >
                        <option value="all">All Locations</option>
                        {locations.map(loc => (
                          <option key={loc} value={loc}>{loc}</option>
                        ))}
                      </select>
                    </div>

                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider ml-2">
                      {activeTab === 'top' ? 'Top 3 by Score' : `${filteredStartups.length} Results`}
                    </div>
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/50">
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Startup Name</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sector</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Location</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Round</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Success Score</th>
                        <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loading ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm italic">
                            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                            Loading intelligence data...
                          </td>
                        </tr>
                      ) : filteredStartups.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-16 text-center">
                            <div className="flex flex-col items-center justify-center gap-4">
                              <div className="p-4 bg-slate-50 rounded-full">
                                <Search className="w-8 h-8 text-slate-300" />
                              </div>
                              <div className="space-y-1">
                                <p className="text-slate-900 font-semibold text-base">Your intelligence list is empty</p>
                                <p className="text-slate-400 text-sm max-w-[280px] mx-auto">Start tracking startups by adding them manually or seed with demo data to explore the platform.</p>
                              </div>
                              <div className="flex items-center gap-3 mt-4">
                                <button 
                                  onClick={() => setIsAddModalOpen(true)}
                                  className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-semibold hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10"
                                >
                                  <Plus size={16} />
                                  Add Startup
                                </button>
                                <button 
                                  onClick={handleSeedData}
                                  disabled={seeding}
                                  className="flex items-center gap-2 px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-semibold hover:bg-slate-50 transition-all disabled:opacity-50"
                                >
                                  {seeding ? <Loader2 size={16} className="animate-spin" /> : <Activity size={16} />}
                                  Seed Demo Data
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : filteredStartups.map((startup) => (
                        <tr key={startup.id} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{startup.name}</div>
                            <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{startup.competitive_moat}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded">{startup.sector}</span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <MapPin size={12} className="text-slate-300" />
                              {startup.location || 'N/A'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-xs font-medium text-slate-700">{startup.last_funding_round || startup.stage}</div>
                            <div className="text-[10px] text-slate-400">{startup.last_funding_date ? new Date(startup.last_funding_date).toLocaleDateString() : 'N/A'}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold ${getScoreColor(startup.total_score)}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${getScoreDot(startup.total_score)}`} />
                              {startup.total_score}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-4">
                              <button 
                                onClick={(e) => handleDeleteStartup(startup.id, e)}
                                className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                              <button 
                                onClick={() => handleViewInsights(startup)}
                                className="text-xs font-semibold text-slate-900 hover:text-slate-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform"
                              >
                                View AI Insights
                                <ChevronRight size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* AI Insight Modal */}
      <AnimatePresence>
        {isModalOpen && selectedStartup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{selectedStartup.name}</h3>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1">AI Intelligence Report</p>
                </div>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X size={20} className="text-slate-400" />
                </button>
              </div>

              <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh]">
                {/* Score Breakdown */}
                <section>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <BarChart3 size={14} /> Numerical Score Breakdown
                  </h4>
                  <div className="grid grid-cols-3 gap-4">
                    <ScoreCard label="Market" value={selectedStartup.market_score} max={40} color="bg-blue-500" />
                    <ScoreCard label="Growth" value={selectedStartup.growth_score} max={30} color="bg-emerald-500" />
                    <ScoreCard label="Financial" value={selectedStartup.financial_score} max={30} color="bg-amber-500" />
                  </div>
                </section>

                {/* AI Thesis */}
                <section>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Shield size={14} /> Investment Thesis
                  </h4>
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                    {generatingAI ? (
                      <div className="flex flex-col items-center justify-center py-8 gap-3 text-slate-400 italic text-sm">
                        <Loader2 className="w-8 h-8 animate-spin text-slate-900" />
                        <p>Gemini is analyzing market data and financial health...</p>
                      </div>
                    ) : selectedStartup.ai_insight ? (() => {
                      const insight = parseInsight(selectedStartup.ai_insight);
                      if (!insight) return (
                        <div className="flex flex-col items-center justify-center py-8 gap-3 text-slate-400 italic text-sm">
                          <AlertCircle className="w-8 h-8 opacity-20" />
                          <p>Incompatible data format. Re-generate analysis to view risk metrics.</p>
                          <button 
                            onClick={async () => {
                              setGeneratingAI(true);
                              try {
                                const newInsight = await getAIInvestmentThesis(selectedStartup);
                                await updateDoc(doc(db, 'startups', selectedStartup.id), { ai_insight: newInsight });
                              } catch (err) {
                                console.error(err);
                              } finally {
                                setGeneratingAI(false);
                              }
                            }}
                            className="bg-slate-900 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider not-italic"
                          >
                            Re-generate
                          </button>
                        </div>
                      );

                      return (
                        <div className="space-y-8">
                          <p className="text-slate-600 leading-relaxed text-sm italic">
                            "{insight.thesis}"
                          </p>
                          
                          {/* Risk Classification Result Module */}
                          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6 shadow-sm overflow-hidden relative">
                            <div className="absolute top-0 left-0 w-1 h-full bg-slate-900" />
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <Shield size={12} className="text-slate-900" /> Risk Classification Result
                              </h4>
                              <div className={`flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getRiskColor(insight.risk_analysis.level)}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${getRiskDot(insight.risk_analysis.level)} animate-pulse`} />
                                {insight.risk_analysis.level} Risk
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                              <div className="space-y-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Primary Risk Factors (SVM Analysis)</p>
                                <div className="space-y-3">
                                  {insight.risk_analysis.factors.map((factor, i) => (
                                    <div key={i} className="flex items-start gap-3 text-xs text-slate-600">
                                      <div className="mt-1.5 w-1 h-1 rounded-full bg-slate-300 shrink-0" />
                                      {factor}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-4">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Qualitative Interpretation</p>
                                <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                                  {insight.risk_analysis.interpretation}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2 bg-emerald-50/30 p-4 rounded-xl border border-emerald-100/50">
                              <div className="flex items-center gap-2 text-emerald-600 font-bold text-[10px] uppercase tracking-widest">
                                <CheckCircle2 size={14} /> Green Flag
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed">
                                {insight.green_flag}
                              </p>
                            </div>
                            <div className="space-y-2 bg-rose-50/30 p-4 rounded-xl border border-rose-100/50">
                              <div className="flex items-center gap-2 text-rose-600 font-bold text-[10px] uppercase tracking-widest">
                                <AlertCircle size={14} /> Red Flag
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed">
                                {insight.red_flag}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })() : (
                      <p className="text-slate-400 italic text-sm">No insight available.</p>
                    )}
                  </div>
                </section>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
                >
                  Close Report
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Startup Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden"
            >
              <AddStartupForm 
                onClose={() => setIsAddModalOpen(false)} 
                uid={user.uid} 
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AddStartupForm({ onClose, uid }: { onClose: () => void, uid: string }) {
  const [formData, setFormData] = useState({
    name: '',
    sector: '',
    stage: 'Early',
    market_potential: 5,
    funding_total: 0,
    burn_rate: 0,
    revenue_growth_pct: 0,
    team_pedigree: 5,
    competitive_moat: '',
    location: '',
    founded_date: '',
    last_funding_round: 'Seed',
    last_funding_date: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const scores = StartupScorer.calculateScore(formData);
      const newStartup = {
        ...formData,
        ...scores,
        uid,
        ai_insight: null,
        createdAt: Timestamp.now()
      };
      
      const startupRef = doc(collection(db, 'startups'));
      await setDoc(startupRef, newStartup);
      onClose();
    } catch (error) {
      console.error("Add failed:", error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full">
      <div className="p-8 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">Add New Startup</h3>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mt-1">Intelligence Input</p>
        </div>
        <button type="button" onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full">
          <X size={20} className="text-slate-400" />
        </button>
      </div>

      <div className="p-8 space-y-6 overflow-y-auto max-h-[60vh]">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name</label>
            <input 
              required
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sector</label>
            <input 
              required
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              value={formData.sector}
              onChange={e => setFormData({...formData, sector: e.target.value})}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Stage</label>
            <select 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              value={formData.stage}
              onChange={e => setFormData({...formData, stage: e.target.value})}
            >
              <option>Early</option>
              <option>Growth</option>
              <option>Late</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Market Potential (1-10)</label>
            <input 
              type="number" min="1" max="10"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              value={formData.market_potential}
              onChange={e => setFormData({...formData, market_potential: parseInt(e.target.value)})}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Funding ($)</label>
            <input 
              type="number"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              value={formData.funding_total}
              onChange={e => setFormData({...formData, funding_total: parseFloat(e.target.value)})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Burn Rate ($)</label>
            <input 
              type="number"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              value={formData.burn_rate}
              onChange={e => setFormData({...formData, burn_rate: parseFloat(e.target.value)})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Growth (%)</label>
            <input 
              type="number"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              value={formData.revenue_growth_pct}
              onChange={e => setFormData({...formData, revenue_growth_pct: parseFloat(e.target.value)})}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Location</label>
            <input 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              placeholder="e.g. Bangalore, India"
              value={formData.location}
              onChange={e => setFormData({...formData, location: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Founded Date</label>
            <input 
              type="date"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              value={formData.founded_date}
              onChange={e => setFormData({...formData, founded_date: e.target.value})}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Funding Round</label>
            <select 
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              value={formData.last_funding_round}
              onChange={e => setFormData({...formData, last_funding_round: e.target.value})}
            >
              <option>Seed</option>
              <option>Series A</option>
              <option>Series B</option>
              <option>Series C+</option>
              <option>IPO</option>
              <option>Bootstrapped</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Funding Date</label>
            <input 
              type="date"
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5"
              value={formData.last_funding_date}
              onChange={e => setFormData({...formData, last_funding_date: e.target.value})}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Competitive Moat</label>
          <textarea 
            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 min-h-[80px]"
            value={formData.competitive_moat}
            onChange={e => setFormData({...formData, competitive_moat: e.target.value})}
          />
        </div>
      </div>

      <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
        <button 
          type="button"
          onClick={onClose}
          className="px-6 py-2 text-slate-500 text-sm font-medium hover:text-slate-700"
        >
          Cancel
        </button>
        <button 
          disabled={submitting}
          className="px-8 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {submitting && <Loader2 size={14} className="animate-spin" />}
          Add Intelligence Profile
        </button>
      </div>
    </form>
  );
}

function AnalyticsView({ 
  startups, 
  dateFilter, 
  setDateFilter, 
  sectorFilter, 
  setSectorFilter 
}: { 
  startups: Startup[], 
  dateFilter: string, 
  setDateFilter: (val: string) => void,
  sectorFilter: string,
  setSectorFilter: (val: string) => void
}) {
  const filteredData = useMemo(() => {
    let list = startups;
    
    // Date Filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const months = dateFilter === '6months' ? 6 : 12;
      const cutoff = new Date(now.setMonth(now.getMonth() - months));
      list = list.filter(s => {
        const fundingDate = s.last_funding_date ? new Date(s.last_funding_date) : null;
        return fundingDate && fundingDate >= cutoff;
      });
    }

    // Sector Filter
    if (sectorFilter !== 'all') {
      list = list.filter(s => s.sector === sectorFilter);
    }

    return list;
  }, [startups, dateFilter, sectorFilter]);

  const allSectors = useMemo(() => {
    return Array.from(new Set(startups.map(s => s.sector)));
  }, [startups]);

  // 1. Investment Score Distribution (Histogram)
  const scoreDistribution = useMemo(() => {
    const buckets = [
      { range: '0-20', count: 0 },
      { range: '21-40', count: 0 },
      { range: '41-60', count: 0 },
      { range: '61-80', count: 0 },
      { range: '81-100', count: 0 },
    ];
    filteredData.forEach(s => {
      const score = s.total_score;
      if (score <= 20) buckets[0].count++;
      else if (score <= 40) buckets[1].count++;
      else if (score <= 60) buckets[2].count++;
      else if (score <= 80) buckets[3].count++;
      else buckets[4].count++;
    });
    return buckets;
  }, [filteredData]);

  // 2. Sector-wise Recommendation Distribution (Pie)
  // We'll define "Recommended" as startups with total_score > 70
  const sectorRecData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredData.filter(s => s.total_score >= 70).forEach(s => {
      counts[s.sector] = (counts[s.sector] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredData]);

  // 3. Funding Stage vs Investment Score (Scatter)
  const scatterData = useMemo(() => {
    const stagesOrder: Record<string, number> = {
      'Seed': 1,
      'Series A': 2,
      'Series B': 3,
      'Series C+': 4,
      'IPO': 5,
      'Bootstrapped': 0
    };
    return filteredData.map(s => {
      const stage = s.last_funding_round || s.stage || 'Seed';
      return {
        x: stagesOrder[stage] || 0,
        y: s.total_score,
        name: s.name,
        stage: stage
      };
    });
  }, [filteredData]);

  // 4. Risk Classification Frequency (BarChart)
  const riskData = useMemo(() => {
    const risks = { 'Low': 0, 'Moderate': 0, 'High': 0 };
    filteredData.forEach(s => {
      if (s.ai_insight) {
        try {
          const insight = JSON.parse(s.ai_insight);
          const level = insight?.risk_analysis?.level;
          if (level && risks[level as keyof typeof risks] !== undefined) {
            risks[level as keyof typeof risks]++;
          }
        } catch (e) {}
      }
    });
    return Object.entries(risks).map(([name, count]) => ({ name, count }));
  }, [filteredData]);

  const COLORS = ['#0F172A', '#334155', '#64748B', '#94A3B8', '#CBD5E1'];
  const RISK_COLORS: Record<string, string> = {
    'Low': '#10B981',
    'Moderate': '#F59E0B',
    'High': '#EF4444'
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Analytics Filters */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Portfolio Analytics Dashboard</h2>
          <p className="text-xs text-slate-400">Interactive visualizations based on global intelligence data</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <Calendar size={14} className="text-slate-400" />
            <select 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-transparent text-xs font-medium focus:outline-none text-slate-600"
            >
              <option value="all">All Time</option>
              <option value="6months">Past 6 Months</option>
              <option value="1year">Past Year</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
            <PieChartIcon size={14} className="text-slate-400" />
            <select 
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="bg-transparent text-xs font-medium focus:outline-none text-slate-600"
            >
              <option value="all">All Sectors</option>
              {allSectors.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 1. Investment Score Distribution (Histogram-like BarChart) */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2">
            <BarChart3 size={18} className="text-blue-500" /> Score Distribution Histogram
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreDistribution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip 
                  cursor={{ fill: '#F8F9FA' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. Sector-wise Recommendation Distribution (PieChart) */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2">
            <PieChartIcon size={18} className="text-purple-500" /> Sector Recommendations (Score &gt; 70)
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sectorRecData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {sectorRecData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Funding Stage vs Investment Score (ScatterPlot) */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-500" /> Stage vs. Success Score
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                <XAxis 
                  type="number" 
                  dataKey="x" 
                  name="Stage" 
                  domain={[0, 6]}
                  ticks={[0, 1, 2, 3, 4, 5]}
                  tickFormatter={(val) => {
                    const labels = ['Bstrp', 'Seed', 'Ser A', 'Ser B', 'Ser C+', 'IPO'];
                    return labels[val] || '';
                  }}
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#64748B' }}
                />
                <YAxis 
                  type="number" 
                  dataKey="y" 
                  name="Score" 
                  unit="%" 
                  axisLine={false}
                  tick={{ fontSize: 10, fill: '#64748B' }}
                />
                <ZAxis type="number" range={[100, 100]} />
                <Tooltip 
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xl text-xs">
                          <p className="font-bold text-slate-900">{data.name}</p>
                          <p className="text-slate-500">Stage: {data.stage}</p>
                          <p className="text-emerald-600 font-bold">Score: {data.y}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter name="Startups" data={scatterData} fill="#0F172A">
                  {scatterData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.y >= 70 ? '#10B981' : '#64748B'} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. Risk Classification Frequency (BarChart) */}
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Shield size={18} className="text-rose-500" /> Risk Level Distribution
          </h3>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip 
                  cursor={{ fill: '#F8F9FA' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={40}>
                  {riskData.map((entry) => (
                    <Cell key={`cell-${entry.name}`} fill={RISK_COLORS[entry.name] || '#CBD5E1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Portfolio Health Summary (Footer item in analytics) */}
      <div className="bg-slate-900 p-8 rounded-3xl text-white overflow-hidden relative">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-end md:items-center gap-6">
          <div className="space-y-2">
            <h3 className="text-sm font-bold opacity-60 uppercase tracking-widest">Portfolio ROI Index</h3>
            <p className="text-2xl font-bold">Aggregate Investment Readiness</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <p className="text-3xl font-bold">{filteredData.length}</p>
              <p className="text-[10px] opacity-60 font-bold uppercase tracking-widest">Companies</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-emerald-400">
                {filteredData.length > 0 ? (filteredData.filter(s => s.total_score >= 80).length) : 0}
              </p>
              <p className="text-[10px] opacity-60 font-bold uppercase tracking-widest">Alpha Picks</p>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl opacity-20" />
      </div>
    </div>
  );
}

function InvestorView({ startups }: { startups: Startup[] }) {
  const stats = useMemo(() => {
    const totalCapital = startups.reduce((acc, s) => acc + (s.funding_total || 0), 0);
    const avgIRR = 24.5; // Mocked aggregate IRR
    const dryPowder = 5.2; // Mocked in Millions
    const alphaCount = startups.filter(s => s.total_score >= 85).length;
    
    return { totalCapital, avgIRR, dryPowder, alphaCount };
  }, [startups]);

  const stagesData = useMemo(() => {
    const counts: Record<string, number> = {};
    startups.forEach(s => {
      const stage = s.last_funding_round || s.stage || 'Seed';
      counts[stage] = (counts[stage] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [startups]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl px-1" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="text-indigo-600" size={20} />
            <h2 className="text-xl font-bold text-slate-900">Investor Control Center</h2>
          </div>
          <p className="text-xs text-slate-400 font-medium">Exclusive data for GP/LP reporting and high-fidelity project management</p>
        </div>
        <div className="flex gap-4 relative z-10">
          <button className="bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-800 transition-all flex items-center gap-2">
            <Download size={14} /> Export LP Report
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg w-fit">
            <DollarSign size={20} />
          </div>
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Capital Deployed</h4>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">${stats.totalCapital.toFixed(1)}M</div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold mt-1">
              <TrendingUp size={10} /> +12.4% YoY
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg w-fit">
            <ActivityIcon size={20} />
          </div>
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Aggregate IRR</h4>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{stats.avgIRR}%</div>
            <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-bold mt-1">
              <TrendingUp size={10} /> Target: 20%
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-lg w-fit">
            <Zap size={20} />
          </div>
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Dry Powder</h4>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">${stats.dryPowder}M</div>
            <div className="flex items-center gap-1 text-[10px] text-amber-500 font-bold mt-1">
              <RefreshCcw size={10} /> Ready to Deploy
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="p-2 bg-purple-50 text-purple-600 rounded-lg w-fit">
            <Rocket size={20} />
          </div>
          <div>
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Alpha Projects</h4>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">{stats.alphaCount}</div>
            <div className="text-[10px] text-slate-400 font-medium mt-1">Score ≥ 85 Intelligence</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <BarChart4 size={18} className="text-indigo-500" /> Capital Allocation vs Fund Target
            </h3>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-indigo-500" /> Invested</div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-100" /> Remaining</div>
            </div>
          </div>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stagesData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip 
                  cursor={{ fill: '#F8F9FA' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="value" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-900 p-8 rounded-3xl text-white space-y-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl px-1" />
          <div className="space-y-1 relative z-10">
            <h3 className="text-[10px] font-bold opacity-60 uppercase tracking-widest">LP Communication</h3>
            <p className="text-lg font-bold">Recent Investor Reports</p>
          </div>

          <div className="space-y-4 relative z-10">
            {[
              { title: 'Q1 Portfolio Performance', date: '2 days ago', status: 'Delivered' },
              { title: 'Sector deep-dive: AI SaaS', date: '1 week ago', status: 'Opened' },
              { title: 'Capital Call Notice #4', date: '2 weeks ago', status: 'Pending' }
            ].map((report, i) => (
              <div key={i} className="bg-white/5 p-4 rounded-2xl border border-white/10 hover:bg-white/10 transition-all cursor-pointer group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold">{report.title}</span>
                  <ChevronRight size={14} className="opacity-40 group-hover:translate-x-1 transition-transform" />
                </div>
                <div className="flex items-center justify-between text-[10px] opacity-40">
                  <span>{report.date}</span>
                  <span className={report.status === 'Pending' ? 'text-amber-400' : 'text-emerald-400'}>{report.status}</span>
                </div>
              </div>
            ))}
          </div>

          <button className="w-full py-4 bg-white text-slate-900 rounded-2xl text-xs font-bold shadow-xl shadow-white/5 hover:bg-slate-50 transition-all relative z-10">
            Schedule New Quarterly Call
          </button>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group ${
        active 
          ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20' 
          : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
      }`}
    >
      <div className="shrink-0">{icon}</div>
      <span className="text-sm font-medium hidden lg:block">{label}</span>
    </button>
  );
}

function StatCard({ label, value, suffix = '', icon }: { label: string, value: number | string, suffix?: string, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className="p-2 bg-slate-50 rounded-lg">{icon}</div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">
          <ArrowUpRight size={10} />
          <span>+2.4%</span>
        </div>
      </div>
      <div className="text-2xl font-bold text-slate-900">{value}{suffix}</div>
      <div className="text-xs font-medium text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function ScoreCard({ label, value, max, color }: { label: string, value: number, max: number, color: string }) {
  const percentage = (value / max) * 100;
  return (
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
      <div className="flex justify-between items-end mb-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
        <span className="text-sm font-bold text-slate-900">{value}<span className="text-slate-300 text-[10px]">/{max}</span></span>
      </div>
      <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={`h-full ${color}`}
        />
      </div>
    </div>
  );
}
