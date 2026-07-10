export enum UserRole {
  RO = 'RO',
  RM = 'RM',
  ASM = 'ASM',
  BDM = 'BDM',
  BUSINESS_EXECUTIVE = 'BE',
  BUSINESS_HEAD = 'BH',
  ADMIN = 'ADMIN',
}

export type LeadStatus = 
  | 'Untouched'
  | 'Contacted'
  | 'No Response'
  | 'Busy'
  | 'Interested'
  | 'Follow-up Set'
  | 'Meeting Fixed'
  | 'Meeting Completed'
  | 'Pipeline Locked'
  | 'Converted'
  | 'Not Interested';

export interface User {
  // Identity
  id: string;
  employeeId: string;

  // Legacy fields (Keep for existing code)
  name: string;
  contact?: string;
  role: UserRole | string;
  status: 'Active' | 'Inactive';
  createdDate: string;
  departmentId?: string;
  managerId?: string;
  teamId?: string;
  reportingChain?: string[];
  subordinates?: string[];

  // Enterprise fields
  fullName?: string;
  email: string;
  phone?: string;

  designation?: string;

  employmentStatus?: 'Active' | 'Inactive';
  joiningDate?: string;

  primaryDepartmentId?: string;
  departmentIds?: string[];

  primaryRoleId?: string;
  roleIds?: string[];

  reportingManagerId?: string;

  password?: string;
  mustChangePassword?: boolean;
  avatarUrl?: string;

  createdAt?: string;
  updatedAt?: string;
}

export interface Permissions {
  id: string; // coincided with roleId
  roleId: string;
  roleName: string;
  modules: Record<string, {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
    upload: boolean;
  }>;
}

export interface RolePermission {
  roleId: string;
  roleName: string;
  isCustom?: boolean;
  menuAccess?: Record<string, boolean>;
  dataVisibility?: string;
  actions?: Record<string, boolean>;
  featurePermissions?: Record<string, Record<string, boolean>>;
}

export interface Team {
  id: string;
  name: string;
  leaderId: string; // Employee ID of manager/leader
  memberIds: string[]; // List of Employee IDs assigned
  createdDate: string;
}

export interface StatusHistoryEntry {
  status: LeadStatus;
  date: string;
  remarks: string;
  nextFollowUpDate?: string;
  nextCallDate?: string;
  meetingDate?: string;
  sumAssured?: number;
  productName?: string;
  updatedBy?: string;
}

export interface Lead {
  id: string;
  creationDate: string;
  assignedDate?: string;
  prospectName: string;
  mobile: string;
  mobileNumber?: string;
  email?: string;
  profession: string;
  residenceAddress?: string;
  officeAddress?: string;
  familyMember: string;
  maritalStatus: string;
  hasChild: boolean;
  noOfChildren?: string;
  area: string;
  division?: string;
  district?: string;
  thana?: string;
  source: string;
  productName: string;
  campaignName: string;
  otherInfo?: string;
  assignedTo: string; // Employee ID
  assignedBy?: string; // Employee ID
  currentStatus: LeadStatus;
  projectedNCP: number;
  collectedNCP: number;
  lastFollowUpDate?: string;
  nextFollowUpDate?: string;
  nextCallDate?: string;
  meetingDate?: string;
  sumAssured?: number;
  timestamp: string;
  statusHistory?: StatusHistoryEntry[];
}

export interface FollowUp {
  id: string;
  leadId: string;
  count: number;
  status: LeadStatus;
  remarks: string;
  firstCallDate?: string;
  nextFollowUpDate?: string;
  finalRemarks?: string;
  projectedNCP: number;
  collectedNCP: number;
  updatedBy: string;
  updatedDate: string;
}

export interface Campaign {
  id: string;
  name: string;
  status: 'Active' | 'Inactive';
}

export interface DropdownOption {
  type: 'Area' | 'Source' | 'Product' | 'Campaign' | 'Profession' | 'MaritalStatus' | 'FollowUpStatus';
  value: string;
  status: 'Active' | 'Inactive';
}

export interface SystemNotification {
  id: string;
  userId: string; // Employee ID
  title: string;
  message: string;
  leadId: string;
  read: boolean;
  date: string;
}

