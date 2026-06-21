import React, { useEffect, useState } from 'react';
import { 
  Users, 
  Settings as SettingsIcon, 
  ShieldCheck, 
  Bell, 
  Database,
  Key,
  ChevronRight,
  Globe,
  Plus,
  Trash2,
  Save,
  X,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { usePermissions } from '../hooks/usePermissions';
import { motion, AnimatePresence } from 'framer-motion';
import { settingsService } from '../services/settingsService';
import { userService } from '../services/userService';
import { leadService } from '../services/leadService';
import { syncService } from '../services/syncService';
import { DropdownOption, UserRole } from '../types';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

export default function Settings() {
  const { user, logout, login, isOfflineMode } = useAuthStore();
  const { canAccess } = usePermissions();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'dropdowns'>('overview');
  const [options, setOptions] = useState<DropdownOption[]>([]);
  const [editingOption, setEditingOption] = useState<{type: string, value: string}>({ type: 'Area', value: '' });
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState(user?.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [activeSection, setActiveSection] = useState('overview');

  // Password management states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const handleUpdateName = async () => {
    if (!user || !newName.trim()) return;
    setLoading(true);
    try {
      const updatedUser = { ...user, name: newName, avatarUrl: avatarUrl };
      await userService.updateUser(user.id, updatedUser);
      login(updatedUser, isOfflineMode);
      toast.success('Identity synchronized across network');
    } catch (err) {
      toast.error('Network synchronization failure');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!user) return;
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('All password fields are required');
      return;
    }
    if (newPassword.length < 5) {
      toast.error('New password must be at least 5 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      const dbUser = await userService.getUser(user.id);
      const actualPassword = dbUser?.password || 'shanta123';

      if (currentPassword !== actualPassword) {
        toast.error('Current password is incorrect');
        return;
      }

      const updatedUser = { ...user, password: newPassword };
      await userService.updateUser(user.id, updatedUser);
      login(updatedUser, isOfflineMode);

      toast.success('Security password updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to update system security keys');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    if (activeTab === 'dropdowns') {
      loadOptions();
    }
  }, [activeTab]);

  const loadOptions = async () => {
    setLoading(true);
    try {
      // In a real scenario, we'd fetch all or by specific type
      // For simplicity, let's fetch a sample or implement getAll if needed
      // Actually settingsService has getOptionsByType
      const types: any[] = ['Area', 'Source', 'Product', 'Campaign', 'Profession', 'FollowUpStatus'];
      const all: DropdownOption[] = [];
      for (const type of types) {
        const res = await settingsService.getOptionsByType(type);
        all.push(...res.map(val => ({ type, value: val, status: 'Active' } as DropdownOption)));
      }
      setOptions(all);
    } finally {
      setLoading(false);
    }
  };

  const setLeads = (data: any) => {}; // Oops, typo in thought process, ignored

  const handleAddOption = async () => {
    if (!editingOption.value) return;
    try {
      await settingsService.addOption(editingOption.type, editingOption.value);
      toast.success('Strategy parameter added successfully');
      setEditingOption({ ...editingOption, value: '' });
      loadOptions();
    } catch (err) {
      toast.error('Failed to update system parameters');
    }
  };

  const handleDeleteOption = async (option: DropdownOption) => {
    if (!confirm('Are you sure you want to decommission this strategic parameter?')) return;
    try {
      await settingsService.deleteOption(option.type, option.value);
      toast.success('Matrix parameter decommissioned');
      loadOptions();
    } catch (err) {
      toast.error('Protocol failure during decommission');
    }
  };

  const handleClearData = async () => {
    if (!confirm('CRITICAL: This will purge all lead intelligence from the database. This action is irreversible. Proceed?')) return;
    try {
      await leadService.clearAllLeads();
      toast.success('Lead intelligence matrix purged successfully');
    } catch (err) {
      toast.error('Database purge failed');
    }
  };

  const sections = [
    { id: 'profile', label: 'Identity Settings', icon: Users, desc: 'Manage your profile and display name' },
    { id: 'security', label: 'Security & Access', icon: Key, desc: 'Update passwords and verification' },
    { id: 'notifications', label: 'Push Intelligence', icon: Bell, desc: 'Configure real-time lead alerts' },
    { id: 'system', label: 'System Configuration', icon: SettingsIcon, desc: 'Customize dashboard layout and theme' },
    { id: 'sync', label: 'Network & Sync', icon: Globe, desc: 'Integration endpoints and health' },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#978C21]/5 rounded-sm border border-[#978C21]/10 flex items-center justify-center text-[#978C21]">
            <SettingsIcon className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight italic uppercase serif">System Command Console</h1>
            <p className="text-slate-400 text-[10px] uppercase font-black tracking-widest mt-1">Operational Governance / Configuration Matrix</p>
          </div>
        </div>

        <div className="flex gap-2 bg-slate-50 p-1 rounded-sm border border-slate-100 italic">
          <button 
            onClick={() => setActiveTab('overview')}
            className={cn(
              "px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm transition-all",
              activeTab === 'overview' ? "bg-white text-brand-text shadow-sm" : "text-slate-400 hover:text-slate-600"
            )}
          >
            Overview
          </button>
          {canAccess('admin_settings', 'configure_global_metadata') && (
            <button 
              onClick={() => setActiveTab('dropdowns')}
              className={cn(
                "px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded-sm transition-all",
                activeTab === 'dropdowns' ? "bg-white text-brand-text shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              Strategy Parameters
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'overview' ? (
          <motion.div 
            key="overview"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
          >
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-10 rounded-sm border border-slate-100 text-center shadow-sm italic">
                <div className="w-24 h-24 rounded-sm bg-[#978C21]/5 flex items-center justify-center text-[#978C21] text-3xl font-black mx-auto mb-6 border border-[#978C21]/10 shadow-lg overflow-hidden">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    user?.name.charAt(0)
                  )}
                </div>
                <h3 className="font-black text-xl text-slate-800 uppercase tracking-tight">{user?.name}</h3>
                <p className="text-[10px] font-black text-[#978C21] uppercase tracking-[0.2em] mt-2">{user?.role}</p>
                
                <div className="mt-8 pt-8 border-t border-slate-50 space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    <div className="px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-sm text-[9px] font-black uppercase tracking-widest border border-emerald-100">Live Agent</div>
                    <span className="text-[10px] font-black text-slate-300 italic">ID: {user?.employeeId}</span>
                  </div>
                  
                  <button 
                    onClick={handleLogout}
                    className="w-full py-4 text-red-500 border border-red-100 hover:bg-red-50 rounded-sm font-black text-[10px] uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-2"
                  >
                    Terminate Session
                  </button>
                </div>
              </div>

              <div className="bg-[#3C3C3C] p-8 rounded-sm shadow-xl italic">
                <div className="flex items-center gap-3 mb-4">
                  <ShieldCheck className="w-5 h-5 text-[#978C21]" />
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white">System Compliance</h4>
                </div>
                <p className="text-[11px] font-bold leading-relaxed text-slate-400 uppercase tracking-tight">Terminal verified as Shanta Lead Console v2.0 compliant. Secure authentication active.</p>
              </div>
            </div>

            <div className="lg:col-span-2 space-y-4">
              {activeSection === 'overview' ? (
                <>
                  {sections.map((section, idx) => (
                    <div 
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className="bg-white p-8 rounded-sm border border-slate-100 flex items-center justify-between group cursor-pointer hover:border-[#978C21]/30 transition-all shadow-sm italic"
                    >
                      <div className="flex items-center gap-5">
                        <div className="p-4 bg-slate-50 rounded-sm group-hover:bg-[#978C21]/5 transition-colors border border-slate-50">
                          <section.icon className="w-5 h-5 text-slate-400 group-hover:text-[#978C21]" />
                        </div>
                        <div>
                          <h4 className="font-black text-[13px] text-slate-800 uppercase tracking-widest">{section.label}</h4>
                          <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 tracking-tight">{section.desc}</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-[#978C21] transition-all transform group-hover:translate-x-1" />
                    </div>
                  ))}
                  
                  <div className="pt-6">
                    <div className="bg-red-50/20 rounded-sm border border-red-100 p-8 flex items-center justify-between italic">
                      <div className="flex items-center gap-4">
                         <div className="p-4 bg-red-50 text-red-500 rounded-sm border border-red-100">
                            <Database className="w-5 h-5" />
                         </div>
                         <div>
                            <h4 className="font-black text-red-600 uppercase tracking-widest text-[13px]">Backend Ops Intelligence</h4>
                            <p className="text-[10px] text-red-400 font-bold uppercase mt-1 tracking-tight italic">Low-level protocol access for system architects.</p>
                         </div>
                      </div>
                      <button className="text-[10px] font-black text-red-600 hover:underline tracking-widest" onClick={handleClearData}>PURGE DATABASE</button>
                    </div>
                  </div>
                </>
              ) : activeSection === 'profile' ? (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white p-10 rounded-sm border border-slate-100 shadow-sm space-y-10 italic"
                >
                  <div className="flex items-center justify-between border-b border-slate-50 pb-8">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setActiveSection('overview')} className="p-2 hover:bg-slate-50 rounded-sm">
                        <ArrowRight className="w-5 h-5 text-slate-300 rotate-180" />
                      </button>
                      <h3 className="font-black text-[18px] uppercase tracking-tight text-brand-text italic serif">Identity Protocol Update</h3>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Matrix Display Name</label>
                      <input 
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-sm font-black uppercase tracking-tight focus:ring-2 focus:ring-[#978C21]/20 focus:border-[#978C21] outline-none"
                      />
                    </div>

                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Identity Avatar Profile</label>
                      
                      <div className="flex flex-col sm:flex-row items-center gap-8 p-6 bg-[#FBFAF8] rounded-sm border border-slate-100">
                        {/* Avatar Preview */}
                        <div className="w-20 h-20 rounded-sm bg-slate-900 flex items-center justify-center text-white text-2xl font-black border border-slate-800 shadow-md overflow-hidden shrink-0">
                          {avatarUrl ? (
                            <img src={avatarUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            newName.charAt(0) || 'U'
                          )}
                        </div>

                        {/* Controls */}
                        <div className="flex-1 space-y-4 w-full text-left">
                          <p className="text-[11px] text-slate-500 leading-normal uppercase tracking-tight font-bold">
                            Select an identity preset below, or upload a custom image (max 1.5MB JPEG/PNG) to synchronize across the network.
                          </p>
                          
                          <div className="flex flex-wrap gap-3">
                            <label className="px-4 py-3 bg-slate-900 hover:bg-black text-[#FBFAF8] text-[9px] font-black uppercase tracking-widest rounded-sm transition-all cursor-pointer shadow-md inline-block">
                              Upload Custom Image
                              <input 
                                type="file" 
                                accept="image/*" 
                                className="hidden" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    if (file.size > 1.5 * 1024 * 1024) {
                                      toast.error('Asset limits exceeded: Maximum 1.5MB allowed');
                                      return;
                                    }
                                    const reader = new FileReader();
                                    reader.onload = () => {
                                      if (typeof reader.result === 'string') {
                                        setAvatarUrl(reader.result);
                                        toast.success('Identity asset uploaded successfully');
                                      }
                                    };
                                    reader.readAsDataURL(file);
                                  }
                                }}
                              />
                            </label>

                            {avatarUrl && (
                              <button 
                                type="button"
                                onClick={() => {
                                  setAvatarUrl('');
                                  toast.success('Avatar cleared. Defaulting to standard initial vector.');
                                }}
                                className="px-4 py-3 border border-red-200 hover:bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-widest rounded-sm transition-all"
                              >
                                Purge Avatar
                              </button>
                            )}
                          </div>

                          <div className="space-y-2 pt-3 border-t border-slate-100">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Quick Identity Presets</p>
                            <div className="flex flex-wrap gap-2.5">
                              {[
                                'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150',
                                'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=150',
                                'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=150',
                                'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&q=80&w=150',
                                'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=150'
                              ].map((preset, index) => (
                                <button
                                  key={index}
                                  type="button"
                                  onClick={() => {
                                    setAvatarUrl(preset);
                                    toast.success(`Identity preset ${index + 1} chosen`);
                                  }}
                                  className={`w-9 h-9 rounded-sm border overflow-hidden transition-all relative ${avatarUrl === preset ? 'ring-2 ring-[#978C21] border-[#978C21] scale-105' : 'border-slate-200 hover:border-slate-400'}`}
                                >
                                  <img src={preset} alt={`preset-${index}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                </button>
                              ))}
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                    
                    <button 
                      onClick={handleUpdateName}
                      disabled={loading}
                      className="w-full py-5 bg-slate-900 hover:bg-black text-white text-[11px] font-black uppercase tracking-[0.4em] transition-all rounded-sm flex items-center justify-center gap-4 italic disabled:opacity-50 shadow-xl"
                    >
                      {loading ? 'SYNCHRONIZING...' : 'Persist Intelligence'}
                    </button>
                  </div>
                </motion.div>
              ) : activeSection === 'security' ? (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white p-10 rounded-sm border border-slate-100 shadow-sm space-y-8 italic"
                >
                  <div className="flex items-center justify-between border-b border-slate-50 pb-8">
                    <div className="flex items-center gap-4">
                      <button onClick={() => {
                        setActiveSection('overview');
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                      }} className="p-2 hover:bg-slate-50 rounded-sm">
                        <ArrowRight className="w-5 h-5 text-slate-300 rotate-180" />
                      </button>
                      <h3 className="font-black text-[18px] uppercase tracking-tight text-brand-text italic serif">Security & Access Protocol</h3>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Previous Password *</label>
                      <input 
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-sm font-black uppercase tracking-tight focus:ring-2 focus:ring-[#978C21]/20 focus:border-[#978C21] outline-none"
                        placeholder="ENTER PREVIOUS PASSWORD"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">New Password *</label>
                      <input 
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-sm font-black uppercase tracking-tight focus:ring-2 focus:ring-[#978C21]/20 focus:border-[#978C21] outline-none"
                        placeholder="ENTER NEW PASSWORD"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest italic">Confirm New Password *</label>
                      <input 
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-sm font-black uppercase tracking-tight focus:ring-2 focus:ring-[#978C21]/20 focus:border-[#978C21] outline-none"
                        placeholder="REPEAT NEW PASSWORD"
                      />
                    </div>
                    
                    <button 
                      onClick={handleUpdatePassword}
                      disabled={passwordLoading}
                      className="w-full py-5 bg-[#978C21] hover:bg-[#867B1E] text-white text-[11px] font-black uppercase tracking-[0.4em] transition-all rounded-sm flex items-center justify-center gap-4 italic disabled:opacity-50 mt-4 shadow-xl"
                    >
                      {passwordLoading ? 'UPDATING ENCRYPTION...' : 'Update Password Protocol'}
                    </button>
                  </div>
                </motion.div>
              ) : activeSection === 'sync' ? (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white p-10 rounded-sm border border-slate-100 shadow-sm space-y-8 italic text-left"
                >
                  <div className="flex items-center justify-between border-b border-slate-50 pb-8">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setActiveSection('overview')} className="p-2 hover:bg-slate-50 rounded-sm">
                        <ArrowRight className="w-5 h-5 text-slate-300 rotate-180" />
                      </button>
                      <h3 className="font-black text-[18px] uppercase tracking-tight text-brand-text italic serif">Network Integration & Sync</h3>
                    </div>
                  </div>

                  <div className="p-8 bg-[#FBFAF8] rounded-sm border border-slate-100 space-y-8">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 border-b border-slate-200/50 pb-6">
                      <div>
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Operational Database Mode</h4>
                        <p className="text-[14px] font-black uppercase tracking-tight mt-2 flex items-center gap-2">
                          <span className={cn("w-2.5 h-2.5 rounded-full inline-block animate-pulse", isOfflineMode ? "bg-amber-500" : "bg-emerald-500")} />
                          {isOfflineMode ? "Local Storage Mode (Offline)" : "Cloud Database Mode (Live)"}
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          const targetState = !isOfflineMode;
                          useAuthStore.getState().setOfflineMode(targetState);
                           toast.success(targetState ? "Offline Mode Enabled: Data saved locally." : "Online Mode Enabled: Live Supabase PostgreSQL connection.");
                        }}
                        className={cn(
                          "px-6 py-3 text-[10px] font-black uppercase tracking-widest rounded-sm transition-all shadow-md border",
                          isOfflineMode ? "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100" : "bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100"
                        )}
                      >
                        {isOfflineMode ? "Enable Cloud / Go Live" : "Disconnect / Work Offline"}
                      </button>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Database Synchronization Sync</h4>
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
                        Manually upload any locally registered lead profiles, user credentials, and status logs on this device/browser into the secure cloud Supabase PostgreSQL database.
                      </p>
                      <button
                        onClick={async () => {
                          setLoading(true);
                          try {
                            const result = await syncService.syncToDatabase();
                            if (result) {
                              toast.success("Synchronized local modifications to live database successfully!");
                            } else {
                              toast.warning("Sync returned warnings or cloud service is occupied.");
                            }
                          } catch (err) {
                            toast.error("Failed to run sync. Check your cloud connection.");
                          } finally {
                            setLoading(false);
                          }
                        }}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-black text-[#FBFAF8] text-[10px] font-black uppercase tracking-widest py-4 rounded shadow-md transition-all active:scale-[0.99] group cursor-pointer disabled:opacity-50"
                      >
                        <Globe className="w-4 h-4 text-[#978C21] transition-transform group-hover:rotate-12" />
                        {loading ? "EXECUTING SYNC..." : "Run Cloud Synchronization Protocol"}
                      </button>
                    </div>
                  </div>
                </motion.div>
              ) : activeSection === 'notifications' ? (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white p-10 rounded-sm border border-slate-100 shadow-sm space-y-8 italic text-left"
                >
                  <div className="flex items-center justify-between border-b border-slate-50 pb-8">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setActiveSection('overview')} className="p-2 hover:bg-slate-50 rounded-sm">
                        <ArrowRight className="w-5 h-5 text-slate-300 rotate-180" />
                      </button>
                      <h3 className="font-black text-[18px] uppercase tracking-tight text-brand-text italic serif">Push Intelligence & Alerts</h3>
                    </div>
                  </div>

                  <div className="p-8 bg-[#FBFAF8] rounded-sm border border-slate-100 space-y-6">
                    <h4 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Custom System Alerts Configuration</h4>
                    <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
                      Configure lead assign routing, next follow-up call, and team supervisor notifications thresholds:
                    </p>

                    <div className="space-y-4 pt-4 border-t border-slate-150">
                      {[
                        { label: 'Push Real-Time Assignments Alerts', desc: 'Notify assignee immediately', enabled: true },
                        { label: 'Upline Team Tracking Emails to Managers', desc: 'Propagate assignment notifications up hierarchy', enabled: true },
                        { label: 'Tomorrow Call Reminders', desc: 'Display alerts for calls scheduled next calendar day', enabled: true },
                      ].map((n, i) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-sm">
                          <div>
                            <p className="text-[11px] font-black text-slate-700 uppercase">{n.label}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{n.desc}</p>
                          </div>
                          <span className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-widest rounded border border-emerald-150">Active</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : activeSection === 'system' ? (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white p-10 rounded-sm border border-slate-100 shadow-sm space-y-8 italic text-left"
                >
                  <div className="flex items-center justify-between border-b border-slate-50 pb-8">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setActiveSection('overview')} className="p-2 hover:bg-slate-50 rounded-sm">
                        <ArrowRight className="w-5 h-5 text-slate-300 rotate-180" />
                      </button>
                      <h3 className="font-black text-[18px] uppercase tracking-tight text-brand-text italic serif">System Configuration</h3>
                    </div>
                  </div>

                  <div className="p-8 bg-[#FBFAF8] rounded-sm border border-slate-100 space-y-6">
                    <div>
                      <h4 className="text-[11px] font-black uppercase tracking-widest text-[#978C21]">Interface & Dashboard Customization</h4>
                      <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed mt-2">
                        Customize visual layouts and telemetry parameters:
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-150">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Default Visualization Period</label>
                        <select className="w-full bg-white border border-slate-200 rounded-sm px-4 py-3 text-[11px] font-black uppercase tracking-widest outline-none" defaultValue="TODAY">
                          <option value="TODAY">Today Only</option>
                          <option value="THIS MONTH">Current Month</option>
                          <option value="LAST MONTH">Last Month</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Interactive Animations Rate</label>
                        <select className="w-full bg-white border border-slate-200 rounded-sm px-4 py-3 text-[11px] font-black uppercase tracking-widest outline-none" defaultValue="NORMAL">
                          <option value="NORMAL">Standard Dynamic (300ms)</option>
                          <option value="FAST">High Performance (100ms)</option>
                          <option value="REDUCED">None / Static Mode</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white p-20 rounded-sm border border-slate-100 shadow-sm text-center italic"
                >
                  <button onClick={() => setActiveSection('overview')} className="mb-10 text-[10px] font-black text-[#978C21] uppercase tracking-widest flex items-center gap-2 mx-auto">
                    <ArrowRight className="w-4 h-4 rotate-180" /> Return to Command
                  </button>
                  <h3 className="text-2xl font-black uppercase tracking-tighter text-slate-200 serif">Protocol Offline</h3>
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mt-4">Module Clearance Level 4 Required</p>
                </motion.div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="dropdowns"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-white rounded-sm border border-slate-100 shadow-sm overflow-hidden italic"
          >
            <div className="p-10 border-b border-slate-50 bg-[#FBFAF8] flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-4 flex-1 max-w-md">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Parameter Category</label>
                <select 
                  value={editingOption.type}
                  onChange={(e) => setEditingOption({ ...editingOption, type: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-sm px-4 py-3 text-[11px] font-black uppercase tracking-widest focus:ring-2 focus:ring-[#978C21]/10 outline-none"
                >
                  <option value="Area">Area Sectors</option>
                  <option value="Source">Intelligence Sources</option>
                  <option value="Product">Product Portfolio</option>
                  <option value="Campaign">Active Campaigns</option>
                  <option value="Profession">Target Professions</option>
                  <option value="FollowUpStatus">Lifecycle Statuses</option>
                </select>
              </div>
              <div className="space-y-4 flex-1 max-w-md">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">New Matrix Property</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={editingOption.value}
                    onChange={(e) => setEditingOption({ ...editingOption, value: e.target.value })}
                    placeholder="ENTER VALUE..."
                    className="flex-1 bg-white border border-slate-200 rounded-sm px-4 py-3 text-[11px] font-black uppercase tracking-widest focus:ring-2 focus:ring-[#978C21]/10 outline-none placeholder:opacity-30"
                  />
                  <button 
                    onClick={handleAddOption}
                    className="bg-[#978C21] text-white px-6 py-3 rounded-sm font-black text-[11px] uppercase tracking-widest hover:bg-black transition-all flex items-center gap-2 shadow-lg"
                  >
                    <Plus className="w-4 h-4" />
                    Inject
                  </button>
                </div>
              </div>
            </div>

            <div className="p-10">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {['Area', 'Source', 'Product', 'Campaign', 'Profession', 'FollowUpStatus'].map((type) => (
                  <div key={type} className="space-y-4">
                    <div className="flex items-center justify-between border-b-2 border-[#978C21]/20 pb-2">
                      <h5 className="text-[11px] font-black text-brand-text uppercase tracking-[0.2em] italic">{type}</h5>
                      <span className="text-[10px] font-black text-slate-300 italic">{options.filter(o => o.type === type).length} Entries</span>
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                      {options.filter(o => o.type === type).map((option, i) => (
                        <div 
                          key={i}
                          className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-100 rounded-sm group hover:bg-white hover:border-[#978C21]/30 transition-all"
                        >
                          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">{option.value}</span>
                          <button 
                            onClick={() => handleDeleteOption(option)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
