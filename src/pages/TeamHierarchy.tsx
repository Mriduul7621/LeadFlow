import React, { useEffect, useState } from 'react';
import { 
  Users, 
  MapPin, 
  Briefcase, 
  UserCheck, 
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Award,
  Search,
  X,
  ChevronRight,
  Building
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { useAuthStore } from '../store/authStore';
import { userService } from '../services/userService';
import { leadService } from '../services/leadService';
import { UserRole, User, Lead } from '../types';

interface MemberStats {
  user: User;
  totalLeads: number;
  contactedCalls: number;
  meetingsCompleted: number;
  pipelineLocked: number;
  collectedNCP: number;
  projectedNCP: number;
  conversionRate: string;
}

export default function TeamHierarchy() {
  const { user: currentUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [teamMembers, setTeamMembers] = useState<MemberStats[]>([]);
  const [selectedMember, setSelectedMember] = useState<MemberStats | null>(null);
  const [selectedMemberLeads, setSelectedMemberLeads] = useState<Lead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    const loadTeamData = async () => {
      if (!currentUser) return;
      setLoading(true);
      try {
        const allUsers = await userService.getAllUsers();
        const allLeads = await leadService.getLeads({ 
          employeeId: currentUser.employeeId, 
          role: currentUser.role 
        });

        // Determine who reports to current user
        // reports if they report directly via managerId or if user is ADMIN (shows all)
        // or cascade based on role hierarchy if managerId is not set
        let filteredUsers = allUsers.filter(u => u.employeeId !== currentUser.employeeId);

        if (currentUser.role !== UserRole.ADMIN) {
          const directReports = allUsers.filter(u => u.managerId === currentUser.employeeId);
          if (directReports.length > 0) {
             filteredUsers = directReports;
          } else {
             // Cascade fallback role hierarchy
             let targetSubRole: UserRole | null = null;
             if (currentUser.role === UserRole.BUSINESS_HEAD) targetSubRole = UserRole.BUSINESS_EXECUTIVE;
             else if (currentUser.role === UserRole.BUSINESS_EXECUTIVE) targetSubRole = UserRole.BDM;
             else if (currentUser.role === UserRole.BDM) targetSubRole = UserRole.ASM;
             else if (currentUser.role === UserRole.ASM) targetSubRole = UserRole.RM;
             else if (currentUser.role === UserRole.RM) targetSubRole = UserRole.RO;

             if (targetSubRole) {
               filteredUsers = allUsers.filter(u => u.role === targetSubRole);
             } else {
               filteredUsers = [];
             }
          }
        }

        // Calculate performance stats for each team member
        const computedMembers: MemberStats[] = filteredUsers.map(u => {
          // get leads belonging to this user or reporting ROs
          // To calculate full team leads under a manager, let's find all cascading sub-employee IDs
          const getReportingEmployeeIds = (mgrId: string): string[] => {
             const ids = [mgrId];
             const subordinates = allUsers.filter(x => x.managerId === mgrId);
             subordinates.forEach(s => {
                ids.push(...getReportingEmployeeIds(s.employeeId));
             });
             return Array.from(new Set(ids));
          };

          const reportingIds = getReportingEmployeeIds(u.employeeId);
          const memberLeads = allLeads.filter(l => reportingIds.includes(l.assignedTo || ''));

          const lCount = memberLeads.length;
          const contacted = memberLeads.filter(l => l.currentStatus !== 'Untouched').length;
          const meetings = memberLeads.filter(l => l.currentStatus === 'Meeting Completed' || l.meetingDate).length;
          const pipeline = memberLeads.filter(l => l.currentStatus === 'Pipeline Locked' || l.projectedNCP > 0).length;
          const collected = memberLeads.reduce((acc, curr) => acc + (curr.collectedNCP || 0), 0);
          const projected = memberLeads.reduce((acc, curr) => acc + (curr.projectedNCP || 0), 0);
          const convertedCount = memberLeads.filter(l => l.currentStatus === 'Converted' || l.collectedNCP > 0).length;

          const rate = lCount > 0 ? `${Math.round((convertedCount / lCount) * 100)}%` : '0%';

          return {
             user: u,
             totalLeads: lCount,
             contactedCalls: contacted,
             meetingsCompleted: meetings,
             pipelineLocked: pipeline,
             collectedNCP: collected,
             projectedNCP: projected,
             conversionRate: rate
          };
        });

        setTeamMembers(computedMembers);

      } catch (err) {
        console.error("Error computing team progress stats", err);
      } finally {
        setLoading(false);
      }
    };

    loadTeamData();
  }, [currentUser]);

  // When a member is clicked, load their specific leads for the details view
  const handleMemberClick = async (member: MemberStats) => {
    setSelectedMember(member);
    try {
      const allLeads = await leadService.getLeads({
        employeeId: member.user.employeeId,
        role: member.user.role
      });
      // Filter leads explicitly owned or generated by their hierarchy
      setSelectedMemberLeads(allLeads);
    } catch (e) {
      console.error(e);
      setSelectedMemberLeads([]);
    }
  };

  const filteredMembers = teamMembers.filter(m => 
    m.user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.user.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.user.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-10 pb-24 bg-white font-sans">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-100 pb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-brand-text italic uppercase serif leading-none">Team Progress Tracker</h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-3 italic">Hierarchy Execution and NCP Velocity Ledger</p>
        </div>
        <div className="flex items-center gap-3">
           <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-4 py-2 rounded-sm w-72 shadow-sm">
             <Search className="w-4 h-4 text-slate-400" />
             <input 
               type="text" 
               placeholder="Search by name, ID or role..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               className="bg-transparent border-none text-[11px] font-black uppercase text-slate-700 placeholder-slate-400 outline-none w-full"
             />
           </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-24">
          <div className="w-12 h-12 border-4 border-slate-100 border-t-[#978C21] rounded-full animate-spin"></div>
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-slate-100 rounded bg-[#F9F9F4] text-slate-400 font-black tracking-widest text-[12px] uppercase italic">
          No sub-teams or subordinates report directly under your register
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-1">
          {filteredMembers.map((member, idx) => (
             <motion.div
               key={member.user.id}
               initial={{ opacity: 0, y: 15 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: idx * 0.04 }}
               onClick={() => handleMemberClick(member)}
               className="bg-white border border-slate-100 hover:border-[#978C21]/30 hover:scale-[1.01] transition-all rounded-sm p-6 cursor-pointer shadow-sm flex flex-col justify-between group"
             >
                <div>
                   <div className="flex items-center justify-between mb-4">
                      <div className="px-3 py-1 bg-slate-900 text-[#978C21] text-[9px] font-black uppercase tracking-widest rounded-sm">
                         {member.user.role}
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">ID: {member.user.employeeId}</span>
                   </div>

                   <h3 className="text-xl font-black text-brand-text uppercase italic tracking-tight mb-1 group-hover:text-[#978C21] transition-colors">{member.user.name}</h3>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 italic">{member.user.email}</p>

                   <div className="grid grid-cols-3 gap-3 border-t border-slate-50 pt-4 mb-6 text-center">
                     <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Leads</p>
                        <p className="text-lg font-black text-slate-800 italic">{member.totalLeads}</p>
                     </div>
                     <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Meetings</p>
                        <p className="text-lg font-black text-brand-blue italic">{member.meetingsCompleted}</p>
                     </div>
                     <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1">Ratio</p>
                        <p className="text-lg font-black text-[#10B981] italic">{member.conversionRate}</p>
                     </div>
                   </div>
                </div>

                <div className="bg-[#FBFAF8] p-4 rounded-sm border border-slate-50 flex items-center justify-between">
                   <div>
                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">Collected NCP</p>
                     <p className="text-[14px] font-black text-[#978C21] italic">৳{member.collectedNCP.toLocaleString()}</p>
                   </div>
                   <div className="text-right">
                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest italic">Projected NCP</p>
                     <p className="text-[12px] font-black text-slate-500 italic">৳{member.projectedNCP.toLocaleString()}</p>
                   </div>
                </div>

                <div className="flex items-center justify-end text-right text-[10px] font-black text-[#978C21] uppercase tracking-widest italic mt-4 gap-1 group-hover:translate-x-1 transition-transform">
                   <span>Details Progress Matrix</span>
                   <ChevronRight className="w-3.5 h-3.5" />
                </div>
             </motion.div>
          ))}
        </div>
      )}

      {/* Details Slide-Over / Overlay */}
      <AnimatePresence>
        {selectedMember && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex justify-end">
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3 }}
              className="bg-white w-full max-w-2xl h-full shadow-2xl p-8 overflow-y-auto flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-6 mb-8">
                   <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-sm flex items-center justify-center text-[#978C21]">
                         <Building className="w-6 h-6 animate-pulse-slow" />
                      </div>
                      <div>
                         <h2 className="text-2xl font-black text-brand-text uppercase italic tracking-tighter leading-none">{selectedMember.user.name}</h2>
                         <p className="text-[9px] font-black text-[#978C21] uppercase tracking-widest mt-1.5 italic">Operational Clearance: {selectedMember.user.role} reporting line</p>
                      </div>
                   </div>
                   <button 
                     type="button"
                     onClick={() => setSelectedMember(null)}
                     className="w-10 h-10 rounded-full hover:bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
                   >
                     <X className="w-5 h-5" />
                   </button>
                </div>

                {/* Main comparison charts indices */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                   <div className="p-5 bg-slate-50 border border-slate-100 rounded-sm text-center">
                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Assigned Leads</p>
                     <h4 className="text-2xl font-black text-slate-800 italic leading-none">{selectedMember.totalLeads}</h4>
                   </div>
                   <div className="p-5 bg-slate-50 border border-slate-100 rounded-sm text-center">
                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Contacted</p>
                     <h4 className="text-2xl font-black text-brand-blue italic leading-none">{selectedMember.contactedCalls}</h4>
                   </div>
                   <div className="p-5 bg-slate-50 border border-slate-100 rounded-sm text-center">
                     <p className="text-[8px] font-black text-[#10B981] uppercase tracking-widest mb-1 italic">Collected NCP</p>
                     <h4 className="text-2xl font-black text-[#10B981] italic leading-none">৳{selectedMember.collectedNCP.toLocaleString()}</h4>
                   </div>
                   <div className="p-5 bg-slate-50 border border-slate-100 rounded-sm text-center">
                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Conversion %</p>
                     <h4 className="text-2xl font-black text-slate-800 italic leading-none">{selectedMember.conversionRate}</h4>
                   </div>
                </div>

                {/* Subordinate Stream Info */}
                <div className="mb-8">
                   <h4 className="text-[12px] font-black text-brand-text uppercase tracking-widest italic mb-4">Direct Stream Lead Registry</h4>
                   
                   <div className="border border-slate-100 rounded-sm overflow-hidden">
                     <div className="overflow-x-auto">
                        <table className="w-full text-left">
                           <thead className="bg-[#FBFAF8] text-[8px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">
                              <tr>
                                 <th className="px-6 py-4">Client Name</th>
                                 <th className="px-6 py-4">Area</th>
                                 <th className="px-6 py-4 text-center">NCP Collected</th>
                                 <th className="px-6 py-4 text-center">Status</th>
                              </tr>
                           </thead>
                           <tbody className="divide-y divide-slate-50 text-[11px]">
                              {selectedMemberLeads.length === 0 ? (
                                 <tr>
                                    <td colSpan={4} className="text-center py-10 text-slate-400 font-bold uppercase tracking-widest text-[9px] italic">
                                       No active lead rows registered in direct log
                                    </td>
                                 </tr>
                              ) : (
                                selectedMemberLeads.slice(0, 10).map((lead, index) => (
                                   <tr key={index} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="px-6 py-3 font-bold text-slate-700">{lead.prospectName || 'Unknown Policy holder'}</td>
                                      <td className="px-6 py-3 text-slate-400 font-medium">{lead.area}</td>
                                      <td className="px-6 py-3 font-black text-slate-800 text-center">৳{(lead.collectedNCP || 0).toLocaleString()}</td>
                                      <td className="px-6 py-3 text-center">
                                         <span className="px-2 py-0.5 bg-slate-100 rounded-sm text-[8px] font-black uppercase text-slate-600">
                                            {lead.currentStatus}
                                         </span>
                                      </td>
                                   </tr>
                                ))
                              )}
                           </tbody>
                        </table>
                     </div>
                   </div>
                </div>
              </div>

               <div className="mt-auto border-t border-slate-100 pt-6">
                  <button
                    type="button"
                    onClick={() => setSelectedMember(null)}
                    className="w-full py-4 bg-slate-900 text-white font-black uppercase tracking-widest text-[11px] rounded-sm shadow-md hover:bg-slate-800 transition-colors italic cursor-pointer"
                  >
                     Close Intelligence ledger
                  </button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
