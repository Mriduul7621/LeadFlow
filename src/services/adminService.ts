import { RolePermission, Team, User, Permissions } from '../types';
import { toast } from 'sonner';
import { userService } from './userService';

const KEYS = {
  ROLES: 'lf_local_roles_permissions',
  TEAMS: 'lf_local_teams',
};

// Seed initial default permissions for built-in clearance levels
export const DEFAULT_ROLE_PERMISSIONS: RolePermission[] = [
  {
    roleId: 'ADMIN',
    roleName: 'System Admin',
    menuAccess: {
      '/': true,
      '/leads/new': true,
      '/leads/upload': true,
      '/leads/all': true,
      '/leads': true,
      '/execution-intelligence': true,
      '/ncp-progress': true,
      '/trend-charts': true,
      '/campaign-breakdown': true,
      '/follow-up': true,
      '/team': true,
      '/users': true,
      '/settings': true
    },
    dataVisibility: 'Organization',
    actions: { view: true, create: true, edit: true, delete: true, approve: true, upload: true }
  },
];

export function ensureFeaturePermissions(role: RolePermission): RolePermission {
  const defaults: Record<string, Record<string, boolean>> = {
    dashboard: { 
      view: true, 
      view_calls_stats: true, 
      view_pipeline_ncp: true, 
      view_division_table: true, 
      view_ncp_chart: true, 
      view_trend_chart: true, 
      view_campaign_pie: true, 
      view_critical_alerts: true, 
      view_agent_table: true 
    },
    lead_generate: { view: true, create: true },
    lead_upload: { view: true, upload: true, delete: true },
    lead_tracking: { view: true, status_update: true },
    execution_intelligence: { view: true },
    ncp_progress: { view: true },
    trend_charts: { view: true },
    campaign_breakdown: { view: true },
    follow_up_strategy: { view: true },
    team_progress: { view: true },
    user_management: {
      view: true,
      dept_view: true, dept_create: true, dept_edit: true, dept_delete: true,
      role_view: true, role_create: true, role_edit: true, role_delete: true,
      user_view: true, user_create: true, user_edit: true, user_delete: true,
      hier_view: true, hier_create: true, hier_edit: true, hier_delete: true
    }
  };

  const roleIdUpper = (role.roleId || '').toUpperCase();

  if (!role.featurePermissions) {
    const f: Record<string, Record<string, boolean>> = JSON.parse(JSON.stringify(defaults));
    
    if (roleIdUpper === 'ADMIN' || roleIdUpper === 'SUPERADMIN' || roleIdUpper === 'ADMINISTRATOR') {
      Object.keys(f).forEach(feat => {
        Object.keys(f[feat]).forEach(subK => {
          f[feat][subK] = true;
        });
      });
    } else {
      // Clear all sub features by default for non-admin custom roles
      Object.keys(f).forEach(feat => {
        f[feat].view = false;
        Object.keys(f[feat]).forEach(subK => {
          if (subK !== 'view') f[feat][subK] = false;
        });
      });
    }
    role.featurePermissions = f;
  } else {
    const f = { ...role.featurePermissions };
    Object.keys(defaults).forEach(featK => {
      if (!f[featK]) {
        f[featK] = { ...defaults[featK] };
      } else {
        f[featK] = { ...defaults[featK], ...f[featK] };
      }
    });
    role.featurePermissions = f;
  }

  return role;
}

export const adminService = {
  // --- ROLES & PERMISSIONS WORKSPACE ---
  async getRoles(): Promise<RolePermission[]> {
    try {
      const defaultRolesToPurge = ['RO', 'RM', 'ASM', 'BDM', 'BE', 'BH', 'ro', 'rm', 'asm', 'bdm', 'be', 'bh'];
      const data = localStorage.getItem(KEYS.ROLES);
      let localRoles: RolePermission[] = data ? JSON.parse(data) : [];
      
      // Filter default ones to purge
      let changed = false;
      const initialLength = localRoles.length;
      localRoles = localRoles.filter(r => !defaultRolesToPurge.includes(r.roleId));
      if (localRoles.length !== initialLength) {
        changed = true;
      }

      // Seed ADMIN built-in default if not present
      DEFAULT_ROLE_PERMISSIONS.forEach(def => {
        if (!localRoles.some(r => r.roleId === def.roleId)) {
          localRoles.push(def);
          changed = true;
        }
      });
      
      localRoles = localRoles.map(ensureFeaturePermissions);

      const res = await fetch('/api/roles');
      if (res.ok) {
        const cloudRoles = await res.json();
        
        let mergedChanged = false;
        for (const cr of cloudRoles) {
          if (defaultRolesToPurge.includes(cr.roleId)) {
            continue;
          }
          const finalizedCr = ensureFeaturePermissions(cr);
          const idx = localRoles.findIndex(lr => lr.roleId === finalizedCr.roleId);
          if (idx === -1) {
            localRoles.push(finalizedCr);
            mergedChanged = true;
          } else {
            localRoles[idx] = finalizedCr;
            mergedChanged = true;
          }
        }

        if (mergedChanged) {
          localStorage.setItem(KEYS.ROLES, JSON.stringify(localRoles));
        }
      }
      return localRoles.filter(r => !defaultRolesToPurge.includes(r.roleId));
    } catch (error) {
      console.warn('PostgreSQL fetch roles fallback to local cache:', error);
      const data = localStorage.getItem(KEYS.ROLES);
      const outputRoles = data ? JSON.parse(data) : DEFAULT_ROLE_PERMISSIONS;
      const defaultRolesToPurge = ['RO', 'RM', 'ASM', 'BDM', 'BE', 'BH', 'ro', 'rm', 'asm', 'bdm', 'be', 'bh'];
      return outputRoles
        .filter((r: RolePermission) => !defaultRolesToPurge.includes(r.roleId))
        .map(ensureFeaturePermissions);
    }
  },

  async saveRole(role: RolePermission): Promise<RolePermission> {
    const roles = await this.getRoles();
    const idx = roles.findIndex(r => r.roleId === role.roleId);
    if (idx > -1) {
      roles[idx] = role;
    } else {
      roles.push(role);
    }
    localStorage.setItem(KEYS.ROLES, JSON.stringify(roles));

    try {
      await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(role)
      });
    } catch (error) {
      console.warn('PostgreSQL save role fallback:', error);
    }
    return role;
  },

  async deleteRole(roleId: string): Promise<boolean> {
    if (['ADMIN'].includes(roleId)) {
      toast.error('The Super Admin system role cannot be deleted.');
      return false;
    }

    const roles = await this.getRoles();
    const filtered = roles.filter(r => r.roleId !== roleId);
    localStorage.setItem(KEYS.ROLES, JSON.stringify(filtered));

    await this.deletePermissions(roleId);

    try {
      await fetch(`/api/roles/${roleId}`, {
        method: 'DELETE'
      });
      return true;
    } catch (error) {
      console.warn('PostgreSQL delete role fallback:', error);
      return true;
    }
  },

  // --- TEAMS WORKSPACE ---
  async getTeams(): Promise<Team[]> {
    try {
      const data = localStorage.getItem(KEYS.TEAMS);
      let localTeams: Team[] = data ? JSON.parse(data) : [];

      const res = await fetch('/api/teams');
      if (res.ok) {
        const cloudTeams: Team[] = await res.json();
        let mergedChanged = false;
        
        cloudTeams.forEach(ct => {
          const idx = localTeams.findIndex(lt => lt.id === ct.id);
          if (idx === -1) {
            localTeams.push(ct);
            mergedChanged = true;
          } else {
            localTeams[idx] = ct;
            mergedChanged = true;
          }
        });

        if (mergedChanged) {
          localStorage.setItem(KEYS.TEAMS, JSON.stringify(localTeams));
        }
      }
      return localTeams;
    } catch (error) {
      console.warn('PostgreSQL fetch teams fallback to local cache:', error);
      const data = localStorage.getItem(KEYS.TEAMS);
      return data ? JSON.parse(data) : [];
    }
  },

  async saveTeam(team: Team): Promise<Team> {
    const teams = await this.getTeams();
    const idx = teams.findIndex(t => t.id === team.id);
    if (idx > -1) {
      teams[idx] = team;
    } else {
      teams.push(team);
    }
    localStorage.setItem(KEYS.TEAMS, JSON.stringify(teams));

    const allUsers = await userService.getAllUsers();
    for (const u of allUsers) {
      if (team.memberIds.includes(u.employeeId) || u.employeeId === team.leaderId) {
        if (u.teamId !== team.id) {
          await userService.updateUser(u.id, { teamId: team.id });
        }
      } else if (u.teamId === team.id) {
        await userService.updateUser(u.id, { teamId: '' });
      }
    }

    try {
      await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(team)
      });
    } catch (error) {
      console.warn('PostgreSQL save team fallback:', error);
    }
    return team;
  },

  async deleteTeam(teamId: string): Promise<boolean> {
    const teams = await this.getTeams();
    const filtered = teams.filter(t => t.id !== teamId);
    localStorage.setItem(KEYS.TEAMS, JSON.stringify(filtered));

    const allUsers = await userService.getAllUsers();
    for (const u of allUsers) {
      if (u.teamId === teamId) {
        await userService.updateUser(u.id, { teamId: '' });
      }
    }

    try {
      await fetch(`/api/teams/${teamId}`, {
        method: 'DELETE'
      });
      return true;
    } catch (error) {
      console.warn('PostgreSQL delete team fallback:', error);
      return true;
    }
  },

  // --- MODULE ACTIONS AND PERMISSIONS ---
  async getPermissionsList(): Promise<Permissions[]> {
    const localPerms = localStorage.getItem('lf_local_fine_permissions');
    return localPerms ? JSON.parse(localPerms) : [];
  },

  async getPermissionsByRoleId(roleId: string, roleName?: string): Promise<Permissions> {
    const roleIdClean = roleId.toLowerCase();
    const localPerms = localStorage.getItem('lf_local_fine_permissions');
    const list: Permissions[] = localPerms ? JSON.parse(localPerms) : [];
    const found = list.find(p => p.roleId === roleIdClean);
    if (found) return found;

    // Default configuration if missing
    const defaultModules: Record<string, { view: boolean; create: boolean; edit: boolean; delete: boolean; upload: boolean }> = {};
    const moduleKeys = [
      'dashboard',
      'lead_generate',
      'lead_upload',
      'lead_tracking',
      'execution_intelligence',
      'ncp_progress',
      'trend_charts',
      'campaign_breakdown',
      'follow_up_strategy',
      'team_progress',
      'user_management'
    ];

    const isAdminRole = roleIdClean === 'admin' || roleIdClean === 'superadmin';

    moduleKeys.forEach(m => {
      defaultModules[m] = {
        view: isAdminRole,
        create: isAdminRole,
        edit: isAdminRole,
        delete: isAdminRole,
        upload: isAdminRole
      };
    });

    const newPerm: Permissions = {
      id: roleIdClean,
      roleId: roleIdClean,
      roleName: roleName || roleId.toUpperCase(),
      modules: defaultModules
    };

    await this.savePermissions(newPerm);
    return newPerm;
  },

  async savePermissions(perms: Permissions): Promise<Permissions> {
    const localPerms = localStorage.getItem('lf_local_fine_permissions');
    let list: Permissions[] = localPerms ? JSON.parse(localPerms) : [];
    const idx = list.findIndex(p => p.roleId === perms.roleId);
    if (idx > -1) {
      list[idx] = perms;
    } else {
      list.push(perms);
    }
    localStorage.setItem('lf_local_fine_permissions', JSON.stringify(list));
    return perms;
  },

  async deletePermissions(roleId: string): Promise<boolean> {
    const localPerms = localStorage.getItem('lf_local_fine_permissions');
    if (localPerms) {
      let list: Permissions[] = JSON.parse(localPerms);
      list = list.filter(p => p.roleId !== roleId);
      localStorage.setItem('lf_local_fine_permissions', JSON.stringify(list));
    }
    return true;
  }
};
