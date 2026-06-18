import { User, UserRole } from '../types';

export const MOCK_USERS: User[] = [];

export const MOCK_DROPDOWNS = {
  Area: ['Gulshan', 'Banani', 'Dhanmondi', 'Uttara', 'Mirpur', 'Motijheel'],
  Source: ['Facebook', 'Referral', 'Walk-in', 'Website', 'Newspaper', 'Event'],
  Product: ['Life Secure+', 'Child Education Plan', 'Pension Plan', 'Health First', 'Hajj Insurance'],
  Campaign: ['Summer Offer 2024', 'Corporate Wellness', 'Retail Drive'],
  Profession: ['Service', 'Business', 'Teacher', 'Doctor', 'Engineer', 'Others'],
  MaritalStatus: ['Single', 'Married', 'Divorced', 'Widowed'],
  FollowUpStatus: [
    'Untouched', 'Contacted', 'No Response', 'Busy', 'Interested', 
    'Follow-up Set', 'Meeting Fixed', 'Meeting Completed', 
    'Pipeline Locked', 'Converted', 'Not Interested'
  ]
};
