import { Lead, LeadStatus, StatusHistoryEntry, User } from '../types';
import { useAuthStore } from '../store/authStore';
import { localDb } from './localDb';
import { userService } from './userService';
import { notificationService } from './notificationService';

async function sendHierarchyNotifications(leadId: string, prospectName: string, assignedTo: string, updaterName: string) {
  try {
    const allUsers = await userService.getAllUsers();
    
    // 1. Send notification to the assignee
    await notificationService.createNotification(
      assignedTo,
      'New Lead Assigned',
      `Lead '${prospectName}' has been assigned to you by ${updaterName}.`,
      leadId
    );

    // 2. Transmit notifications up the supervisor/manager hierarchy
    let currentAssignee = allUsers.find(u => u.employeeId === assignedTo);
    const visited = new Set<string>();
    if (currentAssignee) {
      visited.add(currentAssignee.employeeId);
    }
    
    while (currentAssignee && currentAssignee.managerId) {
      const supervisorId = currentAssignee.managerId;
      if (visited.has(supervisorId)) {
        break; // Prevent infinite loops
      }
      visited.add(supervisorId);
      
      const manager = allUsers.find(u => u.employeeId === supervisorId);
      if (manager && manager.status === 'Active') {
        await notificationService.createNotification(
          manager.employeeId,
          'Team Lead Assigned Upline Alert',
          `Lead '${prospectName}' under your team tracking has been routed to assignee: ${assignedTo} (${currentAssignee.name}) by ${updaterName}.`,
          leadId
        );
        currentAssignee = manager;
      } else {
        break;
      }
    }
  } catch (err) {
    console.error('Failure propagating upline hierarchical notifications:', err);
  }
}

function getReportingEmployeeIds(managerEmployeeId: string, allUsers: any[]): string[] {
  const result: string[] = [managerEmployeeId];
  const queue: string[] = [managerEmployeeId];
  const visited = new Set<string>([managerEmployeeId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const directReports = allUsers.filter(u => u.managerId === currentId);
    for (const report of directReports) {
      if (!visited.has(report.employeeId)) {
        visited.add(report.employeeId);
        result.push(report.employeeId);
        queue.push(report.employeeId);
      }
    }
  }

  return result;
}

function applyDataVisibilityFilters(leads: Lead[], filters: { role?: string, employeeId?: string }, allUsers: User[]): Lead[] {
  if (!filters?.employeeId) return leads;
  
  const roleName = filters.role || '';
  const roleNormalized = roleName.toUpperCase();
  
  if (roleNormalized === 'ADMIN') return leads; // Admin has view-all
  
  let dataVisibility = 'Own'; // default
  try {
    const rawRoles = localStorage.getItem('lf_local_roles_permissions');
    if (rawRoles) {
      const parsedRoles = JSON.parse(rawRoles);
      const matched = parsedRoles.find((r: any) => r.roleId === roleName || r.roleId === roleNormalized);
      if (matched && matched.dataVisibility) {
        dataVisibility = matched.dataVisibility;
      } else {
        // Fallback standard roles configuration
        if (['BUSINESS_HEAD', 'BH'].includes(roleNormalized)) dataVisibility = 'Organization';
        else if (['BUSINESS_EXECUTIVE', 'BE', 'BDM', 'ASM'].includes(roleNormalized)) dataVisibility = 'Department';
        else if (['RM'].includes(roleNormalized)) dataVisibility = 'Team';
        else dataVisibility = 'Own';
      }
    }
  } catch (e) {
    console.error(e);
  }

  const currentUser = allUsers.find(u => u.employeeId === filters.employeeId);
  
  if (dataVisibility === 'Own') {
    return leads.filter(l => l.assignedTo === filters.employeeId || l.assignedBy === filters.employeeId);
  }
  
  if (dataVisibility === 'Team') {
    if (currentUser?.teamId) {
      const teamId = currentUser.teamId;
      const teamMemberIds = allUsers.filter(u => u.teamId === teamId).map(u => u.employeeId);
      return leads.filter(l => teamMemberIds.includes(l.assignedTo || ''));
    }
    const teamIds = getReportingEmployeeIds(filters.employeeId, allUsers);
    return leads.filter(l => teamIds.includes(l.assignedTo || ''));
  }
  
  if (dataVisibility === 'Department') {
    const teamIds = getReportingEmployeeIds(filters.employeeId, allUsers);
    return leads.filter(l => teamIds.includes(l.assignedTo || ''));
  }
  
  if (dataVisibility === 'Organization') {
    return leads;
  }

  return leads;
}

export const leadService = {
  async createLead(leadData: Omit<Lead, 'id'>) {
    const id = `lead_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const payload = {
      ...leadData,
      id,
      timestamp: new Date().toISOString()
    };
    
    // Always write to localDb first for immediate local consistency
    localDb.createLead(payload);

    try {
      await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (error) {
      console.warn('PostgreSQL write lead fallback to local db:', error);
    }
    return payload as Lead;
  },

  async bulkUploadLeads(leads: Omit<Lead, 'id'>[]) {
    const payloads = leads.map(lead => ({
      ...lead,
      id: `lead_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toISOString()
    }));

    // Always write to localDb first for immediate local consistency
    localDb.bulkUploadLeads(payloads);

    try {
      for (const p of payloads) {
        await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(p)
        });
      }
    } catch (error) {
      console.warn('PostgreSQL bulk lead upload fallback to local db:', error);
    }
    return payloads as Lead[];
  },

  async getLeads(filters?: { role?: string, employeeId?: string, startDate?: string, endDate?: string }): Promise<Lead[]> {
    try {
      const res = await fetch('/api/leads');
      if (res.ok) {
        const cloudLeads: Lead[] = await res.json();
        
        // Keep localDb updated with latest fetched leads, but merge robustly
        const localLeads = localDb.getLeads();
        let changed = false;
        const mergedLeads = [...localLeads];

        for (const cl of cloudLeads) {
          const idx = mergedLeads.findIndex(item => item.id === cl.id);
          if (idx === -1) {
            mergedLeads.push(cl);
            changed = true;
          } else {
            const localLead = mergedLeads[idx];
            const lTime = new Date(localLead.timestamp || 0).getTime();
            const cTime = new Date(cl.timestamp || 0).getTime();
            const needsUpdate = localLead.currentStatus !== cl.currentStatus || 
                                localLead.assignedTo !== cl.assignedTo ||
                                localLead.collectedNCP !== cl.collectedNCP ||
                                (!isNaN(cTime) && !isNaN(lTime) && cTime > lTime);
            if (needsUpdate) {
              mergedLeads[idx] = cl;
              changed = true;
            }
          }
        }

        if (changed) {
          localDb.saveLeads(mergedLeads);
        }

        let leads = [...mergedLeads];

        if (filters?.employeeId) {
          const allUsers = await userService.getAllUsers();
          leads = applyDataVisibilityFilters(leads, filters, allUsers);
        }

        if (filters?.startDate && filters?.endDate) {
          const start = new Date(filters.startDate).getTime();
          const end = new Date(filters.endDate).getTime();
          leads = leads.filter(l => {
            const t = new Date(l.timestamp).getTime();
            return t >= start && t <= end;
          });
        }

        // Order desc by timestamp
        return leads.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
    } catch (error) {
      console.warn('PostgreSQL fetch leads fallback to local db:', error);
    }

    // Local Fallback Filter Block
    let leads = localDb.getLeads();
    
    if (filters?.employeeId) {
      const allUsers = localDb.getUsers();
      leads = applyDataVisibilityFilters(leads, filters, allUsers);
    }

    if (filters?.startDate && filters?.endDate) {
      const start = new Date(filters.startDate).getTime();
      const end = new Date(filters.endDate).getTime();
      leads = leads.filter(l => {
        const t = new Date(l.timestamp).getTime();
        return t >= start && t <= end;
      });
    }

    return leads;
  },

  async getAllLeads(): Promise<Lead[]> {
    try {
      const res = await fetch('/api/leads');
      if (res.ok) {
        const cloudLeads: Lead[] = await res.json();
        const localLeads = localDb.getLeads();
        let changed = false;
        const mergedLeads = [...localLeads];
        
        for (const cl of cloudLeads) {
          const idx = mergedLeads.findIndex(l => l.id === cl.id);
          if (idx === -1) {
            mergedLeads.push(cl);
            changed = true;
          } else {
            const localLead = mergedLeads[idx];
            const lTime = new Date(localLead.timestamp || 0).getTime();
            const cTime = new Date(cl.timestamp || 0).getTime();
            if (!isNaN(cTime) && !isNaN(lTime) && cTime > lTime) {
              mergedLeads[idx] = cl;
              changed = true;
            }
          }
        }
        
        if (changed) {
          localDb.saveLeads(mergedLeads);
        }
        return mergedLeads;
      }
    } catch (error) {
      console.warn('PostgreSQL fetch all leads fallback to local db:', error);
    }
    return localDb.getLeads();
  },

  async clearAllLeads() {
    localDb.clearAllLeads();
    try {
      await fetch('/api/leads/clear-all', { method: 'POST' });
    } catch (error) {
      console.warn('PostgreSQL clear leads fallback to local db:', error);
    }
  },

  async updateLeadStatus(
    leadId: string, 
    status: LeadStatus, 
    ncp?: number, 
    remarks?: string, 
    nextFollowUpDate?: string, 
    updatedBy?: string,
    nextCallDate?: string,
    meetingDate?: string,
    sumAssured?: number,
    productName?: string,
    projectedNCP?: number
  ) {
    // Always write to local storage first for immediate consistency
    localDb.updateLeadStatus(
      leadId, 
      status, 
      ncp, 
      remarks, 
      nextFollowUpDate, 
      updatedBy,
      nextCallDate,
      meetingDate,
      sumAssured,
      productName,
      projectedNCP
    );

    try {
      // Fetch current lead configuration to merge statusHistory
      const localLead = localDb.getLead(leadId);
      if (localLead) {
        await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(localLead)
        });
      }
    } catch (error) {
      console.warn('PostgreSQL update lead status fallback to local db:', error);
    }
  },

  async updateLead(leadId: string, updatedFields: Partial<Lead>, updaterName?: string) {
    const updater = updaterName || 'Admin';

    const existing = localDb.getLead(leadId);
    if (!existing) return;

    if (updatedFields.assignedTo !== undefined && existing.assignedTo !== updatedFields.assignedTo) {
      updatedFields.assignedBy = updater;
      updatedFields.assignedDate = new Date().toISOString();
      if (updatedFields.assignedTo) {
        await sendHierarchyNotifications(leadId, existing.prospectName, updatedFields.assignedTo, updater);
      }
    }

    localDb.updateLead(leadId, updatedFields);
    
    // Save to PostgreSQL via active merge API
    const merged = localDb.getLead(leadId);
    if (merged) {
      try {
        await fetch('/api/leads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(merged)
        });
      } catch (error) {
        console.warn('PostgreSQL update lead fallback to local db:', error);
      }
    }
  },

  async deleteLead(leadId: string) {
    localDb.deleteLead(leadId);
    try {
      await fetch(`/api/leads/${leadId}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.warn('PostgreSQL delete lead fallback to local db:', error);
    }
  },

  async deleteLeadsByCampaign(campaignName: string) {
    localDb.deleteLeadsByCampaign(campaignName);
    try {
      await fetch(`/api/leads/campaign/${encodeURIComponent(campaignName)}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.warn('PostgreSQL delete campaign leads fallback to local db:', error);
    }
  }
};
