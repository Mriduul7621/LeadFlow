import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Lock, User as UserIcon, LogIn, ShieldCheck, ArrowRight, ArrowLeft, Mail } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { MOCK_USERS } from '../mock/data';
import { localDb } from '../services/localDb';
import { userService } from '../services/userService';
import { syncService } from '../services/syncService';
import { User, UserRole } from '../types';

function detectRoleFromEmployeeId(empId: string): UserRole {
  const norm = empId.trim().toUpperCase();
  if (norm === 'ADMIN' || norm.startsWith('ADM')) return UserRole.ADMIN;
  if (norm.startsWith('RO')) return UserRole.RO;
  if (norm.startsWith('RM')) return UserRole.RM;
  if (norm.startsWith('ASM')) return UserRole.ASM;
  if (norm.startsWith('BDM')) return UserRole.BDM;
  if (norm.startsWith('BE')) return UserRole.BUSINESS_EXECUTIVE;
  if (norm.startsWith('BH')) return UserRole.BUSINESS_HEAD;

  // Contains search fallback
  if (norm.includes('ADMIN')) return UserRole.ADMIN;
  if (norm.includes('BH') || norm.includes('BUSINESSHEAD')) return UserRole.BUSINESS_HEAD;
  if (norm.includes('BE') || norm.includes('BUSINESSEXECUTIVE') || norm.includes('EXEC')) return UserRole.BUSINESS_EXECUTIVE;
  if (norm.includes('BDM') || norm.includes('DEVELOPMENT')) return UserRole.BDM;
  if (norm.includes('ASM')) return UserRole.ASM;
  if (norm.includes('RM') || norm.includes('MANAGER')) return UserRole.RM;
  if (norm.includes('RO') || norm.includes('OFFICER')) return UserRole.RO;

  return UserRole.RO; // default dynamic fallback
}

function getDesignationFromRole(role: UserRole): string {
  switch (role) {
    case UserRole.ADMIN: return 'Administrator';
    case UserRole.RO: return 'Relationship Officer';
    case UserRole.RM: return 'Relationship Manager';
    case UserRole.ASM: return 'Area Sales Manager';
    case UserRole.BDM: return 'Business Development Manager';
    case UserRole.BUSINESS_EXECUTIVE: return 'Business Executive';
    case UserRole.BUSINESS_HEAD: return 'Business Head';
    default: return 'Office Employee';
  }
}

// @ts-ignore
import bgImage from '../assets/images/income_planner_bg_1779253838380.png';

const loginSchema = z.object({
  username: z.string().min(3, 'Employee ID is required'),
  password: z.string().min(5, 'Password must be at least 5 characters'),
});

const setupSchema = z.object({
  fullName: z.string().min(3, 'Full name must be at least 3 characters'),
  employeeId: z.string().min(3, 'Employee ID must be at least 3 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(5, 'Password must be at least 5 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export default function Login() {
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const [showForm, setShowForm] = React.useState(false);
  const [isFirstTimeSetup, setIsFirstTimeSetup] = React.useState(false);
  const [checkingSetup, setCheckingSetup] = React.useState(true);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const { register: registerSetup, handleSubmit: handleSetupSubmit, formState: { errors: setupErrors, isSubmitting: isSetupSubmitting }, reset: resetSetup } = useForm({
    resolver: zodResolver(setupSchema),
  });

  const checkUserCount = async () => {
    try {
      let count = 0;
      try {
        const firestoreUsers = await userService.getAllUsers();
        count += (firestoreUsers || []).length;
      } catch (fErr) {
        console.warn("Could not fetch online users:", fErr);
        const localUsers = localDb.getUsers();
        count += (localUsers || []).length;
      }
      setIsFirstTimeSetup(count === 0);
    } catch (err) {
      console.error("Error checking user count:", err);
    } finally {
      setCheckingSetup(false);
    }
  };

  React.useEffect(() => {
    checkUserCount();
  }, []);

  const onSetupSubmit = async (data: any) => {
    try {
      const empId = data.employeeId.toUpperCase().trim();
      const newUser: User = {
        id: `u_admin_${Date.now()}`,
        name: data.fullName,
        employeeId: empId,
        email: data.email.toLowerCase().trim(),
        role: UserRole.ADMIN,
        designation: 'Administrator',
        status: 'Active',
        createdDate: new Date().toISOString(),
        password: data.password
      };

      // 1. Create in local state database first
      localDb.createUser(newUser);

      // 2. Synchronize to Firestore
      try {
        await userService.createUser(newUser);
      } catch (fErr) {
        console.warn("Could not sync first-time admin to cloud:", fErr);
      }

      // 3. Authenticate and log in
      login(newUser, false);
      toast.success("Super Admin console initialized successfully!");
      syncService.syncToFirestore();
      navigate('/');
    } catch (err) {
      console.error("Super Admin setup failed:", err);
      toast.error("Failed to setup Super Admin account.");
    }
  };

  const onSubmit = async (data: any) => {
    try {
      const empId = data.username.toUpperCase().trim();
      const enteredPassword = data.password;

      // Master Admin Bypass Control
      if (empId === 'ADMIN' && enteredPassword === 'shanta123') {
        const masterAdmin = {
          id: 'u1',
          name: 'Shantalife Admin',
          employeeId: 'ADMIN',
          email: 'admin@shantalife.com',
          role: 'ADMIN' as any,
          status: 'Active' as any,
          createdDate: new Date().toISOString(),
          password: 'shanta123'
        };

        // Re-write or Seed local DB
        const localUsers = localDb.getUsers();
        const existingAdminIdx = localUsers.findIndex(u => u.employeeId === 'ADMIN' || u.id === 'u1');
        if (existingAdminIdx > -1) {
          localUsers[existingAdminIdx] = masterAdmin;
          localDb.saveUsers(localUsers);
        } else {
          localDb.createUser(masterAdmin);
        }

        // Parallel re-write or seed to Firestore
        try {
          await userService.createUser(masterAdmin);
        } catch (fErr) {
          console.warn("Could not seed online Admin in Firestore:", fErr);
        }

        login(masterAdmin, false);
        toast.success("Master Admin Protocol Authenticated.");
        syncService.syncToFirestore();
        navigate('/');
        return;
      }

      let matchedUser = null;

      // 1. First, search for user in Firestore with robust case-insensitive comparison
      try {
        const firestoreUsers = await userService.getAllUsers();
        if (firestoreUsers && firestoreUsers.length > 0) {
          matchedUser = firestoreUsers.find(u => {
            const uEmpId = (u.employeeId || '').toUpperCase().trim();
            const uId = (u.id || '').toLowerCase().trim();
            const scanId = empId.toLowerCase();
            return uEmpId === empId || uId === scanId || uId === `u_local_${scanId}`;
          });
        }
      } catch (err) {
        console.warn('Firestore user fetch failed or offline; trying local storage lookup:', err);
      }

      // 2. Fall back to localDb search if Firestore fails or doesn't have the user yet
      if (!matchedUser) {
        const localUsers = localDb.getUsers();
        matchedUser = localUsers.find(u => {
          const uEmpId = (u.employeeId || '').toUpperCase().trim();
          const uId = (u.id || '').toLowerCase().trim();
          const scanId = empId.toLowerCase();
          return uEmpId === empId || uId === scanId || uId === `u_local_${scanId}`;
        });
      }

      if (matchedUser) {
        let requiredPassword = matchedUser.password || 'shanta123';
        // Match passwords
        if (requiredPassword !== enteredPassword) {
          // Robust Fallback: Check if local storage records are matching and correct
          const localUsers = localDb.getUsers();
          const localMatchedUser = localUsers.find(u => {
            const uEmpId = (u.employeeId || '').toUpperCase().trim();
            const uId = (u.id || '').toLowerCase().trim();
            const scanId = empId.toLowerCase();
            return uEmpId === empId || uId === scanId || uId === `u_local_${scanId}`;
          });
          if (localMatchedUser && (localMatchedUser.password || 'shanta123') === enteredPassword) {
            // Local record is authentic! Let's match the passwords
            matchedUser.password = enteredPassword;
            // Align the cloud database on-the-fly to correct any out-of-sync credential
            try {
              await userService.updateUser(matchedUser.id, { password: enteredPassword });
            } catch (err) {
              console.warn("Could not align Firestore password with local authentic credentials:", err);
            }
          } else {
            toast.error('Authentication failed: Invalid credentials or password.');
            return;
          }
        }
        
        // Ensure matchedUser is stored/updated in local storage
        const localUsers = localDb.getUsers();
        const existsLocally = localUsers.some(u => u.id === matchedUser.id);
        if (!existsLocally) {
          localDb.createUser(matchedUser);
        } else {
          localDb.updateUser(matchedUser.id, matchedUser);
        }

        // Log in to online session
        login(matchedUser, false);
        toast.success(`Welcome back, ${matchedUser.name}!`);
        
        // Push any local storage offline data into Firestore synchronously
        syncService.syncToFirestore();
        navigate('/');
      } else {
        toast.error('Authentication failed: Employee ID does not exist in the system. Please ask an Administrator to authorize your account.');
      }
    } catch (err: any) {
      console.error('Authentication process failed:', err);
      toast.error('Local Authentication initiation failed.');
    }
  };

  return (
    <div 
      className="min-h-screen bg-black flex flex-col items-center justify-between p-6 sm:p-8 relative overflow-hidden select-none font-sans"
      id="login-page-container"
    >
      {/* Background Image with Dark Vignette Overlay */}
      <div 
        className="absolute inset-0 bg-cover bg-center opacity-85 transition-opacity duration-700 mix-blend-luminosity pointer-events-none scale-105"
        style={{ backgroundImage: `url(${bgImage})` }}
        id="login-bg-overlay"
      />
      <div 
        className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/60 to-black/90 pointer-events-none"
        id="login-dark-gradient"
      />

      {/* Decorative Bottom Bar Indicator */}
      <div className="absolute bottom-6 left-8 z-20 hidden md:flex flex-col items-start gap-1" id="system-ready-indicator">
        <span className="text-[10px] text-slate-500 font-bold tracking-[0.25em] uppercase opacity-60">System Ready</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#978C21] animate-ping" />
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest opacity-85">
            {isFirstTimeSetup ? "Setup Required" : "Secure Node Online"}
          </span>
        </div>
      </div>

      <div className="absolute bottom-6 right-8 z-20 hidden md:block" id="system-shield-indicator">
        <ShieldCheck className="w-5 h-5 text-slate-500 opacity-40 hover:opacity-80 transition-opacity" />
      </div>

      {/* Content Container */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative z-10 max-w-xl mx-auto" id="login-inner-wrap">
        
        {/* Company Logo - Fully Visible and Prominent */}
        <motion.div
          initial={{ opacity: 0, y: -25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="mb-8 flex justify-center items-center select-none"
          id="company-logo-container"
        >
          <img 
            src="https://lh3.googleusercontent.com/d/1NrB07Qg9d6yhOib8gds5g4-HZLmbJng3"
            alt="Shanta Life Logo"
            className="h-24 md:h-28 w-auto object-contain transition-all duration-300"
            referrerPolicy="no-referrer"
          />
        </motion.div>

        {/* Institutional Pill Badge */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-[10px] uppercase tracking-[0.25em] text-slate-200 font-black mb-8 select-none"
          id="institutional-pill-badge"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#978C21] animate-pulse"></span>
          Institutional Lead Management
        </motion.div>

        {/* Dynamic Inner Panel holding Presentation or Form */}
        <AnimatePresence mode="wait">
          {!showForm ? (
            <motion.div
              key="presentation"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.4 }}
              className="w-full flex flex-col items-center justify-center text-center space-y-6"
              id="presentation-panel"
            >
              {/* Main Headlines */}
              <div className="space-y-1" id="headline-wrapper">
                <h1 className="text-6xl sm:text-7xl font-black tracking-tight text-white uppercase leading-none select-none">
                  LEAD
                </h1>
                <h1 className="text-6xl sm:text-7xl font-black tracking-tight text-[#978C21] uppercase leading-none select-none">
                  FLOW
                </h1>
              </div>

              {/* Subheading */}
              <h2 className="text-xs sm:text-sm font-black text-white tracking-[0.25em] uppercase select-none">
                Maximize Your Conversion Flow
              </h2>

              {/* Small description copy */}
              <p className="text-slate-300 text-xs sm:text-sm font-medium leading-relaxed max-w-sm select-none opacity-80 decoration-none">
                An intelligent lead management and tracking console built for sales and growth teams to scale active pipelines.
              </p>

              {/* Call To Action button */}
              <div className="pt-4" id="cta-button-container">
                <motion.button 
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowForm(true)}
                  className="px-8 py-3.5 bg-[#978C21] hover:bg-[#a59924] text-white rounded-lg font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-[#978C21]/20 group cursor-pointer"
                  id="login-now-btn"
                >
                  {isFirstTimeSetup ? "Initialize Console" : "Login Now"} 
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key={isFirstTimeSetup ? "setup-form" : "login-form"}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-sm bg-black/40 backdrop-blur-2xl border border-white/10 p-8 sm:p-10 rounded-2xl shadow-2xl relative overflow-hidden"
              id="glassmorphic-form-panel"
            >
              {/* Top Accent line matching our theme */}
              <div className="absolute top-0 left-0 w-full h-1.5 bg-[#978C21]" id="border-accent" />

              {isFirstTimeSetup ? (
                <>
                  <div className="text-center mb-6" id="setup-header">
                    <h2 className="text-xl font-black text-white uppercase tracking-tight">Initialize Super Admin</h2>
                    <p className="text-[#978C21] text-[10px] font-black uppercase tracking-widest mt-1">First-time system setup</p>
                  </div>

                  <form onSubmit={handleSetupSubmit(onSetupSubmit)} className="space-y-4" id="setup-credentials-form">
                    {/* Full Name input */}
                    <div className="space-y-1" id="setup-name-group">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block animate-pulse">Full Name</label>
                      <div className="relative group">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#978C21] transition-colors" />
                        <input 
                          {...registerSetup('fullName')}
                          type="text" 
                          className="w-full pl-11 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#978C21]/20 focus:border-[#978C21] transition-all text-xs font-semibold text-white placeholder-slate-500"
                          placeholder="EX: Admin Director"
                          autoComplete="off"
                        />
                      </div>
                      {setupErrors.fullName && <p className="text-[10px] text-red-400 font-bold">{setupErrors.fullName.message as string}</p>}
                    </div>

                    {/* Employee ID input */}
                    <div className="space-y-1" id="setup-empid-group">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Employee ID</label>
                      <div className="relative group">
                        <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#978C21] transition-colors" />
                        <input 
                          {...registerSetup('employeeId')}
                          type="text" 
                          className="w-full pl-11 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#978C21]/20 focus:border-[#978C21] transition-all text-xs font-semibold text-white placeholder-slate-500 uppercase tracking-wider"
                          placeholder="EX: ADMIN or ADM001"
                          autoComplete="off"
                        />
                      </div>
                      {setupErrors.employeeId && <p className="text-[10px] text-red-400 font-bold">{setupErrors.employeeId.message as string}</p>}
                    </div>

                    {/* Email input */}
                    <div className="space-y-1" id="setup-email-group">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Email Address</label>
                      <div className="relative group">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#978C21] transition-colors" />
                        <input 
                          {...registerSetup('email')}
                          type="email" 
                          className="w-full pl-11 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#978C21]/20 focus:border-[#978C21] transition-all text-xs font-semibold text-white placeholder-slate-500"
                          placeholder="EX: admin@shantalife.com"
                          autoComplete="off"
                        />
                      </div>
                      {setupErrors.email && <p className="text-[10px] text-red-400 font-bold">{setupErrors.email.message as string}</p>}
                    </div>

                    {/* Password input */}
                    <div className="space-y-1" id="setup-password-group">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Password</label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#978C21] transition-colors" />
                        <input 
                          {...registerSetup('password')}
                          type="password" 
                          className="w-full pl-11 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#978C21]/20 focus:border-[#978C21] transition-all text-xs font-semibold text-white placeholder-slate-600"
                          placeholder="••••••••"
                        />
                      </div>
                      {setupErrors.password && <p className="text-[10px] text-red-400 font-bold">{setupErrors.password.message as string}</p>}
                    </div>

                    {/* Confirm Password input */}
                    <div className="space-y-1" id="setup-confirmpassword-group">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Confirm Password</label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#978C21] transition-colors" />
                        <input 
                          {...registerSetup('confirmPassword')}
                          type="password" 
                          className="w-full pl-11 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#978C21]/20 focus:border-[#978C21] transition-all text-xs font-semibold text-white placeholder-slate-600"
                          placeholder="••••••••"
                        />
                      </div>
                      {setupErrors.confirmPassword && <p className="text-[10px] text-red-400 font-bold">{setupErrors.confirmPassword.message as string}</p>}
                    </div>

                    {/* Submit button */}
                    <button 
                      type="submit" 
                      disabled={isSetupSubmitting}
                      className="w-full py-3 mt-2 bg-[#978C21] hover:bg-[#a59924] text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#978C21]/15 cursor-pointer active:scale-[0.98]"
                      id="setup-submit-btn"
                    >
                      {isSetupSubmitting ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          Register Super Admin
                        </>
                      )}
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <div className="text-center mb-8" id="form-header">
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">System Login</h2>
                    <p className="text-[#978C21] text-[10px] font-black uppercase tracking-widest mt-1">Authorized Access Console</p>
                  </div>

                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" id="credential-form">
                    
                    {/* Employee ID input */}
                    <div className="space-y-2" id="username-field-group">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block animate-pulse">Employee Identity</label>
                      <div className="relative group">
                        <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#978C21] transition-colors" />
                        <input 
                          {...register('username')}
                          type="text" 
                          className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#978C21]/20 focus:border-[#978C21] transition-all text-sm font-semibold text-white placeholder-slate-500 uppercase tracking-wider"
                          placeholder="EX: RM001 or ADMIN"
                          autoComplete="off"
                        />
                      </div>
                      {errors.username && <p className="text-xs text-red-400 font-bold">{errors.username.message as string}</p>}
                    </div>

                    {/* Password input */}
                    <div className="space-y-2" id="password-field-group">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block animate-pulse">Security Credentials</label>
                      <div className="relative group">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-[#978C21] transition-colors" />
                        <input 
                          {...register('password')}
                          type="password" 
                          className="w-full pl-11 pr-4 py-3.5 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#978C21]/20 focus:border-[#978C21] transition-all text-sm font-semibold text-white placeholder-slate-600"
                          placeholder="••••••••"
                        />
                      </div>
                      {errors.password && <p className="text-xs text-red-400 font-bold">{errors.password.message as string}</p>}
                    </div>

                    {/* Submit button */}
                    <button 
                      type="submit" 
                      disabled={isSubmitting}
                      className="w-full py-4 mt-2 bg-[#978C21] hover:bg-[#a59924] text-white rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#978C21]/15 cursor-pointer active:scale-[0.98]"
                      id="form-submit-btn"
                    >
                      {isSubmitting ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <LogIn className="w-4 h-4" />
                          Authenticate Console
                        </>
                      )}
                    </button>
                  </form>
                </>
              )}

              {/* Back navigation */}
              <div className="mt-8 pt-6 border-t border-white/5 flex justify-center text-center" id="form-back-nav">
                <button 
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="text-xs text-slate-400 hover:text-[#978C21] transition-colors font-bold uppercase tracking-widest flex items-center gap-2 cursor-pointer"
                  id="back-trigger"
                >
                  <ArrowLeft className="w-3 h-3" /> Return to Welcome
                </button>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* Footer Copy */}
      <div className="relative z-10 w-full text-center pb-2 select-none" id="login-footer">
        <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-widest opacity-60">
          © 2024 Shanta Life Insurance. All Rights Reserved.
        </p>
      </div>
    </div>
  );
}
