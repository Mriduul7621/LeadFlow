import { DropdownOption } from '../types';
import { MOCK_DROPDOWNS } from '../mock/data';
import { localDb } from './localDb';

export const settingsService = {
  async getOptionsByType(type: string): Promise<string[]> {
    try {
      const res = await fetch('/api/options');
      if (res.ok) {
        const cloudOptions: any[] = await res.json();
        const data = cloudOptions.filter(o => o.type === type && o.status === 'Active');

        // If no options stored on PostgreSQL yet, seed with mock data
        if (data.length === 0) {
          const mockValues = (MOCK_DROPDOWNS as any)[type] || [];
          for (const val of mockValues) {
            await fetch('/api/options', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type,
                value: val,
                status: 'Active'
              })
            });
          }
          return mockValues;
        }

        return data.map(o => o.value);
      }
    } catch (error) {
      console.warn('PostgreSQL fetch options fallback to local db:', error);
    }
    return localDb.getOptionsByType(type);
  },

  async addOption(type: string, value: string) {
    localDb.addOption(type, value);

    try {
      await fetch('/api/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          value,
          status: 'Active'
        })
      });
    } catch (error) {
      console.warn('PostgreSQL add option fallback to local db:', error);
    }
  },

  async deleteOption(type: string, value: string) {
    localDb.deleteOption(type, value);

    try {
      await fetch(`/api/options/${encodeURIComponent(type)}/${encodeURIComponent(value)}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.warn('PostgreSQL delete option fallback to local db:', error);
    }
  }
};
