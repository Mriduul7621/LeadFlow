import { User } from '../types';
import { localDb } from './localDb';

function sanitizeUserForTransport(user: Partial<User> | undefined) {
  if (!user) return {};
  const payload = { ...user } as Partial<User> & Record<string, unknown>;
  if (payload.password === undefined) {
    delete payload.password;
  }
  return payload;
}

export const userService = {
  async createUser(user: User) {
    const safeUser = sanitizeUserForTransport(user) as User;
    delete safeUser.password;
    localDb.createUser(safeUser);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizeUserForTransport(user))
      });
      if (res.ok) {
        const saved = await res.json();
        return (saved.user || saved) as User;
      }
    } catch (error) {
      console.warn('PostgreSQL write fallback to local db:', error);
    }
    return safeUser;
  },

  async updateUser(userId: string, data: Partial<User>) {
    const safeData = sanitizeUserForTransport(data) as Partial<User>;
    localDb.updateUser(userId, safeData);

    const existing = localDb.getUser(userId);
    if (!existing) return true;

    try {
      await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...existing, ...safeData, id: userId })
      });
    } catch (error) {
      console.warn('PostgreSQL write fallback to local db:', error);
    }
    return true;
  },

  async getUser(userId: string): Promise<User | null> {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const cloudUsers: User[] = await res.json();
        const found = cloudUsers.find(u => u.id === userId || u.employeeId === userId);
        if (found) {
          localDb.updateUser(found.id, found);
          return found;
        }
      }
    } catch (error) {
      console.warn('PostgreSQL get fallback to local db:', error);
    }
    return localDb.getUser(userId);
  },

  async login(employeeId: string, password: string, rememberMe = false) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employeeId, password, rememberMe })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Authentication failed.');
    }
    return res.json();
  },

  async registerInitialAdmin(user: User) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Initial administrator setup failed.');
    }
    return res.json();
  },

  async logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
  },

  async getAllUsers(): Promise<User[]> {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const cloudUsers: User[] = await res.json();
        const localUsers = localDb.getUsers();
        let changed = false;
        const mergedUsers = [...localUsers];

        for (const cu of cloudUsers) {
          const idx = mergedUsers.findIndex(u => u.id === cu.id);
          if (idx === -1) {
            mergedUsers.push(cu);
            changed = true;
          } else {
            const localUser = mergedUsers[idx];
            const lTime = new Date(localUser.createdDate || 0).getTime();
            const cTime = new Date(cu.createdDate || 0).getTime();
            const needsUpdate = cu.role !== localUser.role || 
                                cu.name !== localUser.name ||
                                cu.status !== localUser.status ||
                                (!isNaN(cTime) && !isNaN(lTime) && cTime > lTime);
            if (needsUpdate) {
              mergedUsers[idx] = cu;
              changed = true;
            }
          }
        }

        if (changed) {
          localDb.saveUsers(mergedUsers);
        }
        return mergedUsers;
      }
    } catch (error) {
      console.warn('PostgreSQL list users fallback to local db:', error);
    }
    return localDb.getUsers();
  },

  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const users = await this.getAllUsers();
      return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
    } catch (error) {
      console.warn('PostgreSQL getUserByEmail fallback to local db:', error);
    }
    return localDb.getUserByEmail(email);
  },

  async deleteUser(userId: string) {
    // Always delete from localDb first to prevent sync resurrection
    localDb.deleteUser(userId);

    try {
      await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });
    } catch (error) {
      console.warn('PostgreSQL delete user fallback to local db:', error);
    }
  },

  async changePassword(currentPassword: string, newPassword: string) {
    const res = await fetch('/api/auth/verify-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Password change failed.');
    }
    return res.json();
  },

  async validateCurrentPassword(password: string): Promise<boolean> {
    const res = await fetch('/api/auth/validate-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!res.ok) return false;
    const body = await res.json();
    return body.valid === true;
  },

  async checkAdminExists(): Promise<boolean> {
    try {
      const res = await fetch('/api/users/check-admin');
      if (res.ok) {
        const body = await res.json();
        return !!body.exists;
      }
    } catch (error) {
      console.warn('PostgreSQL checkAdminExists failed:', error);
    }
    // Only fallback if there was an actual connection issue
    const localUsers = localDb.getUsers();
    return localUsers.some(u => u.role === 'ADMIN');
  }
};
